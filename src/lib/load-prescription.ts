import type { TrainingExperience, UserProfile } from './types'
import type { ExerciseEntry } from './exercise-db'

// ---------------------------------------------------------------------------
// LOAD PRESCRIPTION
// ---------------------------------------------------------------------------
// An RPE target tells someone how hard a set should feel. It does not tell a
// beginner what to put on the bar, and "just pick something and adjust" is the
// single most common reason people bounce off a program in week one.
//
// This module produces a STARTING ESTIMATE, deliberately conservative. It is
// not a 1RM calculator and must never be presented as one — we have no lifting
// history for a new user, only bodyweight, sex, age and self-reported
// experience. The honest framing is "start here and let the RPE target correct
// you", and every output carries that framing with it.
//
// Once real set logs exist, history should override this entirely.

export interface LoadPrescription {
  /** null when the movement is not externally loaded (push-ups, planks). */
  starting_weight_kg: number | null
  display: string
  basis: string
  confidence: 'estimated' | 'from_history'
}

// ---------------------------------------------------------------------------
// Strength standards
// ---------------------------------------------------------------------------
// Multiples of bodyweight for a working set in the 8-10 rep range, drawn from
// commonly used training standards. These are population averages: individual
// variation is enormous, which is exactly why the RPE target does the real
// work and this only sets a starting point.

const BODYWEIGHT_MULTIPLIERS: Record<string, Record<TrainingExperience, number>> = {
  // Lower body pressing and hinging support the most load.
  squat: { beginner: 0.45, novice: 0.75, intermediate: 1.05, advanced: 1.4 },
  deadlift: { beginner: 0.55, novice: 0.9, intermediate: 1.3, advanced: 1.75 },
  hinge_accessory: { beginner: 0.35, novice: 0.6, intermediate: 0.85, advanced: 1.15 },
  leg_press: { beginner: 0.9, novice: 1.5, intermediate: 2.1, advanced: 2.8 },
  // Upper body pressing.
  bench: { beginner: 0.35, novice: 0.6, intermediate: 0.85, advanced: 1.15 },
  overhead: { beginner: 0.22, novice: 0.4, intermediate: 0.55, advanced: 0.75 },
  // Pulling.
  row: { beginner: 0.3, novice: 0.55, intermediate: 0.75, advanced: 1.0 },
  pulldown: { beginner: 0.35, novice: 0.6, intermediate: 0.8, advanced: 1.05 },
  // Isolation work is a small fraction of bodyweight.
  isolation_upper: { beginner: 0.08, novice: 0.13, intermediate: 0.18, advanced: 0.24 },
  isolation_lower: { beginner: 0.15, novice: 0.25, intermediate: 0.35, advanced: 0.5 },
  carry: { beginner: 0.25, novice: 0.4, intermediate: 0.6, advanced: 0.85 },
}

/** Maps an exercise onto a standards category. */
function categorize(entry: ExerciseEntry): string | null {
  const n = entry.name.toLowerCase()

  // Isolation work is checked FIRST, before any pattern matching. A Cable Fly
  // and a Pec Deck share the `horizontal_push` pattern with the bench press,
  // and falling through to the bench standard prescribed ~67kg for a fly —
  // a load that would put a shoulder at real risk. Mechanics tier is the
  // reliable signal here, not movement pattern.
  if (entry.mechanics_tier === 'tier3_isolation' || n.includes('fly') || n.includes('pec deck')) {
    const lower = ['isolation_quad', 'isolation_hamstring', 'isolation_calf', 'knee_dominant', 'hip_hinge']
    return lower.includes(entry.movement_pattern) ? 'isolation_lower' : 'isolation_upper'
  }

  if (n.includes('leg press') || n.includes('hack squat')) return 'leg_press'
  if (n.includes('deadlift')) return 'deadlift'
  if (n.includes('squat')) return 'squat'
  if (n.includes('good morning') || n.includes('romanian') || n.includes('swing')) return 'hinge_accessory'
  if (n.includes('overhead press') || n.includes('shoulder press') || n.includes('arnold')) return 'overhead'
  if (n.includes('bench') || n.includes('chest press') || n.includes('machine press')) return 'bench'
  if (n.includes('pulldown')) return 'pulldown'
  if (n.includes('row')) return 'row'
  if (n.includes('carry') || n.includes('farmer')) return 'carry'

  switch (entry.movement_pattern) {
    case 'horizontal_push':
    case 'vertical_push':
      return 'bench'
    case 'horizontal_pull':
    case 'vertical_pull':
      return 'row'
    case 'hip_hinge':
      return 'hinge_accessory'
    case 'knee_dominant':
    case 'single_leg':
      return 'squat'
    case 'carry':
      return 'carry'
    case 'isolation_bicep':
    case 'isolation_tricep':
    case 'isolation_shoulder':
      return 'isolation_upper'
    case 'isolation_quad':
    case 'isolation_hamstring':
    case 'isolation_calf':
      return 'isolation_lower'
    default:
      return null
  }
}

