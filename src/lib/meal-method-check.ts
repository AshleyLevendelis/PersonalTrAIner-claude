// ---------------------------------------------------------------------------
// A RECIPE'S COOKING STEPS ARE CHECKED LIKE ITS INGREDIENTS (11 Oct 2026)
// ---------------------------------------------------------------------------
// Ashley's ruling of 9 Oct 2026, "Build all four", item 4: recipe steps are
// checked against allergies and foods to avoid. Plan:
// docs/plans/recipe-steps-checked-against-restrictions.md (tracer G: M19, M17).
//
// The method ("prep") was checked for one thing only, an amount written in the
// prose (methodSafeToShow). The allergen and avoid filters read the dish's
// name and ingredients and never the steps, so tracer G could put "fry the
// mushrooms in butter, scatter over toasted walnuts" on a chicken-and-rice
// dish for a nut-free person avoiding mushrooms, and the app accepted it and
// showed every word. And a method could name a food the dish does not have
// (M19: chilli flakes on a prawn salad whose list had none).
//
// THE RULE: a method is shown only if it is true of the ingredient list beside
// it and names nothing she must not eat. Otherwise the WHOLE method goes and
// the meal stays (the house rule already written for amounts: steps that
// disagree with the meal are worse than no steps).
//
// Leaf-weight: food-db, diet-rules, meal-ingredients and allergen-words, all
// already in the meal card's chunk. It never imports meal-generation (which
// calls it), so there is no cycle.
// ---------------------------------------------------------------------------

import { findFoodsNamedIn, foodTextWords, lookupIngredient, cookedTwinOf, weighedTwinOf, HARMLESS_WORDS } from './food-db'
import { FORBIDDEN_TAGS, type DietaryPreference } from './diet-rules'
import { containsPhrase } from './meal-ingredients'
import { ALLERGEN_FOOD_PATTERNS, DIET_WORD_PATTERNS } from './allergen-words'

/**
 * Foods a method may name without listing them: nobody lists them, and they
 * carry no tag and no calories. EVERYTHING else must be on the list, chilli
 * flakes and dried herbs included. That is the strict answer to an open
 * question of Ashley's (may a short list of seasonings appear unlisted?); the
 * strict one is built because it never shows a step for a food that is not in
 * the meal. The gate prints what each answer would cost the library.
 */
export const UNLISTED_ALLOWED: readonly string[] = ['salt', 'pepper', 'black pepper', 'ground black pepper', 'water', 'boiling water', 'cold water', 'warm water', 'ice']

export interface MethodRules {
  dietaryPreferences?: readonly string[]
  avoidFoods?: readonly string[]
}

/** Why a method was not shown — for gates and logs. Nothing on screen says it (built silent, like the amount rule; whether to say why is her question). */
export type MethodHidden =
  | { reason: 'restriction'; food: string; rule: string }
  | { reason: 'unlisted'; food: string }

const known = (p: string): p is DietaryPreference => Object.prototype.hasOwnProperty.call(FORBIDDEN_TAGS, p)
const singular = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)
/** How a method describes what was done to a listed food, never another food: "top with mashed potato" when the list has potato. */
const PREPARED_AS = new Set(['mashed', 'mash'])

/**
 * The method as it may be shown, or '' with the reason. `prep` should already
 * have passed the amount rule (methodToShow in meal-generation.ts does both).
 */
export function checkMethod(prep: string | undefined, ingredientNames: readonly string[], rules: MethodRules = {}): { text: string; hidden: MethodHidden | null } {
  const text = (prep ?? '').trim()
  if (!text) return { text: '', hidden: null }
  const hits = findFoodsNamedIn(text)
  const words = foodTextWords(text)

  // 1. RESTRICTIONS — the safety half. Runs whatever the truth rule below says.
  const prefs = (rules.dietaryPreferences ?? []).filter(known)
  for (const hit of hits) {
    for (const pref of prefs) {
      const tag = FORBIDDEN_TAGS[pref].find(t => hit.entry.tags[t])
      if (tag) return { text: '', hidden: { reason: 'restriction', food: hit.words.join(' '), rule: pref } }
    }
  }
  // Words that are not a whole food name the table knows ("nuts", "macadamia",
  // "bacon bits"), read only OUTSIDE the foods found above, so "coconut milk"
  // is a coconut milk and never "milk" for someone dairy-free.
  const covered = new Set(hits.flatMap(h => Array.from({ length: h.to - h.from }, (_, k) => h.from + k)))
  const rest = words.map((w, i) => (covered.has(i) ? '|' : w)).join(' ')
  for (const pref of prefs) {
    const patterns = [ALLERGEN_FOOD_PATTERNS[pref], ...(DIET_WORD_PATTERNS[pref] ?? [])].filter((p): p is RegExp => !!p)
    const hit = patterns.map(p => rest.match(p)?.[0]).find(Boolean)
    if (hit) return { text: '', hidden: { reason: 'restriction', food: hit, rule: pref } }
  }
  // Her foods to avoid: the avoid filter's own matcher (category words reach
  // the found foods through their tags: "pork" catches bacon), plus the avoid
  // word itself as a whole word anywhere in the steps.
  const foundNames = hits.map(h => h.entry.name)
  const plain = ` ${words.map(singular).join(' ')} `
  for (const food of rules.avoidFoods ?? []) {
    const f = food.trim()
    if (!f) continue
    const asWords = foodTextWords(f).map(singular).join(' ')
    if (containsPhrase('', foundNames, f) || (asWords && plain.includes(` ${asWords} `))) {
      return { text: '', hidden: { reason: 'restriction', food: f, rule: 'avoid' } }
    }
  }

  // 2. TRUTH (M19) — every food the steps name is in the dish. A food counts
  // as listed when it is the same entry as a line, or when each of its FOOD
  // words (not "chopped", not "mashed") is a word of some line, plurals folded:
  // "tomato" is on a list that says "cherry tomatoes", "the rice" on one that
  // says "basmati rice cooked". A word that ends a longer listed word counts
  // too ("berries" for "blueberries"); it is only ever more lenient about
  // TRUTH, never about a restriction, which section 1 has already decided.
  // A food in another state is the same food (18 Oct 2026, runs 7-10, H36): a line weighed dry or raw ("70g dry white
  // rice") is what a step calls "the cooked rice", so a listed line's cooked twin and raw or dry twin are listed too.
  const listedFoods = ingredientNames.map(n => lookupIngredient(n)).filter((e): e is NonNullable<typeof e> => e != null)
  const listedEntries = new Set(listedFoods.flatMap(e => [e, cookedTwinOf(e), weighedTwinOf(e)]).filter(e => e != null).map(e => e!.name))
  const listedWords = [...new Set(ingredientNames.flatMap(n => foodTextWords(n, true)))]
  const isListedWord = (w: string) => listedWords.includes(w) || (w.length >= 4 && listedWords.some(l => l.endsWith(w)))
  for (const hit of hits) {
    if (UNLISTED_ALLOWED.includes(hit.words.join(' '))) continue
    if (listedEntries.has(hit.entry.name)) continue
    const foodWords = foodTextWords(hit.words.join(' '), true).filter(w => !HARMLESS_WORDS.has(w) && !PREPARED_AS.has(w))
    if (foodWords.length === 0 || !foodWords.every(isListedWord)) return { text: '', hidden: { reason: 'unlisted', food: hit.words.join(' ') } }
  }
  return { text, hidden: null }
}
