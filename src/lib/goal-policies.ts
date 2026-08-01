import type { FitnessGoal } from './types'
import type { TrainingPhase } from './periodization'

// ---------------------------------------------------------------------------
// GOAL POLICIES
// ---------------------------------------------------------------------------
// Every fitness_goal shares the same generation engine — same 5-stage
// filter, same phase sequencing, same double-progression system — but should
// come out the other end feeling like a genuinely different program, not the
// same plan with a different label on it. This is the single place those
// differences are declared, so "why does fat_loss look basically identical
// to hypertrophy" has one file to check instead of a dozen scattered
// `if (goal === 'fat_loss')` branches.
//
// Mapping note: this codebase's FitnessGoal enum has exactly four values —
// fat_loss, hypertrophy, functional, conditioning — which line up with the
// four categories this policy set was designed around: fat loss,
// hypertrophy/muscle gain, maintain/general health, and endurance/
// conditioning, respectively. 'functional' is used here as the maintain/
// general-health bucket; there is no separate "endurance" goal distinct from
// 'conditioning' in this app today.

export type ProgressionEmphasis = 'load' | 'reps' | 'maintain'

export interface GoalPolicy {
  goal: FitnessGoal
  label: string
  /**
   * Multiplies every working set count on top of the existing per-phase
   * sets_multiplier in generateMesocycle(). 1.0 is the hypertrophy baseline;
   * everything else is relative to it.
   */
  setVolumeMultiplier: number
  /** Target conditioning sessions per week (dedicated day, post-session, or independent block — see assignConditioningNotes). Fractional values round at the call site. */
  conditioningFrequencyPerWeek: number
  /**
   * How many weeks a MAIN lift holds its variation before rotating. Declared
   * for completeness/documentation, but NOT currently wired to a behavior
   * difference: Part 2 established "main lifts rotate only at block
   * boundaries" as an unconditional rule, because the whole double-
   * progression system depends on a main lift staying put long enough to
   * track a baseline against. Every policy below is 4 (one full block) for
   * that reason — this field exists so a future change to that rule has a
   * declared home, not so it can be tuned today.
   */
  mainRotationWeeks: number
  /** How many weeks an ACCESSORY holds its variation before rotating within a block (2 = the Part 2 default). */
  accessoryRotationWeeks: number
  /** Training phases this goal may ever enter. Phases outside this list get remapped to the nearest allowed one before intensity/load are computed. */
  allowedPhases: TrainingPhase[]
  /**
   * What double progression ramps within a block for externally loaded
   * exercises: 'load' climbs the weight (the Part 1 default), 'reps' holds
   * the weight and climbs the rep target instead, 'maintain' does neither —
   * flat weight, flat reps, RPE alone drives week-to-week feel. True
   * bodyweight/uncategorizable movements always ramp reps regardless of this
   * setting, since there's no weight to ramp in the first place.
   */
  progressionEmphasis: ProgressionEmphasis
  coachNote: string
}

const HYPERTROPHY_POLICY: GoalPolicy = {
  goal: 'hypertrophy',
  label: 'Muscle Growth',
  setVolumeMultiplier: 1.0,
  conditioningFrequencyPerWeek: 1,
  mainRotationWeeks: 4,
  accessoryRotationWeeks: 2,
  allowedPhases: ['anatomical_adaptation', 'hypertrophy', 'strength', 'power'],
  progressionEmphasis: 'load',
  coachNote: 'Volume drives growth here — the program is built around moderate-rep working sets taken close to failure, with load climbing week to week within each block.',
}

