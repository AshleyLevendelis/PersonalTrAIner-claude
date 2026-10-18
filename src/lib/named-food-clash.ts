// ---------------------------------------------------------------------------
// A FOOD SHE NAMES IS CHECKED AGAINST WHAT SHE CANNOT EAT, BEFORE ANYTHING IS OFFERED (runs 7-10, H41, 18 Oct 2026).
//
// Sam (tree-nut allergy, stored as the nut-free filter) asked "can you swap today's snack for almond butter on
// toast?". The coach offered a protein-shake swap card and said nothing about nuts; asked "why not the almond
// butter?", it offered to add it as a custom dish and only then mentioned a nut allergy. Every existing guard checks
// the meals the APP picks; nothing read the food she NAMED. This does, through the food database's own scanner and
// the diet rules' own tags, so it cannot disagree with the filter that keeps nuts out of her plan.
//
// HER RULING, 18 Oct 2026, from three options: "Say 'nut-free'". The app stores an allergy and a diet choice the same
// way, so the sentence says what is stored ("your profile says nut-free"), never "you're allergic", which would be
// untrue for someone who avoids nuts by choice. docs/plans/runs-7-10-batch-1-safety.md.
// ---------------------------------------------------------------------------
import { findFoodsNamedIn, foodTextWords, type FoodEntry } from './food-db'
import { FORBIDDEN_TAGS, type DietaryPreference } from './diet-rules'
import { ALLERGEN_FOOD_PATTERNS } from './allergen-words'
import { containsPhrase } from './meal-ingredients'

/** The allergen filters: the restrictions whose clash opens the reply with her sentence (the allergen band). */
const ALLERGEN_RESTRICTIONS: DietaryPreference[] = [
  'nut-free', 'dairy-free', 'gluten-free', 'egg-free', 'soy-free', 'shellfish-free', 'fish-free',
  'celery-free', 'sesame-free', 'mustard-free', 'lupin-free', 'sulphite-free',
]

/** What a restriction keeps out, in the words the sentence uses ("has tree nuts in it"). */
const CONTAINS_WORDS: Partial<Record<DietaryPreference, string>> = {
  'nut-free': 'tree nuts', 'dairy-free': 'dairy', 'gluten-free': 'gluten', 'egg-free': 'egg', 'soy-free': 'soy',
  'shellfish-free': 'shellfish', 'fish-free': 'fish', 'celery-free': 'celery', 'sesame-free': 'sesame',
  'mustard-free': 'mustard', 'lupin-free': 'lupin', 'sulphite-free': 'sulphites',
  vegetarian: 'meat or fish', vegan: 'animal products', pescatarian: 'meat', halal: 'pork or alcohol', kosher: 'pork or shellfish',
}

/**
 * Words before a food that mean she is NOT asking for it: "no nuts", "without almond butter", "instead of the
 * peanut butter", "I'm allergic to cashews". Deliberately not "not": "why not the almond butter?" IS asking for it.
 */
const NOT_ASKING = /\b(no|without|instead of|rather than|allergic to|allergy to|avoid|avoiding|except|minus|free of|swap out|take out|leave out)\s+(?:the\s+|any\s+|my\s+)?$/i

export interface FoodClash {
  /** The food as she wrote it, e.g. "almond butter". */
  food: string
  /** Set for a diet restriction (allergen filter or a diet); absent for the avoid list. */
  restriction?: DietaryPreference
  /** Set when the clash is with her avoid list ("mushrooms"). */
  avoided?: string
  /** True when the restriction is an allergen filter, which opens the reply with her sentence. */
  allergen: boolean
}

function clashingRestriction(entry: FoodEntry, prefs: DietaryPreference[]): DietaryPreference | null {
  for (const p of prefs) {
    const tags = FORBIDDEN_TAGS[p] ?? []
    if (tags.some(t => (entry.tags as Record<string, boolean | undefined>)[t])) return p
  }
  return null
}

