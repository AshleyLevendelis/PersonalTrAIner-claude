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
import { containsPhrase } from './meal-ingredients'
import { validateMealAgainstDiet } from './diet-rules'
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
  /**
   * Every food they have said they will not eat (compileFoodDislikes — which
   * since 30 Aug 2026 is EVERY food dislike, at either hardness).
   */
  dislikedFoods?: string[]
  /** Their dietary restrictions, including allergies disclosed in chat. */
  dietaryPreferences?: string[]
}

/**
 * WHY THE SWAP RE-CHECKS SOMETHING GENERATION ALREADY CHECKED.
 *
 * The pool is built once, at generation, against the restrictions that
 * existed THEN — and it is not rebuilt when a new one is recorded. The
 * receipt says so in as many words: a dislike is "excluded starting your next
 * meal regenerate, doesn't touch today's plan".
 *
 * So the pool outlives the rules it was filtered by, and until the 30 Aug 2026
 * audit this path had no restriction check of any kind. Measured, with
 * Ashley's own case: ban almond butter, ask to swap breakfast, and the app
 * offered "Almond Butter Oats" — the exact thing she had just banned, one tap
 * from her plate.
 *
 * BOTH channels have to be re-checked, because a restriction can arrive down
 * either and they do not overlap:
 *   - a stated dislike lands in the dislike list;
 *   - an ALLERGY disclosed in chat is tagged into dietary_preferences by
 *     detectAllergenTags and never appears in the dislike list at all.
 * Checking only dislikes would have left the allergen half of this hole open,
 * which is the half that can hurt someone.
 *
 * Both matchers are the app's existing ones — containsPhrase (shared with the
 * coach's own "is X in my breakfast?" reader) and validateMealAgainstDiet
 * (shared with generation and with propose_meal_addition). A third copy of
 * either rule is precisely how this codebase produces these bugs.
 */
function optionBlockedBy(
  option: PoolOption,
  dislikedFoods: string[],
  dietaryPreferences: string[],
): string | null {
  const names = option.ingredients.map(i => i.name)
  const disliked = dislikedFoods.find(f => containsPhrase(option.name, names, f))
  if (disliked) return disliked
  if (dietaryPreferences.length > 0) {
    const verdict = validateMealAgainstDiet(option.ingredients, dietaryPreferences)
    if (!verdict.ok) {
      const first = verdict.violations[0]
      return first ? `${first.ingredient} (${first.preference})` : 'your dietary restrictions'
    }
  }
  return null
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

  const disliked = input.dislikedFoods ?? []
  const prefs = input.dietaryPreferences ?? []
  const allowed = options.filter(o => optionBlockedBy(o, disliked, prefs) === null)

  // An explicitly named target still wins — that is the user picking, not the
  // app rotating, and it must never be quietly overridden. It does NOT win
  // over a restriction, though: naming a meal is not consent to be served
  // something they have told us they cannot eat, and saying why is more use
  // than silently rotating past it.
  const requested = input.rawArgs.new_item ? byName(options, input.rawArgs.new_item) : undefined
  if (requested) {
    const clash = optionBlockedBy(requested, disliked, prefs)
    if (clash) {
      return { ok: false, reason: `${requested.name} has ${clash} in it, and you've told me to keep that out. Want me to find you something else for ${slot}?`, exhausted: { slot, poolSize: allowed.length } }
    }
  }

  // Nothing left once their own restrictions are applied. Not a dead end —
  // the same offer the exhausted-pool case makes, for the same reason.
  if (!requested && allowed.length === 0) {
    return {
      ok: false,
      reason: `Everything I've got saved for ${slot} has something in it you've asked me to avoid. Want me to go and find you some new options?`,
      exhausted: { slot, poolSize: 0 },
    }
  }

  const chosen = requested ?? nextPoolOption(allowed, currentName || undefined)

  if (!chosen) {
    return {
      ok: false,
      reason: `That's the only ${slot} I've got saved for you. Want me to go and find you some more?`,
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
      reason: `That's all ${allowed.length} ${slot} option${allowed.length === 1 ? '' : 's'} I've got for you — you've seen the lot. Want me to go and find some new ones?`,
      exhausted: { slot, poolSize: allowed.length },
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
