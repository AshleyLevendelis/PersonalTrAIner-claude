import { supabase } from './supabase'
import type { UserProfile } from './types'
import { isMissingColumnError } from './missing-column'

/** One thin wrapper over the direct fitness_profiles.update() calls scattered
 * across the app — used by every editable field row on the Profile screen so
 * they don't each duplicate the same supabase call. */
export async function updateProfileField(profileId: string, patch: Partial<UserProfile>): Promise<void> {
  const { error } = await supabase.from('fitness_profiles').update(patch).eq('id', profileId)
  if (!error) return
  // A COLUMN THE DATABASE HAS NOT GOT YET (missing-column.ts): the date of birth (his 9 Nov option 1) rides beside the
  // age, so before the migration the age still saves and only the birthday waits. Once, and only for that column.
  if ('date_of_birth' in patch && isMissingColumnError(error, 'date_of_birth')) {
    const { date_of_birth: _notYet, ...rest } = patch
    if (Object.keys(rest).length === 0) return
    const retry = await supabase.from('fitness_profiles').update(rest).eq('id', profileId)
    if (retry.error) throw retry.error
    return
  }
  throw error
}

/**
 * MEALS COOKED FOR HIM ELSEWHERE (Ashley, 11 Nov 2026), saved on its own because a failure has to be SAID: this
 * setting changes what every future day holds, so "it looked saved and was not" is the one outcome it must not have.
 * 'not-yet' is the database not having the column (its migration is run by hand, missing-column.ts): nothing was
 * written, and the screen says the setting is not switched on yet. Any other failure throws.
 */
export async function saveMealsElsewhere(profileId: string, answer: NonNullable<UserProfile['meals_elsewhere']>): Promise<'saved' | 'not-yet'> {
  const { error } = await supabase.from('fitness_profiles').update({ meals_elsewhere: answer }).eq('id', profileId)
  if (!error) return 'saved'
  if (isMissingColumnError(error, 'meals_elsewhere')) return 'not-yet'
  throw error
}

/**
 * A PLAN PAUSE (his ruling 14 Nov 2026, "Add a pause"): the date it began, or null to resume. Saved on its own so a
 * failure is said; 'not-yet' is the database without the column (its migration is run by hand): nothing was written.
 */
export async function savePlanPause(profileId: string, since: string | null): Promise<'saved' | 'not-yet'> {
  const { error } = await supabase.from('fitness_profiles').update({ plan_paused_since: since }).eq('id', profileId)
  if (!error) return 'saved'
  if (isMissingColumnError(error, 'plan_paused_since')) return 'not-yet'
  throw error
}

/**
 * HELPING TEST THE APP (tester toolkit, his rulings 25 Nov 2026): the date they agreed, or null when they stop. Said,
 * never assumed: 'not-yet' is the database not having the column (migration 20261125150000 is run by hand), and the
 * screen says testing is not switched on yet rather than recording someone the database cannot mark as agreeing.
 */
export async function saveTesterConsent(profileId: string, on: boolean): Promise<{ result: 'saved' | 'not-yet'; since: string | null }> {
  const since = on ? new Date().toISOString() : null
  const { error } = await supabase.from('fitness_profiles').update({ tester_since: since }).eq('id', profileId)
  if (!error) return { result: 'saved', since }
  if (isMissingColumnError(error, 'tester_since')) return { result: 'not-yet', since: null }
  throw error
}

/**
 * TODAY IS A DAY THE APP WAS USED (his ruling 26 Nov 2026: an account unused for two years is deleted, with an email a
 * month before; migration 20261126130000). Written once a day, on the first open, and never waited on. A failure
 * costs nothing today (the next open writes it again), and before the migration the column is simply not there.
 */
export async function markProfileActive(profileId: string, today: string, lastActiveOn: string | null): Promise<void> {
  if (lastActiveOn === today) return
  try {
    await supabase.from('fitness_profiles').update({ last_active_on: today }).eq('id', profileId)
  } catch {
    // Best effort: see above.
  }
}
