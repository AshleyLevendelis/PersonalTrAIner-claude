import { supabase } from './supabase'
import type { ExerciseSetLog } from './types'

// ---------------------------------------------------------------------------
// set-log-store — THE single write path for logged sets (C0 Part 3).
//
// Local-first: every write lands in a localStorage-backed pending store
// synchronously (the UI's green check reflects LOCAL persistence, never a
// network round-trip), then background-syncs to `exercise_set_logs` as an
// upsert on the natural key (user, session, exercise, set_number, is_warmup).
// The `client_id` idempotency key plus that unique constraint make duplicate
// rows structurally impossible no matter how many times a sync retries
// (discovery landmines L1/L2/L4).
//
// Sessions (C0 Part 5): the first set saved for a (user, date) auto-creates
// that day's `workout_sessions` row — started_at stamped, week/day context
// attached — and every set links to it. No dedicated UI this round; the
// existing "Complete Session" button stamps finished_at (daily-tracking.ts).
// ---------------------------------------------------------------------------

const PENDING_KEY = 'fitplan_setlog_pending_v1'
const SESSION_REGISTRY_KEY = 'fitplan_setlog_sessions_v1'
const DEAD_LETTER_KEY = 'fitplan_setlog_deadletter_v1'
/** The pre-C0 offline queue (offline-sync.ts). Drained into the pending store on init so nothing a user queued before updating the app is lost. */
const LEGACY_QUEUE_KEY = 'offline_log_queue'

/** Per-item ceiling on transient-error retries before giving up and dead-lettering (defense in depth — most failures are classified permanent/immediate, this bounds the rest). */
const MAX_SYNC_ATTEMPTS = 5

export type SetUnit = 'reps' | 'seconds' | 'meters'

export interface SaveSetInput {
  userId: string
  /** Session date, YYYY-MM-DD (the caller's "today" — respects the dev clock). */
  date: string
  weekNumber: number | null
  /** Weekday name, e.g. 'Monday'. */
  day: string
  exerciseId: string
  exerciseName: string
  setNumber: number
  weightKg: number
  repsCompleted: number
  rpe?: number | null
  unit?: SetUnit
  isBodyweight?: boolean
  isWarmup?: boolean
}

interface PendingSet {
  clientId: string
  userId: string
  date: string
  weekNumber: number | null
  day: string
  exerciseId: string
  exerciseName: string
  setNumber: number
  weightKg: number
  repsCompleted: number
  rpe: number | null
  unit: SetUnit
  isBodyweight: boolean
  isWarmup: boolean
  completedAt: string
  attempts: number
}

interface PendingDelete {
  clientId: string
  userId: string
  date: string
  exerciseId: string
  setNumber: number
  isWarmup: boolean
  attempts: number
}

type PendingOp =
  | { kind: 'upsert'; set: PendingSet }
  | { kind: 'delete'; del: PendingDelete }

interface SessionRegistryEntry {
  serverId?: string
  startedAt: string
  weekNumber: number | null
  day: string
}

export interface SyncState {
  isOnline: boolean
  isSyncing: boolean
  queuedCount: number
  /** Items that permanently failed to sync (or exhausted retries) and need manual attention — see DeadLetterItem. */
  deadLetterCount: number
}

/** A pending op that will never succeed as-is (a rejected constraint, e.g. a typo'd weight) or that exhausted its retry budget — moved out of the sync queue so it can no longer block later, healthy ops (kills the poison-pill head-of-line block). */
export interface DeadLetterItem {
  op: PendingOp
  reason: 'permanent' | 'max-attempts'
  errorMessage: string
  failedAt: string
}

/** Display-friendly summary of a dead-lettered item for the UI. */
export interface DeadLetterSummary {
  clientId: string
  kind: 'upsert' | 'delete'
  exerciseName: string
  setNumber: number
  date: string
  weightKg?: number
  repsCompleted?: number
  reason: DeadLetterItem['reason']
  errorMessage: string
  failedAt: string
}

/** Maps a prescription_type to the unit a logged value is recorded in. */
export function prescriptionUnit(prescriptionType?: string): SetUnit {
  switch (prescriptionType) {
    case 'time': return 'seconds'
    case 'intervals': return 'seconds'
    case 'distance_load': return 'meters'
    default: return 'reps'
  }
}

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
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

