// ---------------------------------------------------------------------------
// ONE STATE: A LINE IS WEIGHED RAW OR DRY (runs 7-10, H36 / M64, 18 Oct 2026).
//
// Her fix: "every ingredient is counted, shown and shopped in the same state (raw/dry)", and her ruling on how a
// line reads, "Dry, plus cooked hint": "71g dry rice (about 200g cooked)". A cooked line ("200g white rice",
// "150g chicken breast", "250g potato boiled") becomes its raw or dry twin at the weight that holds the same protein
// (meat, fish) or starch (grains, potatoes, lentils): cooking moves water, not those (weighedFactor). Energy then
// moves by a few percent at most, except where the two foods' own figures disagree (chicken thigh). A food with no
// twin is left exactly as written.
// docs/plans/one-state-raw-dry.md.
// ---------------------------------------------------------------------------
import { lookupIngredient, unitToGrams, weighedTwinOf, cookedTwinOf, weighedFactor, stateOf, type MealIngredientLine } from './food-db'
import { kitchenRound } from './portion-scaler'

/** Cooking words a line can carry that the twin's state word replaces ("boiled potatoes" -> "raw potatoes"). */
const COOKED_WORDS = /\b(cooked|boiled|baked|roasted|roast|steamed|grilled|poached)\b/gi

/**
 * The line as it is weighed: unchanged unless its food is a cooked entry with a raw or dry twin and its amount can
 * be read as grams. The new name is the person's own words with the state in front, PROVED through the real
 * lookup; when those words do not reach the twin, the twin's own first name is used. Never stored: worked out again
 * on every read, so a stored meal is never rewritten.
 */
export function asWeighed<L extends MealIngredientLine>(line: L): L {
  if (line.unread) return line
  const entry = lookupIngredient(line.name)
  if (!entry || stateOf(entry) !== 'cooked') return line
  const twin = weighedTwinOf(entry)
  const factor = twin ? weighedFactor(entry, twin) : null
  if (!twin || factor == null) return line
  const grams = unitToGrams(entry, line.unit, line.quantity, line.name)
  if (grams == null || !(grams > 0)) return line
  // In the app's own kitchen steps (the nearest 5 g from 20 g up), as every resized amount is: "65g dry brown rice".
  const twinGrams = Math.max(1, kitchenRound(grams * factor, 'g'))
  const state = stateOf(twin) === 'dry' ? 'dry' : 'raw'
  const words = line.name.replace(COOKED_WORDS, ' ').replace(/\s+/g, ' ').trim()
  // A line written in the table's own words ("lentils red", "pasta cooked") reads better as the twin's own first name
  // ("dry red lentils"); a line in her words keeps them ("cooked spaghetti" -> "dry spaghetti").
  const tableWords = entry.name.replace(COOKED_WORDS, ' ').replace(/\s+/g, ' ').trim()
  const own = `${state} ${words}`
  const candidates = words === tableWords ? [...twin.aliases, own, twin.name] : [own, ...twin.aliases, twin.name]
  const name = candidates.find(n => lookupIngredient(n)?.name === twin.name) ?? twin.name
  return { ...line, name, quantity: twinGrams, unit: 'g' }
}

export function asWeighedLines<L extends MealIngredientLine>(lines: L[]): L[] {
  return lines.map(asWeighed)
}

/**
 * The cooked weight a raw or dry line comes to, rounded to 10 g, as the card's hint: "about 200g cooked". Drawn,
 * never stored, so it can never be read as an ingredient. Null for a food with no cooked twin or an unread amount.
 */
export function cookedHint(line: MealIngredientLine): string | null {
  if (line.unread) return null
  const entry = lookupIngredient(line.name)
  // Only a raw or dry entry has a cooked twin, so this is the whole test of "is this line weighed raw or dry".
  const cooked = entry ? cookedTwinOf(entry) : null
  const factor = entry && cooked ? weighedFactor(cooked, entry) : null
  if (!entry || factor == null) return null
  const grams = unitToGrams(entry, line.unit, line.quantity, line.name)
  if (grams == null || !(grams > 0)) return null
  const cookedGrams = Math.max(10, Math.round(grams / factor / 10) * 10)
  return `about ${cookedGrams}g cooked`
}
