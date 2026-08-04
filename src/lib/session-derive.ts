// ---------------------------------------------------------------------------
// Pure derivations shared by useActiveSession and (from P2 onward) the
// today-first session UI. Nothing here reads localStorage or Supabase — every
// function takes its inputs explicitly so it can be unit-tested without a
// store and reused identically by the hook and by test:session-derive.
//
// LAYOUT-DESIGN.md §5.2 designates `setsFor` as the SOLE source for
// checkmarks, counts, isComplete, progress, and off-plan detection — no
// component may filter `logs` itself. This file is where that filter lives.
// ---------------------------------------------------------------------------

import { isMalformedZeroWeight } from './set-log-store'
import type { ExerciseSetLog } from './types'

/**
 * The rows that count as "this exercise's logged sets" for every derived
 * fact on the session view. Matches on `exercise_id` when the row has one
 * (every row written through set-log-store does); falls back to name only
 * for pre-C0 legacy rows. Excludes warm-up rows (ramp ticks are UI-only and
 * never written here, but a dev-seeded or chat-logged warmup row must not
 * inflate a completion count) and malformed zero-weight rows (a save that
 * failed validation but slipped through before the guard existed).
 */
export function filterLoggableSets(
  logs: ExerciseSetLog[],
  exerciseId: string,
  exerciseName?: string,
): ExerciseSetLog[] {
  return logs.filter(l => {
    const matches = l.exercise_id ? l.exercise_id === exerciseId : l.exercise_name === exerciseName
    if (!matches) return false
    if (l.is_warmup) return false
    if (isMalformedZeroWeight(l)) return false
    return true
  })
}
