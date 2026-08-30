import type { Meal, MealPlanDay } from '@/lib/types'
import { lookupIngredient, type FoodTags } from '@/lib/food-db'

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

// ---------------------------------------------------------------------------
// WHAT "I DON'T WANT X" ACTUALLY HAS TO CATCH — audit §2.3
//
// The matcher below used to be one line: does this text appear inside that
// text. Measured against the real 333-food database, that caught 10 of the
// 122 foods a user plainly meant across eleven ordinary phrasings — 8%.
//
//   "dairy"      caught  0 of 30   (milk, cheese, yoghurt, butter, whey)
//   "seafood"    caught  0 of 11
//   "eggs"       caught  0 of  4   the database says "egg", singular
//   "mushrooms"  caught  0 of  1   the database says "mushroom"
//
// That last one is the Profile field's OWN placeholder text.
//
// Three mechanisms now, in order of precision, and none of them replaces the
// substring pass — nothing that matched before stops matching.
// ---------------------------------------------------------------------------

/**
 * Category words, resolved through the food database's OWN allergen/content
 * tags rather than through name matching.
 *
 * Deliberately NOT done with lookupIngredient: that resolver is built to find
 * the single closest entry to an ingredient line, and asked for a category
 * word it answers confidently and wrongly — "nuts" resolves to "cashews" and
 * "gluten" to "tamari". Precise for its own job, useless for this one. The
 * tags are already gated for parity between the two copies of the database
 * (test:food-db-parity), so this rides on data that cannot silently drift.
 */
const CATEGORY_TAGS: Record<string, (t: FoodTags) => boolean> = {
  dairy: t => !!t.contains_dairy,
  nut: t => !!t.contains_nuts,
  nuts: t => !!t.contains_nuts,
  fish: t => !!t.contains_fish,
  shellfish: t => !!t.contains_shellfish,
  seafood: t => !!t.contains_fish || !!t.contains_shellfish,
  egg: t => !!t.contains_egg,
  eggs: t => !!t.contains_egg,
  gluten: t => !!t.contains_gluten,
  wheat: t => !!t.contains_gluten,
  soy: t => !!t.contains_soy,
  soya: t => !!t.contains_soy,
  meat: t => !!t.contains_meat,
  pork: t => !!t.contains_pork,
  celery: t => !!t.contains_celery,
  sesame: t => !!t.contains_sesame,
  mustard: t => !!t.contains_mustard,
  honey: t => !!t.contains_honey,
  alcohol: t => !!t.contains_alcohol,
}

/**
 * The few phrases with no tag behind them, expanded to the words people would
 * have had to type instead.
 *
 * This is a VOCABULARY, not a second copy of the food database: each entry is
 * a list of words to try, and every one of them is then matched by the same
 * passes as anything the user typed directly. "Red meat" is here because the
 * database has contains_meat and contains_pork but nothing distinguishing red
 * from white — inventing that distinction by tagging 333 entries in two files
 * is a different job, and guessing it from names inside the matcher would be
 * exactly the second copy this module exists to prevent.
 */
const WORD_EXPANSIONS: Record<string, string[]> = {
  'red meat': ['beef', 'lamb', 'pork', 'mutton', 'venison', 'veal', 'gammon', 'bacon', 'steak', 'mince'],
  'spicy': ['chilli', 'chili', 'jalapeno', 'cayenne', 'sriracha', 'harissa', 'paprika', 'hot sauce'],
  'spicy food': ['chilli', 'chili', 'jalapeno', 'cayenne', 'sriracha', 'harissa', 'paprika', 'hot sauce'],
}

/**
 * Conservative singularisation, applied to BOTH sides so "eggs" finds "egg"
 * and "mushrooms" finds "mushroom".
 *
 * Deliberately not food-db's own depluralizeToken, which only fires above
 * four characters — "eggs" is exactly four, which is why the single most
 * obvious case in the whole audit was also one of the ones that failed.
 */
