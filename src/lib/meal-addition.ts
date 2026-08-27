// ---------------------------------------------------------------------------
// "Add this meal to my plan" (docs/PLAN-add-a-meal.md)
//
// THE WHOLE POINT OF THIS FILE IS THAT IT ADDS NO VERIFICATION OF ITS OWN.
//
// A user-named dish arrives as text the model wrote. If it reached
// meal_plan_slots without passing the checks a generated meal passes, the app
// would have a second, unguarded door into what someone eats — the
// "constraint asserted at N paths, missed at N+1" shape this codebase keeps
// producing, and this time on the allergen path.
//
// So this module routes a requested dish into `verifyProposal`, the exact
// function every generated meal already goes through: food-DB resolution, an
// 80% coverage floor (a dish the app cannot measure is refused, not guessed
// at), the disliked-foods filter, validateMealAgainstDiet, rescaling to the
// slot's macro budget, and a re-measure afterwards. One enforcement point.
//
// It lives client-side because verifyProposal is a src/lib module a Deno edge
// function cannot import. chat-gemini is a courier for this kind: it returns
// the model's raw arguments and stores nothing.
// ---------------------------------------------------------------------------

import { computeSlotBudgets, verifyProposal, type PoolOption, type RawProposal } from './meal-generation'
import type { MealSlotName } from './meal-store'
import type { MacroTargets } from './types'
import type { ProposalDiff } from './pending-actions-store'

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** The model's tool arguments, unvalidated — everything here is `unknown` until it has been through verifyProposal. */
export interface MealAdditionArgs {
  meal_slot?: unknown
  meal_name?: unknown
  ingredients?: unknown
  prep?: unknown
  cuisine?: unknown
  date?: unknown
  reason?: unknown
}

export interface MealAdditionPayload {
  slot: MealSlotName
  date: string
  /** The VERIFIED option — re-portioned and re-measured by verifyProposal. Never the model's own numbers. */
  option: PoolOption
}

export interface BuildMealAdditionInput {
  rawArgs: MealAdditionArgs
  profileId: string
  /** The day's macro targets the slot budget is carved out of. */
  targets: MacroTargets
  mealsPerDay?: number
  includeSnacks?: boolean
  dietaryPreferences: string[]
  dislikedFoods?: string[]
  /** Today, as YYYY-MM-DD — used when the model names no date. */
  todayDate: string
}

export type MealAdditionResult =
  | { ok: true; scopeKey: string; preconditions: Record<string, unknown>; payload: MealAdditionPayload; diff: ProposalDiff }
  | { ok: false; reason: string }

function normaliseSlot(value: unknown): MealSlotName | null {
  const s = String(value ?? '').trim().toLowerCase()
  return (SLOTS as string[]).includes(s) ? (s as MealSlotName) : null
}

/** Ingredient lines as verifyProposal wants them — one string per line, blanks dropped. Accepts an array or a newline-separated block, because a model will produce either. */
function normaliseIngredients(value: unknown): string[] {
  const lines = Array.isArray(value)
    ? value.map(v => String(v ?? ''))
    : String(value ?? '').split('\n')
  return lines.map(l => l.trim()).filter(Boolean)
}

/** YYYY-MM-DD or nothing. A malformed date silently becoming today would put the meal on the wrong day, so it is checked rather than coerced. */
function normaliseDate(value: unknown, fallback: string): string {
  const s = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback
}

/**
 * verifyProposal writes a precise diagnostic into its rejectLog. These are
 * written for a developer reading a generation run, not for someone who just
 * asked for a curry, so they are translated here — TRANSLATED, not replaced:
 * the reason the user sees says the same thing the log says, because "I
 * couldn't add that" with no cause is the reply this whole feature exists to
 * stop the app giving.
 */
