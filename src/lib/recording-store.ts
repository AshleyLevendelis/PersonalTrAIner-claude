// ---------------------------------------------------------------------------
// THE OPEN RECORDING, AND NOTHING ELSE (split out of activity-recording.ts on 27 Nov 2026). Exercise asks "is a cardio
// workout open?" every time it draws, so this part is in the app's first download; the recorder that reads the phone
// and writes the log (activity-recording.ts) is downloaded when one is started or shown. Kept on the phone
// (localStorage) until it is logged or thrown away.
// ---------------------------------------------------------------------------
import { useSyncExternalStore } from 'react'

export interface Recording {
  /** What he picked, as the log will be called: "Walk", "Hill Sprints", "Assault Bike". */
  activity: string
  startedAt: string
  /** Set by End. Until then the clock runs. */
  endedAt?: string
}

const KEY = 'fitplan_activity_recording'

const listeners = new Set<() => void>()
let cached: Recording | null | undefined
let cachedRaw: string | null | undefined

export function readRecording(): Recording | null {
  let raw: string | null = null
  try { raw = localStorage.getItem(KEY) } catch { raw = null }
  if (raw === cachedRaw && cached !== undefined) return cached
  cachedRaw = raw
  try {
    const r = raw ? JSON.parse(raw) as Partial<Recording> & { kind?: string } : null
    // A recording begun before 27 Nov 2026 was kept as one of two kinds: it is still his walk or his run.
    const activity = typeof r?.activity === 'string' && r.activity.trim() ? r.activity.trim().slice(0, 40)
      : r?.kind === 'walk' ? 'Walk' : r?.kind === 'run' ? 'Run' : null
    cached = r && activity && typeof r.startedAt === 'string' && !Number.isNaN(Date.parse(r.startedAt))
      ? { activity, startedAt: r.startedAt, ...(typeof r.endedAt === 'string' && !Number.isNaN(Date.parse(r.endedAt)) ? { endedAt: r.endedAt } : {}) }
      : null
  } catch { cached = null }
  return cached
}
export function writeRecording(r: Recording | null): void {
  try { if (r) localStorage.setItem(KEY, JSON.stringify(r)); else localStorage.removeItem(KEY) } catch { /* the screen still follows */ }
  cached = undefined
  for (const l of listeners) l()
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
export function useRecording(): Recording | null {
  return useSyncExternalStore(subscribe, readRecording, () => null)
}
