// ---------------------------------------------------------------------------
// THE EXERCISE TAB'S RUNNING BUTTON — design handoff 2c, 10 Oct 2026.
//
// "The label tells you the next action: 'Start session', or during the
// session 'Log set 3 · Bench 80 kg × 6'."
//
// READ OFF THE TICK, NEVER WORKED OUT AGAIN. Which set is next, and what a
// blank box would save, is SetGrid's decision (ramp rows, drops, last time's
// numbers, the prescription's bottom rep). A second derivation here is how the
// button would come to promise one weight and the tick save another. So the
// tick says what it would save on itself (data-next-*), this file turns that
// into words, and the button presses that tick.
// ---------------------------------------------------------------------------
import { LIFT_SHORT_NAME } from './dashboard-data'

export interface NextSet {
  /** "Set 3", "Warm-up 2" — setLabelLong, the tick's own spoken name. */
  set: string
  /** The exercise as the plan names it. */
  name: string
  /** What the tick would save: a number, "BW", or '' when there is no weight to take. */
  weight: string
  /** The weight column's unit: "kg", "kg per hand", "kg (single side)". */
  unit: string
  /** What the tick would save as reps; '' when it would take none. */
  reps: string
  /** The id of the weight box, for when the weight has to be typed. */
  weightBox: string
  /** The id of the reps box, for when the reps have to be typed. */
  repsBox: string
}

/** The first set still to log in this list, or null when no open row has one. */
export function readNextSet(root: ParentNode): NextSet | null {
  const tick = root.querySelector<HTMLElement>('[data-next-set]')
  if (!tick) return null
  const name = tick.closest<HTMLElement>('[data-exercise-name]')?.dataset.exerciseName ?? ''
  return {
    set: tick.dataset.nextSet ?? '',
    name,
    weight: tick.dataset.nextWeight ?? '',
    unit: tick.dataset.nextUnit ?? 'kg',
    reps: tick.dataset.nextReps ?? '',
    weightBox: tick.dataset.nextWeightBox ?? '',
    repsBox: tick.dataset.nextRepsBox ?? '',
  }
}

/** Whether one tap can log it, or the weight has to be typed first. */
export function needsWeight(next: NextSet): boolean {
  return next.weight === ''
}

/**
 * Whether the reps have to be typed first (whole-app QA walk, 7 Nov 2026): an added warm-up has no prescribed reps,
 * so "Log warm-up 1 · Seated Machine Row 20 kg" pressed a tick that refused with "Enter reps to log this set". The
 * reps the tick would take come from the same expression the save uses, so empty here is exactly a refusal there.
 */
export function needsReps(next: NextSet): boolean {
  return next.reps === ''
}

/**
 * "Log set 3 · Bench 80 kg × 6", "Log warm-up 1 · Squat 40 kg × 5",
 * "Log set 2 · Pull-ups × 8", or "Set 1 · Goblet squat: type the weight".
 *
 * THE UNIT IS THE COLUMN'S, never a bare "kg" pasted on: 14 per hand printed
 * as "14 kg" reads as a total, the single-implement defect this app has
 * already shipped once.
 */
export function nextSetLabel(next: NextSet): string {
  const { head, tail } = nextSetParts(next)
  return head + tail
}

/**
 * The label in two halves: the lift (which may be cut short on a narrow phone) and the numbers (which never are).
 * Whole-app QA walk, 7 Nov 2026: "Log set 1 · Single-Leg Romanian Deadlift 12 kg per hand × 8" was cut to
 * "...Deadlift 12 kg per h…" at 390px, so the button hid the very reps it was about to save.
 */
export function nextSetParts(next: NextSet): { head: string; tail: string } {
  const what = next.set ? next.set[0].toLowerCase() + next.set.slice(1) : 'set'
  const lift = LIFT_SHORT_NAME[next.name] ?? next.name
  if (needsWeight(next)) return { head: `${next.set || 'Set'} · ${lift}`, tail: ': type the weight' }
  if (needsReps(next)) return { head: `${next.set || 'Set'} · ${lift}`, tail: ': type the reps' }
  // NO LOAD SAID FOR A BODYWEIGHT SET: "BW", or a 0 the box saves for a move
  // that carries nothing ("Prone Y-T Raises 0 kg" read like a missing number).
  const load = next.weight === 'BW' || Number(next.weight) === 0 ? '' : ` ${next.weight} ${next.unit}`
  const reps = next.reps ? ` × ${next.reps}` : ''
  return { head: `Log ${what} · ${lift}`, tail: `${load}${reps}` }
}
