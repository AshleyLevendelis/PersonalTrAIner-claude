import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

// ---------------------------------------------------------------------------
// LAYOUT-DESIGN.md §1.2 — replaces PhaseBanner + CalibrationBanner +
// SessionDurationNote (up to seven copies of each per week view in the old
// render) with one tappable line. Collapsed by default every visit —
// content that doesn't change daily must not occupy permanent daily space.
// The phase token is REPLACED, not appended, by Deload/Calibration when
// either applies: mutually exclusive content is mutually exclusive in the
// DOM.
// ---------------------------------------------------------------------------

export function ContextLine({
  weekNumber,
  totalWeeks,
  blockNumber,
  phaseLabel,
  isDeload,
  isCalibrationWeek,
  phaseFocus,
  coachNote,
  estimatedMinutes,
  onOpenProgram,
}: {
  weekNumber: number
  totalWeeks: number
  blockNumber?: number
  phaseLabel?: string
  isDeload?: boolean
  isCalibrationWeek?: boolean
  phaseFocus?: string
  coachNote?: string
  estimatedMinutes?: number
  onOpenProgram?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const phaseToken = isCalibrationWeek ? 'Calibration' : isDeload ? 'Deload week' : phaseLabel

  return (
    <div className="rounded-xl bg-[color:var(--surface-deep)]">
      <div className="flex items-center justify-between px-3 py-2 gap-2">
        <button
          type="button"
          className="flex-1 min-w-0 text-left text-xs text-foreground truncate hover:underline"
          onClick={onOpenProgram}
        >
          Wk {weekNumber}/{totalWeeks}
          {blockNumber != null && <> · B{blockNumber}</>}
          {phaseToken && <> {phaseToken}</>}
          {estimatedMinutes != null && <> · ~{estimatedMinutes} min</>}
        </button>
        {(phaseFocus || coachNote) && (
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(v => !v)}
            aria-label="Expand phase context"
          >
            <ChevronDown className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {expanded && (phaseFocus || coachNote) && (
        <div className="px-3 pb-2 space-y-1 pt-2">
          {phaseFocus && <p className="text-[11px] text-muted-foreground">{phaseFocus}</p>}
          {coachNote && <p className="text-[11px] text-muted-foreground/80 italic">{coachNote}</p>}
        </div>
      )}
    </div>
  )
}
