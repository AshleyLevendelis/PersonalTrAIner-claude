// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §2.2/§2.5 — executes a CLAIMED pending_actions row
// against the real edit layers. Mirrors, rather than reuses, App.tsx's
// handleSwapExercise/handleBanExercise persistence branches: those are
// closures over App.tsx's setMesocycle state setter, which this module
// (called from ChatAssistant, a sibling of App.tsx) has no access to — the
// caller supplies the current mesocycle and receives the updated one back,
// same shape as swapExerciseInMesocycle's own pure contract.
//
// Every function here is called ONLY after claimPendingAction has already
// won the confirm-exactly-once race (§2.5) — this module does not itself
// guard against double-execution, that's the claim's job.
// ---------------------------------------------------------------------------

import { didNotSave } from './coach-voice'
import { adjustDayVolume, describeVolumeChange, isVolumeAdjustable, type VolumeDirection } from './volume-adjust'
import { rebuildFromCurrentWeek } from './plan-invalidation'
import { updateProfileField } from './profile-store'
import type { MesocycleWeek, UserProfile, EquipmentAccess, TrainingStyle, ConcurrentActivity } from './types'
import { describeActivity, activityCountsAsLoad } from './concurrent-activity'
import { swapExerciseInMesocycle, type SwapScope } from './mesocycle-edit'
import { removeExerciseFromSession, moveExerciseInSession, addExerciseToSession, peerProgrammingFor } from './session-edit'
import { settleWeek } from './settle-week'
import { shortenDayTo } from './exercise-plan'
import { saveMesocycle, saveMesocycleWeek, saveScopedEdit, weeksTouchedByScope } from './mesocycle-persistence'
import { getExerciseEntry } from './exercise-db'
import { swapPoolMeal, clearMealPick, getMealPicksForDate, USER_REQUESTED_TAG, type MealSlotName } from './meal-store'
import { supabase } from './supabase'
import { setSessionMove, setDeliberateRest, setMarkedMissed, setSwappedForActivity } from './daily-tracking'
import { saveCardioLog } from './cardio-log-store'
import { alsoDoingIsLoggable, type AlsoDoing } from './session-move'
import type { MealAdditionPayload } from './meal-addition'
import type { MealMovePayload } from './meal-move'
import { STYLE_OPTIONS } from './onboarding-slots'
import { substituteForInjury, substituteForEquipment, rebuildForInjury } from './plan-adaptations'
import type { PendingActionReceipt } from './pending-actions-store'

export interface ExerciseSwapPayload {
  weekNumber: number
  dayName: string
  exIndex: number
  oldExerciseName: string
  newExerciseName: string
  /** Card copy always says "today" / "rest of block" — never "permanent" (LAYOUT-DESIGN.md D3) — but the value passed to swapExerciseInMesocycle is the real SwapScope string literal. */
  scope: SwapScope
}

export interface ExerciseSwapResult {
  mesocycle: MesocycleWeek[]
  preImage: MesocycleWeek[]
  receipt: PendingActionReceipt
}

/**
 * Mirrors App.tsx's handleSwapExercise exactly: 'today' persists one week
 * via saveMesocycleWeek, any other scope persists every touched week in the
 * current block via Promise.all. preImage is captured BEFORE the swap runs
 * — swapExerciseInMesocycle is pure (returns a new array, never mutates its
 * input), so the caller's own `mesocycle` reference IS the pre-image; no
 * structuredClone needed.
 */
export async function executeExerciseSwap(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  payload: ExerciseSwapPayload,
): Promise<ExerciseSwapResult> {
  const preImage = mesocycle
  const newExercise = getExerciseEntry(payload.newExerciseName)
  if (!newExercise) {
    return {
      mesocycle,
      preImage,
      receipt: { landed: [], failed: [{ op: 'propose_exercise_swap', error: `"${payload.newExerciseName}" is no longer a recognized exercise` }] },
    }
  }

  const updatedMesocycle = await swapExerciseInMesocycle({
    mesocycle,
    profile,
    currentWeekNumber: payload.weekNumber,
    dayName: payload.dayName,
    exIndex: payload.exIndex,
    newExercise,
    scope: payload.scope,
  })

  if (!profile.id) {
    return { mesocycle: updatedMesocycle, preImage, receipt: { landed: [], failed: [{ op: 'save', error: 'No profile to save against' }] } }
  }

  try {
    // ONE SAVER. This inlined the scope branch that saveScopedEdit exists to
    // own — a byte-for-byte copy of it, under a comment promising it "mirrors
    // handleSwapExercise exactly", which is a promise nothing checked. The
    // other three executors in this file already call the shared one. No
    // behaviour changes here; what goes is the second copy that could drift.
    await saveScopedEdit(profile.id, updatedMesocycle, payload.weekNumber, payload.scope)
  } catch (err) {
    console.error('executeExerciseSwap: persisting swap failed', err)
    return {
      mesocycle: updatedMesocycle,
      preImage,
      receipt: { landed: [], failed: [{ op: 'save', error: didNotSave('The swap') }] },
    }
  }

  return {
    mesocycle: updatedMesocycle,
    preImage,
    receipt: { landed: [`${payload.oldExerciseName} → ${payload.newExerciseName}`], failed: [] },
  }
}

export interface ExerciseRemovePayload {
  weekNumber: number
  dayName: string
  exIndex: number
  exerciseName: string
  scope: SwapScope
}

export interface ExerciseAddPayload {
  weekNumber: number
  dayName: string
  exerciseName: string
  scope: SwapScope
}

/**
 * A ban is the widest edit in the app: every week of every block, and a slot
 * can vanish entirely where no substitute exists. There is no weekNumber and no
 * scope, deliberately — those would imply it could be narrower, and it cannot.
 */
export interface ExerciseBanPayload {
  exerciseName: string
  /** Sessions the ban will touch, counted when the card was built — for the receipt. */
  sessionsAffected: number
}

export interface ExerciseReorderPayload {
  weekNumber: number
  dayName: string
  fromIndex: number
  toIndex: number
  exerciseName: string
  /** What it ends up next to, for the receipt — resolved by the caller. */
  neighbourName?: string
  /**
   * Which side of the neighbour they ASKED for. Not derivable from the
   * indexes: moving an exercise DOWN the list to sit before something has
   * toIndex > fromIndex, so reading the direction off the arithmetic told a
   * person who said "before the bench press" that it now sits after it.
   */
  placement?: 'before' | 'after'
  scope: SwapScope
}

export interface SessionEditExecResult {
  mesocycle: MesocycleWeek[]
  preImage: MesocycleWeek[]
  receipt: PendingActionReceipt
}

/**
 * Take one exercise out of a session. The pure decision is session-edit's; this
 * shell persists it and writes the receipt. Its refusals (a session that would
 * fall below the floor, a slot that has rotated away) come back as a FAILED
 * receipt rather than a thrown error, so the card says why.
 */
export async function executeExerciseRemove(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  payload: ExerciseRemovePayload,
): Promise<SessionEditExecResult> {
  const preImage = mesocycle
  const result = removeExerciseFromSession({
    mesocycle, profile,
    weekNumber: payload.weekNumber, dayName: payload.dayName,
    exIndex: payload.exIndex, scope: payload.scope,
  })
  if (!result.changed) {
    return { mesocycle, preImage, receipt: { landed: [], failed: [{ op: 'propose_exercise_remove', error: result.refusal ?? "That couldn't be removed" }] } }
  }
  if (!profile.id) {
    return { mesocycle: result.mesocycle, preImage, receipt: { landed: [], failed: [{ op: 'save', error: 'No profile to save against' }] } }
  }
  try {
    await saveScopedEdit(profile.id, result.mesocycle, payload.weekNumber, payload.scope)
  } catch (err) {
    console.error('executeExerciseRemove: persisting failed', err)
    return { mesocycle: result.mesocycle, preImage, receipt: { landed: [], failed: [{ op: 'save', error: didNotSave('That') }] } }
  }
  return {
    mesocycle: result.mesocycle, preImage,
    receipt: { landed: [`${payload.dayName}: ${payload.exerciseName} removed`], failed: [] },
  }
}

/**
 * Put one exercise INTO a session. The pure decision is session-edit's; this
 * shell resolves the movement, prices it and persists.
 *
 * THE RESOLUTION IS THE SAFETY STEP AND IT HAPPENS HERE, NOT IN THE MODEL.
 * The coach sends a NAME in the user's words; `getConstrainedPool` is what
 * decides whether that name is something this person can be prescribed, with
 * their equipment and their injuries. A movement that is not in the pool is
 * refused — so a hallucinated exercise, or a real one this profile is
 * filtered out of, fails closed instead of entering the plan.
 *
 * Pricing happens here rather than in the card for the reason recorded on the
 * swap path: the builder is synchronous, and previewing a number that confirm
 * supersedes anyway would duplicate real logic to be approximately wrong.
 */
