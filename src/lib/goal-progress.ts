// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §1 Part 4 — "goals with progress where measurable."
// Pure: takes whatever the caller already has in hand (pr-engine's cache,
// the living weigh-in) rather than fetching anything itself, so the memory
// screen can call this synchronously. A directional goal NEVER produces a
// percent — that's the one hard rule Decision #4 exists to enforce, and
// it's enforced here at the read side too, not just at write time.
// ---------------------------------------------------------------------------

import type { UserGoalRow } from './memory-store'
import { getPRCache } from './pr-engine'

export interface GoalProgress {
  current: number | null
  /** Null for a directional goal, or a measurable goal whose current value isn't known yet — never fabricated. */
  percent: number | null
}

export function computeGoalProgress(goal: UserGoalRow, profileId: string, latestWeightKg: number | null): GoalProgress {
  if (goal.trackable === 'directional' || goal.baseline_value == null || goal.target_value == null) {
    return { current: null, percent: null }
  }

  let current: number | null = null
  if (goal.metric === 'body_weight_kg') {
    current = latestWeightKg
  } else if ((goal.metric === 'lift_working_kg' || goal.metric === 'lift_1rm_kg') && goal.metric_ref) {
    current = getPRCache(profileId)[goal.metric_ref]?.maxWeight ?? null
  }
  if (current == null) return { current: null, percent: null }

  const span = goal.target_value - goal.baseline_value
  if (span === 0) return { current, percent: 100 }
  const percent = Math.max(0, Math.min(100, Math.round(((current - goal.baseline_value) / span) * 100)))
  return { current, percent }
}
