import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getExerciseId } from '@/lib/exercise-db'
import { computeOffPlanWork } from '@/lib/session-derive'
import { SetGrid } from './SetGrid'
import type { Exercise } from '@/lib/types'

// ---------------------------------------------------------------------------
// The union of declared (user-typed) and detected (chat-logged, swapped-
// away) off-plan work (LAYOUT-DESIGN.md §1.7 H) — must not lose either
// half. Detected entries have no remove affordance (nothing to
// un-declare); declared entries with zero logged sets can be removed.
// ---------------------------------------------------------------------------

export function AdditionalWorkSection({ plannedExercises }: { plannedExercises: Exercise[] }) {
  const { logs, declaredOffPlan, undeclareOffPlan, setsFor } = useActiveSession()
  const plannedIds = new Set(plannedExercises.map(ex => ex.id ?? getExerciseId(ex.name)))
  const items = computeOffPlanWork(declaredOffPlan, logs, plannedIds, getExerciseId)

  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Additional work</span>
      {items.map(item => {
        const completedSets = setsFor(item.exerciseId, item.name).length
        return (
          <div key={item.exerciseId} className="rounded-xl p-3 space-y-2 bg-[color:var(--surface-raised)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-background">+</Badge>
                <span className="font-medium truncate">{item.name}</span>
                {completedSets > 0 && (
                  <Badge variant="secondary" className="text-[10px] font-mono">{completedSets} sets</Badge>
                )}
              </div>
              {item.source === 'declared' && completedSets === 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  onClick={() => undeclareOffPlan(item.name)}
                  aria-label="Remove"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </div>
            <SetGrid
              exerciseName={item.name}
              exerciseId={item.exerciseId}
              totalSets={3}
              prescribedReps="8-12"
              restTime="60s"
            />
          </div>
        )
      })}
    </div>
  )
}
