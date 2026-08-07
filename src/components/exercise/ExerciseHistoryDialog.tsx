// ---------------------------------------------------------------------------
// Per-exercise history (Part 3) — every session this exercise appears in,
// newest first, plus a strength trend and a derived PR list. One shared
// instance owned by ExerciseTab, opened from either the day view's ⋯ menu
// (ExerciseRow) or the program view's history icon (ExercisePlan) — same
// dialog, different entry point, following the PlateCalculator precedent.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Trophy } from 'lucide-react'
import { formatCompletedSummary } from '@/lib/session-derive'
import {
  getExerciseHistory,
  deriveStrengthTrend,
  hasEnoughTrendData,
  derivePRHistory,
  type ExerciseHistorySession,
} from '@/lib/exercise-history'
import { ExerciseStrengthChart } from './ExerciseStrengthChart'

export function ExerciseHistoryDialog({
  open,
  onOpenChange,
  exerciseId,
  exerciseName,
  profileId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  exerciseId: string | null
  exerciseName: string | null
  profileId?: string
}) {
  const [sessions, setSessions] = useState<ExerciseHistorySession[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !exerciseId || !profileId) return
    let cancelled = false
    setLoading(true)
    getExerciseHistory(profileId, exerciseId)
      .then(result => { if (!cancelled) setSessions(result) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, exerciseId, profileId])

  const trend = deriveStrengthTrend(sessions)
  const prs = derivePRHistory(sessions)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{exerciseName ?? 'History'}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="ds-label-compact mb-2">Strength trend</p>
              {hasEnoughTrendData(trend) ? (
                <ExerciseStrengthChart points={trend} />
              ) : (
                <p className="text-sm text-muted-foreground">Log this exercise twice to see a trend.</p>
              )}
            </div>

            <div>
              <p className="ds-label-compact mb-2">PRs</p>
              {prs.length > 0 ? (
                <div className="space-y-1.5">
                  {prs.map(pr => (
                    <p key={`${pr.sessionId}-${pr.kind}`} className="flex items-center gap-1.5 text-sm">
                      <Trophy className="size-3.5 text-primary glow-mint shrink-0" />
                      <span className="tabular-mono text-primary glow-mint">{pr.weightKg}kg</span>
                      <span className="text-xs text-muted-foreground">· {pr.date}</span>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No PRs recorded yet.</p>
              )}
            </div>

            <div>
              <p className="ds-label-compact mb-2">Sessions</p>
              {sessions.length > 0 ? (
                <div className="space-y-3">
                  {sessions.map(session => (
                    <div key={session.sessionId} className="border-t pt-2 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--hairline)' }}>
                      <p className="text-xs text-muted-foreground">{session.date}</p>
                      <p className="text-sm tabular-mono">
                        {formatCompletedSummary(
                          session.sets.map(s => ({ set_number: s.setNumber, weight_kg: s.weightKg, reps_completed: s.repsCompleted, is_bodyweight: s.isBodyweight }))
                        )}
                      </p>
                      {session.sets.some(s => s.rpe != null) && (
                        <p className="text-xs text-muted-foreground">
                          RPE {session.sets.filter(s => s.rpe != null).map(s => s.rpe).join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No history yet.</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
