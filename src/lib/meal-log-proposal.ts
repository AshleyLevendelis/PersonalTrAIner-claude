// ---------------------------------------------------------------------------
// "I just had greek yoghurt with honey" -> a card she taps to record it.
//
// Ashley, 7 Sep 2026, asking why the coach could compute her macros and not
// keep them: log_meal's handler used to insert into `daily_food_logs`, a table
// that appears in no migration and has never existed on the live database.
// Every attempt failed, so the tool was retired to an honest decline — and the
// decline stayed long after `meal_events` existed and the Nutrition tab was
// writing to it on every Log tap.
//
// HER RULING WHEN ASKED HOW IT SHOULD FEEL: ask first, log when she taps
// confirm. Nothing touches her numbers before that.
//
// This module turns the edge function's computed meal into the proposal the
// confirm card renders from. It VERIFIES; it does not write. The write is
// recordMealEvent, on the client, after the tap — which is what keeps the
// offline queue, the idempotency, the instant on-screen update and the undo
// that a server-side insert would have thrown away.
// ---------------------------------------------------------------------------

import { MIN_COVERAGE } from './meal-generation'
import type { MealMacros, MealSlotName } from './meal-store'

/** The four the ledger accepts — meal_events' CHECK constraint, no more and no fewer. */
export const LOGGABLE_SLOTS: readonly MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack'] as const

export interface MealLogPayload {
  profileId: string
  /** YYYY-MM-DD, the local calendar date the event belongs to. */
  date: string
  slot: MealSlotName
  mealName: string
  macros: MealMacros
  /** Ingredients the food database could not resolve. Excluded from macros, shown on the card. */
  unmatched: string[]
  /** Portion sizes and variants the model had to assume. Shown on the card so she can correct them before tapping. */
  assumptions: string[]
}

export interface MealLogComputed {
  kcal: number
  protein: number
  carbs: number
  fat: number
  unmatched?: string[]
  coverage?: number
}

export type MealLogProposalResult =
  | { ok: true; scopeKey: string; preconditions: Record<string, unknown>; payload: MealLogPayload; diff: { rows: { field: string; before: string; after: string }[]; rationale?: string } }
  | { ok: false; reason: string }

/**
 * Normalise whatever the model said into one of the four real slots.
 *
 * The tool's own schema said "snack_1, snack_2" until 7 Sep 2026 — values the
 * database rejects outright — so a stale prompt, a cached tool definition or a
 * model that ignores the enum can all still send one. Mapping them is kinder
 * than refusing a real meal over a field the user never saw, but anything that
 * is NOT recognisable maps to nothing and the proposal is refused: a meal
 * filed under a guessed slot is a wrong number in her day.
 */
export function normaliseSlot(raw: unknown): MealSlotName | null {
  const s = String(raw ?? '').trim().toLowerCase()
  if ((LOGGABLE_SLOTS as readonly string[]).includes(s)) return s as MealSlotName
  if (/^snack[\s_-]*\d*$/.test(s)) return 'snack'
  if (s === 'brunch') return 'lunch'
  if (s === 'supper' || s === 'evening meal') return 'dinner'
  return null
}

const isFiniteNonNegative = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

export function buildMealLogProposal(input: {
  rawArgs: Record<string, unknown>
  computed: MealLogComputed
  assumptions?: string[]
  profileId: string
  todayDate: string
}): MealLogProposalResult {
  const { rawArgs, computed, profileId, todayDate } = input

  const mealName = String(rawArgs.food_name ?? '').trim()
  if (!mealName) return { ok: false, reason: "I didn't catch what you ate — tell me again and I'll work it out." }

  const slot = normaliseSlot(rawArgs.meal_slot)
  if (!slot) {
    return { ok: false, reason: `I'm not sure which meal **${mealName}** belongs to — breakfast, lunch, dinner or a snack?` }
  }

  const { kcal, protein, carbs, fat } = computed
  if (![kcal, protein, carbs, fat].every(isFiniteNonNegative)) {
    return { ok: false, reason: `I couldn't work out the numbers for **${mealName}** — try telling me the amounts.` }
  }

  // THE SAME FLOOR EVERY GENERATED MEAL PASSES. An under-resolved meal's real
  // macros are unknowable, and logging 40 kcal for a proper dinner is worse
  // than logging nothing: it does not read as missing, it reads as a light
  // day, and the rest of the app believes it.
  const coverage = computed.coverage ?? 1
  if (coverage < MIN_COVERAGE) {
    const missing = (computed.unmatched ?? []).join(', ')
    return {
      ok: false,
      reason: `I could only identify ${Math.round(coverage * 100)}% of **${mealName}**${missing ? ` — I don't know ${missing}` : ''}. `
        + `Logging it would put a number in your day that is too low to trust. Tell me the amounts and I'll try again.`,
    }
  }

  const macros: MealMacros = { kcal, protein, carbs, fat }

  return {
    ok: true,
    // One pending log per meal name per slot per day: a second identical
    // proposal supersedes the first rather than queueing beside it.
    scopeKey: `meal_log:${todayDate}:${slot}:${mealName.toLowerCase()}`,
    preconditions: { date: todayDate, slot, mealName },
    payload: {
      profileId,
      date: todayDate,
      slot,
      mealName,
      macros,
      unmatched: computed.unmatched ?? [],
      assumptions: input.assumptions ?? [],
    },
    diff: {
      rows: [{ field: 'meal', before: slot, after: `${mealName} — ${kcal} kcal (P ${protein}g · C ${carbs}g · F ${fat}g)` }],
      rationale: (input.assumptions ?? []).length > 0 ? `Assuming ${(input.assumptions ?? []).join('; ')}.` : undefined,
    },
  }
}
