// ---------------------------------------------------------------------------
// THE WATCH'S STEPS AND DISTANCE WHILE A WALK OR RUN RUNS (his report 28 Nov 2026, "The watch and phone steps disagree
// with each other": the phone's card said 1,180 steps at 19:32 while the watch said 2,138 at 19:40, and the summary
// said 2,090 and 1.47 km against the watch's 1.80 km).
//
// Three counters were on screen for one walk: the phone's own step sensor on the live card, the watch's on the wrist,
// and the phone's health store at End. The watch is on the wrist the whole walk, so when it is recording the same
// workout ITS STEPS are the walk's: on the live card, in the summary and in the log, whichever End is tapped first.
// DISTANCE: the watch's own GPS ROUTE LENGTH, and only when it is a real route (at least 200 m, its points spanning
// at least half the workout: WorkoutService.realRouteMetres), wins over the health store's; the watch's other distance
// (Health Services' DISTANCE_TOTAL) only fills a store that has none. The lead's review: the two distances differ for
// reasons nobody here can measure, and a measured track is the one source with a basis of its own. CALORIES follow the
// same freshness and End rule (session-calories.ts asks here).
//
// A COUNT IS ONLY THE WALK'S WHEN IT IS FROM THE END OF THE WALK (review, 28 Nov 2026): a watch that died or lost the
// phone at 5 minutes holds a 5-minute count, which must never beat a complete figure; and ending on the phone does not
// end the watch, so counts sent after End are not the walk's. So the store keeps the count over time, and a reading is
// "the watch's figure at moment T" only when the watch sent one within FRESH_MS before T.
//
// The watch sends its running count with its heart rate every few seconds (WorkoutService.sendBatch), stamped with the
// watch's own time. Kept on the phone so a reopened app still has it; never saved to the database from here.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from 'react'

const KEY = 'fitplan_watch_cardio_live'
/** The same workout: the same name (any case), started within two minutes. One rule for every watch path. */
export const SAME_START_MS = 120_000
/** A count is the walk's at a moment only if the watch sent it at most this long before that moment. */
const FRESH_MS = 60_000
/** One kept reading per this much time (the newest always kept), so an hour's walk stays small. */
const KEEP_EVERY_MS = 15_000
const MAX_POINTS = 600

/** [watch time ms, steps, Health Services' distance in metres, the GPS route's own length in metres, calories] */
type Point = [number, number | null, number | null, number | null, number | null]
interface Kept { activity: string; startedAt: number; points: Point[] }

export interface WatchCardioReading {
  steps: number | null
  /** The watch's DISTANCE_TOTAL (Health Services: stride-based, GPS-assisted where it has a fix). */
  distanceM: number | null
  /** The length of the watch's own GPS route, sent only when it is a real route (WorkoutService.realRouteMetres). */
  routeM: number | null
  kcal: number | null
  at: number
}

/** Steps a recording may carry: 1 to 200,000 (activity-figures.ts's bound). A zero is "nothing counted". */
export function watchSteps(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 200_000 ? Math.round(v) : null
}
/** Metres a recording may carry: 10 m to 500 km (the database's bound). */
export function watchMetres(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 10 && v <= 500_000 ? v : null
}

/** Calories a recording may carry: 1 to 10,000 (activity-figures.ts's bound). A zero is "nothing counted". */
export function watchKcal(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 10_000 ? Math.round(v) : null
}

/** One workout, two sightings of it: the same name, ignoring case and spaces before and after it, started within two minutes. */
export function sameWorkout(nameA: string | null | undefined, startA: number, nameB: string | null | undefined, startB: number): boolean {
  if (!Number.isFinite(startA) || !Number.isFinite(startB)) return false
  return (nameA ?? '').trim().toLowerCase() === (nameB ?? '').trim().toLowerCase() && (nameA ?? '').trim() !== '' && Math.abs(startA - startB) < SAME_START_MS
}

let cached: Kept | null | undefined
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }

function read(): Kept | null {
  if (cached !== undefined) return cached
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Kept> | null
    cached = v && typeof v.activity === 'string' && typeof v.startedAt === 'number' && Array.isArray(v.points)
      ? { activity: v.activity, startedAt: v.startedAt, points: (v.points.filter(p => Array.isArray(p) && typeof p[0] === 'number') as unknown[][]).map(p => [p[0], p[1] ?? null, p[2] ?? null, p[3] ?? null, p[4] ?? null] as Point) }
      : null
  } catch { cached = null }
  return cached
}

