// ---------------------------------------------------------------------------
// A SESSION'S PLANNED SETS AND THE WORKING SETS LOGGED AGAINST THEM — one
// count for the screen and the coach (runs 3-4, M36 and M39).
//
// Ashley, 10 Oct 2026, from three options: a session finished well short is
// still "Done", WITH THE COUNT ("5 of 18 sets") beside it — over a separate
// "part done" mark and over keeping it as it was. The coach already said
// "CLOSED at 5 of 18"; the screen said only "Done".
//
// Small on purpose: the week strips read it on first paint, and the coach's
// context module is too big to pull in for a number.
// ---------------------------------------------------------------------------
import { filterLoggableSets } from './session-derive'
import type { ExerciseSetLog, WorkoutDay } from './types'

/**
 * Planned working sets, and those logged against them: warm-ups and drops out
 * (the reader every tick uses), capped per exercise, because a fourth set on a
 * three-set lift is extra work, not cover for a set missing elsewhere. Null
 * when nothing was planned.
 */
export function sessionSetCount(session: WorkoutDay | null | undefined, logs: ExerciseSetLog[] | null | undefined): { logged: number; planned: number } | null {
  const exercises = session?.exercises ?? []
  const planned = exercises.reduce((n, e) => n + (e.sets ?? 0), 0)
  if (planned === 0) return null
  const logged = exercises.reduce((n, e) => n + Math.min(filterLoggableSets(logs ?? [], e.id ?? '', e.name).length, e.sets ?? 0), 0)
  return { logged, planned }
}

/** "5 of 18 sets" for a session closed short of its plan; null when it was all done or nothing was planned. */
export function shortOfPlan(count: { logged: number; planned: number } | null): string | null {
  return count && count.logged < count.planned ? `${count.logged} of ${count.planned} sets` : null
}
