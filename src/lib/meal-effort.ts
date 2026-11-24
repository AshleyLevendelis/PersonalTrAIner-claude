import { lookupIngredient, isToTaste } from './food-db'
import { parseIngredientLine } from './portion-scaler'
import type { CookingTimePreference } from './types'

// ---------------------------------------------------------------------------
// HOW MUCH COOKING A DISH ASKS FOR (23 Nov 2026; docs/plans/simple-meals.md).
//
// Ashley, 23 Nov 2026: "The meals are too complicated. Users are required to become gourmet chefs." Measured that day
// on our own library: the typical dish had six ingredients, over half had six or more, and 7 of 143 snacks were one or
// two foods. The meal writer was also told "You are a chef" and asked for names like "Sichuan Mapo Tofu with Charred
// Bok Choy". He delegated the fix ("Do whatever you think is best").
//
// A SIMPLE DISH is one a person can make on a weekday without a recipe: five main foods or fewer (a snack, two), and
// nothing to shape, layer, batter or make a sauce from. What counts as a "main food" is everything except the things
// already in a kitchen: the seasonings the app already treats as "to taste" (salt, pepper, garlic, lemon, dried spices,
// herbs) and cooking oil. Read off the food the line names, never off the words, so "bell pepper" is a food and
// "black pepper" is not.
//
// WHAT IT DECIDES (meal-library.ts, meal-generation.ts): unless someone has said they love cooking, the simple dishes
// fill a plan first, and a complicated one comes in only as a minority (most simple, the odd recipe) or, for someone
// who said "Quick", only when a meal is thin. It never decides whether a dish is SERVED: the day's numbers still do.
// ---------------------------------------------------------------------------

/** Main foods a simple meal may hold. */
const SIMPLE_MAIN_FOODS = 5
/** Foods a simple snack may hold: "a snack should be yoghurt and fruit". */
const SIMPLE_SNACK_FOODS = 2

const COOKING_OILS = new Set(['olive oil', 'vegetable oil', 'coconut oil', 'sesame oil', 'peanut oil', 'safflower oil'])

/** Steps that make a dish a recipe rather than a plate: shaping, layering, a batter, a dough, a made sauce. */
const INVOLVED_STEP = /\b(?:batter|shape (?:into|them|the|it)|roll (?:into|them|it) (?:into )?(?:small )?balls?|into balls|layer (?:the|it|them)|a ladle at a time|knead|dough|marinate|roux|white sauce|whisk the flour|pastry)\b/i

/** True for a line the cook already has in the kitchen (a seasoning or cooking oil), so it is not a "main food". */
function isPantryLine(name: string): boolean {
  const entry = lookupIngredient(name)
  if (!entry) return false
  return isToTaste(entry) || COOKING_OILS.has(entry.name)
}

/** How many main foods a dish holds, from its ingredient names (as written, or parsed). */
export function mainFoodCount(ingredientNames: readonly string[]): number {
  return ingredientNames.filter(n => !isPantryLine(n)).length
}

/** The ingredient names of a library or writer dish ("150g raw chicken breast" -> "raw chicken breast"). */
export function namesOfLines(lines: readonly string[]): string[] {
  return lines.map(l => parseIngredientLine(l).name)
}

/** True when the dish is one a person can make without a recipe (see the header). */
export function isSimpleDish(slot: string, ingredientNames: readonly string[], prep: string | undefined): boolean {
  const limit = slot === 'snack' ? SIMPLE_SNACK_FOODS : SIMPLE_MAIN_FOODS
  if (mainFoodCount(ingredientNames) > limit) return false
  return !INVOLVED_STEP.test(prep ?? '')
}

/**
 * Whether one more COMPLICATED dish may join a meal that already holds `simple` simple dishes and `complicated`
 * complicated ones, for this cooking preference. Read off what the meal HOLDS, not off its ceiling: measured on new
 * plans, a meal keeps about 40 dishes (not the 100 allowed), because a dish must land a day on target, so a quarter of
 * the ceiling was 60% of the meal.
 *  - Happy to cook: always.
 *  - Moderate (the default): while complicated dishes stay under a quarter of the meal, so about two of a week's eight
 *    dishes a meal are a proper recipe.
 *  - Quick: never.
 * Either way a complicated dish still comes in while the meal is thin (fewer than THIN_MEAL dishes), so a diet the
 * simple dishes cannot feed is never left without choices.
 */
export function mayAddComplicated(pref: CookingTimePreference | undefined, simple: number, complicated: number): boolean {
  if (simple + complicated < THIN_MEAL) return true
  if (pref === 'loves_cooking') return true
  if (pref === 'quick') return false
  return 4 * (complicated + 1) <= simple + complicated + 1
}

/** Below this many dishes a meal is thin, and a complicated dish is better than no choice (as STAND_IN_FLOOR). */
export const THIN_MEAL = 20