export async function executeExerciseAdd(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  payload: ExerciseAddPayload,
  /** The bans, passed in rather than read off the profile — the same way the
   *  injury and equipment executors take theirs, because the live list is the
   *  one the chat surface holds, not a stale copy on the profile row. */
  exclusions: string[] = [],
): Promise<SessionEditExecResult> {
  const preImage = mesocycle
  const fail = (error: string): SessionEditExecResult =>
    ({ mesocycle, preImage, receipt: { landed: [], failed: [{ op: 'propose_exercise_add', error }] } })

  const { mapTier } = await import('./exercise-plan')
  const { resolveAdditionRequest } = await import('./exercise-add-candidates')
  // RE-RESOLVED AT CONFIRM, not trusted from the payload. The card may have
  // been sitting for a while, and equipment or injuries can have changed under
  // it — the same reason every other confirm re-runs its edit rather than
  // replaying a stored diff.
  const entry = resolveAdditionRequest(payload.exerciseName, profile, exclusions)
  if (!entry) return fail(`I can't add ${payload.exerciseName} — it isn't something I can prescribe with your equipment and injuries.`)

  const day = mesocycle
    .find(w => w.week_number === payload.weekNumber)?.days
    .find(d => d.day === payload.dayName)
  if (!day) return fail("I couldn't find that day on your plan.")

  const programming = peerProgrammingFor(day.exercises, mapTier(entry.mechanics_tier))
  if (!programming) return fail(`${payload.dayName} is a rest day. Make it a training day first, then add to it.`)

  const { recomputeLoad } = await import('./mesocycle-edit')
  const load = await recomputeLoad(entry, profile, programming.intensity, programming.sets, programming.reps, true)

  const result = addExerciseToSession({
    mesocycle, profile,
    weekNumber: payload.weekNumber, dayName: payload.dayName,
    entry, load, scope: payload.scope,
  })
  if (!result.changed) return fail(result.refusal ?? "That couldn't be added")
  if (!profile.id) {
    return { mesocycle: result.mesocycle, preImage, receipt: { landed: [], failed: [{ op: 'save', error: 'No profile to save against' }] } }
  }
  try {
    await saveScopedEdit(profile.id, result.mesocycle, payload.weekNumber, payload.scope)
  } catch (err) {
    console.error('executeExerciseAdd: persisting failed', err)
    return { mesocycle: result.mesocycle, preImage, receipt: { landed: [], failed: [{ op: 'save', error: didNotSave('That') }] } }
  }
  return {
    mesocycle: result.mesocycle, preImage,
    receipt: { landed: [`${payload.dayName}: ${entry.name} added`], failed: [] },
  }
}

/**
 * BAN ONE EXERCISE, EVERYWHERE — the coach's half of the button on the exercise
 * row, wired 14 Sep 2026 on Ashley's instruction.
 *
 * It was the LAST thing a screen could do that chat could not, and it was left
 * out on purpose: `ban_exercise` was declared to the model, then declined by
 * the handler with "use the ban button on the exercise itself". That decline
 * was itself a safety fix — before it, whatever the model sent was echoed back
 * as if it had happened.
 *
 * THE SAME TWO WRITES THE SCREEN MAKES, in the same order, because a ban that
 * rewrote the plan without recording the preference would come back at the next
 * regeneration:
 *   1. a user_facts row (an independent INSERT, so two bans cannot clobber each
 *      other the way a shared array column did), then
 *   2. the rebuilt mesocycle, every week, saved whole.
 * If the fact lands and the plan save fails, the ban is still real and the
 * receipt says exactly that rather than the generic "didn't save" — the same
 * distinction App.tsx draws, for the same reason: otherwise someone re-taps a
 * thing that already worked.
 */
export async function executeExerciseBan(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  payload: ExerciseBanPayload,
  /** The live ban list, passed in rather than read off the profile — as the add,
   *  injury and equipment executors all take theirs. */
  exclusions: string[] = [],
  /** Preserved so a ban does not rewind live-week detection to week 1. */
  planCreatedAt?: string,
): Promise<SessionEditExecResult> {
  const preImage = mesocycle
  const fail = (error: string): SessionEditExecResult =>
    ({ mesocycle, preImage, receipt: { landed: [], failed: [{ op: 'propose_exercise_ban', error }] } })

  const name = payload.exerciseName
  if (!profile.id) return fail('No profile to save against')
  if (exclusions.some(e => e.toLowerCase() === name.toLowerCase())) {
    return fail(`${name} is already on your never-again list.`)
  }
  if (mesocycle.length === 0) return fail("Your plan hasn't loaded yet — give it a moment and ask me again.")

  const { createFact } = await import('./memory-store')
  try {
    await createFact({
      profileId: profile.id,
      kind: 'exercise_preference',
      source: 'chat',
      rawPhrase: name,
      displayText: `won't eat/do ${name}`,
      polarity: 'dislike',
      hardness: 'hard',
      resolvedRefs: [name],
    })
  } catch (err) {
    console.error('executeExerciseBan: recording the ban failed', err)
    return fail(`Couldn't save that — ${name} hasn't been removed. Check your connection and try again.`)
  }

  const updated = [...new Set([...exclusions, name])]
  const { banExerciseFromMesocycle } = await import('./mesocycle-edit')
  const next = await banExerciseFromMesocycle({ mesocycle, profile, bannedName: name, exclusions: updated })

  try {
    await saveMesocycle(profile.id, next, planCreatedAt ?? profile.created_at)
  } catch (err) {
    console.error('executeExerciseBan: persisting failed', err)
    // THE FACT LANDED, so the ban is real and survives — only this plan's
    // rewrite failed. Say that, not "didn't save".
    return {
      mesocycle: next, preImage,
      receipt: { landed: [`${name} won't be picked again`], failed: [{ op: 'save', error: `${name} won't be picked again, but this plan couldn't be updated — reopen the app to retry.` }] },
    }
  }
  return {
    mesocycle: next, preImage,
    receipt: { landed: [`${name} removed from ${payload.sessionsAffected} session${payload.sessionsAffected === 1 ? '' : 's'}, and never picked again`], failed: [] },
  }
}

/** Move one exercise earlier or later in its session. Superset partners travel together. */
export async function executeExerciseReorder(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  payload: ExerciseReorderPayload,
): Promise<SessionEditExecResult> {
  const preImage = mesocycle
  const result = moveExerciseInSession({
    mesocycle, profile,
    weekNumber: payload.weekNumber, dayName: payload.dayName,
    fromIndex: payload.fromIndex, toIndex: payload.toIndex, scope: payload.scope,
  })
  if (!result.changed) {
    return { mesocycle, preImage, receipt: { landed: [], failed: [{ op: 'propose_exercise_reorder', error: result.refusal ?? "That couldn't be moved" }] } }
  }
  if (!profile.id) {
    return { mesocycle: result.mesocycle, preImage, receipt: { landed: [], failed: [{ op: 'save', error: 'No profile to save against' }] } }
  }
  try {
    await saveScopedEdit(profile.id, result.mesocycle, payload.weekNumber, payload.scope)
  } catch (err) {
    console.error('executeExerciseReorder: persisting failed', err)
    return { mesocycle: result.mesocycle, preImage, receipt: { landed: [], failed: [{ op: 'save', error: didNotSave('That') }] } }
  }
  const where = payload.neighbourName ? ` — now ${payload.placement ?? 'next to'} ${payload.neighbourName}` : ''
  return {
    mesocycle: result.mesocycle, preImage,
    receipt: { landed: [`${payload.dayName}: ${payload.exerciseName} moved${where}`], failed: [] },
  }
}

/**
 * Undo for both, and for the same reason the swap's undo is shaped this way:
 * restore the pre-image through the SAME persistence branch the forward write
 * used, or a 'permanent' edit leaves the block's later weeks holding the new
 * shape while week one goes back.
 */
export async function undoSessionEdit(
  profileId: string,
  preImage: MesocycleWeek[],
  weekNumber: number,
  scope: SwapScope,
  mesocycleCreatedAt: string,
): Promise<void> {
  if (scope === 'today') {
    const week = preImage.find(w => w.week_number === weekNumber)
    if (week) await saveMesocycleWeek(profileId, week)
  } else {
    await saveMesocycle(profileId, preImage, mesocycleCreatedAt)
  }
}