function loadRegistry(): Record<string, SessionRegistryEntry> {
  if (!hasStorage()) return {}
  try {
    const raw = localStorage.getItem(SESSION_REGISTRY_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveRegistry(reg: Record<string, SessionRegistryEntry>): void {
  if (!hasStorage()) return
  localStorage.setItem(SESSION_REGISTRY_KEY, JSON.stringify(reg))
}

function naturalKey(userId: string, date: string, exerciseId: string, setNumber: number, isWarmup: boolean): string {
  return [userId, date, exerciseId, setNumber, isWarmup ? 'w' : 's'].join('|')
}

function opNaturalKey(op: PendingOp): string {
  return op.kind === 'upsert'
    ? naturalKey(op.set.userId, op.set.date, op.set.exerciseId, op.set.setNumber, op.set.isWarmup)
    : naturalKey(op.del.userId, op.del.date, op.del.exerciseId, op.del.setNumber, op.del.isWarmup)
}

function clientIdOf(op: PendingOp): string {
  return op.kind === 'upsert' ? op.set.clientId : op.del.clientId
}

// ---------------------------------------------------------------------------
// Dead-letter store — items that will never sync as-is (rejected by a
// constraint) or that exhausted their retry budget. Kept separate from the
// pending queue so one bad item can never block the rest (the poison-pill
// fix) and so the UI has something concrete to show the user.
// ---------------------------------------------------------------------------

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

/** Removes an op from the pending queue and files it in the dead-letter store. */
function moveToDeadLetter(op: PendingOp, error: unknown, reason: DeadLetterItem['reason']): void {
  const errorMessage = (error as { message?: string } | null)?.message ?? String(error)
  const item: DeadLetterItem = { op, reason, errorMessage, failedAt: new Date().toISOString() }
  saveDeadLetter([...loadDeadLetter(), item])
  const clientId = clientIdOf(op)
  savePending(loadPending().filter(o => clientIdOf(o) !== clientId))
}

function summarize(item: DeadLetterItem): DeadLetterSummary {
  const base = { reason: item.reason, errorMessage: item.errorMessage, failedAt: item.failedAt }
  if (item.op.kind === 'upsert') {
    const s = item.op.set
    return { ...base, clientId: s.clientId, kind: 'upsert', exerciseName: s.exerciseName, setNumber: s.setNumber, date: s.date, weightKg: s.weightKg, repsCompleted: s.repsCompleted }
  }
  const d = item.op.del
  return { ...base, clientId: d.clientId, kind: 'delete', exerciseName: d.exerciseId, setNumber: d.setNumber, date: d.date }
}

/** Everything currently stuck in the dead-letter store, for the "N sets failed to sync" UI. */
export function getDeadLetterItems(): DeadLetterSummary[] {
  return loadDeadLetter().map(summarize)
}

/** Re-queues a dead-lettered item with a fresh clientId and zeroed attempts, then kicks off a flush. Use after the user has fixed whatever made it permanently fail (or just wants to try again). */
export function retryDeadLetterItem(clientId: string): void {
  const items = loadDeadLetter()
  const item = items.find(i => clientIdOf(i.op) === clientId)
  if (!item) return
  saveDeadLetter(items.filter(i => i !== item))

  const freshOp: PendingOp = item.op.kind === 'upsert'
    ? { kind: 'upsert', set: { ...item.op.set, clientId: generateClientId(), attempts: 0 } }
    : { kind: 'delete', del: { ...item.op.del, clientId: generateClientId(), attempts: 0 } }
  const ops = loadPending().filter(op => opNaturalKey(op) !== opNaturalKey(freshOp))
  ops.push(freshOp)
  savePending(ops)
  notifyListeners()
  void flushPending()
}

/** Permanently discards a dead-lettered item — the user chose not to retry it. */
export function discardDeadLetterItem(clientId: string): void {
  saveDeadLetter(loadDeadLetter().filter(i => clientIdOf(i.op) !== clientId))
  notifyListeners()
}

/**
 * Classifies a sync failure so doFlush knows whether retrying the identical
 * payload could ever succeed. A Postgrest/Postgres error carries a `.code`
 * (constraint violation, numeric overflow, FK violation, ...) — the server
 * received and rejected the request, so retrying verbatim can never help.
 * No `.code` at all (a thrown TypeError from a failed fetch, a timeout, a
 * DNS failure) means the request never reached the server — worth retrying.
 */
function classifyError(error: unknown): 'network' | 'permanent' {
  const code = (error as { code?: string } | null)?.code
  return code ? 'permanent' : 'network'
}

// ---------------------------------------------------------------------------
// Sync state pub/sub (consumed by OfflineStatusIndicator)
// ---------------------------------------------------------------------------

type SyncListener = (state: SyncState) => void
let listeners: SyncListener[] = []
let isSyncing = false

function currentState(): SyncState {
  return {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing,
    queuedCount: loadPending().length,
    deadLetterCount: loadDeadLetter().length,
  }
}

function notifyListeners(): void {
  const state = currentState()
  listeners.forEach(fn => fn(state))
}

export function subscribeSyncState(listener: SyncListener): () => void {
  listeners.push(listener)
  listener(currentState())
  return () => {
    listeners = listeners.filter(l => l !== listener)
  }
}

export function getSyncState(): SyncState {
  return currentState()
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function toView(set: PendingSet): ExerciseSetLog {
  return {
    user_id: set.userId,
    date: set.date,
    exercise_name: set.exerciseName,
    exercise_id: set.exerciseId,
    set_number: set.setNumber,
    weight_kg: set.weightKg,
    reps_completed: set.repsCompleted,
    is_bodyweight: set.isBodyweight,
    is_warmup: set.isWarmup,
    unit: set.unit,
    rpe: set.rpe,
    completed_at: set.completedAt,
  }
}

/**
 * Saves (or overwrites — upsert semantics on the natural key) one set.
 * Synchronous success: the returned view is already persisted locally when
 * this returns; network sync happens in the background.
 */
export function saveSet(input: SaveSetInput): ExerciseSetLog {
  const set: PendingSet = {
    clientId: generateClientId(),
    userId: input.userId,
    date: input.date,
    weekNumber: input.weekNumber,
    day: input.day,
    exerciseId: input.exerciseId,
    exerciseName: input.exerciseName,
    setNumber: input.setNumber,
    weightKg: input.weightKg,
    repsCompleted: input.repsCompleted,
    rpe: input.rpe ?? null,
    unit: input.unit ?? 'reps',
    isBodyweight: input.isBodyweight ?? false,
    isWarmup: input.isWarmup ?? false,
    completedAt: new Date().toISOString(),
    attempts: 0,
  }

  // Session registry: first set of the day stamps started_at (Part 5).
  const regKey = `${input.userId}|${input.date}`
  const registry = loadRegistry()
  if (!registry[regKey]) {
    registry[regKey] = {
      startedAt: set.completedAt,
      weekNumber: input.weekNumber,
      day: input.day,
    }
    saveRegistry(registry)
  }

  // Coalesce: a re-save of the same logical set replaces its pending
  // predecessor (and cancels any pending delete for the key).
  const key = naturalKey(set.userId, set.date, set.exerciseId, set.setNumber, set.isWarmup)
  const ops = loadPending().filter(op => opNaturalKey(op) !== key)
  ops.push({ kind: 'upsert', set })
  savePending(ops)
  notifyListeners()
  void flushPending()
  return toView(set)
}

/** Alias for saveSet — the natural-key upsert makes update and save the same operation. */
export function updateSet(input: SaveSetInput): ExerciseSetLog {
  return saveSet(input)
}

/** Tombstones a set locally (hidden from reads immediately), then deletes server-side in the background. */
export function deleteSet(params: {
  userId: string
  date: string
  exerciseId: string
  setNumber: number
  isWarmup?: boolean
}): void {
  const del: PendingDelete = {
    clientId: generateClientId(),
    userId: params.userId,
    date: params.date,
    exerciseId: params.exerciseId,
    setNumber: params.setNumber,
    isWarmup: params.isWarmup ?? false,
    attempts: 0,
  }
  const key = naturalKey(del.userId, del.date, del.exerciseId, del.setNumber, del.isWarmup)
  const ops = loadPending().filter(op => opNaturalKey(op) !== key)
  ops.push({ kind: 'delete', del })
  savePending(ops)
  notifyListeners()
  void flushPending()
}

// ---------------------------------------------------------------------------
// Session resolution (Part 5 — auto-create today's workout_sessions row)
// ---------------------------------------------------------------------------

async function ensureSessionSynced(userId: string, date: string): Promise<string> {
  const regKey = `${userId}|${date}`
  const registry = loadRegistry()
  const entry = registry[regKey]
  if (entry?.serverId) return entry.serverId

  const { data: existing, error: selectError } = await supabase
    .from('workout_sessions')
    .select('id, started_at')
    .eq('profile_id', userId)
    .eq('date', date)
    .maybeSingle()
  if (selectError) throw selectError

  let serverId: string
  if (existing) {
    serverId = existing.id
    if (!existing.started_at && entry?.startedAt) {
      // Fill blanks only — never clobber an existing session's data.
      await supabase
        .from('workout_sessions')
        .update({ started_at: entry.startedAt, week_number: entry.weekNumber, day: entry.day })
        .eq('id', serverId)
        .is('started_at', null)
    }
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from('workout_sessions')
      .insert({
        profile_id: userId,
        date,
        split_type: 'training',
        duration_minutes: 45,
        is_completed: false,
        started_at: entry?.startedAt ?? new Date().toISOString(),
        week_number: entry?.weekNumber ?? null,
        day: entry?.day ?? null,
      })
      .select('id')
      .maybeSingle()
    if (insertError || !inserted) {
      // Unique-violation race (another tab/device created it) — re-select.
      const { data: raced, error: racedError } = await supabase
        .from('workout_sessions')
        .select('id')
        .eq('profile_id', userId)
        .eq('date', date)
        .maybeSingle()
      if (racedError || !raced) throw insertError ?? racedError ?? new Error('Failed to resolve workout session')
      serverId = raced.id
    } else {
      serverId = inserted.id
    }
  }

  const freshRegistry = loadRegistry()
  freshRegistry[regKey] = { ...(freshRegistry[regKey] ?? { startedAt: new Date().toISOString(), weekNumber: null, day: '' }), serverId }
  saveRegistry(freshRegistry)
  return serverId
}

// ---------------------------------------------------------------------------
// Background flush
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

/**
 * Drains the pending store to the server. Concurrent calls share the
 * in-flight flush's promise — so `await flushPending()` always means "the
 * flush that covers my write has finished", never a silent no-op because a
 * background flush happened to be mid-air.
 */
export function flushPending(): Promise<void> {
  if (flushPromise) return flushPromise
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve()
  if (loadPending().length === 0) return Promise.resolve()
  flushPromise = doFlush().finally(() => { flushPromise = null })
  return flushPromise
}

async function syncUpsert(set: PendingSet): Promise<void> {
  const sessionId = await ensureSessionSynced(set.userId, set.date)
  const { error } = await supabase
    .from('exercise_set_logs')
    .upsert({
      session_id: sessionId,
      user_id: set.userId,
      exercise_id: set.exerciseId,
      exercise_name: set.exerciseName,
      week_number: set.weekNumber,
      day: set.day,
      set_number: set.setNumber,
      weight_kg: set.weightKg,
      reps_completed: set.repsCompleted,
      rpe: set.rpe,
      unit: set.unit,
      is_bodyweight: set.isBodyweight,
      is_warmup: set.isWarmup,
      completed_at: set.completedAt,
      client_id: set.clientId,
    }, { onConflict: 'user_id,session_id,exercise_id,set_number,is_warmup' })
  if (error) throw error
}

async function syncDelete(del: PendingDelete): Promise<void> {
  const registry = loadRegistry()
  const cachedServerId = registry[`${del.userId}|${del.date}`]?.serverId
  let sessionId = cachedServerId
  if (!sessionId) {
    const { data } = await supabase
      .from('workout_sessions')
      .select('id')
      .eq('profile_id', del.userId)
      .eq('date', del.date)
      .maybeSingle()
    sessionId = data?.id
  }
  if (!sessionId) return // Never synced server-side — nothing to delete.
  const { error } = await supabase
    .from('exercise_set_logs')
    .delete()
    .match({
      user_id: del.userId,
      session_id: sessionId,
      exercise_id: del.exerciseId,
      set_number: del.setNumber,
      is_warmup: del.isWarmup,
    })
  if (error) throw error
}

/**
 * Drains the pending queue. Reloads pending fresh on every iteration (rather
 * than a fixed snapshot) so ops queued WHILE this flush is already running —
 * the common case: several saveSet calls in one synchronous burst all share
 * the same in-flight flush promise — still get drained by it, not stranded
 * until some later flush. `skipThisPass` is what keeps that safe: an item
 * that fails transiently is set aside for the REST of this pass (so the loop
 * always makes forward progress toward newer/other items) without being
 * retried in a tight loop; it's picked up again on the next flush.
 *
 * Critically, no single op's failure — permanent (a rejected constraint) or
 * transient (a network hiccup) — ever stops the pass. This is what kills the
 * poison-pill bug (a bad set used to sit at the head of a strict FIFO and
 * block every later set, on any date, forever).
 */
async function doFlush(): Promise<void> {
  isSyncing = true
  notifyListeners()
  const skipThisPass = new Set<string>()

  try {
    while (true) {
      const op = loadPending().find(o => !skipThisPass.has(clientIdOf(o)))
      if (!op) break
      const clientId = clientIdOf(op)

      try {
        if (op.kind === 'upsert') await syncUpsert(op.set)
        else await syncDelete(op.del)

        savePending(loadPending().filter(o => clientIdOf(o) !== clientId))
        consecutiveFailures = 0
        notifyListeners()
      } catch (err) {
        if (classifyError(err) === 'permanent') {
          moveToDeadLetter(op, err, 'permanent')
          notifyListeners()
          continue
        }

        const persisted = loadPending()
        const target = persisted.find(o => clientIdOf(o) === clientId)
        if (target) {
          const attempts = (target.kind === 'upsert' ? target.set.attempts : target.del.attempts) + 1
          if (target.kind === 'upsert') target.set.attempts = attempts
          else target.del.attempts = attempts
          savePending(persisted)
          if (attempts >= MAX_SYNC_ATTEMPTS) {
            moveToDeadLetter(target, err, 'max-attempts')
            notifyListeners()
            continue
          }
        }
        skipThisPass.add(clientId)
        consecutiveFailures += 1
        notifyListeners()
      }
    }
  } finally {
    isSyncing = false
    notifyListeners()
    if (loadPending().length > 0) scheduleRetry()
  }
}

// ---------------------------------------------------------------------------
// Reads (read-through: synced + pending merged, so the UI always sees its own writes)
// ---------------------------------------------------------------------------

interface ServerSetRow {
  session_id: string
  user_id: string
  exercise_id: string
  exercise_name: string
  week_number: number | null
  day: string | null
  set_number: number
  weight_kg: number
  reps_completed: number
  rpe: number | null
  unit: SetUnit
  is_bodyweight: boolean
  is_warmup: boolean
  completed_at: string
}

/**
 * A row that carries no real signal: 0kg logged for a movement not marked
 * bodyweight. Before C0 fix #2, chat's tool schema defaulted an unstated
 * weight to 0 and wrote it as if it were the real working weight; historical
 * rows shaped like that (or anything else that slips one through in the
 * future) must never be read as "the last working weight was 0" by ghosts or
 * progression — treat them as if they don't exist rather than let them poison
 * a recommendation or bury a real prior session.
 */
export function isMalformedZeroWeight(row: { weight_kg: number; is_bodyweight: boolean }): boolean {
  return row.weight_kg === 0 && !row.is_bodyweight
}

function serverRowToView(row: ServerSetRow, date: string): ExerciseSetLog {
  return {
    user_id: row.user_id,
    date,
    exercise_name: row.exercise_name,
    exercise_id: row.exercise_id,
    set_number: row.set_number,
    weight_kg: Number(row.weight_kg),
    reps_completed: row.reps_completed,
    is_bodyweight: row.is_bodyweight,
    is_warmup: row.is_warmup,
    unit: row.unit,
    rpe: row.rpe,
    completed_at: row.completed_at,
  }
}

function mergePendingForDate(userId: string, date: string, base: ExerciseSetLog[]): ExerciseSetLog[] {
  const byKey = new Map<string, ExerciseSetLog>()
  for (const log of base) {
    byKey.set(naturalKey(userId, date, log.exercise_id ?? log.exercise_name, log.set_number, log.is_warmup ?? false), log)
  }
  for (const op of loadPending()) {
    if (op.kind === 'upsert') {
      if (op.set.userId !== userId || op.set.date !== date) continue
      byKey.set(opNaturalKey(op), toView(op.set))
    } else {
      if (op.del.userId !== userId || op.del.date !== date) continue
      byKey.delete(opNaturalKey(op))
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.exercise_name.localeCompare(b.exercise_name) || a.set_number - b.set_number
  )
}

/** All sets for a (user, date) — server + pending merged. Never throws: offline returns the pending view. */
export async function getSetsForDate(userId: string, date: string): Promise<ExerciseSetLog[]> {
  let synced: ExerciseSetLog[] = []
  try {
    const { data: session } = await supabase
      .from('workout_sessions')
      .select('id')
      .eq('profile_id', userId)
      .eq('date', date)
      .maybeSingle()
    if (session) {
      const { data } = await supabase
        .from('exercise_set_logs')
        .select('*')
        .eq('session_id', session.id)
        .order('exercise_name')
        .order('set_number')
      synced = ((data || []) as ServerSetRow[]).map(r => serverRowToView(r, date))
    }
  } catch {
    // Offline — pending-only view below.
  }
  return mergePendingForDate(userId, date, synced)
}

/**
 * The trainee's most recent session for an exercise strictly before
 * `beforeDate` — ghost values and progression both hang off this. Working
 * sets only.
 *
 * A session that's mid-sync (some sets already landed server-side, others
 * still in the pending store — the normal outcome of a FIFO flush that's
 * still running, or one that stalled offline) is genuinely split across both
 * sources. Earlier versions of this function picked ONE source wholesale
 * (whichever looked "more recent") and silently dropped the other half of
 * that same session. This merges them instead: same-session identity is
 * (user, local date, exercise_id); within that session, sets are deduped on
 * (set_number, is_warmup) with the pending copy winning — it's either a
 * same-session edit made after the last successful sync, or the not-yet-
 * synced half of a session that hasn't fully landed either way.
 */
export async function getLastSessionSets(
  userId: string,
  exerciseId: string,
  beforeDate: string,
): Promise<ExerciseSetLog[]> {
  let serverRows: ServerSetRow[] = []
  try {
    const { data } = await supabase
      .from('exercise_set_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('exercise_id', exerciseId)
      .eq('is_warmup', false)
      .lt('completed_at', beforeDate)
      .order('completed_at', { ascending: false })
      .limit(60)
    // Malformed rows are filtered out BEFORE picking "the latest session" —
    // a session that's entirely malformed (e.g. an old chat-logged 0kg entry)
    // must be skipped in favor of the last session with real data, not
    // returned as an empty/wrong "most recent" result.
    serverRows = ((data || []) as ServerSetRow[]).filter(r => !isMalformedZeroWeight(r))
  } catch {
    // Offline — pending-only view below.
  }

  const pendingSets = loadPending()
    .filter((op): op is { kind: 'upsert'; set: PendingSet } => op.kind === 'upsert')
    .map(op => op.set)
    .filter(s => s.userId === userId && s.exerciseId === exerciseId && !s.isWarmup)
    .filter(s => s.completedAt < beforeDate)
    .filter(s => !isMalformedZeroWeight({ weight_kg: s.weightKg, is_bodyweight: s.isBodyweight }))

  // Server rows carry an authoritative session_id but not a date column
  // directly — completed_at's date portion is the established proxy (see
  // getSetsForSession). Pending sets carry their local session date directly
  // (the same `date` field saveSet stamps every set of a session with).
  const dateBySessionId = new Map<string, string>()
  for (const r of serverRows) {
    if (!dateBySessionId.has(r.session_id)) dateBySessionId.set(r.session_id, r.completed_at.slice(0, 10))
  }

  const candidateDates = [...new Set([...dateBySessionId.values(), ...pendingSets.map(s => s.date)])].sort()
  if (candidateDates.length === 0) return []
  const latestDate = candidateDates[candidateDates.length - 1]

  const bySetKey = new Map<string, ExerciseSetLog>()
  for (const r of serverRows) {
    if (dateBySessionId.get(r.session_id) !== latestDate) continue
    bySetKey.set(`${r.set_number}|${r.is_warmup}`, serverRowToView(r, latestDate))
  }
  for (const s of pendingSets) {
    if (s.date !== latestDate) continue
    bySetKey.set(`${s.setNumber}|${s.isWarmup}`, toView(s)) // pending wins on a shared key
  }

  return [...bySetKey.values()].sort((a, b) => a.set_number - b.set_number)
}

/**
 * Direct synced write for HISTORICAL data (dev seeding, backfill tooling) —
 * bypasses the pending store because these rows need explicit completed_at
 * timestamps in the past, which saveSet (deliberately) doesn't accept.
 * Same session-ensure + natural-key upsert semantics as the flush path.
 */
export async function writeHistoricalSession(params: {
  userId: string
  date: string
  weekNumber: number | null
  day: string
  sets: Array<{
    exerciseId: string
    exerciseName: string
    setNumber: number
    weightKg: number
    repsCompleted: number
    rpe?: number | null
    unit?: SetUnit
    isBodyweight?: boolean
    isWarmup?: boolean
    completedAt: string
  }>
}): Promise<void> {
  if (params.sets.length === 0) return
  const sessionId = await ensureSessionSynced(params.userId, params.date)
  const rows = params.sets.map(s => ({
    session_id: sessionId,
    user_id: params.userId,
    exercise_id: s.exerciseId,
    exercise_name: s.exerciseName,
    week_number: params.weekNumber,
    day: params.day,
    set_number: s.setNumber,
    weight_kg: s.weightKg,
    reps_completed: s.repsCompleted,
    rpe: s.rpe ?? null,
    unit: s.unit ?? 'reps',
    is_bodyweight: s.isBodyweight ?? false,
    is_warmup: s.isWarmup ?? false,
    completed_at: s.completedAt,
  }))
  const { error } = await supabase
    .from('exercise_set_logs')
    .upsert(rows, { onConflict: 'user_id,session_id,exercise_id,set_number,is_warmup' })
  if (error) throw error
}

/** Dev tool: wipe a profile's unified logging data (sets + their session rows + local caches). */
export async function clearAllSetLogs(userId: string): Promise<void> {
  const { error: setsError } = await supabase.from('exercise_set_logs').delete().eq('user_id', userId)
  if (setsError) throw setsError
  const { error: sessionsError } = await supabase.from('workout_sessions').delete().eq('profile_id', userId)
  if (sessionsError) throw sessionsError
  if (hasStorage()) {
    localStorage.removeItem(PENDING_KEY)
    localStorage.removeItem(SESSION_REGISTRY_KEY)
  }
  notifyListeners()
}

/** All working+warmup sets attached to a synced session id (Part 4 dashboard read). */
export async function getSetsForSession(sessionId: string): Promise<ExerciseSetLog[]> {
  const { data } = await supabase
    .from('exercise_set_logs')
    .select('*')
    .eq('session_id', sessionId)
    .order('exercise_name')
    .order('set_number')
  return ((data || []) as ServerSetRow[]).map(r => serverRowToView(r, r.completed_at.slice(0, 10)))
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

interface LegacyQueueItem {
  user_id: string
  exercise_name: string
  week_number: number
  day: string
  set_number: number
  weight_kg: number
  reps_completed: number
  rpe?: number | null
  queued_at: string
}

/** Drain the pre-C0 offline queue (set_logs-shaped) into the pending store so nothing queued before the update is lost. */
function migrateLegacyQueue(): void {
  if (!hasStorage()) return
  try {
    const raw = localStorage.getItem(LEGACY_QUEUE_KEY)
    if (!raw) return
    const items: LegacyQueueItem[] = JSON.parse(raw)
    for (const item of items) {
      if (!item?.user_id || !item?.exercise_name) continue
      // Weight-0 legacy queue rows are the bulk-button fabrications (L6) — drop them.
      if (!item.weight_kg || item.weight_kg <= 0) continue
      saveSet({
        userId: item.user_id,
        date: (item.queued_at || new Date().toISOString()).slice(0, 10),
        weekNumber: item.week_number ?? null,
        day: item.day,
        // Local import — avoid a static cycle with exercise-db's heavyweight module graph.
        exerciseId: item.exercise_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
        exerciseName: item.exercise_name,
        setNumber: item.set_number,
        weightKg: item.weight_kg,
        repsCompleted: item.reps_completed,
        rpe: item.rpe ?? null,
        unit: 'reps',
      })
    }
    localStorage.removeItem(LEGACY_QUEUE_KEY)
  } catch {
    // Malformed legacy queue — leave it; nothing new depends on it.
  }
}

let initialized = false

export function initSetLogStore(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  migrateLegacyQueue()
  window.addEventListener('online', () => {
    consecutiveFailures = 0
    notifyListeners()
    void flushPending()
  })
  window.addEventListener('offline', notifyListeners)
  if (loadPending().length > 0) void flushPending()
}

/** Test seam — resets module state between test scenarios. */
export function __resetForTests(): void {
  listeners = []
  flushPromise = null
  isSyncing = false
  consecutiveFailures = 0
  initialized = false
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
}
