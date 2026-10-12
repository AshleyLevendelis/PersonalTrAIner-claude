// A typed list of foods, split into one food per entry (11 Oct 2026).
// Its own file, apart from food-exclusions.ts, because setup's profile builder
// (onboarding-slots.ts) is on the first-paint path and needs only this split:
// the said-in-passing detector stays in the setup and chat chunks, which load
// when they are opened. Plan: docs/plans/food-exclusions-said-in-passing.md.

/** "and", "or", commas, slashes, "&", "+" and new lines separate foods in a list. */
const SEPARATORS = /\s*(?:,|;|\/|&|\+|\n|\band\b|\bor\b|\bnor\b)\s*/i

/** Words around a food that are not the food: "no pork please", "any mushrooms at all". */
const LEADING = /^(?:(?:also|plus|just|only|no|not|any|either|the|a|an|some|definitely|really|absolutely)\s+)+/i
const TRAILING = /(?:\s+(?:please|thanks|thank you|at all|anymore|any more|ever|either|whatsoever|really|thx))+$/i

/** A single food, tidied: lower case, no filler, no punctuation at the ends. */
function tidy(part: string): string {
  return part.toLowerCase().replace(/[.!?'"“”‘’()]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(TRAILING, '').replace(LEADING, '').trim()
}

/** "none", "nothing", "no": an answer that clears the list. */
export function isPlainNone(text: string): boolean {
  return /^(?:none|nothing|no|nope|nah|n\/a|nil|nothing really|none really)[.!]*$/i.test(String(text ?? '').trim())
}

/**
 * A typed list of foods → one entry per food. "mushrooms and pork" is two
 * foods; "none" or "nothing" is an empty list. Used wherever Foods to avoid is
 * typed: setup's summary edit, the setup answer itself, and the Profile box.
 */
export function splitFoodList(text: string): string[] {
  const t = String(text ?? '').trim()
  if (isPlainNone(t)) return []
  const out: string[] = []
  for (const part of t.split(SEPARATORS)) {
    const food = tidy(part)
    if (food && !out.includes(food)) out.push(food)
  }
  return out
}
