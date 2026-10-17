// ---------------------------------------------------------------------------
// Home's week row — THE RECORD, not the navigator.
//
// Design handoff 2a (10 Oct 2026): seven 26px circles with the day's letter
// inside, under the session hero. No affordance at all: no handler, no cursor,
// not a button. Exercise's strip is how you move around the week; this one is
// how the week looks, and offering a tap here would promise a peek Home has
// nowhere to put.
//
// FOUR LOOKS FOR TEN STATES, and the full state is still spoken. The brief
// draws done, rest, missed and today; the week has ten states. Each maps to
// the nearest look (below), and every cell keeps its aria-label from
// dayLabel(d) — the one sentence the Exercise strip and the coach also use —
// so nothing the old glyphs said is lost to a screen reader.
// ---------------------------------------------------------------------------
import type { CSSProperties } from 'react'
import type { TrainingWeekDay } from '@/hooks/useTrainingWeek'
import { dayLabel, SHORT_DAY, weekBoundaryIndex, weekBoundaryNote } from '@/lib/week-glyphs'

export type WeekCircleLook = 'done' | 'partial' | 'missed' | 'today' | 'due' | 'rest' | 'away'

/**
 * Which look a day wears. Exported so the gate asks the function rather than
 * reading a ternary.
 *  - done, and a day swapped for something she did → filled
 *  - partly done → accent ring
 *  - missed → warn ring
 *  - today, still due → accent ring with glow
 *  - a training day still ahead → plain raised circle
 *  - rest, recovery, before the plan, rest chosen → sunken and dim
 *  - moved away → sunken and dim (the session is on the day it moved to)
 */
export function weekCircleLook(d: Pick<TrainingWeekDay, 'state'>, isToday: boolean): WeekCircleLook {
  switch (d.state) {
    case 'done': case 'swapped': return 'done'
    case 'partial': return 'partial'
    case 'missed': return 'missed'
    case 'due': return isToday ? 'today' : 'due'
    case 'moved': return 'away'
    default: return 'rest'
  }
}

const LOOK: Record<WeekCircleLook, CSSProperties> = {
  done: { background: 'var(--primary)', color: 'var(--primary-foreground)' },
  partial: { background: 'rgba(var(--glow-rgb), .14)', boxShadow: 'inset 0 0 0 1.5px var(--primary)', color: 'var(--primary-text)' },
  missed: { background: 'transparent', boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--role-warn) 60%, transparent)', color: 'var(--role-warn-text)' },
  today: { background: 'transparent', boxShadow: 'inset 0 0 0 1.5px var(--primary)', color: 'var(--primary-text)' },
  due: { background: 'var(--surface-raised)', color: 'var(--text-tertiary)' },
  rest: { background: 'var(--surface-sunken)', color: 'var(--text-dim)' },
  away: { background: 'var(--surface-sunken)', color: 'var(--text-dim)' },
}

export function HomeWeekStrip({ days, todayName, done, planned }: { days: TrainingWeekDay[]; todayName: string; done: number; planned: number }) {
  // WHERE THE TRAINING WEEK CHANGES (docs/plans/week-boundaries.md S5). The strip is Monday to Sunday and the
  // plan's weeks run from the day it began, so most strips hold two of them; a hairline in the gap before the
  // first day of the new one says so, and HomeWeekBoundaryNote says it in words under the strip.
  const boundary = weekBoundaryIndex(days)
  return (
    <div className="flex items-center gap-1.5" data-home-week>
      {days.map((d, i) => {
        const isToday = d.dayName === todayName
        const look = weekCircleLook(d, isToday)
        return (
          <span
            key={d.date}
            // A LIST, not a row of controls: role="img" with a spoken label.
            role="img"
            aria-label={dayLabel(d)}
            data-look={look}
            data-week-boundary={i === boundary ? 'start' : undefined}
            className={`relative flex size-[26px] shrink-0 items-center justify-center rounded-full text-[0.65625rem] font-semibold ${look === 'done' || look === 'today' ? 'glow-mint-box' : ''}`}
            style={look === 'done' || look === 'today' ? { ...LOOK[look], '--glow-strength': 'calc(var(--glow-strength, 1) * .45)' } as CSSProperties : LOOK[look]}
          >
            {i === boundary && <span aria-hidden className="absolute -left-[4px] top-0.5 bottom-0.5 w-px bg-border" data-testid="home-week-boundary-mark" />}
            <span aria-hidden>{(SHORT_DAY[d.dayName] ?? d.dayName.slice(0, 3)).slice(0, 1)}</span>
          </span>
        )
      })}
      <span className="ml-auto tabular-mono text-[0.75rem] text-text-tertiary" data-home-week-count aria-label={`${done} of ${planned} sessions done this week`}>
        {done}/{planned}
      </span>
    </div>
  )
}

/** The week boundary in words, under the strip, only on a strip that holds one. */
export function HomeWeekBoundaryNote({ days, todayDate }: { days: TrainingWeekDay[]; todayDate?: string }) {
  const note = todayDate ? weekBoundaryNote(days, todayDate) : null
  return note ? <p className="mt-1 text-center text-[0.625rem] text-muted-foreground" data-testid="home-week-boundary-note">{note}</p> : null
}

/**
 * THE WEEK AS SEVEN DOTS on Home's session row (one-page Home, 17 Oct 2026, design 5c·5): 7px, gap 5.
 * Done is accent with glow, missed is warn, today a hollow accent ring, a training day still ahead a dim
 * ring, rest dim. The same looks as the strip above (weekCircleLook), so the two cannot disagree, and every
 * dot keeps its spoken sentence; the count is spoken with the group.
 */
const DOT_LOOK: Record<WeekCircleLook, CSSProperties> = {
  done: { background: 'var(--primary)' },
  partial: { background: 'color-mix(in srgb, var(--primary) 50%, transparent)' },
  missed: { background: 'color-mix(in srgb, var(--role-warn) 70%, transparent)' },
  today: { boxShadow: 'inset 0 0 0 1.5px var(--primary)' },
  due: { boxShadow: 'inset 0 0 0 1.5px var(--text-dim)' },
  rest: { background: 'var(--text-dim)' },
  away: { background: 'var(--text-dim)' },
}
export function HomeWeekDots({ days, todayName, done, planned }: { days: TrainingWeekDay[]; todayName: string; done: number; planned: number }) {
  const boundary = weekBoundaryIndex(days)
  return (
    <span className="flex items-center gap-[5px]" data-home-week role="group" aria-label={`${done} of ${planned} sessions done this week`}>
      {days.map((d, i) => {
        const look = weekCircleLook(d, d.dayName === todayName)
        return (
          <span
            key={d.date}
            role="img"
            aria-label={dayLabel(d)}
            data-look={look}
            data-week-boundary={i === boundary ? 'start' : undefined}
            className={`relative block size-[7px] shrink-0 rounded-full ${look === 'done' ? 'glow-mint-box' : ''}`}
            style={DOT_LOOK[look]}
          >
            {i === boundary && <span aria-hidden className="absolute -left-[3px] -top-0.5 -bottom-0.5 w-px bg-border" data-testid="home-week-boundary-mark" />}
          </span>
        )
      })}
      <span className="sr-only" data-home-week-count>{done}/{planned}</span>
    </span>
  )
}
