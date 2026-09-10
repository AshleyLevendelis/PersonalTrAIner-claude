// ---------------------------------------------------------------------------
// IS THIS A WEIGHT THIS PERSON ACTUALLY JUST LIFTED?
//
// The sibling of lift-plausibility.ts, one step later in the app's life. That
// module guards what someone SAYS they can lift at onboarding; this one guards
// what they LOG, set by set, for the rest of the programme.
//
// Ashley, 8 Sep 2026: "logging 500kg when the equipment ceiling is 24kg"
// should not silently become data. Until now the set logger had no view on
// the number at all — the only bound anywhere on the path was SetGrid's
// 9999.99, which is the database column's width, not a claim about lifting.
// A fat-fingered 240 in the weight box was stored, fed the progression
// engine, moved every future prescription for that lift, and reappeared as a
// personal record.
//
// ASHLEY'S RULING, 8 Sep 2026, chosen from four options: "warn, second tap
// logs it". So there are two verdicts, not one:
//
//   impossible    — past anything a person moves for a set. Refused outright,
//                   at the STORE, so no writer can route around it.
//   above_ceiling — past what the app has reason to believe they can load.
//                   Said out loud, in the row, and logged anyway if they tap
//                   again. The app is not the authority on what is in
//                   somebody's garage; it is only the thing that noticed.
//
// The warning rule is DELIBERATELY NARROW, for lift-plausibility's own
// reason: a false positive here argues with someone about a set they just
// did, which costs more trust than a missed typo costs data. It fires only
// past 1.5x a ceiling that is itself the most the app would ever prescribe.
//
// Pure. No I/O, no store reads — the caller passes the catalogue entry and
// the profile in.
// ---------------------------------------------------------------------------

import {
  categorize,
  effectiveLoadingCeilingKg,
  isExternallyLoaded,
  labelModeForEntry,
  statedCeilingKg,
  type LoadLabelMode,
} from './load-prescription'
import type { ExerciseEntry } from './exercise-db'
import type { UserProfile } from './types'

/**
 * The heaviest single set the app will store, in the units the row is logged
 * in (per hand for a dumbbell pair, total otherwise).
 *
 * 600 rather than plate-math's MAX_BARBELL_TARGET_KG of 500, and the gap is
 * the point: 500 is "past the heaviest raw barbell lift ever performed",
 * which is the right bound for a BARBELL and the wrong one for the catalogue.
 * A plate-loaded leg press sled is the one implement here whose honest total
 * runs past a world-record deadlift — LEG_PRESS_CEILING_KG is already 400 —
 * and refusing a strong lifter's real leg press to catch a typo would be the
 * false positive this file exists to avoid. Nothing between 500 and 600 is a
 * number anyone types on purpose except on that machine.
 *
 * Same shape and same job as MAX_PLAUSIBLE_CARDIO_MINUTES: not a judgement
 * about training, just the point past which the figure is certainly a typo.
 */
export const MAX_LOGGABLE_SET_KG = 600

/**
 * How far past the ceiling a logged weight goes before the app says anything.
 *
 * 1.5x, so that borrowing a heavier dumbbell than the ones you told us about
 * — the ordinary case, 26kg against a stated 24 — passes without a word,
 * while a fat-fingered 240 against that same 24 does not. A multiple rather
 * than a fixed margin because the ceilings it multiplies span 48kg to 400kg;
 * a flat +10kg would nag a gym trainee and wave through a home one.
 */
export const WARN_ABOVE_CEILING_MULTIPLE = 1.5

export type SetWeightVerdict =
  | { verdict: 'ok' }
  /** Refused. Nothing is written. */
  | { verdict: 'impossible'; message: string }
  /** Written only on a second, deliberate tap. */
  | {
      verdict: 'above_ceiling'
      message: string
      ceilingKg: number
      /** 'stated' means they told us this number themselves — the message says so, and must. */
      ceilingSource: 'stated' | 'table'
    }

/**
 * How each unit reads in a sentence.
 *
 * WHICH unit applies is not decided here — labelModeForEntry owns that, and a
 * second derivation of the per-side rule is exactly the defect this codebase
 * has already paid for twice (see isPerSideLoad's comment). Only the phrasing
 * differs from formatLoad's: this is prose about a number the trainee typed,
 * not a chip above a prescription, so there is no "~".
 */
const UNIT_SUFFIX: Record<LoadLabelMode, string> = {
  per_hand: ' per hand',
  per_leg: ' per leg',
  single_side: ' per side',
  total: '',
}

/** Would the store accept this number at all? The absolute rule, on its own, for callers that have nothing but a figure. */
export function isLoggableSetWeight(kg: number): boolean {
  return Number.isFinite(kg) && kg >= 0 && kg <= MAX_LOGGABLE_SET_KG
}

/**
 * The verdict on one logged weight.
 *
 * `entry` is null for a custom exercise nobody has catalogued (chat-logged
 * off-plan work, mostly) and `profile` is null before one loads. Either
 * absence drops the ceiling rule and keeps the absolute one — the app knows
 * nothing about the implement, so it has nothing to say about the number
 * beyond "that is not a weight."
 */
export function checkLoggedSetWeight(input: {
  weightKg: number
  entry?: ExerciseEntry | null
  profile?: UserProfile | null
}): SetWeightVerdict {
  const { weightKg, entry, profile } = input

  if (!Number.isFinite(weightKg)) {
    return { verdict: 'impossible', message: "That doesn't read as a weight — check the number." }
  }
  if (weightKg < 0) {
    return { verdict: 'impossible', message: "A weight can't be less than nothing — check the number." }
  }
  if (weightKg > MAX_LOGGABLE_SET_KG) {
    return {
      verdict: 'impossible',
      message: `${trimKg(weightKg)}kg is past anything anyone lifts for a set — check the number.`,
    }
  }

  // Nothing to measure against: a bodyweight movement has no implement
  // ceiling, and neither does an exercise the catalogue has never seen.
  if (!entry || !profile || !isExternallyLoaded(entry)) return { verdict: 'ok' }

  const ceilingKg = effectiveLoadingCeilingKg(entry, categorize(entry), profile)
  if (!(ceilingKg > 0) || weightKg <= ceilingKg * WARN_ABOVE_CEILING_MULTIPLE) return { verdict: 'ok' }

  const unit = UNIT_SUFFIX[labelModeForEntry(entry)]
  const stated = statedCeilingKg(entry, profile)
  // 'stated' only when their own number is the one actually holding the
  // ceiling. effectiveLoadingCeilingKg takes the LOWER of the two, so a
  // stated 200kg against a 50kg table is not what they are being measured
  // against and quoting it back would be a lie about our own reasoning.
  const ceilingSource = stated != null && stated <= ceilingKg ? 'stated' : 'table'

  return {
    verdict: 'above_ceiling',
    ceilingKg,
    ceilingSource,
    message: ceilingSource === 'stated'
      ? `You told me the heaviest you can load is ${trimKg(ceilingKg)}kg${unit}, and this is ${trimKg(weightKg)}kg.`
      : `${trimKg(weightKg)}kg${unit} is well past what ${entry.name} normally takes (about ${trimKg(ceilingKg)}kg${unit}).`,
  }
}

/** 24 not 24.0, 22.5 not 22.50 — a number read back to someone should look like the one they typed. */
function trimKg(kg: number): string {
  return String(Math.round(kg * 100) / 100)
}
