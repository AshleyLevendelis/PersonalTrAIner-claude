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
// AND NOW OVERRIDABLE. The band is a reasonable default and still cannot know
// that someone walks a dog twice a day or works nights, so
// `daily_step_target` (migration 20260828140000) wins whenever it is set.
// Null means "never set one" — not zero, which would be a target of no steps.
// ---------------------------------------------------------------------------

import type { ActivityLevel, UserProfile } from './types'

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

/** The band for a stated activity level. Exported for the settings UI, which shows what the default WOULD be beside the override box. */
export function derivedStepsTargetFor(activityLevel: ActivityLevel | undefined | null): number {
  return (activityLevel && STEP_TARGETS[activityLevel]) || STEP_TARGETS.moderate
}

/**
 * The target to measure against: what they chose, or the band for their
 * activity level.
 *
 * Takes the PROFILE rather than the two fields, so no caller can read one and
 * forget the other — a ring drawn against the derived band while the settings
 * screen shows a personal number would be the app disagreeing with itself.
 */
export function stepsTargetFor(profile: Pick<UserProfile, 'activity_level' | 'daily_step_target'>): number {
  const chosen = profile.daily_step_target
  if (typeof chosen === 'number' && Number.isFinite(chosen) && chosen > 0) return Math.round(chosen)
  return derivedStepsTargetFor(profile.activity_level)
}
