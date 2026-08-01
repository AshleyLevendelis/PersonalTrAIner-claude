import { supabase } from './supabase'
import type { MesocycleWeek } from './types'
import { toRow, fromRow, type MesocycleWeekRow } from './mesocycle-shape'

// ---------------------------------------------------------------------------
// Full-fidelity mesocycle round-trip (see the mesocycle_weeks migration for
// the schema rationale). `exercise_plans` deliberately stays untouched here —
// it still backs the chat assistant's schedule-patch feature and remains the
// legacy restore path for profiles created before this table existed.
// ---------------------------------------------------------------------------

export type { MesocycleWeekRow }
export { toRow, fromRow }

/** Persists every week of a freshly generated mesocycle. Replaces any existing rows for this profile (used on regeneration, not just first creation). */
export async function saveMesocycle(profileId: string, weeks: MesocycleWeek[]): Promise<void> {
  if (weeks.length === 0) return
  await supabase.from('mesocycle_weeks').delete().eq('profile_id', profileId)
  const rows = weeks.map(week => toRow(profileId, week))
  const { error } = await supabase.from('mesocycle_weeks').insert(rows)
  if (error) throw error
}

/** Returns the full, exact mesocycle for a profile, or null if none is stored (pre-migration profile — caller should fall back to the legacy exercise_plans reconstruction). */
export async function restoreMesocycle(profileId: string): Promise<MesocycleWeek[] | null> {
  const { data, error } = await supabase
    .from('mesocycle_weeks')
    .select('*')
    .eq('profile_id', profileId)
    .order('week_number', { ascending: true })

  if (error || !data || data.length === 0) return null
  return (data as MesocycleWeekRow[]).map(fromRow)
}

/** Upserts a single week — used by targeted mesocycle edits (swap/ban) so a full resave isn't needed for a one-week patch. */
export async function saveMesocycleWeek(profileId: string, week: MesocycleWeek): Promise<void> {
  const { error } = await supabase
    .from('mesocycle_weeks')
    .upsert(toRow(profileId, week), { onConflict: 'profile_id,week_number' })
  if (error) throw error
}
