// ---------------------------------------------------------------------------
// WORKOUTS THE WATCH RECORDED (his brief 26 Nov 2026: "with my Samsung Watch, I could just go in, start a workout, and
// it starts recording the time and my heart rate ... log workouts that are not necessarily in the plan").
// docs/plans/watch-data.md.
//
// HE STARTS IT ON THE WATCH; THE APP PICKS IT UP. A phone app cannot start a recording on a Galaxy Watch, and does not
// need to: the watch writes each workout (its type, start, end, distance and calories) to Health Connect / Apple
// Health, and this reads the last two days of them back, READ ONLY. One the app does not already hold is OFFERED on
// Home ("Your watch recorded a 42 min run"), and one effort tap logs it. Nothing is logged unasked: a watch
// auto-detects walks nobody would call a workout, and a log he did not make is the app speaking for him.
//
// NEVER COUNTED TWICE. A watch workout is not offered when the app already holds that time: its own recorded walk or
// run, a workout session, or a cardio log covering half of it; nor when he typed the same activity that day at about
// the same length (a log typed later has no true time to compare). And never again once logged or dismissed.
//
// EFFORT IS ASKED, never chosen for him (his 24 Sep "nothing pre-chooses an effort the app cannot know").
//
// IT IS EXTRA WORK, as his 22 Oct ruling has it for cardio already done: logged beside the plan, never in place of a
// session. Calories burned are shown and never change the food target (activity-figures.ts).
//
// Mine (measurement): under 5 minutes is not offered (auto-detection noise); the look-back is two days, the window the
// heart-rate sync already uses; steps are kept only for a walk, run or hike (on a bike they are noise).
// ---------------------------------------------------------------------------

import type { WatchWorkout } from './health-steps'
import type { BodyForEstimate } from './activity-figures'
import type { CardioLogView } from './cardio-log-store'
import type { EffortKey } from './cardio-effort'

const WATCH_WORKOUTS_CONNECTED_KEY = 'fitplan_health_workouts_connected'
const DISMISSED_KEY = 'fitplan_watch_workouts_dismissed'
export const MIN_OFFER_MINUTES = 5
export const LOOK_BACK_HOURS = 48
/** A watch workout is "already here" when an app session or log covers this share of it. */
const COVERED_SHARE = 0.5
/** A typed log of the same activity that day counts as the same workout within this share of its length. */
const SAME_LENGTH_SHARE = 0.25

export function isWatchWorkoutsConnected(): boolean {
  try { return localStorage.getItem(WATCH_WORKOUTS_CONNECTED_KEY) === '1' } catch { return false }
}
function setConnected(on: boolean): void {
  try { if (on) localStorage.setItem(WATCH_WORKOUTS_CONNECTED_KEY, '1'); else localStorage.removeItem(WATCH_WORKOUTS_CONNECTED_KEY) } catch { /* asked again */ }
}

