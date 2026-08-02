// ---------------------------------------------------------------------------
// Pre-C0 this module owned an offline queue for set_logs writes. That queue —
// and the whole idea of a network-side write path with an offline fallback —
// is gone: set-log-store.ts is now the single, local-first write path for
// logged sets, and it drains any leftover pre-C0 queue on init (see
// migrateLegacyQueue there). What remains here is the ACTIVE-SESSION UI CACHE:
// the completed-set checkmarks / input values ExercisePlan restores when the
// page reloads mid-workout. It's UI state, not log data — log data lives in
// set-log-store's pending store + exercise_set_logs.
// ---------------------------------------------------------------------------

const SESSION_CACHE_KEY = 'active_session_cache'

export interface SessionCacheData {
  completedSets: Record<string, boolean>
  setWeights: Record<string, number>
  setReps: Record<string, number>
  sessionLogged: boolean
  day: string
  weekNumber: number
}

export function saveSessionCache(data: SessionCacheData): void {
  localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() }))
}

export function loadSessionCache(): SessionCacheData | null {
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
