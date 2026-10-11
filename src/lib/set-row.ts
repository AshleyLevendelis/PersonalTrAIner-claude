// ---------------------------------------------------------------------------
// WHAT A BLANK WEIGHT BOX LOGS, as one decision a gate can ASK rather than read
// out of the JSX (runs 3-4, H25, 10 Oct 2026; the carry-down rule is the
// tester's M11 from runs 1-2, taken from wip/x3-exercise-polish).
// Nothing here touches the store or the DOM.
// ---------------------------------------------------------------------------

/** The part of a logged working set the carry reads. */
export interface CarrySet {
  set_number: number
  weight_kg: number
  is_bodyweight?: boolean | null
}

export interface CarriedWeight {
  /** What a blank weight box on this row logs. 0 when the set above was bodyweight. */
  kg: number
  /** The set above was done at bodyweight, so a blank tick here is bodyweight too. */
  isBodyweight: boolean
  /** The set it came from — the marker under the row names it. */
  fromSet: number
}

/**
 * THE WEIGHT CARRIES DOWN — decided as a CSCS coach.
 *
 * Straight sets repeat the load unless the plan says otherwise, so the set
 * just done is the best evidence there is of what the next one weighs: better
 * than last week's number, and better than the plan's when she has already
 * departed from it on this exercise today. So the nearest LOGGED working set
 * above this row is what a blank box here logs.
 *
 * THE ONE EXCEPTION IS A PLAN THAT STEPS THE LOAD between those two sets (a
 * ramped or pyramid prescription: `perSetLoadKg` holds a different number for
 * each). There the plan's own number stands; carrying set 1's weight into a
 * set the plan deliberately made heavier would flatten the prescription.
 */
export function carriedWeightFor(
  setNumber: number,
  loggedWorkingSets: readonly CarrySet[],
  perSetLoadKg?: readonly (number | null)[],
): CarriedWeight | null {
  let above: CarrySet | null = null
  for (const l of loggedWorkingSets) {
    if (l.set_number < setNumber && (!above || l.set_number > above.set_number)) above = l
  }
  if (!above) return null
  const plannedAbove = perSetLoadKg?.[above.set_number - 1]
  const plannedHere = perSetLoadKg?.[setNumber - 1]
  if (plannedAbove != null && plannedHere != null && plannedAbove !== plannedHere) return null
  const kg = Number(above.weight_kg)
  if (above.is_bodyweight || !(kg > 0)) return { kg: 0, isBodyweight: true, fromSet: above.set_number }
  return { kg, isBodyweight: false, fromSet: above.set_number }
}

export type BlankWeightSource = 'carried' | 'plan' | 'last_time' | 'fallback'

export interface BlankWeight {
  /** The text the empty box shows AND what a blank ✓ saves. '' means "type it". */
  text: string
  source: BlankWeightSource
  /** Set number the carry came from, when source is 'carried'. */
  fromSet?: number
}

/**
 * A WORKING SET'S BLANK BOX, IN ORDER (H25, decided as a CSCS coach, 10 Oct 2026).
 *
 * The tester's Romanian deadlifts said "24 kg per hand · start here" and a
 * blank tick logged 30 — last session's set — twice, the second time straight
 * after a typed 24. Last session's number outranked both today's plan and the
 * set she had just done. A coach writes today's prescription for today; last
 * week is evidence the plan has already used, not a second prescription.
 *
 *   1. the set just done today (carriedWeightFor), unless `noCarry`;
 *   2. today's plan: this set's own number, else the exercise's (marked as
 *      last session's when the two weights are the same, so its reps come too);
 *   3. last session's set, only when the plan carries no number;
 *   4. the fallback ('0' for a lift that carries no load, '' to ask).
 *
 * The SAME value is the grey placeholder and the saved weight, so the number
 * on screen is always the number that gets logged.
 */
export function blankWeightFor(input: {
  carry: CarriedWeight | null
  /** Calibration week sets 2+: the probe's guess must not carry or fill. */
  noCarry?: boolean
  planKg: number | null
  lastTimeKg: number | null
  fallback: string
}): BlankWeight {
  if (input.carry && !input.noCarry) {
    return { text: input.carry.isBodyweight ? '0' : String(input.carry.kg), source: 'carried', fromSet: input.carry.fromSet }
  }
  // SAME WEIGHT AS LAST TIME: last session's row IS today's plan, and its reps
  // are a real target at that weight (Ashley's 18 Sep "last time" ruling keeps
  // its one-tap repeat). At a different weight, last week's reps mean nothing
  // and the plan's row stands.
  if (input.planKg != null && input.lastTimeKg != null && input.lastTimeKg === input.planKg) {
    return { text: String(input.planKg), source: 'last_time' }
  }
  if (input.planKg != null) return { text: String(input.planKg), source: 'plan' }
  if (input.lastTimeKg != null) return { text: String(input.lastTimeKg), source: 'last_time' }
  return { text: input.fallback, source: 'fallback' }
}
