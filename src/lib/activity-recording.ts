// ---------------------------------------------------------------------------
// RECORD A WALK OR RUN (his request 25 Nov 2026, "start workout and recording and end the workout and recording and
// the app then logs. 5k steps logged 300kcal burned ... taking the kcal from the device which is recording ie watch or
// strap"; his ruling "A, build it"). docs/plans/recorded-activity.md.
//
// START AND END SET A WINDOW; THE PHONE FILLS IT. The app records no GPS and counts no steps of its own. The watch and
// the phone already write steps, distance and calories to Health Connect / Apple Health, so at End the app reads that
// store for exactly the window, and a paired strap gives the heart rate from its own readings (strap-live.ts). This is
// why a recording survives the app being closed or the phone locked: the window is two instants on the phone, and
// what fills it is written by the watch whatever the app is doing.
//
// THE RECORDING IS KEPT ON THE PHONE (localStorage) until it is logged or thrown away: Start, End and the effort tap
// can be minutes and an app restart apart.
//
// ANY CARDIO, STARTED FROM EXERCISE (his words 27 Nov 2026: "it's under tools and it's different to logging workouts
// ... choosing a workout, i.e. walk, jog, run, hill sprints, assault bike etc. and pressing start and it picks up the
// steps or heart rate or both depending on which suits"). A recording carries the NAME of what he picked
// (cardio-kinds.ts), no longer one of two kinds; steps and distance are read only for work on foot.
//
// EFFORT IS ASKED, never chosen for him (his 24 Sep "nothing pre-chooses an effort the app cannot know").
//
// A WATCH THAT SYNCS LATE (Garmin, Samsung): the log saves at once with what the phone has, and
// `fillRecordedFromHealth` fills the missing steps, distance, calories and HEART RATE when they arrive (Home's open and
// the app coming back to the front). A device's calories replace the app's estimate; nothing else is ever overwritten.
// Heart rate joined 27 Nov 2026 (his phone test: a 5-minute walk with a Galaxy Watch logged no heart rate, and nothing
// ever filled it).
//
// LIVE STEPS (27 Nov 2026, live-steps.ts): on foot in the Android app, the phone's own step counter runs from Start to
// End, so the count shows while he walks. At End the health store's steps win when it has them; otherwise the phone's
// own count is used.
// ---------------------------------------------------------------------------

import { readRecording, writeRecording, useRecording, type Recording } from './recording-store'
import { recordingFigures, type BodyForEstimate, type RecordingFigures } from './activity-figures'
import { saveCardioLog, type CardioLogView } from './cardio-log-store'
import { rpeToStore, type EffortKey } from './cardio-effort'
import { isPhoneApp } from './steps-store'
import { addDays } from './session-move'
import { tracksSteps } from './cardio-kinds'
import { clearLiveSteps, liveStepsFor, startLiveSteps, stopLiveSteps } from './live-steps'

const ASKED_KEY = 'fitplan_activity_access_asked'
/** A recording left running longer than this was forgotten, not walked: End says so. */
const FORGOTTEN_AFTER_MS = 6 * 3600 * 1000

// The open recording itself lives in recording-store.ts (in the first download); this file is fetched when needed.
const read = readRecording
const write = writeRecording
export function currentRecording(): Recording | null { return read() }
export { useRecording, type Recording }

/**
 * Start. In the phone app the first Start asks the phone, once, for steps, distance, calories and heart rate (his tap
 * is the reason the sheet appears). A refusal records anyway: the walk is still timed and logged.
 */
export async function startRecording(activity: string, now: Date = new Date()): Promise<Recording> {
  const existing = read()
  if (existing) return existing
  const r: Recording = { activity, startedAt: now.toISOString() }
  write(r)
  if (isPhoneApp()) {
    let asked = false
    try { asked = localStorage.getItem(ASKED_KEY) === '1' } catch { /* ask */ }
    if (!asked) {
      try {
        const { healthAdapter } = await import('./health-steps')
        const a = await healthAdapter()
        if (a?.requestActivityAccess && (await a.isAvailable()).available) await a.requestActivityAccess()
        localStorage.setItem(ASKED_KEY, '1')
      } catch { /* asked again next Start */ }
    }
    // A paired strap that dropped is tried again, so the walk has its heart rate.
    try { void (await import('./strap-live')).connectPairedStrap() } catch { /* no strap */ }
    // On foot: the phone's own step counter, live (asks "Physical activity" the first time).
    if (tracksSteps(activity)) void startLiveSteps(r.startedAt)
  }
  return r
}