/** Restores a swap's pre-image exactly, replicating the same persistence branch the forward write used. */
export async function undoExerciseSwap(
  profileId: string,
  preImage: MesocycleWeek[],
  weekNumber: number,
  scope: SwapScope,
  mesocycleCreatedAt: string,
): Promise<void> {
  if (scope === 'today') {
    const week = preImage.find(w => w.week_number === weekNumber)
    if (week) await saveMesocycleWeek(profileId, week)
  } else {
    await saveMesocycle(profileId, preImage, mesocycleCreatedAt)
  }
}

/**
 * Restores a whole run of weeks from a pre-image — the undo behind
 * propose_volume_change and propose_schedule_change.
 *
 * Both write several weeks at once, so the swap's two-shape undo (one week
 * for 'today', the whole plan for 'permanent') doesn't fit. Deliberately
 * writes ONLY weeks at or beyond fromWeek: the pre-image holds the earlier
 * weeks too, and re-saving those would overwrite logged history with a copy
 * of itself for no reason — a write that can only do harm if anything moved.
 */
export async function undoWeekRangeChange(
  profileId: string,
  preImage: MesocycleWeek[],
  fromWeek: number,
): Promise<void> {
  for (const week of preImage) {
    if (week.week_number < fromWeek) continue
    await saveMesocycleWeek(profileId, week)
  }
}

export interface MealSwapPayload {
  slot: MealSlotName
  currentName?: string
  chooseName?: string
}

export interface MealSwapResult {
  appliedName: string | null
  appliedMacros: { calories: number; protein: number; carbs: number; fat: number } | null
  receipt: PendingActionReceipt
}

/** swapPoolMeal is already the pure "choose an option" function (fix 5) — this just adds the honest failure surfacing a proposal's terminal state requires. */
export async function executeMealSwap(profileId: string, payload: MealSwapPayload): Promise<MealSwapResult> {
  const applied = await swapPoolMeal(profileId, payload.slot, payload.currentName, payload.chooseName)
  if (!applied) {
    return {
      appliedName: null,
      appliedMacros: null,
      receipt: { landed: [], failed: [{ op: 'propose_meal_swap', error: 'No other option is available in this slot' }] },
    }
  }
  return {
    appliedName: applied.name,
    appliedMacros: applied.macros,
    receipt: { landed: [`${payload.slot}: → ${applied.name}`], failed: [] },
  }
}

/**
 * Adds a VERIFIED meal option to a slot's pool.
 *
 * The payload carries the option verifyProposal already accepted (see
 * meal-addition.ts) — nothing is re-derived here and the model's own ingredient
 * quantities never reach the database. What was shown on the card is what gets
 * written.
 *
 * Deliberately NOT persistPools: that function deletes the slot's existing pool
 * before inserting, which is right for a regenerate and catastrophic for an
 * add — asking for one curry would silently delete the other four dinners.
 *
 * This owns the POOL write only. Making the meal that day's pick is the
 * caller's job, through the same onMealSwapApplied path a confirmed swap uses
 * — the one already proven to make a pick actually render. Two writers of the
 * same pick is how the swap receipt started claiming things the Nutrition tab
 * never showed. `poolIndex` comes back so the caller can undo this half if the
 * pick doesn't land.
 */
export async function executeMealAddition(
  profileId: string,
  payload: MealAdditionPayload,
): Promise<{ receipt: PendingActionReceipt; poolIndex: number | null }> {
  const { slot, option } = payload

  const { data: existing, error: readError } = await supabase
    .from('meal_plan_slots')
    .select('pool_index')
    .eq('profile_id', profileId)
    .eq('slot', slot)
    .order('pool_index', { ascending: false })
    .limit(1)

  if (readError) {
    return { receipt: { landed: [], failed: [{ op: 'propose_meal_addition', error: "Couldn't read your current meal options" }] }, poolIndex: null }
  }

  const nextIndex = (existing?.[0]?.pool_index ?? -1) + 1

  const { error: insertError } = await supabase.from('meal_plan_slots').insert({
    profile_id: profileId,
    slot,
    pool_index: nextIndex,
    name: option.name,
    ingredients: option.ingredients,
    macros: { kcal: option.macros.calories, protein: option.macros.protein, carbs: option.macros.carbs, fat: option.macros.fat },
    // Tagged as the user's own request so a later regeneration keeps it —
    // see USER_REQUESTED_TAG and Ashley's ruling in meal-store.ts.
    tags: [...(option.tags ?? []), USER_REQUESTED_TAG],
  })
  if (insertError) {
    return { receipt: { landed: [], failed: [{ op: 'propose_meal_addition', error: "Couldn't save the meal to your plan" }] }, poolIndex: null }
  }

  return { receipt: { landed: [`${slot}: + ${option.name}`], failed: [] }, poolIndex: nextIndex }
}

/**
 * A VERIFIED MEAL BECOMES THE SLOT'S MEAL — pool write, then pick, and the
 * pool write rolled back if the pick doesn't land.
 *
 * Lifted out of ChatAssistant so the Nutrition screen can run the identical
 * sequence rather than growing a second copy of it. The same reason
 * verifyProposal has one caller in meal-food-edit: an edit made by tapping a
 * row and the same edit made by asking the coach have to leave the plan in
 * the same state, and two implementations of "and then it becomes the meal"
 * is exactly how they stop doing that.
 *
 * `pick` is the caller's half, because who owns the on-screen state differs:
 * the chat routes today through the same callback a confirmed swap uses, the
 * screen through its own. It returns false if the pick failed.
 */
export async function applyMealOptionToSlot(
  profileId: string,
  payload: MealAdditionPayload,
  pick: (payload: MealAdditionPayload) => Promise<boolean>,
): Promise<{ receipt: PendingActionReceipt; poolIndex: number | null }> {
  const result = await executeMealAddition(profileId, payload)
  if (result.receipt.failed.length > 0) return result

  const picked = await pick(payload)
  if (picked) return result

  // Roll the pool write back rather than leaving a meal in the plan that the
  // receipt is about to say couldn't be added. The exact pool_index came back
  // from the insert, so this removes the row it wrote and never a same-named
  // meal that was already there.
  await undoMealAddition(profileId, payload, result.poolIndex)
  return { receipt: { landed: [], failed: [{ op: 'save', error: didNotSave('The meal') }] }, poolIndex: null }
}

/**
 * Removes an added option from the pool and clears the pick it set — both
 * halves. This is the undo, and also the rollback when the pool write lands
 * but the pick doesn't: a meal left in the pool after a receipt said
 * "Couldn't add it" is the same kind of quiet disagreement between what the
 * app claims and what it stored that this framework exists to prevent.
 *
 * ONE ROW, NOT EVERY ROW WITH THAT NAME. Until 5 Sep 2026 this deleted on
 * (profile, slot, name), and nothing makes a name unique within a slot: ask
 * the coach for a chicken curry when the generator had already put a chicken
 * curry in your dinners, tap Undo, and BOTH disappear — the one you added and
 * the one that was always there. `pool_index` is the actual identity of a pool
 * entry, so undo uses it: the exact index when the caller still has it (the
 * rollback path, which just received it from executeMealAddition), and
 * otherwise the highest-indexed row of that name, which is the one an append
 * created.
 *
 * Returns false if the pool row is still there afterwards, so the caller can
 * leave the Undo button up rather than clearing it over a delete that didn't
 * happen — the same choice the meal-swap undo above it makes.
 */
export async function undoMealAddition(
  profileId: string,
  payload: MealAdditionPayload,
  poolIndex?: number | null,
): Promise<boolean> {
  const { slot, date, option } = payload

  let targetIndex = poolIndex ?? null
  if (targetIndex === null) {
    const { data, error } = await supabase
      .from('meal_plan_slots')
      .select('pool_index')
      .eq('profile_id', profileId)
      .eq('slot', slot)
      .eq('name', option.name)
      .order('pool_index', { ascending: false })
      .limit(1)
    if (error) return false
    // Already gone (a second Undo tap, or the pool was regenerated under it).
    // Nothing to remove is not a failure — fall through and clear the pick.
    targetIndex = data?.[0]?.pool_index ?? null
  }

  if (targetIndex !== null) {
    const { error } = await supabase
      .from('meal_plan_slots')
      .delete()
      .eq('profile_id', profileId)
      .eq('slot', slot)
      .eq('pool_index', targetIndex)
      // Belt as well as braces: an index that no longer holds the meal we
      // added is somebody else's row, and deleting it would be the same
      // mistake in a different column.
      .eq('name', option.name)
    if (error) return false
  }

  const picks = await getMealPicksForDate(profileId, date)
  if (picks[slot] === option.name) await clearMealPick(profileId, date, slot)
  return true
}

