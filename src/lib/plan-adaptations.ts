// ---------------------------------------------------------------------------
// Pure substitution logic for time-bounded plan adaptations (injury +
// equipment/travel) — no I/O, mirrors mesocycle-edit.ts's own contract
// exactly and reuses its helpers (clearOrphanedSupersetLabels,
// applyReplacement, recomputeLoad, getReplacementCandidates, isMainLiftSlot)
// rather than re-deriving any of them. Bounded by an explicit week-number
// range (from the stated duration), not mesocycle-edit's block concept —
// models banExerciseFromMesocycle's "sweep every week" shape, scoped to the
// given weeks instead of every week ever.
// ---------------------------------------------------------------------------

import type { MesocycleWeek, Exercise, UserProfile, EquipmentAccess } from './types'
import { getExerciseEntry } from './exercise-db'
import { getFlaggedJoints, isEquipmentAllowed } from './exercise-plan'
import {
  getReplacementCandidates,
  recomputeLoad,
  applyReplacement,
  clearOrphanedSupersetLabels,
  isMainLiftSlot,
} from './mesocycle-edit'

export interface TouchedSlot {
  weekNumber: number
  dayName: string
  before: string
  after: string | null
}

export interface SubstitutionResult {
  mesocycle: MesocycleWeek[]
  touchedSlots: TouchedSlot[]
  droppedPatterns: string[]
}

async function substituteSlots(
  mesocycle: MesocycleWeek[],
  profile: UserProfile,
  weekNumbers: number[],
  exclusions: string[],
  conflicts: (slot: Exercise) => boolean,
  candidateProfile: UserProfile,
): Promise<SubstitutionResult> {
  const targetWeeks = new Set(weekNumbers)
  const touchedSlots: TouchedSlot[] = []
  const droppedPatterns: string[] = []

  const weeks = await Promise.all(mesocycle.map(async week => {
    if (!targetWeeks.has(week.week_number)) return week

    const days = await Promise.all(week.days.map(async day => {
      let changed = false
      const exercises = await Promise.all(day.exercises.map(async (slot, idx) => {
        if (!conflicts(slot)) return slot
        const entry = getExerciseEntry(slot.name)
        if (!entry) return slot

        // getReplacementCandidates already filters against candidateProfile's
        // constraint pool (equipment/injury/style/skill), so every candidate
        // here is already guaranteed conflict-free — no re-check needed.
        const alreadyUsedInDay = new Set(day.exercises.filter((_, i) => i !== idx).map(e => e.name))
        const candidates = getReplacementCandidates(slot.name, candidateProfile, exclusions)
          .filter(c => !alreadyUsedInDay.has(c.exercise.name))

        changed = true
        if (candidates.length === 0) {
          touchedSlots.push({ weekNumber: week.week_number, dayName: day.day, before: slot.name, after: null })
          droppedPatterns.push(slot.movement_pattern ?? entry.movement_pattern)
          return null
        }

        const replacement = candidates[0].exercise
        const load = await recomputeLoad(replacement, profile, slot.intensity || '', slot.sets, slot.reps, isMainLiftSlot(slot))
        touchedSlots.push({ weekNumber: week.week_number, dayName: day.day, before: slot.name, after: replacement.name })
        return applyReplacement(slot, replacement, load)
      }))

      if (!changed) return day
      const kept = exercises.filter((e): e is Exercise => e !== null)
      return { ...day, exercises: clearOrphanedSupersetLabels(kept) }
    }))

    return { ...week, days }
  }))

  return { mesocycle: weeks, touchedSlots, droppedPatterns }
}

export interface SubstituteForInjuryParams {
  mesocycle: MesocycleWeek[]
  profile: UserProfile
  injuryCode: string
  weekNumbers: number[]
  exclusions: string[]
}

/**
 * For each slot in the given weeks whose exercise loads a joint flagged by
 * injuryCode, finds a same-constraint-pool replacement that doesn't — the
 * candidate pool is filtered against a LOCAL profile clone with injuryCode
 * added to `injuries` (never written to the real profile, so
 * test:injury-separation's guarantees hold: this function never touches
 * fitness_profiles.injuries). No candidate -> the slot is dropped, matching
 * banExerciseFromMesocycle's own fallback rather than leaving the
 * injury-conflicting exercise in place.
 */
export async function substituteForInjury(params: SubstituteForInjuryParams): Promise<SubstitutionResult> {
  const { mesocycle, profile, injuryCode, weekNumbers, exclusions } = params
  const flaggedJoints = getFlaggedJoints([injuryCode])
  const candidateProfile: UserProfile = { ...profile, injuries: [...profile.injuries, injuryCode] }

  const conflicts = (slot: Exercise): boolean => {
    const entry = getExerciseEntry(slot.name)
    if (!entry) return false
    return entry.loads_joints.some(j => flaggedJoints.has(j))
  }

  return substituteSlots(mesocycle, profile, weekNumbers, exclusions, conflicts, candidateProfile)
}

export interface SubstituteForEquipmentParams {
  mesocycle: MesocycleWeek[]
  profile: UserProfile
  equipmentTier: EquipmentAccess
  weekNumbers: number[]
  exclusions: string[]
}

/**
 * For each slot in the given weeks whose exercise isn't fully coverable by
 * equipmentTier's allowed set, finds a same-constraint-pool replacement that
 * is — candidate pool filtered against a local profile clone with
 * equipment_access set to the travel tier. Same drop-if-no-candidate
 * fallback as substituteForInjury.
 */
export async function substituteForEquipment(params: SubstituteForEquipmentParams): Promise<SubstitutionResult> {
  const { mesocycle, profile, equipmentTier, weekNumbers, exclusions } = params
  const candidateProfile: UserProfile = { ...profile, equipment_access: equipmentTier }

  const conflicts = (slot: Exercise): boolean => {
    const entry = getExerciseEntry(slot.name)
    if (!entry) return false
    return !isEquipmentAllowed(entry, equipmentTier)
  }

  return substituteSlots(mesocycle, profile, weekNumbers, exclusions, conflicts, candidateProfile)
}
