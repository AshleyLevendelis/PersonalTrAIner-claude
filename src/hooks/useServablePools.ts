import { useMemo } from 'react'
import { compileFoodDislikes } from '@/lib/fact-compiler'
import { markRestrictionBreakers } from '@/lib/meal-restriction-check'
import type { PoolOption } from '@/lib/meal-generation'
import type { MealSlotName } from '@/lib/meal-store'
import type { UserFactRow } from '@/lib/memory-store'

/**
 * THE POOLS EVERY DAY IS ASSEMBLED FROM: the stored pools, with each meal that
 * breaks one of her CURRENT restrictions or foods to avoid marked.
 *
 * Ashley's ruling, 27 Sep 2026, from three options: a kept meal that breaks a
 * restriction added since is not served ("stop serving it"), and a like never
 * picks one. assembleDay obeys the mark; this is the one place it is set.
 *
 * A HOOK, SHARED WITH THE BROWSER HARNESS, the same way useMealDays is, so a
 * driver runs the app's marking and not a copy of it. `facts` rather than a
 * compiled list because compiling makes a fresh array on every render, which
 * would rebuild every day of the week on every keystroke.
 */
export function useServablePools(
  stored: Partial<Record<MealSlotName, PoolOption[]>>,
  dietaryPreferences: string[] | null | undefined,
  facts: UserFactRow[],
): Partial<Record<MealSlotName, PoolOption[]>> {
  return useMemo(
    () => markRestrictionBreakers(stored, dietaryPreferences ?? [], compileFoodDislikes(facts)),
    [stored, dietaryPreferences, facts],
  )
}
