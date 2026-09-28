/**
 * The meal-pool fixture shared by the meal measurements (measure:meal-variety,
 * measure:meal-repeats): dishes built from real foods, sized the way
 * verifyProposal accepts a real proposal. One copy, so two measurements of the
 * same pools cannot drift apart. See measure-meal-variety.ts for why the
 * fixture is shaped this way (27 Sep 2026).
 */
import { CALORIE_TOLERANCE, scaleIngredients } from '../src/lib/portion-scaler'
import { computeMealMacros, lookupIngredient, type MealIngredientLine } from '../src/lib/food-db'
import type { PoolOption } from '../src/lib/meal-generation'
import type { MacroTargets } from '../src/lib/types'
import type { MealSlotName } from '../src/lib/meal-store'

/** Seeded, so two runs of this script are comparable. Nothing here reads the clock. */
export function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Food = readonly [name: string, lo: number, hi: number, unit?: string]
export const PROTEIN: Food[] = [['chicken breast', 100, 200], ['salmon', 100, 180], ['tuna', 80, 160], ['beef mince', 100, 180], ['greek yogurt', 150, 300], ['eggs', 2, 4, 'whole'], ['tofu', 120, 220], ['turkey breast', 100, 200], ['cottage cheese', 100, 250]]
export const CARB: Food[] = [['white rice', 60, 150], ['oats', 40, 100], ['pasta', 60, 140], ['sweet potato', 150, 300], ['wholemeal bread', 2, 3, 'slice'], ['potatoes', 150, 350], ['quinoa', 50, 120], ['banana', 1, 2, 'medium'], ['lentils', 50, 120]]
export const FAT: Food[] = [['olive oil', 5, 15], ['peanut butter', 10, 30], ['avocado', 50, 120], ['cheddar', 15, 40], ['almonds', 10, 30]]
export const VEG: Food[] = [['broccoli', 60, 150], ['spinach', 30, 80], ['peppers', 50, 120], ['mixed berries', 50, 120], ['tomatoes', 60, 150]]

/** How far the pool's targets sit from today's. 1.00 is the old fixture's only case. */
export const DRIFTS = [1.0, 0.95, 0.9, 1.1]

const pick = <T,>(rnd: () => number, xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]
function line(rnd: () => number, [name, lo, hi, unit]: Food): MealIngredientLine {
  const q = lo + rnd() * (hi - lo)
  return { name, quantity: unit ? Math.max(1, Math.round(q)) : Math.round(q), unit: unit ?? 'g' }
}
function macrosOf(ings: MealIngredientLine[]): MacroTargets {
  const c = computeMealMacros(ings)
  return { calories: Math.round(c.kcal), protein: Math.round(c.protein), carbs: Math.round(c.carbs), fat: Math.round(c.fat) }
}

/** One dish from real foods, sized the way verifyProposal accepts one, or null after enough tries. */
export function makeDish(rnd: () => number, slot: MealSlotName, i: number, budget: MacroTargets): PoolOption | null {
  for (let tries = 0; tries < 200; tries++) {
    let ings = [line(rnd, pick(rnd, PROTEIN)), line(rnd, pick(rnd, CARB)), line(rnd, pick(rnd, FAT)), line(rnd, pick(rnd, VEG))]
    const first = macrosOf(ings)
    if (first.calories <= 0) continue
    ings = scaleIngredients(ings, budget.calories / first.calories)
    const m = macrosOf(ings)
    if (Math.abs(m.calories - budget.calories) / budget.calories > CALORIE_TOLERANCE) continue
    if (m.protein < budget.protein) continue
    return { slot, name: `${slot}-${i}`, ingredients: ings, macros: m, tags: [] }
  }
  return null
}

/** Every fixture food the database cannot find, which would compute as nothing. */
export function missingFixtureFoods(): string[] {
  return [...PROTEIN, ...CARB, ...FAT, ...VEG].filter(([n]) => !lookupIngredient(n)).map(([n]) => n)
}
