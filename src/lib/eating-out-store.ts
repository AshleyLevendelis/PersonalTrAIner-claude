// ---------------------------------------------------------------------------
// The one write eating-out.ts needs beyond the shared add-a-meal road: taking a day's meal-out rows away, by their
// name ("Dinner out (Friday)"), so marking it again at another size replaces it rather than leaving two, and "Not
// eating out" leaves nothing behind. The name is the app's own and names one meal on one weekday.
// ---------------------------------------------------------------------------
import { supabase } from './supabase'
import type { MealSlotName } from './meal-store'

/** Removes every pool row of that meal with that name. True when the delete went through. */
export async function removeEatingOutOptions(profileId: string, slot: MealSlotName, name: string): Promise<boolean> {
  const { error } = await supabase.from('meal_plan_slots').delete().eq('profile_id', profileId).eq('slot', slot).eq('name', name)
  return !error
}
