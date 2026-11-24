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

export interface HeartSummary { avg: number; max: number; readings: number }

const isPlausibleBpm = (n: number) => Number.isFinite(n) && n >= 30 && n <= 230
const isPlausibleResting = (n: number) => Number.isFinite(n) && n >= 25 && n <= 140

/** The average and highest heart rate between two instants, or null with fewer than three believable readings. */
export function summariseHeartRate(samples: { bpm: number; at: string }[], start: Date, end: Date): HeartSummary | null {
  const s = start.getTime(), e = end.getTime()
  const inside = samples.filter(x => isPlausibleBpm(x.bpm) && Date.parse(x.at) >= s && Date.parse(x.at) <= e).map(x => x.bpm)
  if (inside.length < 3) return null
  const avg = Math.round(inside.reduce((a, b) => a + b, 0) / inside.length)
  return { avg, max: Math.round(Math.max(...inside)), readings: inside.length }
}

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
    const byDay = restingByDay(await adapter.restingHeartRateSamples(from, now))
    const rows = [...byDay].map(([date, bpm]) => ({ profile_id: profileId, date, bpm, source: sourceFor(adapter.platform), updated_at: new Date().toISOString() }))
    if (rows.length) {
      const { error } = await supabase.from('daily_resting_heart_rate').upsert(rows, { onConflict: 'profile_id,date' })
      if (!error) done.restingDays = rows.length
    }
  } catch { /* a failed read changes nothing */ }
  return done
}

/** The last 14 days' resting figures, for Home's line. Empty before the migration or with none. */
export async function readRestingHeartRate(profileId: string, today: string): Promise<{ date: string; bpm: number }[]> {
  const from = addDays(today, -14)
  const { data, error } = await supabase.from('daily_resting_heart_rate').select('*').eq('profile_id', profileId).gte('date', from).lte('date', today)
  if (error) return []
  return ((data ?? []) as { date: string; bpm: number }[]).map(r => ({ date: r.date, bpm: r.bpm }))
}
