// ---------------------------------------------------------------------------
// CALORIES FOR A WEIGHTS SESSION, FROM THE WATCH (his request 27 Nov 2026, "my watch was on the weight session ... it
// didn't log any calories burned"; his ruling "Yes, with the database step"). The watch sends its count when he ends the
// workout on it; it is kept on the day's session row and shown on the summary. For information only: calories burned
// never change the food target (his 25 Nov 2026 rule, activity-recording.ts).
//
// KEPT ON THE PHONE FIRST. The figure is written here before the database is asked, so a session with no signal, a
// session row not made yet, or a database before the migration (20261127150000) still shows it; it is sent again on the
// next read until the row holds it.
// ---------------------------------------------------------------------------
import { supabase } from './supabase'
import { isMissingColumnError } from './missing-column'

const key = (profileId: string, date: string) => `fitplan_session_kcal_${profileId}_${date}`
const listeners = new Set<() => void>()

/** A believable count for one session: whole, above nothing, under 5,000. */
function sessionKcal(v: unknown): number | null {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : NaN
  return n > 0 && n < 5000 ? n : null
}

function keep(profileId: string, date: string, kcal: number | null): void {
  try { if (kcal == null) localStorage.removeItem(key(profileId, date)); else localStorage.setItem(key(profileId, date), String(kcal)) } catch { /* the database still has it */ }
}

function kept(profileId: string, date: string): number | null {
  try { return sessionKcal(Number(localStorage.getItem(key(profileId, date)))) } catch { return null }
}

/** Write the count to the day's session row; true once the row holds it. */
async function send(profileId: string, date: string, kcal: number): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('workout_sessions').update({ active_kcal: kcal }).eq('profile_id', profileId).eq('date', date).select('id')
    if (error) return false
    return Array.isArray(data) && data.length > 0
  } catch { return false }
}

/** The watch's count for a day's session: kept on the phone at once, then saved to the session row. */
export async function saveSessionCalories(profileId: string, date: string, raw: unknown): Promise<boolean> {
  const kcal = sessionKcal(raw)
  if (kcal == null) return false
  keep(profileId, date, kcal)
  listeners.forEach(l => l())
  if (await send(profileId, date, kcal)) keep(profileId, date, null)
  return true
}

/** The session's calories: the row's, else the phone's kept copy (sent again on the way). Null when there are none. */
export async function readSessionCalories(profileId: string, date: string): Promise<number | null> {
  const local = kept(profileId, date)
  try {
    const { data, error } = await supabase.from('workout_sessions').select('*').eq('profile_id', profileId).eq('date', date)
    if (error && isMissingColumnError(error, 'active_kcal')) return local
    const row = (data ?? [])[0] as { active_kcal?: number | null } | undefined
    const stored = sessionKcal(row?.active_kcal)
    if (stored != null) { if (local != null) keep(profileId, date, null); return stored }
    if (local != null && row && await send(profileId, date, local)) keep(profileId, date, null)
  } catch { /* the phone's copy answers */ }
  return local
}

export function subscribeSessionCalories(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

// ---------------------------------------------------------------------------
// THE WATCH'S RUNNING COUNT (27 Nov 2026, the two gaps after "didn't log any calories burned"): each heart rate batch
// carries what the watch's workout has counted so far. A weights session keeps it as the session's calories as it goes
// (sent to the database at most once a minute), so ending on the phone alone still has them; a cardio workout keeps its
// latest count, so a walk ended on the phone takes the watch's figure, not an estimate or nothing.
// ---------------------------------------------------------------------------
const CARDIO_KEY = 'fitplan_watch_cardio_kcal'
const SEND_EVERY_MS = 60_000
let lastSentAt = 0

/** One heart rate batch's running count, filed by the workout it belongs to. */
export async function noteWatchRunningKcal(profileId: string, e: Record<string, unknown>, now = Date.now()): Promise<void> {
  const kcal = sessionKcal(e.kcal)
  const startedAt = typeof e.startedAt === 'number' && Number.isFinite(e.startedAt) ? e.startedAt : null
  if (kcal == null || startedAt == null) return
  if (e.kind === 'lift' && typeof e.date === 'string') {
    keep(profileId, e.date, kcal)
    listeners.forEach(l => l())
    if (now - lastSentAt >= SEND_EVERY_MS) { lastSentAt = now; if (await send(profileId, e.date, kcal)) keep(profileId, e.date, null) }
  } else if (e.kind === 'cardio' && typeof e.activity === 'string') {
    try { localStorage.setItem(CARDIO_KEY, JSON.stringify({ activity: e.activity, startedAt, kcal })) } catch { /* the end event still carries it */ }
  }
}

/** The watch's count for a workout of this name started within two minutes of `startedAtIso`, or null. */
export function watchCardioKcalFor(activity: string, startedAtIso: string): number | null {
  try {
    const v = JSON.parse(localStorage.getItem(CARDIO_KEY) ?? 'null') as { activity?: string; startedAt?: number; kcal?: number } | null
    const start = Date.parse(startedAtIso)
    if (!v || typeof v.startedAt !== 'number' || !Number.isFinite(start)) return null
    if ((v.activity ?? '').trim().toLowerCase() !== activity.trim().toLowerCase() || Math.abs(v.startedAt - start) >= 120_000) return null
    return sessionKcal(v.kcal)
  } catch { return null }
}
