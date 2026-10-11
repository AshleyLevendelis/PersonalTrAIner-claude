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
import { dayLabel, SHORT_DAY } from '@/lib/week-glyphs'

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
  return (
    <div className="flex items-center gap-1.5" data-home-week>
      {days.map(d => {
        const isToday = d.dayName === todayName
        const look = weekCircleLook(d, isToday)
        return (
          <span
            key={d.date}
            // A LIST, not a row of controls: role="img" with a spoken label.
            role="img"
            aria-label={dayLabel(d)}
            data-look={look}
            className={`flex size-[26px] shrink-0 items-center justify-center rounded-full text-[0.65625rem] font-semibold ${look === 'done' || look === 'today' ? 'glow-mint-box' : ''}`}
            style={look === 'done' || look === 'today' ? { ...LOOK[look], '--glow-strength': 'calc(var(--glow-strength, 1) * .45)' } as CSSProperties : LOOK[look]}
          >
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
