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
import { getExerciseEntry, isContraindicatedFor } from './exercise-db'
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
    // Contraindication, not participation — a rehab movement for the injured
    // joint must NOT be substituted away. See exercise-db.ts's three-state tag.
    return isContraindicatedFor(entry, flaggedJoints)
  }

  return substituteSlots(mesocycle, profile, weekNumbers, exclusions, conflicts, candidateProfile)
}

/**
 * How much of the plan a pointwise substitution would destroy.
 *
 * Pointwise substitution assumes the injury removes SOME exercises. When it
 * removes whole movement patterns — a shoulder injury eliminates every
 * horizontal push, vertical push and vertical pull in the pool — there is no
 * same-pattern candidate for any of those slots by construction, so every one
 * of them gets dropped and the user is left with a hollow plan. Measured on a
 * real full_gym profile: 146 of ~190 slots removed, none substituted.
 *
 * A coach in that situation doesn't delete two thirds of the programme and
 * hand back the remains — they rebuild the week around what the person CAN
 * train. This is the signal for that.
 */
export interface AdaptationViability {
  /** Slots that would be changed at all. */
  touched: number
  /** Slots that would be dropped with no replacement. */
  dropped: number
  /** Movement patterns with no surviving candidate anywhere in the pool. */
  wipedPatterns: string[]
  /** Dropped slots as a fraction of the ENTIRE programme — what the user actually loses. */
  planLossRatio: number
  /** True when dropping is doing most of the work — rebuild instead. */
  shouldRebuild: boolean
}

/**
 * How much of the WHOLE plan the substitution would delete.
 *
 * Measuring against slots-touched was the obvious first cut and it's wrong:
 * a neck injury touches 16 slots and drops all 16, scoring a perfect 1.0,
 * but that's under 4% of a 432-slot programme — rebuilding the entire
 * mesocycle over it would destroy the user's plan to fix a rounding error.
 * A shoulder injury drops 96 of 432 (22%), which genuinely is the plan no
 * longer being the plan. The denominator has to be the whole programme,
 * because that's what the user actually loses.
 */
export const REBUILD_PLAN_LOSS_RATIO = 0.15

export function assessAdaptation(result: SubstitutionResult, totalSlots: number): AdaptationViability {
  const touched = result.touchedSlots.length
  const dropped = result.touchedSlots.filter(s => s.after === null).length
  const wipedPatterns = [...new Set(result.droppedPatterns)]
  return {
    touched,
    dropped,
    wipedPatterns,
    planLossRatio: totalSlots > 0 ? dropped / totalSlots : 0,
    shouldRebuild: totalSlots > 0 && dropped / totalSlots >= REBUILD_PLAN_LOSS_RATIO,
  }
}

/** Total loaded+unloaded exercise slots in a mesocycle — the denominator for assessAdaptation. */
export function countSlots(mesocycle: MesocycleWeek[]): number {
  return mesocycle.reduce((n, w) => n + w.days.reduce((m, d) => m + d.exercises.length, 0), 0)
}

export interface RebuildForInjuryParams {
  profile: UserProfile
  injuryCode: string
  exclusions: string[]
  /** Preserved from the outgoing mesocycle so week numbering/labels/blocks stay stable for anything referencing them. */
  mesocycle: MesocycleWeek[]
  /**
   * Only these weeks are replaced; everything else is returned untouched.
   * Omitted means the whole programme (a lasting injury). A time-bounded
   * adaptation passes its window, so the rebuild is exactly as temporary as
   * the adaptation is and the existing pre_image/revert machinery restores
   * the original weeks unchanged when it expires.
   */
  weekNumbers?: number[]
}

/**
 * Regenerates the programme with the injury applied, instead of subtracting
 * from the existing one. Reuses the normal generation pipeline against a
 * profile clone carrying the injury, so the result is a coherent, balanced
 * week built for someone with that injury — including any movements marked
 * INDICATED for it (see exercise-db.ts's three-state joint tags), which is
 * why the rebuild can produce genuinely rehabilitative work rather than just
 * an absence of the dangerous stuff.
 *
 * The profile clone is local and never written back: the caller owns whether
 * fitness_profiles.injuries changes (executeLastingInjury does; the
 * time-bounded adaptation deliberately doesn't), and this function must not
 * quietly make that decision for it — the same separation
 * test:injury-separation protects.
 */
export async function rebuildForInjury(params: RebuildForInjuryParams): Promise<MesocycleWeek[]> {
  const { profile, injuryCode, exclusions, mesocycle, weekNumbers } = params
  const targetWeeks = weekNumbers ? new Set(weekNumbers) : null
  const injuredProfile: UserProfile = {
    ...profile,
    injuries: profile.injuries.includes(injuryCode) ? profile.injuries : [...profile.injuries, injuryCode],
  }

  const { generateExercisePlan, generateMesocycle } = await import('./exercise-plan')
  const plan = generateExercisePlan(injuredProfile, exclusions)
  const rebuilt = generateMesocycle(injuredProfile, plan.plan)

  // Keep the outgoing week identity (numbers, labels, block boundaries) so
  // anything holding a week reference — logged sets, an active session, the
  // week strip — still resolves. Only the CONTENT is replaced.
  return mesocycle.map((original, i) => {
    if (targetWeeks && !targetWeeks.has(original.week_number)) return original
    const week = rebuilt[i]
    if (!week) return original
    return {
      ...week,
      week_number: original.week_number,
      block_number: original.block_number,
      label: original.label,
      phase_label: original.phase_label,
    }
  })
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
