import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { useActiveSession } from '@/hooks/useActiveSession'
import { getExerciseId } from '@/lib/exercise-db'
import { computeOffPlanWork } from '@/lib/session-derive'
import { SetGrid, type SetGridProps } from './SetGrid'
import { CardioReceipts, useCardioReceiptsToday } from './CardioSetRow'
import type { Exercise } from '@/lib/types'

// ---------------------------------------------------------------------------
// The union of declared (user-typed) and detected (chat-logged, swapped-
// away) off-plan work (LAYOUT-DESIGN.md §1.7 H) — must not lose either
// half. Detected entries have no remove affordance (nothing to
// un-declare); declared entries with zero logged sets can be removed.
// ---------------------------------------------------------------------------

export function AdditionalWorkSection({
  plannedExercises,
  plannedCardio,
  profile,
  onOpenPlateCalc,
}: {
  plannedExercises: Exercise[]
  /**
   * The activities today's own rows read back (the finisher, the optional
   * close-out) — each claims its log, so it is not drawn a second time here.
   *
   * H7, 9 Oct 2026: this section listed the lifts done outside the plan and
   * none of the cardio. "Add unplanned work → Cardio → skipping rope, 12 min"
   * saved, the panel closed, and the session showed nothing — the tester
   * looked for it exactly here. Read through the same hook the rest day uses.
   */
  plannedCardio: readonly (string | null | undefined)[]
  /**
   * Threaded in 8 Sep 2026, for the same reason the plate-calculator handler
   * was: extra work is loaded work. Without it these rows would be the only
   * place in the app where a 500kg typo went in unquestioned.
   */
  profile?: SetGridProps['profile']
  /**
   * Threaded in 5 Sep 2026. SetGrid draws a plate-calculator button beside
   * every weight input, and this screen rendered SetGrid without a handler —
   * so on the Additional Work rows the button was there, looked identical to
   * the working one three rows up, and did nothing at all when tapped. Extra
   * work is loaded work; there is no reason it should have a worse row.
   */
  onOpenPlateCalc?: (weightKg: number) => void
}) {
  const { logs, declaredOffPlan, undeclareOffPlan, setsFor } = useActiveSession()
  const plannedIds = new Set(plannedExercises.map(ex => ex.id ?? getExerciseId(ex.name)))
  const items = computeOffPlanWork(declaredOffPlan, logs, plannedIds, getExerciseId)
  const cardio = useCardioReceiptsToday(plannedCardio)

  if (items.length === 0 && cardio.receipts.length === 0) return null

  return (
    <div className="space-y-2" data-testid="additional-work">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">Additional work</span>
      {items.map(item => {
        const completedSets = setsFor(item.exerciseId, item.name).length
        return (
          <div key={item.exerciseId} className="rounded-xl p-3 space-y-2 bg-[color:var(--surface-raised)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className="text-[0.625rem] px-1.5 py-0.5 bg-background">+</Badge>
                <span className="font-medium truncate">{item.name}</span>
                {completedSets > 0 && (
                  <Badge variant="secondary" className="text-[0.625rem] font-mono">{completedSets} sets</Badge>
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
              profile={profile}
              onOpenPlateCalc={onOpenPlateCalc}
            />
          </div>
        )
      })}
      <CardioReceipts {...cardio} testid="additional-cardio" />
    </div>
  )
}
