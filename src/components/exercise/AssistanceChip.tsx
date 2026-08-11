import { LifeBuoy } from 'lucide-react'
import type { Exercise } from '@/lib/types'

// ---------------------------------------------------------------------------
// LoadChip's counterpart for an assistance-loaded exercise (Exercise.
// suggested_assistance_kg — today, only Pull-Ups (Assisted)). Deliberately a
// separate component rather than a mode flag on LoadChip: every visual cue
// there (loadChipClass, the "up = confident/progress" framing) is built
// around more-is-heavier. Assistance is the opposite — less machine help
// means more real strength — so this chip inverts the framing outright
// rather than trying to make one component's color logic mean two different
// things depending on a prop.
// ---------------------------------------------------------------------------

export function AssistanceChip({ ex }: { ex: Exercise }) {
  if (ex.suggested_assistance_kg == null) return null
  const readyToGraduate = !!ex.assistance_ready_to_graduate

  return (
    <div className="flex flex-col gap-0.5 mt-0.5">
      {ex.intensity && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
          {ex.intensity}
        </span>
      )}
      <div className="flex items-center gap-1 flex-wrap">
        <span
          className={`inline-flex items-center gap-0.5 rounded border px-1 py-0 text-[10px] leading-4 ${
            readyToGraduate
              ? 'border-primary/40 bg-primary/10 text-primary font-medium'
              : 'border-muted-foreground/40 text-muted-foreground/70'
          }`}
        >
          <LifeBuoy className="size-2.5" />
          {readyToGraduate ? 'Bodyweight (no assist)' : `${ex.suggested_assistance_kg}kg assist`}
        </span>
        <span className="text-[9px] italic text-muted-foreground/60">less over time = stronger</span>
      </div>
      {readyToGraduate && (
        <p className="text-[10px] text-primary/90 italic max-w-xs">
          You've hit full bodyweight range on the assisted rig — try the real, unassisted version next session.
        </p>
      )}
    </div>
  )
}
