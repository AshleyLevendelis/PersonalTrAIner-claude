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

      // SEQUENTIAL WITHIN A DAY, and that is the whole fix.
      //
      // This used to be `await Promise.all(day.exercises.map(...))`, with a
      // duplicate guard that could not possibly work: it read the ORIGINAL
      // `day.exercises` (so it only knew names that were already there, never
      // ones picked during this pass), and every slot resolved in parallel
      // (so no slot could observe another's choice). Two conflicting slots in
      // one session therefore computed the same "already used" set, got the
      // same ranked candidates, and both took candidates[0]. Measured on a
      // shoulder injury: 28 duplicate placements, producing sessions like
      //   Band Dislocates | Barbell Floor Press | Landmine Press |
      //   Landmine Press | Tricep Pushdowns | Side Plank | Barbell Floor Press
      // — seven "exercises", four movements. The comment explaining the
      // filtering gave false confidence over a mechanism that never ran.
      //
      // Days and weeks stay parallel; only slots inside one day need
      // ordering, because that is the only place the collision can occur.
      const usedInDay = new Set(day.exercises.filter(e => !conflicts(e)).map(e => e.name))
      const exercises: (Exercise | null)[] = []

      for (const slot of day.exercises) {
        if (!conflicts(slot)) { exercises.push(slot); continue }
        const entry = getExerciseEntry(slot.name)
        if (!entry) { exercises.push(slot); continue }

        // getReplacementCandidates already filters against candidateProfile's
        // constraint pool (equipment/injury/style/skill), so every candidate
        // here is already guaranteed conflict-free — no re-check needed.
        const candidates = getReplacementCandidates(slot.name, candidateProfile, exclusions)
          .filter(c => !usedInDay.has(c.exercise.name))

        changed = true
        if (candidates.length === 0) {
          // No UNIQUE candidate left. Dropping is the honest outcome — a
          // session listing the same lift twice is not an extra exercise,
          // and this raises `dropped`, which is what assessAdaptation reads
          // to decide a rebuild would serve the user better.
          touchedSlots.push({ weekNumber: week.week_number, dayName: day.day, before: slot.name, after: null })
          droppedPatterns.push(slot.movement_pattern ?? entry.movement_pattern)
          exercises.push(null)
          continue
        }

        const replacement = candidates[0].exercise
        usedInDay.add(replacement.name)
        const load = await recomputeLoad(replacement, profile, slot.intensity || '', slot.sets, slot.reps, isMainLiftSlot(slot))
        touchedSlots.push({ weekNumber: week.week_number, dayName: day.day, before: slot.name, after: replacement.name })
        exercises.push(applyReplacement(slot, replacement, load, profile.session_duration_preference))
      }

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
    // The ratio alone misses the exact case this function's own doc comment
    // describes: a wiped pattern means there is no same-pattern candidate
    // for those slots BY CONSTRUCTION, no matter how few slots that turns
    // out to be in raw count terms. A shoulder injury that wipes 'pull'
    // entirely, but only touches a small enough share of a large programme
    // to stay under the ratio threshold, still leaves the user with zero
    // pulling work — pointwise substitution can't fix that, only a rebuild
    // (which can re-plan the week's tracks around what's actually left) can.
    shouldRebuild: totalSlots > 0 && (dropped / totalSlots >= REBUILD_PLAN_LOSS_RATIO || wipedPatterns.length > 0),
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
  const injuredProfile: UserProfile = {
    ...profile,
    injuries: profile.injuries.includes(injuryCode) ? profile.injuries : [...profile.injuries, injuryCode],
  }
  return rebuildAgainstProfile(injuredProfile, exclusions, mesocycle, weekNumbers)
}

/**
 * The shared half of every "regenerate rather than subtract" rebuild: run the
 * normal generation pipeline against a LOCAL profile clone and splice the
 * result into the live mesocycle, preserving week identity.
 *
 * Extracted when the weight-basis rebuild arrived, because it is the same
 * operation with a different clone — and the identity-preservation below is
 * the part that must not be re-derived per caller. Anything holding a week
 * reference (logged sets, an active session, the week strip, the load-
 * suggestion rows keyed by block_number) resolves through week_number and
 * block_number; a rebuild that renumbered them would orphan all of it while
 * looking perfectly correct in isolation.
 *
 * The clone is never written back. Whether the underlying profile row
 * changes is the CALLER's decision every time — executeLastingInjury writes
 * injuries, the time-bounded adaptation deliberately doesn't, and the
 * weight-basis rebuild must not touch weight_kg at all (it is formally the
 * immutable onboarding weight). The same separation
 * test:plan-adaptations-separation and test:injury-separation protect.
 */
