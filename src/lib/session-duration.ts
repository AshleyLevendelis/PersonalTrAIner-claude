import type { SessionDuration, WorkoutDay } from './types'
import { EXERCISE_DATABASE } from './exercise-db'

// ---------------------------------------------------------------------------
// SESSION DURATION — single source of truth
// ---------------------------------------------------------------------------
// Three different layers need to agree on "how long is this session": the
// engine's duration top-up (how many sets to add to fill the budget), the
// quality scorer's time-fit dimension (did the engine actually hit it), and
// the UI (what to show the user). Previously each had its own copy of the
// same budget table and the same warmup+sets+rest formula — harmless while
// they agreed, a silent scoring bug the moment they drifted. This is the one
// place all three read from.

export const DURATION_BUDGET_SECONDS: Record<SessionDuration, number> = {
  '30-45': 37 * 60,
  '45-60': 52 * 60,
  '60-90': 75 * 60,
  '90+': 100 * 60,
}

export function getDurationBudgetSeconds(duration: SessionDuration): number {
  return DURATION_BUDGET_SECONDS[duration] ?? DURATION_BUDGET_SECONDS['45-60']
}

/** Warm-up + working sets, in seconds. */
export function estimateDaySeconds(day: WorkoutDay): number {
  let total = day.warmup?.total_seconds ?? 0
  for (const ex of day.exercises) {
    const restMatch = ex.rest.match(/(\d+)/)
    const restSec = restMatch ? parseInt(restMatch[1], 10) : 60
    const entry = EXERCISE_DATABASE.find(e => e.name.toLowerCase() === ex.name.toLowerCase())
    const repDuration = entry?.avg_duration_seconds ?? 35
    total += ex.sets * (repDuration + restSec)
  }
  return total
}
