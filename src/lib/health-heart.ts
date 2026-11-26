// ---------------------------------------------------------------------------
// HEART RATE FROM THE PHONE (his ruling 24 Nov 2026, "1 + 2, build it"): a watch or chest strap already writes heart
// rate into Apple Health / Health Connect, and the phone app reads it back, READ ONLY, for two things:
//   1. AFTER A SESSION: the average and the highest heart rate over that session's own time, kept on the cardio log or
//      the day's workout, shown under it and told to the coach.
//   2. RESTING HEART RATE: one figure a day, and on Home the week's average against the week before (a recovery sign).
//
// NOTHING IS PRESCRIBED BY IT. Effort stays in words, never a heart rate (his 14 Nov 2026 health-conditions ruling and
// the cardio days' "by feel"): these are numbers to look at, not targets, and no sentence here tells him to train at a
// heart rate. The coach is told them as facts.
//
// Mine (measurement, not coaching): a reading is believed between 30 and 230 beats a minute; a session's figure needs at
// least 3 readings inside its time (a watch writes one every few seconds to every few minutes); a resting figure is
// believed between 25 and 140. Switched on per phone, like steps, by its own switch on Profile.
// ---------------------------------------------------------------------------

import { healthAdapter, type HealthPlatform } from './health-steps'
import { supabase } from './supabase'
import { getAppNow } from './dev-clock'
import { addDays } from './session-move'

export const HEALTH_HEART_CONNECTED_KEY = 'fitplan_health_heart_connected'

/** He switched "Heart rate from your watch" on, on this phone. */
export function isHealthHeartConnected(): boolean {
  try { return localStorage.getItem(HEALTH_HEART_CONNECTED_KEY) === '1' } catch { return false }
}
function setHeartConnected(on: boolean): void {
  try { if (on) localStorage.setItem(HEALTH_HEART_CONNECTED_KEY, '1'); else localStorage.removeItem(HEALTH_HEART_CONNECTED_KEY) } catch { /* asked again */ }
}

// The session figure's rule lives with the strap's reader (heart-strap.ts, no imports), so the live number on the
// timer does not pull this file into the first download. One rule, both sources.
import { summariseHeartRate, type HeartSummary } from './heart-strap'
import { fitnessTrends, recoveryFlag, type CardioHeartRow, type FitnessTrend, type RecoveryFlag } from './heart-trends'
export { summariseHeartRate, type HeartSummary }

const isPlausibleResting = (n: number) => Number.isFinite(n) && n >= 25 && n <= 140


/**
 * A CARDIO LOG'S TIME IS A GUESS when it was typed in later ("I ran this morning", logged at lunch): its minutes back
 * from when it was logged may be an hour at a desk. So a cardio figure is kept only when the heart was clearly working
 * (its highest reading 100 or more); otherwise the log keeps no heart rate rather than a desk's. A workout has its own
 * start and finish, so it needs no such guard. Mine, measurement.
 */
export function looksLikeExercise(sum: HeartSummary): boolean {
  return sum.max >= 100
}

export { heartLine } from './cardio-effort'

/** One resting figure a day: the lowest believable reading on each local date. */
export function restingByDay(samples: { bpm: number; at: string }[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const x of samples) {
    if (!isPlausibleResting(x.bpm)) continue
    const d = new Date(x.at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const bpm = Math.round(x.bpm)
    out.set(key, Math.min(out.get(key) ?? bpm, bpm))
  }
  return out
}

/**
 * Home's resting line: this week's average (the 7 days to today) against the 7 days before, each needing 3 days of
 * readings. "Resting heart rate 58 · 2 lower than last week". Null with too few readings this week.
 */
export function restingTrend(rows: { date: string; bpm: number }[], today: string): { line: string; avg: number; change: number | null } | null {
  const t = Date.parse(`${today}T12:00:00Z`)
  const daysAgo = (d: string) => Math.round((t - Date.parse(`${d}T12:00:00Z`)) / 86400000)
  const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)
  const thisWeek = rows.filter(r => daysAgo(r.date) >= 0 && daysAgo(r.date) < 7).map(r => r.bpm)
  const lastWeek = rows.filter(r => daysAgo(r.date) >= 7 && daysAgo(r.date) < 14).map(r => r.bpm)
  if (thisWeek.length < 3) return null
  const avg = mean(thisWeek)
  const change = lastWeek.length >= 3 ? avg - mean(lastWeek) : null
  const tail = change == null ? '' : change === 0 ? ' · same as last week' : ` · ${Math.abs(change)} ${change < 0 ? 'lower' : 'higher'} than last week`
  return { line: `Resting heart rate ${avg}${tail}`, avg, change }
}

export type HeartConnectResult =
  | { ok: true; store: string }
  | { ok: false; reason: 'not-phone-app' | 'unavailable' | 'denied' | 'error'; store?: string }

