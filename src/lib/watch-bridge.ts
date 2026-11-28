// ---------------------------------------------------------------------------
// THE PHONE APP'S LINK TO THE WATCH APP (27 Nov 2026; docs/plans/watch-app.md, his "Go in the watch with your
// recommendations" and his vision: "Track workouts steps and heart rate. On a weight workout see 'next exercise 3x10
// bench press @100kg' then start rest from watch, start next set").
//
// The watch sends events over its own Bluetooth link; they wait on the phone (android WatchInbox) until the app takes
// them, here: on open, whenever the phone says something arrived, and whenever the app comes back to the front.
//
//  hr            heart rate readings, into the strap's store (strap-live.ts onWatchReadings): every screen that shows
//                the strap's live number shows the watch's, and a session's figure, graph and zones read them.
//  cardio-start  a walk, run, ride or other started on the watch: the phone's open workout shows it running.
//  route         a walk, jog or run's GPS points, every half minute on foot: kept as the workout's route (workout-routes.ts).
//  cardio-end    ended on the watch with his zone or effort tap: logged as the phone logs a recorded workout, with the
//                watch's steps, distance and calories (on the wrist the whole time), never twice.
//  set           a set ticked on the watch: queued for the Exercise tab, which saves it with its own tick.
//
// The phone sends the watch today's session (publishToday, from the Exercise tab). The plugin exists only in the
// Android phone app; anywhere else every call is a quiet no-op.
// ---------------------------------------------------------------------------
import type { BodyForEstimate } from './activity-figures'
import type { EffortKey } from './cardio-effort'
import { isPhoneApp } from './steps-store'
import { queueWatchSet } from './watch-session'
import { tracksSteps } from './cardio-kinds'
import { sameWorkout, watchKcal, watchMetres, watchSteps } from './watch-cardio-live'

export interface WatchBridgeAdapter {
  publishToday(json: string): Promise<void>
  drain(): Promise<unknown[]>
  onWaiting(cb: () => void): Promise<() => void>
  status(): Promise<{ connected: boolean; name?: string | null }>
}

let real: Promise<WatchBridgeAdapter | null> | null = null

function watchBridgeAdapter(): Promise<WatchBridgeAdapter | null> {
  const fake = (globalThis as { __watchBridgeForTest?: WatchBridgeAdapter | null }).__watchBridgeForTest
  if (fake !== undefined) return Promise.resolve(fake)
  if (!isPhoneApp()) return Promise.resolve(null)
  if (!real) {
    real = (async (): Promise<WatchBridgeAdapter | null> => {
      try {
        const { Capacitor, registerPlugin } = await import('@capacitor/core')
        if (Capacitor.getPlatform() !== 'android') return null
        type Plugin = {
          publishToday(o: { json: string }): Promise<void>
          drain(): Promise<{ events: unknown[] }>
          status(): Promise<{ connected: boolean; name?: string | null }>
          addListener(e: 'waiting', cb: () => void): Promise<{ remove: () => Promise<void> }>
        }
        const p = registerPlugin<Plugin>('WatchBridge')
        return {
          publishToday: json => p.publishToday({ json }),
          drain: async () => (await p.drain()).events ?? [],
          onWaiting: async cb => { const h = await p.addListener('waiting', cb); return () => { void h.remove() } },
          status: () => p.status(),
        }
      } catch { return null }
    })()
  }
  return real
}

// ---------------------------------------------------------------------------
// Today's session, to the watch. The same text is not sent twice.
// ---------------------------------------------------------------------------
let lastPublished: string | null = null
export async function publishToday(json: string | null): Promise<boolean> {
  if (!json || json === lastPublished) return false
  const a = await watchBridgeAdapter()
  if (!a) return false
  try { await a.publishToday(json); lastPublished = json; return true } catch { return false }
}

// ---------------------------------------------------------------------------
// The watch's events.
// ---------------------------------------------------------------------------
export interface WatchContext {
  profileId: string
  body: BodyForEstimate
}

type Ev = Record<string, unknown> & { type?: string; id?: string }
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const localDate = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const EFFORTS: readonly EffortKey[] = ['easy', 'steady', 'hard']

