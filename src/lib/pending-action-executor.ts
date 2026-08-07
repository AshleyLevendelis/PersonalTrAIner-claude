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
import { substituteForInjury, substituteForEquipment } from './plan-adaptations'
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
  const result = await substituteForInjury({
    mesocycle, profile, injuryCode: payload.injuryCode, weekNumbers: payload.weekNumbers, exclusions: payload.exclusions,
  })

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
    receipt: { landed: result.touchedSlots.map(s => `${s.dayName}: ${s.before} → ${s.after ?? '(removed)'}`), failed: [] },
  }
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
