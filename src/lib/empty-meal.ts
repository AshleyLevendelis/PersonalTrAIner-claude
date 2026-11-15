// ---------------------------------------------------------------------------
// A MEAL HE CHOSE THAT HAS NO DISHES IS SAID, ON THE SCREEN AND TO THE COACH (15 Nov 2026, the coeliac nurse: three meals
// a day chosen, breakfast and a snack shown, "0 OF 2 MEALS", nothing saying lunch and dinner were missing, and the coach
// invented a reason). One sentence for both, so they cannot disagree. It names what the dishes had to fit and suggests
// the avoid list, never the diet: a diet can be medical (coeliac, an allergy), and loosening it is never the app's offer.
// ---------------------------------------------------------------------------

import type { MealSlotName } from './meal-store'
import { DIETARY_OPTIONS } from './onboarding-slots'

const MEAL_WORD: Record<MealSlotName, string> = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snack: 'snack' }

function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** The meals he chose that have no dishes saved: expected meals minus the ones with any dish. */
export function emptyMealsOf(expected: readonly MealSlotName[], pools: Partial<Record<MealSlotName, readonly unknown[]>>): MealSlotName[] {
  return expected.filter(slot => (pools[slot]?.length ?? 0) === 0)
}

/** "No lunch yet. Nothing we tried fitted vegan and gluten-free, your foods to avoid (tofu, avocado) and your targets." */
export function emptyMealLine(slot: MealSlotName, dietaryPreferences: readonly string[], avoidFoods: readonly string[]): string {
  const diets = dietaryPreferences
    .map(p => DIETARY_OPTIONS.find(o => o.value === p)?.label ?? null)
    .filter((l): l is string => !!l)
    .map(l => l.toLowerCase())
  const avoid = avoidFoods.map(a => a.trim()).filter(Boolean).slice(0, 4)
  const what = [
    ...(diets.length > 0 ? [listOf(diets)] : []),
    ...(avoid.length > 0 ? [`your foods to avoid (${avoid.join(', ')})`] : []),
    'your targets',
  ]
  const tryLine = avoid.length > 0 ? ' Taking something off your foods to avoid gives it more to work with.' : ''
  return `No ${MEAL_WORD[slot]} yet. Nothing we tried fitted ${listOf(what)}.${tryLine}`
}

/** For the coach: the empty meals, so it never explains them away. Empty when none. */
export function emptyMealsForCoach(empty: readonly MealSlotName[]): string {
  if (empty.length === 0) return ''
  return `Meals with NO dishes in their plan right now: ${listOf(empty.map(s => MEAL_WORD[s]))}. Nothing that was tried fitted their diet, foods to avoid and targets. Say so plainly if asked; never say the calories were moved into other meals, and never suggest loosening their diet.`
}