function explainRejection(log: string[], dishName: string, slot: MealSlotName): string {
  const line = log[log.length - 1] ?? ''

  if (/diet violation/i.test(line)) {
    const detail = line.split('—').slice(1).join('—').trim()
    return `I can't add ${dishName} — it clashes with what you've told me you avoid${detail ? ` (${detail})` : ''}. Give me a version without it and I'll add that instead.`
  }
  if (/unrecognised dietary restriction/i.test(line)) {
    return `Something's wrong with the dietary restrictions saved on your profile, so I can't safely check ${dishName} against them. Worth fixing those in Profile first — I'd rather stop than guess.`
  }
  if (/contains disliked food/i.test(line)) {
    const food = /"([^"]+)"\s*$/.exec(line)?.[1]
    return `${dishName} has ${food ?? "something you've told me you don't like"} in it. Want me to add a version without it?`
  }
  if (/coverage/i.test(line)) {
    const unmatched = /unmatched:\s*(.+)$/.exec(line)?.[1]
    return `I can't measure ${dishName} accurately${unmatched ? ` — I don't have ${unmatched} in my food data` : ''}, and I'd rather not put a made-up number in your plan. Describe it with more everyday ingredients and I'll try again.`
  }
  if (/not slot-appropriate/i.test(line)) {
    return `${dishName} doesn't really work as a ${slot}. Want it in a different slot?`
  }
  if (/missed target|scale factor|no ingredients parsed/i.test(line)) {
    return `I couldn't portion ${dishName} to fit your ${slot} target without distorting it — the macro balance is too far from what that meal needs to be. It'd fit better as a different slot, or alongside a change to the rest of the day.`
  }
  return `I couldn't add ${dishName} to your ${slot} — I wasn't able to verify it against your targets.`
}

/**
 * Builds a confirmable proposal for adding a dish, or an honest refusal.
 *
 * Returns the VERIFIED option in the payload, so the confirm step writes
 * exactly what was shown on the card and re-runs nothing — the model's own
 * ingredient quantities never reach the database.
 */
export function buildMealAdditionProposal(input: BuildMealAdditionInput): MealAdditionResult {
  const { rawArgs } = input
  const dishName = String(rawArgs.meal_name ?? '').trim()
  if (!dishName) return { ok: false, reason: "I didn't catch what you wanted adding — tell me the dish and I'll sort it." }

  const slot = normaliseSlot(rawArgs.meal_slot)
  if (!slot) return { ok: false, reason: `Which meal should ${dishName} go in — breakfast, lunch, dinner or a snack?` }

  const ingredients = normaliseIngredients(rawArgs.ingredients)
  if (ingredients.length === 0) {
    return { ok: false, reason: `I need to know roughly what goes into ${dishName} before I can put it in your plan — otherwise the macros would be a guess.` }
  }

  const budgets = computeSlotBudgets(input.targets, input.mealsPerDay, input.includeSnacks)
  const budget = budgets[slot]
  if (!budget) {
    return { ok: false, reason: `Your plan doesn't have a ${slot} slot at the moment. You can change how many meals a day you eat in Profile, and then I can add it.` }
  }

  const proposal: RawProposal = {
    slot,
    name: dishName,
    ingredients,
    prep: String(rawArgs.prep ?? ''),
    cuisine: String(rawArgs.cuisine ?? ''),
  }

  // THE ENFORCEMENT. Everything above is normalisation; this line is the
  // reason a user-added meal is no less safe than a generated one.
  const rejectLog: string[] = []
  const option = verifyProposal(proposal, slot, budget, input.dietaryPreferences, rejectLog, input.dislikedFoods ?? [])
  if (!option) return { ok: false, reason: explainRejection(rejectLog, dishName, slot) }

  const date = normaliseDate(rawArgs.date, input.todayDate)
  const m = option.macros

  return {
    ok: true,
    scopeKey: `${input.profileId}:propose_meal_addition:${slot}:${date}`,
    preconditions: { slot, date, mealName: option.name },
    payload: { slot, date, option },
    diff: {
      rows: [
        { field: 'Adding to', before: slot, after: option.name },
        { field: 'Calories', before: `${Math.round(budget.calories)} kcal target`, after: `${Math.round(m.calories)} kcal` },
        { field: 'Protein', before: `${Math.round(budget.protein)}g target`, after: `${Math.round(m.protein)}g` },
        { field: 'Carbs', before: `${Math.round(budget.carbs)}g target`, after: `${Math.round(m.carbs)}g` },
        { field: 'Fat', before: `${Math.round(budget.fat)}g target`, after: `${Math.round(m.fat)}g` },
      ],
      // Said out loud on the card rather than discovered afterwards: the
      // portions are the app's, not the model's, and the meal becomes that
      // day's pick as well as joining the slot's options.
      implications: [
        { severity: 'info', text: `Portions adjusted to fit your ${slot} target — ${option.ingredients.map(i => `${i.name} ${Math.round(i.quantity)}${i.unit}`).join(', ')}` },
        { severity: 'info', text: `Joins your ${slot} options, and becomes your ${slot} for ${date}.` },
      ],
      rationale: typeof rawArgs.reason === 'string' && rawArgs.reason.trim() ? rawArgs.reason.trim() : undefined,
      reversible: true,
    },
  }
}
