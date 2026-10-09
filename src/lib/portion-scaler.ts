// ---------------------------------------------------------------------------
// PORTION SCALER (M1) — ported from macro-calibration's applyProportionalScaler
// ---------------------------------------------------------------------------
// supabase/functions/macro-calibration/index.ts already carries this exact
// logic (regex-parsing "150g chicken breast" style strings and scaling the
// leading quantity by a proportional factor) — this is that same algorithm,
// generalized from string round-tripping to food-db's structured
// MealIngredientLine shape, since meal-generation.ts (M1 Part 3) has
// already-parsed {name, quantity, unit} lines rather than raw strings.
// macro-calibration's deployed function and its scaler are left untouched;
// M1's generation pipeline is what needed this logic, not that function.
// ---------------------------------------------------------------------------

import { lookupIngredient, unitToGrams, type MealIngredientLine, type Macros100g } from './food-db'

/** Below this, a scale is "close enough" not to bother touching quantities (mirrors macro-calibration's 0.03 no-op threshold). */
export const SCALE_NOOP_THRESHOLD = 0.03

/** A meal that would need to shrink below 0.4x or grow past 2.5x its proposed portions is rejected as an absurd result rather than forced (see isScaleFactorAbsurd). */
export const MIN_SCALE_FACTOR = 0.4
export const MAX_SCALE_FACTOR = 2.5

/** Slot-level acceptance tolerance: within ±7% calories, at or above target protein. */
export const CALORIE_TOLERANCE = 0.07

const GRAM_LIKE_UNITS = new Set(['g', 'gram', 'grams', 'ml'])
const VOLUME_UNITS = new Set(['tbsp', 'tablespoon', 'tsp', 'teaspoon'])

/** target / actual — the factor every ingredient quantity gets multiplied by. actual <= 0 is a degenerate meal (no computable macros) and never gets scaled. */
export function computeScaleFactor(actualCalories: number, targetCalories: number): number {
  if (actualCalories <= 0) return 1
  return targetCalories / actualCalories
}

/** True when a scale factor would demand an unrealistic portion (a 3kg chicken breast, a 20g rice serving) — the meal should be rejected and regenerated rather than scaled into absurdity. */
export function isScaleFactorAbsurd(scaleFactor: number): boolean {
  return scaleFactor > MAX_SCALE_FACTOR || scaleFactor < MIN_SCALE_FACTOR
}

/**
 * THE SAME LINE, A DIFFERENT AMOUNT — "122g chicken" with 90 becomes
 * "90g chicken". Everything after the number is preserved verbatim, and that
 * is the point.
 *
 * The first version of this went the other way: parse the line to
 * {name, quantity, unit} and render it back. It loses her words. The parser
 * normalises "3 slices wholemeal bread" to unit "slice", so the round trip
 * returned "3 slice wholemeal bread" — the macros were identical, but the
 * ingredient list she reads is written in the app's grammar instead of hers.
 * Resizing only ever changes the number, so only the number is touched.
 *
 * Returns null when there is no leading amount to replace, which is the
 * honest outcome for a line like "salt to taste": there is nothing to resize.
 */
export function withQuantity(line: string, quantity: number): string | null {
  const m = /^(\s*)(\d+(?:\.\d+)?)/.exec(line)
  if (!m) return null
  return `${m[1]}${quantity}${line.slice(m[0].length)}`
}