const storeName = (p: HealthPlatform) => (p === 'ios' ? 'Apple Health' : 'Health Connect')
const sourceFor = (p: HealthPlatform) => (p === 'ios' ? 'healthkit' : 'health_connect')

/** The Profile switch: the phone's own permission sheet for heart rate, and the answer remembered. */
export async function connectHealthHeart(): Promise<HeartConnectResult> {
  const adapter = await healthAdapter()
  if (!adapter || !adapter.requestHeartAccess) return { ok: false, reason: 'not-phone-app' }
  const store = storeName(adapter.platform)
  try {
    const avail = await adapter.isAvailable()
    if (!avail.available) return { ok: false, reason: 'unavailable', store }
    const granted = await adapter.requestHeartAccess()
    // As with steps: Apple never says a read was refused, so a finished sheet counts as connected there.
    if (!granted && adapter.platform === 'android') return { ok: false, reason: 'denied', store }
    setHeartConnected(true)
    return { ok: true, store }
  } catch {
    return { ok: false, reason: 'error', store }
  }
}

export function disconnectHealthHeart(): void { setHeartConnected(false) }

/** A session's own time: a cardio log from its minutes back from when it was logged; a workout from start to finish. */
export function cardioWindow(log: { completed_at?: string | null; duration_minutes: number }): { start: Date; end: Date } | null {
  const end = log.completed_at ? new Date(log.completed_at) : null
  if (!end || Number.isNaN(end.getTime()) || !(log.duration_minutes > 0)) return null
  return { start: new Date(end.getTime() - log.duration_minutes * 60000), end }
}
export function workoutWindow(s: { started_at?: string | null; finished_at?: string | null }): { start: Date; end: Date } | null {
  if (!s.started_at || !s.finished_at) return null
  const start = new Date(s.started_at), end = new Date(s.finished_at)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || end.getTime() - start.getTime() > 6 * 3600000) return null
  return { start, end }
}

/**
 * RESTING HEART RATE FROM THE NIGHT'S READINGS (26 Nov 2026, mine, measurement). Some watches write heart rate to the
 * phone's health store and no resting figure (Samsung Health is widely reported to: Health Connect gets its heart rate,
 * steps, sleep and workouts, not resting heart rate), so Home's resting line and the "raised three mornings" check had
 * nothing to read on them. A resting figure is a low, settled heart rate, and the night is where one is: for each
 * local date, the readings between midnight and 6 am, and the figure is the one a tenth of the way up from the lowest
 * (the single lowest reading is as likely a sensor dropout as a heartbeat). It needs 8 readings or the night has no
 * figure. It reads a few beats under a daytime resting figure; every use of it compares him with his own earlier
 * nights, and it is only ever used when the store holds no resting figure at all, so the two are never mixed.
 */
const OVERNIGHT_FROM_HOUR = 0
export const OVERNIGHT_TO_HOUR = 6
export const OVERNIGHT_MIN_READINGS = 8
export function restingFromOvernight(samples: { bpm: number; at: string }[]): Map<string, number> {
  const nights = new Map<string, number[]>()
  for (const x of samples) {
    if (!isPlausibleResting(x.bpm)) continue
    const d = new Date(x.at)
    if (Number.isNaN(d.getTime()) || d.getHours() < OVERNIGHT_FROM_HOUR || d.getHours() >= OVERNIGHT_TO_HOUR) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    nights.set(key, [...(nights.get(key) ?? []), x.bpm])
  }
  const out = new Map<string, number>()
  for (const [date, bpms] of nights) {
    if (bpms.length < OVERNIGHT_MIN_READINGS) continue
    const sorted = [...bpms].sort((a, b) => a - b)
    out.set(date, Math.round(sorted[Math.floor(sorted.length * 0.1)]))
  }
  return out
}

export interface HeartSyncResult { cardio: number; workouts: number; restingDays: number }

/**
 * Called when Home opens and when the app comes back to the front, as steps are. Fills the heart rate of today's and
 * yesterday's finished sessions that have none yet, and the last 14 days' resting figures. Never throws; a failed read
 * changes nothing. Reads with select('*') so a database before the migration is just "nothing to fill".
 */
