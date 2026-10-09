// ---------------------------------------------------------------------------
// THREE SMALL DECISIONS A SET ROW MAKES, pulled out of SetGrid so a gate can
// ASK them rather than read the JSX for them (tester's M11, L13, L11 — 9 Oct
// 2026). Nothing here touches the store or the DOM.
// ---------------------------------------------------------------------------

/** The part of a logged working set the carry reads. */
export interface CarrySet {
  set_number: number
  weight_kg: number
  is_bodyweight?: boolean | null
  added_load_kg?: number | null
}

export interface CarriedWeight {
  /** What a blank weight box on this row logs. 0 when the set above was bodyweight. */
  kg: number
  /** The set above was done at bodyweight, so a blank tick here is bodyweight too. */
  isBodyweight: boolean
  /** The figure is weight ADDED to bodyweight (a belt on a pull-up), so it is said with its "+". */
  added: boolean
  /** The set it came from — the marker under the row names it. */
  fromSet: number
}

/**
 * THE WEIGHT CARRIES DOWN — decided as a CSCS coach, 9 Oct 2026.
 *
 * The tester logged Box Squat set 1 at 22.5kg, ticked set 2 with the box
 * blank, and the app filed set 2 as "Bodyweight": a blank box fell back to
 * typed → last week → the plan, never to the set just done, and Box Squat's
 * plan carries no weight. A coach reading that log sees a set that did not
 * happen, and progression is handed a false zero.
 *
 * Straight sets repeat the load unless the plan says otherwise, so the set
 * just done is the best evidence there is of what the next one weighs — better
 * than last week's number, and better than the plan's when she has already
 * departed from it on this very exercise today. So: the nearest LOGGED working
 * set above this row is what a blank box here logs, and a new entry carries
 * down until it is changed again.
 *
 * THE ONE EXCEPTION IS A PLAN THAT STEPS THE LOAD between those two sets (a
 * ramped or pyramid prescription: `perSetLoadKg` holds a different number for
 * each). There the plan's own number stands — carrying set 1's weight into a
 * set the plan deliberately made heavier would flatten the prescription.
 *
 * Its bodyweight flag carries with it, and on a belt lift (pull-ups, dips) it
 * is the ADDED weight that carries, because that is what the box means there.
 *
 * Working sets only: the caller never asks for a build-up row (its number is
 * the prescription's) or a drop (its number is a step down from the row
 * above), and never in calibration week on sets 2+, which deliberately have no
 * default at all.
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
  const added = Number(above.added_load_kg ?? 0)
  if (added > 0) return { kg: added, isBodyweight: false, added: true, fromSet: above.set_number }
  const kg = Number(above.weight_kg)
  if (above.is_bodyweight || !(kg > 0)) return { kg: 0, isBodyweight: true, added: false, fromSet: above.set_number }
  return { kg, isBodyweight: false, added: false, fromSet: above.set_number }
}

/**
 * SHOULD FOCUSING THIS BOX MOVE THE PAGE? (tester's L13.)
 *
 * Every weight and reps box used to centre itself on focus, to keep the row
 * being edited above the soft keyboard (LAYOUT-DESIGN.md §7.6). With no soft
 * keyboard there is nothing to dodge: the page slid about 60px under a
 * stationary pointer and the ✓ now under it belonged to the row below — the
 * tester logged the wrong set twice.
 *
 * So: never without a soft keyboard (a fine pointer). With one, only when the
 * box would otherwise sit where the keyboard opens — the lower half of the
 * visible screen — or has been scrolled off the top. A row already in the
 * upper half is clear of the keyboard and stays exactly where the thumb is.
 */
export function shouldCentreOnFocus(input: {
  /** `matchMedia('(pointer: coarse)')` — a touch screen, so a soft keyboard will open. */
  coarsePointer: boolean
  /** The box's top and bottom in the visible viewport, px. */
  top: number
  bottom: number
  viewportHeight: number
}): boolean {
  if (!input.coarsePointer) return false
  if (!(input.viewportHeight > 0)) return false
  return input.top < 0 || input.bottom > input.viewportHeight / 2
}

/** What the card-collapse rule reads about one exercise at one moment. */
export interface CardProgress {
  /** Every planned working set is logged. */
  complete: boolean
  /** Rows logged for it today — working sets and drops alike. */
  logged: number
  /** Rows she added that are on screen (logged or not): extra sets, warm-ups, drops. */
  added: number
}

/**
 * WHICH MANUALLY-OPENED CARDS SHOULD GO BACK TO FOLLOWING THE SESSION?
 * (tester's L11: "an Add a drop row … stops a finished exercise collapsing".)
 *
 * Which card is open is "the first unfinished exercise" unless a header has
 * been tapped, and that tap used to pin the card for the rest of the session.
 * "Add a drop" only appears under the last LOGGED set, so adding one after the
 * final set means re-opening a card that had already closed itself — which
 * pinned it open for good. The empty drop row was a passenger.
 *
 * A manual choice is released when the work it was made for is done:
 *   - the exercise's last planned set has just been logged; or
 *   - it was already finished, and a row has just been logged (the drop she
 *     opened it for) or an added row has just been removed.
 * Adding a row never releases it — she is about to use it.
 */
export function overridesToRelease(
  before: Readonly<Record<number, CardProgress>>,
  now: Readonly<Record<number, CardProgress>>,
): number[] {
  const out: number[] = []
  for (const key of Object.keys(now)) {
    const i = Number(key)
    const was = before[i]
    const is = now[i]
    if (!was || !is.complete) continue
    if (!was.complete || is.logged > was.logged || is.added < was.added) out.push(i)
  }
  return out
}
