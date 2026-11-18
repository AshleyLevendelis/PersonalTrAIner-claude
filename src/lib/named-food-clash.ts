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
import { calamariSaid, findFoodsNamedIn, foodTextWords, kindsItCouldBe, lookupIngredient, type FoodEntry } from './food-db'
import { FORBIDDEN_TAGS, type DietaryPreference } from './diet-rules'
import { ALLERGEN_FOOD_PATTERNS } from './allergen-words'
import { containsPhrase } from './meal-ingredients'
import { allergyForRule, allergyName, type AllergyRecord } from './allergies'

/** The allergen filters: the restrictions whose clash opens the reply with her sentence (the allergen band). */
const ALLERGEN_RESTRICTIONS: DietaryPreference[] = [
  'nut-free', 'dairy-free', 'gluten-free', 'egg-free', 'soy-free', 'shellfish-free', 'fish-free',
  'celery-free', 'sesame-free', 'mustard-free', 'lupin-free', 'sulphite-free',
  'peanut-free', 'tree-nut-free', 'oat-free',
]

/** What a restriction keeps out, in the words the sentence uses ("has tree nuts in it"). */
const CONTAINS_WORDS: Partial<Record<DietaryPreference, string>> = {
  'nut-free': 'tree nuts', 'dairy-free': 'dairy', 'gluten-free': 'gluten', 'egg-free': 'egg', 'soy-free': 'soy',
  'shellfish-free': 'shellfish', 'fish-free': 'fish', 'celery-free': 'celery', 'sesame-free': 'sesame',
  'mustard-free': 'mustard', 'lupin-free': 'lupin', 'sulphite-free': 'sulphites',
  'peanut-free': 'peanuts', 'tree-nut-free': 'tree nuts', 'oat-free': 'oats',
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

/** The words around a food the message names: where a word for its kind sits ("salt and pepper calamari", "calamari, breaded"). */
function aroundHit(words: string[], hit: { from: number; to: number }): string {
  return words.slice(Math.max(0, hit.from - 3), hit.to + 2).join(' ')
}

/**
 * A FOOD HE NAMES WHOSE KIND DECIDES WHETHER HE CAN EAT IT (his ruling 10 Nov 2026, "Ask which": a gluten-free
 * person's bare "calamari", which is often breaded). The app's question, or null. Asked only when one of his
 * restrictions depends on the answer: a restriction every kind breaks is namedFoodClash's refusal, and one no kind
 * breaks is no reason to ask here. Read off HIS message, like the clash: the coach writing "grilled calamari" into a
 * card for him would be the app guessing the answer.
 */
export function namedFoodKindAsk(message: string, dietaryPreferences: string[]): string | null {
  const text = message ?? ''
  if (!text.trim()) return null
  const prefs = dietaryPreferences.filter((p): p is DietaryPreference => p in FORBIDDEN_TAGS)
  const words = foodTextWords(text)
  for (const hit of findFoodsNamedIn(text)) {
    if (NOT_ASKING.test(`${words.slice(Math.max(0, hit.from - 4), hit.from).join(' ')} `) || words[hit.to] === 'free') continue
    const kinds = kindsItCouldBe(aroundHit(words, hit))
    if (!kinds) continue
    const breaks = (k: FoodEntry, p: DietaryPreference) => (FORBIDDEN_TAGS[p] ?? []).some(t => (k.tags as Record<string, boolean | undefined>)[t])
    const depends = prefs.find(p => kinds.some(k => breaks(k, p)) && !kinds.every(k => breaks(k, p)))
    if (!depends) continue
    const what = CONTAINS_WORDS[depends] ?? 'something you avoid'
    return `Is the calamari breaded or fried in flour, or plain (grilled or boiled)? Breaded or floured calamari has ${what} in it, and your profile says ${depends}, so I need to know before I suggest it or add it to your meals.`
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
    // "Calamari, breaded" names the plain word and says the kind beside it: judged as the floured entry (10 Nov 2026).
    const coated = calamariSaid(aroundHit(words, hit)) === 'coated' ? lookupIngredient('fried calamari') : null
    const p = clashingRestriction(coated ?? hit.entry, ordered)
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

/**
 * WHAT FOLLOWS THE SENTENCE. His 18 Oct 2026 ruling said where to change it ("If you don't have a nut allergy, change
 * it on Profile, under Food, Diet"). REPLACED 15 Nov 2026, his "Say where it's set", after a tester with a tree-nut
 * allergy and an adrenaline pen read it as a nudge to remove the allergy: it now says WHERE the setting lives and
 * never invites changing it. Nothing else follows. Null for a diet or the avoid list.
 */
export function allergyRefusal(c: FoodClash, allergies: readonly AllergyRecord[] = []): string | null {
  if (!c.allergen || !c.restriction) return null
  if (allergyForRule(allergies, c.restriction)) return `${clashSentence(c, allergies)} Your allergies are on Profile, under Food, Allergies.`
  return `${clashSentence(c)} Your ${c.restriction} setting is on Profile, under Food, Diet.`
}

/**
 * WHY, in the sentence. With the allergy recorded on the allergy card it is true to say so (his answer 1, 15 Nov 2026:
 * "Your tree-nut allergy"); a plain diet tick keeps "your profile says nut-free", which never claims an allergy.
 */
function becauseOf(restriction: string, allergies: readonly AllergyRecord[]): string {
  const a = allergyForRule(allergies, restriction)
  return a ? `you have ${a.allergen === 'gluten' && a.coeliac ? '' : /^[aeiou]/i.test(allergyName(a)) ? 'an ' : 'a '}${allergyName(a)}` : `your profile says ${restriction}`
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
export function clashSentence(c: FoodClash, allergies: readonly AllergyRecord[] = []): string {
  const food = capitalise(c.food)
  const plural = isPlural(c.food)
  const it = plural ? 'them' : 'it'
  if (c.restriction) {
    const has = plural ? 'have' : 'has'
    // Peanuts are not tree nuts; the nut-free filter keeps out both, and the sentence names the right one.
    const what = c.restriction === 'nut-free' && /peanut/i.test(c.food) ? 'peanuts' : CONTAINS_WORDS[c.restriction] ?? 'something'
    return `${food} ${has} ${what} in ${it}, and ${becauseOf(c.restriction, allergies)}, so I won't suggest ${it} or add ${it} to your meals.`
  }
  const are = plural ? 'are' : 'is'
  return `${food} ${are} on your avoid list, so I won't suggest ${it} or add ${it} to your meals.`
}

// ---------------------------------------------------------------------------
// A FOOD HE CAN'T HAVE IS NEVER SAVED AS ONE HE LIKES (Marcus test, 15 Nov 2026, A1; docs/plans/browser-test-nov15-plan.md
// Wave M). The coach refused almond butter for a nut-free profile and, in the same turn, saved "always wants almond
// butter", whose receipt promised new meals made with it in mind: the refusal only ever blocked food CARDS. Every writer
// of a liked food asks this first (the chat's memory save, Profile's likes box, setup's usual meals). Same matcher as
// the refusal, so the two can never disagree about what clashes.
// ---------------------------------------------------------------------------

/** The clash a liked food would have with his restrictions or avoid list, or null when it is fine to keep. */
export function likeClash(phrase: string, restrictions: readonly string[], avoided: readonly string[] = []): FoodClash | null {
  if (!phrase.trim()) return null
  return namedFoodClash(phrase, [...restrictions], [...avoided])
}

/** "Almond butter has tree nuts in it, and your profile says nut-free, so I haven't saved it as a food you like." */
export function likeRefusal(c: FoodClash, allergies: readonly AllergyRecord[] = []): string {
  const food = capitalise(c.food)
  const plural = isPlural(c.food)
  const it = plural ? 'them' : 'it'
  if (c.restriction) {
    const what = c.restriction === 'nut-free' && /peanut/i.test(c.food) ? 'peanuts' : CONTAINS_WORDS[c.restriction] ?? 'something'
    return `${food} ${plural ? 'have' : 'has'} ${what} in ${it}, and ${becauseOf(c.restriction, allergies)}, so I haven't saved ${it} as a food you like.`
  }
  return `${food} ${plural ? 'are' : 'is'} on your avoid list, so I haven't saved ${it} as a food you like.`
}
