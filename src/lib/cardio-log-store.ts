// ---------------------------------------------------------------------------
// Local-first, retriable write path for cardio logs (LAYOUT-DESIGN.md §1.7 G,
// §7.6 prerequisite #5). The old path — daily-tracking.ts's insertCardioLog
// called directly from a component — is a bare network write with no
// optimistic update and no retry: offline or a flaky connection just failed
// silently (console.error only). This mirrors set-log-store's shape at a
// much smaller scale: one pending queue, a natural-key coalesce, background
// flush with backoff, and a visible failed state instead of a swallowed one.
//
// Fix 0.12 (ux-sweep) — a synced entry is no longer dropped from the local
// queue on flush; it's kept (status: 'synced', tagged with the server id)
// for a short UNDO_WINDOW_MS so a mis-tap "Log" has a real undo, matching
// every other confirm-action in this app. getCardioLogsForDateMerged only
// surfaces 'pending'/'failed' local rows (a 'synced' row is already present
// in the server fetch — keeping both would double-render it); synced rows
// are pruned once they age out of the undo window.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'
import { getAppNow } from './dev-clock'
import { isConnectionFailure } from './connection-error'
import type { CardioLog } from './types'

const PENDING_KEY = 'fitplan_cardio_pending_v1'
/** The server's cardio rows as this phone last saw them — see "THE PHONE'S OWN COPY" below. */
const LAST_KNOWN_KEY = 'fitplan_cardio_lastknown_v1'
/** How far back that copy reaches, and how many rows it may hold. History asks the server; this is for a bad connection, not an archive. */
const LAST_KNOWN_DAYS = 60
const LAST_KNOWN_MAX_ROWS = 300
const MAX_ATTEMPTS = 5
/** How long a synced entry stays undoable before it's pruned from the local queue. */
export const CARDIO_UNDO_WINDOW_MS = 10 * 60 * 1000

export interface CardioLogInput {
  userId: string
  date: string
  activityName: string
  durationMinutes: number
  intensityRpe: number
  avgHeartRate?: number | null
  notes?: string | null
}

interface PendingCardioLog extends CardioLogInput {
  clientId: string
  completedAt: string
  attempts: number
  status: 'pending' | 'failed' | 'synced'
  errorMessage?: string
  /** Server-assigned id, set once status flips to 'synced' — what an undo deletes by. */
  id?: string
  /** Set by deleteCardioLog when undo races an in-flight sync (item was still 'pending' at the time) — flushPending's success path checks this and deletes the just-inserted row immediately instead of marking 'synced'. */
  pendingDelete?: boolean
  /**
   * WALL-CLOCK time of the tap, for the undo window only. completedAt is the
   * APP's clock (getAppNow), which a dev-clock override moves by days — and
   * the window was measured against it, so on any overridden day a synced log
   * was already "older than ten minutes" and pruned on the next flush. Undo
   * then no-opped while the row it sat on cleared itself: found 24 Sep 2026
   * when the cardio rows started asking whether Undo would work before
   * offering it. Absent on entries written before that; they fall back.
   */
  savedAtMs?: number
}

export interface CardioLogView extends CardioLog {
  clientId?: string
  syncStatus?: 'synced' | 'pending' | 'failed'
}

type Listener = () => void
const listeners = new Set<Listener>()
function notify() {
  listeners.forEach(l => l())
}

