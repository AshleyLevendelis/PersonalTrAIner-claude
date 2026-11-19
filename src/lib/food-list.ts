// A typed list of foods, split into one food per entry (11 Oct 2026).
// Its own file, apart from food-exclusions.ts, because setup's profile builder
// (onboarding-slots.ts) is on the first-paint path and needs only this split:
// the said-in-passing detector stays in the setup and chat chunks, which load
// when they are opened. Plan: docs/plans/food-exclusions-said-in-passing.md.

/** "and", "or", commas, slashes, "&", "+" and new lines separate foods in a list. */
const SEPARATORS = /\s*(?:,|;|\/|&|\+|\n|\band\b|\bor\b|\bnor\b)\s*/i

/** Words around a food that are not the food: "no pork please", "any mushrooms at all". */
const LEADING = /^(?:(?:also|plus|just|only|no|not|any|either|the|a|an|some|definitely|really|absolutely)\s+)+/i
const TRAILING = /(?:\s+(?:please|thanks|thank you|at all|anymore|any more|ever|either|whatsoever|really|thx|in it|in them|in anything|in my meals|in my food))+$/i

/**
 * A SENTENCE TYPED INTO A LIST BOX (18 Nov 2026, the full pass). "I don't eat pork" typed under "Anything else you'd
 * rather I left out?" was saved as the food "i don t eat pork": it matched no ingredient, so the list showed a row
 * that protected nothing and the new plan still held pork chops. The way people say it is read as what they mean.
 * Each box reads only ITS OWN way of saying it: "I love pizza" in the foods-to-avoid box is not read as "pizza"
 * (that would leave out the one thing he said he likes), and "I don't eat pork" in the likes box is not a like.
 * Apostrophes are taken out first, so "don't" and "dont" are one spelling.
 */
const SAYS_AVOID = /^(?:(?:and|but|also|oh|well|so|plus)\s+)*(?:i\s+(?:really\s+|just\s+|also\s+|absolutely\s+|honestly\s+)?(?:dont|do not|cant|cannot|can not|wont|will not|would not|wouldnt|never|hate|dislike|avoid|detest)(?:\s+(?:really|ever|even))?(?:\s+(?:eat|have|like|want|touch|do|stand|tolerate|get on with))?|i\s*a?m\s+(?:allergic|intolerant)\s+to|i\s*a?m\s+not\s+(?:a\s+fan\s+of|keen\s+on|into)|i\s+have\s+(?:a|an)\s+(?:allergy|intolerance)\s+to|(?:allergic|intolerant)\s+to|not\s+(?:a\s+fan\s+of|keen\s+on)|(?:please\s+)?(?:leave\s+out|keep\s+out|skip|hold|without|nothing\s+with|none\s+of\s+the|no\s+more))\s+/i
const SAYS_LIKE = /^(?:(?:and|but|also|oh|well|so|plus)\s+)*(?:i\s+(?:really\s+|just\s+|also\s+|absolutely\s+|do\s+)?(?:love|like|enjoy|adore|eat|usually\s+(?:eat|have)|often\s+(?:eat|have))(?:\s+(?:eating|having|a\s+lot\s+of|lots\s+of))?|i\s*a?m\s+(?:a\s+(?:big\s+)?fan\s+of|keen\s+on|into)|my\s+favou?rites?\s+(?:is|are)|(?:big\s+)?fan\s+of|more)\s+/i
/** What is left still reads as talk, not as a food: it is handed back unread, never saved as a row. */
const STILL_A_SENTENCE = /\b(?:i|im|ive|id|my|me|we|you|your|eat|eats|eating|ate|dont|doesnt|cant|cannot|wont|never|like|likes|love|loves|hate|hates|enjoy|allergic|intolerant|allergy|prefer|want|avoid|please|because|but|favourite|favorite|vegetarian|vegan|pescatarian|halal|kosher)\b/i

export type FoodListSide = 'avoid' | 'like'
export interface FoodListRead {
  /** One entry per food, tidied. */
  foods: string[]
  /** What he typed that could not be read as a food for THIS list, as typed, so a screen can say so and keep it. */
  unread: string[]
}

