// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §5.3/§5.4 — the one writer for grocery_items.
//
// Local-first, modeled directly on set-log-store.ts's proven pending-queue/
// dead-letter shape (not memory-store's plain-async cut): a shopping
// session checks off and adds items in quick bursts, often standing in a
// shop with patchy signal — exactly the "survive a mid-write connectivity
// drop" problem set-log-store's queue exists to solve, unlike memory's
// "a few writes per chat session" pattern.
//
// One structural difference from set-log-store: there the natural key
// (user, date, exercise, set, warmup) already identifies a row, so the
// server mints the id and reads never need it back. Grocery rows have no
// such compound natural key — a specific row must be addressable for
// edit/check/delete — so the client mints `id` itself (crypto.randomUUID)
// at write time and upserts on that id (`onConflict: 'id'`), giving the
// optimistic local row and the eventual server row the same identity from
// the start. `client_id` is set equal to `id` purely to satisfy the same
// partial-unique-client_id convention every other table uses.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'
import { lookupIngredient, unitToGrams, type FoodCategory } from './food-db'
import { assembleDay, type PoolOption } from './meal-generation'
import type { MealSlotName } from './meal-store'
import type { MacroTargets } from './types'

export type GroceryCategory = 'produce' | 'meat_fish' | 'dairy' | 'dry_goods' | 'frozen' | 'other'
export type GrocerySource = 'generated' | 'manual' | 'chat'

export interface MealRef {
  day: number
  slot: string
  mealName: string
}

export interface GroceryItemRow {
  id: string
  profile_id: string
  canonical_key: string
  display_name: string
  quantity: number
  unit: string
  category: GroceryCategory
  source: GrocerySource
  meal_refs: MealRef[]
  checked: boolean
  needs_review: boolean
  client_id: string | null
  created_at: string
  /** Soft-delete for a 'generated' row: set by deleteItemLocal instead of removing the row, so a later regenerate doesn't resurrect an ingredient the user deliberately removed. Always hidden from getAllItems. */
  dismissed: boolean
  /** Set by editItemLocal when the user hand-corrects a 'generated' row's name/quantity/unit — a later regenerate refreshes meal_refs only and leaves the user's values alone. */
  user_edited: boolean
}

const PENDING_KEY = 'fitplan_grocery_pending_v1'
const DEAD_LETTER_KEY = 'fitplan_grocery_deadletter_v1'
const MAX_SYNC_ATTEMPTS = 5

interface PendingItem {
  id: string
  profileId: string
  canonicalKey: string
  displayName: string
  quantity: number
  unit: string
  category: GroceryCategory
  source: GrocerySource
  mealRefs: MealRef[]
  checked: boolean
  needsReview: boolean
  createdAt: string
  attempts: number
  dismissed: boolean
  userEdited: boolean
}

interface PendingDelete {
  id: string
  profileId: string
  attempts: number
}

type PendingOp =
  | { kind: 'upsert'; item: PendingItem }
  | { kind: 'delete'; del: PendingDelete }

interface DeadLetterItem {
  op: PendingOp
  reason: 'permanent' | 'max-attempts'
  errorMessage: string
  failedAt: string
}

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function opId(op: PendingOp): string {
  return op.kind === 'upsert' ? op.item.id : op.del.id
}