export function endRecording(now: Date = new Date()): Recording | null {
  const r = read()
  if (!r || r.endedAt) return r
  const ended = { ...r, endedAt: now.toISOString() }
  write(ended)
  void stopLiveSteps()
  return ended
}

/** Back to recording, after an End tapped by mistake. */
export function resumeRecording(): void {
  const r = read()
  if (r?.endedAt) {
    write({ activity: r.activity, startedAt: r.startedAt })
    if (isPhoneApp() && tracksSteps(r.activity)) void startLiveSteps(r.startedAt)
  }
}

export function discardRecording(): void { write(null); void stopLiveSteps(); clearLiveSteps() }

/** True when the clock has run so long it was surely forgotten. */
export function looksForgotten(r: Recording, now: Date = new Date()): boolean {
  const end = r.endedAt ? Date.parse(r.endedAt) : now.getTime()
  return end - Date.parse(r.startedAt) > FORGOTTEN_AFTER_MS
}

/** Where each figure came from, so the sheet can say what is still to come. */
export interface GatheredFigures extends RecordingFigures {
  /** The phone's health store could be read (phone app, store available). */
  phoneRead: boolean
  /** Heart rate came from the strap's own readings. */
  heartFromStrap: boolean
  /** The steps are the phone's own count (live-steps.ts), the health store having none yet. */
  stepsFromPhoneCounter: boolean
}

/**
 * What the phone holds for the window. Every read is separate and a failed one is "nothing", so a refused calories
 * permission still leaves the steps. Never throws.
 */
export async function gatherFigures(r: Recording, body: BodyForEstimate, now: Date = new Date()): Promise<GatheredFigures> {
  const start = new Date(r.startedAt)
  const end = r.endedAt ? new Date(r.endedAt) : now
  const safe = async <T>(f: (() => Promise<T>) | undefined): Promise<T | null> => {
    if (!f) return null
    try { return await f() } catch { return null }
  }
  let steps: number | null = null, distanceM: number | null = null, deviceKcal: number | null = null
  let heart: { avg: number; max: number } | null = null
  let phoneRead = false, heartFromStrap = false
  try {
    const strap = await import('./strap-live')
    if (strap.hasOwnReadings()) {
      const s = strap.strapReadingsBetween(start, end)
      if (s) { heart = { avg: s.avg, max: s.max }; heartFromStrap = true }
    }
  } catch { /* no strap */ }
  try {
    const { healthAdapter } = await import('./health-steps')
    const a = await healthAdapter()
    if (a && (await a.isAvailable()).available) {
      phoneRead = true
      // STEPS AND DISTANCE ON FOOT ONLY (cardio-kinds.ts): on a bike or a rower they are the phone being shaken.
      if (tracksSteps(r.activity)) {
        steps = await safe(() => a.stepsBetween(start, end))
        distanceM = await safe(a.distanceMetersBetween && (() => a.distanceMetersBetween!(start, end)))
      }
      deviceKcal = await safe(a.activeKcalBetween && (() => a.activeKcalBetween!(start, end)))
      if (!heart && a.heartRateSamples) {
        const samples = await safe(() => a.heartRateSamples!(start, end))
        if (samples) {
          const { summariseHeartRate } = await import('./heart-strap')
          const s = summariseHeartRate(samples, start, end)
          if (s) heart = { avg: s.avg, max: s.max }
        }
      }
    }
  } catch { /* nothing read */ }
  // THE PHONE'S OWN COUNT when the health store has none yet (a watch that syncs late): what he saw while walking.
  let stepsFromPhoneCounter = false
  if (tracksSteps(r.activity) && !(steps != null && steps > 0)) {
    const counted = liveStepsFor(r.startedAt)
    if (counted != null) { steps = counted; stepsFromPhoneCounter = true }
  }
  return { ...recordingFigures({ start, end, steps, distanceM, deviceKcal, heart }, body), phoneRead, heartFromStrap, stepsFromPhoneCounter }
}