/**
 * TWO MEALS TRADE PLACES — Ashley's ruling, 14 Sep 2026, on what happens to
 * the slot a moved meal leaves: "they swap places".
 *
 * BOTH LEGS OR NEITHER. A swap that lands one half is a day with the same
 * meal in two slots and the other meal gone — strictly worse than not moving
 * at all, and invisible until she looks at her own plan. So each leg goes
 * through `applyMealOptionToSlot` (pool write, then pick, with the pool write
 * rolled back if the pick fails), and if the SECOND leg fails, the first is
 * undone too.
 *
 * No new writer. The same two functions the swap, the addition and the food
 * edits already use — for the same reason those share them: an edit made by
 * tapping a row and the same edit made by asking the coach have to leave the
 * plan in the same state.
 */
export async function executeMealMove(
  profileId: string,
  payload: MealMovePayload,
  pick: (payload: MealAdditionPayload) => Promise<boolean>,
): Promise<PendingActionReceipt> {
  const landed: string[] = []
  const done: { payload: MealAdditionPayload; poolIndex: number | null }[] = []

  for (const leg of payload.legs) {
    const result = await applyMealOptionToSlot(profileId, leg.payload, pick)
    if (result.receipt.failed.length > 0) {
      // Undo whatever already landed, so the plan is exactly as it was.
      for (const prior of done) await undoMealAddition(profileId, prior.payload, prior.poolIndex)
      return {
        landed: [],
        failed: [{
          op: 'propose_meal_move',
          error: done.length > 0
            ? "The swap didn't save, so nothing moved — your meals are as they were"
            : didNotSave('The move'),
        }],
      }
    }
    done.push({ payload: leg.payload, poolIndex: result.poolIndex })
    landed.push(`${leg.slot}: ${leg.originalName} (${leg.afterKcal} kcal)`)
  }

  return { landed, failed: [] }
}

export interface InjuryAdaptationPayload {
  injuryCode: string
  durationDays: number
  weekNumbers: number[]
  exclusions: string[]
  reason?: string
  /** See InjuryAdaptationMode. A time-bounded rebuild is exactly as temporary as the adaptation: pre_image restores the original weeks when it expires. */
  mode?: InjuryAdaptationMode
}

export interface EquipmentAdaptationPayload {
  equipmentTier: EquipmentAccess
  durationDays: number
  weekNumbers: number[]
  exclusions: string[]
  reason?: string
}

export interface AdaptationResult {
  mesocycle: MesocycleWeek[]
  preImage: MesocycleWeek[]
  receipt: PendingActionReceipt
}

/**
 * Re-runs substituteForInjury at confirm time (the diff shown pre-confirm
 * could be stale if the plan changed between propose and confirm — same
 * "recomputed when applied" reasoning executeExerciseSwap already follows)
 * and persists every touched week via saveMesocycleWeek. Does NOT create
 * the plan_adaptations row itself — that's the caller's job (ChatAssistant),
 * since it needs the pending_actions row id this function has no access to.
 */
export async function executeInjuryAdaptation(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  payload: InjuryAdaptationPayload,
): Promise<AdaptationResult> {
  const preImage = mesocycle
  // Same substitute-vs-rebuild choice as executeLastingInjury. A niggle in a
  // joint that rules out whole patterns still can't be adapted slot by slot,
  // and gutting the plan for two weeks is no better than gutting it forever.
  const rebuilding = payload.mode === 'rebuild'
  const substitution = rebuilding ? null : await substituteForInjury({
    mesocycle, profile, injuryCode: payload.injuryCode, weekNumbers: payload.weekNumbers, exclusions: payload.exclusions,
  })
  const result = {
    mesocycle: rebuilding
      ? await rebuildForInjury({
          profile, injuryCode: payload.injuryCode, exclusions: payload.exclusions,
          mesocycle, weekNumbers: payload.weekNumbers,
        })
      : substitution!.mesocycle,
    touchedSlots: substitution?.touchedSlots ?? [],
  }

  if (!profile.id) {
    return { mesocycle: result.mesocycle, preImage, receipt: { landed: [], failed: [{ op: 'save', error: 'No profile to save against' }] } }
  }

  try {
    const touchedWeeks = result.mesocycle.filter(w => payload.weekNumbers.includes(w.week_number))
    await Promise.all(touchedWeeks.map(w => saveMesocycleWeek(profile.id!, w)))
  } catch (err) {
    console.error('executeInjuryAdaptation: persisting failed', err)
    return { mesocycle: result.mesocycle, preImage, receipt: { landed: [], failed: [{ op: 'save', error: didNotSave('The adaptation') }] } }
  }

  return {
    mesocycle: result.mesocycle,
    preImage,
    receipt: {
      landed: rebuilding
        ? [`Rebuilt ${payload.weekNumbers.length} week${payload.weekNumbers.length === 1 ? '' : 's'} around your ${payload.injuryCode.replace('_', ' ')}`]
        : result.touchedSlots.map(s => `${s.dayName}: ${s.before} → ${s.after ?? '(removed)'}`),
      failed: [],
    },
  }
}

/**
 * Which strategy the confirmed action applies. 'substitute' swaps the
 * conflicting slots one by one (correct when an injury removes SOME
 * exercises). 'rebuild' regenerates the affected weeks around the injury
 * (correct when it removes whole movement patterns, where pointwise
 * substitution has no candidate for any of them and would simply delete a
 * quarter of the programme). Chosen at propose time by assessAdaptation so
 * the card the user confirms describes what will actually happen.
 */
export type InjuryAdaptationMode = 'substitute' | 'rebuild'

export interface LastingInjuryPayload {
  injuryCode: string
  weekNumbers: number[]
  exclusions: string[]
  reason?: string
  mode?: InjuryAdaptationMode
}

/**
 * The one legitimate chat-driven writer of fitness_profiles.injuries —
 * everywhere else in this file (substituteForInjury included) deliberately
 * never touches that column, see plan-adaptations.ts's own doc comment and
 * test-injury-exclusion-separation.ts. This function is new, narrow, and
 * additive to that set, not a change to any existing writer's contract.
 *
 * Two independent effects, same as the Profile screen's own manual-add path
 * would eventually produce together: (1) substitutes every remaining week
 * of the CURRENT mesocycle (payload.weekNumbers — the caller computes this
 * as "from today's week to the end of the program," not a bounded window,
 * since a lasting injury has no end date to bound it by), and (2) appends
 * injuryCode to the real profile.injuries (deduped) so any FUTURE/
 * regenerated plan is aware of it too — closing the exact gap that made a
 * chat-reported lasting injury invisible to regeneration. No plan_adaptations
 * row: there's nothing time-bounded here to expire.
 */
export async function executeLastingInjury(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  payload: LastingInjuryPayload,
): Promise<AdaptationResult> {
  const preImage = mesocycle

  // Rebuild path — the injury removes whole movement patterns, so there is
  // nothing to substitute INTO and swapping slot by slot would just delete
  // them. Regenerates the affected weeks around the injury instead. See
  // assessAdaptation / rebuildForInjury.
  const rebuilding = payload.mode === 'rebuild'
  const substitution = rebuilding
    ? null
    : await substituteForInjury({
        mesocycle, profile, injuryCode: payload.injuryCode, weekNumbers: payload.weekNumbers, exclusions: payload.exclusions,
      })
  const nextMesocycle = rebuilding
    ? await rebuildForInjury({
        profile, injuryCode: payload.injuryCode, exclusions: payload.exclusions,
        mesocycle, weekNumbers: payload.weekNumbers,
      })
    : substitution!.mesocycle
  const touchedSlots = substitution?.touchedSlots ?? []

  if (!profile.id) {
    return { mesocycle: nextMesocycle, preImage, receipt: { landed: [], failed: [{ op: 'save', error: 'No profile to save against' }] } }
  }

  try {
    const touchedWeeks = nextMesocycle.filter(w => payload.weekNumbers.includes(w.week_number))
    await Promise.all(touchedWeeks.map(w => saveMesocycleWeek(profile.id!, w)))
    if (!profile.injuries.includes(payload.injuryCode)) {
      await updateProfileField(profile.id, { injuries: [...profile.injuries, payload.injuryCode] })
    }
  } catch (err) {
    console.error('executeLastingInjury: persisting failed', err)
    return { mesocycle: nextMesocycle, preImage, receipt: { landed: [], failed: [{ op: 'save', error: didNotSave('That') }] } }
  }

  return {
    mesocycle: nextMesocycle,
    preImage,
    receipt: {
      landed: [
        ...(rebuilding
          ? [`Rebuilt ${payload.weekNumbers.length} week${payload.weekNumbers.length === 1 ? '' : 's'} around your ${payload.injuryCode.replace('_', ' ')}`]
          : touchedSlots.map(s => `${s.dayName}: ${s.before} → ${s.after ?? '(removed)'}`)),
        `Injuries: added ${payload.injuryCode.replace('_', ' ')}`,
      ],
      failed: [],
    },
  }
}

