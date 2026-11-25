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
// EFFORT IS ASKED, never chosen for him (his 24 Sep "nothing pre-chooses an effort the app cannot know").
//
// A WATCH THAT SYNCS LATE (Garmin, Samsung): the log saves at once with what the phone has, and
// `fillRecordedFromHealth` fills the missing steps, distance and calories when they arrive (Home's open and the app
// coming back to the front, beside heart rate). A device's calories replace the app's estimate; nothing else is ever
// overwritten.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from 'react'
import { recordingFigures, type BodyForEstimate, type RecordingFigures } from './activity-figures'
import { saveCardioLog, type CardioLogView } from './cardio-log-store'
import { rpeToStore, type EffortKey } from './cardio-effort'
import { isPhoneApp } from './steps-store'
import { addDays } from './session-move'

export type RecordingKind = 'walk' | 'run'
export const RECORDING_NAMES: Record<RecordingKind, string> = { walk: 'Walk', run: 'Run' }

export interface Recording {
  kind: RecordingKind
  startedAt: string
  /** Set by End. Until then the clock runs. */
  endedAt?: string
}

const KEY = 'fitplan_activity_recording'
const ASKED_KEY = 'fitplan_activity_access_asked'
/** A recording left running longer than this was forgotten, not walked: End says so. */
const FORGOTTEN_AFTER_MS = 6 * 3600 * 1000

const listeners = new Set<() => void>()
let cached: Recording | null | undefined
let cachedRaw: string | null | undefined

function read(): Recording | null {
  let raw: string | null = null
  try { raw = localStorage.getItem(KEY) } catch { raw = null }
  if (raw === cachedRaw && cached !== undefined) return cached
  cachedRaw = raw
  try {
    const r = raw ? JSON.parse(raw) as Partial<Recording> : null
    cached = r && (r.kind === 'walk' || r.kind === 'run') && typeof r.startedAt === 'string' && !Number.isNaN(Date.parse(r.startedAt))
      ? { kind: r.kind, startedAt: r.startedAt, ...(typeof r.endedAt === 'string' && !Number.isNaN(Date.parse(r.endedAt)) ? { endedAt: r.endedAt } : {}) }
      : null
  } catch { cached = null }
  return cached
}
function write(r: Recording | null): void {
  try { if (r) localStorage.setItem(KEY, JSON.stringify(r)); else localStorage.removeItem(KEY) } catch { /* the screen still follows */ }
  cached = undefined
  for (const l of listeners) l()
}

export function currentRecording(): Recording | null { return read() }

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
export function useRecording(): Recording | null {
  return useSyncExternalStore(subscribe, read, () => null)
}

/**
 * Start. In the phone app the first Start asks the phone, once, for steps, distance, calories and heart rate (his tap
 * is the reason the sheet appears). A refusal records anyway: the walk is still timed and logged.
 */
export async function startRecording(kind: RecordingKind, now: Date = new Date()): Promise<Recording> {
  const existing = read()
  if (existing) return existing
  const r: Recording = { kind, startedAt: now.toISOString() }
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
  }
  return r
}

export function endRecording(now: Date = new Date()): Recording | null {
  const r = read()
  if (!r || r.endedAt) return r
  const ended = { ...r, endedAt: now.toISOString() }
  write(ended)
  return ended
}

/** Back to recording, after an End tapped by mistake. */
export function resumeRecording(): void {
  const r = read()
  if (r?.endedAt) write({ kind: r.kind, startedAt: r.startedAt })
}

export function discardRecording(): void { write(null) }

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
    if (strap.pairedStrap()) {
      const s = strap.strapReadingsBetween(start, end)
      if (s) { heart = { avg: s.avg, max: s.max }; heartFromStrap = true }
    }
  } catch { /* no strap */ }
  try {
    const { healthAdapter } = await import('./health-steps')
    const a = await healthAdapter()
    if (a && (await a.isAvailable()).available) {
      phoneRead = true
      steps = await safe(() => a.stepsBetween(start, end))
      distanceM = await safe(a.distanceMetersBetween && (() => a.distanceMetersBetween!(start, end)))
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
  return { ...recordingFigures({ start, end, steps, distanceM, deviceKcal, heart }, body), phoneRead, heartFromStrap }
}

/** Write the recording down as a cardio log, with the effort he tapped. Null when nothing was saved. */
export function logRecording(p: { profileId: string; date: string; recording: Recording; figures: RecordingFigures; effort: EffortKey }): CardioLogView | null {
  const end = p.recording.endedAt ?? new Date().toISOString()
  const view = saveCardioLog({
    userId: p.profileId,
    date: p.date,
    activityName: RECORDING_NAMES[p.recording.kind],
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
  if (view) write(null)
  return view
}

/** The update a late sync may make to a recorded log: only what is missing, and a device's calories over an estimate. */
export function lateFill(
  row: { steps?: number | null; distance_km?: number | null; active_kcal?: number | null; kcal_estimated?: boolean | null },
  fresh: RecordingFigures,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  if (row.steps == null && fresh.steps != null) out.steps = fresh.steps
  if (row.distance_km == null && fresh.distanceKm != null) out.distance_km = fresh.distanceKm
  if (fresh.kcal != null && !fresh.kcalEstimated && (row.active_kcal == null || row.kcal_estimated)) {
    out.active_kcal = fresh.kcal
    out.kcal_estimated = false
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
    type Row = { id?: string; started_at?: string | null; completed_at?: string | null; steps?: number | null; distance_km?: number | null; active_kcal?: number | null; kcal_estimated?: boolean | null }
    for (const row of (data ?? []) as Row[]) {
      if (!row.id || !row.started_at || !row.completed_at) continue
      if (row.steps != null && row.distance_km != null && row.active_kcal != null && !row.kcal_estimated) continue
      const start = new Date(row.started_at), end = new Date(row.completed_at)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue
      const read = async (f?: () => Promise<number>) => { if (!f) return null; try { return await f() } catch { return null } }
      const fresh = recordingFigures({
        start, end,
        steps: await read(() => a.stepsBetween(start, end)),
        distanceM: await read(a.distanceMetersBetween && (() => a.distanceMetersBetween!(start, end))),
        deviceKcal: await read(a.activeKcalBetween && (() => a.activeKcalBetween!(start, end))),
        heart: null,
      }, {})
      const update = lateFill(row, fresh)
      if (!update) continue
      const { error } = await supabase.from('cardio_logs').update(update).eq('id', row.id).eq('user_id', profileId)
      if (!error) filled++
    }
  } catch { /* a failed read changes nothing */ }
  return filled
}