/** The store's word for a workout, as the app says it. Anything it has no word for is a "Workout". */
const NAMES: Record<string, string> = {
  running: 'Run', runningTreadmill: 'Run', walking: 'Walk', hiking: 'Hike', cycling: 'Cycling', bikingStationary: 'Cycling', handCycling: 'Cycling',
  swimming: 'Swimming', swimmingPool: 'Swimming', swimmingOpenWater: 'Swimming', rowing: 'Rowing', rowingMachine: 'Rowing', elliptical: 'Elliptical',
  stairClimbing: 'Stair climbing', stairClimbingMachine: 'Stair climbing', jumpRope: 'Skipping', highIntensityIntervalTraining: 'Intervals',
  strengthTraining: 'Strength training', traditionalStrengthTraining: 'Strength training', functionalStrengthTraining: 'Strength training', weightlifting: 'Strength training',
  crossTraining: 'Circuit', yoga: 'Yoga', pilates: 'Pilates', boxing: 'Boxing', kickboxing: 'Kickboxing', martialArts: 'Martial arts', dance: 'Dance',
  soccer: 'Football', basketball: 'Basketball', tennis: 'Tennis', badminton: 'Badminton', squash: 'Squash', golf: 'Golf', climbing: 'Climbing',
  rugby: 'Rugby', cricket: 'Cricket', hockey: 'Hockey', skiing: 'Skiing', snowboarding: 'Snowboarding', surfing: 'Surfing',
}
export function watchActivityName(type: string): string {
  return NAMES[type] ?? 'Workout'
}
export function isStrengthWorkout(type: string): boolean {
  return watchActivityName(type) === 'Strength training'
}
// ---------------------------------------------------------------------------
// IS THIS THE SESSION THE PLAN ASKED FOR TODAY? (26 Nov 2026, the summary's "planned versus done".) A run the watch
// recorded on a day whose plan is an easy jog IS that jog; a swim on that day is something extra. Decided by the kind
// of movement in the two names, and only ever the DEFAULT of a choice he can flip before he logs: counted as the
// plan's session it is saved under that session's own name, so the day reads done as if he had started it here.
// ---------------------------------------------------------------------------
const FAMILIES: [RegExp, string][] = [
  [/\b(run|jog|sprint)/i, 'run'], [/\b(walk|hik)/i, 'walk'], [/\b(bik|cycl|spin)/i, 'cycle'], [/\bswim/i, 'swim'],
  [/\brow/i, 'row'], [/elliptical|cross.?trainer/i, 'elliptical'], [/\bskip|jump rope/i, 'skip'], [/\bstair/i, 'stairs'],
]
export function activityFamily(name: string | null | undefined): string | null {
  const n = (name ?? '').trim()
  for (const [re, family] of FAMILIES) if (re.test(n)) return family
  return null
}
/**
 * The watch's workout is the kind of session the plan asked for: the same movement, or any of these movements when the
 * plan names none ("Steady cardio", "Cardio intervals": his choice of machine or road).
 */
export function isPlannedKind(watchType: string, plannedActivity: string | null | undefined): boolean {
  const mine = activityFamily(watchActivityName(watchType))
  if (mine == null) return false
  const planned = activityFamily(plannedActivity)
  return planned != null ? mine === planned : /\b(cardio|conditioning|intervals)\b/i.test(plannedActivity ?? '')
}

/** Steps mean something on foot only. */
export function countsSteps(type: string): boolean {
  return ['Run', 'Walk', 'Hike'].includes(watchActivityName(type))
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN)
export function watchWorkoutMinutes(w: Pick<WatchWorkout, 'start' | 'end'>): number {
  const d = (ms(w.end) - ms(w.start)) / 60000
  return Number.isFinite(d) && d > 0 ? Math.round(d) : 0
}
/** The local calendar date an instant falls on, as the app writes dates. */
export function localDateOf(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A cardio log as far as "is this the same workout" needs it. */
export interface HeldCardio { activity_name?: string | null; date?: string | null; duration_minutes: number; started_at?: string | null; completed_at?: string | null }
export interface HeldSession { started_at?: string | null; finished_at?: string | null }

function heldWindows(cardio: readonly HeldCardio[], sessions: readonly HeldSession[], now: Date): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  for (const c of cardio) {
    if (!(c.duration_minutes > 0)) continue
    const started = ms(c.started_at), done = ms(c.completed_at)
    // A recorded log knows when it began; any other log is its minutes back from when it was logged (a guess).
    if (Number.isFinite(started)) out.push({ start: started, end: started + c.duration_minutes * 60000 })
    else if (Number.isFinite(done)) out.push({ start: done - c.duration_minutes * 60000, end: done })
  }
  for (const s of sessions) {
    const started = ms(s.started_at)
    if (!Number.isFinite(started)) continue
    const finished = ms(s.finished_at)
    // A session still running holds everything from its start.
    out.push({ start: started, end: Number.isFinite(finished) ? finished : now.getTime() })
  }
  return out
}

/**
 * Which of the watch's workouts to offer: real ones (5 minutes or more, finished, in the last two days) that the app
 * does not already hold and he has not dismissed, newest first.
 */
