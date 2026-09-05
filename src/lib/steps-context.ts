// ---------------------------------------------------------------------------
// WHAT THE COACH KNOWS ABOUT TODAY'S STEPS.
//
// Ashley, 5 Sep 2026: "build it so it can log them for you." Researching the
// write turned up that the coach could not READ them either — ChatAssistant
// held no step count and no target, so the coach could neither say how the day
// was going nor tell whether "another 3,000" meant 3,000 or 9,240.
//
// Both halves ship together on purpose. A writer that cannot read is how
// "I did another 3,000" ends up REPLACING a 6,240 day with 3,000 — daily_steps
// holds one row per day and logStepsManual upserts, so the increment reading
// is destructive. The coach has to see the number to propose the right one.
//
// Same shape as the technique and ingredient summaries: one plain line, built
// from the shared rule, never a second copy of it.
// ---------------------------------------------------------------------------

import { stepsTargetFor } from './steps-target'
import type { UserProfile } from './types'

/**
 * One line for the coach's context.
 *
 * `steps === null` means no row for today, which is NOT the same as zero and
 * must not be reported as it: "none logged yet" invites the offer to log,
 * while "0 of 8,000" reads as a day someone spent motionless.
 *
 * The target comes from stepsTargetFor, whose own comment exists to stop a
 * second reader inventing its own — a coach quoting one target while the
 * Exercise tab draws a ring against another is the app disagreeing with
 * itself out loud.
 */
export function buildCoachStepsSummary(
  steps: number | null,
  profile: Pick<UserProfile, 'activity_level' | 'daily_step_target'>,
): string {
  const target = stepsTargetFor(profile)
  if (steps === null) {
    return `Steps today: none logged yet (their target is ${target.toLocaleString()}).`
  }
  return `Steps today: ${steps.toLocaleString()} of ${target.toLocaleString()}.`
}