export interface InjuryRecoveredPayload {
  injuryCode: string
}

export interface InjuryRecoveredResult {
  receipt: PendingActionReceipt
}

/**
 * The inverse of executeLastingInjury — removes injuryCode from
 * fitness_profiles.injuries. Deliberately does NOT touch the mesocycle:
 * whatever was already substituted out stays substituted (see this
 * feature's own chat-facing copy, propose_injury_recovered's tool
 * description, and buildInjuryRecoveredProposal's card wording — all three
 * say this explicitly so it's never a surprise). Only future/regenerated
 * plans stop avoiding this area.
 */
export async function executeInjuryRecovered(
  profile: UserProfile,
  payload: InjuryRecoveredPayload,
): Promise<InjuryRecoveredResult> {
  if (!profile.id) {
    return { receipt: { landed: [], failed: [{ op: 'save', error: 'No profile to save against' }] } }
  }
  try {
    await updateProfileField(profile.id, { injuries: profile.injuries.filter(i => i !== payload.injuryCode) })
  } catch (err) {
    console.error('executeInjuryRecovered: persisting failed', err)
    return { receipt: { landed: [], failed: [{ op: 'save', error: didNotSave('That') }] } }
  }
  return { receipt: { landed: [`Injuries: removed ${payload.injuryCode.replace('_', ' ')}`], failed: [] } }
}

/** Mirrors executeInjuryAdaptation exactly, for the equipment/travel adaptation. */
export async function executeEquipmentAdaptation(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  payload: EquipmentAdaptationPayload,
): Promise<AdaptationResult> {
  const preImage = mesocycle
  const result = await substituteForEquipment({
    mesocycle, profile, equipmentTier: payload.equipmentTier, weekNumbers: payload.weekNumbers, exclusions: payload.exclusions,
  })

  if (!profile.id) {
    return { mesocycle: result.mesocycle, preImage, receipt: { landed: [], failed: [{ op: 'save', error: 'No profile to save against' }] } }
  }

  try {
    const touchedWeeks = result.mesocycle.filter(w => payload.weekNumbers.includes(w.week_number))
    await Promise.all(touchedWeeks.map(w => saveMesocycleWeek(profile.id!, w)))
  } catch (err) {
    console.error('executeEquipmentAdaptation: persisting failed', err)
    return { mesocycle: result.mesocycle, preImage, receipt: { landed: [], failed: [{ op: 'save', error: didNotSave('The adaptation') }] } }
  }

  return {
    mesocycle: result.mesocycle,
    preImage,
    receipt: { landed: result.touchedSlots.map(s => `${s.dayName}: ${s.before} → ${s.after ?? '(removed)'}`), failed: [] },
  }
}

// ---------------------------------------------------------------------------
// VOLUME AND SCHEDULE — audit §2.4.
//
// Both of these rode a tool that was declared and then declined on every call
// since it was written. They are on the pending-action rail now for the same
// reason the swaps are: propose -> confirm -> execute -> receipt, with an
// atomic claim so a double tap cannot apply twice and a pre_image so it can be
// undone. The original versions executed directly, chose their own magnitude,
// and could not be reversed.
// ---------------------------------------------------------------------------

export interface VolumeChangePayload {
  dayName: string
  direction: VolumeDirection
  weekNumbers: number[]
  reason?: string
}

/**
 * Steps a day's volume, in every week from the live one forward.
 *
 * RE-COMPUTED AT CONFIRM, not applied from the diff shown at propose time —
 * the same reasoning executeExerciseSwap already follows. The plan can change
 * between the two, and applying a stale diff would write numbers that were
 * true when the coach spoke and are not now.
 *
 * DELOAD WEEKS ARE SKIPPED. A recovery week is already reduced on purpose;
 * stepping it again fights the plan rather than serving the request.
 */
export async function executeVolumeChange(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  payload: VolumeChangePayload,
): Promise<AdaptationResult> {
  const preImage = mesocycle
  const landed: string[] = []
  const failed: { op: string; error: string }[] = []

  const next = mesocycle.map(week => {
    if (!payload.weekNumbers.includes(week.week_number)) return week
    if (!isVolumeAdjustable(week)) return week
    let touched: string | null = null
    const days = (week.days ?? []).map(day => {
      if (day.day.toLowerCase() !== payload.dayName.toLowerCase()) return day
      const result = adjustDayVolume(day, payload.direction, profile)
      if (result.changed) {
        landed.push(`Week ${week.week_number}: ${describeVolumeChange(result, day.day)}`)
        touched = day.day
      }
      return result.day
    })
    // THE SHARED TAIL, 13 Sep 2026. This path changes SET COUNTS and re-ran
    // nothing — while enforceSetHierarchy exists precisely to stop an accessory
    // out-setting its day's main lift, and the week balance pass exists to stop
    // the week's pushing and pulling drifting apart. Both are exactly what
    // adding a set to every eligible exercise on one day can break.
    if (!touched) return { ...week, days }
    return settleWeek({ ...week, days }, touched, profile).week
  })

  if (landed.length === 0) {
    failed.push({ op: 'volume', error: 'Every exercise on that day is already at its limit — nothing moved.' })
  }

  for (const week of next) {
    if (!payload.weekNumbers.includes(week.week_number)) continue
    try { if (profile.id) await saveMesocycleWeek(profile.id, week) }
    catch { failed.push({ op: 'save', error: `Week ${week.week_number} didn't save` }) }
  }

  return {
    mesocycle: next,
    preImage,
    receipt: { landed, failed },
  }
}

export interface SessionShortenPayload {
  weekNumber: number
  dayName: string
  minutes: number
  reason?: string
}

/**
 * "I'VE ONLY GOT 25 MINUTES TODAY", from the coach — 13 Sep 2026.
 *
 * The mirror of TodayPanel's shortenToday, and deliberately the same three
 * steps in the same order: shortenDayTo (which protects the main lift and
 * drops the accessory tail — Ashley's ruling), then settleWeek so a shortened
 * day gets the same tail every other edit does, then ONE week row written.
 *
 * SCOPE IS NOT A PARAMETER HERE. Shortening is today-only by definition — the
 * whole point is that next week's session is the full one — so this writes the
 * live week and nothing else, and there is no way for a caller to widen it.
 */
export async function executeSessionShorten(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  payload: SessionShortenPayload,
): Promise<AdaptationResult> {
  const preImage = mesocycle
  const landed: string[] = []
  const failed: { op: string; error: string }[] = []

  const week = mesocycle.find(w => w.week_number === payload.weekNumber)
  if (!week) {
    return { mesocycle, preImage, receipt: { landed, failed: [{ op: 'shorten', error: "I can't see that week on your plan just now." }] } }
  }

  const result = shortenDayTo(week, payload.dayName, profile, payload.minutes)
  if (!result.changed) {
    return { mesocycle, preImage, receipt: { landed, failed: [{ op: 'shorten', error: result.refusal ?? "I couldn't shorten that one." }] } }
  }

  const settled = settleWeek(result.week, payload.dayName, profile)
  const next = mesocycle.map(w => (w.week_number === payload.weekNumber ? settled.week : w))

  landed.push(
    `${payload.dayName}: about ${result.achievedMinutes} min` +
    (result.droppedExercises.length > 0 ? ` — out came ${result.droppedExercises.join(', ')}` : '') +
    (result.setsRemoved > 0 ? `${result.droppedExercises.length > 0 ? ', and' : ' —'} ${result.setsRemoved} set${result.setsRemoved === 1 ? '' : 's'} off what stayed` : ''),
  )

  try { if (profile.id) await saveMesocycleWeek(profile.id, settled.week) }
  catch { failed.push({ op: 'save', error: didNotSave('That') }) }

  return { mesocycle: next, preImage, receipt: { landed, failed } }
}

export interface CardioSessionPayload {
  weekNumber: number
  dayName: string
  activity: string
  minutes: number
  targetRpe: number
  reason?: string
  /** 'today' writes the live week only; 'permanent' carries it to the rest of the block. */
  scope: 'today' | 'permanent'
}