export function watchOffers(p: {
  workouts: readonly WatchWorkout[]
  cardio: readonly HeldCardio[]
  sessions: readonly HeldSession[]
  dismissed: readonly string[]
  now: Date
}): WatchWorkout[] {
  const now = p.now.getTime()
  const windows = heldWindows(p.cardio, p.sessions, p.now)
  const seen = new Set<string>()
  return p.workouts.filter(w => {
    const start = ms(w.start), end = ms(w.end), minutes = watchWorkoutMinutes(w)
    if (!Number.isFinite(start) || !Number.isFinite(end) || minutes < MIN_OFFER_MINUTES || minutes > 24 * 60) return false
    if (end > now || start < now - LOOK_BACK_HOURS * 3600000) return false
    if (p.dismissed.includes(w.id) || seen.has(w.id)) return false
    seen.add(w.id)
    const covered = windows.reduce((most, win) => Math.max(most, Math.min(end, win.end) - Math.max(start, win.start)), 0)
    if (covered >= (end - start) * COVERED_SHARE) return false
    const name = watchActivityName(w.type).toLowerCase(), date = localDateOf(w.start)
    const typedTheSame = p.cardio.some(c => (c.activity_name ?? '').trim().toLowerCase() === name && c.date === date
      && Math.abs(c.duration_minutes - minutes) <= Math.max(2, minutes * SAME_LENGTH_SHARE))
    return !typedTheSame
  }).sort((a, b) => ms(b.end) - ms(a.end))
}

/** "today 07:10" / "yesterday 18:30" / "Mon 07:10", for the offer's second line. */
export function watchWhenLine(w: Pick<WatchWorkout, 'start'>, today: string): string {
  const d = new Date(w.start)
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const date = localDateOf(w.start)
  const [y, m, dd] = today.split('-').map(Number)
  const yesterday = localDateOf(new Date(y, m - 1, dd - 1).toISOString())
  const day = date === today ? 'Today' : date === yesterday ? 'Yesterday' : d.toLocaleDateString('en-GB', { weekday: 'short' })
  return `${day}, ${time}`
}

// ---------------------------------------------------------------------------
// Dismissed offers, kept on the phone: a fact about what this phone showed him, like the switch.
// ---------------------------------------------------------------------------
function dismissedWatchWorkouts(): string[] {
  try { const v = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [] } catch { return [] }
}
export function dismissWatchWorkout(id: string): void {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissedWatchWorkouts().filter(x => x !== id), id].slice(-100))) } catch { /* offered again */ }
}

// ---------------------------------------------------------------------------
// The switch, the read and the log.
// ---------------------------------------------------------------------------
export type WorkoutConnectResult = { ok: true; store: string } | { ok: false; reason: 'not-phone-app' | 'unavailable' | 'denied' | 'error'; store?: string }

export async function connectWatchWorkouts(): Promise<WorkoutConnectResult> {
  const { healthAdapter, healthStoreName } = await import('./health-steps')
  const adapter = await healthAdapter()
  if (!adapter || !adapter.requestWorkoutAccess) return { ok: false, reason: 'not-phone-app' }
  const store = healthStoreName(adapter.platform)
  try {
    if (!(await adapter.isAvailable()).available) return { ok: false, reason: 'unavailable', store }
    const granted = await adapter.requestWorkoutAccess()
    // As with steps: Apple never says a read was refused, so a finished sheet counts as connected there.
    if (!granted && adapter.platform === 'android') return { ok: false, reason: 'denied', store }
    setConnected(true)
    return { ok: true, store }
  } catch {
    return { ok: false, reason: 'error', store }
  }
}
export function disconnectWatchWorkouts(): void { setConnected(false) }