export async function syncHeartFromHealth(profileId: string, today: string, now: Date = getAppNow(profileId)): Promise<HeartSyncResult> {
  const done: HeartSyncResult = { cardio: 0, workouts: 0, restingDays: 0 }
  if (!isHealthHeartConnected()) return done
  const adapter = await healthAdapter()
  if (!adapter?.heartRateSamples || !adapter.restingHeartRateSamples) return done
  const yesterday = addDays(today, -1)
  try {
    const { data: cardio } = await supabase.from('cardio_logs').select('*').eq('user_id', profileId).in('date', [yesterday, today])
    for (const row of (cardio ?? []) as { id?: string; avg_heart_rate?: number | null; completed_at?: string | null; duration_minutes: number }[]) {
      if (!row.id || row.avg_heart_rate != null) continue
      const w = cardioWindow(row)
      if (!w) continue
      const sum = summariseHeartRate(await adapter.heartRateSamples(w.start, w.end), w.start, w.end)
      if (!sum || !looksLikeExercise(sum)) continue
      const { error } = await supabase.from('cardio_logs').update({ avg_heart_rate: sum.avg, max_heart_rate: sum.max }).eq('id', row.id)
      if (!error) done.cardio++
    }
    const { data: sessions } = await supabase.from('workout_sessions').select('*').eq('profile_id', profileId).in('date', [yesterday, today])
    for (const row of (sessions ?? []) as { id?: string; avg_heart_rate?: number | null; started_at?: string | null; finished_at?: string | null; is_completed?: boolean }[]) {
      if (!row.id || row.avg_heart_rate != null || !row.is_completed) continue
      const w = workoutWindow(row)
      if (!w) continue
      const sum = summariseHeartRate(await adapter.heartRateSamples(w.start, w.end), w.start, w.end)
      if (!sum) continue
      const { error } = await supabase.from('workout_sessions').update({ avg_heart_rate: sum.avg, max_heart_rate: sum.max }).eq('id', row.id)
      if (!error) done.workouts++
    }
    const from = new Date(now.getTime() - 14 * 86400000)
    let byDay = restingByDay(await adapter.restingHeartRateSamples(from, now))
    // A WATCH THAT SHARES NO RESTING FIGURE (restingFromOvernight says why): worked out from the night's own readings.
    // Only when the store holds none at all for the fortnight, so two methods are never mixed in one trend.
    // One read a night, not one for the fortnight: a watch writes a reading every few seconds and the store hands
    // back a capped number of them, so one long read would hold the first days only.
    if (byDay.size === 0) {
      const nights: { bpm: number; at: string }[] = []
      for (let i = 0; i < 14; i++) {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, OVERNIGHT_FROM_HOUR, 0, 0)
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, OVERNIGHT_TO_HOUR, 0, 0)
        if (start.getTime() > now.getTime()) continue
        nights.push(...await adapter.heartRateSamples(start, end.getTime() > now.getTime() ? now : end))
      }
      byDay = restingFromOvernight(nights)
    }
    const rows = [...byDay].map(([date, bpm]) => ({ profile_id: profileId, date, bpm, source: sourceFor(adapter.platform), updated_at: new Date().toISOString() }))
    if (rows.length) {
      const { error } = await supabase.from('daily_resting_heart_rate').upsert(rows, { onConflict: 'profile_id,date' })
      if (!error) done.restingDays = rows.length
    }
  } catch { /* a failed read changes nothing */ }
  return done
}

// ---------------------------------------------------------------------------
// THE STRAP'S OWN READINGS (option 3, strap-live.ts): a paired strap gives a session its figure from the readings taken
// while it ran, with no Health Connect needed. It runs BEFORE syncHeartFromHealth at every moment the two share, and
// both fill only a session with no figure yet, so where both exist the strap's is the one kept (the session's own
// readings, a second apart, against a watch's every few minutes). The same windows and the same cardio guard as above.
// Readings no session could still need are then dropped from the phone.
// ---------------------------------------------------------------------------
export async function fillHeartFromStrap(profileId: string, today: string): Promise<{ cardio: number; workouts: number }> {
  const done = { cardio: 0, workouts: 0 }
  const strap = await import('./strap-live')
  if (!strap.pairedStrap()) return done
  const yesterday = addDays(today, -1)
  // The earliest moment a session without its figure still needs readings from; nothing before it is kept.
  let keepFrom: number = Date.now()
  const needs = (start: Date) => { keepFrom = Math.min(keepFrom, start.getTime()) }
  try {
    const { data: cardio } = await supabase.from('cardio_logs').select('*').eq('user_id', profileId).in('date', [yesterday, today])
    for (const row of (cardio ?? []) as { id?: string; avg_heart_rate?: number | null; completed_at?: string | null; duration_minutes: number }[]) {
      if (!row.id || row.avg_heart_rate != null) continue
      const w = cardioWindow(row)
      if (!w) continue
      const sum = strap.strapReadingsBetween(w.start, w.end)
      if (!sum || !looksLikeExercise(sum)) continue
      const { error } = await supabase.from('cardio_logs').update({ avg_heart_rate: sum.avg, max_heart_rate: sum.max }).eq('id', row.id)
      if (!error) done.cardio++
      else needs(w.start)
    }
    const { data: sessions } = await supabase.from('workout_sessions').select('*').eq('profile_id', profileId).in('date', [yesterday, today])
    for (const row of (sessions ?? []) as { id?: string; avg_heart_rate?: number | null; started_at?: string | null; finished_at?: string | null; is_completed?: boolean }[]) {
      if (!row.id || row.avg_heart_rate != null) continue
      // A session still running needs every reading from its start.
      if (!row.is_completed) { if (row.started_at && !Number.isNaN(Date.parse(row.started_at))) needs(new Date(row.started_at)); continue }
      const w = workoutWindow(row)
      if (!w) continue
      const sum = strap.strapReadingsBetween(w.start, w.end)
      if (!sum) continue
      const { error } = await supabase.from('workout_sessions').update({ avg_heart_rate: sum.avg, max_heart_rate: sum.max }).eq('id', row.id)
      if (!error) done.workouts++
      else needs(w.start)
    }
    // Readings are kept for a cardio log typed in up to its own minutes later, so the last 2 hours always stay.
    strap.forgetStrapReadingsBefore(new Date(Math.min(keepFrom, Date.now() - 2 * 3600000)))
  } catch { /* a failed read changes nothing, and keeps every reading */ }
  return done
}

