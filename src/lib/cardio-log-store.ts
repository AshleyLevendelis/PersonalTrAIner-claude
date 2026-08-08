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
import type { CardioLog } from './types'

const PENDING_KEY = 'fitplan_cardio_pending_v1'
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
 * Local-first: writes to the pending queue synchronously and returns the
 * view immediately — the UI can show the logged activity before the network
 * round-trip even starts. Coalesces on clientId so a retry never duplicates.
 */
export function saveCardioLog(input: CardioLogInput): CardioLogView {
  const clientId = generateClientId()
  const pending: PendingCardioLog = {
    ...input,
    clientId,
    completedAt: getAppNow(input.userId).toISOString(),
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
  }
  savePending(loadPending().filter(i => i.clientId !== clientId))
  notify()
}

function pruneAgedSynced(items: PendingCardioLog[]): PendingCardioLog[] {
  const cutoff = Date.now() - CARDIO_UNDO_WINDOW_MS
  return items.filter(i => i.status !== 'synced' || new Date(i.completedAt).getTime() > cutoff)
}

let flushPromise: Promise<void> | null = null
export function flushPending(): Promise<void> {
  if (flushPromise) return flushPromise
  flushPromise = doFlush().finally(() => { flushPromise = null })
  return flushPromise
}

async function doFlush(): Promise<void> {
  savePending(pruneAgedSynced(loadPending()))
  const items = loadPending()
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
        savePending(current)
      }
      notify()
    } catch (err) {
      const current = loadPending()
      const target = current.find(i => i.clientId === item.clientId)
      if (target) {
        target.attempts += 1
        target.errorMessage = err instanceof Error ? err.message : 'Sync failed'
        if (target.attempts >= MAX_ATTEMPTS) target.status = 'failed'
        savePending(current)
        notify()
      }
    }
  }
}

/** Server rows + pending (not-yet-synced or failed) rows for one date, so the UI always sees its own writes. */
export async function getCardioLogsForDateMerged(userId: string, date: string): Promise<CardioLogView[]> {
  let serverRows: CardioLog[] = []
  try {
    const { data, error } = await supabase
      .from('cardio_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .order('completed_at', { ascending: false })
    if (error) throw error
    serverRows = (data || []) as CardioLog[]
  } catch {
    // Offline or transient failure — pending-only view, never throws.
  }
  // 'synced' local rows are excluded here — they're already represented by
  // serverRows below (kept locally only so deleteCardioLog can undo them by
  // id within CARDIO_UNDO_WINDOW_MS, not for display).
  const pendingRows = loadPending()
    .filter(i => i.userId === userId && i.date === date && i.status !== 'synced')
    .map(pendingToView)
  return [...pendingRows, ...serverRows.map(r => ({ ...r, syncStatus: 'synced' as const }))]
}

export function getPendingCardioFailures(): CardioLogView[] {
  return loadPending().filter(i => i.status === 'failed').map(pendingToView)
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushPending())
}