/** The watch's workouts worth offering right now. Never throws; a failed read offers nothing. */
export async function readWatchOffers(profileId: string, today: string, at?: Date): Promise<WatchWorkout[]> {
  if (!isWatchWorkoutsConnected()) return []
  try {
    // The app's own clock, as every other read of "now" uses (the steps and heart-rate syncs beside this one).
    const now = at ?? (await import('./dev-clock')).getAppNow(profileId)
    const { healthAdapter } = await import('./health-steps')
    const adapter = await healthAdapter()
    if (!adapter?.workoutsBetween) return []
    const workouts = await adapter.workoutsBetween(new Date(now.getTime() - LOOK_BACK_HOURS * 3600000), now)
    if (workouts.length === 0) return []
    const { supabase } = await import('./supabase')
    const { addDays } = await import('./session-move')
    const { readCardioLogs } = await import('./cardio-log-store')
    const from = addDays(today, -2)
    // The one cardio reader: the server's rows with anything still waiting on this phone on top. select('*') on the
    // sessions: a database before a migration is just "no window".
    const [cardio, sessions] = await Promise.all([
      readCardioLogs(profileId, { from, to: today }),
      supabase.from('workout_sessions').select('*').eq('profile_id', profileId).gte('date', from).lte('date', today),
    ])
    // IF WHAT THE APP HOLDS CANNOT BE READ, NOTHING IS OFFERED: an offer made blind is how a workout is counted twice.
    if (cardio.source !== 'server' || sessions.error) return []
    return watchOffers({ workouts, cardio: cardio.rows as HeldCardio[], sessions: (sessions.data ?? []) as HeldSession[], dismissed: dismissedWatchWorkouts(), now })
  } catch {
    return []
  }
}

/**
 * Log one of the watch's workouts with the effort he tapped. The recorder's own calories and distance are used where
 * it wrote them; the rest (steps on foot, heart rate, calories it did not write) is read for exactly its window, the
 * way a recorded walk is. Null when nothing was saved.
 */
export async function logWatchWorkout(p: {
  profileId: string; workout: WatchWorkout; effort: EffortKey; body: BodyForEstimate
  /** Count it as the plan's own session for that day: saved under the session's name, its target effort kept when he taps the effort it asked for. */
  asPlanned?: { activity: string; targetRpe?: number | null } | null
}): Promise<CardioLogView | null> {
  const { gatherFigures } = await import('./activity-recording')
  const { saveCardioLog } = await import('./cardio-log-store')
  const { rpeToStore } = await import('./cardio-effort')
  const w = p.workout
  const f = await gatherFigures({ kind: 'walk', startedAt: w.start, endedAt: w.end }, p.body)
  const ownKcal = w.kcal != null && w.kcal > 0 ? Math.round(w.kcal) : null
  const ownKm = w.distanceM != null && w.distanceM > 0 ? Math.round(w.distanceM / 10) / 100 : null
  return saveCardioLog({
    userId: p.profileId,
    date: localDateOf(w.start),
    activityName: p.asPlanned?.activity || watchActivityName(w.type),
    durationMinutes: watchWorkoutMinutes(w),
    intensityRpe: rpeToStore(p.effort, p.asPlanned?.targetRpe),
    avgHeartRate: f.avgHeartRate,
    maxHeartRate: f.maxHeartRate,
    distanceKm: ownKm ?? (countsSteps(w.type) ? f.distanceKm : null),
    startedAt: w.start,
    endedAt: w.end,
    steps: countsSteps(w.type) ? f.steps : null,
    activeKcal: ownKcal ?? f.kcal,
    kcalEstimated: ownKcal != null ? false : f.kcalEstimated,
  })
}

/** The heart readings the phone holds for a workout's own time, for its graph. Never throws; nothing read is []. */
export async function readWatchHeart(w: Pick<WatchWorkout, 'start' | 'end'>): Promise<{ bpm: number; at: string }[]> {
  try {
    const { healthAdapter } = await import('./health-steps')
    const adapter = await healthAdapter()
    if (!adapter?.heartRateSamples) return []
    return await adapter.heartRateSamples(new Date(w.start), new Date(w.end))
  } catch {
    return []
  }
}
