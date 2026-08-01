import type { TrainingExperience } from './types'

// ---------------------------------------------------------------------------
// SKILL DEMAND
// ---------------------------------------------------------------------------
// How much technical competence / body control an exercise requires before it
// can be loaded safely and productively. This is deliberately separate from
// `joint_stress` (how much the joints are loaded) and `mechanics_tier` (how
// much total muscle mass is involved) — a Leg Press is a tier-1 compound with
// almost no skill demand, while a Nordic Curl is an accessory that most
// trained lifters still cannot complete a single clean rep of.
//
// Anything not listed here defaults to 'low' — machines, cables, dumbbell
// isolation work, and steady-state cardio need no gatekeeping.

export type SkillDemand = 'low' | 'moderate' | 'high'

const SKILL_DEMAND: Record<string, SkillDemand> = {
  // High — significant technique, strength prerequisite, or injury risk when
  // performed by someone without a training base.
  'Nordic Hamstring Curl': 'high',
  'Ab Wheel Rollout': 'high',
  'Hanging Leg Raises': 'high',
  'Pull-Ups': 'high',
  'Chest Dips': 'high',
  'Plyo Push-Ups': 'high',
  'Good Mornings': 'high',
  'Kettlebell Swing (Heavy)': 'high',
  'Box Jumps': 'high',
  'Broad Jumps': 'high',
  'Snatch-Grip Deadlift': 'high',

  // Moderate — teachable in a session or two, but a genuine coaching point.
  // A beginner can do these, they just need lighter loads and cueing.
  'Deadlifts': 'moderate',
  'Barbell Squats': 'moderate',
  'Barbell Rows': 'moderate',
  'Overhead Press': 'moderate',
  'Romanian Deadlifts': 'moderate',
  'Trap Bar Deadlift': 'moderate',
  'Kettlebell Swings': 'moderate',
  'Bulgarian Split Squats': 'moderate',
  'Walking Lunges': 'moderate',
  'Overhead Carry': 'moderate',
  'Skull Crushers': 'moderate',
  'Burpees': 'moderate',
  'Arnold Press': 'moderate',
  'Medicine Ball Slams': 'moderate',
  'Battle Ropes': 'moderate',
  'Tricep Dips': 'moderate',
  'Pallof Press': 'moderate',
  'Cable Woodchops': 'moderate',
  'Hack Squat': 'moderate',
}

export function getSkillDemand(exerciseName: string): SkillDemand {
  return SKILL_DEMAND[exerciseName] ?? 'low'
}

const SKILL_RANK: Record<SkillDemand, number> = { low: 0, moderate: 1, high: 2 }

export function isSkillAppropriate(
  exerciseName: string,
  experience: TrainingExperience,
): boolean {
  const demand = getSkillDemand(exerciseName)
  const ceiling = EXPERIENCE_CONFIGS[experience].max_skill_demand
  return SKILL_RANK[demand] <= SKILL_RANK[ceiling]
}

// ---------------------------------------------------------------------------
// EXPERIENCE CONFIGURATION
// ---------------------------------------------------------------------------
// What actually changes between a first-week trainee and someone with years
// under the bar. Four levers, each reflecting standard coaching practice:
//
//  1. Skill ceiling      — what they are ready to attempt at all
//  2. Volume             — beginners adapt to (and recover from) far less work
//  3. Intensity ceiling  — beginners should not be grinding near-maximal sets
//  4. Variety            — beginners need repetition to learn a movement;
//                          advanced lifters need variation to keep adapting

export interface ExperienceConfig {
  label: string
  max_skill_demand: SkillDemand
  /** Multiplier applied to the style config's prescribed set count. */
  sets_multiplier: number
  /** Added to (or removed from) the per-session exercise count. */
  exercise_count_adjust: number
  /** Rep floor — keeps beginners out of true low-rep max-effort territory. */
  min_reps: number
  /**
   * Target RPE for working sets. Beginners leave more in the tank because
   * technique degrades before the muscle does.
   */
  target_rpe: string
  /** Plain-English load guidance shown alongside each prescription. */
  load_guidance: string
  /**
   * How aggressively to add load week to week. Beginners can add weight
   * almost every session; advanced lifters progress in much smaller steps.
   */
  weekly_progression_percent: number
  /**
   * Whether to deliberately repeat movements across the week so the trainee
   * accumulates practice reps on them.
   */
  repeat_movements_for_practice: boolean
}

export const EXPERIENCE_CONFIGS: Record<TrainingExperience, ExperienceConfig> = {
  beginner: {
    label: 'Beginner — new to structured training',
    max_skill_demand: 'moderate',
    sets_multiplier: 0.7,
    exercise_count_adjust: -1,
    min_reps: 8,
    target_rpe: 'RPE 6-7',
    load_guidance:
      'Pick a weight you could stop 3-4 reps short of failure. If your form changes on the last rep, the weight is too heavy.',
    weekly_progression_percent: 5,
    repeat_movements_for_practice: true,
  },
  novice: {
    label: 'Novice — 6+ months of consistent training',
    max_skill_demand: 'high',
    sets_multiplier: 0.85,
    exercise_count_adjust: 0,
    min_reps: 6,
    target_rpe: 'RPE 7',
    load_guidance:
      'Pick a weight you could stop 3 reps short of failure. Add load once you hit the top of the rep range on every set.',
    weekly_progression_percent: 4,
    repeat_movements_for_practice: true,
  },
  intermediate: {
    label: 'Intermediate — 2+ years, know your numbers',
    max_skill_demand: 'high',
    sets_multiplier: 1.0,
    exercise_count_adjust: 0,
    min_reps: 4,
    target_rpe: 'RPE 7-8',
    load_guidance:
      'Work at roughly 2 reps shy of failure on main lifts. Accessories can be taken closer to failure.',
    weekly_progression_percent: 2.5,
    repeat_movements_for_practice: false,
  },
  advanced: {
    label: 'Advanced — years of training, near your ceiling',
    max_skill_demand: 'high',
    sets_multiplier: 1.15,
    exercise_count_adjust: 1,
    min_reps: 3,
    target_rpe: 'RPE 8-9',
    load_guidance:
      'Main lifts at 1-2 reps in reserve. Track your top sets — progress now comes from small, deliberate jumps.',
    weekly_progression_percent: 1.5,
    repeat_movements_for_practice: false,
  },
}

export function getExperienceConfig(
  experience: TrainingExperience | undefined,
): ExperienceConfig {
  return EXPERIENCE_CONFIGS[experience ?? 'novice']
}

/**
 * Raises the bottom of a rep range to the experience floor, leaving the top
 * alone. '4-6' at a floor of 8 becomes '8-10'; '10-12' is untouched.
 */
export function applyRepFloor(reps: string, floor: number): string {
  const range = reps.match(/^(\d+)\s*-\s*(\d+)$/)
  if (range) {
    const low = Number(range[1])
    const high = Number(range[2])
    if (low >= floor) return reps
    const spread = high - low
    return `${floor}-${floor + spread}`
  }

  const single = reps.match(/^(\d+)$/)
  if (single && Number(single[1]) < floor) return String(floor)

  // Anything else ('AMRAP', '30s', '8 each side') passes through untouched.
  return reps
}
