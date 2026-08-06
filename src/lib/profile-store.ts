import { supabase } from './supabase'
import type { UserProfile } from './types'

/** One thin wrapper over the direct fitness_profiles.update() calls scattered
 * across the app — used by every editable field row on the Profile screen so
 * they don't each duplicate the same supabase call. */
export async function updateProfileField(profileId: string, patch: Partial<UserProfile>): Promise<void> {
  const { error } = await supabase.from('fitness_profiles').update(patch).eq('id', profileId)
  if (error) throw error
}
