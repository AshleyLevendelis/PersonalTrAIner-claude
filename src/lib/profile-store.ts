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
