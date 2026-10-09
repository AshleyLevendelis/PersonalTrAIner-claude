// ---------------------------------------------------------------------------
// SWAP A MEAL, REGENERATE ONE MEAL, REGENERATE ALL — out of App.tsx.
//
// These three handlers lived inline in App.tsx, where nothing could run them:
// no harness page boots App, so the browser drivers were handed `noop` for all
// three and "Regenerate all" had never once been pressed by a check. They are
// here as plain functions over what the screen holds (the pools, today's
// picks, the working and error state) so a gate can run them against a fake
// database, and src/hooks/useMealPlanActions.ts wraps them for App and for
// the harness page alike — the useMealDays pattern.
//
// MOVED AS THEY WERE, with one handler changed (9 Oct 2026, test log M22):
//
// "REGENERATE ALL" set the screen from the meal writer's ANSWER and cleared
// every pick. The stored options are not that answer: a hearted meal, a meal
// asked for by name and every meal she edited herself survive a regenerate
// (survivesRegeneration, meal-generation.ts) and are re-appended on the way
// in. So a kept, edited lunch was still in the database and gone from the
// screen until the next reload — and after the reload it was one of the swap
// options, no longer today's lunch, because its pick had been deleted too.
// Ashley's ruling of 3 Sep 2026 is that regeneration "replaces the app's OWN
// suggestions; a meal she asked for by name survives". Now, like the
// single-meal handler already did:
//   - the screen is READ BACK from storage after the run;
//   - a pick is cleared only when the dish it names is no longer among that
//     meal's stored options. A pick whose dish survived stays hers.
//
// NOT CHANGED, because they are owner decisions still open: there is no
// confirm step, and a meal already LOGGED today is regenerated like any other
// (its record is untouched; the plan beneath it changes).
// ---------------------------------------------------------------------------

import { generateMealPools, type PoolOption } from './meal-generation'
import { readPools, swapPoolMeal, setMealPick, clearMealPick, type MealSlotName } from './meal-store'
import { sweepStaleForTarget } from './pending-actions-store'
import { couldNot } from './coach-voice'

type Pools = Partial<Record<MealSlotName, PoolOption[]>>
type Picks = Partial<Record<MealSlotName, string>>
/** A React-style setter: a value, or a function of the previous one. */
type Setter<T> = (next: T | ((prev: T) => T)) => void

/** Everything generateMealPools is told about the person, minus which meals to build. */
export type MealGenerationInputs = Omit<Parameters<typeof generateMealPools>[0], 'onlySlots'>

export interface MealPlanActionContext {
  profileId: string
  /** The date today's picks are saved under. */
  today: string
  /** The options the screen holds now — what "I've kept what you had" is judged against. */
  pools: Pools
  /** Today's picks as the screen holds them. */
  picks: Picks
  /** The dish each meal is showing today — a swap is told what it is swapping from. */
  showingName: (slot: MealSlotName) => string | undefined
  /** Null when there are no targets to build meals for; the regenerate handlers then do nothing. */
  generation: MealGenerationInputs | null
  slotLabel: Record<MealSlotName, string>
  setPools: Setter<Pools>
  setPicks: Setter<Picks>
  setGenerating: (busy: boolean) => void
  setError: (message: string | null) => void
  setUnrecognised: (restrictions: string[] | null) => void
  /** The meal writer. The app's own unless a gate hands in a stand-in for the model call. */
  generate?: typeof generateMealPools
}

/**
 * The options as storage holds them now, or null when they could not be read.
 *
 * NOT `getPools(...).catch(() => null)`, which is what the single-meal handler
 * had and what this file first copied: getPools answers a FAILED read with an
 * empty set and never throws, so that catch could not fire and a dropped
 * connection after a regenerate would have set the screen to no meals at all.
 * Found 9 Oct 2026 by test:meal-regenerate's own failed-read case. readPools
 * says whether the read worked.
 */
async function readBack(profileId: string): Promise<Pools | null> {
  try {
    const read = await readPools(profileId)
    return read.failed ? null : read.pools
  } catch {
    return null
  }
}

/**
 * Picking a specific alternative records the choice as today's pick — the pool
 * itself doesn't change, only which option is "today's".
 */