/** Write the recording down as a cardio log, with the effort he tapped. Null when nothing was saved. */
export function logRecording(p: { profileId: string; date: string; recording: Recording; figures: RecordingFigures; effort: EffortKey }): CardioLogView | null {
  const end = p.recording.endedAt ?? new Date().toISOString()
  const view = saveCardioLog({
    userId: p.profileId,
    date: p.date,
    activityName: p.recording.activity,
    durationMinutes: p.figures.minutes,
    intensityRpe: rpeToStore(p.effort),
    avgHeartRate: p.figures.avgHeartRate,
    maxHeartRate: p.figures.maxHeartRate,
    distanceKm: p.figures.distanceKm,
    startedAt: p.recording.startedAt,
    endedAt: end,
    steps: p.figures.steps,
    activeKcal: p.figures.kcal,
    kcalEstimated: p.figures.kcalEstimated,
  })
  if (view) { write(null); clearLiveSteps() }
  return view
}

/** The update a late sync may make to a recorded log: only what is missing, and a device's calories over an estimate. */
export function lateFill(
  row: { activity_name?: string | null; steps?: number | null; distance_km?: number | null; active_kcal?: number | null; kcal_estimated?: boolean | null; avg_heart_rate?: number | null; max_heart_rate?: number | null },
  fresh: RecordingFigures,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  // On foot only, as at End: a ride logged with no steps must not be handed the day's shaking later.
  const onFoot = tracksSteps(row.activity_name)
  if (onFoot && row.steps == null && fresh.steps != null) out.steps = fresh.steps
  if (onFoot && row.distance_km == null && fresh.distanceKm != null) out.distance_km = fresh.distanceKm
  if (fresh.kcal != null && !fresh.kcalEstimated && (row.active_kcal == null || row.kcal_estimated)) {
    out.active_kcal = fresh.kcal
    out.kcal_estimated = false
  }
  // HEART RATE THE WATCH SYNCED LATE (27 Nov 2026): filled when the log has none, never over one it has (a strap's).
  if (row.avg_heart_rate == null && fresh.avgHeartRate != null && fresh.maxHeartRate != null) {
    out.avg_heart_rate = fresh.avgHeartRate
    out.max_heart_rate = fresh.maxHeartRate
  }
  return Object.keys(out).length ? out : null
}

/**
 * A WATCH THAT SYNCS LATE: today's and yesterday's recorded logs are read again for what is still missing. Called with
 * heart rate, when Home opens and when the app comes back to the front. Never throws; reads with select('*') and names
 * this person, so a database before the migration is "nothing to fill".
 */
export async function fillRecordedFromHealth(profileId: string, today: string): Promise<number> {
  let filled = 0
  try {
    const { healthAdapter } = await import('./health-steps')
    const a = await healthAdapter()
    if (!a || !(await a.isAvailable()).available) return 0
    const { supabase } = await import('./supabase')
    const { data } = await supabase.from('cardio_logs').select('*').eq('user_id', profileId).in('date', [addDays(today, -1), today])
    type Row = { id?: string; activity_name?: string | null; started_at?: string | null; completed_at?: string | null; steps?: number | null; distance_km?: number | null; active_kcal?: number | null; kcal_estimated?: boolean | null; avg_heart_rate?: number | null; max_heart_rate?: number | null }
    for (const row of (data ?? []) as Row[]) {
      if (!row.id || !row.started_at || !row.completed_at) continue
      const onFoot = tracksSteps(row.activity_name)
      if ((!onFoot || (row.steps != null && row.distance_km != null)) && row.active_kcal != null && !row.kcal_estimated && row.avg_heart_rate != null) continue
      const start = new Date(row.started_at), end = new Date(row.completed_at)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue
      const read = async (f?: () => Promise<number>) => { if (!f) return null; try { return await f() } catch { return null } }
      let heart: { avg: number; max: number } | null = null
      if (row.avg_heart_rate == null && a.heartRateSamples) {
        try {
          const samples = await a.heartRateSamples(start, end)
          const s = (await import('./heart-strap')).summariseHeartRate(samples, start, end)
          if (s) heart = { avg: s.avg, max: s.max }
        } catch { /* not synced yet: next time */ }
      }
      const fresh = recordingFigures({
        start, end,
        steps: await read(() => a.stepsBetween(start, end)),
        distanceM: await read(a.distanceMetersBetween && (() => a.distanceMetersBetween!(start, end))),
        deviceKcal: await read(a.activeKcalBetween && (() => a.activeKcalBetween!(start, end))),
        heart,
      }, {})
      const update = lateFill(row, fresh)
      if (!update) continue
      const { error } = await supabase.from('cardio_logs').update(update).eq('id', row.id).eq('user_id', profileId)
      if (!error) filled++
    }
  } catch { /* a failed read changes nothing */ }
  return filled
}

