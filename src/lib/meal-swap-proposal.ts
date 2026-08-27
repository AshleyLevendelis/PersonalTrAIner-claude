// ---------------------------------------------------------------------------
// The chat's "swap this meal" proposal, built CLIENT-side.
//
// It used to be built in chat-gemini, which had to pick the target itself to
// show before/after macros on the confirm card — and picked `alternatives[0]`,
// the first pool option that isn't the current one. That made repeated swaps
// ping-pong between the first two options (A -> B -> A -> B) and left the
// other three of a five-option pool unreachable from the chat entirely.
//
// Moving it here is not a tidy-up. It is what makes nextPoolOption the ONLY
// chooser: an edge function cannot import src/lib, so a chooser living there
// is a second copy by construction, and this codebase's recurring defect is a
// rule asserted at N places and missed at N+1 (two food databases, four places
// a dietary preference must be listed). The server is now a courier for this
// kind, exactly as it already is for propose_exercise_swap.
// ---------------------------------------------------------------------------

import { getPools, nextPoolOption, type MealSlotName } from './meal-store'
import type { PoolOption } from './meal-generation'
import type { ProposalDiff } from './pending-actions-store'

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']

export interface MealSwapArgs {
  meal_slot?: unknown
  old_item?: unknown
  new_item?: unknown
  reason?: unknown
}

export type MealSwapProposalResult =
  | { ok: true; scopeKey: string; preconditions: Record<string, unknown>; payload: { slot: MealSlotName; currentName: string; chooseName: string }; diff: ProposalDiff }
  /** `exhausted` marks the case Ashley's ruling covers: they have seen everything in the pool, so the honest next move is to OFFER to find new ones rather than to keep re-serving what they have already turned down. */
  | { ok: false; reason: string; exhausted?: { slot: MealSlotName; poolSize: number } }

function normaliseSlot(value: unknown): MealSlotName | null {
  const s = String(value ?? '').trim().toLowerCase()
  return (SLOTS as string[]).includes(s) ? (s as MealSlotName) : null
}

const byName = (options: PoolOption[], name: unknown) =>
  options.find(o => o.name.toLowerCase() === String(name ?? '').trim().toLowerCase())

export interface BuildMealSwapInput {
  rawArgs: MealSwapArgs
  profileId: string
  /**
   * Every option already offered for this slot in this conversation. When the
   * rotation's next answer is in here, the user has been round the whole pool
   * and gets the offer instead of a fifth look at the same five meals.
   */
  alreadySeen?: string[]
}

export async function buildMealSwapProposal(input: BuildMealSwapInput): Promise<MealSwapProposalResult> {
  const slot = normaliseSlot(input.rawArgs.meal_slot)
  if (!slot) return { ok: false, reason: "Which meal did you want to change — breakfast, lunch, dinner or a snack?" }

  const pools = await getPools(input.profileId)
  const options = pools[slot] ?? []
  if (options.length === 0) {
    return { ok: false, reason: `I don't have any ${slot} options saved for you yet — generate your meals from the Meals tab and I'll be able to swap them.` }
  }

  const currentName = byName(options, input.rawArgs.old_item)?.name ?? String(input.rawArgs.old_item ?? '').trim()

  // An explicitly named target still wins — that is the user picking, not the
  // app rotating, and it must never be quietly overridden.
  const requested = input.rawArgs.new_item ? byName(options, input.rawArgs.new_item) : undefined
  const chosen = requested ?? nextPoolOption(options, currentName || undefined)

  if (!chosen) {
    return {
      ok: false,
      reason: `That's the only ${slot} I've got saved for you.`,
      exhausted: { slot, poolSize: options.length },
    }
  }

  // The offer, per Ashley's ruling: only once they have actually been through
  // what they have, and only as an offer — generating costs money, so it is
  // never done on their behalf. Skipped when they named the meal themselves.
  const seen = new Set((input.alreadySeen ?? []).map(n => n.toLowerCase()))
  if (!requested && seen.has(chosen.name.toLowerCase())) {
    return {
      ok: false,
      reason: `That's all ${options.length} ${slot} option${options.length === 1 ? '' : 's'} I've got for you — you've seen the lot. Want me to go and find some new ones?`,
      exhausted: { slot, poolSize: options.length },
    }
  }

  const current = byName(options, currentName)
  const cm = current?.macros
  const nm = chosen.macros

  return {
    ok: true,
    scopeKey: `${input.profileId}:propose_meal_swap:${slot}`,
    preconditions: { slot, currentItemName: currentName },
    payload: { slot, currentName, chooseName: chosen.name },
    diff: {
      rows: [
        { field: 'Meal', before: currentName || slot, after: chosen.name },
        { field: 'Calories', before: `${Math.round(cm?.calories ?? 0)} kcal`, after: `${Math.round(nm.calories)} kcal` },
        { field: 'Protein', before: `${Math.round(cm?.protein ?? 0)}g`, after: `${Math.round(nm.protein)}g` },
      ],
      implications: [],
      rationale: typeof input.rawArgs.reason === 'string' && input.rawArgs.reason.trim() ? input.rawArgs.reason.trim() : undefined,
      reversible: true,
    },
  }
}