/** Applies the watch's events in the order sent. Returns what it did, for the gate and the report. */
export async function applyWatchEvents(events: readonly unknown[], ctx: WatchContext): Promise<{ readings: number; started: number; logged: number; sets: number }> {
  const out = { readings: 0, started: 0, logged: 0, sets: 0 }
  for (const raw of events) {
    const e = (raw && typeof raw === 'object' ? raw : {}) as Ev
    try {
      if (e.type === 'hr' && Array.isArray(e.samples)) {
        const samples = (e.samples as unknown[]).filter((s): s is [number, number] => Array.isArray(s) && s.length === 2 && num(s[0]) != null && num(s[1]) != null)
        if (samples.length) out.readings += (await import('./strap-live')).onWatchReadings(samples)
        await (await import('./session-calories')).noteWatchRunningKcal(ctx.profileId, e)
        // Its running steps and distance (28 Nov 2026): the walk's figures, live on the phone's card and at End.
        ;(await import('./watch-cardio-live')).noteWatchCardioLive(e)
      } else if (e.type === 'cardio-start' && typeof e.activity === 'string' && num(e.startedAt) != null) {
        const rec = await import('./recording-store')
        // Shown running on the phone; never over a workout already open there, and never one already logged (a late
        // start event re-opened a finished walk and blocked the next, 27 Nov 2026).
        const startMs = num(e.startedAt)!
        const { getCardioLogsForDateMerged } = await import('./cardio-log-store')
        const logged = (await getCardioLogsForDateMerged(ctx.profileId, localDate(startMs))).some(l =>
          l.started_at != null && sameWorkout(l.activity_name, Date.parse(l.started_at), e.activity as string, startMs))
        if (!logged && !rec.readRecording()) { rec.writeRecording({ activity: e.activity, startedAt: new Date(startMs).toISOString() }); out.started++ }
      } else if (e.type === 'lift-end' && typeof e.date === 'string') {
        // A WEIGHTS SESSION ENDED ON THE WATCH (his request 27 Nov 2026): its calories, kept with the day's session.
        if (await (await import('./session-calories')).saveSessionCalories(ctx.profileId, e.date, e.kcal)) out.logged++
      } else if (e.type === 'route') {
        // THE ROUTE OF A WALK, JOG OR RUN (his ruling 28 Nov 2026, "Save the route"): kept with the workout, his alone.
        await (await import('./workout-routes')).noteWatchRoute(ctx.profileId, e)
      } else if (e.type === 'cardio-end') {
        if (await logWatchCardio(e, ctx)) out.logged++
      } else if ((e.type === 'set' || e.type === 'set-undo') && typeof e.name === 'string' && num(e.setNumber) != null && typeof e.date === 'string') {
        const undo = e.type === 'set-undo'
        const reps = num(e.reps), kg = num(e.kg)
        queueWatchSet({
          id: String(e.id ?? `${e.date}:${e.exerciseId}:${e.setNumber}${undo ? ':undo' : ''}`), date: e.date, exerciseId: String(e.exerciseId ?? ''),
          name: e.name, setNumber: num(e.setNumber)!, at: num(e.at) ?? Date.now(),
          // What he did on the watch (his "Adjust reps and weight"): a believable count and weight, else the plan's.
          ...(!undo && reps != null && reps >= 1 && reps <= 600 ? { reps: Math.round(reps) } : {}),
          ...(!undo && kg != null && kg >= 0 && kg <= 500 ? { kg } : {}),
          ...(undo ? { undo: true } : {}),
        })
        out.sets++
      }
    } catch { /* one bad event never stops the rest */ }
  }
  return out
}

/** How far apart the phone's End and the watch's End may be for the watch's figures to describe the phone's log. */
const SAME_END_MS = 120_000

/**
 * A FILL THAT COULD NOT BE WRITTEN IS KEPT AND TRIED AGAIN (the lead's second review, 28 Nov 2026): the event has left
 * the watch's queue, and the phone's own late fill only fills empty fields, so a dropped correction would be lost for
 * good. Kept on the phone by event id, tried on every pass of the bridge, given up after a week.
 */
