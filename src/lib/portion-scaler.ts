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

import { lookupIngredient, unitToGrams, computeMealMacros, type MealIngredientLine, type Macros100g } from './food-db'
import { readIngredientText } from './ingredient-units'

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
  const m = /^(\s*)(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?(?![\d/])|\d+\/\d+)/.exec(line)
  if (!m) return null
  return `${m[1]}${quantity}${line.slice(m[0].length)}`
}

/** Units a line is weighed in once it is read: a cup, a tin, a handful and the like. Resized in grams, because "1 cup" scaled by 1.3 and rounded to a whole cup is still 1 cup. */
const WEIGHED_WHEN_RESIZED = new Set(['cup', 'can', 'jar', 'bag', 'pack', 'bottle', 'carton', 'sachet', 'bunch', 'head', 'stick', 'sprig', 'stalk', 'handful'])

/**
 * Sets a line's amount where `quantity` is in the unit the READER gives the line (1 Oct 2026). `withQuantity` above keeps
 * the WRITTEN unit, which is right when the number comes from a person reading the line ("make it 200") and wrong when it
 * comes from the parsed value of a line the reader CONVERTED: "8 oz chicken" parses as 227 g, and scaled by 1.3 and written
 * back beside the old word that is "295 oz", twenty-eight times too much. A converted line (oz, lb, kg, l, a range, "2 x 150g",
 * a bracketed weight, an amount written last) is rewritten in the reader's own unit; every other line keeps her words and
 * changes only the number. Null means there is nothing to resize (no readable amount), and the caller keeps the line.
 */
export function withParsedQuantity(line: string, quantity: number): string | null {
  const p = parseIngredientLine(line)
  if (p.unread) return null
  const writtenInGrams = /^\s*[\d./\s]+\s*(?:g|gr|grams?|ml|mls|millilit(?:re|er)s?)\b/i.test(line)
  // "2-3 tbsp" and "2 x 150g" are two numbers; replacing the first would leave "5-3 tbsp".
  const twoNumbers = /^\s*(?:\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(?:-|to|[x×])\s*\d/i.test(line)
  if (((p.unit === 'g' || p.unit === 'ml') && !writtenInGrams) || twoNumbers) {
    return p.unit === 'g' || p.unit === 'ml' ? `${quantity}${p.unit} ${p.name}` : p.unit === 'whole' ? `${quantity} ${p.name}` : `${quantity} ${p.unit} ${p.name}`
  }
  return withQuantity(line, quantity)
}

/** Whether a resize should weigh this line in grams rather than count it: see WEIGHED_WHEN_RESIZED. */
export function isWeighedWhenResized(unit: string): boolean {
  return WEIGHED_WHEN_RESIZED.has(unit.toLowerCase().trim())
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

  const rounded = scaleIngredients(ingredients, scaleFactor)
  return { ingredients: holdProteinFloor(ingredients, rounded, scaleFactor, target.protein), scaleFactor }
}

/**
 * ROUNDING MUST NOT BE WHAT TAKES A DISH UNDER ITS PROTEIN FLOOR.
 *
 * Every caller that checks a scaled dish asks for protein AT OR ABOVE the
 * target, with no tolerance (meetsProteinFloor). A dish resized to a budget
 * of its own shape — last night's dinner re-portioned as lunch is exactly
 * that — lands on the floor to the gram, so whichever way the protein food
 * happens to round decides whether the dish is served. With whole grams that
 * was a coin toss worth 0.3 g; with fives it would be one worth 1.5 g, and it
 * was measured doing it: the leftover lunch vanished (test:leftovers) the
 * moment grams went to fives.
 *
 * So: when the exact scaled dish reaches the floor and the rounded one does
 * not, the richest protein line that was rounded DOWN is rounded up instead
 * (one step: 5 g, or 1 g under 20). Still an amount somebody can measure,
 * still costed from what is shown, at most one step heavier than "nearest".
 * When the exact dish does not reach the floor either, rounding is not the
 * reason and nothing is touched.
 */
function holdProteinFloor(
  original: MealIngredientLine[],
  rounded: MealIngredientLine[],
  scaleFactor: number,
  proteinFloor: number,
): MealIngredientLine[] {
  if (rounded === original || !(proteinFloor > 0)) return rounded
  if (computeMealMacros(rounded).protein >= proteinFloor) return rounded
  const exact = original.map(l => ({ ...l, quantity: l.quantity * scaleFactor }))
  if (computeMealMacros(exact).protein < proteinFloor) return rounded

  const roundedDown = rounded
    .map((l, i) => ({ i, density: lookupIngredient(l.name)?.per100g.protein ?? 0 }))
    .filter(({ i }) => GRAM_LIKE_UNITS.has(rounded[i].unit.toLowerCase().trim()) && rounded[i].quantity < exact[i].quantity)
    .sort((a, b) => b.density - a.density)
  let out = rounded
  for (const { i, density } of roundedDown) {
    if (density <= 0) break
    const q = out[i].quantity
    out = out.map((l, j) => (j === i ? { ...l, quantity: q + (q < KITCHEN_FINE_BELOW_G ? 1 : KITCHEN_GRAM_STEP) } : l))
    if (computeMealMacros(out).protein >= proteinFloor) return out
  }
  // No single step up reaches it: leave the plain rounding, and the caller's
  // own floor check refuses the dish as it would have.
  return rounded
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

/**
 * One ingredient line -> {name, quantity, unit}. The reading itself lives in
 * ingredient-units.ts (zero imports, so the coach's edge function carries the
 * same copy): oz, lb, kg and litres are converted exactly, fractions and
 * ranges are read, and an amount that cannot be understood comes back marked
 * `unread` with the line as written, never guessed. A line that reads
 * correctly reads exactly as it always did.
 *
 * AN AMOUNT SAID IN WORDS IS STILL AN AMOUNT (9 Oct 2026, test log H6): "two
 * slices of toast", "three eggs". The reader takes "a", "an", "one" and
 * "half"; a counted number word is read here, and only when the food database
 * can weigh the result, so "two handfuls" is left to the reader exactly as it was.
 */
const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
export function parseIngredientLine(text: string): MealIngredientLine {
  const worded = text.trim().match(/^(two|three|four|five|six|seven|eight|nine|ten)\s+(.+)$/i)
  if (worded) {
    const asNumber = readIngredientText(`${NUMBER_WORDS[worded[1].toLowerCase()]} ${worded[2]}`)
    const entry = asNumber.unread ? null : lookupIngredient(asNumber.name)
    if (entry && unitToGrams(entry, asNumber.unit, asNumber.quantity, asNumber.name) != null) return asNumber
  }
  return readIngredientText(text)
}

export function parseIngredientLines(texts: string[]): MealIngredientLine[] {
  return texts.map(parseIngredientLine)
}
