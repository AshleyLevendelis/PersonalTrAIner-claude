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
      } else if (e.type === 'cardio-start' && typeof e.activity === 'string' && num(e.startedAt) != null) {
        const rec = await import('./recording-store')
        // Shown running on the phone; never over a workout already open there.
        if (!rec.readRecording()) { rec.writeRecording({ activity: e.activity, startedAt: new Date(num(e.startedAt)!).toISOString() }); out.started++ }
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

/** A cardio workout ended on the watch, logged once. False when it was already logged or could not be. */
async function logWatchCardio(e: Ev, ctx: WatchContext): Promise<boolean> {
  const startMs = num(e.startedAt), endMs = num(e.endedAt)
  const effort = EFFORTS.find(k => k === e.effort)
  if (startMs == null || endMs == null || endMs <= startMs || !effort || typeof e.activity !== 'string') return false
  const date = localDate(startMs)
  const { getCardioLogsForDateMerged } = await import('./cardio-log-store')
  // ENDED ON THE PHONE TOO: a log of this workout (the same name, started within two minutes) is not made again.
  const already = (await getCardioLogsForDateMerged(ctx.profileId, date)).some(l =>
    l.activity_name === e.activity && l.started_at != null && Math.abs(Date.parse(l.started_at) - startMs) < 120_000)
  const store = await import('./recording-store')
  const open = store.readRecording()
  const ours = open && open.activity === e.activity && Math.abs(Date.parse(open.startedAt) - startMs) < 120_000
  if (already) { if (ours) store.writeRecording(null); return false }
  const recording = { activity: e.activity, startedAt: new Date(startMs).toISOString(), endedAt: new Date(endMs).toISOString() }
  const { gatherFigures, logRecording } = await import('./activity-recording')
  const { recordingFigures } = await import('./activity-figures')
  const phone = await gatherFigures(recording, ctx.body, new Date(endMs))
  // On the wrist the whole time, the watch's own steps, distance and calories win; heart rate is the readings it sent
  // (gathered above), else its own average and highest.
  const watchHeart = num(e.avgBpm) != null && num(e.maxBpm) != null ? { avg: num(e.avgBpm)!, max: num(e.maxBpm)! } : null
  const figures = recordingFigures({
    start: new Date(startMs),
    end: new Date(endMs),
    steps: num(e.steps) ?? phone.steps,
    distanceM: num(e.distanceM) ?? (phone.distanceKm != null ? phone.distanceKm * 1000 : null),
    deviceKcal: num(e.kcal) ?? (phone.kcalEstimated ? null : phone.kcal),
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