/**
 * PUTS A CARDIO SESSION ON A DAY, as part of the plan.
 *
 * Ashley, 15 Sep 2026: *"I want when it adds a session like a cardio session
 * that it's actually a useful card like other workouts not empty."*
 *
 * It writes a `PlannedActivity`, which is the shape three screens learned to
 * render earlier the same day — the card on Today, the week list, tomorrow's
 * preview. That ordering was the point: a card that cannot be rendered must
 * not be offered, and before that fix this would have produced exactly the
 * blank "log a walk or other activity" box she reported.
 *
 * IT REFUSES A DAY THAT ALREADY HAS LIFTING ON IT. `plannedActivity` means
 * "this activity is the WHOLE day" (types.ts says so), so writing one onto a
 * day holding exercises would make "is this the session or an extra?"
 * unanswerable from the data — and the screens, which lead with the
 * prescription, would hide the lifting behind it. Adding cardio AFTER a lift
 * is what `recommendedCardio` already means and is a different request.
 */
export async function executeCardioSession(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  payload: CardioSessionPayload,
): Promise<AdaptationResult> {
  const preImage = mesocycle
  const landed: string[] = []
  const failed: { op: string; error: string }[] = []

  const week = mesocycle.find(w => w.week_number === payload.weekNumber)
  if (!week) {
    return { mesocycle, preImage, receipt: { landed, failed: [{ op: 'add', error: "I can't see that week on your plan just now." }] } }
  }
  const day = week.days.find(d => d.day === payload.dayName)
  if (!day) {
    return { mesocycle, preImage, receipt: { landed, failed: [{ op: 'add', error: `I couldn't find ${payload.dayName} on your plan.` }] } }
  }
  if (day.exercises.length > 0) {
    return {
      mesocycle,
      preImage,
      receipt: { landed, failed: [{ op: 'add', error: `${payload.dayName} already has a session on it.` }] },
    }
  }

  const withActivity = (w: MesocycleWeek): MesocycleWeek => ({
    ...w,
    days: w.days.map(d => d.day !== payload.dayName ? d : {
      ...d,
      focus: payload.activity,
      is_scheduled: true,
      // THE SUGGESTION GOES WHEN THE PRESCRIPTION ARRIVES. recommendedCardio
      // is an add-on the generator offers for an empty day; once the day HAS a
      // session, leaving it would be two prescriptions on one day and no way
      // to tell which is which.
      recommendedCardio: undefined,
      plannedActivity: {
        activity: payload.activity,
        duration: payload.minutes,
        targetRpe: payload.targetRpe,
        ...(payload.reason ? { reason: payload.reason } : {}),
      },
    }),
  })

  // THE SAME ANSWER THE SAVER USES, asked rather than re-derived. This had its
  // own copy of the scope branch until test:silent-writes §6 — written earlier
  // the same day, after the swap path was found with THREE copies of it — went
  // red on this file. A caller that changes a run of weeks and a saver that
  // writes a run of weeks must not disagree about which run.
  const touched = new Set(weeksTouchedByScope(mesocycle, payload.weekNumber, payload.scope).map(w => w.week_number))
  const next = mesocycle.map(w => (touched.has(w.week_number) ? withActivity(w) : w))

  landed.push(`${payload.dayName}: ${payload.activity}, ${payload.minutes} min at RPE ${payload.targetRpe}`)

  if (!profile.id) {
    return { mesocycle: next, preImage, receipt: { landed: [], failed: [{ op: 'save', error: 'No profile to save against' }] } }
  }
  try {
    await saveScopedEdit(profile.id, next, payload.weekNumber, payload.scope)
  } catch (err) {
    console.error('executeCardioSession: persisting failed', err)
    return { mesocycle: next, preImage, receipt: { landed: [], failed: [{ op: 'save', error: didNotSave('That session') }] } }
  }

  return { mesocycle: next, preImage, receipt: { landed, failed } }
}

export interface ScheduleChangePayload {
  /** The days the user will train, replacing whatever was there. */
  trainingDays: string[]
  fromWeek: number
  reason?: string
}

/**
 * Changes which days are training days, then rebuilds from the live week.
 *
 * REUSES rebuildFromCurrentWeek — the same path the Profile screen's rebuild
 * offer takes, which is already gated. Nothing new about how a plan is
 * generated; this is only a new way to ask for one. Past weeks are untouched,
 * because they hold work somebody actually did.
 */
export async function executeScheduleChange(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  exclusions: string[],
  payload: ScheduleChangePayload,
): Promise<AdaptationResult> {
  const preImage = mesocycle
  const wanted = new Set(payload.trainingDays.map(d => d.toLowerCase()))
  const updated: UserProfile = {
    ...profile,
    training_days: (profile.training_days ?? []).map(d => ({ ...d, available: wanted.has(d.day.toLowerCase()) })),
  }

  const rebuild = await rebuildFromCurrentWeek(updated, exclusions, mesocycle, payload.fromWeek)
  if (!rebuild.ok || !rebuild.mesocycle) {
    return {
      mesocycle,
      preImage,
      receipt: { landed: [], failed: [{ op: 'rebuild', error: rebuild.error ?? 'The plan could not be rebuilt.' }] },
    }
  }

  const failed: { op: string; error: string }[] = []
  if (profile.id) {
    try { await updateProfileField(profile.id, { training_days: updated.training_days }) }
    catch { failed.push({ op: 'save', error: "The new days didn't save" }) }
    for (const week of rebuild.mesocycle) {
      if (week.week_number < payload.fromWeek) continue
      try { await saveMesocycleWeek(profile.id, week) }
      catch { failed.push({ op: 'save', error: `Week ${week.week_number} didn't save` }) }
    }
  }

  return {
    mesocycle: rebuild.mesocycle,
    preImage,
    receipt: {
      landed: failed.length === 0
        ? [`Training days: ${payload.trainingDays.join(', ')}`,
           `Rebuilt ${rebuild.weeksRebuilt} week${rebuild.weeksRebuilt === 1 ? '' : 's'} from week ${payload.fromWeek} on`]
        : [],
      failed,
    },
  }
}

// ---------------------------------------------------------------------------
// CHANGING HOW THEY TRAIN — 5 Sep 2026.
//
// The first of the ten Profile settings the coach could not touch (VISION:
// "Settings and chat are equal paths"), and the one that reshapes the whole
// programme: exercise-plan.ts reads training_style for the pool's style
// filter, the base rep range per tier, and STYLE_CONFIGS. Built as
// executeScheduleChange with the field swapped, because it is the same
// operation — a lasting profile change the plan has to follow, from the live
// week forward, past weeks untouched — and the same generation path
// Settings' rebuild offer already takes. Nothing new about how a plan is
// built; only a new way to ask for one.
// ---------------------------------------------------------------------------

export interface StyleChangePayload {
  /** The style they will train in from now on, replacing whatever was there. */
  trainingStyle: TrainingStyle
  fromWeek: number
  reason?: string
}

export async function executeStyleChange(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  exclusions: string[],
  payload: StyleChangePayload,
): Promise<AdaptationResult> {
  const preImage = mesocycle
  const updated: UserProfile = { ...profile, training_style: payload.trainingStyle }

  const rebuild = await rebuildFromCurrentWeek(updated, exclusions, mesocycle, payload.fromWeek)
  if (!rebuild.ok || !rebuild.mesocycle) {
    return {
      mesocycle,
      preImage,
      receipt: { landed: [], failed: [{ op: 'rebuild', error: rebuild.error ?? 'The plan could not be rebuilt.' }] },
    }
  }

  // Rebuild first, write second — the field only changes once there is a
  // plan that matches it. Writing the style and then failing the rebuild
  // would recreate the exact divergence this tool exists to close.
  const failed: { op: string; error: string }[] = []
  if (profile.id) {
    try { await updateProfileField(profile.id, { training_style: payload.trainingStyle }) }
    catch { failed.push({ op: 'save', error: "The new style didn't save" }) }
    for (const week of rebuild.mesocycle) {
      if (week.week_number < payload.fromWeek) continue
      try { await saveMesocycleWeek(profile.id, week) }
      catch { failed.push({ op: 'save', error: `Week ${week.week_number} didn't save` }) }
    }
  }

  return {
    mesocycle: rebuild.mesocycle,
    preImage,
    receipt: {
      landed: failed.length === 0
        ? [`Training style: ${STYLE_OPTIONS.find(o => o.value === payload.trainingStyle)?.label ?? payload.trainingStyle}`,
           `Rebuilt ${rebuild.weeksRebuilt} week${rebuild.weeksRebuilt === 1 ? '' : 's'} from week ${payload.fromWeek} on`]
        : [],
      failed,
    },
  }
}