const FAT_LOSS_POLICY: GoalPolicy = {
  goal: 'fat_loss',
  label: 'Fat Loss',
  // ~10-15% below the hypertrophy baseline — a calorie deficit blunts
  // recovery, so full hypertrophy-level volume isn't recoverable here.
  setVolumeMultiplier: 0.875,
  conditioningFrequencyPerWeek: 2.5,
  mainRotationWeeks: 4,
  accessoryRotationWeeks: 2,
  allowedPhases: ['anatomical_adaptation', 'hypertrophy', 'strength', 'metabolic'],
  // Deliberately 'load', not 'reps' or 'maintain' — the point is to keep
  // pushing the main lifts so muscle has a reason to stick around in a
  // deficit, not to turn the session into circuits.
  progressionEmphasis: 'load',
  coachNote:
    "Diet drives the fat loss here, not the workout — this program is built to protect the muscle you already have while you're in a deficit. Weights stay real weights and progression keeps climbing; conditioning is appended on top, never substituted for lifting.",
}

const CONDITIONING_POLICY: GoalPolicy = {
  goal: 'conditioning',
  label: 'Endurance / Conditioning',
  setVolumeMultiplier: 0.85,
  conditioningFrequencyPerWeek: 4,
  mainRotationWeeks: 4,
  accessoryRotationWeeks: 2,
  // No strength or power block — capped at hypertrophy/metabolic work.
  allowedPhases: ['anatomical_adaptation', 'hypertrophy', 'metabolic'],
  progressionEmphasis: 'reps',
  coachNote: 'Lifting supports the engine work here, not the other way around — two to three full-body sessions keep you strong enough to train hard, while dedicated conditioning is the main driver of this goal.',
}

const FUNCTIONAL_POLICY: GoalPolicy = {
  goal: 'functional',
  label: 'General Health / Maintenance',
  setVolumeMultiplier: 0.9,
  conditioningFrequencyPerWeek: 1.5,
  mainRotationWeeks: 4,
  // Faster accessory rotation than every other goal — variety over strict
  // overload. (Main lifts still hold for the block; see mainRotationWeeks.)
  accessoryRotationWeeks: 1,
  allowedPhases: ['anatomical_adaptation', 'hypertrophy', 'strength', 'power'],
  progressionEmphasis: 'maintain',
  coachNote: 'This program favors variety and movement quality over chasing a number on the bar — exercises rotate faster, and the aim is consistent, sustainable training rather than maximal overload.',
}

export const GOAL_POLICIES: Record<FitnessGoal, GoalPolicy> = {
  hypertrophy: HYPERTROPHY_POLICY,
  fat_loss: FAT_LOSS_POLICY,
  conditioning: CONDITIONING_POLICY,
  functional: FUNCTIONAL_POLICY,
}

export function getGoalPolicy(goal: FitnessGoal): GoalPolicy {
  return GOAL_POLICIES[goal] ?? HYPERTROPHY_POLICY
}

// Fallback order when a phase the base sequence wants to use isn't in a
// goal's allowedPhases — walk down in intensity until something's allowed.
// Never walks UP (a restricted goal should never be handed a harder phase
// than the one it lost), so anatomical_adaptation is always the floor.
const PHASE_FALLBACK: Record<TrainingPhase, TrainingPhase[]> = {
  power: ['strength', 'hypertrophy', 'anatomical_adaptation'],
  strength: ['hypertrophy', 'anatomical_adaptation'],
  metabolic: ['hypertrophy', 'anatomical_adaptation'],
  hypertrophy: ['anatomical_adaptation'],
  anatomical_adaptation: [],
}

/**
 * Restricts a phase sequence (already adjusted for experience by
 * getPhaseSequence) to a goal's allowed phases — e.g. conditioning never
 * sees 'strength' or 'power' regardless of how experienced the trainee is.
 */
export function restrictPhaseSequence(sequence: TrainingPhase[], allowedPhases: TrainingPhase[]): TrainingPhase[] {
  const allowed = new Set(allowedPhases)
  return sequence.map(phase => {
    if (allowed.has(phase)) return phase
    const fallback = PHASE_FALLBACK[phase].find(p => allowed.has(p))
    return fallback ?? 'anatomical_adaptation'
  })
}
