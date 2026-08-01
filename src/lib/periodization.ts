import type { FitnessGoal, TrainingExperience, WorkoutDay, Exercise } from './types'
import { EXERCISE_DATABASE, getMovementFamily, type ExerciseEntry } from './exercise-db'
import { getExperienceConfig, isSkillAppropriate } from './experience-config'

// ---------------------------------------------------------------------------
// PERIODIZATION
// ---------------------------------------------------------------------------
// Training organised into distinct phases, each with its own adaptation target,
// rather than one repeated 4-week block.
//
// The central design rule: MOVEMENT PATTERNS persist across the whole
// macrocycle, but the specific VARIATION rotates between blocks. Horizontal
// push appears in every block — as Barbell Bench, then Incline Dumbbell, then
// Machine Press. That keeps progress trackable at the pattern level (the point
// of progressive overload) while changing the stimulus enough to avoid both
// physical plateau and the boredom that makes people quit.
//
// Rotating the pattern itself would destroy progression tracking. Rotating
// nothing at all is what Ashley correctly identified as monotonous. The
// variation is the right layer to change.

export type TrainingPhase =
  | 'anatomical_adaptation'
  | 'hypertrophy'
  | 'strength'
  | 'power'
  | 'metabolic'

export interface PhaseConfig {
  phase: TrainingPhase
  label: string
  /** What this block is actually trying to achieve, shown to the user. */
  focus: string
  sets_multiplier: number
  /** Shift applied to the base rep range: negative = heavier/lower reps. */
  rep_shift: number
  rest_adjust_seconds: number
  /** Upper bound before the experience cap is applied. */
  target_rpe: number
  coach_note: string
}

const PHASE_CONFIGS: Record<TrainingPhase, PhaseConfig> = {
  anatomical_adaptation: {
    phase: 'anatomical_adaptation',
    label: 'Anatomical Adaptation',
    focus: 'Build a base — connective tissue, movement quality, work capacity',
    sets_multiplier: 0.8,
    rep_shift: 3,
    rest_adjust_seconds: -15,
    target_rpe: 6.5,
    coach_note:
      'Higher reps, lighter loads, shorter rest. This phase prepares tendons and ligaments, which adapt more slowly than muscle. Do not rush it.',
  },
  hypertrophy: {
    phase: 'hypertrophy',
    label: 'Hypertrophy',
    focus: 'Build muscle — moderate loads, higher volume, controlled tempo',
    sets_multiplier: 1.1,
    rep_shift: 0,
    rest_adjust_seconds: 0,
    target_rpe: 8,
    coach_note:
      'The volume phase. Take most sets close to failure but keep form clean — quality reps drive growth, not grinding.',
  },
  strength: {
    phase: 'strength',
    label: 'Maximal Strength',
    focus: 'Move heavier loads — lower reps, longer rest, high intensity',
    sets_multiplier: 1.0,
    rep_shift: -3,
    rest_adjust_seconds: 45,
    target_rpe: 8.5,
    coach_note:
      'Heavier and lower rep. Rest fully between sets — cutting rest here undermines the whole point of the phase.',
  },
  power: {
    phase: 'power',
    label: 'Power & Expression',
    focus: 'Express strength quickly — explosive intent, full recovery',
    sets_multiplier: 0.85,
    rep_shift: -4,
    rest_adjust_seconds: 60,
    target_rpe: 7.5,
    coach_note:
      'Move the weight fast. Stop the set the moment bar speed drops — this phase is about speed, not fatigue.',
  },
  metabolic: {
    phase: 'metabolic',
    label: 'Metabolic Conditioning',
    focus: 'Work capacity and conditioning — short rest, sustained output',
    sets_multiplier: 1.0,
    rep_shift: 4,
    rest_adjust_seconds: -20,
    target_rpe: 7.5,
    coach_note:
      'Short rest is the stimulus here. Drop the load if you need to in order to keep the pace.',
  },
}

// ---------------------------------------------------------------------------
// Phase sequencing
// ---------------------------------------------------------------------------
// Order matters. Every sequence opens with anatomical adaptation, because
// loading heavy on unprepared connective tissue is how people get hurt. Power
// work only appears once there is strength worth expressing, so it never leads.

const PHASE_SEQUENCES: Record<FitnessGoal, TrainingPhase[]> = {
  hypertrophy: ['anatomical_adaptation', 'hypertrophy', 'strength', 'hypertrophy'],
  functional: ['anatomical_adaptation', 'hypertrophy', 'strength', 'power'],
  fat_loss: ['anatomical_adaptation', 'hypertrophy', 'metabolic', 'hypertrophy'],
  conditioning: ['anatomical_adaptation', 'metabolic', 'hypertrophy', 'metabolic'],
}

/**
 * Beginners do not need — and should not get — a strength or power block in
 * their first few months. They are still adding load every session from
 * technique alone, and near-maximal work is where form breaks down. So their
 * sequence stays in the base-building and hypertrophy range for longer.
 */
export function getPhaseSequence(
  goal: FitnessGoal,
  experience: TrainingExperience,
): TrainingPhase[] {
  const base = PHASE_SEQUENCES[goal] ?? PHASE_SEQUENCES.hypertrophy

  if (experience === 'beginner') {
    // Mapping strength and power onto hypertrophy produced three consecutive
    // blocks all labelled "Hypertrophy" — technically safe, but monotonous in
    // exactly the way that makes people stop using an app. Beginners get their
    // own sequence instead: still no maximal or explosive work, but four
    // distinct phases with different stimulus and different names.
    return ['anatomical_adaptation', 'hypertrophy', 'metabolic', 'hypertrophy']
  }
  if (experience === 'novice') {
    // Novices can handle a strength block, but not true power work yet.
    return base.map(p => (p === 'power' ? 'strength' : p))
  }
  return base
}