export async function swapMealSlot(ctx: MealPlanActionContext, slot: MealSlotName, chooseName: string): Promise<void> {
  const applied = await swapPoolMeal(ctx.profileId, slot, ctx.showingName(slot), chooseName)
  if (!applied) return
  // Persist BEFORE updating the on-screen pick (UX-sweep fix) — this used
  // to update React state first, so a confirmed swap could look applied
  // on screen even when the write below never landed.
  try {
    await setMealPick(ctx.profileId, ctx.today, slot, applied.name)
  } catch (err) {
    console.error('swapMealSlot: setMealPick failed — not applying the swap on screen', err)
    return
  }
  ctx.setPicks(prev => ({ ...prev, [slot]: applied.name }))
  // §2.3 — same sweep as the exercise swap path, same scope_key prefix propose_meal_swap uses.
  await sweepStaleForTarget(ctx.profileId, `${ctx.profileId}:propose_meal_swap:${slot}`)
}

export async function regenerateMealSlot(ctx: MealPlanActionContext, slot: MealSlotName): Promise<void> {
  if (!ctx.generation) return
  const label = ctx.slotLabel[slot]
  ctx.setGenerating(true)
  ctx.setError(null)
  const hadExistingOptions = (ctx.pools[slot]?.length ?? 0) > 0
  try {
    const result = await (ctx.generate ?? generateMealPools)({ ...ctx.generation, onlySlots: [slot] })
    // Surfacing round — a dietary_preferences value the app can't enforce
    // fails every proposal identically, so this is checked before anything
    // else and short-circuits: there's nothing a per-slot message or a
    // retry can add once the actual cause is known.
    if (result.unrecognisedPreferences.length > 0) {
      ctx.setUnrecognised(result.unrecognisedPreferences)
      return
    }
    ctx.setUnrecognised(null)
    // A total failure comes back as an empty array for the slot — persistPools
    // already leaves that slot's DB rows untouched in that case, so mirror
    // that here: don't overwrite the on-screen pool or clear the manual pick
    // with nothing. Only apply/clear when generation actually produced
    // options for this slot.
    if ((result.accepted[slot]?.length ?? 0) === 0) {
      // Don't claim options were "kept" when this slot never had any —
      // that reads as a lie the first time generation fails on a fresh
      // plan, when the pool was already empty going in. generatorReached
      // distinguishes "the call worked, nothing fit" (deterministic — name
      // what'd help) from "the call itself failed" (transient — try again
      // is the honest advice there).
      ctx.setError(
        result.generatorReached
          ? (hadExistingOptions
              ? `${couldNot(`fit a new ${label} option`)} I've kept your existing one — try loosening a restriction or widening your calorie range.`
              : `${label} doesn't fit your current targets. Try loosening a restriction, widening your calorie range, or turning off this slot.`)
          : (hadExistingOptions
              ? `${couldNot(`refresh ${label}`)} I've kept your existing options.`
              : `${couldNot(`generate ${label}`)} Try again in a moment.`)
      )
      return
    }
    // READ BACK, not the generator's answer: what was stored also holds the
    // meals that survive a regenerate (hearted, or asked for by name), and
    // drops a fresh one sharing a kept one's name. Showing `accepted` left
    // kept meals off the screen until the next reload. If the read fails,
    // the generator's answer is still better than nothing.
    const stored = await readBack(ctx.profileId)
    ctx.setPools(prev => stored ?? ({ ...prev, ...result.accepted }))
    ctx.setPicks(prev => { const next = { ...prev }; delete next[slot]; return next })
    await clearMealPick(ctx.profileId, ctx.today, slot)
  } catch {
    ctx.setError(
      hadExistingOptions
        ? `${couldNot(`refresh ${label}`)} I've kept your existing options.`
        : `${couldNot(`generate ${label}`)} Try again in a moment.`
    )
  } finally {
    ctx.setGenerating(false)
  }
}