/** A single food, tidied: lower case, no filler, no punctuation at the ends. */
function tidy(part: string, side?: FoodListSide): string {
  const plain = part.toLowerCase().replace(/[’']/g, '').replace(/[.!?"“”‘()]+/g, ' ').replace(/\s+/g, ' ').trim().replace(TRAILING, '')
  const said = side === 'avoid' ? plain.replace(SAYS_AVOID, '') : side === 'like' ? plain.replace(SAYS_LIKE, '') : plain
  return said.replace(LEADING, '').trim()
}

/** "none", "nothing", "no": an answer that clears the list. */
export function isPlainNone(text: string): boolean {
  return /^(?:none|nothing|no|nope|nah|n\/a|nil|nothing really|none really)[.!]*$/i.test(String(text ?? '').trim())
}

/**
 * "skip", "pass", "I'd rather not say" typed to an OPTIONAL question: he is declining it, not naming a food called
 * Skip. Kept apart from `isPlainNone` on purpose: "none" typed while CHANGING a list clears it, and "skip" there means
 * "leave it as it is", so the two must never be read as one.
 */
export function isPlainSkip(text: string): boolean {
  return /^(?:skip|skip it|skip this|skip that|pass|(?:i'?d |i would )?rather not say|prefer not to say)[.!]*$/i.test(String(text ?? '').trim())
}

/**
 * A typed list read for one box: the foods, and anything that could not be read as a food for that box. The avoid box
 * splits on "and" (two foods); the likes box on commas only ("chicken and rice" is one meal, as `splitUsualFoods`).
 */
export function readFoodList(text: string, side: FoodListSide): FoodListRead {
  const t = String(text ?? '').trim()
  if (!t || isPlainNone(t)) return { foods: [], unread: [] }
  // THE OTHER BOX'S WORDS OPEN THE ANSWER ("I love pizza and pasta" under foods to avoid): nothing in it is for this
  // list. Reading the parts one by one would hand back "I love pizza" and then leave out pasta, the opposite of what
  // he said. The whole answer is handed back instead.
  const opening = t.toLowerCase().replace(/[’']/g, '')
  if ((side === 'avoid' ? SAYS_LIKE : SAYS_AVOID).test(opening + ' ')) return { foods: [], unread: [t] }
  const foods: string[] = []
  const unread: string[] = []
  for (const part of t.split(side === 'avoid' ? SEPARATORS : /\s*(?:,|;|\n)\s*/)) {
    if (!part.trim()) continue
    // Each part may carry its own lead-in ("pork, I don't eat prawns"); `tidy` takes this box's off.
    const food = tidy(part, side)
    // The OTHER box's way of saying it part-way through, or still a sentence: not a food for this list.
    const other = (side === 'avoid' ? SAYS_LIKE : SAYS_AVOID).test(part.toLowerCase().replace(/[’']/g, '').trim() + ' ')
    if (!food || other || STILL_A_SENTENCE.test(food)) { if (!unread.includes(part.trim())) unread.push(part.trim()); continue }
    if (!foods.includes(food)) foods.push(food)
  }
  return { foods, unread }
}

/** What a screen says about typed words it could not read as a food, or null when it read them all. */
export function unreadFoodLine(unread: string[], side: FoodListSide): string | null {
  if (unread.length === 0) return null
  const quoted = unread.map(u => `"${u}"`).join(' and ')
  return side === 'avoid'
    ? `I couldn't read ${quoted} as a food to leave out, so nothing was added for it. Type just the food, like "pork".`
    : `I couldn't read ${quoted} as a food you like, so nothing was added for it. Type just the food or meal, like "salmon".`
}

/**
 * A typed list of foods → one entry per food. "mushrooms and pork" is two
 * foods; "none" or "nothing" is an empty list. Used wherever Foods to avoid is
 * typed: setup's summary edit, the setup answer itself, and the Profile box.
 * What cannot be read as a food is left out here; a screen that can say so asks `readFoodList` instead.
 */
export function splitFoodList(text: string): string[] {
  return readFoodList(text, 'avoid').foods
}

/**
 * "What do you usually eat?" → one entry per MEAL OR FOOD he named (his 11 Nov 2026 ruling, "My usual meals first").
 * Split on commas, semicolons and new lines ONLY: "chicken and rice" is one meal here, where on Foods to avoid
 * "mushrooms and pork" is two foods. A like naming several foods then matches a dish holding all of them.
 */
export function splitUsualFoods(text: string): string[] {
  const t = String(text ?? '').trim()
  if (isPlainNone(t) || isPlainSkip(t)) return []
  const out: string[] = []
  for (const part of t.split(/\s*(?:,|;|\n)\s*/)) {
    const meal = tidy(part)
    if (meal && !out.includes(meal)) out.push(meal)
  }
  return out
}
