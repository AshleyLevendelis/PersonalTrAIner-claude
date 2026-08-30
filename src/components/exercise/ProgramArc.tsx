import { Check, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { MesocycleWeek } from '@/lib/types'

// ---------------------------------------------------------------------------
// The forward-arc outline — block names, what each phase emphasises, where
// deloads fall, so a user can see the shape of the whole 16-week plan
// without scrolling through exercises. Sits above the existing week-pager
// Card (which still handles paging through individual weeks/days) rather
// than replacing it — this is the "see the whole program" layer, that one
// is the "browse this block" layer.
//
// Deliberately reuses only data already on MesocycleWeek (phase_label,
// phase_focus, is_deload, block_number, week_number) — no new generation
// or storage, this is UI-only.
// ---------------------------------------------------------------------------

interface BlockSummary {
  blockNumber: number
  phaseLabel?: string
  phaseFocus?: string
  firstWeek: number
  lastWeek: number
  deloadWeek?: number
  status: 'completed' | 'current' | 'future'
}

function summarizeBlocks(mesocycle: MesocycleWeek[], liveWeek: number): BlockSummary[] {
  const byBlock = new Map<number, MesocycleWeek[]>()
  for (const w of mesocycle) {
    const b = w.block_number ?? 1
    if (!byBlock.has(b)) byBlock.set(b, [])
    byBlock.get(b)!.push(w)
  }
  return Array.from(byBlock.entries())
    .sort(([a], [b]) => a - b)
    .map(([blockNumber, weeksUnsorted]) => {
      const weeks = [...weeksUnsorted].sort((a, b) => a.week_number - b.week_number)
      const firstWeek = weeks[0].week_number
      const lastWeek = weeks[weeks.length - 1].week_number
      const deload = weeks.find(w => w.is_deload)
      // Deload weeks intentionally repeat the block's own phase label/focus
      // (same phase, lighter volume) — preferring a non-deload week here is
      // just belt-and-suspenders in case that ever changes.
      const labelSource = weeks.find(w => !w.is_deload) ?? weeks[0]
      const status: BlockSummary['status'] =
        lastWeek < liveWeek ? 'completed' : firstWeek > liveWeek ? 'future' : 'current'
      return {
        blockNumber,
        phaseLabel: labelSource.phase_label,
        phaseFocus: labelSource.phase_focus,
        firstWeek,
        lastWeek,
        deloadWeek: deload?.week_number,
        status,
      }
    })
}

export function ProgramArc({
  mesocycle,
  liveWeek,
  totalWeeks,
  onJumpToBlock,
}: {
  mesocycle: MesocycleWeek[]
  liveWeek: number
  totalWeeks: number
  onJumpToBlock: (blockNumber: number) => void
}) {
  const blocks = summarizeBlocks(mesocycle, liveWeek)
  if (blocks.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs text-muted-foreground">
        Week {liveWeek} of {totalWeeks}
      </p>
      <div className="space-y-2">
        {blocks.map(b => (
          <button
            key={b.blockNumber}
            type="button"
            onClick={() => onJumpToBlock(b.blockNumber)}
            className="w-full rounded-xl border border-border p-3.5 text-left"
            style={
              b.status === 'current'
                ? { background: 'rgba(var(--glow-rgb),.10)', border: '1px solid rgba(var(--glow-rgb),.4)' }
                : undefined
            }
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                  {b.status === 'completed' ? <Check className="size-3.5" /> : b.blockNumber}
                </span>
                <span className="truncate text-sm font-medium">{b.phaseLabel ?? `Block ${b.blockNumber}`}</span>
                {b.status === 'current' && (
                  <Badge className="h-4 shrink-0 px-1.5 py-0 text-[0.625rem]">You&apos;re here</Badge>
                )}
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>
            {b.phaseFocus && <p className="mt-1 pl-9 text-xs text-muted-foreground">{b.phaseFocus}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-9">
              <span className="text-[0.6875rem] text-muted-foreground">
                Weeks {b.firstWeek}-{b.lastWeek}
              </span>
              {b.deloadWeek != null && (
                <Badge variant="warning" className="h-4 px-1.5 py-0 text-[0.625rem]">
                  Deload
                </Badge>
              )}
              {b.status === 'completed' && (
                <Badge variant="success" className="h-4 px-1.5 py-0 text-[0.625rem]">
                  Completed
                </Badge>
              )}
              {b.status === 'future' && (
                <Badge variant="outline" className="h-4 px-1.5 py-0 text-[0.625rem] text-muted-foreground">
                  Adjusts as you go
                </Badge>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
