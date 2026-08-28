// ---------------------------------------------------------------------------
// A daily step target, derived from the activity level someone already gave.
//
// WHY DERIVED RATHER THAN ASKED. The steps row had a number and no target, so
// there was nothing to draw a ring against — Ashley asked for one matching the
// calorie indicator, and a ring with no denominator cannot be drawn. Rather
// than add a question to an onboarding that has just been trimmed, this reads
// the answer already on file.
//
// It is the same shape as the calorie target, which is also derived (from BMR
// and TDEE) rather than set by hand, and shown the same way — "0 OF 3040
// KCAL". So a derived step target is not a new kind of claim for this app to
// make; it is the existing one applied to a second number.
//
// THESE FOUR NUMBERS ARE A CONVENTION, NOT A MEASUREMENT. They are the
// familiar public-health bands, and this file says so rather than implying
// they were computed from anything about the individual. If that ever needs
// to become personal, it needs real step history to personalise FROM — which
// the app is only now starting to collect.
//
// NOT EDITABLE YET, deliberately: storing an override means a column on
// fitness_profiles, and a migration only reaches production through
// `npm run db:push-both` on Ashley's machine. Shipping the derived ring costs
// nothing and blocks nothing; the override can follow.
// ---------------------------------------------------------------------------

import type { ActivityLevel } from './types'

// Ordered to match the STATIC_PAL multipliers these levels already drive
// (1.2 / 1.375 / 1.55 / 1.725 / 1.9 in macro-calculator.ts), so the step
// target and the calorie target never disagree about who is more active.
//
// `very_active` is in the type but NOT offered at onboarding — the slot
// catalogue's own comment says why: "day-to-day self-reports at that level
// are nearly always overestimates". It is still reachable on an older or
// questionnaire-built profile, and tsc caught its absence here, so it gets a
// band rather than silently falling through to the moderate default.
const STEP_TARGETS: Record<ActivityLevel, number> = {
  sedentary: 6000,
  light: 8000,
  moderate: 10000,
  active: 12000,
  very_active: 14000,
}

/** The daily step target for someone's stated activity level. */
export function stepsTargetFor(activityLevel: ActivityLevel | undefined | null): number {
  return (activityLevel && STEP_TARGETS[activityLevel]) || STEP_TARGETS.moderate
}
