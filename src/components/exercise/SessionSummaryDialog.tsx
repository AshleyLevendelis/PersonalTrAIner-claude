// ---------------------------------------------------------------------------
// The end-of-session moment (Part 1: explicit start/finish). The progression
// payoff — what next session will prescribe and why — is the centerpiece,
// not a footnote: it renders largest and first below the stat row, using
// each DoubleProgressionRecommendation's own `note` verbatim (already reads
// like "Hit 8 reps on every set last time — up to 62.5kg next time").
// ---------------------------------------------------------------------------

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Trophy } from 'lucide-react'
import type { SessionSummary } from '@/lib/session-derive'
import type { SessionPRHit } from '@/lib/pr-engine'
import type { DoubleProgressionRecommendation } from '@/lib/progression-engine'

export interface SessionSummaryData {
  summary: SessionSummary
  prs: SessionPRHit[]
  /**
   * Narrowed to what this dialog actually renders — a note and whether it
   * went up — so an ADDED-load progression (a belt, not a bar) can share the
   * line without this component having to know which kind it is. It never
   * shows the number itself, only the sentence, and both engines write their
   * own units into that sentence.
   */
  progressions: (readonly [string, { note: string; didProgress: boolean } | null])[]
}

export function SessionSummaryDialog({
  open,
  onOpenChange,
  data,
  nothingLogged = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: SessionSummaryData | null
  /** Finish was tapped with no working set logged — the day was left open (useActiveSession.finishSession). */
  nothingLogged?: boolean
}) {
  const progressionLines = (data?.progressions ?? []).filter((entry): entry is readonly [string, { note: string; didProgress: boolean }] => entry[1] != null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{nothingLogged ? 'Nothing logged' : 'Session complete'}</DialogTitle>
        </DialogHeader>
        {nothingLogged && (
          <p className="text-sm leading-[1.5] text-muted-foreground">
            No sets were logged, so this didn't count as a session and the day stays open.
            Log at least one set and tap Finish again once you've trained.
          </p>
        )}
        {data && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-[color:var(--surface-deep)] p-2.5">
                <p className="tabular-mono text-lg font-bold">{data.summary.durationMinutes}<span className="text-xs font-normal text-muted-foreground">m</span></p>
                <p className="ds-label-compact mt-0.5">Duration</p>
              </div>
              <div className="rounded-lg bg-[color:var(--surface-deep)] p-2.5">
                <p className="tabular-mono text-lg font-bold">{Math.round(data.summary.totalVolumeKg).toLocaleString()}<span className="text-xs font-normal text-muted-foreground">kg</span></p>
                <p className="ds-label-compact mt-0.5">Volume</p>
              </div>
              <div className="rounded-lg bg-[color:var(--surface-deep)] p-2.5">
                <p className="tabular-mono text-lg font-bold">{data.summary.setsCompleted}<span className="text-xs font-normal text-muted-foreground">/{data.summary.setsPrescribed}</span></p>
                <p className="ds-label-compact mt-0.5">Sets</p>
              </div>
            </div>

            {data.prs.length > 0 && (
              <div className="space-y-1.5">
                <p className="ds-label-compact">New PRs</p>
                {data.prs.map(pr => (
                  <p key={pr.exerciseName} className="flex items-center gap-1.5 text-sm">
                    <Trophy className="size-3.5 text-primary glow-mint shrink-0" />
                    <span className="font-medium">{pr.exerciseName}</span>
                    <span className="tabular-mono text-primary glow-mint">{pr.result.newWeight}kg</span>
                  </p>
                ))}
              </div>
            )}

            {progressionLines.length > 0 && (
              <div className="space-y-2 rounded-xl bg-[color:var(--surface-deep)] p-3.5">
                <p className="ds-label-compact text-primary glow-mint">Next session</p>
                <div className="space-y-2.5">
                  {progressionLines.map(([name, rec]) => (
                    <div key={name}>
                      <p className="text-[0.9375rem] font-semibold leading-tight">{name}</p>
                      <p className={`text-sm mt-0.5 ${rec.didProgress ? 'text-primary glow-mint' : 'text-muted-foreground'}`}>{rec.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
