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
const NAMED_COUNT_PATTERN = new RegExp(`^(${NUMBER})\\s*(medium|large|small|whole|slices?|cloves?|scoops?)\\s+(.+)$`, 'i')
const BARE_COUNT_PATTERN = new RegExp(`^(${NUMBER})\\s+(.+)$`)

export function parseIngredientLine(text: string): MealIngredientLine {
  const trimmed = text.trim()

  const gram = trimmed.match(GRAM_PATTERN)
  if (gram) {
    const unit = gram[2].toLowerCase().startsWith('ml') ? 'ml' : 'g'
    return { name: gram[3].trim(), quantity: parseQuantityNumber(gram[1]), unit }
  }

  const vol = trimmed.match(VOLUME_PATTERN)
  if (vol) {
    const rawUnit = vol[2].toLowerCase()
    const unit = rawUnit.startsWith('tbsp') || rawUnit.startsWith('tablespoon') ? 'tbsp'
      : rawUnit.startsWith('tsp') || rawUnit.startsWith('teaspoon') ? 'tsp'
      : 'cup'
    return { name: vol[3].trim(), quantity: parseQuantityNumber(vol[1]), unit }
  }

  const named = trimmed.match(NAMED_COUNT_PATTERN)
  if (named) {
    const rawUnit = named[2].toLowerCase().replace(/s$/, '')
    return { name: named[3].trim(), quantity: parseQuantityNumber(named[1]), unit: rawUnit }
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
