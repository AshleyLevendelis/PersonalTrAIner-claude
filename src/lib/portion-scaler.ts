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

import type { MealIngredientLine, Macros100g } from './food-db'
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
 * Scales every ingredient line's quantity by scaleFactor, using the same
 * per-unit rounding conventions as macro-calibration's string scaler: gram/ml
 * quantities round to the nearest whole unit, tbsp/tsp round to one decimal,
 * and any other (named/count-like) unit rounds to the nearest whole with a
 * floor of 1 (you can't scale "2 eggs" down to 0.3 of an egg meaningfully).
 * A scaleFactor within SCALE_NOOP_THRESHOLD of 1 is left untouched.
 */
export function scaleIngredients(ingredients: MealIngredientLine[], scaleFactor: number): MealIngredientLine[] {
  if (Math.abs(scaleFactor - 1) < SCALE_NOOP_THRESHOLD) return ingredients

  return ingredients.map(line => {
    const unit = line.unit.toLowerCase().trim()
    if (GRAM_LIKE_UNITS.has(unit)) {
      return { ...line, quantity: Math.max(0, Math.round(line.quantity * scaleFactor)) }
    }
    if (VOLUME_UNITS.has(unit)) {
      return { ...line, quantity: Math.max(0, Math.round(line.quantity * scaleFactor * 10) / 10) }
    }
    return { ...line, quantity: Math.max(1, Math.round(line.quantity * scaleFactor)) }
  })
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

/**
 * One ingredient line -> {name, quantity, unit}. The reading itself lives in
 * ingredient-units.ts (zero imports, so the coach's edge function carries the
 * same copy): oz, lb, kg and litres are converted exactly, fractions and
 * ranges are read, and an amount that cannot be understood comes back marked
 * `unread` with the line as written, never guessed. A line that reads
 * correctly reads exactly as it always did.
 */
export function parseIngredientLine(text: string): MealIngredientLine {
  return readIngredientText(text)
}

export function parseIngredientLines(texts: string[]): MealIngredientLine[] {
  return texts.map(parseIngredientLine)
}
