import { verifyProposal, computeSlotBudgets, type RawProposal } from './meal-generation'
import { normaliseSlot, normaliseIngredients, normaliseDate, explainRejection, type MealAdditionPayload } from './meal-addition'
import type { MacroTargets } from './types'
import type { ProposalDiff } from './pending-actions-store'
import type { MealSlotName } from './meal-store'
import type { MealKnockOn } from './meal-knock-on'
import { dayLabel } from './day-labels'
import { KNOCK_ON } from './coach-voice'

// ---------------------------------------------------------------------------
// "Add a banana to my breakfast" — a food JOINING a meal that is already on
// the plan. Ashley, 3 Sep 2026: every such request was being routed to
// propose_meal_addition, which treats the words as a brand-new dish and
// tries to portion "Banana" to a whole breakfast's macros — so it refused,
// every time, for every food. Her ruling on the shape: her food, at her
// amount, added to the meal she names, through the same safety checks as
// everything else, with the rest of the day re-fitted around it.
//
// HOW IT SITS BETWEEN THE OTHER TWO DOORS:
//   propose_meal_addition — a dish IDEA, rescaled to the slot's budget.
//   propose_custom_meal   — her whole meal at her amounts; becomes the slot.
//   this                  — her food at her amount, on top of the meal the
//                           slot already has; becomes the slot, original kept
//                           in the options.
//
// WHAT IS DELIBERATELY IDENTICAL, again: the pipeline. The current meal's
// own ingredient lines plus the new food go through verifyProposal in
// keepPortions mode — food-DB resolution, the ≥80% coverage floor, the
// dislike filter, validateMealAgainstDiet — exactly as a custom meal does.
// The result is a PoolOption like any other, confirmed through the same
// executor (executeMealAddition), with the same undo. No verification is
// added here and none is skipped; the meal she started with already passed
// these checks, so what the gate is really judging is the food she added.
// ---------------------------------------------------------------------------

/** The meal currently in the slot for the day, as the chat sees it. */
export interface CurrentMealForSlot {
  name: string
  /** Ingredient lines in the app's own format — "122g raw chicken breast" — as chosenToMealPlanDays emits them. */
  ingredients: string[]
  macros: MacroTargets
}

export interface BuildMealFoodAddInput {
  rawArgs: Record<string, unknown>
  /** Null when the slot has no meal today — there is nothing to add to. */
  currentMeal: CurrentMealForSlot | null
  profileId: string
  todayDate: string
  targets: MacroTargets
  mealsPerDay?: number
  includeSnacks?: boolean
  dietaryPreferences: string[]
  dislikedFoods?: string[]
}

export type MealFoodAddResult =
  | { ok: true; scopeKey: string; preconditions: Record<string, unknown>; payload: MealAdditionPayload; diff: ProposalDiff }
  | { ok: false; reason: string }

const signed = (n: number, unit: string) => `${n > 0 ? '+' : ''}${n}${unit}`

/** How far the meal now sits from its usual share of the day — a figure the builder computed, said plainly. Shared with the custom meal's card. */
export const shareLine = (slot: string, vsBudget: number): string =>
  `That is ${Math.abs(vsBudget)} kcal ${vsBudget > 0 ? 'over' : 'under'} the usual ${slot} share.`

/**
 * The card with what the trial found added to it (meal-knock-on.ts): every
 * other meal that changes, a day taken off target, the shopping list. No
 * trial (null) — the card says it could not check, rather than saying nothing
 * or asserting that things "re-fit".
 */
export function withKnockOn(diff: ProposalDiff, knockOn: MealKnockOn | null): ProposalDiff {
  const lines = knockOn ? knockOn.lines : [{ severity: 'info' as const, text: KNOCK_ON.unknown }]
  return { ...diff, implications: [...(diff.implications ?? []), ...lines] }
}

