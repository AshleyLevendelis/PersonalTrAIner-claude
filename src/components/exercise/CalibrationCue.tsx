import { CornerDownRight } from 'lucide-react'

// ---------------------------------------------------------------------------
// The calibration week's inline instruction (LAYOUT-DESIGN.md §1.6.4) —
// survives as a short cue attached to the action it governs (the anchored
// exercise row), not a top-of-page banner. The anchor row itself is chosen
// by session-derive's resolveCalibrationAnchorIndex; this component only
// renders the two copy variants that anchor can select.
// ---------------------------------------------------------------------------

export function CalibrationCue({ hasLoad }: { hasLoad: boolean }) {
  return (
    <p className="flex items-start gap-1 text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
      <CornerDownRight className="size-2.5 mt-0.5 shrink-0" />
      <span>
        {hasLoad
          ? 'Calibration: work up to a weight you could lift 3-4 more times. Log what you actually do — week 2 builds on it.'
          : 'Calibration: leave 3-4 reps in reserve. Log what you actually do.'}
      </span>
    </p>
  )
}
