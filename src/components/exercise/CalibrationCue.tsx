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
 */
export function calibrationCueText(hasLoad: boolean): string {
  return hasLoad
    ? 'Calibration: work up to a weight you could lift 3-4 more times. Log what you actually do — week 2 builds on it.'
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