// ---------------------------------------------------------------------------
// Intensity, capped by experience
// ---------------------------------------------------------------------------

const EXPERIENCE_RPE_CEILING: Record<TrainingExperience, number> = {
  beginner: 7,
  novice: 8,
  intermediate: 9,
  advanced: 9.5,
}

/**
 * The phase says how hard this block should be; the trainee's experience says
 * how hard they should ever go. The lower of the two wins.
 *
 * This exists because the previous mesocycle hard-coded "RPE 8-9 — Peak
 * overload week" for everyone, which silently overrode the beginner cap and
 * told a first-time lifter to grind near failure.
 */
export function resolveTargetRpe(
  phase: TrainingPhase,
  experience: TrainingExperience,
  weekInBlock: number,
  isDeload: boolean,
): string {
  if (isDeload) return 'RPE 5-6 — deload, move well and recover'

  const ceiling = EXPERIENCE_RPE_CEILING[experience]
  // Ramp within the block: week 1 easier, building to the phase target.
  const ramp = [-1, -0.5, 0][Math.min(weekInBlock - 1, 2)]
  const target = Math.min(PHASE_CONFIGS[phase].target_rpe + ramp, ceiling)

  // Whole numbers only. "RPE 5-5.5" is not a cue anyone can act on.
  const high = Math.round(target)
  const low = Math.max(5, high - 1)
  return `RPE ${low}-${high}`
}

// ---------------------------------------------------------------------------
// Variation rotation
// ---------------------------------------------------------------------------

/**
 * Swaps an exercise for a different variation of the SAME movement pattern.
 *
 * Constraints that must survive the swap: the replacement has to be in the
 * available pool (so equipment and injury filtering still hold) and has to be
 * skill-appropriate. A rotation that hands a beginner a Nordic curl in block 3
 * would undo the skill gating entirely.
 */
/**
 * Variations that exist as easier on-ramps. They are the right answer for
 * someone building up to the full movement and the wrong answer for someone
 * who has already outgrown them.
 */
const REGRESSION_VARIATIONS = new Set([
  'Pull-Ups (Assisted)',
  'Goblet Squats',
  'Push-Ups',
  'Loaded Backpack Walk',
  'Farmer Squat Hold (Isometric Carry)',
])

function isRegressionFor(name: string, experience: TrainingExperience): boolean {
  if (experience === 'beginner' || experience === 'novice') return false
  return REGRESSION_VARIATIONS.has(name)
}

export function rotateVariation(
  exerciseName: string,
  blockIndex: number,
  pool: ExerciseEntry[],
  experience: TrainingExperience,
): string {
  const current = EXERCISE_DATABASE.find(
    e => e.name.toLowerCase() === exerciseName.toLowerCase()
  )
  if (!current) return exerciseName

  const variations = pool
    .filter(
      e =>
        e.substitution_group === current.substitution_group &&
        e.movement_pattern === current.movement_pattern &&
        isSkillAppropriate(e.name, experience) &&
        // Rotation must not become a downgrade. Without this, an advanced
        // lifter got rotated from Barbell Squats to Goblet Squats and from
        // Pull-Ups to Pull-Ups (Assisted) — variations that cannot be loaded
        // heavily enough to drive adaptation at that level.
        e.mechanics_tier === current.mechanics_tier &&
        !isRegressionFor(e.name, experience)
    )
    // Stable ordering so rotation is deterministic rather than random —
    // the user should be able to see the same plan twice.
    .sort((a, b) => a.name.localeCompare(b.name))

  if (variations.length <= 1) return current.name

  const currentIndex = variations.findIndex(v => v.name === current.name)
  const start = currentIndex >= 0 ? currentIndex : 0
  return variations[(start + blockIndex) % variations.length].name
}

// ---------------------------------------------------------------------------
// Block assembly
// ---------------------------------------------------------------------------

export interface PeriodizedWeek {
  week_number: number
  block_number: number
  week_in_block: number
  phase: TrainingPhase
  phase_label: string
  phase_focus: string
  label: string
  is_deload: boolean
  coach_note: string
  days: WorkoutDay[]
}

export function getPhaseConfig(phase: TrainingPhase): PhaseConfig {
  return PHASE_CONFIGS[phase]
}

/** Shifts a rep range up or down while keeping its spread. */
export function shiftReps(reps: string, delta: number, minReps: number): string {
  const range = reps.match(/^(\d+)\s*-\s*(\d+)$/)
  if (range) {
    const low = Math.max(minReps, Number(range[1]) + delta)
    const spread = Number(range[2]) - Number(range[1])
    return `${low}-${low + spread}`
  }
  const single = reps.match(/^(\d+)$/)
  if (single) return String(Math.max(minReps, Number(single[1]) + delta))
  // Time-based ('30-45s') and distance prescriptions pass through untouched.
  return reps
}

export function adjustRest(rest: string, deltaSeconds: number): string {
  const m = rest.match(/^(\d+)s$/)
  if (!m) return rest
  return `${Math.max(20, Number(m[1]) + deltaSeconds)}s`
}

export function describeMacrocycle(
  sequence: TrainingPhase[],
  experience: TrainingExperience,
): string {
  const names = sequence.map(p => PHASE_CONFIGS[p].label)
  const weeks = sequence.length * 4
  return (
    `${weeks}-week plan across ${sequence.length} blocks: ${names.join(' → ')}. ` +
    `Movement patterns stay consistent so progress is measurable; ` +
    `exercise variations rotate each block to keep the stimulus fresh. ` +
    `Intensity is capped at what suits a ${experience} trainee.`
  )
}

/** Exported so the mesocycle can rotate within the same constrained pool. */
export { EXPERIENCE_RPE_CEILING }