/**
 * Sorted by the watch's own time (so a batch held back and arriving late never stands in for a later one), thinned.
 * No "never lower" rule beyond that: the watch's count only rises within a workout, and a rule for it was measured
 * inert (a mutation removing it changed nothing), so it is not kept.
 */
function settle(points: Point[]): Point[] {
  const rising = [...points].sort((a, b) => a[0] - b[0])
  const kept: Point[] = []
  for (let i = rising.length - 1; i >= 0; i--) {
    if (kept.length === 0 || kept[kept.length - 1][0] - rising[i][0] >= KEEP_EVERY_MS) kept.push(rising[i])
    if (kept.length >= MAX_POINTS) break
  }
  return kept.reverse()
}

/**
 * A running-count message from the watch (an "hr" batch of a cardio workout). Its time is the watch's own stamp
 * (`at`), else its newest heart reading, else when the phone took it.
 */
export function noteWatchCardioLive(e: Record<string, unknown>, now: number = Date.now()): void {
  if (e.kind !== 'cardio' || typeof e.activity !== 'string') return
  const startedAt = typeof e.startedAt === 'number' && Number.isFinite(e.startedAt) ? e.startedAt : null
  const steps = watchSteps(e.steps), distanceM = watchMetres(e.distanceM), routeM = watchMetres(e.routeM), kcal = watchKcal(e.kcal)
  if (startedAt == null || (steps == null && distanceM == null && routeM == null && kcal == null)) return
  const sampleTimes = Array.isArray(e.samples) ? (e.samples as unknown[]).map(s => (Array.isArray(s) ? Number(s[0]) : NaN)).filter(Number.isFinite) : []
  const at = typeof e.at === 'number' && Number.isFinite(e.at) ? e.at : sampleTimes.length ? Math.max(...sampleTimes) : now
  const before = read()
  const same = !!before && sameWorkout(before.activity, before.startedAt, e.activity, startedAt)
  const next: Kept = {
    activity: e.activity, startedAt,
    points: settle([...(same ? before!.points : []), [at, steps, distanceM, routeM, kcal]]),
  }
  cached = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* still held for this run */ }
  emit()
}

/**
 * THE WATCH'S CLOCK: `at` is the watch's own time and End is the phone's. A Galaxy Watch takes its time from the
 * phone, so they agree to about a second; an offset beyond FRESH_MS would make every count read as quiet (or after
 * End) and the phone's own figures would stand, never a wrong one (test:recorded-activity holds both directions).
 *
 * The watch's figures for this workout at moment `atMs`: its last count at or before then, and only if that count is
 * at most FRESH_MS old. Null when no watch recorded it, or the watch had gone quiet.
 */
export function watchCardioAt(activity: string, startedAtIso: string, atMs: number): WatchCardioReading | null {
  const v = read()
  if (!v || !sameWorkout(v.activity, v.startedAt, activity, Date.parse(startedAtIso))) return null
  let last: Point | null = null
  for (const p of v.points) if (p[0] <= atMs) last = p
  if (!last || atMs - last[0] > FRESH_MS) return null
  return reading(last)
}

const reading = (p: Point): WatchCardioReading => ({ steps: p[1], distanceM: p[2], routeM: p[3], kcal: p[4], at: p[0] })

/** While it runs: the watch's NEWEST count, unless it is more than FRESH_MS older than `now` (the watch went quiet). */
function watchCardioLatest(activity: string, startedAtIso: string, now: number): WatchCardioReading | null {
  const v = read()
  if (!v || !sameWorkout(v.activity, v.startedAt, activity, Date.parse(startedAtIso))) return null
  const last = v.points[v.points.length - 1]
  if (!last || now - last[0] > FRESH_MS) return null
  return reading(last)
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
/** The watch's live steps for the open workout at `now`, or null (none, or the watch has gone quiet). */
export function useWatchCardioSteps(activity: string | null, startedAtIso: string | null, now: number): number | null {
  return useSyncExternalStore(subscribe, () => (activity && startedAtIso ? watchCardioLatest(activity, startedAtIso, now)?.steps ?? null : null), () => null)
}

/** Tests only. */
export function __resetWatchCardioLiveForTests(): void { cached = undefined; try { localStorage.removeItem(KEY) } catch { /* none */ } }
