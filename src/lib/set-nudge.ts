// ---------------------------------------------------------------------------
// THE NEXT SET'S WEIGHT, NUDGED BY THE REPS JUST DONE — his ruling 23 Nov 2026, "1" (from three options: per lift
// plus a tap-free nudge, over asking after every set every week, and over leaving it). The once-per-lift
// Too easy / About right / Too hard question stays; this adds no tap. It reads the reps he LOGGED on the set above
// and, only when they land clearly outside the prescribed range, moves the next set's blank weight one step.
//
// CSCS basis (mine, recorded in BACKLOG): straight sets at a fixed load lose a rep or so per set to fatigue, so a set
// one rep either side of the range is the plan working, not a wrong weight. THREE OR MORE reps over the top of the
// range is about three reps further from failure than the set asked for, which is roughly 7-10% of load: the next
// set goes up ONE step (about 5%, at least one plate step), deliberately the cautious half, because fatigue keeps
// building through the session and the lift's own question moves next session. TWO OR MORE under the bottom is a
// load the set cannot reach: the next set comes down about 5%. Never in the testing week (it has its own per-set
// ask), a deload, the first session back from a break, a stepped (pyramid) prescription, a timed or distance set,
// a warm-up, a drop or a bodyweight set; and never past a stated kit limit.
// ---------------------------------------------------------------------------

import { nextSetRungsKg, probeNextKg } from './load-prescription'
import type { ExerciseEntry } from './exercise-db'
import type { UserProfile } from './types'
import { carriedWeightFor, type CarrySet } from './set-row'

/** Reps over the top of the range that move the next set up. */
const NUDGE_UP_OVER_TOP = 3
/** Reps under the bottom of the range that move the next set down. */
const NUDGE_DOWN_UNDER_BOTTOM = 2

export interface NudgeSet extends CarrySet {
  reps_completed: number
}

export interface SetNudge {
  kg: number
  direction: 'up' | 'down'
  fromSet: number
  reps: number
}

/** "9-11" -> [9, 11], "8" -> [8, 8]; null for a timed or distance prescription ("30s", "40m") or none. */
export function repRange(prescribedReps: string | null | undefined): [number, number] | null {
  const text = (prescribedReps ?? '').trim()
  if (!text || /[a-z]/i.test(text.replace(/reps?/i, ''))) return null
  const m = /^(\d+)(?:\s*[-–]\s*(\d+))?/.exec(text)
  if (!m) return null
  const lo = Number(m[1])
  const hi = m[2] != null ? Number(m[2]) : lo
  return lo > 0 && hi >= lo ? [lo, hi] : null
}

export function setNudgeFor(input: {
  setNumber: number
  loggedWorkingSets: readonly NudgeSet[]
  prescribedReps: string | null | undefined
  perSetLoadKg?: readonly (number | null)[]
  entry: ExerciseEntry | undefined
  profile: UserProfile | null | undefined
  /** False in the testing week, a deload, the first session back from a break, or on an unloaded lift. */
  enabled: boolean
}): SetNudge | null {
  if (!input.enabled || input.setNumber < 2) return null
  const range = repRange(input.prescribedReps)
  if (!range) return null
  const carry = carriedWeightFor(input.setNumber, input.loggedWorkingSets, input.perSetLoadKg)
  if (!carry || carry.isBodyweight || !(carry.kg > 0)) return null
  const above = input.loggedWorkingSets.find(l => l.set_number === carry.fromSet)
  const reps = Number(above?.reps_completed)
  if (!Number.isFinite(reps) || reps <= 0) return null
  const [lo, hi] = range
  if (reps >= hi + NUDGE_UP_OVER_TOP) {
    const kg = nextSetRungsKg(carry.kg, input.entry, input.profile)[0]
    return kg != null && kg > carry.kg ? { kg, direction: 'up', fromSet: carry.fromSet, reps } : null
  }
  if (reps <= lo - NUDGE_DOWN_UNDER_BOTTOM) {
    const kg = probeNextKg(carry.kg, 'hard', input.entry, input.profile)
    return kg < carry.kg ? { kg, direction: 'down', fromSet: carry.fromSet, reps } : null
  }
  return null
}