const FILL_RETRY_KEY = 'fitplan_watch_fill_retry'
const FILL_RETRY_FOR_MS = 7 * 24 * 3600_000
type WaitingFill = { e: Ev; firstAt: number }
function readWaitingFills(): WaitingFill[] {
  try { const v = JSON.parse(localStorage.getItem(FILL_RETRY_KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
function writeWaitingFills(list: WaitingFill[]): void {
  try { if (list.length) localStorage.setItem(FILL_RETRY_KEY, JSON.stringify(list.slice(-20))); else localStorage.removeItem(FILL_RETRY_KEY) } catch { /* tried again next time it is sent */ }
}
function keepFillForRetry(e: Ev, now = Date.now()): void {
  const list = readWaitingFills().filter(w => w.e.id !== e.id)
  const first = readWaitingFills().find(w => w.e.id === e.id)?.firstAt ?? now
  writeWaitingFills([...list, { e, firstAt: first }])
}
/** Tries every waiting fill again; those that land (or have waited a week) are forgotten. */
export async function retryWaitingFills(ctx: WatchContext, now = Date.now()): Promise<number> {
  const waiting = readWaitingFills()
  if (!waiting.length) return 0
  writeWaitingFills([])
  let landed = 0
  for (const w of waiting) {
    if (now - w.firstAt > FILL_RETRY_FOR_MS) continue
    const startMs = num(w.e.startedAt), endMs = num(w.e.endedAt)
    if (startMs == null || endMs == null) continue
    if (await fillFromWatch(ctx.profileId, localDate(startMs), w.e, startMs, endMs)) landed++
    else keepFillForRetry(w.e, w.firstAt)
  }
  return landed
}

/**
 * The watch's figures into a log of the same workout the phone already made (ended on the phone first).
 *
 * THE WATCH'S STEPS ARE THE WALK'S, WHICHEVER END WAS TAPPED FIRST (his report 28 Nov 2026, "The watch and phone steps
 * disagree"), but only when the two Ends are within two minutes (the lead's review): ending on the phone does not end
 * the watch, and a watch ended half an hour later counted half an hour the log does not cover. Outside that window the
 * watch's figures describe a different stretch of time and nothing is taken from them. Distance replaces the phone's
 * only with the watch's own GPS route; otherwise it, the calories and heart rate fill only what the log lacks. A log
 * still queued on the phone (no signal) is filled in the queue, so the watch's figures are not lost.
 */
async function fillFromWatch(profileId: string, date: string, e: Ev, startMs: number, endMs: number): Promise<boolean> {
  try {
    const store = await import('./cardio-log-store')
    const { lateFill } = await import('./activity-recording')
    const row = (await store.getCardioLogsForDateMerged(profileId, date)).find(r =>
      r.started_at != null && sameWorkout(r.activity_name, Date.parse(r.started_at), e.activity as string, startMs))
    if (!row) return false // the phone's log is not readable yet: tried again
    // Up to two minutes after the phone's End is accepted here, while the phone's own summary cuts at End: the watch's
    // End event carries only its final count, so a watch ended a little later is the same walk give or take its last
    // two minutes (the lead's note, 28 Nov 2026). Further apart, it describes other time and nothing is taken.
    const rowEnd = row.completed_at ? Date.parse(row.completed_at) : NaN
    if (!Number.isFinite(rowEnd) || Math.abs(rowEnd - endMs) > SAME_END_MS) return true
    const steps = watchSteps(e.steps), metres = watchMetres(e.distanceM), routeM = watchMetres(e.routeM)
    const km = (m: number | null) => (m != null ? Math.round(m / 10) / 100 : null)
    const update: Record<string, unknown> = lateFill(row, {
      minutes: 0, steps, distanceKm: km(metres),
      kcal: watchKcal(e.kcal), kcalEstimated: false,
      avgHeartRate: num(e.avgBpm), maxHeartRate: num(e.maxBpm),
    }) ?? {}
    if (tracksSteps(row.activity_name)) {
      if (steps != null && steps !== row.steps) update.steps = steps
      // Distance replaces the phone's only as the length of the watch's own real GPS route.
      if (routeM != null && km(routeM) !== row.distance_km) update.distance_km = km(routeM)
    }
    if (!Object.keys(update).length) return true
    if (row.syncStatus === 'pending' || row.syncStatus === 'failed') return store.patchQueuedCardioLog(row.clientId!, update)
    if (!row.id) return false
    const { supabase } = await import('./supabase')
    const { error } = await supabase.from('cardio_logs').update(update).eq('id', row.id).eq('user_id', profileId)
    return !error
  } catch { return false }
}

/** A cardio workout ended on the watch, logged once. False when it was already logged or could not be. */
async function logWatchCardio(e: Ev, ctx: WatchContext): Promise<boolean> {
  const startMs = num(e.startedAt), endMs = num(e.endedAt)
  const effort = EFFORTS.find(k => k === e.effort)
  if (startMs == null || endMs == null || endMs <= startMs || !effort || typeof e.activity !== 'string') return false
  const date = localDate(startMs)
  const { getCardioLogsForDateMerged } = await import('./cardio-log-store')
  // ENDED ON THE PHONE TOO: a log of this workout (the same name, started within two minutes) is not made again.
  const already = (await getCardioLogsForDateMerged(ctx.profileId, date)).some(l =>
    l.started_at != null && sameWorkout(l.activity_name, Date.parse(l.started_at), e.activity as string, startMs))
  const store = await import('./recording-store')
  const open = store.readRecording()
  const ours = !!open && sameWorkout(open.activity, Date.parse(open.startedAt), e.activity, startMs)
  if (already) {
    if (ours) store.writeRecording(null)
    // ENDED ON THE PHONE FIRST (27 Nov 2026): the log is there, so the watch's own figures go into it (fillFromWatch),
    // and one that cannot be written now is kept and tried again, never dropped.
    if (!(await fillFromWatch(ctx.profileId, date, e, startMs, endMs))) keepFillForRetry(e)
    return false
  }
  const recording = { activity: e.activity, startedAt: new Date(startMs).toISOString(), endedAt: new Date(endMs).toISOString() }
  const { gatherFigures, logRecording } = await import('./activity-recording')
  const { recordingFigures } = await import('./activity-figures')
  const phone = await gatherFigures(recording, ctx.body, new Date(endMs))
  // On the wrist the whole time, the watch's own steps and calories win, and its distance when it is the length of a
  // real GPS route of its own (else the phone's, else the watch's other distance); a zero from the watch is "nothing
  // counted", never over a real figure.
  // Heart rate is the readings it sent (gathered above), else its own average and highest.
  const watchHeart = num(e.avgBpm) != null && num(e.maxBpm) != null ? { avg: num(e.avgBpm)!, max: num(e.maxBpm)! } : null
  const figures = recordingFigures({
    start: new Date(startMs),
    end: new Date(endMs),
    steps: watchSteps(e.steps) ?? phone.steps,
    distanceM: watchMetres(e.routeM) ?? (phone.distanceKm != null ? phone.distanceKm * 1000 : watchMetres(e.distanceM)),
    deviceKcal: watchKcal(e.kcal) ?? (phone.kcalEstimated ? null : phone.kcal),
    heart: phone.avgHeartRate != null && phone.maxHeartRate != null ? { avg: phone.avgHeartRate, max: phone.maxHeartRate } : watchHeart,
  }, ctx.body)
  const view = logRecording({ profileId: ctx.profileId, date, recording, figures, effort })
  // logRecording closes the open workout; one that was not this one is put back.
  if (open && !ours) store.writeRecording(open)
  return !!view
}

/** Takes everything waiting and applies it; again when the watch sends more, or the app comes back to the front. */
export function startWatchBridge(context: () => WatchContext | null): () => void {
  let stopped = false
  let running = false
  let again = false
  const take = async () => {
    if (stopped) return
    if (running) { again = true; return }
    running = true
    try {
      do {
        again = false
        const ctx = context()
        const a = await watchBridgeAdapter()
        if (!a || !ctx) return
        const events = await a.drain()
        if (events.length) await applyWatchEvents(events, ctx)
        await retryWaitingFills(ctx)
      } while (again && !stopped)
    } catch { /* tried again on the next signal */ } finally { running = false }
  }
  let unlisten: (() => void) | null = null
  void watchBridgeAdapter().then(a => a?.onWaiting(() => void take())).then(u => { if (stopped) u?.(); else unlisten = u ?? null })
  const onVisible = () => { if (document.visibilityState === 'visible') void take() }
  document.addEventListener('visibilitychange', onVisible)
  void take()
  return () => { stopped = true; unlisten?.(); document.removeEventListener('visibilitychange', onVisible) }
}

