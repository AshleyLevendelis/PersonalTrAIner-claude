// ---------------------------------------------------------------------------
// A COUNTED WALK (his request 26 Nov 2026: "hit Start Walk ... it just immediately starts recording my heart rate and
// recording my steps. At the end ... 'Congratulations, you completed 3,000 steps. Your average heart rate was this.'"),
// and his ruling the same day, "Both", for where the steps come from:
//
//   LIVE   the phone's own step sensor, counting from the tap (@capgo/capacitor-pedometer: Android's step counter,
//          iPhone's motion chip). It ticks up on screen as he walks.
//   AT THE END   the phone's health store (Health Connect / Apple Health, the same place the day's steps come from),
//          for the walk's own minutes. It adds the watch and covers a phone that was put down or a walk the app was
//          closed during. It can arrive minutes late, so it is read again when Home next opens (topUpWalkSteps).
//
// THE LARGER OF THE TWO IS KEPT. Neither over-counts: the sensor counts only the phone's own steps, and the health store
// already removes the double count of phone and watch. Each UNDER-counts in its own way (the store lags; the sensor
// misses a phone left on the bench), so the larger is the closer to the truth. Mechanical, not a coaching call.
//
// Heart rate: the paired strap's readings for the walk's minutes first (strap-live.ts, the session figure every screen
// already uses), else the watch's through the health store. Neither: the walk is still a walk, and Home's heart sync
// fills it later if the watch's readings arrive.
//
// The walk is kept on the phone from the tap (WALK_KEY), so a walk survives the app being closed mid-way, and a
// finished walk waits for its effort tap: nothing pre-chooses an effort the app cannot know (24 Sep 2026), and the
// effort tap is what saves it, as the round timer's does.
// ---------------------------------------------------------------------------
import { healthAdapter } from './health-steps'
import { isHealthStepsConnected, isPhoneApp } from './steps-store'
import { isHealthHeartConnected } from './health-heart'
import { summariseHeartRate, type HeartSummary } from './heart-strap'
import { strapReadingsBetween } from './strap-live'
import { saveCardioLog, type CardioLogView } from './cardio-log-store'
import { rpeToStore, type EffortKey } from './cardio-effort'
import { supabase } from './supabase'
import { addDays } from './session-move'
import { activeWalk, writeWalk, type WalkResult, type WalkState } from './walk-store'
export { activeWalk, subscribeWalk, WALK_KEY, type WalkResult, type WalkState } from './walk-store'

export const WALK_ACTIVITY = 'Walk'
/** The most steps a person could take in one minute of walking or running: past this a count is a sensor fault. */
const MAX_STEPS_PER_MINUTE = 250

/** What the app asks of the phone's step sensor. The real one wraps the plugin; tests hand in a pretend one. */
export interface StepSensor {
  available(): Promise<boolean>
  /** The phone's own permission sheet ("physical activity"). Resolves whether steps can be counted. */
  requestAccess(): Promise<boolean>
  /** Starts counting from zero; `onSteps` gets the steps since this call, each time it changes. */
  start(onSteps: (stepsSinceStart: number) => void): Promise<void>
  stop(): Promise<void>
}

function testSensor(): StepSensor | null | undefined {
  return (globalThis as { __stepSensorForTest?: StepSensor | null }).__stepSensorForTest
}

let realSensor: Promise<StepSensor | null> | null = null

/** The phone's step sensor, or null in a browser or on a phone without one. */
function stepSensor(): Promise<StepSensor | null> {
  const fake = testSensor()
  if (fake !== undefined) return Promise.resolve(fake)
  if (!isPhoneApp()) return Promise.resolve(null)
  if (!realSensor) {
    realSensor = (async (): Promise<StepSensor | null> => {
      try {
        const { CapacitorPedometer } = await import('@capgo/capacitor-pedometer')
        return {
          available: async () => {
            try { return !!(await CapacitorPedometer.isAvailable()).stepCounting } catch { return false }
          },
          requestAccess: async () => {
            try {
              const now = await CapacitorPedometer.checkPermissions()
              if (now.activityRecognition === 'granted') return true
              return (await CapacitorPedometer.requestPermissions()).activityRecognition === 'granted'
            } catch { return false }
          },
          start: async (onSteps) => {
            await CapacitorPedometer.removeAllListeners()
            await CapacitorPedometer.addListener('measurement', e => {
              if (typeof e.numberOfSteps === 'number' && e.numberOfSteps >= 0) onSteps(e.numberOfSteps)
            })
            await CapacitorPedometer.startMeasurementUpdates()
          },
          stop: async () => {
            try { await CapacitorPedometer.stopMeasurementUpdates() } catch { /* already stopped */ }
            try { await CapacitorPedometer.removeAllListeners() } catch { /* none */ }
          },
        }
      } catch {
        return null
      }
    })()
  }
  return realSensor
}