/** The first food her message names that one of her restrictions or avoids keeps out; null when there is none. */
export function namedFoodClash(message: string, dietaryPreferences: string[], dislikedFoods: string[] = []): FoodClash | null {
  const text = message ?? ''
  if (!text.trim()) return null
  const prefs = dietaryPreferences.filter((p): p is DietaryPreference => p in FORBIDDEN_TAGS)
  // Allergen filters first: a dish that clashes with both an allergen and a diet is reported as the allergen.
  const ordered = [...prefs.filter(p => ALLERGEN_RESTRICTIONS.includes(p)), ...prefs.filter(p => !ALLERGEN_RESTRICTIONS.includes(p))]
  const words = foodTextWords(text)
  const notAsking = (from: number) => NOT_ASKING.test(`${words.slice(Math.max(0, from - 4), from).join(' ')} `)

  // 1. Foods the database knows, with their own tags — the same tags the meal filter reads.
  const hits = findFoodsNamedIn(text)
  for (const hit of hits) {
    // "nut-free" / "dairy free" name the restriction, not a food she wants.
    if (notAsking(hit.from) || words[hit.to] === 'free') continue
    const p = clashingRestriction(hit.entry, ordered)
    if (p) return { food: hit.words.join(' '), restriction: p, allergen: ALLERGEN_RESTRICTIONS.includes(p) }
  }
  // 2. Allergen words the database has no entry for ("macadamia"), from the one shared word list.
  for (const p of ordered) {
    const re = ALLERGEN_FOOD_PATTERNS[p]
    if (!re) continue
    const m = re.exec(text)
    if (!m) continue
    const before = foodTextWords(text.slice(0, m.index))
    const after = text.slice(m.index + m[0].length)
    if (NOT_ASKING.test(`${before.slice(-4).join(' ')} `) || /^\s*-?\s*free\b/i.test(after)) continue
    return { food: m[0].toLowerCase(), restriction: p, allergen: ALLERGEN_RESTRICTIONS.includes(p) }
  }
  // 3. Her avoid list, through the dislike filter's own matcher. The foods the message names are handed to it as
  //    the "ingredients", so a category word is answered from the food database's tags ("pork" catches bacon).
  for (const avoided of dislikedFoods) {
    if (!avoided.trim()) continue
    const named = hits.filter(h => !notAsking(h.from) && containsPhrase('', [h.words.join(' ')], avoided))
    if (named.length > 0) return { food: named[0].words.join(' '), avoided: avoided.trim(), allergen: false }
    if (!containsPhrase(text, [], avoided)) continue
    const at = words.findIndex((_, i) => containsPhrase(words.slice(i).join(' '), [], avoided))
    if (at >= 0 && notAsking(at)) continue
    return { food: avoided.trim().toLowerCase(), avoided: avoided.trim(), allergen: false }
  }
  return null
}

/** What the allergy is called, for the line that says where to change it ("a nut allergy"). */
const ALLERGY_WORDS: Partial<Record<DietaryPreference, string>> = {
  'nut-free': 'nut', 'dairy-free': 'dairy', 'gluten-free': 'gluten', 'egg-free': 'egg', 'soy-free': 'soy',
  'shellfish-free': 'shellfish', 'fish-free': 'fish', 'celery-free': 'celery', 'sesame-free': 'sesame',
  'mustard-free': 'mustard', 'lupin-free': 'lupin', 'sulphite-free': 'sulphite',
}

/**
 * HER SECOND RULING, 18 Oct 2026, on what follows the sentence: "If the user has specified an allergy dont offer to
 * add it to a meal. Refuse and say if they dont have an allergy they should go to the settings and update the
 * allergy." So an allergen clash is answered with the sentence and where to change it — Profile, Food, Diet, the one
 * screen that edits the restriction — and nothing else. Null for a diet or the avoid list.
 */
export function allergyRefusal(c: FoodClash): string | null {
  if (!c.allergen || !c.restriction) return null
  const word = ALLERGY_WORDS[c.restriction] ?? 'food'
  const a = /^[aeiou]/i.test(word) ? 'an' : 'a'
  return `${clashSentence(c)} If you don't have ${a} ${word} allergy, change it on Profile, under Food, Diet.`
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}
/** "almond butter" has, "almonds" have; "hummus" and "couscous" are not plurals. */
function isPlural(food: string): boolean {
  const last = food.trim().split(/\s+/).pop() ?? ''
  return /[^su]s$/i.test(last)
}

/**
 * HER SENTENCE (18 Oct 2026): "Almond butter has tree nuts in it, and your profile says nut-free, so I won't suggest
 * it or add it to your meals." The same shape for every restriction; the avoid list says it is on the list.
 */
export function clashSentence(c: FoodClash): string {
  const food = capitalise(c.food)
  const plural = isPlural(c.food)
  const it = plural ? 'them' : 'it'
  if (c.restriction) {
    const has = plural ? 'have' : 'has'
    // Peanuts are not tree nuts; the nut-free filter keeps out both, and the sentence names the right one.
    const what = c.restriction === 'nut-free' && /peanut/i.test(c.food) ? 'peanuts' : CONTAINS_WORDS[c.restriction] ?? 'something'
    return `${food} ${has} ${what} in ${it}, and your profile says ${c.restriction}, so I won't suggest ${it} or add ${it} to your meals.`
  }
  const are = plural ? 'are' : 'is'
  return `${food} ${are} on your avoid list, so I won't suggest ${it} or add ${it} to your meals.`
}
