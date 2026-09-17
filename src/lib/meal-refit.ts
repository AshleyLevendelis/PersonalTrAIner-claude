// ---------------------------------------------------------------------------
// WHEN YOUR FOOD TARGET HAS DRIFTED AWAY FROM YOUR MEALS
//
// A calorie target is DERIVED — from bodyweight, activity, goal and macro
// mode — so it moves on its own while the meals sit still. The meals are not
// frozen: assembleDay is pure and runs on every render, so a target move
// already re-searches the pool for the combination that fits best, and
// repair-scales the largest unpinned slot when nothing fits. That machinery
// absorbs a single step invisibly, and it should — one step of the weight
// anchor is ~12-19 kcal, and speaking about that would be a nag.
//
// WHAT IT CANNOT ABSORB is accumulation. Every option in the pool was accepted
// against slot budgets frozen at the last generation, assembly repairs at most
// ONE slot, and only on calories. A few kilos into a cut the day genuinely no
// longer fits, and today the Nutrition tab prints the gap as "60 over" with no
// account of why and no control but a full regenerate.
//
// ASHLEY'S RULINGS, 17 Sep 2026, two of them:
//   1. From four options — TELL HER AND OFFER TO REFIT. Not silently (that
//      breaks "nothing changes without a tap"), not automatically, and not by
//      swapping the meals out.
//   2. From three — STAY QUIET UNTIL THE DRIFT IS REAL, AND REFIT BY RESIZING.
//      Same meals, adjusted amounts, so the shopping list stays valid and
//      saying yes costs nothing.
//
// WHY REGENERATING WOULD BE THE WRONG TOOL, measured rather than assumed:
// handleRegenerateAllMeals costs a paid edge call, replaces the whole pool,
// clears every manual pick for the day, and leaves the grocery list naming
// ingredients for meals that no longer exist — under a caption that says it
// was built from them. Resizing touches none of that: same foods, same names,
// same picks, only the numbers move.
//
// THE TRIGGER IS THE ASSEMBLER'S OWN VERDICT, NEVER A CALORIE THRESHOLD
// INVENTED HERE. assembleDay already returns `withinTolerance` against
// DAY_CALORIE_TOLERANCE, the protein band and the carb/fat bands. Asking it is
// what makes this immune to those tolerances being retuned later: a threshold
// written in this file would silently disagree with them the first time one
// moved, and nothing would notice.
// ---------------------------------------------------------------------------

import {
  assembleDay, computeSlotBudgets,
  type PoolOption, type AssembledDay,
} from './meal-generation'
import { scaleToTarget } from './portion-scaler'
import { computeMealMacros, type Macros100g } from './food-db'
import type { MealSlotName } from './meal-store'
import type { MacroTargets, UserProfile } from './types'

/** food-db speaks kcal; the rest of the app speaks calories. One conversion, here. */
const asTargets = (m: Macros100g): MacroTargets => ({
  calories: Math.round(m.kcal),
  protein: Math.round(m.protein),
  carbs: Math.round(m.carbs),
  fat: Math.round(m.fat),
})

const asMacros100g = (t: MacroTargets): Macros100g => ({
  kcal: t.calories, protein: t.protein, carbs: t.carbs, fat: t.fat,
})

export type MealPools = Partial<Record<MealSlotName, PoolOption[]>>

export interface SlotResize {
  slot: MealSlotName
  /** The meal's own name, unchanged — this is a resize, not a swap. */
  name: string
  before: MacroTargets
  after: MacroTargets
}

export interface MealRefit {
  /** Whether the day has drifted far enough to be worth saying anything about. */
  needed: boolean
  /** The day as it stands, and as it would stand after the resize. */
  before: { totals: MacroTargets; withinTolerance: boolean }
  after: { totals: MacroTargets; withinTolerance: boolean }
  /** The resized pools, ready to persist on a confirm. Identical to the input when nothing moved. */
  pools: MealPools
  /** Only the slots whose chosen meal actually changed size. */
  resized: SlotResize[]
  /** Slots left alone because the user pinned them. Named so the card can say why the fit is imperfect. */
  pinnedUntouched: MealSlotName[]
  /**
   * WHAT IT COULD NOT FIX, in plain words, or null. A resize has rails — a
   * meal cannot honestly shrink below 0.4x or grow past 2.5x — so some days
   * cannot be made to fit by portions alone. Saying so is the whole difference
   * between this and a card that claims success it did not achieve.
   */
  couldNotFix: string | null
}

export interface RefitOptions {
  mealsPerDay?: number
  includeSnacks?: boolean
  /** Slots the user pinned. Their portions are facts and are never resized. */
  pinned?: Partial<Record<MealSlotName, PoolOption>>
  softLikedFoods?: string[]
}

/**
 * Would resizing help, and by how much? Pure: reads nothing, writes nothing,
 * and returns the resized pools rather than applying them, so the caller can
 * show them before the tap.
 */
