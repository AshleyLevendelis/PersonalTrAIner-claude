// ---------------------------------------------------------------------------
// IS THIS A WEIGHT A PERSON COULD ACTUALLY LIFT?
//
// Ashley, from her live profile: "i didn't tell the app i could deadlift 150
// but it claims i did. and 150kg is a lot and someone who hasn't specified or
// shown they can lift that could injure themselves."
//
// Her Exercise tab read Trap Bar Deadlift 152.5 kg, labelled YOU TOLD US,
// ramping to 140 kg x 1. Measured against the app's OWN standards table for
// an 86 kg advanced male: the stated BENCH of 150 kg is 116% of the advanced
// one-rep-max estimate (129 kg) — a working weight above what the app thinks
// a top-tier lifter's single max is — and the stated deadlift-to-bench ratio
// is 1.00x when the lowest ratio anywhere in that table, either sex and every
// experience level, is 1.67x.
//
// The numbers were impossible by the app's own reckoning and nothing looked.
// The only validation on a stated lift was isNumberIn(1, 500). The app has a
// typo guard for what weights someone OWNS and none for what they can LIFT,
// which is the more dangerous of the two — because a stated lift becomes
// load_source 'known_weight', which outranks the estimate, skips the
// starting-light hedge, and skips the calibration week.
//
// Ashley's ruling: ask once, and never skip calibration on it.
//
// BOTH RULES ARE DELIBERATELY NARROW. A false positive here questions
// something true a person told us about their own body, which costs trust in
// a way an over-cautious load does not. Each rule only fires on figures that
// are outside what the app itself will ever prescribe.
// ---------------------------------------------------------------------------
import { STRENGTH_STANDARDS_1RM_PER_BW } from './load-prescription'
import type { UserProfile, TrainingExperience } from './types'

export type StatedLift = 'squat' | 'bench' | 'deadlift'

export interface ImplausibleLift {
  lift: StatedLift
  statedKg: number
  /** Which rule fired — the two read very differently to a person. */
  reason: 'above_ceiling' | 'impossible_pair'
  /** Plain English, for the screen. Never mentions a column or a rule name. */
  message: string
}

/**
 * A deadlift is always meaningfully heavier than a bench. The app's own table
 * puts the ratio at 1.67x at its very lowest (male/advanced) and 2.4x at its
 * highest; this floor sits well under all of them so a genuine bench
 * specialist is never questioned, while 1.00x — two identical numbers, the
 * signature of one value written into two slots — always is.
 */
const MIN_DEADLIFT_TO_BENCH = 1.25

/** The tier a stated weight is measured against — the TOP one, not the user's
 *  own, so only a figure nobody could lift trips the check. */
const CEILING_TIER: TrainingExperience = 'advanced'

function statedLifts(profile: Pick<UserProfile, 'known_squat_kg' | 'known_bench_kg' | 'known_deadlift_kg'>): Partial<Record<StatedLift, number>> {
  const out: Partial<Record<StatedLift, number>> = {}
  if (profile.known_squat_kg != null && profile.known_squat_kg > 0) out.squat = profile.known_squat_kg
  if (profile.known_bench_kg != null && profile.known_bench_kg > 0) out.bench = profile.known_bench_kg
  if (profile.known_deadlift_kg != null && profile.known_deadlift_kg > 0) out.deadlift = profile.known_deadlift_kg
  return out
}

const LIFT_LABEL: Record<StatedLift, string> = { squat: 'squat', bench: 'bench', deadlift: 'deadlift' }

/**
 * Every stated lift the app's own standards say could not be a working weight.
 *
 * Takes the whole profile rather than three numbers on purpose: the ceiling
 * rule needs bodyweight and sex, and a caller assembling those separately is
 * how one surface comes to judge a weight differently from another.
 */
export function implausibleLifts(
  profile: Pick<UserProfile, 'known_squat_kg' | 'known_bench_kg' | 'known_deadlift_kg' | 'weight_kg' | 'gender'>,
  /** True when weight_kg was assumed rather than given — the ceiling rule is
   *  then skipped, because a ratio against a guessed bodyweight proves
   *  nothing and would question a real number on invented evidence. */
  bodyAssumed = false,
): ImplausibleLift[] {
  const stated = statedLifts(profile)
  const found: ImplausibleLift[] = []

  // --- Rule 1: above a ceiling nobody lifts -------------------------------
  const sex = profile.gender === 'female' ? 'female' : 'male'
  const bw = profile.weight_kg
  if (!bodyAssumed && typeof bw === 'number' && bw > 0) {
    for (const lift of ['squat', 'bench', 'deadlift'] as StatedLift[]) {
      const kg = stated[lift]
      if (kg == null) continue
      const ceiling = bw * STRENGTH_STANDARDS_1RM_PER_BW[lift][sex][CEILING_TIER]
      if (kg > ceiling) {
        found.push({
          lift, statedKg: kg, reason: 'above_ceiling',
          message: `A ${LIFT_LABEL[lift]} of ${kg} kg is above what an advanced lifter at ${Math.round(bw)} kg would usually manage for a single rep (about ${Math.round(ceiling)} kg), let alone for working sets.`,
        })
      }
    }
  }

  // --- Rule 2: a pair that cannot both be true ----------------------------
  // No bodyweight needed, so this still protects someone who declined it.
  if (stated.bench != null && stated.deadlift != null
      && stated.deadlift < stated.bench * MIN_DEADLIFT_TO_BENCH
      && !found.some(f => f.lift === 'deadlift')) {
    found.push({
      lift: 'deadlift', statedKg: stated.deadlift, reason: 'impossible_pair',
      message: stated.deadlift === stated.bench
        ? `Your deadlift and bench are both ${stated.deadlift} kg. A deadlift is normally a good deal heavier than a bench, so one of these may have been recorded twice.`
        : `A deadlift of ${stated.deadlift} kg alongside a bench of ${stated.bench} kg is unusual — a deadlift is normally a good deal heavier.`,
    })
  }

  return found
}

/** True when this specific lift should not be trusted to anchor a load. */
export function isImplausible(
  profile: Parameters<typeof implausibleLifts>[0],
  lift: StatedLift,
  bodyAssumed = false,
): boolean {
  return implausibleLifts(profile, bodyAssumed).some(f => f.lift === lift)
}
