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

import type { MesocycleWeek, UserProfile, EquipmentAccess } from './types'
import { swapExerciseInMesocycle, type SwapScope } from './mesocycle-edit'
import { saveMesocycle, saveMesocycleWeek } from './mesocycle-persistence'
import { getExerciseEntry } from './exercise-db'
import { swapPoolMeal, type MealSlotName } from './meal-store'
import { substituteForInjury, substituteForEquipment, rebuildForInjury } from './plan-adaptations'
import { updateProfileField } from './profile-store'
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
