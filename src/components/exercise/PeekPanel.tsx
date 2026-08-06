import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRightLeft, Ban, X } from 'lucide-react'
import { formatRampSets } from '@/lib/session-derive'
import { RampStrip } from './RampStrip'
import { LoadChip, type LoadSource } from './LoadChip'
import type { WorkoutDay } from '@/lib/types'

// ---------------------------------------------------------------------------
// LAYOUT-DESIGN.md §2.2 — one other day's content, in place, one tap, one
// tap back. Read-only for logging: no set grid, no logSet reachable
// (asserted structurally — this component never imports SetGrid or the
// hook's write facade). progressedLoads is suppressed by construction: the
// caller passes plan-derived loads only, never the today-only progression
// map, so a peeked day never shows a 'logged' provenance it hasn't earned.
// Swap/ban stay available (they're plan edits, not session acts) via
// callbacks — the confirm dialog itself is owned by the caller (ExerciseTab)
// and shared with the main day's rows.
// ---------------------------------------------------------------------------

export function PeekPanel({
  workout,
  onExit,
  onSwap,
  onBan,
  banBusyName,
}: {
  workout: WorkoutDay
  onExit: () => void
  onSwap: (exIndex: number, exerciseName: string) => void
  onBan: (exerciseName: string) => void | Promise<void>
  banBusyName: string | null
}) {
  const [explainedKey, setExplainedKey] = useState<string | null>(null)

  return (
    <div className="rounded-xl bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">{workout.day} · {workout.focus}</span>
        <Button variant="ghost" size="icon" className="size-7" onClick={onExit} aria-label="Close">
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="p-3 space-y-2">
        {workout.exercises.map((ex, exIndex) => {
          const ramp = formatRampSets(ex)
          const loadSource: LoadSource | undefined = ex.suggested_load_kg == null
            ? undefined
            : (ex.load_source ?? 'estimate')
          return (
            <div key={exIndex} className="rounded-lg bg-[color:var(--surface-raised)] p-2.5 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {ex.superset_label && (
                      <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0.5">{ex.superset_label}</Badge>
                    )}
                    <span className="font-medium text-sm">{ex.name}</span>
                    <span className="text-xs text-muted-foreground">{ex.sets}×{ex.reps}</span>
                  </div>
                  {ramp && <RampStrip ramp={ramp} />}
                  <LoadChip
                    ex={ex}
                    source={loadSource}
                    explained={explainedKey === ex.name}
                    onToggleExplain={() => setExplainedKey(prev => prev === ex.name ? null : ex.name)}
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => onSwap(exIndex, ex.name)} aria-label="Swap exercise">
                    <ArrowRightLeft className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:text-destructive"
                    disabled={banBusyName === ex.name}
                    onClick={() => onBan(ex.name)}
                    aria-label="Ban exercise"
                  >
                    {banBusyName === ex.name ? (
                      <div className="size-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Ban className="size-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