function loadPending(): PendingOp[] {
  if (!hasStorage()) return []
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePending(ops: PendingOp[]): void {
  if (!hasStorage()) return
  localStorage.setItem(PENDING_KEY, JSON.stringify(ops))
}

function loadDeadLetter(): DeadLetterItem[] {
  if (!hasStorage()) return []
  try {
    const raw = localStorage.getItem(DEAD_LETTER_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveDeadLetter(items: DeadLetterItem[]): void {
  if (!hasStorage()) return
  localStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(items))
}

function moveToDeadLetter(op: PendingOp, error: unknown, reason: DeadLetterItem['reason']): void {
  const errorMessage = (error as { message?: string } | null)?.message ?? String(error)
  saveDeadLetter([...loadDeadLetter(), { op, reason, errorMessage, failedAt: new Date().toISOString() }])
  const id = opId(op)
  savePending(loadPending().filter(o => opId(o) !== id))
}

function classifyError(error: unknown): 'network' | 'permanent' {
  const code = (error as { code?: string } | null)?.code
  return code ? 'permanent' : 'network'
}

let listeners: Array<() => void> = []
function notifyListeners(): void {
  listeners.forEach(fn => fn())
}
/** For UI components that want to re-render when the pending/dead-letter queue changes (e.g. a synced-status chip). Not required for correctness — reads always merge pending state directly. */
export function subscribeGroceryStore(fn: () => void): () => void {
  listeners.push(fn)
  return () => { listeners = listeners.filter(l => l !== fn) }
}

// ---------------------------------------------------------------------------
// food-db resolution + category mapping (shared by generation and by the
// chat/manual add paths, so both land on the same canonical_key and merge)
// ---------------------------------------------------------------------------

const CATEGORY_MAP: Record<FoodCategory, GroceryCategory> = {
  veg: 'produce',
  fruit: 'produce',
  protein: 'meat_fish',
  dairy: 'dairy',
  carb: 'dry_goods',
  fat: 'dry_goods',
  condiment: 'dry_goods',
  other: 'other',
}

/**
 * Fix 4.8 (ux-sweep) — CATEGORY_MAP alone routed every food-db 'protein'
 * entry to meat_fish, which is right for chicken/beef/fish but put
 * kidney beans, black beans, lentils, and whey protein powder in the
 * same aisle as raw meat — a shopper trips on that immediately. Both
 * already carry the tag that says why they don't belong there
 * (is_legume, or contains_dairy on a non-dairy-category entry i.e. the
 * powder), so this reads those tags rather than adding new ones.
 */
function categoryForEntry(entry: { category: FoodCategory; tags: { is_legume?: boolean; contains_dairy?: boolean } }): GroceryCategory {
  if (entry.category === 'protein' && entry.tags.is_legume) return 'dry_goods'
  if (entry.category === 'protein' && entry.tags.contains_dairy) return 'dry_goods'
  return CATEGORY_MAP[entry.category]
}

export function resolveGroceryTarget(name: string): {
  canonicalKey: string
  displayName: string
  category: GroceryCategory
  needsReview: boolean
  toGrams: (quantity: number, unit: string) => number
} {
  const trimmed = name.trim()
  const entry = lookupIngredient(trimmed)
  if (entry) {
    return {
      canonicalKey: entry.name.toLowerCase(),
      displayName: entry.name,
      category: categoryForEntry(entry),
      needsReview: false,
      toGrams: (quantity, unit) => unitToGrams(entry, unit, quantity),
    }
  }
  return {
    canonicalKey: `manual:${slugify(trimmed)}`,
    displayName: trimmed,
    category: 'other',
    needsReview: true,
    toGrams: (quantity, unit) => unitToGrams(null, unit, quantity),
  }
}

// ---------------------------------------------------------------------------
// Reads (read-through: server + pending merged, so the UI always sees its
// own writes even before they've synced)
// ---------------------------------------------------------------------------

function pendingItemToRow(item: PendingItem): GroceryItemRow {
  return {
    id: item.id,
    profile_id: item.profileId,
    canonical_key: item.canonicalKey,
    display_name: item.displayName,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    source: item.source,
    meal_refs: item.mealRefs,
    checked: item.checked,
    needs_review: item.needsReview,
    client_id: item.id,
    created_at: item.createdAt,
    dismissed: item.dismissed,
    user_edited: item.userEdited,
  }
}

function mergePendingForProfile(profileId: string, serverRows: GroceryItemRow[]): GroceryItemRow[] {
  const byId = new Map(serverRows.map(r => [r.id, r]))
  for (const op of loadPending()) {
    if (op.kind === 'upsert') {
      if (op.item.profileId !== profileId) continue
      byId.set(op.item.id, pendingItemToRow(op.item))
    } else {
      if (op.del.profileId !== profileId) continue
      byId.delete(op.del.id)
    }
  }
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

/** Server + pending merged, including dismissed rows — only the regenerate reconciliation needs to see a dismissed row (to avoid resurrecting it), so this stays module-private rather than a second public read API. */
async function getAllItemsIncludingDismissed(profileId: string): Promise<GroceryItemRow[]> {
  try {
    const { data, error } = await supabase
      .from('grocery_items')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return mergePendingForProfile(profileId, (data ?? []) as GroceryItemRow[])
  } catch {
    return mergePendingForProfile(profileId, [])
  }
}

/** All grocery items for a profile — server + pending merged, dismissed rows hidden. Never throws offline: falls back to the pending-only view. */
export async function getAllItems(profileId: string): Promise<GroceryItemRow[]> {
  const items = await getAllItemsIncludingDismissed(profileId)
  return items.filter(i => !i.dismissed)
}

// ---------------------------------------------------------------------------
// Writes — all local-first: enqueue, notify, fire-and-forget flush, return
// the resulting row synchronously (no network wait).
// ---------------------------------------------------------------------------

function enqueueUpsert(item: PendingItem): void {
  const ops = loadPending().filter(op => opId(op) !== item.id)
  ops.push({ kind: 'upsert', item })
  savePending(ops)
  notifyListeners()
  void flushPending()
}

function enqueueDelete(id: string, profileId: string): void {
  const ops = loadPending().filter(op => opId(op) !== id)
  ops.push({ kind: 'delete', del: { id, profileId, attempts: 0 } })
  savePending(ops)
  notifyListeners()
  void flushPending()
}

export interface AddItemResult {
  row: GroceryItemRow
  created: boolean
  addedQuantity: number
}

/**
 * Adds one item. `currentItems` is the caller's already-loaded merged view
 * (from getAllItems) — passed in rather than re-fetched so this stays a
 * synchronous, instant local write; the merge-by-canonical_key decision
 * (summing "200g chicken" onto an existing "150g chicken" line) is made
 * against that snapshot, matching saveSet's own natural-key coalesce.
 */
export function addItemLocal(input: {
  profileId: string
  name: string
  quantity: number
  unit: string
  source: GrocerySource
  currentItems: GroceryItemRow[]
}): AddItemResult {
  const target = resolveGroceryTarget(input.name)
  const existing = input.currentItems.find(i => i.profile_id === input.profileId && i.canonical_key === target.canonicalKey)

  // DB has a hard UNIQUE(profile_id, canonical_key) — a match on canonical_key
  // MUST merge into that row, never insert a second one (a same-canonical_key
  // insert would violate the constraint at sync time and silently
  // dead-letter). Same-unit merges sum directly (exact, no conversion loss —
  // the common case for a repeated manual/chat add). A unit mismatch (e.g. a
  // chat add with no stated unit landing on an existing gram-based generated
  // line) normalizes BOTH sides to grams via the shared toGrams conversion
  // and stores the merged row in grams, matching generation's own convention.
  if (existing) {
    const sameUnit = existing.unit === input.unit
    const existingQuantity = sameUnit ? existing.quantity : target.toGrams(existing.quantity, existing.unit)
    const addQuantity = sameUnit ? input.quantity : target.toGrams(input.quantity, input.unit)
    const item: PendingItem = {
      id: existing.id,
      profileId: input.profileId,
      canonicalKey: existing.canonical_key,
      displayName: existing.display_name,
      quantity: existingQuantity + addQuantity,
      unit: sameUnit ? existing.unit : 'g',
      category: existing.category,
      source: existing.source,
      mealRefs: existing.meal_refs,
      checked: existing.checked,
      needsReview: existing.needs_review,
      createdAt: existing.created_at,
      attempts: 0,
      dismissed: existing.dismissed,
      userEdited: existing.user_edited,
    }
    enqueueUpsert(item)
    return { row: pendingItemToRow(item), created: false, addedQuantity: addQuantity }
  }

  const item: PendingItem = {
    id: generateId(),
    profileId: input.profileId,
    canonicalKey: target.canonicalKey,
    displayName: target.displayName,
    quantity: input.quantity,
    unit: input.unit,
    category: target.category,
    source: input.source,
    mealRefs: [],
    checked: false,
    needsReview: target.needsReview,
    createdAt: new Date().toISOString(),
    attempts: 0,
    dismissed: false,
    userEdited: false,
  }
  enqueueUpsert(item)
  return { row: pendingItemToRow(item), created: true, addedQuantity: input.quantity }
}

/** A direct hand-edit of name/quantity/unit/category. On a 'generated' row this marks user_edited so a later regenerate refreshes meal_refs only and leaves the user's own values in place, instead of overwriting them with the freshly-aggregated amount. */
export function editItemLocal(current: GroceryItemRow, patch: { displayName?: string; quantity?: number; unit?: string; category?: GroceryCategory }): GroceryItemRow {
  const item: PendingItem = {
    id: current.id,
    profileId: current.profile_id,
    canonicalKey: current.canonical_key,
    displayName: patch.displayName ?? current.display_name,
    quantity: patch.quantity ?? current.quantity,
    unit: patch.unit ?? current.unit,
    category: patch.category ?? current.category,
    source: current.source,
    mealRefs: current.meal_refs,
    checked: current.checked,
    needsReview: current.needs_review,
    createdAt: current.created_at,
    attempts: 0,
    dismissed: current.dismissed,
    userEdited: current.source === 'generated' ? true : current.user_edited,
  }
  enqueueUpsert(item)
  return pendingItemToRow(item)
}

export function setCheckedLocal(current: GroceryItemRow, checked: boolean): GroceryItemRow {
  const item: PendingItem = {
    id: current.id, profileId: current.profile_id, canonicalKey: current.canonical_key, displayName: current.display_name,
    quantity: current.quantity, unit: current.unit, category: current.category, source: current.source,
    mealRefs: current.meal_refs, checked, needsReview: current.needs_review, createdAt: current.created_at, attempts: 0,
    dismissed: current.dismissed, userEdited: current.user_edited,
  }
  enqueueUpsert(item)
  return pendingItemToRow(item)
}

/** 'generated' rows are soft-deleted (dismissed=true, row survives hidden) so a later regenerate doesn't re-aggregate the same ingredient from the meal plan and resurrect it. 'manual'/'chat' rows are hard-deleted as before — regeneration never reads those sources, so there is nothing to remember. */
export function deleteItemLocal(current: GroceryItemRow): void {
  if (current.source !== 'generated') {
    enqueueDelete(current.id, current.profile_id)
    return
  }
  const item: PendingItem = {
    id: current.id, profileId: current.profile_id, canonicalKey: current.canonical_key, displayName: current.display_name,
    quantity: current.quantity, unit: current.unit, category: current.category, source: current.source,
    mealRefs: current.meal_refs, checked: current.checked, needsReview: current.needs_review, createdAt: current.created_at,
    attempts: 0, dismissed: true, userEdited: current.user_edited,
  }
  enqueueUpsert(item)
}

export function clearCheckedLocal(currentItems: GroceryItemRow[]): void {
  for (const item of currentItems) {
    if (item.checked) enqueueDelete(item.id, item.profile_id)
  }
}

/** Undo for a just-added item (chat or manual): removes exactly the row addItemLocal created, or subtracts back out a merge. */
export function undoAddLocal(row: GroceryItemRow, addedQuantity: number, wasCreated: boolean): void {
  if (wasCreated) {
    enqueueDelete(row.id, row.profile_id)
    return
  }
  const item: PendingItem = {
    id: row.id, profileId: row.profile_id, canonicalKey: row.canonical_key, displayName: row.display_name,
    quantity: Math.max(0, row.quantity - addedQuantity), unit: row.unit, category: row.category, source: row.source,
    mealRefs: row.meal_refs, checked: row.checked, needsReview: row.needs_review, createdAt: row.created_at, attempts: 0,
    dismissed: row.dismissed, userEdited: row.user_edited,
  }
  enqueueUpsert(item)
}

// ---------------------------------------------------------------------------
// Background flush — mirrors set-log-store's doFlush exactly: reloads the
// queue fresh each iteration, skips (never blocks on) a poison op for the
// rest of this pass, classifies permanent-vs-network failures, dead-letters
// past MAX_SYNC_ATTEMPTS, backs off and retries.
// ---------------------------------------------------------------------------

let flushPromise: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let consecutiveFailures = 0

function scheduleRetry(): void {
  if (typeof window === 'undefined' || retryTimer) return
  const delayMs = Math.min(60_000, 2_000 * 2 ** Math.min(consecutiveFailures, 5))
  retryTimer = setTimeout(() => {
    retryTimer = null
    void flushPending()
  }, delayMs)
}

export function flushPending(): Promise<void> {
  if (flushPromise) return flushPromise
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve()
  if (loadPending().length === 0) return Promise.resolve()
  flushPromise = doFlush().finally(() => { flushPromise = null })
  return flushPromise
}

async function syncUpsert(item: PendingItem): Promise<void> {
  const { error } = await supabase
    .from('grocery_items')
    .upsert({
      id: item.id,
      profile_id: item.profileId,
      canonical_key: item.canonicalKey,
      display_name: item.displayName,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      source: item.source,
      meal_refs: item.mealRefs,
      checked: item.checked,
      needs_review: item.needsReview,
      client_id: item.id,
      dismissed: item.dismissed,
      user_edited: item.userEdited,
    }, { onConflict: 'id' })
  if (error) throw error
}

async function syncDelete(del: PendingDelete): Promise<void> {
  const { error } = await supabase.from('grocery_items').delete().eq('id', del.id)
  if (error) throw error
}

async function doFlush(): Promise<void> {
  const skipThisPass = new Set<string>()
  try {
    while (true) {
      const op = loadPending().find(o => !skipThisPass.has(opId(o)))
      if (!op) break
      const id = opId(op)

      try {
        if (op.kind === 'upsert') await syncUpsert(op.item)
        else await syncDelete(op.del)

        savePending(loadPending().filter(o => opId(o) !== id))
        consecutiveFailures = 0
        notifyListeners()
      } catch (err) {
        if (classifyError(err) === 'permanent') {
          moveToDeadLetter(op, err, 'permanent')
          notifyListeners()
          continue
        }
        const persisted = loadPending()
        const target = persisted.find(o => opId(o) === id)
        if (target) {
          const attempts = (target.kind === 'upsert' ? target.item.attempts : target.del.attempts) + 1
          if (target.kind === 'upsert') target.item.attempts = attempts
          else target.del.attempts = attempts
          savePending(persisted)
          if (attempts >= MAX_SYNC_ATTEMPTS) {
            moveToDeadLetter(target, err, 'max-attempts')
            notifyListeners()
            continue
          }
        }
        skipThisPass.add(id)
        consecutiveFailures += 1
        notifyListeners()
      }
    }
  } finally {
    if (loadPending().length > 0) scheduleRetry()
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { consecutiveFailures = 0; void flushPending() })
  window.addEventListener('offline', () => notifyListeners())
}

// ---------------------------------------------------------------------------
// Generation from the meal plan
// ---------------------------------------------------------------------------

export const DEFAULT_HORIZON_DAYS = 7
export const MAX_HORIZON_DAYS = 14

/**
 * The pool model (M1) has no persisted "assembled week" — assembleDay is
 * pure and derives one day's picks fresh from pools+targets on every call
 * (App.tsx never stores anything day-specific; any pool option is valid
 * any day). There is therefore no "walk the assembled days" structure to
 * walk for a multi-day horizon in the literal sense §5.3 describes.
 *
 * The chosen approach: call assembleDay once per day in the horizon,
 * threading `recentNames` forward across the calls exactly the way a
 * real week of regenerating "today" would — so day 2 doesn't just repick
 * day 1's exact combo, and the aggregate reflects realistic variety
 * rather than every pool option at once (which would wildly overstate
 * quantities for options the user would never actually pick together).
 * This reuses assembleDay's own tolerance-fitting search unchanged; nothing
 * ad hoc is invented, and regenerating with the same pools+targets always
 * produces the same days (assembleDay is deterministic for fixed inputs).
 */
function assembleHorizon(
  pools: Partial<Record<MealSlotName, PoolOption[]>>,
  targets: MacroTargets,
  days: number,
): { day: number; chosen: Partial<Record<MealSlotName, PoolOption>> }[] {
  const recentNames: Partial<Record<MealSlotName, string[]>> = {}
  const out: { day: number; chosen: Partial<Record<MealSlotName, PoolOption>> }[] = []
  for (let day = 0; day < days; day++) {
    const { chosen } = assembleDay(pools, targets, recentNames)
    out.push({ day, chosen })
    for (const [slot, option] of Object.entries(chosen) as [MealSlotName, PoolOption][]) {
      const list = recentNames[slot] ?? []
      recentNames[slot] = [...list, option.name].slice(-3)
    }
  }
  return out
}

interface AggregatedIngredient {
  canonicalKey: string
  displayName: string
  category: GroceryCategory
  needsReview: boolean
  grams: number
  mealRefs: MealRef[]
}

export interface GenerateGroceryListInput {
  profileId: string
  mealPools: Partial<Record<MealSlotName, PoolOption[]>>
  targets: MacroTargets
  /** Horizon length in days, default the coming week. Clamped to [1, MAX_HORIZON_DAYS]. */
  days?: number
}

export interface GenerateGroceryListResult {
  added: number
  updated: number
  removed: number
}

/**
 * Aggregates ingredients across `days` of assembled meals into grams per
 * canonical ingredient, then reconciles against existing 'generated' rows:
 * new keys enqueue an insert, changed quantities/meal_refs enqueue an
 * update in place (preserving id and checked state), and generated keys no
 * longer present enqueue a delete. 'manual'/'chat' rows are never read or
 * touched here — that is what keeps hand-added items and their checked
 * state alive across a regenerate. Reads the current merged view first
 * (server + pending) so this reconciles against what the user actually
 * sees, then writes go through the same local-first queue as every other
 * write here.
 */
export async function generateGroceryList(input: GenerateGroceryListInput): Promise<GenerateGroceryListResult> {
  const days = Math.max(1, Math.min(MAX_HORIZON_DAYS, input.days ?? DEFAULT_HORIZON_DAYS))
  const horizon = assembleHorizon(input.mealPools, input.targets, days)

  const aggregate = new Map<string, AggregatedIngredient>()
  for (const { day, chosen } of horizon) {
    for (const option of Object.values(chosen) as PoolOption[]) {
      for (const ing of option.ingredients) {
        // Fix 4.8 (ux-sweep): plain tap water used to cook/blend a meal
        // isn't something anyone shops for — it was aggregating into rows
        // like "~500g water". Nothing else in food-db is a zero-cost
        // kitchen-tap ingredient like this, so a name check is enough
        // without needing a broader "non-purchasable" flag on FoodEntry.
        if (ing.name.trim().toLowerCase() === 'water') continue
        const target = resolveGroceryTarget(ing.name)
        const grams = target.toGrams(ing.quantity, ing.unit)
        const ref: MealRef = { day, slot: option.slot, mealName: option.name }
        const existing = aggregate.get(target.canonicalKey)
        if (existing) {
          existing.grams += grams
          if (!existing.mealRefs.some(r => r.day === ref.day && r.slot === ref.slot && r.mealName === ref.mealName)) {
            existing.mealRefs.push(ref)
          }
        } else {
          aggregate.set(target.canonicalKey, {
            canonicalKey: target.canonicalKey, displayName: target.displayName, category: target.category,
            needsReview: target.needsReview, grams, mealRefs: [ref],
          })
        }
      }
    }
  }

  // Must see dismissed rows too (getAllItems hides them) — a dismissed
  // canonical_key that's still in the aggregate is exactly the "user
  // deleted this, don't bring it back" case this reconciliation has to
  // respect rather than silently re-adding.
  const currentItems = await getAllItemsIncludingDismissed(input.profileId)
  const existingGenerated = new Map(currentItems.filter(r => r.source === 'generated').map(r => [r.canonical_key, r]))

  let added = 0
  let updated = 0
  let removed = 0

  for (const agg of aggregate.values()) {
    const existing = existingGenerated.get(agg.canonicalKey)
    const roundedGrams = Math.round(agg.grams)
    if (existing?.dismissed) {
      // Deliberately removed by the user — leave it dismissed, don't resurrect it.
      existingGenerated.delete(agg.canonicalKey)
      continue
    }
    if (existing?.user_edited) {
      // Hand-corrected by the user — refresh only which meals reference it,
      // keep their name/quantity/unit exactly as they set them.
      existingGenerated.delete(agg.canonicalKey)
      enqueueUpsert({
        id: existing.id, profileId: input.profileId, canonicalKey: existing.canonical_key, displayName: existing.display_name,
        quantity: existing.quantity, unit: existing.unit, category: existing.category, source: 'generated', mealRefs: agg.mealRefs,
        checked: existing.checked, needsReview: existing.needs_review, createdAt: existing.created_at, attempts: 0,
        dismissed: false, userEdited: true,
      })
      updated++
      continue
    }
    if (existing) {
      existingGenerated.delete(agg.canonicalKey)
      enqueueUpsert({
        id: existing.id, profileId: input.profileId, canonicalKey: agg.canonicalKey, displayName: agg.displayName,
        quantity: roundedGrams, unit: 'g', category: agg.category, source: 'generated', mealRefs: agg.mealRefs,
        checked: existing.checked, needsReview: agg.needsReview, createdAt: existing.created_at, attempts: 0,
        dismissed: false, userEdited: false,
      })
      updated++
    } else {
      enqueueUpsert({
        id: generateId(), profileId: input.profileId, canonicalKey: agg.canonicalKey, displayName: agg.displayName,
        quantity: roundedGrams, unit: 'g', category: agg.category, source: 'generated', mealRefs: agg.mealRefs,
        checked: false, needsReview: agg.needsReview, createdAt: new Date().toISOString(), attempts: 0,
        dismissed: false, userEdited: false,
      })
      added++
    }
  }

  // Whatever's left in existingGenerated was a 'generated' row this
  // aggregation run didn't produce — the meal it came from is no longer in
  // the selected pools/horizon. A dismissed leftover here was already
  // unwanted, so this is just cleanup; a live (non-dismissed) leftover is
  // the same "no longer needed" case the original behavior handled.
  for (const stale of existingGenerated.values()) {
    enqueueDelete(stale.id, stale.profile_id)
    removed++
  }

  return { added, updated, removed }
}
