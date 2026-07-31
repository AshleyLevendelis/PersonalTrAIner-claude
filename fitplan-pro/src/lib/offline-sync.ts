import { supabase } from './supabase'

export interface QueuedSetLog {
  id: string
  user_id: string
  exercise_plan_id?: string | null
  exercise_name: string
  week_number: number
  day: string
  set_number: number
  weight_kg: number
  reps_completed: number
  rpe?: number | null
  queued_at: string
}

export interface SyncState {
  isOnline: boolean
  isSyncing: boolean
  queuedCount: number
}

const QUEUE_KEY = 'offline_log_queue'
const SESSION_CACHE_KEY = 'active_session_cache'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function getQueue(): QueuedSetLog[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveQueue(queue: QueuedSetLog[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

export function enqueue(log: Omit<QueuedSetLog, 'id' | 'queued_at'>): void {
  const queue = getQueue()
  queue.push({ ...log, id: generateId(), queued_at: new Date().toISOString() })
  saveQueue(queue)
  notifyListeners()
}

export function enqueueMany(logs: Omit<QueuedSetLog, 'id' | 'queued_at'>[]): void {
  const queue = getQueue()
  for (const log of logs) {
    queue.push({ ...log, id: generateId(), queued_at: new Date().toISOString() })
  }
  saveQueue(queue)
  notifyListeners()
}

async function flushQueue(): Promise<{ synced: number; failed: number }> {
  const queue = getQueue()
  if (queue.length === 0) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0
  const remaining: QueuedSetLog[] = []

  const batchSize = 20
  for (let i = 0; i < queue.length; i += batchSize) {
    const batch = queue.slice(i, i + batchSize)
    const rows = batch.map(item => ({
      user_id: item.user_id,
      exercise_plan_id: item.exercise_plan_id || null,
      exercise_name: item.exercise_name,
      week_number: item.week_number,
      day: item.day,
      set_number: item.set_number,
      weight_kg: item.weight_kg,
      reps_completed: item.reps_completed,
      rpe: item.rpe || null,
    }))

    try {
      const { error } = await supabase.from('set_logs').insert(rows)
      if (error) {
        remaining.push(...batch)
        failed += batch.length
      } else {
        synced += batch.length
      }
    } catch {
      remaining.push(...batch)
      failed += batch.length
    }
  }

  saveQueue(remaining)
  return { synced, failed }
}

export function logSetOffline(params: {
  userId: string
  exerciseName: string
  exercisePlanId?: string
  weekNumber: number
  day: string
  setNumber: number
  weightKg: number
  repsCompleted: number
  rpe?: number
}): void {
  const payload: Omit<QueuedSetLog, 'id' | 'queued_at'> = {
    user_id: params.userId,
    exercise_plan_id: params.exercisePlanId || null,
    exercise_name: params.exerciseName,
    week_number: params.weekNumber,
    day: params.day,
    set_number: params.setNumber,
    weight_kg: params.weightKg,
    reps_completed: params.repsCompleted,
    rpe: params.rpe || null,
  }

  if (!navigator.onLine) {
    enqueue(payload)
    return
  }

  Promise.resolve(supabase.from('set_logs').insert(payload)).then(({ error }) => {
    if (error) enqueue(payload)
  }).catch(() => {
    enqueue(payload)
  })
}

export function logEntireSessionOffline(params: {
  userId: string
  weekNumber: number
  day: string
  exercises: Array<{
    name: string
    sets: number
    reps: string
    weight_kg: number
    exercisePlanId?: string
  }>
}): void {
  const parseHigh = (reps: string) => {
    const match = reps.match(/(\d+)\s*-\s*(\d+)/)
    if (match) return parseInt(match[2])
    return parseInt(reps) || 10
  }

  const rows: Omit<QueuedSetLog, 'id' | 'queued_at'>[] = params.exercises.flatMap(ex =>
    Array.from({ length: ex.sets }, (_, i) => ({
      user_id: params.userId,
      exercise_plan_id: ex.exercisePlanId || null,
      exercise_name: ex.name,
      week_number: params.weekNumber,
      day: params.day,
      set_number: i + 1,
      weight_kg: ex.weight_kg,
      reps_completed: parseHigh(ex.reps),
      rpe: null,
    }))
  )

  if (!navigator.onLine) {
    enqueueMany(rows)
    return
  }

  const dbRows = rows.map(r => ({
    user_id: r.user_id,
    exercise_plan_id: r.exercise_plan_id,
    exercise_name: r.exercise_name,
    week_number: r.week_number,
    day: r.day,
    set_number: r.set_number,
    weight_kg: r.weight_kg,
    reps_completed: r.reps_completed,
    rpe: r.rpe,
  }))

  Promise.resolve(supabase.from('set_logs').insert(dbRows)).then(({ error }) => {
    if (error) enqueueMany(rows)
  }).catch(() => {
    enqueueMany(rows)
  })
}

export function saveSessionCache(data: {
  completedSets: Record<string, boolean>
  setWeights: Record<string, number>
  setReps: Record<string, number>
  sessionLogged: boolean
  day: string
  weekNumber: number
}): void {
  localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() }))
}

export function loadSessionCache(): {
  completedSets: Record<string, boolean>
  setWeights: Record<string, number>
  setReps: Record<string, number>
  sessionLogged: boolean
  day: string
  weekNumber: number
} | null {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' })
    if (data.day !== today) {
      localStorage.removeItem(SESSION_CACHE_KEY)
      return null
    }
    return data
  } catch {
    return null
  }
}

export function clearSessionCache(): void {
  localStorage.removeItem(SESSION_CACHE_KEY)
}

export type SyncListener = (state: SyncState) => void

let listeners: SyncListener[] = []
let syncState: SyncState = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,
  queuedCount: 0,
}

function notifyListeners(): void {
  syncState.queuedCount = getQueue().length
  listeners.forEach(fn => fn({ ...syncState }))
}

export function subscribeSyncState(listener: SyncListener): () => void {
  listeners.push(listener)
  listener({ ...syncState })
  return () => {
    listeners = listeners.filter(l => l !== listener)
  }
}

export function getSyncState(): SyncState {
  return { ...syncState, queuedCount: getQueue().length }
}

async function handleOnline(): Promise<void> {
  syncState.isOnline = true
  notifyListeners()
  const queue = getQueue()
  if (queue.length === 0) return

  syncState.isSyncing = true
  notifyListeners()
  await flushQueue()
  syncState.isSyncing = false
  notifyListeners()
}

function handleOffline(): void {
  syncState.isOnline = false
  notifyListeners()
}

let initialized = false

export function initOfflineSync(): void {
  if (initialized) return
  initialized = true

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  syncState.isOnline = navigator.onLine
  syncState.queuedCount = getQueue().length

  if (navigator.onLine && syncState.queuedCount > 0) {
    handleOnline()
  }
}
