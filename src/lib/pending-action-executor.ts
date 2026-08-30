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

import { adjustDayVolume, describeVolumeChange, isVolumeAdjustable, type VolumeDirection } from './volume-adjust'
import { rebuildFromCurrentWeek } from './plan-invalidation'
import { updateProfileField } from './profile-store'
import type { MesocycleWeek, UserProfile, EquipmentAccess } from './types'
import { swapExerciseInMesocycle, type SwapScope } from './mesocycle-edit'
import { saveMesocycle, saveMesocycleWeek } from './mesocycle-persistence'
import { getExerciseEntry } from './exercise-db'
import { swapPoolMeal, clearMealPick, getMealPicksForDate, type MealSlotName } from './meal-store'
import { supabase } from './supabase'
import type { MealAdditionPayload } from './meal-addition'
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
    if (payload.scope === 'today') {
      const week = updatedMesocycle.find(w => w.week_number === payload.weekNumber)
      if (week) await saveMesocycleWeek(profile.id, week)
    } else {
      const touchedBlock = updatedMesocycle.find(w => w.week_number === payload.weekNumber)?.block_number
      const touchedWeeks = updatedMesocycle.filter(w => w.block_number === touchedBlock && w.week_number >= payload.weekNumber)
      await Promise.all(touchedWeeks.map(w => saveMesocycleWeek(profile.id!, w)))
    }
  } catch (err) {
    console.error('executeExerciseSwap: persisting swap failed', err)
    return {
      mesocycle: updatedMesocycle,
      preImage,
      receipt: { landed: [], failed: [{ op: 'save', error: 'The swap could not be saved — try again' }] },
    }
  }

  return {
    mesocycle: updatedMesocycle,
    preImage,
    receipt: { landed: [`${payload.oldExerciseName} → ${payload.newExerciseName}`], failed: [] },
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
    tags: option.tags,
  })
  if (insertError) {
    return { receipt: { landed: [], failed: [{ op: 'propose_meal_addition', error: "Couldn't save the meal to your plan" }] }, poolIndex: null }
  }

  return { receipt: { landed: [`${slot}: + ${option.name}`], failed: [] }, poolIndex: nextIndex }
}

/**
 * Removes an added option from the pool and clears the pick it set — both
 * halves. This is the undo, and also the rollback when the pool write lands
 * but the pick doesn't: a meal left in the pool after a receipt said
 * "Couldn't add it" is the same kind of quiet disagreement between what the
 * app claims and what it stored that this framework exists to prevent.
 */
export async function undoMealAddition(profileId: string, payload: MealAdditionPayload): Promise<void> {
  const { slot, date, option } = payload
  await supabase.from('meal_plan_slots').delete().eq('profile_id', profileId).eq('slot', slot).eq('name', option.name)
  const picks = await getMealPicksForDate(profileId, date)
  if (picks[slot] === option.name) await clearMealPick(profileId, date, slot)
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
    return { mesocycle: result.mesocycle, preImage, receipt: { landed: [], failed: [{ op: 'save', error: 'The adaptation could not be saved — try again' }] } }
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
    return { mesocycle: nextMesocycle, preImage, receipt: { landed: [], failed: [{ op: 'save', error: 'Could not save this — try again' }] } }
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
    return { receipt: { landed: [], failed: [{ op: 'save', error: 'Could not save this — try again' }] } }
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
    return { mesocycle: result.mesocycle, preImage, receipt: { landed: [], failed: [{ op: 'save', error: 'The adaptation could not be saved — try again' }] } }
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
    const days = (week.days ?? []).map(day => {
      if (day.day.toLowerCase() !== payload.dayName.toLowerCase()) return day
      const result = adjustDayVolume(day, payload.direction, profile)
      if (result.changed) landed.push(`Week ${week.week_number}: ${describeVolumeChange(result, day.day)}`)
      return result.day
    })
    return { ...week, days }
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