export async function regenerateAllMeals(ctx: MealPlanActionContext): Promise<void> {
  if (!ctx.generation) return
  ctx.setGenerating(true)
  ctx.setError(null)
  const priorPools = ctx.pools
  try {
    const result = await (ctx.generate ?? generateMealPools)(ctx.generation)
    // Surfacing round — checked first and short-circuits, same reasoning
    // as the single-slot handler above: an unrecognised restriction fails
    // every slot identically, so there's nothing the failure-count logic
    // below needs to run for.
    if (result.unrecognisedPreferences.length > 0) {
      ctx.setUnrecognised(result.unrecognisedPreferences)
      return
    }
    ctx.setUnrecognised(null)

    const requestedSlots = Object.keys(result.accepted) as MealSlotName[]
    const failedSlots = requestedSlots.filter(s => (result.accepted[s]?.length ?? 0) === 0)

    if (failedSlots.length === requestedSlots.length && requestedSlots.length > 0) {
      // Total failure — every requested slot came back empty. Leave the
      // existing plan and manual picks untouched entirely (persistPools
      // already left the DB untouched too) rather than replacing a real
      // plan with the cold-start empty state. generatorReached splits
      // "the call worked, nothing fit your targets" (deterministic — name
      // what'd help) from "the call itself failed" (transient — retrying
      // is genuinely the right advice there).
      ctx.setError(
        result.generatorReached
          ? "Nothing fits your current targets right now. Try loosening a dietary restriction, widening your calorie range, or turning off a meal slot — then regenerate."
          : `${couldNot('reach the meal generator')} Your existing plan is unchanged — try again in a moment.`
      )
      return
    }

    const regeneratedSlots = (Object.entries(result.accepted) as [MealSlotName, PoolOption[]][])
      .filter(([, options]) => options.length > 0)
      .map(([slot]) => slot)

    // THE SCREEN IS READ BACK FROM STORAGE, not set from the writer's answer
    // (see the header). If the read fails, the writer's answer for the meals
    // it filled is still better than nothing — and a meal that came back
    // empty keeps what it had either way, matching persistPools' own
    // skip-on-empty at the database.
    const stored = await readBack(ctx.profileId)
    const fromAnswer = (prev: Pools): Pools => {
      const next = { ...prev }
      for (const slot of regeneratedSlots) next[slot] = result.accepted[slot]!
      return next
    }
    ctx.setPools(prev => stored ?? fromAnswer(prev))

    // A PICK IS CLEARED ONLY WHEN ITS DISH IS GONE. For a meal that was
    // regenerated: if the dish she picked is still among that meal's options
    // it survived on purpose — hers, hearted or edited — and it stays today's
    // meal. A meal whose regeneration FAILED keeps its options and its pick
    // (the 17 Sep fix), as before.
    const nowHeld = stored ?? fromAnswer(priorPools)
    const lostPicks = regeneratedSlots.filter(slot => {
      const picked = ctx.picks[slot]
      return picked != null && !(nowHeld[slot] ?? []).some(o => o.name === picked)
    })
    ctx.setPicks(prev => {
      const next = { ...prev }
      for (const slot of lostPicks) delete next[slot]
      return next
    })
    for (const slot of lostPicks) await clearMealPick(ctx.profileId, ctx.today, slot)

    if (failedSlots.length > 0) {
      // Split by whether each failed slot actually had prior options to
      // "keep" — a fresh plan whose lunch pool has always been empty gets
      // an honest "couldn't generate" message, not a false "kept" claim.
      // Reaching this branch at all means at least one other slot DID
      // fill, which is positive proof the generator was reached this run
      // — so a failed slot here is provably the "nothing fit" case, not
      // "the call failed" (that's the total-failure branch above).
      const keptSlots = failedSlots.filter(s => (priorPools[s]?.length ?? 0) > 0)
      const neverFilledSlots = failedSlots.filter(s => (priorPools[s]?.length ?? 0) === 0)
      const parts: string[] = []
      if (keptSlots.length > 0) parts.push(`${couldNot(`fit new options for ${keptSlots.map(s => ctx.slotLabel[s]).join(', ')}`)} I've kept what you had.`)
      if (neverFilledSlots.length > 0) parts.push(`${neverFilledSlots.map(s => ctx.slotLabel[s]).join(', ')} don't fit your current targets. Try loosening a restriction, widening your calorie range, or turning off a slot.`)
      ctx.setError(parts.join(' '))
    }
  } catch {
    ctx.setError(`${couldNot('reach the meal generator')} Your existing plan is unchanged — try again in a moment.`)
  } finally {
    ctx.setGenerating(false)
  }
}
