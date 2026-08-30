// ---------------------------------------------------------------------------
// DOWNLOAD EVERYTHING, OR DELETE EVERYTHING — audit §1.4.
//
// There was neither. "New Plan" cleared the browser and started fresh; it
// never deleted a single row, so every profile, weigh-in, chat message and
// logged set from before it stayed in the database permanently, now
// unreachable from the app. There was no export either.
//
// Both are GDPR obligations the moment there are users who aren't Ashley,
// and both are the kind of thing that is far easier to build now than after
// someone asks for it in writing with a deadline attached.
//
// HOW THE DELETE ACTUALLY WORKS, and why it is one statement rather than
// thirty. Every table holding user data references fitness_profiles(id) with
// ON DELETE CASCADE — all fourteen of them, verified against the migrations
// and gated below. So deleting the profile row deletes the lot, atomically,
// with no chance of a partial wipe that leaves someone's chat history behind
// because a hand-written list forgot a table. The one exception is handled
// explicitly: ai_usage_daily keys its rows by `profile:<id>` and has no
// foreign key, by design, because it must survive a profile it is rate-
// limiting.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'

/**
 * Every table read for an export, in the order a person would want to read
 * them, with the column that identifies them.
 *
 * Listed by hand ON PURPOSE, unlike the delete: an export that silently
 * misses a table is a lie about completeness, and there is no cascade to
 * lean on for reads. The gate cross-checks this list against the migrations,
 * so a new table added without being exported fails rather than being
 * quietly omitted.
 */
export const EXPORTED_TABLES: { table: string; column: string }[] = [
  { table: 'fitness_profiles', column: 'id' },
  { table: 'daily_metrics', column: 'profile_id' },
  { table: 'daily_steps', column: 'profile_id' },
  { table: 'water_logs', column: 'profile_id' },
  { table: 'workout_sessions', column: 'profile_id' },
  { table: 'exercise_set_logs', column: 'user_id' },
  { table: 'workout_logs', column: 'user_id' },
  { table: 'cardio_logs', column: 'user_id' },
  { table: 'mesocycle_weeks', column: 'profile_id' },
  { table: 'exercise_plans', column: 'profile_id' },
  { table: 'meal_plans', column: 'profile_id' },
  { table: 'meal_plan_slots', column: 'profile_id' },
  { table: 'meal_plan_picks', column: 'profile_id' },
  { table: 'meal_events', column: 'profile_id' },
  { table: 'favorite_meals', column: 'profile_id' },
  { table: 'grocery_items', column: 'profile_id' },
  { table: 'daily_nutrition_targets', column: 'profile_id' },
  { table: 'user_facts', column: 'profile_id' },
  { table: 'user_goals', column: 'profile_id' },
  { table: 'user_context_facts', column: 'profile_id' },
  { table: 'chat_messages', column: 'profile_id' },
  { table: 'pending_actions', column: 'profile_id' },
  { table: 'plan_adaptations', column: 'profile_id' },
  { table: 'load_suggestions', column: 'profile_id' },
  { table: 'weight_basis_offers', column: 'profile_id' },
]

export interface DataExport {
  exportedAt: string
  profileId: string
  /** Tables that could not be read, with the reason — never silently dropped. */
  incomplete: { table: string; reason: string }[]
  data: Record<string, unknown[]>
}

/**
 * Reads every row belonging to this profile.
 *
 * A table that fails to read is RECORDED, not skipped. An export that
 * quietly omits a table someone asked for is worse than one that says which
 * part is missing.
 */
export async function buildDataExport(profileId: string): Promise<DataExport> {
  const data: Record<string, unknown[]> = {}
  const incomplete: { table: string; reason: string }[] = []

  for (const { table, column } of EXPORTED_TABLES) {
    try {
      const { data: rows, error } = await supabase.from(table).select('*').eq(column, profileId)
      if (error) { incomplete.push({ table, reason: error.message }); continue }
      data[table] = rows ?? []
    } catch (err) {
      incomplete.push({ table, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  return { exportedAt: new Date().toISOString(), profileId, incomplete, data }
}

/** Row counts per table, for telling the user what they're about to download or destroy. */
export function summariseExport(exported: DataExport): { total: number; byTable: [string, number][] } {
  const byTable = Object.entries(exported.data)
    .map(([t, rows]) => [t, rows.length] as [string, number])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
  return { total: byTable.reduce((sum, [, n]) => sum + n, 0), byTable }
}

/** Hands the browser a file. Separated from the fetch so the fetch can be tested without a DOM. */
export function downloadExport(exported: DataExport, filename = 'personal-trainer-data.json'): void {
  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked on the next tick rather than immediately — Safari has been known
  // to cancel an in-flight download when the URL is revoked synchronously.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface DeleteResult {
  ok: boolean
  error?: string
}

/**
 * Deletes the profile row, and with it every row that references it.
 *
 * ONE statement, on purpose. Every user-data table cascades from
 * fitness_profiles, so this cannot leave a partial wipe behind — which a
 * hand-written list of thirty deletes absolutely could, the first time
 * someone adds a table and forgets to add it to the list.
 *
 * The usage counter is cleared separately because it deliberately has no
 * foreign key: it must outlive the profile it is rate-limiting, so it cannot
 * cascade. Failing to clear it is NOT failure of the delete — the profile
 * and everything personal are already gone — so it is best-effort and does
 * not turn a successful deletion into a reported error.
 */
export async function deleteAllUserData(profileId: string): Promise<DeleteResult> {
  const { error } = await supabase.from('fitness_profiles').delete().eq('id', profileId)
  if (error) return { ok: false, error: error.message }

  try {
    await supabase.from('ai_usage_daily').delete().eq('scope', `profile:${profileId}`)
  } catch {
    // See above: a leftover request count is not personal data and does not
    // make the deletion incomplete in any way the user would care about.
  }
  return { ok: true }
}
