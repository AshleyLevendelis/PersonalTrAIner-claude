import { generateExercisePlan, generateMesocycle } from './exercise-plan'
import type { MesocycleWeek, UserProfile } from './types'

// ---------------------------------------------------------------------------
// START THE PLAN AGAIN FROM WEEK 1 (8 Oct 2026; layoff.ts, docs/plans/layoff-handling.md).
//
// Her ruling, from three options, for somebody back after twelve weeks or more: OFFER
// to start again from week 1, one tap, never automatic. This is the plan that tap
// builds: the same generation onboarding runs, from the profile as it stands now and
// with the same exclusions, and with the calibration week forced back ON whatever the
// profile says, because finding working weights again after a long break is the point.
//
// Pure, so App (which saves it and makes it the live plan) and the browser harness
// (which drives the real offer) build the very same plan.
// ---------------------------------------------------------------------------

export function buildRestartedPlan(profile: UserProfile, exclusions: string[]): MesocycleWeek[] {
  const restartProfile: UserProfile = { ...profile, skip_calibration_week: false }
  const base = generateExercisePlan(restartProfile, exclusions).plan
  return generateMesocycle(restartProfile, base, exclusions)
}

/**
 * Whether the restart is still on offer: only for the restart band, and only while the
 * current plan began on or before the last session — once the plan has started again
 * since then, offering it again would be the app forgetting what she just did.
 */
export function restartStillOffered(band: string, lastSessionDate: string | null, planStartDate: string | null): boolean {
  if (band !== 'restart' || !lastSessionDate) return false
  if (!planStartDate) return true
  return planStartDate <= lastSessionDate
}
