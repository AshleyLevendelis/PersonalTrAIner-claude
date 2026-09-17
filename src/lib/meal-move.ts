import { verifyProposal, computeSlotBudgets, type RawProposal } from './meal-generation'
import { normaliseSlot, normaliseDate, explainRejection, type MealAdditionPayload } from './meal-addition'
import { parseIngredientLines, withQuantity, computeScaleFactor, isScaleFactorAbsurd, MIN_SCALE_FACTOR, MAX_SCALE_FACTOR } from './portion-scaler'
import type { MacroTargets } from './types'
import type { ProposalDiff } from './pending-actions-store'
import type { MealSlotName } from './meal-store'
import type { CurrentMealForSlot } from './meal-food-add'

// ---------------------------------------------------------------------------
// MOVING A MEAL — "I'll have dinner as my snack instead."
//
// The last operation on the meal grain that existed on no surface. CLAUDE.md's
// must-have list had it as MISSING "and deliberately: a dinner dropped into a
// breakfast slot does not fit breakfast's budget, and refuse / refit / rescale
// is Ashley's call."
//
// SHE MADE BOTH CALLS.
//   13 Sep 2026, on the budget: "Resize it to fit" — chosen over refusing the
//   move and over leaving the portions alone. A meal landing in a smaller slot
//   is scaled to that slot and the app says what changed.
//   14 Sep 2026, on the slot the meal LEFT, from three options: "they swap
//   places". Dinner becomes the snack, the snack becomes dinner, both resized,
//   both new sizes stated. It is the only one of the three where the day still
//   adds up without the app inventing a change she did not ask for.
//
// SAME DAY ONLY, AND THAT IS NAMED RATHER THAN QUIETLY DROPPED. Moving to
// another DAY is not built: `NutritionDisplay` is handed today's session date
// and no screen anywhere renders another day's meals, so the destination is
// somewhere she cannot see, check, or undo by looking. That is the one thing
// the must-have list forbids outright. It needs a future-day meal view first.
// docs/plans/moving-a-meal.md carries the whole reasoning.
//
// ONE PIPELINE, AS EVER. Every scaled meal goes through the same
// verifyProposal every generated and every edited meal goes through — food-DB
// resolution, the coverage floor, the dislike filter, validateMealAgainstDiet.
// A move CANNOT introduce an allergen, since the foods are identical and only
// the amounts change, and it is verified identically anyway: deciding
// per-operation which checks to run is exactly the shape of the bug that let
// the almond butter through the swap path.
// ---------------------------------------------------------------------------

export interface MealMoveLeg {
  /** Where this meal is going. */
  slot: MealSlotName
  /** Where it came from — for the sentence, never for the write. */
  fromSlot: MealSlotName
  payload: MealAdditionPayload
  /** Its calories before and after the resize, for the card. */
  beforeKcal: number
  afterKcal: number
  originalName: string
}

export interface MealMovePayload {
  date: string
  /** One leg for a one-way move into an empty slot, two for a swap. */
  legs: MealMoveLeg[]
  /** Set on a one-way move: the slot that ends up with nothing in it. */
  emptiedSlot?: MealSlotName
}

export interface BuildMealMoveInput {
  rawArgs: Record<string, unknown>
  /** Every slot's current meal, by slot. A slot with nothing in it is absent. */
  mealsBySlot: Partial<Record<MealSlotName, CurrentMealForSlot>>
  profileId: string
  todayDate: string
  targets: MacroTargets
  mealsPerDay?: number
  includeSnacks?: boolean
  dietaryPreferences: string[]
  dislikedFoods?: string[]
}

export type MealMoveResult =
  | { ok: true; scopeKey: string; preconditions: Record<string, unknown>; payload: MealMovePayload; diff: ProposalDiff }
  | { ok: false; reason: string }

/** Plain words for a slot, because "snack" reads oddly with "your". */
const slotWords = (slot: MealSlotName) => (slot === 'snack' ? 'your snack' : slot)

/**
 * THE RESIZE ITSELF — every line's number moved by one factor, everything
 * after the number preserved exactly.
 *
 * NOT by re-rendering the parsed line. `withQuantity`'s own comment records
 * why, and it is the whole reason that function exists: the parser normalises
 * "3 slices wholemeal bread" to unit "slice", so a round trip hands back
 * "3 slice wholemeal bread". The macros would be identical and the list she
 * reads would be written in the app's grammar instead of hers.
 *
 * Returns null when the factor is absurd — a meal that would have to shrink
 * past 0.4x or grow past 2.5x is refused rather than served, which is
 * `portion-scaler`'s existing rule and not a new one invented here.
 */