export function subscribeCardioLogStore(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function generateClientId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `cardio_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function loadPending(): PendingCardioLog[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePending(items: PendingCardioLog[]): void {
  localStorage.setItem(PENDING_KEY, JSON.stringify(items))
}

function pendingToView(p: PendingCardioLog): CardioLogView {
  return {
    id: p.id,
    clientId: p.clientId,
    user_id: p.userId,
    date: p.date,
    activity_name: p.activityName,
    duration_minutes: p.durationMinutes,
    intensity_rpe: p.intensityRpe,
    avg_heart_rate: p.avgHeartRate ?? null,
    notes: p.notes ?? null,
    completed_at: p.completedAt,
    syncStatus: p.status,
  }
}

/**
 * The longest single cardio entry the app will store, in minutes — one day.
 *
 * Not a judgement about training: it is the point past which the number is
 * certainly a typo rather than a session, and cardio minutes feed the weekly
 * conditioning share and the day's activity, so a 90,000 stays in those
 * numbers until somebody notices. Same shape as MAX_PLAUSIBLE_DAILY_STEPS.
 */
export const MAX_PLAUSIBLE_CARDIO_MINUTES = 24 * 60

/** Is this a duration the app will store for one cardio entry? */
export function isPlausibleCardioDuration(minutes: number): boolean {
  return Number.isFinite(minutes) && minutes >= 1 && minutes <= MAX_PLAUSIBLE_CARDIO_MINUTES
}

/**
 * Local-first: writes to the pending queue synchronously and returns the
 * view immediately — the UI can show the logged activity before the network
 * round-trip even starts. Coalesces on clientId so a retry never duplicates.
 *
 * THE DURATION BOUND LIVES HERE, not only in the forms. Four writers reach
 * this function — the rest-day card, unplanned work, the session finisher and
 * the chat executor — and the two typed-entry forms each carried a `min="1"`
 * attribute, which a browser treats as a hint and does not enforce: `-5`
 * parsed, passed the `!!duration` check, and was stored as minus five minutes
 * of cardio. A rule that matters at four call sites belongs at the one they
 * share. Returns null rather than throwing: every caller already handles "no
 * view came back" for its own reasons, and none of them wants a throw on a tap.
 */
export function saveCardioLog(input: CardioLogInput): CardioLogView | null {
  if (!isPlausibleCardioDuration(input.durationMinutes)) {
    console.error('Refusing to log an implausible cardio duration:', input.durationMinutes)
    return null
  }
  return saveCardioLogUnchecked(input)
}

function saveCardioLogUnchecked(input: CardioLogInput): CardioLogView {
  const clientId = generateClientId()
  const pending: PendingCardioLog = {
    ...input,
    clientId,
    completedAt: getAppNow(input.userId).toISOString(),
    savedAtMs: Date.now(),
    attempts: 0,
    status: 'pending',
  }
  const items = loadPending()
  items.push(pending)
  savePending(items)
  notify()
  void flushPending()
  return pendingToView(pending)
}

export function retryFailedCardioLog(clientId: string): void {
  const items = loadPending()
  const item = items.find(i => i.clientId === clientId)
  if (!item) return
  item.status = 'pending'
  item.attempts = 0
  item.errorMessage = undefined
  savePending(items)
  notify()
  void flushPending()
}

export function discardFailedCardioLog(clientId: string): void {
  const items = loadPending().filter(i => i.clientId !== clientId)
  savePending(items)
  notify()
}

/**
 * Undo for a just-logged cardio entry (fix 0.12 — the "Log" button had no
 * confirm and no way back). Works regardless of sync timing: if the entry
 * hasn't flushed yet, it's just dropped from the local queue before it ever
 * reaches the server; if it already synced, its server row (id captured at
 * sync time) is deleted. Silently no-ops past CARDIO_UNDO_WINDOW_MS, once
 * the entry has been pruned — matches this app's other undo windows.
 */
export async function deleteCardioLog(clientId: string): Promise<void> {
  // Wait out any sync already in flight for this entry first — otherwise a
  // fast undo could read 'pending' right before the flush marks it 'synced'
  // moments later, leaving a server row neither branch below accounts for.
  if (flushPromise) await flushPromise
  const items = loadPending()
  const item = items.find(i => i.clientId === clientId)
  if (!item) return
  if (item.status === 'pending') {
    // A sync for this exact entry may already be in flight (saveCardioLog
    // fires flushPending in the background) — tombstone it rather than
    // just dropping it locally, so if that in-flight insert lands *after*
    // this call, flushPending's success path deletes the row it just
    // created instead of leaving an orphaned, no-longer-undoable row.
    item.pendingDelete = true
    savePending(items)
    notify()
    return
  }
  if (item.status === 'failed') {
    savePending(items.filter(i => i.clientId !== clientId))
    notify()
    return
  }
  if (item.id) {
    const { error } = await supabase.from('cardio_logs').delete().eq('id', item.id)
    if (error) throw error
    recordSynced({ kind: 'delete', id: item.id })
  }
  savePending(loadPending().filter(i => i.clientId !== clientId))
  notify()
}

/**
 * CAN THIS LOG STILL BE UNDONE? Asked by a row BEFORE it offers Undo, so the
 * button is never drawn over a log deleteCardioLog would silently leave in
 * place. deleteCardioLog no-ops on anything it no longer holds — past the
 * window, or already tombstoned — and a row that then hid the log anyway
 * would be telling her it was gone while the server still counted it.
 */
export function isCardioLogUndoable(clientId: string | null | undefined): boolean {
  if (!clientId) return false
  const item = loadPending().find(i => i.clientId === clientId)
  if (!item || item.pendingDelete) return false
  if (item.status !== 'synced') return true
  return savedAt(item) > Date.now() - CARDIO_UNDO_WINDOW_MS
}

function savedAt(item: PendingCardioLog): number {
  return item.savedAtMs ?? new Date(item.completedAt).getTime()
}

function pruneAgedSynced(items: PendingCardioLog[]): PendingCardioLog[] {
  const cutoff = Date.now() - CARDIO_UNDO_WINDOW_MS
  return items.filter(i => i.status !== 'synced' || savedAt(i) > cutoff)
}

let flushPromise: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let consecutiveFailures = 0

/**
 * Backoff retry — the same shape water-store, grocery-store and set-log-store
 * all use, and the one this queue was missing.
 *
 * Without it a cardio log that failed while ONLINE (a 5xx, a dropped request)
 * sat 'pending' until the next `online` event or the next cardio log — which
 * on a rest day might be days, and on a phone that never goes offline is
 * never. It could not even reach the failed state the offline indicator
 * exists to show, because reaching MAX_ATTEMPTS requires attempts nothing
 * was making.
 */
function scheduleRetry(): void {
  if (typeof window === 'undefined' || retryTimer) return
  const delayMs = Math.min(60_000, 2_000 * 2 ** Math.min(consecutiveFailures, 5))
  retryTimer = setTimeout(() => { retryTimer = null; void flushPending() }, delayMs)
}

export function flushPending(): Promise<void> {
  if (flushPromise) return flushPromise
  // OFFLINE IS NOT A FAILED ATTEMPT. Every other queue in the app checks this
  // and this one did not, so logging cardio in a basement gym burned an
  // attempt per call against MAX_ATTEMPTS — the entry could be marked
  // permanently failed before the phone had ever had a connection to try.
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve()
  flushPromise = doFlush().finally(() => { flushPromise = null })
  return flushPromise
}

async function doFlush(): Promise<void> {
  savePending(pruneAgedSynced(loadPending()))
  const items = loadPending()
  try {
    await syncPass(items)
  } finally {
    if (loadPending().some(i => i.status === 'pending')) scheduleRetry()
  }
}

async function syncPass(items: PendingCardioLog[]): Promise<void> {
  for (const item of items.filter(i => i.status === 'pending')) {
    try {
      const { data, error } = await supabase.from('cardio_logs').insert({
        user_id: item.userId,
        date: item.date,
        activity_name: item.activityName,
        duration_minutes: item.durationMinutes,
        intensity_rpe: item.intensityRpe,
        avg_heart_rate: item.avgHeartRate || null,
        notes: item.notes || null,
        completed_at: item.completedAt,
      }).select('id').single()
      if (error) throw error
      const insertedId = (data as { id: string } | null)?.id
      const current = loadPending()
      const target = current.find(i => i.clientId === item.clientId)
      if (target?.pendingDelete) {
        // Undo raced this insert and lost — honor the undo now that we
        // finally have the row's id to delete it by.
        if (insertedId) await supabase.from('cardio_logs').delete().eq('id', insertedId)
        savePending(current.filter(i => i.clientId !== item.clientId))
      } else if (target) {
        // Kept (not dropped) so a still-fresh entry stays undoable by id —
        // getCardioLogsForDateMerged excludes 'synced' rows from its local
        // side since the server fetch already carries them.
        target.status = 'synced'
        target.id = insertedId
        // INTO THE PHONE'S COPY BEFORE IT STOPS BEING "PENDING", so there is
        // no instant in which a saved log is in neither place.
        if (insertedId) recordSynced({ kind: 'insert', row: { ...serverShape(target), id: insertedId } })
        savePending(current)
      }
      consecutiveFailures = 0
      notify()
    } catch (err) {
      const current = loadPending()
      const target = current.find(i => i.clientId === item.clientId)
      if (target) {
        // A DEAD CONNECTION IS NOT A FAILED ATTEMPT — the same rule the set
        // queue took on 9 Oct 2026 (H20), for the same reason: on a
        // connection that is up but dead (the browser still says online, so
        // the guard in flushPending cannot see it) five tries pass in about a
        // minute, and a perfectly good walk was then marked "didn't save" and
        // left waiting for a tap on Retry. It stays pending and goes the
        // moment a request gets through.
        const noConnection = isConnectionFailure(err)
        if (!noConnection) target.attempts += 1
        target.errorMessage = (err as { message?: string } | null)?.message ?? 'Sync failed'
        if (!noConnection && target.attempts >= MAX_ATTEMPTS) target.status = 'failed'
        savePending(current)
        consecutiveFailures += 1
        notify()
      }
    }
  }
}

// ---------------------------------------------------------------------------
// THE PHONE'S OWN COPY — the cardio half of H20, 9 Oct 2026.
//
// The same hole set-log-store had: a read that failed fell back to the pending
// queue alone, and a log that has synced is not pending — so on a bad
// connection a finisher logged ten minutes ago read back as not logged, and
// the row offered to log it again.
//
// The server's rows are kept here as the phone last saw them: every read that
// lands replaces its own date range, a log is added the moment it syncs, and
// an undone one is taken out. A read that fails answers from this.
//
// A COPY, NOT A SOURCE — every read that lands replaces the range it asked
// for, which is what stops a log deleted on another device living here.
// ---------------------------------------------------------------------------

function loadLastKnown(): Record<string, CardioLog[]> {
  try {
    const raw = localStorage.getItem(LAST_KNOWN_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveLastKnown(all: Record<string, CardioLog[]>): void {
  try {
    localStorage.setItem(LAST_KNOWN_KEY, JSON.stringify(all))
  } catch {
    // A full disk must not cost a log: this is a convenience for a bad
    // connection, and the queue and the server are the record.
  }
}

function isoDaysBefore(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function trimKnown(rows: CardioLog[]): CardioLog[] {
  const newest = rows.reduce((max, r) => (r.date > max ? r.date : max), '')
  const floor = newest ? isoDaysBefore(newest, LAST_KNOWN_DAYS) : ''
  return rows
    .filter(r => r.date >= floor)
    .sort((a, b) => String(b.completed_at ?? '').localeCompare(String(a.completed_at ?? '')))
    .slice(0, LAST_KNOWN_MAX_ROWS)
}

function serverShape(p: PendingCardioLog): CardioLog {
  return {
    id: p.id,
    user_id: p.userId,
    date: p.date,
    activity_name: p.activityName,
    duration_minutes: p.durationMinutes,
    intensity_rpe: p.intensityRpe,
    avg_heart_rate: p.avgHeartRate ?? null,
    notes: p.notes ?? null,
    completed_at: p.completedAt,
  }
}

type SyncedChange = { kind: 'insert'; row: CardioLog } | { kind: 'delete'; id: string }

function applyChange(rows: CardioLog[], change: SyncedChange): CardioLog[] {
  if (change.kind === 'delete') return rows.filter(r => r.id !== change.id)
  return [change.row, ...rows.filter(r => r.id !== change.row.id)]
}

// A read can be answered before a log saves and arrive after it — see the
// same note in set-log-store. Every change that reaches the server is
// numbered, and a read replays the ones that landed while it was in flight.
let syncSeq = 0
let recentlySynced: { seq: number; change: SyncedChange }[] = []

function recordSynced(change: SyncedChange): void {
  syncSeq += 1
  recentlySynced = [...recentlySynced, { seq: syncSeq, change }].slice(-40)
  const all = loadLastKnown()
  if (change.kind === 'insert') {
    all[change.row.user_id] = trimKnown(applyChange(all[change.row.user_id] ?? [], change))
  } else {
    for (const user of Object.keys(all)) all[user] = applyChange(all[user], change)
  }
  saveLastKnown(all)
}

/** A range of days, both ends included. A single day is a range of one. */
interface CardioRange {
  from: string
  to: string
}

/** What a cardio read came back with — the same shape set-log-store's read has, so a caller handles one kind of answer. */
export interface CardioLogsRead {
  rows: CardioLogView[]
  /** `server`: the server answered. `cache`: THE READ FAILED and `rows` is what this phone already knew. */
  source: 'server' | 'cache'
}

/**
 * THE ONE CARDIO READER — H7, H21 and H20 share it.
 *
 * Every cardio log between two dates as this phone knows them: the server's
 * rows (or, when the read fails, the phone's copy of them) with everything
 * still waiting on this phone on top, so a log made a second ago — or one made
 * with no connection — is in the answer.
 *
 * Until 9 Oct 2026 there were three partial readers. The rest-day card read
 * one date and merged the queue. The coach and the streak read fourteen and
 * thirty-five days from the server alone, so a log that had not synced did not
 * exist for the coach ("it hasn't been written down yet"). Session history,
 * the finish card and the training day read nothing at all, which is how a
 * logged finisher and "skipping rope, 12 min" came to appear nowhere. They ask
 * here now, and a screen that shows a cardio log shows the same one every
 * other screen does.
 *
 * NEVER REJECTS, and since H20 it says whether it reached the server instead
 * of returning the same empty list for "nothing logged" and "could not ask".
 */
async function readCardioLogs(userId: string, range: CardioRange): Promise<CardioLogsRead> {
  const startedAtSeq = syncSeq
  let server: CardioLog[] | null = null
  try {
    const { data, error } = await supabase
      .from('cardio_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('date', range.from)
      .lte('date', range.to)
      .order('completed_at', { ascending: false })
    if (!error) server = (data || []) as CardioLog[]
  } catch {
    // Thrown rather than returned — the same failure, the same answer below.
  }

  const inRange = (r: { date: string }) => r.date >= range.from && r.date <= range.to
  let base: CardioLog[]
  if (server) {
    for (const { seq, change } of recentlySynced) {
      if (seq <= startedAtSeq) continue
      if (change.kind === 'insert' && (change.row.user_id !== userId || !inRange(change.row))) continue
      server = applyChange(server, change)
    }
    base = server
    const all = loadLastKnown()
    all[userId] = trimKnown([...(all[userId] ?? []).filter(r => !inRange(r)), ...server])
    saveLastKnown(all)
  } else {
    base = (loadLastKnown()[userId] ?? []).filter(inRange)
  }

  // 'synced' local rows are excluded here — they're already represented by
  // the base rows (kept locally only so deleteCardioLog can undo them by id
  // within CARDIO_UNDO_WINDOW_MS, not for display).
  //
  // A TOMBSTONED ROW IS NOT A LOG. An undo that races an in-flight insert
  // marks the entry `pendingDelete` rather than dropping it (see
  // deleteCardioLog), and this read used to return it anyway — invisible
  // until 24 Sep 2026, when the cardio rows started reading themselves back
  // from here and an undone walk came straight back as "✓ Walk".
  const local = loadPending().filter(i => i.userId === userId && inRange(i))
  const pendingRows = local
    .filter(i => i.status !== 'synced' && !i.pendingDelete)
    .map(pendingToView)
  // AND A SYNCED ROW KEEPS THE HANDLE ITS UNDO NEEDS. The server's copy has no
  // clientId, so without this a row read back from here lost its Undo the
  // moment the network answered — a few hundred milliseconds after the tap,
  // well inside the ten minutes the store promises.
  const clientIdByServerId = new Map(local.filter(i => i.status === 'synced' && i.id).map(i => [i.id!, i.clientId]))
  const tombstoned = new Set(local.filter(i => i.pendingDelete && i.id).map(i => i.id!))
  return {
    rows: [
      ...pendingRows,
      ...base
        .filter(r => !(r.id && tombstoned.has(r.id)))
        .map(r => ({ ...r, clientId: (r.id && clientIdByServerId.get(r.id)) || undefined, syncStatus: 'synced' as const })),
    ],
    source: server ? 'server' : 'cache',
  }
}

/** One day through the one reader. */
export function readCardioLogsForDate(userId: string, date: string): Promise<CardioLogsRead> {
  return readCardioLogs(userId, { from: date, to: date })
}

/** Server rows + pending (not-yet-synced or failed) rows for one date, so the UI always sees its own writes. The rows of readCardioLogsForDate, for a caller that has nothing to say about a failed read. */
export async function getCardioLogsForDateMerged(userId: string, date: string): Promise<CardioLogView[]> {
  return (await readCardioLogsForDate(userId, date)).rows
}

/**
 * THE DEFAULT ON A ONE-TAP CHIP IS THE PERSON'S OWN LAST ANSWER, not 30.
 *
 * The rest-day card logs Walk / Cycle / Swim in a single tap, which means the
 * duration is chosen FOR them — so it has to be a number they have actually
 * done rather than a house average. Somebody whose walk is always fifty
 * minutes should not have to correct the app every Sunday.
 *
 * Reads the pending queue as well as the server, for the same reason
 * getCardioLogsForDateMerged does: a log written a moment ago has not synced,
 * and a chip that forgets the tap you just made is worse than one that never
 * remembered. Pending rows win when they are newer.
 *
 * `select('*')` rather than a column list, per missing-column.ts: naming a
 * column is a migration dependency, and a failure here must cost the default
 * rather than the screen. A throw is impossible — it falls back to whatever
 * the local queue knows, and then to nothing.
 *
 * Matching is case-insensitive on the WHOLE name. It is deliberately not a
 * substring or fuzzy match: "Walk" must not inherit the duration of "Walk the
 * dog" or "Sled walk", which are different efforts. The chips write the same
 * literals they read, so a chip always finds its own history.
 */
export async function getRecentActivityDurations(
  userId: string,
  activityNames: readonly string[],
): Promise<Record<string, number>> {
  const wanted = new Map(activityNames.map(n => [n.trim().toLowerCase(), n]))
  /** name -> { minutes, at } for the newest entry seen so far. */
  const best = new Map<string, { minutes: number; at: number }>()

  const consider = (name: unknown, minutes: unknown, at: unknown) => {
    const key = String(name ?? '').trim().toLowerCase()
    if (!wanted.has(key)) return
    const mins = Number(minutes)
    if (!isPlausibleCardioDuration(mins)) return
    const when = Date.parse(String(at ?? '')) || 0
    const prev = best.get(key)
    if (!prev || when >= prev.at) best.set(key, { minutes: mins, at: when })
  }

  try {
    const { data, error } = await supabase
      .from('cardio_logs')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(200)
    if (error) throw error
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      consider(row.activity_name, row.duration_minutes, row.completed_at)
    }
  } catch {
    // Offline or a transient failure — the local queue below still answers,
    // and an unanswered chip simply shows the fallback.
  }

  for (const item of loadPending()) {
    if (item.userId !== userId) continue
    consider(item.activityName, item.durationMinutes, item.completedAt)
  }

  const out: Record<string, number> = {}
  for (const [key, original] of wanted) {
    const hit = best.get(key)
    if (hit) out[original] = roundToNearestFive(hit.minutes)
  }
  return out
}

/** Nearest 5, never below 5 — a chip reading "37 min" looks like a bug, and 0 would be refused by the store anyway. */
export function roundToNearestFive(minutes: number): number {
  return Math.max(5, Math.round(minutes / 5) * 5)
}

/** What a chip offers when this person has never logged that activity. */
export const DEFAULT_ACTIVITY_MINUTES = 30

export function getPendingCardioFailures(): CardioLogView[] {
  return loadPending().filter(i => i.status === 'failed').map(pendingToView)
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { consecutiveFailures = 0; void flushPending() })
  // Going offline changes what the offline indicator should be showing even
  // though the queue itself is unchanged — the same pairing water-store makes.
  window.addEventListener('offline', () => notify())
}