/** The last 14 days' resting figures, for Home's line. Empty before the migration or with none. */
async function readRestingHeartRate(profileId: string, today: string, days = 14): Promise<{ date: string; bpm: number }[]> {
  const from = addDays(today, -days)
  const { data, error } = await supabase.from('daily_resting_heart_rate').select('*').eq('profile_id', profileId).gte('date', from).lte('date', today)
  if (error) return []
  return ((data ?? []) as { date: string; bpm: number }[]).map(r => ({ date: r.date, bpm: r.bpm }))
}

// ---------------------------------------------------------------------------
// WHAT THE HEART RATE SAYS, read once (his "Build 1, 2 and 3 now", 25 Nov 2026; the rules are heart-trends.ts):
// the resting trend and any recovery flag, the steady sessions that now run at a lower heart rate, and the last week's
// session figures. Home's Progress, the coach's opener and the coach's context all read this one picture, so they
// cannot disagree. Every read is select('*') and names this person; a failed read is "nothing to say", never a throw.
// ---------------------------------------------------------------------------
export interface HeartPicture {
  resting: { line: string; avg: number; change: number | null } | null
  recovery: RecoveryFlag | null
  fitness: FitnessTrend[]
  sessions: { date: string; what: string; avg: number; max: number | null }[]
}

export async function readHeartPicture(profileId: string, today: string): Promise<HeartPicture> {
  const empty: HeartPicture = { resting: null, recovery: null, fitness: [], sessions: [] }
  try {
    const restingRows = await readRestingHeartRate(profileId, today, 20)
    const { data: cardio } = await supabase.from('cardio_logs').select('*').eq('user_id', profileId).gte('date', addDays(today, -84)).lte('date', today)
    const { data: lifts } = await supabase.from('workout_sessions').select('*').eq('profile_id', profileId).gte('date', addDays(today, -7)).lte('date', today)
    const cardioRows = (cardio ?? []) as (CardioHeartRow & { max_heart_rate?: number | null })[]
    const sessions = [
      ...cardioRows.filter(r => r.date >= addDays(today, -7) && Number(r.avg_heart_rate) > 0)
        .map(r => ({ date: r.date, what: `${r.activity_name} ${r.duration_minutes} min`, avg: Number(r.avg_heart_rate), max: r.max_heart_rate ?? null })),
      ...((lifts ?? []) as { date: string; split_type?: string | null; avg_heart_rate?: number | null; max_heart_rate?: number | null }[])
        .filter(r => Number(r.avg_heart_rate) > 0)
        .map(r => ({ date: r.date, what: `${r.split_type || 'Workout'} session`, avg: Number(r.avg_heart_rate), max: r.max_heart_rate ?? null })),
    ].sort((a, b) => a.date.localeCompare(b.date))
    return { resting: restingTrend(restingRows, today), recovery: recoveryFlag(restingRows, today), fitness: fitnessTrends(cardioRows), sessions }
  } catch {
    return empty
  }
}

/**
 * THE COACH IS TOLD (his "3"): facts, each with what it is, and the rule it may not cross. Empty when there is nothing,
 * so a person with no watch or strap costs the coach no words.
 */
export function heartContextForCoach(p: HeartPicture): string {
  const lines: string[] = []
  if (p.resting) lines.push(p.resting.line + '.')
  if (p.recovery) lines.push(p.recovery.line)
  for (const f of p.fitness.slice(0, 2)) lines.push(`${f.line} (same steady effort, ${f.sessions} sessions): aerobic fitness improving.`)
  for (const s of p.sessions.slice(-6)) lines.push(`${s.date}: ${s.what}, average ${s.avg}${s.max ? `, highest ${s.max}` : ''}.`)
  return lines.join('\n')
}