export function resizeMealTo(
  meal: CurrentMealForSlot,
  destinationBudget: MacroTargets,
): { ingredients: string[]; factor: number } | { rejected: string; factor: number } {
  const factor = computeScaleFactor(meal.macros.calories, destinationBudget.calories)
  if (isScaleFactorAbsurd(factor)) {
    return {
      rejected: factor > MAX_SCALE_FACTOR
        ? 'it would have to more than double to fill that slot'
        : 'it would have to shrink to less than half to fit',
      factor,
    }
  }
  const parsed = parseIngredientLines(meal.ingredients)
  const ingredients = meal.ingredients.map((line, i) => {
    const q = parsed[i]?.quantity
    if (q == null) return line
    const unit = (parsed[i]?.unit ?? '').toLowerCase().trim()
    // The same per-unit rounding scaleIngredients uses, applied to the line's
    // own number so the text survives: whole grams and ml, one decimal for
    // spoons, and never below one of a counted thing — half an egg scaled from
    // a whole one is not a portion anybody serves.
    const scaled = q * factor
    const rounded = unit === 'g' || unit === 'gram' || unit === 'grams' || unit === 'ml'
      ? Math.max(1, Math.round(scaled))
      : unit === 'tbsp' || unit === 'tablespoon' || unit === 'tsp' || unit === 'teaspoon'
        ? Math.max(0.1, Math.round(scaled * 10) / 10)
        : Math.max(1, Math.round(scaled))
    return withQuantity(line, rounded) ?? line
  })
  return { ingredients, factor }
}

/**
 * WHAT THE MOVED MEAL IS CALLED, and it must differ from what it is called
 * now. A pick is stored and resolved by meal NAME, so an option that keeps its
 * name is indistinguishable from the original: the write lands in the database
 * and the screen goes on rendering the meal that was already there. That has
 * happened in this codebase once already, on the food edits, and only the
 * browser driver found it — every unit check was green.
 */
export const movedName = (name: string, slot: MealSlotName) => `${name} (as ${slot})`

function legFor(
  input: BuildMealMoveInput,
  meal: CurrentMealForSlot,
  fromSlot: MealSlotName,
  toSlot: MealSlotName,
  budget: MacroTargets,
  date: string,
): { leg: MealMoveLeg } | { err: string } {
  const resized = resizeMealTo(meal, budget)
  if ('rejected' in resized) {
    return { err: `${meal.name} can't become ${slotWords(toSlot)} — ${resized.rejected}. Swap it for something else instead?` }
  }
  const proposal: RawProposal = {
    slot: toSlot,
    name: movedName(meal.name, toSlot),
    ingredients: resized.ingredients,
    prep: '',
    cuisine: '',
  }
  const rejectLog: string[] = []
  // keepPortions, because the portions were just set deliberately to fit this
  // slot. Letting verifyProposal scale again would undo the fit the resize
  // exists to produce.
  const option = verifyProposal(
    proposal, toSlot, budget, input.dietaryPreferences, rejectLog, input.dislikedFoods ?? [], undefined, true,
  )
  if (!option) return { err: explainRejection(rejectLog, meal.name, toSlot) }
  return {
    leg: {
      slot: toSlot,
      fromSlot,
      payload: { slot: toSlot, date, option },
      beforeKcal: Math.round(meal.macros.calories),
      afterKcal: Math.round(option.macros.calories),
      originalName: meal.name,
    },
  }
}

