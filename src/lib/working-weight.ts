// ---------------------------------------------------------------------------
// WHAT A LIFT GIVEN AT SETUP MEANS TO THE PLAN, in one place with no imports.
//
// The plan holds one number per known lift: the weight for about 10 reps with
// 2 left in reserve (RPE 8). It trusts that number over its own estimate and
// skips the calibration week on it, so what the number MEANS has to be the
// same thing in the prescriber, in the words setup shows, and in the
// conversion from a set somebody typed. All three read it from here.
//
// Ashley's ruling, 11 Nov 2026, "Weight and reps": setup asks for a recent
// hard set (a weight and its reps; a one-rep max is 1 rep) and the APP works
// out the plan's number. Before it the box took a bare number and never said
// what it was: measured, a five-rep weight typed there started 15% heavy.
//
// THE SET IS READ AS TAKEN TO THE LIMIT (a CSCS decision, basis in BACKLOG):
// the app is not told how many reps were left, and of every reading "none"
// gives the LOWEST number. Somebody who had two left starts about 6% light,
// which a session corrects; the other way round starts a block too heavy with
// no calibration week to catch it.
// ---------------------------------------------------------------------------

/** The reps and the effort the plan's own number for a known lift stands for. */
export const KNOWN_WEIGHT_REFERENCE_REPS = 10
export const KNOWN_WEIGHT_REFERENCE_RPE = 8

/** Reps in reserve at that effort: what the person is told ("2 left in the tank"). */
export const KNOWN_WEIGHT_REFERENCE_IN_RESERVE = 10 - KNOWN_WEIGHT_REFERENCE_RPE

/** Above this a set says little about strength (rep-max estimates are at their best at ten reps or fewer). */
export const LIFT_SET_MAX_REPS = 15

/** The share of a one-rep max a set of `reps` at effort `rpe` is worked at (Epley, with reps in reserve added). */
export function percentOf1RM(reps: number, rpe: number): number {
  const repsToFailure = Math.max(1, reps + (10 - rpe))
  return 100 / (1 + (repsToFailure - 1) / 30)
}

const toHalfKg = (kg: number) => Math.round(kg * 2) / 2

/**
 * The plan's number for a lift, from one set. Null when the set cannot be used: no weight, no whole number of reps,
 * or more reps than a set can speak for. Null means ASK, never assume.
 */
export function referenceWeightFromSet(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null
  if (!Number.isInteger(reps) || reps < 1 || reps > LIFT_SET_MAX_REPS) return null
  const kg = weightKg * percentOf1RM(KNOWN_WEIGHT_REFERENCE_REPS, KNOWN_WEIGHT_REFERENCE_RPE) / percentOf1RM(reps, 10)
  return toHalfKg(kg)
}