export function buildMealFoodAddProposal(input: BuildMealFoodAddInput): MealFoodAddResult {
  const { rawArgs, currentMeal } = input
  const slot = normaliseSlot(rawArgs.meal_slot)
  if (!slot) return { ok: false, reason: 'Which meal should that go with — breakfast, lunch, dinner or a snack?' }
  const foodLines = normaliseIngredients(rawArgs.food_lines)
  if (foodLines.length === 0) {
    return { ok: false, reason: 'Tell me what to add and how much — like "a banana" or "100g rice" — and I\'ll work out the numbers.' }
  }
  // Same rule as a custom meal: the amount is hers, so it has to be stated.
  const missingAmounts = foodLines.filter(l => !/\d/.test(l) && !/\b(a|an|one|half|quarter)\b/i.test(l))
  if (missingAmounts.length > 0) {
    return { ok: false, reason: `How much ${missingAmounts.length === 1 ? 'of the ' + missingAmounts[0] : 'of each — ' + missingAmounts.join(', ')}? Grams, or counts like "2 eggs", both work.` }
  }
  if (!currentMeal) {
    return { ok: false, reason: `There's no ${slot} on your plan today to add that to. Tell me what you're having for ${slot} and I'll set it up as the meal instead.` }
  }
  const budgets = computeSlotBudgets(input.targets, input.mealsPerDay, input.includeSnacks)
  const budget = budgets[slot as MealSlotName]
  if (!budget) {
    return { ok: false, reason: `Your plan doesn't have a ${slot} slot at the moment. You can change how many meals a day you eat in Profile, and then I can add it.` }
  }

  const added = foodLines.join(', ')
  // THE ADDED FOOD ON ITS OWN, FIRST. The coverage floor is measured over
  // the whole proposal, so a made-up food beside four real ingredients
  // still clears 80% — and its macros would be a guess dressed up in the
  // meal's real numbers. The gate caught exactly that ("50g flargle root"
  // on a parfait was accepted) before this pass existed. Same verifier,
  // same mode; it just has to resolve the thing she asked for before the
  // meal as a whole is judged.
  const addedOnly: RawProposal = { slot, name: added, ingredients: foodLines, prep: '', cuisine: '' }
  const addedLog: string[] = []
  const addedOption = verifyProposal(addedOnly, slot, budget, input.dietaryPreferences, addedLog, input.dislikedFoods ?? [], undefined, true)
  if (!addedOption) return { ok: false, reason: explainRejection(addedLog, added, slot) }

  const proposal: RawProposal = {
    slot,
    name: `${currentMeal.name} + ${added}`,
    ingredients: [...currentMeal.ingredients, ...foodLines],
    prep: '',
    cuisine: '',
  }
  // THE ENFORCEMENT — keepPortions, because every amount here is a fact:
  // the meal's as it was served, the addition as she stated it.
  const rejectLog: string[] = []
  const option = verifyProposal(proposal, slot, budget, input.dietaryPreferences, rejectLog, input.dislikedFoods ?? [], undefined, true)
  if (!option) return { ok: false, reason: explainRejection(rejectLog, added, slot) }

  const date = normaliseDate(rawArgs.date, input.todayDate)
  const m = option.macros
  const before = currentMeal.macros
  const vsBudget = Math.round(m.calories - budget.calories)
  const diff: ProposalDiff = {
    rows: [
      { field: 'Adding to', before: slot, after: added },
      { field: 'Calories', before: `${Math.round(before.calories)} kcal`, after: `${Math.round(m.calories)} kcal`, note: signed(Math.round(m.calories - before.calories), ' kcal') },
      { field: 'Protein', before: `${Math.round(before.protein)}g`, after: `${Math.round(m.protein)}g`, note: signed(Math.round(m.protein - before.protein), 'g') },
      { field: 'Carbs', before: `${Math.round(before.carbs)}g`, after: `${Math.round(m.carbs)}g`, note: signed(Math.round(m.carbs - before.carbs), 'g') },
      { field: 'Fat', before: `${Math.round(before.fat)}g`, after: `${Math.round(m.fat)}g`, note: signed(Math.round(m.fat - before.fat), 'g') },
    ],
    implications: [
      { severity: 'info', text: `Your ${slot} keeps everything it had — ${added} joins it at the amount you said, no re-portioning.` },
      // WHAT ELSE CHANGES IS NOT SAID HERE. This line used to read "The rest
      // of the day re-fits around it" — a sentence written in advance, on a
      // card for an edit that replaced a dinner and a snack (test log H9,
      // 9 Oct 2026). What the rest of the plan does is now READ OFF A TRIAL by
      // the caller and added to this card (withKnockOn, below); the builder
      // states only what it computed itself.
      ...(vsBudget !== 0 ? [{ severity: 'info' as const, text: shareLine(slot, vsBudget) }] : []),
      // "today" or the weekday, never "2026-09-16" — meal-food-edit.ts's rule:
      // a date she can read off her own phone's clock is not information, it
      // is the app talking to itself in front of her.
      { severity: 'info', text: `Becomes your ${slot} for ${dayLabel(date, input.todayDate)}; the original stays in your ${slot} options.` },
    ],
    rationale: typeof rawArgs.origin_verbatim_quote === 'string' && rawArgs.origin_verbatim_quote.trim() ? rawArgs.origin_verbatim_quote.trim() : undefined,
    reversible: true,
  }
  return {
    ok: true,
    scopeKey: `${input.profileId}:propose_meal_food_add:${slot}:${date}`,
    preconditions: { slot, date, mealName: option.name, addedTo: currentMeal.name },
    payload: { slot, date, option },
    diff,
  }
}
