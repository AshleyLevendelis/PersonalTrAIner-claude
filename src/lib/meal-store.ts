// ---------------------------------------------------------------------------
// MEAL STORE (M0 skeleton) — the ONE meal-mutation layer
// ---------------------------------------------------------------------------
// Modeled on set-log-store.ts, for the same reason that module exists: the
// discovery round found meal edits split across two disjoint dead paths (a
// UI swap writing a broken table via a never-deployed API, and a chat swap
// mutating an in-memory array nothing rendered). From M0 onward, BOTH the UI
// and the chat action handler route every meal mutation through here.
//
// Live in M0:  recordMealEvent / getTodayLedger against the meal_events
//              append-only ledger — local-first with a persisted pending
//              queue, client_id idempotent retries, and a dead-letter store
//              for permanently-rejected rows (poison-pill safe: one bad
//              event never blocks the queue).
// Stubs in M0: getPools / swapPoolMeal — the pool model's read/swap surface.
//              M1 fills them from meal_plan_slots; until then swapPoolMeal
//              resolves null, which callers surface honestly as "swap not
//              applied" (the chat appends its standard action-failed note).
// ---------------------------------------------------------------------------

import { supabase } from './supabase'
import type { MacroTargets } from './types'
// Type-only import — meal-generation.ts only imports MealSlotName (a type)
// from this module, so this doesn't create a real circular dependency.
import type { PoolOption } from './meal-generation'

