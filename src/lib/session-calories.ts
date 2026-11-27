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
