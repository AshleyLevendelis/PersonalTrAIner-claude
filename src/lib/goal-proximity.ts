import type { UserGoalRow } from './memory-store'

// How close (in kg) to the goal counts as "worth asking about now" before
// it's actually reached — early enough to have the conversation before the
// deficit/surplus runs past the target, not after.
const APPROACHING_BAND_KG = 2

export interface GoalProximityInfo {
  goalId: string
  targetKg: number
  message: string
}

/**
 * Detects when a trainee's weight has reached, or is closing in on, their
 * stated body_weight_kg goal. Deliberately does NOT touch the calorie/macro
 * calculation — the deficit/surplus in macro-calculator.ts keeps running
 * exactly as it does today. This only decides whether to ASK the trainee
 * what's next (keep going / hold here / new target), matching the explicit
 * ask-first-don't-auto-decide preference this session's profile-change
 * decision already settled on: nothing about the plan changes on its own,
 * ever, without the trainee weighing in.
 */
export function describeGoalProximity(currentWeightKg: number, goal: UserGoalRow): GoalProximityInfo | null {
  if (goal.metric !== 'body_weight_kg' || goal.target_value == null || goal.baseline_value == null) return null
  const direction = Math.sign(goal.target_value - goal.baseline_value)
  if (direction === 0) return null

  const distanceKg = goal.target_value - currentWeightKg
  const reached = direction > 0 ? currentWeightKg >= goal.target_value : currentWeightKg <= goal.target_value
  const approaching = !reached && Math.abs(distanceKg) <= APPROACHING_BAND_KG
  if (!reached && !approaching) return null

  const message = reached
    ? `You've reached your goal weight of ${goal.target_value}kg — keep going, hold here, or set a new target? Tell me in chat or update it in your profile.`
    : `You're getting close to your goal weight of ${goal.target_value}kg — worth deciding now what's next: keep going, hold here, or a new target? Tell me in chat or update it in your profile.`

  return { goalId: goal.id, targetKg: goal.target_value, message }
}

// Device-local dismiss tracking only — unlike the target-weight anchor
// (nutrition-targets.ts), this gates a UI nudge, not a number the app
// computes, so a second device occasionally re-showing an already-dismissed
// nudge is a minor inconvenience, not a correctness problem.
const DISMISSED_KEY_PREFIX = 'fitplan_goal_proximity_dismissed_v1'

export function isGoalProximityDismissed(goalId: string): boolean {
  try {
    return localStorage.getItem(`${DISMISSED_KEY_PREFIX}:${goalId}`) === '1'
  } catch {
    return false
  }
}

export function dismissGoalProximity(goalId: string): void {
  try {
    localStorage.setItem(`${DISMISSED_KEY_PREFIX}:${goalId}`, '1')
  } catch {
    // best-effort — a failed dismiss just means the nudge can reappear
  }
}
