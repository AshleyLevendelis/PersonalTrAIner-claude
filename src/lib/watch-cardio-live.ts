// ---------------------------------------------------------------------------
// THE WATCH'S STEPS AND DISTANCE WHILE A WALK OR RUN RUNS (his report 28 Nov 2026, "The watch and phone steps disagree
// with each other": the phone's card said 1,180 steps at 19:32 while the watch said 2,138 at 19:40, and the summary
// said 2,090 and 1.47 km against the watch's 1.80 km).
//
// Three counters were on screen for one walk: the phone's own step sensor on the live card, the watch's on the wrist,
// and the phone's health store at End. The watch is on the wrist the whole walk, so when it is recording the same
// workout ITS steps and distance are the walk's: on the live card, in the summary, and in the log, whichever End is
// tapped first (watch-bridge.ts already let the watch win when it ended first; ending on the phone first had kept the
// health store's figures). The phone's own counter and the health store are the fallback when no watch is recording.
//
// The watch sends its running count with its heart rate every few seconds (WorkoutService.sendBatch), so this holds
// the latest count for the workout it belongs to. Kept on the phone so a reopened app still has it; never saved to the
// database from here.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from 'react'

const KEY = 'fitplan_watch_cardio_live'
/** The same workout: the same name, started within two minutes (the rule watch-bridge.ts matches a log by). */
const SAME_START_MS = 120_000

export interface WatchCardioLive { activity: string; startedAt: number; steps: number | null; distanceM: number | null; at: number }

let cached: WatchCardioLive | null | undefined
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }

const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)

function read(): WatchCardioLive | null {
  if (cached !== undefined) return cached
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<WatchCardioLive> | null
    cached = v && typeof v.activity === 'string' && typeof v.startedAt === 'number'
      ? { activity: v.activity, startedAt: v.startedAt, steps: count(v.steps), distanceM: count(v.distanceM), at: Number(v.at) || 0 }
      : null
  } catch { cached = null }
  return cached
}

/** A running-count message from the watch (an "hr" batch of a cardio workout). Ignores anything without a count. */
export function noteWatchCardioLive(e: Record<string, unknown>, now: number = Date.now()): void {
  if (e.kind !== 'cardio' || typeof e.activity !== 'string') return
  const startedAt = typeof e.startedAt === 'number' && Number.isFinite(e.startedAt) ? e.startedAt : null
  const steps = count(e.steps), distanceM = count(e.distanceM)
  if (startedAt == null || (steps == null && distanceM == null)) return
  const before = read()
  const same = before && before.activity === e.activity && before.startedAt === startedAt
  // A count never goes backwards within one workout: a batch that waited on the watch can arrive after a newer one.
  const next: WatchCardioLive = {
    activity: e.activity, startedAt, at: now,
    steps: same && before.steps != null && (steps == null || steps < before.steps) ? before.steps : steps,
    distanceM: same && before.distanceM != null && (distanceM == null || distanceM < before.distanceM) ? before.distanceM : distanceM,
  }
  cached = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* still held for this run */ }
  emit()
}

/** The watch's count for this workout (the same name, started within two minutes), or null when no watch recorded it. */
export function watchCardioFor(activity: string, startedAtIso: string): WatchCardioLive | null {
  const v = read()
  const start = Date.parse(startedAtIso)
  if (!v || !Number.isFinite(start)) return null
  if (v.activity.trim().toLowerCase() !== activity.trim().toLowerCase() || Math.abs(v.startedAt - start) >= SAME_START_MS) return null
  return v
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
/** The watch's live steps for the open workout, or null. */
export function useWatchCardioSteps(activity: string | null, startedAtIso: string | null): number | null {
  return useSyncExternalStore(subscribe, () => (activity && startedAtIso ? watchCardioFor(activity, startedAtIso)?.steps ?? null : null), () => null)
}

/** Tests only. */
export function __resetWatchCardioLiveForTests(): void { cached = undefined; try { localStorage.removeItem(KEY) } catch { /* none */ } }