export function buildMealMoveProposal(input: BuildMealMoveInput): MealMoveResult {
  const fromSlot = normaliseSlot(input.rawArgs.from_slot ?? input.rawArgs.meal_slot)
  const toSlot = normaliseSlot(input.rawArgs.to_slot)
  if (!fromSlot) return { ok: false, reason: 'Which meal did you want to move — breakfast, lunch, dinner or a snack?' }
  if (!toSlot) return { ok: false, reason: `Where should ${slotWords(fromSlot)} go — breakfast, lunch, dinner or a snack?` }
  if (fromSlot === toSlot) return { ok: false, reason: `That's already where ${slotWords(fromSlot)} is.` }

  const budgets = computeSlotBudgets(input.targets, input.mealsPerDay, input.includeSnacks)
  const fromBudget = budgets[fromSlot]
  const toBudget = budgets[toSlot]
  // A SLOT THE PROFILE DOES NOT HAVE. Offering a move into it would be a
  // control that cannot take effect — the same sentence meal-food-edit uses,
  // pointing at the one screen that can change it.
  if (!toBudget) return { ok: false, reason: `Your plan doesn't have a ${toSlot} slot at the moment. You can change how many meals a day you eat in Profile.` }
  if (!fromBudget) return { ok: false, reason: `Your plan doesn't have a ${fromSlot} slot at the moment. You can change how many meals a day you eat in Profile.` }

  const moving = input.mealsBySlot[fromSlot]
  if (!moving) return { ok: false, reason: `There's no ${slotWords(fromSlot)} on your plan today to move.` }
  const displaced = input.mealsBySlot[toSlot]
  const date = normaliseDate(input.rawArgs.date, input.todayDate)

  const out = legFor(input, moving, fromSlot, toSlot, toBudget, date)
  if ('err' in out) return { ok: false, reason: out.err }
  const legs: MealMoveLeg[] = [out.leg]

  // HER RULING: THEY SWAP PLACES. The meal already in the destination comes
  // back the other way, resized to the slot it arrives in, rather than being
  // discarded or quietly replaced from the pool.
  if (displaced) {
    const back = legFor(input, displaced, toSlot, fromSlot, fromBudget, date)
    if ('err' in back) return { ok: false, reason: back.err }
    legs.push(back.leg)
  }

  const rows: ProposalDiff['rows'] = legs.map(leg => ({
    field: leg.originalName,
    before: `${leg.fromSlot} · ${leg.beforeKcal} kcal`,
    after: `${leg.slot} · ${leg.afterKcal} kcal`,
    note: leg.afterKcal === leg.beforeKcal
      ? 'same size'
      : `${leg.afterKcal > leg.beforeKcal ? 'up' : 'down'} ${Math.abs(leg.afterKcal - leg.beforeKcal)} kcal`,
  }))

  const implications: { severity: 'info' | 'warn'; text: string }[] = []
  if (legs.length === 2) {
    // WHAT THE DAY ACTUALLY DOES, computed, never asserted.
    //
    // This line used to end "so your day still adds up the same". It was
    // caught by READING THE CARD on a real screen, not by any check: a 480
    // kcal breakfast became an 840 kcal dinner while a 780 kcal dinner became
    // a 516 kcal breakfast, and the card claimed the day was unchanged when it
    // had gone up 96. The claim can never be right in general — each meal is
    // resized to its DESTINATION's budget, and the meals were not sitting at
    // their own budgets to begin with, so the totals only match by accident.
    const net = legs.reduce((sum, l) => sum + (l.afterKcal - l.beforeKcal), 0)
    const dayEffect = Math.abs(net) < 25
      ? 'and your day lands within a few calories of where it was'
      : `and your day goes ${net > 0 ? 'up' : 'down'} about ${Math.abs(net)} kcal`
    implications.push({ severity: 'info', text: `${slotWords(fromSlot)} and ${slotWords(toSlot)} swap places. Both are resized to fit where they land, ${dayEffect}.` })
  } else {
    implications.push({ severity: 'warn', text: `Nothing comes back the other way, so ${slotWords(fromSlot)} will be empty. Your day will be lighter by about ${legs[0].beforeKcal} kcal unless you put something there.` })
  }
  const resized = legs.filter(l => l.afterKcal !== l.beforeKcal)
  if (resized.length > 0) {
    implications.push({
      severity: 'info',
      text: resized.map(l => `${l.originalName}: portions ${l.afterKcal < l.beforeKcal ? 'reduced' : 'increased'} to fit ${slotWords(l.slot)}.`).join(' '),
    })
  }

  return {
    ok: true,
    // Scoped to the PAIR of slots and the date, so a second move of the same
    // two slots replaces the pending one rather than stacking a contradictory
    // second card on top of it.
    scopeKey: `meal_move:${date}:${[fromSlot, toSlot].sort().join('-')}`,
    preconditions: { date, fromSlot, toSlot, movingName: moving.name, displacedName: displaced?.name ?? null },
    payload: { date, legs, ...(displaced ? {} : { emptiedSlot: fromSlot }) },
    diff: { rows, implications },
  }
}