/**
 * AMOUNTS SOMEBODY CAN ACTUALLY MEASURE — the one rounding rule for a scaled
 * quantity, used by every path that resizes a dish.
 *
 * 9 Oct 2026, the test log's L18: "1.3 tsp", "0.8 tsp", "119g liquid egg
 * whites", "239g raw king prawns". One 0.795x scale produced all four,
 * because grams were rounded to the nearest 1 and spoons to one decimal, and
 * nothing after the scaler tidied them.
 *
 * DECIDED AS A CSCS COACH / NUTRITION GENERALIST (the delegation covers
 * population-level nutrition; basis recorded in BACKLOG):
 *   - Grams and ml: to the nearest 5 from 20 upwards, to the nearest 1 below.
 *     Five grams on a 240 g portion is 2%, well inside the 7% a meal is
 *     allowed to miss its calories by and inside what a home scale and a
 *     "medium" potato already vary by. Between 20 and 50 g the step is a
 *     bigger share of the LINE (up to 2.5 g in 20), but never more than 2.5 g
 *     of anything: at most 22 kcal for pure fat, under 5% of the smallest
 *     main meal the app plans. Below 20 g the foods are the dense ones
 *     (butter, oil by weight, honey, seeds), where a gram is real, so they
 *     keep whole grams.
 *   - Spoons: to the nearest quarter, never less than a quarter — the
 *     smallest spoon in a measuring set. Shown as ¼ ½ ¾ (formatKitchenQuantity).
 *   - Anything counted (eggs, slices, cloves): whole, never fewer than one.
 *
 * THE NUMBER ON THE CARD IS THE NUMBER COSTED: every caller recomputes the
 * macros from the rounded lines (they already did, because whole grams and
 * whole eggs were never the requested factor either).
 */
export const KITCHEN_GRAM_STEP = 5
export const KITCHEN_FINE_BELOW_G = 20
export const KITCHEN_SPOON_STEP = 0.25

export function kitchenRound(quantity: number, unit: string): number {
  const u = unit.toLowerCase().trim()
  if (!Number.isFinite(quantity)) return quantity
  if (GRAM_LIKE_UNITS.has(u)) {
    const q = Math.max(0, quantity)
    return q < KITCHEN_FINE_BELOW_G ? Math.round(q) : Math.round(q / KITCHEN_GRAM_STEP) * KITCHEN_GRAM_STEP
  }
  if (VOLUME_UNITS.has(u)) return Math.max(KITCHEN_SPOON_STEP, Math.round(quantity / KITCHEN_SPOON_STEP) * KITCHEN_SPOON_STEP)
  return Math.max(1, Math.round(quantity))
}

const QUARTER_GLYPH: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' }

/**
 * A quantity as a person reads it: spoons in quarters ("1¼", "½"), everything
 * else as the plain number. DISPLAY ONLY — the stored line and every string
 * handed to a builder keep the decimal, which is what the ingredient reader
 * parses ("1.25 tsp olive oil"); "1¼" is not a number it knows.
 */
export function formatKitchenQuantity(quantity: number, unit: string): string {
  const plain = String(Number.isInteger(quantity) ? quantity : Math.round(quantity * 10) / 10)
  if (!VOLUME_UNITS.has(unit.toLowerCase().trim())) return plain
  const whole = Math.floor(quantity)
  const glyph = QUARTER_GLYPH[String(Math.round((quantity - whole) * 100) / 100)]
  if (quantity === whole) return String(whole)
  // A spoon amount that is not on a quarter was typed by a person or stored
  // before 9 Oct 2026: shown as it is, never bent to the nearest glyph.
  if (!glyph) return String(Math.round(quantity * 100) / 100)
  return whole > 0 ? `${whole}${glyph}` : glyph
}

/**
 * Scales every ingredient line's quantity by scaleFactor and rounds each to
 * an amount somebody can measure (kitchenRound, above). A scaleFactor within
 * SCALE_NOOP_THRESHOLD of 1 is left untouched.
 */
export function scaleIngredients(ingredients: MealIngredientLine[], scaleFactor: number): MealIngredientLine[] {
  if (Math.abs(scaleFactor - 1) < SCALE_NOOP_THRESHOLD) return ingredients

  return ingredients.map(line => ({ ...line, quantity: kitchenRound(line.quantity * scaleFactor, line.unit) }))
}

export function isWithinCalorieTolerance(actualCalories: number, targetCalories: number, tolerance = CALORIE_TOLERANCE): boolean {
  if (targetCalories <= 0) return true
  return Math.abs(actualCalories - targetCalories) / targetCalories <= tolerance
}

