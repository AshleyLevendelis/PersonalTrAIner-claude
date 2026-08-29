import type { Meal, MealPlanDay } from '@/lib/types'

// ---------------------------------------------------------------------------
// WHAT IS ACTUALLY IN TODAY'S MEALS — one reader, two callers.
//
// Ashley told the coach she didn't want almond butter, then asked for it to be
// removed from her plan. It replied: "Looking at your plan for today, none of
// your scheduled meals actually contain almond butter, so you're all set."
// Her breakfast contained 13g of it.
//
// It was not a lookup that went wrong. It was a lookup that could not happen:
// the coach's entire view of food was dish names and macros
// ("Greek Yoghurt Berry Crunch Bowl (584 kcal, P:35g …)"), with no
// ingredients anywhere in it. Asked whether a specific ingredient was there,
// the model had nothing to read and answered confidently anyway.
//
// THE APP KNEW, AND HAD SAID SO ONE MESSAGE EARLIER. The memory receipt
// scanned the same mealPlan across item.ingredients and printed "Today's
// Breakfast — still has it". The dish name does not contain the words "almond
// butter", so that row can only have matched the ingredients array — proof the
// data was populated and sitting one function away from what the coach was
// handed. The transcript has the app right and the model wrong about the same
// fact, two messages apart.
//
// So the fix is not "also send ingredients". It is that the scan which decides
// a meal CONTAINS something and the text which tells the coach what a meal
// contains must be the same reader. Two copies of that rule is exactly how
// they diverged; test:coach-sees-ingredients asserts they cannot.
// ---------------------------------------------------------------------------

/** Everything a meal is made of, as plain lowercase-comparable names. */
export function ingredientNamesOf(item: Meal): string[] {
  return (item.ingredients ?? []).map(i => i.trim()).filter(Boolean)
}

/**
 * Does this item contain `phrase`?
 *
 * Plain substring over the name AND the ingredients, deliberately matching
 * verifyProposal's own filter (meal-generation.ts) rather than being cleverer
 * than it: a dislike the generator would act on must be one the app reports,
 * and vice versa. Substring, so "mushroom" also catches "mushroom soup".
 *
 * NOT synonym-aware — "almond butter" will not find "almond paste". That limit
 * is real, is stated in the coach's own honesty rules, and is not this
 * function's to quietly paper over.
 */
export function itemContains(item: Meal, phrase: string): boolean {
  return containsPhrase(item.name, ingredientNamesOf(item), phrase)
}

/**
 * The matcher itself, over a name and a list of ingredient names.
 *
 * Split out so the meal SWAP can use the identical rule against a PoolOption
 * (whose ingredients are objects, not strings) without keeping a second copy.
 * The audit found the swap path with no dislike check at all; giving it its
 * own matcher would have been the same mistake one layer along.
 */
export function containsPhrase(name: string, ingredientNames: string[], phrase: string): boolean {
  const needle = phrase.trim().toLowerCase()
  if (!needle) return false
  return name.toLowerCase().includes(needle)
    || ingredientNames.some(i => i.toLowerCase().includes(needle))
}

/** The meal slots on this plan that contain `phrase`, in plan order. */
export function mealsContaining(mealPlan: MealPlanDay[], phrase: string): MealPlanDay[] {
  const needle = phrase.trim().toLowerCase()
  if (!needle) return []
  return mealPlan.filter(m => m.items.some(i => itemContains(i, needle)))
}

/**
 * How many ingredients get named per item before the line is truncated.
 *
 * A cap, because a day of long recipes should not crowd out the rest of the
 * coach's context — but truncation is ANNOUNCED (see below). A shortened list
 * silently read as complete would reproduce this whole bug in a new place:
 * the model would once again be reasoning from a partial view it believed was
 * total.
 */
export const MAX_INGREDIENTS_SHOWN = 12

/** The marker appended when an item has more ingredients than are shown. */
export function truncationNote(total: number): string {
  return `+${total - MAX_INGREDIENTS_SHOWN} more not listed`
}

/**
 * The food half of the coach's context.
 *
 * Names only, no quantities. Enough to answer "is X in this?" — which is what
 * the model was getting wrong — and deliberately not enough to invite it to
 * recompute macros, which it is forbidden to state anywhere else.
 *
 * An item with NO ingredient list says so in words rather than rendering an
 * empty bracket, because "(no ingredients)" and "" read identically as absence
 * to a model but mean different things: one is a dish we have no breakdown
 * for, the other is a formatting accident.
 */
export function buildCoachMealSummary(mealPlan: MealPlanDay[]): string {
  return mealPlan
    .map(m => {
      const items = m.items.map(i => {
        const macros = `${i.calories} kcal, P:${i.protein}g C:${i.carbs}g F:${i.fat}g`
        const all = ingredientNamesOf(i)
        if (all.length === 0) return `${i.name} (${macros}) — ingredients not recorded for this dish`
        const shown = all.slice(0, MAX_INGREDIENTS_SHOWN)
        const tail = all.length > MAX_INGREDIENTS_SHOWN ? `, ${truncationNote(all.length)}` : ''
        return `${i.name} (${macros}) — contains: ${shown.join(', ')}${tail}`
      })
      return `${m.meal}: ${items.join(' | ')}`
    })
    .join('\n')
}