export async function rebuildAgainstProfile(
  clone: UserProfile,
  exclusions: string[],
  mesocycle: MesocycleWeek[],
  weekNumbers?: number[],
  /**
   * Makes generation REPRODUCIBLE for callers that run it twice and must get
   * the same answer both times — see rebuildForWeightBasis, which previews a
   * rebuild to show the trainee what they would be agreeing to and then runs
   * it again when they agree.
   *
   * Without this the two runs disagree: exercise selection shuffles, so the
   * preview could name a lift ("this would take Barbell Squats from 32.5kg to
   * 67.5kg") that the applied rebuild does not even contain. A flaky assertion
   * in test:weight-basis is what surfaced it — the check passed or failed by
   * luck depending on what Math.random happened to return.
   *
   * Omitted by the injury rebuild, which generates once and applies it, so it
   * has no second run to agree with and keeps its existing variety.
   */
  seedKey?: string,
): Promise<MesocycleWeek[]> {
  const targetWeeks = weekNumbers ? new Set(weekNumbers) : null
  const { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } = await import('./exercise-plan')
  const { seededRngFromKey } = await import('./seeded-random')

  // Both generate* calls are synchronous, so the seeded window never spans an
  // await and cannot leak into unrelated generation happening elsewhere.
  if (seedKey) setRandomSource(seededRngFromKey(seedKey))
  let plan, rebuilt
  try {
    plan = generateExercisePlan(clone, exclusions)
    rebuilt = generateMesocycle(clone, plan.plan)
  } finally {
    if (seedKey) resetRandomSource()
  }

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

export interface RebuildForWeightBasisParams {
  profile: UserProfile
  /**
   * The weight to rebuild from — the rolling-average anchor
   * (getEffectiveTargetWeightKg), not a single raw reading. Overrides
   * profile.weight_kg on the LOCAL clone only; the profile row keeps its
   * onboarding weight, which is formally immutable (see nutrition-targets.ts).
   */
  basisWeightKg: number
  exclusions: string[]
  mesocycle: MesocycleWeek[]
  /**
   * Which weeks may be replaced. The caller passes the live week onward — a
   * past week is history and is never rewritten, however wrong its numbers
   * turned out to be.
   */
  weekNumbers: number[]
}

/**
 * Rebuilds the remaining programme now that we know what this person
 * actually weighs.
 *
 * Backlog item 2b made a declined bodyweight honest: loads come from a
 * deliberately light stand-in and are labelled 'assumed_body'. The cost is
 * that nothing releases it — food targets follow later weigh-ins on their
 * own (computeTargets prefers the latest daily_metrics reading), but the
 * training side reads only profile.weight_kg and generateMesocycle runs once,
 * at onboarding. Measured before this: a 100kg man who declines is prescribed
 * 0.35x his real loads, and weighing in every day for a year would not move
 * them.
 *
 * Deliberately NOT applied on sight. Ashley's ruling was to ask first — see
 * weight-basis-offer.ts, which owns the offer, the diff the trainee is shown,
 * and the permanence of a decline. This function is only the "yes" branch.
 */
export async function rebuildForWeightBasis(params: RebuildForWeightBasisParams): Promise<MesocycleWeek[]> {
  const { profile, basisWeightKg, exclusions, mesocycle, weekNumbers } = params
  const reweighed: UserProfile = { ...profile, weight_kg: basisWeightKg }
  // Seeded on the two things that define this rebuild, so the preview the
  // trainee is shown and the rebuild they get on confirm are the same plan.
  // See rebuildAgainstProfile's seedKey doc comment.
  const seedKey = `weight-basis:${profile.id ?? 'anon'}:${basisWeightKg}`
  return rebuildAgainstProfile(reweighed, exclusions, mesocycle, weekNumbers, seedKey)
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