/**
 * A count is believed only when a person could have walked it in the minutes it covers, plus a minute's grace: the
 * live screen asks with the walk's exact minutes, and a count read a few seconds after a minute boundary must not be
 * refused (found by verify:walk: 90 seconds in, 270 steps read against a rounded 1 minute).
 */
export function plausibleWalkSteps(steps: number | null | undefined, minutes: number): number | null {
  if (steps == null || !Number.isFinite(steps) || steps < 0) return null
  const n = Math.round(steps)
  return n <= (Math.max(0, minutes) + 1) * MAX_STEPS_PER_MINUTE ? n : null
}

/** THE RULE: the larger of the two counts, each believed only when plausible; neither known is null, never 0. */
export function walkSteps(sensor: number | null | undefined, store: number | null | undefined, minutes: number): number | null {
  const a = plausibleWalkSteps(sensor, minutes), b = plausibleWalkSteps(store, minutes)
  if (a == null) return b
  if (b == null) return a
  return Math.max(a, b)
}

/** Whole minutes walked, at least one (a cardio log is at least a minute). */
export function walkMinutes(startedAt: string, endedAt: Date | string): number {
  const ms = new Date(endedAt).getTime() - Date.parse(startedAt)
  return Math.max(1, Math.round(ms / 60000))
}

/** Starts a walk now. A walk already running is kept, not restarted: a second tap must not lose the first. */
export function startWalk(userId: string, date: string, now: Date = new Date()): WalkState {
  const running = activeWalk()
  if (running && running.userId === userId) return running
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `walk_${now.getTime()}_${Math.random().toString(36).slice(2)}`
  const w: WalkState = { id, userId, date, startedAt: now.toISOString(), sensorBase: 0, sensorSteps: null, storeSteps: null }
  writeWalk(w)
  return w
}

/**
 * Starts (or, after the app was closed, restarts) counting with the phone's sensor. Returns false when there is no
 * sensor or he said no to the phone's question: the walk carries on with the health store's count alone.
 */
export async function startCountingSteps(): Promise<boolean> {
  const w = activeWalk()
  if (!w || w.result) return false
  const sensor = await stepSensor()
  if (!sensor || !(await sensor.available()) || !(await sensor.requestAccess())) return false
  // A sensor restarted mid-walk counts from zero again, so what was already counted becomes the base.
  const base = w.sensorSteps ?? 0
  writeWalk({ ...w, sensorBase: base })
  await sensor.start(n => {
    const cur = activeWalk()
    if (!cur || cur.result || cur.id !== w.id) return
    writeWalk({ ...cur, sensorSteps: base + n })
  })
  return true
}

/** Asks the health store for the walk's steps so far (the live screen asks every half minute). */
export async function refreshStoreSteps(now: Date = new Date()): Promise<void> {
  const w = activeWalk()
  if (!w || w.result || !isHealthStepsConnected()) return
  try {
    const adapter = await healthAdapter()
    if (!adapter) return
    const n = await adapter.stepsBetween(new Date(w.startedAt), now)
    const cur = activeWalk()
    if (cur && cur.id === w.id && !cur.result) writeWalk({ ...cur, storeSteps: n })
  } catch { /* the live count keeps what it had */ }
}

/** The steps to show on the live screen. */
export function liveWalkSteps(w: WalkState, now: Date = new Date()): number | null {
  return walkSteps(w.sensorSteps, w.storeSteps, Math.max(0, now.getTime() - Date.parse(w.startedAt)) / 60000)
}

