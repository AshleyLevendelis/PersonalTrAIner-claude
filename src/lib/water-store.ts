// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §5.3 — the one writer for water_logs. Local-first,
// modeled directly on grocery-store.ts's pending-queue/dead-letter shape:
// tap-to-log happens in bursts (several taps across a day, often away from
// good signal), the same "survive a mid-write connectivity drop" problem
// set-log-store/grocery-store's queue already solves.
//
// One row per LOG (not one row per day with a running total) — mirrors
// meal_events' append-only ledger shape. Today's total is a sum over rows;
// undo removes exactly the row a receipt named, never decrements a shared
// counter.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'

export interface WaterLogRow {
  id: string
  profile_id: string
  date: string
  amount_ml: number
  source: 'manual' | 'chat'
  client_id: string | null
  created_at: string
}

const PENDING_KEY = 'fitplan_water_pending_v1'
const DEAD_LETTER_KEY = 'fitplan_water_deadletter_v1'
const MAX_SYNC_ATTEMPTS = 5

interface PendingLog {
  id: string
  profileId: string
  date: string
  amountMl: number
  source: 'manual' | 'chat'
  createdAt: string
  attempts: number
}
interface PendingDelete {
  id: string
  profileId: string
  attempts: number
}
type PendingOp = { kind: 'upsert'; log: PendingLog } | { kind: 'delete'; del: PendingDelete }

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined'
}
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
function opId(op: PendingOp): string {
  return op.kind === 'upsert' ? op.log.id : op.del.id
}
function loadPending(): PendingOp[] {
  if (!hasStorage()) return []
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]') } catch { return [] }
}
function savePending(ops: PendingOp[]): void {
  if (!hasStorage()) return
  localStorage.setItem(PENDING_KEY, JSON.stringify(ops))
}
interface DeadLetterItem { op: PendingOp; reason: 'permanent' | 'max-attempts'; errorMessage: string; failedAt: string }
function loadDeadLetter(): DeadLetterItem[] {
  if (!hasStorage()) return []
  try { return JSON.parse(localStorage.getItem(DEAD_LETTER_KEY) || '[]') } catch { return [] }
}
function saveDeadLetter(items: DeadLetterItem[]): void {
  if (!hasStorage()) return
  localStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(items))
}
function moveToDeadLetter(op: PendingOp, error: unknown, reason: DeadLetterItem['reason']): void {
  const errorMessage = (error as { message?: string } | null)?.message ?? String(error)
  saveDeadLetter([...loadDeadLetter(), { op, reason, errorMessage, failedAt: new Date().toISOString() }])
  savePending(loadPending().filter(o => opId(o) !== opId(op)))
}
function classifyError(error: unknown): 'network' | 'permanent' {
  return (error as { code?: string } | null)?.code ? 'permanent' : 'network'
}

let listeners: Array<() => void> = []
function notifyListeners(): void { listeners.forEach(fn => fn()) }
export function subscribeWaterStore(fn: () => void): () => void {
  listeners.push(fn)
  return () => { listeners = listeners.filter(l => l !== fn) }
}

// ---------------------------------------------------------------------------
// Dead-letter surface (audit §3.5)
//
// This queue could exhaust its five attempts and drop a log permanently with
// NOTHING shown anywhere in the app. Four of the five local-first queues were
// in that state; only logged sets had a screen. The trio below mirrors
// set-log-store's exactly so one indicator can read every queue through the
// same shape, while each store still owns its own key and its own op format —
// the alternative, an indicator that reached into five different localStorage
// layouts itself, is five copies of a rule waiting to drift.
// ---------------------------------------------------------------------------

/** Display-friendly summary of a permanently-failed water op. */
export interface WaterDeadLetterSummary {
  clientId: string
  label: string
  date: string
  reason: DeadLetterItem['reason']
  errorMessage: string
  failedAt: string
}

export function getDeadLetterItems(): WaterDeadLetterSummary[] {
  return loadDeadLetter().map(i => ({
    clientId: opId(i.op),
    label: i.op.kind === 'upsert' ? `${i.op.log.amountMl} ml` : 'Removed log',
    date: i.op.kind === 'upsert' ? i.op.log.date : '',
    reason: i.reason,
    errorMessage: i.errorMessage,
    failedAt: i.failedAt,
  }))
}

/** Re-queues a failed op with its attempt count zeroed, then kicks a flush. */
export function retryDeadLetterItem(clientId: string): void {
  const items = loadDeadLetter()
  const item = items.find(i => opId(i.op) === clientId)
  if (!item) return
  saveDeadLetter(items.filter(i => i !== item))
  const fresh: PendingOp = item.op.kind === 'upsert'
    ? { kind: 'upsert', log: { ...item.op.log, attempts: 0 } }
    : { kind: 'delete', del: { ...item.op.del, attempts: 0 } }
  savePending([...loadPending().filter(o => opId(o) !== clientId), fresh])
  notifyListeners()
  void flushPending()
}

