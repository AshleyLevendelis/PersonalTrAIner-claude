// ---------------------------------------------------------------------------
// "I DON'T EAT PORK", SAID IN PASSING, GOES INTO FOODS TO AVOID (11 Oct 2026)
// ---------------------------------------------------------------------------
// Ashley's ruling of 9 Oct 2026, "Build all four", item 1, from the tracer's
// options: save it straight away, with a visible tick (over asking first, and
// over only remembering it). Test log H12: "I'm allergic to tree nuts, and I
// don't eat pork" saved the nuts (the allergen backstop) and filed the pork as
// a memory note that "never" touches the plan, and "mushrooms and pork" typed
// into Foods to avoid became ONE avoid that matched no food at all.
// Plan: docs/plans/food-exclusions-said-in-passing.md.
//
// The model is told to do this too; this is the half that does not depend on
// it, the same shape as the allergen backstop (her August ruling: "AI told to
// apply the restriction, plus a code-level backup that ... applies it
// independently of the AI").
//
// CONSERVATIVE, because a wrong catch takes a food away from someone: plain
// statements about not eating something, each word checked to be a FOOD (one
// the database knows, or a kind the avoid filter understands, like "pork"),
// and a clause with a habit or time in it ("much", "on weekdays", "after 8pm")
// is not a ban and captures nothing. The tick shows what was taken, so a wrong
// one is visible at the moment it can be undone.
// ---------------------------------------------------------------------------

import { lookupIngredient } from './food-db'
import { isAvoidCategoryWord } from './meal-ingredients'
import { splitFoodList } from './food-list'

/**
 * Kinds of meat people leave out by name, which the food table holds only
 * inside longer names ("beef mince", "lamb chop"). The avoid filter matches
 * them as words in a dish's name and ingredients, so each one works as an
 * avoid; the lookup alone would not call the bare word a food.
 */
const KINDS_PEOPLE_LEAVE_OUT = new Set(['beef', 'lamb', 'mutton', 'veal', 'venison', 'turkey', 'duck', 'goat', 'sausage', 'sausages', 'offal'])

/** Is this the name of a food (or a kind of food the avoid filter understands)? "breakfast" and "cardio" are not. */
export function isFoodToAvoid(phrase: string): boolean {
  const p = phrase.trim().toLowerCase()
  if (!p || p.split(' ').length > 4) return false
  return KINDS_PEOPLE_LEAVE_OUT.has(p) || isAvoidCategoryWord(p) || lookupIngredient(p) !== null
}

/**
 * The statement itself. "I/we" and a plain negation about eating, or an
 * allergy or intolerance to something. "don't HAVE" is deliberately not here:
 * "I don't have any milk" is about the fridge, not the plan; "can't have" is.
 */
const STATEMENT = new RegExp([
  String.raw`\b(?:i|we)\s+(?:do\s*n[o']?t|don'?t|won'?t|will\s+not|never|no\s+longer|refuse\s+to)\s+(?:eat|touch|like|do)\b`,
  String.raw`\b(?:i|we)\s+(?:can'?t|cannot|can\s+not)\s+(?:eat|have|stand)\b`,
  String.raw`\b(?:i|we)\s+(?:avoid|hate)\b`,
  String.raw`\bnot\s+a\s+fan\s+of\b`,
  String.raw`\b(?:allergic|intolerant)\s+to\b`,
].join('|'), 'gi')

/** A habit or a time is not a ban: "I don't eat much fish", "I don't eat meat on weekdays", "I don't eat after 8pm". */
const NOT_A_BAN = /\b(?:much|many|often|usually|normally|mostly|really|a lot|lots|too much|that much|enough|before|after|during|until|unless|except|when|if|whenever|on (?:weekdays|weekends|week days|school nights)|at night|in the (?:morning|evening|afternoon)|for (?:breakfast|lunch|dinner|tea)|most days|every day|some days|sometimes)\b/i

/** Where what was said about food stops. */
const CLAUSE_END = /\s+(?:because|cos|cuz|since|but|though|although|so|as|which|who)\s+|\s+[-–—]\s+|\(/i

/**
 * The foods a message says she does not eat, each one checked to be a food.
 * Several statements in one message are each read ("I'm allergic to tree nuts,
 * and I don't eat pork"). Lower case, in the order said, no repeats.
 */
export function detectFoodExclusions(text: string): string[] {
  const found: string[] = []
  const take = (what: string) => {
    if (NOT_A_BAN.test(what)) return
    for (const food of splitFoodList(what)) {
      if (isFoodToAvoid(food) && !found.includes(food)) found.push(food)
    }
  }
  for (const clause of String(text ?? '').split(/[.!?;\n]+/)) {
    // "No pork for me": the food comes BEFORE the words that make it a ban.
    for (const m of clause.matchAll(/\bno\s+([a-z][a-z ,&/'-]{1,60}?)\s+for\s+(?:me|us)\b/gi)) take(m[1])
    const starts = [...clause.matchAll(STATEMENT)]
    starts.forEach((m, i) => {
      const from = (m.index ?? 0) + m[0].length
      const to = i + 1 < starts.length ? (starts[i + 1].index ?? clause.length) : clause.length
      let what = clause.slice(from, to)
      const stop = what.search(CLAUSE_END)
      if (stop >= 0) what = what.slice(0, stop)
      // "...and I don't eat pork": the joining "and I" belongs to the next statement.
      what = what.replace(/,?\s*(?:and|but)?\s*(?:i|we)\s*$/i, '')
      take(what)
    })
  }
  return found
}

/** One food, compared the way the avoid filter would: case and a plural "s" do not make a new one. */
const sameFood = (a: string, b: string) => {
  const k = (s: string) => s.trim().toLowerCase().replace(/^(.{3,}?)s$/, '$1')
  return k(a) === k(b)
}

/** `current` plus every food in `adding` it does not already have; and which ones were new. */
export function mergeFoodsToAvoid(current: readonly string[], adding: readonly string[]): { list: string[]; added: string[] } {
  const list = [...current]
  const added: string[] = []
  for (const food of adding) {
    if (!list.some(f => sameFood(f, food))) { list.push(food); added.push(food) }
  }
  return { list, added }
}
