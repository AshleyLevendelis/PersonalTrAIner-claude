import { computeMealMacros, type MealIngredientLine } from './food-db'
import type { MacroTargets } from './types'

// ---------------------------------------------------------------------------
// A STORED MEAL IS COSTED AS IT IS WEIGHED (15 Oct 2026, H32; docs/plans/
// meals-costed-as-weighed.md).
//
// A meal's numbers were worked out once, when it was made, and stored with it.
// The card, the day's totals, the day search, the refit and top-up offers and
// the coach all read the stored numbers, so a meal made before the lookup
// learnt "raw" and "dry" (11 Oct) kept costing "177g raw chicken breast" as
// cooked breast and "53g dry couscous" as cooked couscous: 459 kcal on a card
// for a dish that weighs in at about 520, with 10 g more protein and 29 g
// fewer carbs than the food holds. The lookup was right; nothing asked it.
//
// So the one read of stored meals asks it again, here.
// ---------------------------------------------------------------------------

/** The share of a meal that must be costed for its numbers to stand. verifyProposal refuses a new meal under it. */
export const MIN_COVERAGE = 0.8

/**
 * The numbers a stored meal is shown and counted with: its own lines, costed
 * with today's food table, when today's table can cost them as well as it
 * would cost a NEW meal (every amount understood, at least MIN_COVERAGE of it
 * costed). Otherwise the stored numbers, whole. Never a mix of the two line by
 * line: a line the table no longer knows would otherwise vanish from the count
 * while the rest moved, which is a smaller number for the same food.
 */
export function costStoredMeal(ingredients: unknown, stored: MacroTargets): { macros: MacroTargets; recosted: boolean } {
  const lines = Array.isArray(ingredients) ? ingredients : []
  const readable = lines.length > 0 && lines.every(l =>
    l != null && typeof l === 'object' && typeof (l as MealIngredientLine).name === 'string'
    && typeof (l as MealIngredientLine).quantity === 'number' && Number.isFinite((l as MealIngredientLine).quantity)
    && typeof (l as MealIngredientLine).unit === 'string')
  if (!readable) return { macros: stored, recosted: false }
  const costed = computeMealMacros(lines as MealIngredientLine[])
  if (!costed.amountsUnderstood || costed.coverage < MIN_COVERAGE) return { macros: stored, recosted: false }
  return { macros: { calories: costed.kcal, protein: costed.protein, carbs: costed.carbs, fat: costed.fat }, recosted: true }
}