/** Permanently discards a failed op — the user chose not to retry it. */
export function discardDeadLetterItem(clientId: string): void {
  saveDeadLetter(loadDeadLetter().filter(i => opId(i.op) !== clientId))
  notifyListeners()
}

function pendingLogToRow(log: PendingLog): WaterLogRow {
  return { id: log.id, profile_id: log.profileId, date: log.date, amount_ml: log.amountMl, source: log.source, client_id: log.id, created_at: log.createdAt }
}

function mergePendingForProfile(profileId: string, serverRows: WaterLogRow[]): WaterLogRow[] {
  const byId = new Map(serverRows.map(r => [r.id, r]))
  for (const op of loadPending()) {
    if (op.kind === 'upsert') {
      if (op.log.profileId !== profileId) continue
      byId.set(op.log.id, pendingLogToRow(op.log))
    } else {
      if (op.del.profileId !== profileId) continue
      byId.delete(op.del.id)
    }
  }
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

/** All water logs for a profile — server + pending merged. Never throws offline. */
export async function getAllLogs(profileId: string): Promise<WaterLogRow[]> {
  try {
    const { data, error } = await supabase.from('water_logs').select('*').eq('profile_id', profileId)
    if (error) throw error
    return mergePendingForProfile(profileId, (data ?? []) as WaterLogRow[])
  } catch {
    return mergePendingForProfile(profileId, [])
  }
}

/** Today's logged total in ml — a plain sum over today's rows, never a separately-tracked counter. */
export async function getTotalForDate(profileId: string, date: string): Promise<number> {
  const logs = await getAllLogs(profileId)
  return logs.filter(l => l.date === date).reduce((sum, l) => sum + l.amount_ml, 0)
}

function enqueueUpsert(log: PendingLog): void {
  const ops = loadPending().filter(op => opId(op) !== log.id)
  ops.push({ kind: 'upsert', log })
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

/** Logs one entry, local-first — returns immediately, no network wait. */
export function logWater(input: { profileId: string; date: string; amountMl: number; source: 'manual' | 'chat' }): WaterLogRow {
  const log: PendingLog = { id: generateId(), profileId: input.profileId, date: input.date, amountMl: input.amountMl, source: input.source, createdAt: new Date().toISOString(), attempts: 0 }
  enqueueUpsert(log)
  return pendingLogToRow(log)
}

/** Undo for a just-logged entry — removes exactly the row logWater created. */
export function undoLog(row: WaterLogRow): void {
  enqueueDelete(row.id, row.profile_id)
}

export function deleteLog(row: WaterLogRow): void {
  enqueueDelete(row.id, row.profile_id)
}

// ---------------------------------------------------------------------------
// Background flush — identical shape to grocery-store.ts's doFlush.
// ---------------------------------------------------------------------------

let flushPromise: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let consecutiveFailures = 0

function scheduleRetry(): void {
  if (typeof window === 'undefined' || retryTimer) return
  const delayMs = Math.min(60_000, 2_000 * 2 ** Math.min(consecutiveFailures, 5))
  retryTimer = setTimeout(() => { retryTimer = null; void flushPending() }, delayMs)
}

export function flushPending(): Promise<void> {
  if (flushPromise) return flushPromise
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve()
  if (loadPending().length === 0) return Promise.resolve()
  flushPromise = doFlush().finally(() => { flushPromise = null })
  return flushPromise
}

async function syncUpsert(log: PendingLog): Promise<void> {
  const { error } = await supabase.from('water_logs').upsert({
    id: log.id, profile_id: log.profileId, date: log.date, amount_ml: log.amountMl, source: log.source, client_id: log.id,
  }, { onConflict: 'id' })
  if (error) throw error
}
async function syncDelete(del: PendingDelete): Promise<void> {
  const { error } = await supabase.from('water_logs').delete().eq('id', del.id)
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
        if (op.kind === 'upsert') await syncUpsert(op.log)
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
          const attempts = (target.kind === 'upsert' ? target.log.attempts : target.del.attempts) + 1
          if (target.kind === 'upsert') target.log.attempts = attempts
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
// Water target — a plain profile column, read/written directly (not
// queued: it's an occasional settings edit, not a logging burst — same
// "plain async, not local-first" call memory-store.ts makes for facts).
// ---------------------------------------------------------------------------

export async function setWaterTargetMl(profileId: string, targetMl: number): Promise<void> {
  const { error } = await supabase.from('fitness_profiles').update({ water_target_ml: targetMl }).eq('id', profileId)
  if (error) throw error
}
