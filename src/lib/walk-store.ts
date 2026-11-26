// The walk as it is kept on the phone (walk-session.ts does the counting). Split out so the day's card can ask "is a
// walk running?" without pulling the health store, the strap and the cardio queue into the first download.
export const WALK_KEY = 'fitplan_walk_v1'

export interface WalkResult {
  startedAt: string
  endedAt: string
  minutes: number
  steps: number | null
  avgHeartRate: number | null
  maxHeartRate: number | null
}

export interface WalkState {
  /** This walk's own tag: a sensor tick or a health read from an earlier walk never lands on a newer one. */
  id: string
  userId: string
  /** The app's date the walk is logged on. */
  date: string
  /** Wall-clock instant of the tap: the health store and the strap are read in real time. */
  startedAt: string
  /** The sensor's steps counted before the app was last closed; a reopened sensor counts from zero again. */
  sensorBase: number
  /** The sensor's steps so far, base included. Null until the sensor has said anything. */
  sensorSteps: number | null
  /** The health store's steps for the walk so far, when it was last asked. */
  storeSteps: number | null
  /** Set once Finish is tapped: the walk waits here for its effort tap. */
  result?: WalkResult
}

const listeners = new Set<() => void>()
export function subscribeWalk(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l) } }

export function activeWalk(): WalkState | null {
  try {
    const raw = localStorage.getItem(WALK_KEY)
    if (!raw) return null
    const w = JSON.parse(raw) as WalkState
    return w && typeof w.id === 'string' && typeof w.startedAt === 'string' && typeof w.userId === 'string' ? w : null
  } catch { return null }
}

export function writeWalk(w: WalkState | null): void {
  try { if (w) localStorage.setItem(WALK_KEY, JSON.stringify(w)); else localStorage.removeItem(WALK_KEY) } catch { /* the walk lives in memory only */ }
  for (const l of listeners) l()
}