async function heartFor(start: Date, end: Date): Promise<HeartSummary | null> {
  const strap = strapReadingsBetween(start, end)
  if (strap) return strap
  if (!isHealthHeartConnected()) return null
  try {
    const adapter = await healthAdapter()
    if (!adapter?.heartRateSamples) return null
    return summariseHeartRate(await adapter.heartRateSamples(start, end), start, end)
  } catch { return null }
}

/**
 * FINISH: stops the sensor, asks the health store for the walk's steps and the heart rate for its minutes, and keeps
 * the result on the phone until the effort tap saves it. Never throws.
 */
export async function finishWalk(now: Date = new Date()): Promise<WalkResult | null> {
  const w = activeWalk()
  if (!w) return null
  if (w.result) return w.result
  try { await (await stepSensor())?.stop() } catch { /* already stopped */ }
  await refreshStoreSteps(now)
  const cur = activeWalk() ?? w
  const start = new Date(cur.startedAt)
  const minutes = walkMinutes(cur.startedAt, now)
  const heart = await heartFor(start, now)
  const result: WalkResult = {
    startedAt: cur.startedAt,
    endedAt: now.toISOString(),
    minutes,
    steps: walkSteps(cur.sensorSteps, cur.storeSteps, minutes),
    avgHeartRate: heart?.avg ?? null,
    maxHeartRate: heart?.max ?? null,
  }
  writeWalk({ ...cur, result })
  return result
}

/** The effort tap: saves the finished walk as a cardio log and clears it. Null when nothing was waiting. */
export function saveWalk(effort: EffortKey): CardioLogView | null {
  const w = activeWalk()
  if (!w?.result) return null
  const r = w.result
  const view = saveCardioLog({
    userId: w.userId,
    date: w.date,
    activityName: WALK_ACTIVITY,
    durationMinutes: r.minutes,
    intensityRpe: rpeToStore(effort),
    avgHeartRate: r.avgHeartRate,
    maxHeartRate: r.maxHeartRate,
    steps: r.steps,
  })
  if (view) writeWalk(null)
  return view
}

/** Ends a walk without saving it (asked first on the screen). */
export async function discardWalk(): Promise<void> {
  try { await (await stepSensor())?.stop() } catch { /* already stopped */ }
  writeWalk(null)
}

/** His words, with the walk's own numbers; a figure the app does not have is left out, never guessed. */
export function walkCongratulations(r: Pick<WalkResult, 'minutes' | 'steps' | 'avgHeartRate' | 'maxHeartRate'>): string {
  const mins = `${r.minutes} minute${r.minutes === 1 ? '' : 's'}`
  const first = r.steps != null
    ? `Congratulations, you completed ${r.steps.toLocaleString('en-GB')} steps in ${mins}.`
    : `Congratulations, you completed a ${r.minutes}-minute walk.`
  if (r.avgHeartRate == null) return first
  const high = r.maxHeartRate != null ? `, and your highest was ${r.maxHeartRate}` : ''
  return `${first} Your average heart rate was ${r.avgHeartRate}${high}.`
}

/**
 * THE HEALTH STORE CATCHES UP: a walk's steps are read again when Home opens, for today's and yesterday's counted
 * walks, and raised when the store now knows more (it can land minutes after Finish). Never lowered. Never throws.
 */
export async function topUpWalkSteps(profileId: string, today: string): Promise<number> {
  if (!isHealthStepsConnected()) return 0
  let raised = 0
  try {
    const adapter = await healthAdapter()
    if (!adapter) return 0
    const { data } = await supabase.from('cardio_logs').select('*').eq('user_id', profileId).in('date', [addDays(today, -1), today])
    for (const row of (data ?? []) as { id?: string; steps?: number | null; completed_at?: string | null; duration_minutes: number }[]) {
      if (!row.id || row.steps == null || !row.completed_at) continue
      const end = new Date(row.completed_at)
      if (Number.isNaN(end.getTime())) continue
      const start = new Date(end.getTime() - row.duration_minutes * 60000)
      const fresh = plausibleWalkSteps(await adapter.stepsBetween(start, end), row.duration_minutes)
      if (fresh == null || fresh <= row.steps) continue
      const { error } = await supabase.from('cardio_logs').update({ steps: fresh }).eq('id', row.id)
      if (!error) raised++
    }
  } catch { /* nothing changes */ }
  return raised
}