export function meetsProteinFloor(actualProtein: number, targetProtein: number): boolean {
  return actualProtein >= targetProtein
}

// QA sweep finding: protein was enforced as a floor ONLY everywhere in this
// pipeline. A symmetric per-meal ceiling was tried and reverted — this app's
// generate-meals prompt deliberately steers every proposal toward protein
// density, so most proposals sit well above a 1.3x-of-slot-target ceiling by
// design; gating on it collapsed pool sizes app-wide (confirmed live: 86 ->
// 52 accepted options). The day-level ceiling in meal-generation.ts
// (DAY_PROTEIN_CEILING_RATIO) reuses this same number without that cost —
// it only stops assembleDay's calorie-only repair scale from being accepted
// when the result would land too far over, rather than rejecting individual
// proposals outright.
export const PROTEIN_CEILING_RATIO = 1.3

export interface ScaleToTargetResult {
  ingredients: MealIngredientLine[]
  macros: Macros100g
  scaleFactor: number
  /** True when the scaled result is within calorie tolerance AND at/above the protein floor. */
  ok: boolean
  /** Set when the meal was rejected outright (absurd scale factor) rather than merely missing tolerance. */
  rejectedReason?: string
}

/**
 * The one entry point meal-generation.ts calls: given a proposed ingredient
 * list, its computed macros, and a slot's target, scales the ingredients to
 * hit the target (or reports why it can't). Does NOT recompute macros after
 * scaling — the caller re-runs computeMealMacros on the returned ingredients
 * against food-db, since scaling changes quantities and food-db is the only
 * source of truth for what a quantity change is worth nutritionally.
 */
export function scaleToTarget(
  ingredients: MealIngredientLine[],
  actualMacros: Macros100g,
  target: Macros100g,
): { ingredients: MealIngredientLine[]; scaleFactor: number; rejectedReason?: string } {
  const scaleFactor = computeScaleFactor(actualMacros.kcal, target.kcal)

  if (isScaleFactorAbsurd(scaleFactor)) {
    return {
      ingredients,
      scaleFactor,
      rejectedReason: `Scale factor ${scaleFactor.toFixed(2)}x is outside the [${MIN_SCALE_FACTOR}, ${MAX_SCALE_FACTOR}] sane-portion range — this proposal's macro density is too far from the slot target to scale honestly.`,
    }
  }

  return { ingredients: scaleIngredients(ingredients, scaleFactor), scaleFactor }
}

// ---------------------------------------------------------------------------
// Ingredient string parsing — the AI proposes ingredients as free-text
// strings ("165g chicken breast", "2 tbsp olive oil", "1 medium egg"); this
// turns them into the structured MealIngredientLine shape food-db and the
// scaler above operate on. A line that doesn't match any known quantity
// pattern is kept with unit 'g' and its full text as the name, so it always
// flows through to computeMealMacros — where it will most likely show up as
// unmatched (fail-closed) rather than silently vanishing from the meal.
// ---------------------------------------------------------------------------

// Quantity number: a plain decimal ("1.5"), a simple fraction ("1/2"), or a
// mixed number ("1 1/2") — recipe-style ingredient lists lean on fractions
// for spice/seasoning amounts ("1/2 tsp chili powder") far more than whole
// numbers, and a plain \d+(?:\.\d+)? pattern silently fails on every one of
// them (the quantity match fails entirely, so the WHOLE line — quantity,
// unit, and name together — falls through to the no-match branch below,
// which then treats it as an unmatched ingredient with a mangled name).
const NUMBER = String.raw`\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+`

function parseQuantityNumber(raw: string): number {
  const mixed = raw.match(/^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/)
  if (mixed) return parseFloat(mixed[1]) + parseInt(mixed[2], 10) / parseInt(mixed[3], 10)
  const fraction = raw.match(/^(\d+)\/(\d+)$/)
  if (fraction) return parseInt(fraction[1], 10) / parseInt(fraction[2], 10)
  return parseFloat(raw)
}