export interface MealMacros {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export type MealEventType = 'confirmed' | 'swapped_in' | 'extra' | 'skipped'
export type MealEventSource = 'plan' | 'chat' | 'manual'
export type MealSlotName = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface RecordMealEventInput {
  profileId: string
  /** YYYY-MM-DD */
  date: string
  slot: MealSlotName | null
  eventType: MealEventType
  mealName: string
  /** Zeros for 'skipped'. */
  macros: MealMacros
  source: MealEventSource
}

export interface MealEventRecord extends RecordMealEventInput {
  clientId: string
  createdAt: string
}

export interface TodayLedger {
  targets: MacroTargets
  /** Sum of confirmed + swapped_in + extra event macros (skipped adds zero). */
  eaten: MealMacros
  /** targets − eaten, floored at… nothing: negatives are honest overshoot. */
  remaining: MealMacros
  events: MealEventRecord[]
}

interface PendingEvent extends MealEventRecord {
  attempts: number
}

const PENDING_KEY = 'fitplan_mealevent_pending_v1'
const DEAD_LETTER_KEY = 'fitplan_mealevent_deadletter_v1'
const MAX_ATTEMPTS = 8

function generateClientId(): string {
  return `me_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function loadPending(): PendingEvent[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePending(items: PendingEvent[]): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(items))
  } catch {
    // localStorage unavailable — the event still lives in memory this session.
  }
}

function loadDeadLetter(): PendingEvent[] {
  try {
    const raw = localStorage.getItem(DEAD_LETTER_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveDeadLetter(items: PendingEvent[]): void {
  try {
    localStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(items))
  } catch {
    // ignore
  }
}

/**
 * Postgres constraint/validation failures (23xxx integrity, 22xxx data) and
 * PostgREST schema errors are PERMANENT — retrying cannot fix the row.
 * Everything else (network, 5xx) is transient. Same classification the
 * set-log store uses; a permanent failure dead-letters the one row instead
 * of blocking the queue behind it.
 */
function isPermanentError(err: { code?: string } | null): boolean {
  const code = err?.code ?? ''
  return code.startsWith('23') || code.startsWith('22') || code.startsWith('PGRST')
}

let flushPromise: Promise<void> | null = null

/** Local-first write: persisted to the pending queue synchronously, synced in the background. Returns the record (with its idempotency clientId) immediately. */
export function recordMealEvent(input: RecordMealEventInput): MealEventRecord {
  const record: MealEventRecord = {
    ...input,
    clientId: generateClientId(),
    createdAt: new Date().toISOString(),
  }
  savePending([...loadPending(), { ...record, attempts: 0 }])
  flushPending()
  return record
}

export function flushPending(): Promise<void> {
  if (flushPromise) return flushPromise
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve()
  if (loadPending().length === 0) return Promise.resolve()
  flushPromise = doFlush().finally(() => { flushPromise = null })
  return flushPromise
}

async function doFlush(): Promise<void> {
  // Reload fresh each iteration so events queued mid-flush still drain, and
  // skip transient failures for the rest of the pass — no op ever blocks
  // the ones behind it (the set-log store's poison-pill lesson).
  const skipThisPass = new Set<string>()
  for (;;) {
    const queue = loadPending().filter(e => !skipThisPass.has(e.clientId))
    const next = queue[0]
    if (!next) return

    const { error } = await supabase.from('meal_events').insert({
      profile_id: next.profileId,
      date: next.date,
      slot: next.slot,
      event_type: next.eventType,
      meal_name: next.mealName,
      macros: next.macros,
      source: next.source,
      client_id: next.clientId,
      created_at: next.createdAt,
    })

    if (!error || error.code === '23505') {
      // Synced — or already synced by an earlier retry (unique client_id
      // rejected the duplicate), which is the idempotency working.
      savePending(loadPending().filter(e => e.clientId !== next.clientId))
      continue
    }

    if (isPermanentError(error)) {
      console.error(`meal_events row permanently rejected (${error.code}) — dead-lettering`, error.message)
      saveDeadLetter([...loadDeadLetter(), next])
      savePending(loadPending().filter(e => e.clientId !== next.clientId))
      continue
    }

    // Transient: bump attempts (dead-letter past the cap) and move on.
    const bumped = { ...next, attempts: next.attempts + 1 }
    if (bumped.attempts >= MAX_ATTEMPTS) {
      saveDeadLetter([...loadDeadLetter(), bumped])
      savePending(loadPending().filter(e => e.clientId !== next.clientId))
    } else {
      savePending(loadPending().map(e => (e.clientId === next.clientId ? bumped : e)))
      skipThisPass.add(next.clientId)
    }
  }
}

export function getDeadLetterCount(): number {
  return loadDeadLetter().length
}

function sumMacros(events: MealEventRecord[]): MealMacros {
  return events.reduce(
    (acc, e) => ({
      kcal: acc.kcal + (e.macros?.kcal ?? 0),
      protein: acc.protein + (e.macros?.protein ?? 0),
      carbs: acc.carbs + (e.macros?.carbs ?? 0),
      fat: acc.fat + (e.macros?.fat ?? 0),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

/**
 * The "remaining today" arithmetic: targets − Σ(eaten events). Local-first
 * read — merges the server's rows for the day with anything still in the
 * pending queue (deduped by client_id), so an event shows in the ledger the
 * instant it's recorded, airplane mode included. Negative remaining is
 * honest overshoot, never clamped.
 */
export async function getTodayLedger(
  profileId: string,
  date: string,
  targets: MacroTargets,
): Promise<TodayLedger> {
  let serverEvents: MealEventRecord[] = []
  try {
    const { data } = await supabase
      .from('meal_events')
      .select('client_id, date, slot, event_type, meal_name, macros, source, created_at')
      .eq('profile_id', profileId)
      .eq('date', date)
      .order('created_at', { ascending: true })
    serverEvents = (data ?? []).map(row => ({
      profileId,
      date: row.date,
      slot: row.slot,
      eventType: row.event_type,
      mealName: row.meal_name,
      macros: row.macros ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      source: row.source,
      clientId: row.client_id ?? `server_${row.created_at}`,
      createdAt: row.created_at,
    }))
  } catch {
    // Offline — the pending queue below is still the truth for today.
  }

  const seen = new Set(serverEvents.map(e => e.clientId))
  const localOnly = loadPending().filter(e => e.profileId === profileId && e.date === date && !seen.has(e.clientId))
  const events = [...serverEvents, ...localOnly].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const eatenEvents = events.filter(e => e.eventType === 'confirmed' || e.eventType === 'swapped_in' || e.eventType === 'extra')
  const eaten = sumMacros(eatenEvents)
  const remaining: MealMacros = {
    kcal: targets.calories - eaten.kcal,
    protein: targets.protein - eaten.protein,
    carbs: targets.carbs - eaten.carbs,
    fat: targets.fat - eaten.fat,
  }

  return { targets, eaten, remaining, events }
}

// ---------------------------------------------------------------------------
// Pool surface (M1) — real reads/writes against meal_plan_slots
// ---------------------------------------------------------------------------

/** Reads a profile's full stored pool, grouped by slot and ordered by pool_index. Empty object (not an error) when nothing has been generated yet. */
export async function getPools(profileId: string): Promise<Partial<Record<MealSlotName, PoolOption[]>>> {
  const { data, error } = await supabase
    .from('meal_plan_slots')
    .select('slot, pool_index, name, ingredients, macros, tags')
    .eq('profile_id', profileId)
    .order('pool_index', { ascending: true })

  if (error || !data) return {}

  const grouped: Partial<Record<MealSlotName, PoolOption[]>> = {}
  for (const row of data) {
    const slot = row.slot as MealSlotName
    const macros = row.macros ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    const option: PoolOption = {
      slot,
      name: row.name,
      ingredients: row.ingredients ?? [],
      macros: { calories: macros.kcal ?? 0, protein: macros.protein ?? 0, carbs: macros.carbs ?? 0, fat: macros.fat ?? 0 },
      tags: row.tags ?? [],
    }
    if (!grouped[slot]) grouped[slot] = []
    grouped[slot]!.push(option)
  }
  return grouped
}

/**
 * Swaps which option from the same slot's stored pool is the current pick.
 * `chooseName` picks that specific pool option (the UI's per-alternative
 * "swap to this" buttons); omitted, picks a random option excluding
 * `currentName` (the chat's simpler "swap this for something else" case).
 * Returns null when there's no other option in the pool to switch to —
 * every caller must surface that as "swap not applied," never invent one.
 *
 * Vision-architecture patch round, fix 5: this used to also call
 * recordMealEvent (eventType 'swapped_in'), which getTodayLedger counts
 * toward `eaten` — so browsing/picking a pool alternative inflated
 * calories-in before anything was actually eaten. Swapping which option is
 * assigned to a slot is a plan-state change, not a consumption event; it no
 * longer touches the ledger. Ledger events come only from explicit
 * eaten/confirm actions.
 */
export async function swapPoolMeal(
  profileId: string,
  slot: MealSlotName,
  currentName?: string,
  chooseName?: string,
): Promise<PoolOption | null> {
  const pools = await getPools(profileId)
  const options = pools[slot] ?? []
  if (options.length === 0) return null

  let chosen: PoolOption | undefined
  if (chooseName) {
    chosen = options.find(o => o.name === chooseName)
  } else {
    const alternatives = currentName ? options.filter(o => o.name !== currentName) : options
    if (alternatives.length === 0) return null
    chosen = alternatives[Math.floor(Math.random() * alternatives.length)]
  }
  if (!chosen) return null

  return chosen
}

/** Flush when connectivity returns — mirrors set-log-store's listener. */
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { flushPending() })
}
