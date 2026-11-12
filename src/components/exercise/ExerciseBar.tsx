import { ArrowUp } from 'lucide-react'
import { setBarSegments, type LoadBadge } from '@/lib/exercise-week'

// ---------------------------------------------------------------------------
// THE EXERCISE ROW'S DRAWN PARTS (his Exercise Week handoff, 12 Nov 2026): the load on the right with its blue swatch
// and unit, the set bar under the name, and the legend line under the bar. Shared by today's rows, the open card, a
// peeked day and the week view, so the four cannot drift. Tokens only, so all nine themes keep working: the warm-up
// violet and the working mint are the ramp/working track pair the app already had.
// ---------------------------------------------------------------------------

/** Every number on a row has an 8px square in front of it, radius 3 (the Nutrition rule). */
export function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="block size-2 shrink-0 rounded-[3px]" style={{ background: color }} data-swatch />
}

/**
 * THE LOAD: a blue swatch, the value in mono with its unit, and the qualifier under it ("per hand", "bodyweight").
 * `progressing` keeps the row's old up-arrow when the load went up from last session.
 */
export function LoadBadgeView({ badge, progressing = false, size = 'row', valueTestId }: { badge: LoadBadge; progressing?: boolean; size?: 'row' | 'small'; valueTestId?: string }) {
  return (
    <span className="flex shrink-0 flex-col items-end" data-load-badge data-load-chip={progressing ? 'up' : 'hold'}>
      <span className="flex items-center gap-1.5">
        <Swatch color="var(--chart-3)" />
        {progressing && <ArrowUp className="size-3 text-primary-text" aria-label="up from last session" />}
        <span className={`tabular-mono font-bold leading-none ${size === 'row' ? 'text-[1.0625rem]' : 'text-[0.875rem]'}`} data-testid={valueTestId}>
          {badge.value}{badge.unit ? <span className="ml-1">{badge.unit}</span> : null}
        </span>
      </span>
      {badge.qualifier && (
        <span className="mt-1 text-[0.625rem] font-semibold uppercase leading-none tracking-[.12em] text-muted-foreground" data-load-qualifier>{badge.qualifier}</span>
      )}
    </span>
  )
}

/**
 * THE SET BAR: one rounded 8px segment per set, 3px apart; warm-ups first in violet, a 6px space, then working sets in
 * dim mint, filled as they are logged. aria-hidden: the counts are spoken by the legend and the status circle.
 */
export function SetBar({ rampTotal, rampDone, workingTotal, workingDone, className }: { rampTotal: number; rampDone: number; workingTotal: number; workingDone: number; className?: string }) {
  const segs = setBarSegments(rampTotal, rampDone, workingTotal, workingDone)
  if (segs.length === 0) return null
  return (
    <span className={`flex items-center gap-[3px] ${className ?? ''}`} aria-hidden data-set-bar>
      {segs.map((s, i) => (
        <span key={i} className="contents">
          {i > 0 && s.kind === 'working' && segs[i - 1].kind === 'warmup' && <span className="w-[3px] shrink-0" />}
          <span
            className="block h-2 flex-1 rounded-full"
            data-seg={s.kind}
            data-seg-done={s.done ? 'yes' : 'no'}
            style={{ background: s.kind === 'warmup'
              ? (s.done ? 'var(--ramp-track-done)' : 'var(--ramp-track-pending)')
              : (s.done ? 'var(--working-track-done)' : 'var(--working-track-pending)') }}
          />
        </span>
      ))}
    </span>
  )
}

/** THE LEGEND: "■ 2 warm-up  ■ 3 × 11-13 working", or "■ 2 × 8 easy" for a warm-up move. */
export function SetLegend({ warmups, dose, word, className }: { warmups: number | null; dose: string; word: 'working' | 'easy'; className?: string }) {
  return (
    <span className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 ${className ?? ''}`} data-set-legend>
      {warmups != null && (
        <span className="flex items-center gap-1.5 whitespace-nowrap" data-legend="warmup">
          <Swatch color="var(--ramp-track-done)" />
          <span className="tabular-mono text-[0.875rem] font-bold text-foreground">{warmups}</span>
          <span className="text-[0.8125rem] text-text-tertiary">warm-up</span>
        </span>
      )}
      <span className="flex items-center gap-1.5 whitespace-nowrap" data-legend={word}>
        <Swatch color="var(--working-track-done)" />
        <span className="tabular-mono text-[0.875rem] font-bold text-foreground">{dose}</span>
        <span className="text-[0.8125rem] text-text-tertiary">{word}</span>
      </span>
    </span>
  )
}