const GRAM_PATTERN = new RegExp(`^(${NUMBER})\\s*(g|gram|grams|ml)\\s+(.+)$`, 'i')
const VOLUME_PATTERN = new RegExp(`^(${NUMBER})\\s*(tbsp|tablespoons?|tsp|teaspoons?|cups?)\\s+(.+)$`, 'i')
// pinch and dash: a pinch of anything weighs almost nothing, and the food
// database says how little (MEASURE_GRAMS), so "1 pinch of salt" keeps its
// place as a trace line instead of becoming an amount nobody can read.
const NAMED_COUNT_PATTERN = new RegExp(`^(${NUMBER})\\s*(medium|large|small|whole|slices?|cloves?|scoops?|pinch(?:es)?|dash(?:es)?)\\s+(.+)$`, 'i')
const BARE_COUNT_PATTERN = new RegExp(`^(${NUMBER})\\s+(.+)$`)

/** "a banana", "an egg", "half an avocado", "two slices" — an amount said in words. */
const WORDED_AMOUNT = /^(half an?|a couple of|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(.+)$/i
const WORD_VALUE: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, 'a couple of': 2, 'half a': 0.5, 'half an': 0.5 }

/** "of bread" -> "bread": the word left behind when a unit is lifted out of "2 slices of bread". */
const withoutOf = (name: string) => name.trim().replace(/^of\s+/i, '')

export function parseIngredientLine(text: string): MealIngredientLine {
  const trimmed = text.trim()

  // AN AMOUNT SAID IN WORDS IS STILL AN AMOUNT. "3 eggs, 150g greek yoghurt,
  // a banana" is the custom-meal prompt's own example, and "a banana" fell to
  // the no-quantity branch at the bottom: ONE GRAM of banana, coverage 100%
  // (9 Oct 2026 — the same wrong-by-two-orders number as the eggs in H6).
  // Read only when the result is something the food database can weigh, so
  // "a pinch of salt" and "a little oil" are left exactly as they were.
  const worded = trimmed.match(WORDED_AMOUNT)
  if (worded) {
    const asNumber = parseIngredientLine(`${WORD_VALUE[worded[1].toLowerCase().replace(/\s+/g, ' ')]} ${worded[2]}`)
    const entry = lookupIngredient(asNumber.name)
    if (entry && unitToGrams(entry, asNumber.unit, asNumber.quantity, asNumber.name) != null) return asNumber
  }

  const gram = trimmed.match(GRAM_PATTERN)
  if (gram) {
    const unit = gram[2].toLowerCase().startsWith('ml') ? 'ml' : 'g'
    return { name: withoutOf(gram[3]), quantity: parseQuantityNumber(gram[1]), unit }
  }

  const vol = trimmed.match(VOLUME_PATTERN)
  if (vol) {
    const rawUnit = vol[2].toLowerCase()
    const unit = rawUnit.startsWith('tbsp') || rawUnit.startsWith('tablespoon') ? 'tbsp'
      : rawUnit.startsWith('tsp') || rawUnit.startsWith('teaspoon') ? 'tsp'
      : 'cup'
    return { name: withoutOf(vol[3]), quantity: parseQuantityNumber(vol[1]), unit }
  }

  const named = trimmed.match(NAMED_COUNT_PATTERN)
  if (named) {
    const rawUnit = named[2].toLowerCase().replace(/(ch|sh)es$/, '$1').replace(/s$/, '')
    return { name: withoutOf(named[3]), quantity: parseQuantityNumber(named[1]), unit: rawUnit }
  }

  const bare = trimmed.match(BARE_COUNT_PATTERN)
  if (bare) {
    return { name: bare[2].trim(), quantity: parseQuantityNumber(bare[1]), unit: 'whole' }
  }

  // No quantity found at all — fall through with the whole string as the
  // name and a nominal 1g so it still participates in coverage/unmatched
  // accounting rather than being silently dropped.
  return { name: trimmed, quantity: 1, unit: 'g' }
}

export function parseIngredientLines(texts: string[]): MealIngredientLine[] {
  return texts.map(parseIngredientLine)
}
