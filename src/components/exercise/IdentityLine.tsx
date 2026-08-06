// ---------------------------------------------------------------------------
// LAYOUT-DESIGN.md §1.4 — TODAY · {weekday} · {focus}. During a dev
// override the marker is persistent, never a one-off toast, so a simulated
// session is never mistaken for a real one mid-scroll.
// ---------------------------------------------------------------------------

import { Button } from '@/components/ui/button'
import { Timer } from 'lucide-react'

export function IdentityLine({
  dayName,
  focus,
  devDay,
  borrowedFrom,
  onOpenTimers,
}: {
  dayName: string
  focus: string
  devDay?: string | null
  borrowedFrom?: string
  onOpenTimers?: () => void
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap justify-between">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-base font-semibold">
          TODAY · {dayName} · {focus}
        </h2>
        {devDay && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[color:var(--role-warn-border)] bg-[color:var(--role-warn-bg)] text-[color:var(--role-warn-text)]">
            DEV · {devDay}
          </span>
        )}
        {borrowedFrom && (
          <span className="text-[10px] text-muted-foreground italic">borrowed from {borrowedFrom}</span>
        )}
      </div>
      {onOpenTimers && (
        <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Timers" onClick={onOpenTimers}>
          <Timer className="size-4" />
        </Button>
      )}
    </div>
  )
}
