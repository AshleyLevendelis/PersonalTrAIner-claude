import { CornerDownRight } from 'lucide-react'

// ---------------------------------------------------------------------------
// The calibration week's inline instruction (LAYOUT-DESIGN.md §1.6.4) —
// survives as a short cue attached to the action it governs (the anchored
// exercise row), not a top-of-page banner. The anchor row itself is chosen
// by session-derive's resolveCalibrationAnchorIndex; this component only
// renders the two copy variants that anchor can select.
// ---------------------------------------------------------------------------

/**
 * The words, apart from the row that renders them — the TrAIner nudge above
 * the list says the same sentence when the cue is anchored to the main lift,
 * and two copies of a coaching instruction is exactly the drift this repo
 * keeps finding. One string, two renderers.
 *
 * REWRITTEN 7 Sep 2026, and the old words are worth keeping in view:
 *
 *   "work up to a weight you could lift 3-4 more times. Log what you
 *    actually do — week 2 builds on it."
 *
 * Ashley, from her phone: "calibration work note is confusing, it tells the
 * user to work up to a wight they could lift 3-4more times but also has
 * weights for the working sets, so its unclear if the user should do the
 * prescribed weights or work up to a weight they can do 3-4more times."
 *
 * She read them as alternatives because on screen they were two instructions
 * with nothing saying how they relate — and note WHICH branch this is: the
 * `hasLoad` one, which fires only on a row that is simultaneously showing a
 * prescribed weight. The contradiction was in the branch condition.
 *
 * Both are right, and the order is what was missing. The calibration weight
 * is multiplied down to 0.45-0.55 of the standards estimate on purpose
 * (CALIBRATION_WEEK_CONSERVATISM_BY_EXPERIENCE) precisely so it is too light
 * to be a target: it is the first rung, and finding the real number is the
 * week's whole job. So the sentence now names the printed weight as the
 * starting point rather than leaving it to argue with the instruction.
 *
 * "Type what you finish on", not "log what you do", for a reason that cost a
 * real user real data: a blank weight box logs the PRESCRIBED number
 * (SetGrid's defaultWeightFor). Work up to 100kg, tap the tick without
 * typing, and 72.5 goes in the ledger. That default is Ashley's own ruling
 * and the app tour promises it in as many words, so it stays — and the copy
 * tells you to type instead.
 *
 * One vocabulary across both variants: "3-4 reps in reserve". The loaded
 * branch used to say "3-4 more times" while the loadless one said "in
 * reserve", which is the same instruction wearing two costumes.
 */
/**
 * REWRITTEN AGAIN, 10 Sep 2026, and the reason is structural rather than a
 * word choice. The 7 Sep sentence was right and it still lost: "start at the
 * weight shown, then add" sat above three identical S1/S2/S3 chips and three
 * pre-filled boxes, and a tick on an untouched box logged the printed number.
 * Three things on the screen said "hold 72.5" against one sentence saying
 * "climb". Ashley, having trained on it: the weights were too light and it
 * was not clear whether to follow the number or add.
 *
 * So the sentence now describes a SEARCH, because that is what the week is:
 * set 1 probes the guess, the next sets climb if it was easy, and the
 * heaviest honest set is what next week is built on. "Type what you finish
 * on" is gone because sets 2 and 3 no longer have a default to type over —
 * SetGrid refuses an empty box in calibration week — so the instruction no
 * longer has to beg for the number. The last sentence is the whole "enter
 * your real weights" feature: the box was always editable.
 */
export function calibrationCueText(hasLoad: boolean): string {
  return hasLoad
    ? 'Set 1 is a probe. Too easy — 5 or more reps left? Go up 5-10% for set 2, and again if it\'s still easy. Your heaviest set at 3-4 reps in reserve becomes next week\'s weight. Know your weight already? Start there.'
    : 'Calibration: leave 3-4 reps in reserve. Log what you actually do.'
}

export function CalibrationCue({ hasLoad }: { hasLoad: boolean }) {
  return (
    <p className="flex items-start gap-1 text-[0.625rem] text-[color:var(--role-warn-text)] mt-0.5">
      <CornerDownRight className="size-2.5 mt-0.5 shrink-0" />
      <span>{calibrationCueText(hasLoad)}</span>
    </p>
  )
}
