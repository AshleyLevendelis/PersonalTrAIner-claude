// ---------------------------------------------------------------------------
// "THE APP HAS RUN OUT OF THINGS TO ADD" — one rule, one place.
//
// Ashley's ruling, 5 Sep 2026, choosing this over adding a set, rotating the
// exercise, or letting the reps climb further: when a lift genuinely cannot
// get heavier, SAY SO and ask for one logged set, rather than showing an
// identical week as though it were progress.
//
// Measured on a 250-plan stride of the 9,216-plan grid: 41.6% of plans carry
// at least one week that repeats its predecessor exactly, and 99.9% of those
// are a genuinely stalled lift rather than one day standing still while the
// rest of the week catches up. The worst trace is a BEGINNER whose bench press
// reads `3 x 11-13 @ 30kg` character-for-character from week 11 to week 15 —
// the last third of a sixteen-week plan.
//
// THE HONEST SENTENCE ALREADY EXISTED. load-prescription.ts has written it
// since 30 Aug 2026 — "This is as far as the estimate goes… Log a set and the
// number can start moving again." — and it ships inside `load_guidance`, which
// the card renders only behind the ⓘ. Correct words, written down, one tap
// away from nobody. This module does not rewrite them; it decides when the
// fact deserves to be visible WITHOUT a tap, and gives the coach the same
// fact so the two cannot disagree.
//
// WHY THIS IS NOT JUST `load_hold != null`. A weight held at the ceiling while
// the rep target climbs is a lift that is still progressing — saying "at your
// ceiling" there would be alarming and false. The condition is both halves:
// the weight cannot move AND no other lever moved either.
// ---------------------------------------------------------------------------

import type { Exercise } from './types'

/**
 * The weight is pinned by something structural, not by choice.
 *
 * 'floor' and 'matched' are deliberately NOT here. A load rounded up to the
 * bar has not run out of room, and one lowered to match the same lift's other
 * slot this week is a coherence decision about presentation — neither says
 * "this is as far as the app can take you".
 */
function weightCannotMove(ex: Exercise): boolean {
  return ex.load_hold === 'ceiling' || ex.load_hold === 'implement'
}

/**
 * Every other lever tried this week and could not move either.
 *
 * 'bought' and 'walked' mean a lever DID move — the week is not repeating and
 * this must return false for them, which is the whole reason the generator
 * records what the bump did rather than just whether it ran.
 */
function noLeverLeft(ex: Exercise): boolean {
  if (ex.rep_bump === 'capped' || ex.rep_bump === 'range_fixed') return true
  if (ex.distance_bump === 'capped') return true
  return false
}

/**
 * Is this week's prescription for this lift a repeat the app cannot improve on?
 *
 * Both halves required. See the module comment for why either alone is wrong.
 */
export function atPrescribedCeiling(ex: Exercise): boolean {
  return weightCannotMove(ex) && noLeverLeft(ex)
}

/**
 * The at-a-glance label, for beside the load on a card.
 *
 * Deliberately short — this sits on a phone row next to a weight chip, and the
 * full explanation is one tap away in load_guidance, which already says it
 * properly. Two wordings because the two causes are genuinely different
 * claims: a barbell is at a GUESS about this person's strength and a logged
 * set can move it; a backpack is at the heaviest a backpack goes, and no
 * amount of logging changes that.
 */
export function ceilingLabel(ex: Exercise): string | null {
  if (!atPrescribedCeiling(ex)) return null
  return ex.load_hold === 'implement' ? 'as heavy as this gets' : "at your estimate's ceiling"
}

/**
 * The same fact in a sentence, for the coach's plan context.
 *
 * The coach was describing these weeks as progression because nothing told it
 * otherwise — the identical prescription reached it with no note attached. The
 * wording names the ACTION, because a lift stuck on an estimate is the single
 * best moment to ask for a logged set and the coach is the surface that can
 * ask.
 */
export function ceilingNoteForCoach(ex: Exercise): string | null {
  if (!atPrescribedCeiling(ex)) return null
  return ex.load_hold === 'implement'
    ? 'this is the heaviest the implement goes, so the weight will not rise again — do not present it as progression'
    : 'this has reached the estimate ceiling and cannot rise until a set is logged — do not present it as progression, and it is a good moment to ask for one logged set'
}