function singularise(word: string): string {
  if (word.length > 3 && word.endsWith('ies')) return word.slice(0, -3) + 'y'
  if (word.length > 3 && word.endsWith('oes')) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

const normaliseWords = (s: string) => s.toLowerCase().split(/\s+/).map(singularise).join(' ')

/** Does `needle` appear in `haystack` as a whole word (or whole word run)? */
function wordBoundaryContains(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack)
}

/**
 * Substring on the literal phrase, then a WORD-BOUNDARY match on the
 * singularised one.
 *
 * The two passes are deliberately different strengths. The literal pass is
 * the behaviour that already shipped, kept exactly so nothing that matched
 * before stops matching ("chick" still finds chicken, "mushroom" still finds
 * mushroom soup). The singularised pass is new, and loosening it the same way
 * overshoots badly: "nuts" singularises to "nut", and a raw substring of
 * "nut" is inside coconut and nutmeg — so turning on a nut avoidance would
 * have excluded coconut milk. Caught by this fix's own gate before it
 * shipped; whole words only.
 *
 * Foods that genuinely ARE nuts are caught by the tag pass instead, which is
 * what tags are for.
 */
function plainlyContains(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase()
  if (h.includes(needle)) return true
  const hs = normaliseWords(h)
  const ns = normaliseWords(needle)
  if (hs === h && ns === needle) return false // nothing new to try
  return wordBoundaryContains(hs, ns)
}

/** lookupIngredient is O(database) per call and this runs per ingredient per dislike — memoised per session. */
const tagCache = new Map<string, FoodTags | null>()
function tagsFor(ingredientName: string): FoodTags | null {
  const key = ingredientName.trim().toLowerCase()
  if (!tagCache.has(key)) tagCache.set(key, lookupIngredient(key)?.tags ?? null)
  return tagCache.get(key) ?? null
}

/**
 * The matcher itself, over a name and a list of ingredient names.
 *
 * Split out so the meal SWAP can use the identical rule against a PoolOption
 * (whose ingredients are objects, not strings) without keeping a second copy.
 * The audit found the swap path with no dislike check at all; giving it its
 * own matcher would have been the same mistake one layer along.
 *
 * STILL NOT a general synonym engine — "almond butter" will not find "almond
 * paste", and that limit is stated in the coach's own honesty rules. What
 * changed is that plurals and the handful of category words people actually
 * type now work, which is the difference between a filter that mostly works
 * and one that mostly doesn't.
 *
 * Widening is the correct direction to be wrong in — the same reasoning
 * already written into ALLERGEN_SIGNAL: a missed disclosure is worse than a
 * food someone could have eaten being left out. What it must NOT do is match
 * more than the word means, which is why categories come from tags: "nuts"
 * does not exclude nutmeg or coconut, neither of which is tagged as one.
 */
export function containsPhrase(name: string, ingredientNames: string[], phrase: string): boolean {
  const needle = phrase.trim().toLowerCase()
  if (!needle) return false

  // 1. Plain and singularised substring, over the dish name and every
  //    ingredient. This is the original behaviour plus plurals.
  if (plainlyContains(name, needle)) return true
  if (ingredientNames.some(i => plainlyContains(i, needle))) return true

  // 2. A category word, answered from the food database's own tags.
  const category = CATEGORY_TAGS[needle] ?? CATEGORY_TAGS[normaliseWords(needle)]
  if (category && ingredientNames.some(i => { const t = tagsFor(i); return t != null && category(t) })) return true

  // 3. A phrase with no tag behind it, expanded to words and re-run through
  //    pass 1. Never recurses further: expansions contain plain food words.
  const expansion = WORD_EXPANSIONS[needle] ?? WORD_EXPANSIONS[normaliseWords(needle)]
  if (expansion && expansion.some(w =>
    plainlyContains(name, w) || ingredientNames.some(i => plainlyContains(i, w))
  )) return true

  return false
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
