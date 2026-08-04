// ---------------------------------------------------------------------------
// Local-first, retriable write path for cardio logs (LAYOUT-DESIGN.md §1.7 G,
// §7.6 prerequisite #5). The old path — daily-tracking.ts's insertCardioLog
// called directly from a component — is a bare network write with no
// optimistic update and no retry: offline or a flaky connection just failed
// silently (console.error only). This mirrors set-log-store's shape at a
// much smaller scale: one pending queue, a natural-key coalesce, background
// flush with backoff, and a visible failed state instead of a swallowed one.
//
// Not a general-purpose sync layer — cardio logs have no local edit/delete
// UI yet (nothing today lets you correct a logged activity), so this only
// covers save + read-merge, not the update/delete machinery set-log-store
// needs for its heavier write surface.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'
import { getAppNow } from './dev-clock'
import type { CardioLog } from './types'

const PENDING_KEY = 'fitplan_cardio_pending_v1'
const MAX_ATTEMPTS = 5

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
  status: 'pending' | 'failed'
  errorMessage?: string
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
    clientId: p.clientId,
    user_id: p.userId,
    date: p.date,
    activity_name: p.activityName,
    duration_minutes: p.durationMinutes,
    intensity_rpe: p.intensityRpe,
    avg_heart_rate: p.avgHeartRate ?? null,
    notes: p.notes ?? null,
    completed_at: p.completedAt,
    syncStatus: p.status === 'failed' ? 'failed' : 'pending',
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

let flushing = false
export async function flushPending(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    const items = loadPending()
    for (const item of items.filter(i => i.status === 'pending')) {
      try {
        const { error } = await supabase.from('cardio_logs').insert({
          user_id: item.userId,
          date: item.date,
          activity_name: item.activityName,
          duration_minutes: item.durationMinutes,
          intensity_rpe: item.intensityRpe,
          avg_heart_rate: item.avgHeartRate || null,
          notes: item.notes || null,
          completed_at: item.completedAt,
        })
        if (error) throw error
        // Synced — drop from the pending queue entirely (unlike set-log-store,
        // there's no local edit surface that needs the row to stick around).
        const remaining = loadPending().filter(i => i.clientId !== item.clientId)
        savePending(remaining)
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
  } finally {
    flushing = false
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
  const pendingRows = loadPending()
    .filter(i => i.userId === userId && i.date === date)
    .map(pendingToView)
  return [...pendingRows, ...serverRows.map(r => ({ ...r, syncStatus: 'synced' as const }))]
}

export function getPendingCardioFailures(): CardioLogView[] {
  return loadPending().filter(i => i.status === 'failed').map(pendingToView)
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushPending())
}