export function checkMealRefit(
  pools: MealPools,
  targets: MacroTargets,
  opts: RefitOptions = {},
): MealRefit {
  const { mealsPerDay, includeSnacks, pinned = {}, softLikedFoods = [] } = opts

  const before = assembleDay(pools, targets, {}, softLikedFoods, pinned)
  const emptyResult = (reason: string | null): MealRefit => ({
    needed: false,
    before: { totals: before.totals, withinTolerance: before.withinTolerance },
    after: { totals: before.totals, withinTolerance: before.withinTolerance },
    pools, resized: [], pinnedUntouched: Object.keys(pinned) as MealSlotName[],
    couldNotFix: reason,
  })

  // THE ANTI-NAG HALF, and the reason this returns early rather than resizing
  // anyway. If the assembler says the day fits, it fits — by the same standard
  // the app uses everywhere else. A single anchor step lands here, silently,
  // which is Ashley's second ruling working as intended.
  if (before.withinTolerance) return emptyResult(null)
  // Nothing to resize is not the same as nothing wrong. A day with no meals at
  // all is a generation problem, and offering to resize it would be offering
  // something that cannot help.
  if (Object.values(pools).every(p => !p || p.length === 0)) {
    return emptyResult('There are no meals to resize yet.')
  }

  const budgets = computeSlotBudgets(targets, mealsPerDay, includeSnacks)
  const rejected: string[] = []
  const next: MealPools = {}

  for (const slot of Object.keys(pools) as MealSlotName[]) {
    const options = pools[slot]
    if (!options || options.length === 0) { next[slot] = options; continue }
    // PINNED IS UNTOUCHABLE. Matching assembleDay, which refuses to scale a
    // pinned slot for the same reason: the user stated those portions, so they
    // are a fact about the day rather than a number the app may adjust.
    if (pinned[slot]) { next[slot] = options; continue }

    const budget = budgets[slot]
    if (!budget) { next[slot] = options; continue }

    next[slot] = options.map(option => {
      const scaled = scaleToTarget(
        option.ingredients,
        asMacros100g(option.macros),
        asMacros100g(budget),
      )
      if (scaled.rejectedReason) { rejected.push(option.name); return option }
      // RECOMPUTED, NOT MULTIPLIED. scaleIngredients rounds per unit — grams to
      // the nearest whole, counts to a floor of 1 — so the achieved size is not
      // the requested factor. Multiplying the old macros by that factor would
      // print a number the food was never going to deliver, which is exactly
      // the fabricated-figure rule load prescription already lives under.
      const recomputed = computeMealMacros(scaled.ingredients)
      return { ...option, ingredients: scaled.ingredients, macros: asTargets(recomputed) }
    })
  }

  const after = assembleDay(next, targets, {}, softLikedFoods, pinned)

  const resized: SlotResize[] = []
  for (const slot of Object.keys(after.chosen) as MealSlotName[]) {
    const now = after.chosen[slot]
    const was = before.chosen[slot]
    if (!now || !was) continue
    // Reported only when the chosen meal is the SAME meal at a different size.
    // A different name here means assembly re-picked rather than resized, and
    // calling that a resize would be describing the wrong change.
    if (now.name !== was.name) continue
    if (now.macros.calories === was.macros.calories) continue
    resized.push({ slot, name: now.name, before: was.macros, after: now.macros })
  }

  return {
    // OFFERED ONLY WHEN THE RESIZE ACTUALLY FIXES THE DAY, which is stricter
    // than "something changed" and was made stricter after measuring the goal
    // case. A goal change moves calories x1.36 while protein stays x1.00 (fat
    // loss 2,242/160g -> muscle growth 3,040/160g on the same body), so a
    // proportional resize that reaches the calorie target drags protein from
    // 157g to 239g against a 160g target — further outside the band than
    // before it started. That is not a fix, and offering it would be offering
    // harm with a Confirm button on it.
    //
    // A RESIZE ONLY EVER WORKS WHEN THE SHAPE HELD AND THE SIZE MOVED. That is
    // true of a weigh-in and an activity change, where every macro shifts with
    // bodyweight together. It is false of a goal change, which is why the goal
    // change regenerates instead — the meals there are the wrong shape, not
    // the wrong size, and no amount of portioning fixes a shape.
    needed: after.withinTolerance && resized.length > 0,
    before: { totals: before.totals, withinTolerance: before.withinTolerance },
    after: { totals: after.totals, withinTolerance: after.withinTolerance },
    pools: next,
    resized,
    pinnedUntouched: Object.keys(pinned) as MealSlotName[],
    couldNotFix: describeResidue(after, rejected, Object.keys(pinned) as MealSlotName[]),
  }
}

/**
 * The honest half. Null when the refit lands the day inside tolerance with
 * nothing left over; otherwise one sentence naming what is still off and why,
 * in the terms a person would use.
 */
function describeResidue(
  after: AssembledDay,
  rejected: string[],
  pinnedSlots: MealSlotName[],
): string | null {
  if (after.withinTolerance && rejected.length === 0) return null

  // A PIN IS THE MOST LIKELY REASON AND THE ONE WORTH NAMING FIRST, because
  // it is the only one the reader can act on: unpin it, or accept the miss.
  if (!after.withinTolerance && pinnedSlots.length > 0) {
    return `Resizing gets close but not all the way — the meals you pinned stay exactly as you set them, so there is only so far the rest can move.`
  }
  if (!after.withinTolerance) {
    return `Resizing gets close but not all the way. Some of these meals are the wrong shape for your new numbers rather than the wrong size, so portions alone cannot finish the job.`
  }
  // Tolerance reached, but something could not be scaled honestly. Still worth
  // saying: the day fits and one meal is not the size it should be.
  return rejected.length === 1
    ? `Everything fits now except ${rejected[0]}, which would have had to change size too far to be a sensible portion.`
    : `Everything fits now except ${rejected.length} meals that would have had to change size too far to be sensible portions.`
}

/**
 * Does this profile's day need a refit? The thin wrapper App and the coach both
 * call, so neither has to know how the decision is made.
 */
export function refitNeeded(
  pools: MealPools,
  targets: MacroTargets | null,
  profile: Pick<UserProfile, 'meals_per_day' | 'include_snacks'>,
  pinned?: Partial<Record<MealSlotName, PoolOption>>,
): boolean {
  if (!targets) return false
  return checkMealRefit(pools, targets, {
    mealsPerDay: profile.meals_per_day,
    includeSnacks: profile.include_snacks,
    pinned,
  }).needed
}