// ---------------------------------------------------------------------------
// RESTING A PRESCRIBED DAY — 31 Aug 2026.
//
// The plainer half of the swap this file already executes. "I'm doing Muay
// Thai instead" had a tool; "rest day today" did not, so the coach answered
// it with a sentence and no write, and the day showed as missed the next
// morning. Ashley's ruling: record it, but confirm first — so it rides the
// same propose -> confirm -> execute -> receipt rail as every other change
// rather than writing the moment the model decides it heard one.
// ---------------------------------------------------------------------------

export interface RestDayPayload {
  /** ISO date of the day being rested. */
  date: string
  /** The day's name, for the receipt — resolved by the caller, not re-derived here. */
  dayName: string
  /** What the session would have been, for the receipt. */
  sessionFocus?: string
  reason?: string
}

export interface RestDayResult {
  receipt: PendingActionReceipt
}

export async function executeRestDay(
  profile: UserProfile,
  payload: RestDayPayload,
): Promise<RestDayResult> {
  if (!profile.id) {
    return { receipt: { landed: [], failed: [{ op: 'save', error: 'No profile to save against' }] } }
  }
  const ok = await setDeliberateRest(profile.id, payload.date, true)
  if (!ok) {
    return { receipt: { landed: [], failed: [{ op: 'save', error: "Couldn't mark that day — try again in a moment" }] } }
  }
  return {
    receipt: {
      landed: [`${payload.dayName}: resting${payload.sessionFocus ? ` instead of ${payload.sessionFocus}` : ''}`],
      failed: [],
    },
  }
}

/** Clears the flag. The day goes back to whatever it was — due, or missed. */
export async function undoRestDay(profileId: string, payload: RestDayPayload): Promise<void> {
  await setDeliberateRest(profileId, payload.date, false)
}

// ---------------------------------------------------------------------------
// "I'M DOING MUAY THAI INSTEAD" — now on the same rail as the other three.
//
// This was the FIRST of the four day-verbs to exist (25 Aug 2026) and the last
// to ask. It was built to stop the coach SAYING a day was marked when nothing
// could mark it, and it fixed that by writing immediately, server-side. Six
// days later Ashley ruled on the rest-day version — "record it, but confirm
// first" — and every day-verb built afterwards proposed. This one never came
// back for it, so on 15 Sep 2026 the coach changed her record with no card and
// no tap, and she reported it as the chat lying to her.
//
// THE WRITES ARE THE SCREEN'S, NOT A SECOND COPY. setSwappedForActivity and
// saveCardioLog are exactly what WhatHappenedSheet's "I did something else
// instead" calls, so the coach and the day menu leave identical rows — and
// swapped_for_activity keeps the single client writer test:what-happened §3
// pins.
// ---------------------------------------------------------------------------

export interface SwapForActivityPayload {
  /** ISO date of the day being swapped. */
  date: string
  /** The day's name, for the receipt — resolved by the caller, not re-derived here. */
  dayName: string
  /** What they are doing instead, in their own words. */
  activityName: string
  /** What the session would have been, for the receipt. */
  sessionFocus?: string
  /** Only ever a figure they actually said; null when they did not. */
  durationMinutes?: number | null
  intensityRpe?: number | null
  /** Still to come, so there is nothing to log yet — the day is marked either way. */
  activityPlanned?: boolean
}

export interface SwapForActivityResult {
  receipt: PendingActionReceipt
}

export async function executeSwapForActivity(
  profile: UserProfile,
  payload: SwapForActivityPayload,
): Promise<SwapForActivityResult> {
  if (!profile.id) {
    return { receipt: { landed: [], failed: [{ op: 'save', error: 'No profile to save against' }] } }
  }
  const ok = await setSwappedForActivity(profile.id, payload.date, payload.activityName)
  if (!ok) {
    return { receipt: { landed: [], failed: [{ op: 'save', error: "Couldn't swap that day — try again in a moment" }] } }
  }
  const landed = [`${payload.dayName}: ${payload.activityName}${payload.sessionFocus ? ` instead of ${payload.sessionFocus}` : ''}`]
  // THE DAY IS MARKED EITHER WAY; THE ACTIVITY IS LOGGED ONLY WHEN THERE IS
  // SOMETHING TRUE TO LOG. A class that has not happened yet has no duration
  // to record, and a duration nobody stated is a number the app invented —
  // both were live defects on the write path (8 Sep 2026, two rows for one
  // evening and a guessed 60 minutes for a class still hours away).
  const minutes = payload.durationMinutes
  if (!payload.activityPlanned && typeof minutes === 'number' && minutes > 0) {
    saveCardioLog({
      userId: profile.id,
      date: payload.date,
      activityName: payload.activityName,
      durationMinutes: Math.round(minutes),
      intensityRpe: payload.intensityRpe ?? 6,
      notes: 'Swapped in place of the prescribed lifting session',
    })
    landed.push(`${payload.activityName}: ${Math.round(minutes)} min logged`)
  }
  return { receipt: { landed, failed: [] } }
}

/** Clears the swap. The day goes back to whatever it was — due, or missed. */
export async function undoSwapForActivity(profileId: string, payload: SwapForActivityPayload): Promise<void> {
  await setSwappedForActivity(profileId, payload.date, null)
}

export interface MissedSessionPayload {
  /** ISO date of the day that was missed. */
  date: string
  /** The day's name, for the receipt — resolved by the caller, not re-derived here. */
  dayName: string
  /** What the session would have been, for the receipt. */
  sessionFocus?: string
  reason?: string
}

export interface MissedSessionResult {
  receipt: PendingActionReceipt
}

/**
 * "I missed it", confirmed. Its own executor and its own column — never a
 * rest-day write in disguise. Ashley's ruling, 10 Sep 2026: a missed day
 * stays missed on the record, so the week keeps counting it; the only thing
 * this changes is that the app now KNOWS rather than infers.
 */
export async function executeMissedSession(
  profile: UserProfile,
  payload: MissedSessionPayload,
): Promise<MissedSessionResult> {
  if (!profile.id) {
    return { receipt: { landed: [], failed: [{ op: 'save', error: 'No profile to save against' }] } }
  }
  const ok = await setMarkedMissed(profile.id, payload.date, true)
  if (!ok) {
    return { receipt: { landed: [], failed: [{ op: 'save', error: "Couldn't mark that day — try again in a moment" }] } }
  }
  return {
    receipt: {
      landed: [`${payload.dayName}: missed${payload.sessionFocus ? ` — ${payload.sessionFocus}` : ''}`],
      failed: [],
    },
  }
}

export async function undoMissedSession(profileId: string, payload: MissedSessionPayload): Promise<void> {
  await setMarkedMissed(profileId, payload.date, false)
}

export interface SessionMovePayload {
  /** ISO date of the day the session was prescribed for. */
  fromDate: string
  /** ISO date it is being run on instead. */
  toDate: string
  /** Both day names, resolved by the caller against the live plan — not re-derived here. */
  fromDayName: string
  toDayName: string
  /** What the session is, for the receipt. */
  sessionFocus?: string
  /**
   * Set when the day they NAMED was already taken and this is the next free
   * one. The card says so; the receipt repeats it, because a move that landed
   * two days from where she asked is exactly the thing she should not have to
   * discover later.
   */
  requestedDayName?: string
  reason?: string
  /**
   * What they did INSTEAD on the day the session left, when the same message
   * said so ("Muay Thai tonight"). Recorded on confirm only when it has
   * happened and they said how long — see alsoDoingIsLoggable; a class that
   * is still to come marks nothing, and the coach asks afterwards.
   */
  alsoDoing?: AlsoDoing
}

export async function executeSessionMove(
  profile: UserProfile,
  payload: SessionMovePayload,
): Promise<RestDayResult> {
  if (!profile.id) {
    return { receipt: { landed: [], failed: [{ op: 'save', error: 'No profile to save against' }] } }
  }
  const ok = await setSessionMove(profile.id, payload.fromDate, payload.toDate)
  if (!ok) {
    return { receipt: { landed: [], failed: [{ op: 'save', error: "Couldn't move that session — try again in a moment" }] } }
  }
  const landed = [
    `${payload.fromDayName}${payload.sessionFocus ? `'s ${payload.sessionFocus}` : ''} moved to ${payload.toDayName}`
    + (payload.requestedDayName ? ` (${payload.requestedDayName} already had a session on it)` : ''),
  ]
  const failed: { op: string; error: string }[] = []
  // THE PASSENGER, through the client's own cardio path — clientId dedupe,
  // the offline queue, the plausibility bound — never a bare insert. Only
  // when it has happened and they said how long: a duration the model
  // guessed never reaches here (the server drops it), and a class still to
  // come is not a log entry.
  if (payload.alsoDoing && alsoDoingIsLoggable(payload.alsoDoing)) {
    const a = payload.alsoDoing
    const view = saveCardioLog({
      userId: profile.id,
      date: payload.fromDate,
      activityName: a.activity,
      durationMinutes: a.durationMinutes as number,
      intensityRpe: 6,
      notes: 'Done instead of the moved session',
    })
    if (view) landed.push(`${a.activity} logged for ${payload.fromDayName}: ${a.durationMinutes} min`)
    else failed.push({ op: 'log activity', error: `Couldn't log the ${a.activity} — the duration didn't look right` })
  }
  return { receipt: { landed, failed } }
}