/**
 * Women's absolute upper-body strength relative to bodyweight is meaningfully
 * lower than men's, while lower-body differences are much smaller. Applying a
 * single multiplier to both sexes systematically over-prescribes upper-body
 * starting loads for women. Adjusting is more accurate and, more importantly,
 * safer than not adjusting.
 */
function sexAdjustment(category: string, gender: 'male' | 'female'): number {
  if (gender === 'male') return 1
  const upperBody = ['bench', 'overhead', 'row', 'pulldown', 'isolation_upper']
  return upperBody.includes(category) ? 0.6 : 0.75
}

/**
 * Strength declines gradually past roughly 40. This is a gentle taper, not a
 * cliff — a well-trained 55-year-old will out-lift most 25-year-olds, and the
 * RPE target will correct the estimate either way.
 */
function ageAdjustment(age: number): number {
  if (age <= 40) return 1
  return Math.max(0.7, 1 - (age - 40) * 0.007)
}

type LoadingMode = 'barbell' | 'ez_bar' | 'dumbbell' | 'stack'

function loadingMode(entry: ExerciseEntry): LoadingMode {
  if (entry.equipment.some(e => e === 'dumbbell' || e === 'dumbbells' || e === 'kettlebell')) return 'dumbbell'
  // An EZ bar is roughly 10kg, not 20kg. Flooring it at bar weight like an
  // Olympic bar prescribed 20kg skull crushers to every user regardless of
  // size — too heavy for a lighter or newer lifter on an elbow-sensitive lift.
  if (entry.equipment.some(e => e === 'EZ bar')) return 'ez_bar'
  if (entry.equipment.some(e => e === 'barbell' || e === 'trap bar' || e === 't-bar')) return 'barbell'
  return 'stack'
}

/** Round to something actually loadable rather than a number like 43.7kg. */
function roundToPlate(kg: number, mode: LoadingMode): number {
  switch (mode) {
    case 'dumbbell':
      // Dumbbells commonly step in 2kg increments at the light end.
      return Math.max(2, Math.round(kg / 2) * 2)
    case 'barbell':
      // 20kg bar plus plate pairs. Below bar weight, prescribe the bar itself.
      return kg <= 20 ? 20 : Math.round(kg / 2.5) * 2.5
    case 'ez_bar':
      return kg <= 10 ? 10 : Math.round(kg / 2.5) * 2.5
    case 'stack':
      // Cable and machine stacks have no bar to floor against — applying the
      // barbell's 20kg minimum here inflated light isolation work.
      return Math.max(5, Math.round(kg / 2.5) * 2.5)
  }
}

// Equipment that carries a selectable external load in kilograms. Note the
// exclusions: an assisted pull-up machine REDUCES load rather than adding it,
// resistance bands have no meaningful kg value, and cardio machines are not
// loaded at all. Matching on a loose substring like 'machine' would wrongly
// sweep all of those in.
const LOADED_EQUIPMENT = new Set([
  'barbell', 'dumbbell', 'dumbbells', 'EZ bar', 'kettlebell', 'trap bar',
  't-bar', 'cable machine', 'machine', 'leg press machine',
  'hack squat machine', 'farmer handles', 'medicine ball',
])

export function isExternallyLoaded(entry: ExerciseEntry): boolean {
  return entry.equipment.some(e => LOADED_EQUIPMENT.has(e))
}

export function prescribeLoad(
  entry: ExerciseEntry,
  profile: UserProfile,
): LoadPrescription {
  // Bodyweight movements: the load is the person. Prescribing kilos here would
  // be nonsense, so the progression lever is reps and leverage instead.
  if (!isExternallyLoaded(entry)) {
    return {
      starting_weight_kg: null,
      display: 'Bodyweight',
      basis: 'Progress by adding reps or slowing the tempo before adding load.',
      confidence: 'estimated',
    }
  }

  const category = categorize(entry)
  if (!category) {
    return {
      starting_weight_kg: null,
      display: 'Choose by feel',
      basis: 'Pick a load that matches the target effort and note what you used.',
      confidence: 'estimated',
    }
  }

  const experience = profile.training_experience || 'novice'
  const bodyweight = profile.weight_kg || 75

  let estimate =
    bodyweight *
    BODYWEIGHT_MULTIPLIERS[category][experience] *
    sexAdjustment(category, profile.gender) *
    ageAdjustment(profile.age || 30)

  const mode = loadingMode(entry)
  const isDumbbell = mode === 'dumbbell'

  // A dumbbell prescription is per hand, not the total the standard describes.
  if (isDumbbell) estimate = estimate / 2

  const rounded = roundToPlate(estimate, mode)

  return {
    starting_weight_kg: rounded,
    display: isDumbbell ? `~${rounded}kg per hand` : `~${rounded}kg`,
    basis:
      'Starting estimate from your bodyweight and experience — not a tested max. ' +
      'Let the effort target correct it: too easy, add load next set; too hard, drop it.',
    confidence: 'estimated',
  }
}
