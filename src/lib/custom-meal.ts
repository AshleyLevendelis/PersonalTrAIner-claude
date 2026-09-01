import { verifyProposal, computeSlotBudgets, type RawProposal } from './meal-generation'
import { normaliseSlot, normaliseIngredients, normaliseDate, explainRejection, type MealAdditionPayload } from './meal-addition'
import type { MacroTargets } from './types'
import type { ProposalDiff } from './pending-actions-store'
import type { MealSlotName } from './meal-store'

// ---------------------------------------------------------------------------
// "I usually have eggs and greek yoghurt and fruit for breakfast" — the
// user's OWN meal, at the user's OWN quantities (Ashley, 1 Sep 2026: "the
// app should ask how much of each food I'm having so it can calculate and
// then add that as my breakfast and plan for the rest of my meals").
//
// HOW IT DIFFERS FROM AN ADDITION, and only this: buildMealAdditionProposal
// treats the dish as a wish and rescales it to the slot's budget; here the
// stated quantities are FACTS, so verifyProposal runs in keepPortions mode —
// no rescaling, no slot-budget band. Fitting the day happens the other way
// round: the confirmed meal is pinned into assembleDay and the FREE slots
// re-fit around it ("plan the rest of my meals").
//
// WHAT IS DELIBERATELY IDENTICAL: the pipeline. Same verifyProposal (food-DB
// resolution, ≥80% coverage floor, dislike filter, validateMealAgainstDiet),
// same payload shape, same executor (executeMealAddition), same undo. A
// custom meal IS a pool option once confirmed — every downstream surface
// (display-time allergen re-check, logging, shopping list) treats it like
// any other meal with zero new code paths. A parallel "custom" pipeline
// with its own subset of checks is how the almond butter got through the
// swap path; this file adds no verification and skips none.
//
// A restriction conflict on the user's OWN food is stated plainly and gets
// no Confirm button — same posture as the chat swap path. Their kitchen is
// their business; the app's plan is the app's.
// ---------------------------------------------------------------------------

export interface BuildCustomMealInput {
  rawArgs: Record<string, unknown>
  profileId: string
  todayDate: string
  targets: MacroTargets
  mealsPerDay?: number
  includeSnacks?: boolean
  dietaryPreferences: string[]
  dislikedFoods?: string[]
}

export type CustomMealResult =
  | { ok: true; scopeKey: string; preconditions: Record<string, unknown>; payload: MealAdditionPayload; diff: ProposalDiff }
  | { ok: false; reason: string }

export function buildCustomMealProposal(input: BuildCustomMealInput): CustomMealResult {
  const { rawArgs } = input

  const slot = normaliseSlot(rawArgs.meal_slot)
  if (!slot) return { ok: false, reason: 'Which meal is this — breakfast, lunch, dinner or a snack?' }

  const foodLines = normaliseIngredients(rawArgs.food_lines)
  if (foodLines.length === 0) {
    return { ok: false, reason: "Tell me what you're having and how much of each — like \"3 eggs, 150g greek yoghurt, a banana\" — and I'll work out the numbers." }
  }

  // EVERY LINE NEEDS AN AMOUNT. The whole promise is "you say how much, I
  // calculate" — a line with no quantity would make computeMealMacros guess
  // a default portion, which is the app deciding after all. The model's
  // prompt tells it to ask first; this is the backstop for when it doesn't.
  const missingAmounts = foodLines.filter(l => !/\d/.test(l) && !/\b(a|an|one|half|quarter)\b/i.test(l))
  if (missingAmounts.length > 0) {
    return { ok: false, reason: `How much ${missingAmounts.length === 1 ? 'of the ' + missingAmounts[0] : 'of each — ' + missingAmounts.join(', ')}? Grams, or counts like "3 eggs", both work.` }
  }

  const name = typeof rawArgs.name === 'string' && rawArgs.name.trim()
    ? rawArgs.name.trim()
    : `My ${slot}`

  const budgets = computeSlotBudgets(input.targets, input.mealsPerDay, input.includeSnacks)
  const budget = budgets[slot]
  if (!budget) {
    return { ok: false, reason: `Your plan doesn't have a ${slot} slot at the moment. You can change how many meals a day you eat in Profile, and then I can add it.` }
  }

  const proposal: RawProposal = {
    slot,
    name,
    ingredients: foodLines,
    prep: '',
    cuisine: '',
  }

  // THE ENFORCEMENT — identical function, keepPortions mode. See the
  // header: this line is why a custom meal is no less safe than a
  // generated one, and the mode is why 3 eggs stay 3 eggs.
  const rejectLog: string[] = []
  const option = verifyProposal(proposal, slot, budget, input.dietaryPreferences, rejectLog, input.dislikedFoods ?? [], undefined, true)
  if (!option) return { ok: false, reason: explainRejection(rejectLog, name, slot) }

  const date = normaliseDate(rawArgs.date, input.todayDate)
  const m = option.macros
  const vsBudget = Math.round(m.calories - budget.calories)

  const diff: ProposalDiff = {
    rows: [
      { field: 'Your ' + slot, before: 'as you described it', after: option.name },
      { field: 'Calories', before: `${Math.round(budget.calories)} kcal budgeted`, after: `${Math.round(m.calories)} kcal` },
      { field: 'Protein', before: `${Math.round(budget.protein)}g budgeted`, after: `${Math.round(m.protein)}g` },
      { field: 'Carbs', before: `${Math.round(budget.carbs)}g budgeted`, after: `${Math.round(m.carbs)}g` },
      { field: 'Fat', before: `${Math.round(budget.fat)}g budgeted`, after: `${Math.round(m.fat)}g` },
    ],
    implications: [
      // The inverse of the addition card's "portions adjusted" line, and
      // the whole point of the feature: nothing was adjusted.
      { severity: 'info', text: `Your portions, untouched — ${option.ingredients.map(i => `${i.name} ${Math.round(i.quantity)}${i.unit}`).join(', ')}.` },
      { severity: 'info', text: `The rest of the day re-fits around it${vsBudget !== 0 ? ` (${vsBudget > 0 ? `${vsBudget} kcal over` : `${-vsBudget} kcal under`} the usual ${slot} share)` : ''}.` },
      { severity: 'info', text: `Joins your ${slot} options, and becomes your ${slot} for ${date}.` },
    ],
    rationale: typeof rawArgs.origin_verbatim_quote === 'string' && rawArgs.origin_verbatim_quote.trim() ? rawArgs.origin_verbatim_quote.trim() : undefined,
    reversible: true,
  }

  return {
    ok: true,
    scopeKey: `${input.profileId}:propose_custom_meal:${slot}:${date}`,
    preconditions: { slot, date, mealName: option.name },
    payload: { slot, date, option },
    diff,
  }
}