/**
 * Clears the move. Deliberately leaves any activity the confirm logged: the
 * move was a plan, the activity happened, and undoing a plan must not erase a
 * fact. The activity has its own Undo on the Exercise tab.
 */
export async function undoSessionMove(profileId: string, payload: SessionMovePayload): Promise<void> {
  await setSessionMove(profileId, payload.fromDate, null)
}

// ---------------------------------------------------------------------------
// "I ALSO DO MUAY THAI TWICE A WEEK" — a second sport, on a standing schedule.
//
// Ashley's ruling, 6 Sep 2026, choosing this over cutting volume and over
// recording it without acting: keep the gym days, put the LIGHTER sessions on
// the class days, and keep prescribed cardio off those nights. The generator
// reads `concurrent_activities` for exactly that (concurrent-activity.ts);
// this executor is what finally WRITES the field, which nothing had done since
// the column was created in July.
//
// Same rail as executeScheduleChange / executeStyleChange, for the same
// reason: a lasting profile change the plan has to follow. Rebuild first,
// write second — the field only changes once there is a plan that matches it.
// ---------------------------------------------------------------------------

export interface ConcurrentActivityPayload {
  /** The activity as validated by the client builder — days canonical, vocabulary checked. */
  activity: ConcurrentActivity
  /**
   * PASSENGERS. Her sentence carried a day change AND an activity; two confirm
   * cards for one sentence reads as the app not listening. When present these
   * are applied in the same rebuild. Absent = leave the profile's value alone.
   */
  trainingDays?: string[]
  gymTimeOfDay?: 'morning' | 'evening'
  fromWeek: number
  reason?: string
}

export async function executeConcurrentActivity(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  exclusions: string[],
  payload: ConcurrentActivityPayload,
): Promise<AdaptationResult> {
  const preImage = mesocycle
  // Replace by name, otherwise append — telling the coach about Muay Thai a
  // second time with different days corrects it rather than duplicating it.
  const others = (profile.concurrent_activities ?? []).filter(a => a.name.toLowerCase() !== payload.activity.name.toLowerCase())
  const activities: ConcurrentActivity[] = [...others, payload.activity]
  const wanted = payload.trainingDays ? new Set(payload.trainingDays.map(d => d.toLowerCase())) : null
  const updated: UserProfile = {
    ...profile,
    concurrent_activities: activities,
    training_days: wanted
      ? (profile.training_days ?? []).map(d => ({ ...d, available: wanted.has(d.day.toLowerCase()) }))
      : profile.training_days,
    preferred_time: payload.gymTimeOfDay ?? profile.preferred_time,
  }

  const rebuild = await rebuildFromCurrentWeek(updated, exclusions, mesocycle, payload.fromWeek)
  if (!rebuild.ok || !rebuild.mesocycle) {
    return {
      mesocycle,
      preImage,
      receipt: { landed: [], failed: [{ op: 'rebuild', error: rebuild.error ?? 'The plan could not be rebuilt.' }] },
    }
  }

  const failed: { op: string; error: string }[] = []
  if (profile.id) {
    const patch: Partial<UserProfile> = { concurrent_activities: activities }
    if (wanted) patch.training_days = updated.training_days
    if (payload.gymTimeOfDay) patch.preferred_time = payload.gymTimeOfDay
    try { await updateProfileField(profile.id, patch) }
    catch { failed.push({ op: 'save', error: "The activity didn't save" }) }
    for (const week of rebuild.mesocycle) {
      if (week.week_number < payload.fromWeek) continue
      try { await saveMesocycleWeek(profile.id, week) }
      catch { failed.push({ op: 'save', error: `Week ${week.week_number} didn't save` }) }
    }
  }

  const landed = failed.length === 0
    ? [
        `Other training: ${describeActivity(payload.activity)}`,
        ...volumeReceiptLine(profile, payload.activity),
        ...(wanted ? [`Training days: ${payload.trainingDays!.join(', ')}`] : []),
        ...(payload.gymTimeOfDay ? [`Gym sessions: ${payload.gymTimeOfDay}s`] : []),
        `Rebuilt ${rebuild.weeksRebuilt} week${rebuild.weeksRebuilt === 1 ? '' : 's'} from week ${payload.fromWeek} on`,
      ]
    : []

  return { mesocycle: rebuild.mesocycle, preImage, receipt: { landed, failed } }
}

/**
 * The receipt's volume line for a second sport. Present only when the rule
 * in concurrent-activity.ts counts it as load, and honest in the one case the
 * notch has nowhere to go: someone already at low recovery keeps the
 * schedule change and nothing comes off the sets.
 */
function volumeReceiptLine(profile: UserProfile, activity: ConcurrentActivity): string[] {
  if (!activityCountsAsLoad(activity)) return []
  if (activity.keep_full_volume) return [`Lifting volume: full, as you chose, despite ${activity.name}`]
  if ((profile.recovery_capacity || 'moderate') === 'low') {
    return [`Lifting volume: already at its lowest setting — ${activity.name} changes the schedule, not the sets`]
  }
  return [`Lifting volume: one recovery notch down for ${activity.name} — revert any time from the workout card`]
}

export interface SecondSportVolumePayload {
  /** true = keep full lifting volume despite the sport(s); false = put the notch back. */
  keepFullVolume: boolean
  fromWeek: number
}

/**
 * The workout card's one-tap toggle, Ashley's ruling of 6 Sep 2026: "a
 * simple inline button to Revert to Full Volume". Same shape as
 * executeConcurrentActivity — rebuild first, write second, forward-only — so
 * a failed rebuild writes nothing and the card can say exactly which half
 * failed. Applies to every activity the rule counts, because the card shows
 * one line for all of them; the choice lives on each activity
 * (keep_full_volume) so removing the sport removes it too.
 */
export async function executeSecondSportVolume(
  profile: UserProfile,
  mesocycle: MesocycleWeek[],
  exclusions: string[],
  payload: SecondSportVolumePayload,
): Promise<AdaptationResult & { profilePatch: Partial<UserProfile> }> {
  const preImage = mesocycle
  const activities: ConcurrentActivity[] = (profile.concurrent_activities ?? []).map(a => {
    if (!activityCountsAsLoad(a)) return a
    if (payload.keepFullVolume) return { ...a, keep_full_volume: true }
    const { keep_full_volume: _reverted, ...rest } = a
    return rest
  })
  const names = [...new Set((profile.concurrent_activities ?? []).filter(activityCountsAsLoad).map(a => a.name))].join(' and ')
  const updated: UserProfile = { ...profile, concurrent_activities: activities }

  const rebuild = await rebuildFromCurrentWeek(updated, exclusions, mesocycle, payload.fromWeek)
  if (!rebuild.ok || !rebuild.mesocycle) {
    return {
      mesocycle, preImage, profilePatch: {},
      receipt: { landed: [], failed: [{ op: 'rebuild', error: rebuild.error ?? 'The plan could not be rebuilt.' }] },
    }
  }

  const failed: { op: string; error: string }[] = []
  if (profile.id) {
    try { await updateProfileField(profile.id, { concurrent_activities: activities }) }
    catch { failed.push({ op: 'save', error: "That choice didn't save" }) }
    for (const week of rebuild.mesocycle) {
      if (week.week_number < payload.fromWeek) continue
      try { await saveMesocycleWeek(profile.id, week) }
      catch { failed.push({ op: 'save', error: `Week ${week.week_number} didn't save` }) }
    }
  }

  const landed = failed.length === 0
    ? [
        payload.keepFullVolume
          ? `Lifting volume: full, despite ${names}`
          : `Lifting volume: one recovery notch down for ${names}`,
        `Rebuilt ${rebuild.weeksRebuilt} week${rebuild.weeksRebuilt === 1 ? '' : 's'} from week ${payload.fromWeek} on`,
      ]
    : []

  return { mesocycle: rebuild.mesocycle, preImage, receipt: { landed, failed }, profilePatch: { concurrent_activities: activities } }
}
