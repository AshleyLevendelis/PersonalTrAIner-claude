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

/**
 * Persists every week of a mesocycle. Replaces any existing rows for this
 * profile (used on regeneration, not just first creation).
 *
 * `preserveCreatedAt` matters because created_at anchors live-week detection
 * (C0 Part 6): a full resave of an EDITED plan (ban) must carry the original
 * creation time forward, or the delete+insert would stamp "now" and silently
 * rewind the trainee to week 1. Omit it only for a genuinely NEW plan.
 */
export async function saveMesocycle(profileId: string, weeks: MesocycleWeek[], preserveCreatedAt?: string): Promise<void> {
  if (weeks.length === 0) return

  // UPSERT FIRST, TRIM SECOND. This was `delete every row, then insert`, and
  // between those two calls the trainee had NO PLAN IN THE DATABASE. A dropped
  // connection, an RLS refusal or one bad row in there and their entire
  // periodized mesocycle was gone — and the callers' own recovery line,
  // "reopen the app to retry", is exactly when the loss became permanent:
  // restoreMesocycle returns null and App falls back to the flat, non-
  // periodized reconstruction, losing every swap, ban and adaptation.
  //
  // Five call sites reach this, including undoExerciseSwap — so tapping Undo
  // could destroy the plan it was meant to restore.
  //
  // (profile_id, week_number) is unique — saveMesocycleWeek below already
  // relies on it — so an upsert of every week is a complete replacement of
  // the overlap, and the plan is never absent at any instant.
  //
  // created_at is now written EXPLICITLY in both directions. The old code got
  // the new-plan case for free from the delete; an upsert would have left the
  // previous plan's birth date in place and silently rewound the trainee to
  // week 1 of a plan generated months ago.
  const createdAt = preserveCreatedAt ?? new Date().toISOString()
  const rows = weeks.map(week => ({ ...toRow(profileId, week), created_at: createdAt }))
  const { error } = await supabase
    .from('mesocycle_weeks')
    .upsert(rows, { onConflict: 'profile_id,week_number' })
  if (error) throw error

  // Only now, with the new plan safely stored, remove any weeks the old plan
  // had and this one does not. A failure here leaves a few stale trailing
  // weeks — visible, harmless and fixed by the next save — which is a far
  // better worst case than no plan at all.
  const highestWeek = weeks.reduce((max, w) => Math.max(max, w.week_number), 0)
  const { error: trimError } = await supabase
    .from('mesocycle_weeks')
    .delete()
    .eq('profile_id', profileId)
    .gt('week_number', highestWeek)
  if (trimError) console.error('Trimming stale mesocycle weeks failed (plan itself saved):', trimError)
}

export interface RestoredMesocycle {
  weeks: MesocycleWeek[]
  /**
   * When THIS mesocycle was generated — the anchor for live-week detection
   * (C0 Part 6). The earliest row's created_at: saveMesocycle delete+inserts
   * on regeneration, so this is genuinely the current plan's birth date, and
   * a regenerated plan restarts at week 1 automatically. Null only if the
   * rows predate the created_at column.
   */
  createdAt: string | null
}

/** Returns the full, exact mesocycle for a profile, or null if none is stored (pre-migration profile — caller should fall back to the legacy exercise_plans reconstruction). */
export async function restoreMesocycle(profileId: string): Promise<RestoredMesocycle | null> {
  const { data, error } = await supabase
    .from('mesocycle_weeks')
    .select('*')
    .eq('profile_id', profileId)
    .order('week_number', { ascending: true })

  if (error || !data || data.length === 0) return null
  const rows = data as (MesocycleWeekRow & { created_at?: string })[]
  const createdAt = rows
    .map(r => r.created_at)
    .filter((c): c is string => !!c)
    .sort()[0] ?? null
  return { weeks: rows.map(fromRow), createdAt }
}

/** Upserts a single week — used by targeted mesocycle edits (swap/ban) so a full resave isn't needed for a one-week patch. */
export async function saveMesocycleWeek(profileId: string, week: MesocycleWeek): Promise<void> {
  const { error } = await supabase
    .from('mesocycle_weeks')
    .upsert(toRow(profileId, week), { onConflict: 'profile_id,week_number' })
  if (error) throw error
}
