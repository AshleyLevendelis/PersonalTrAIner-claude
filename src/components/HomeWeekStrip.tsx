// ---------------------------------------------------------------------------
// Home's week row — THE RECORD, not the navigator.
//
// Tab polish, design 2c (31 Oct 2026): seven cells inside the session card,
// under a hairline, with the day letters under them. No affordance at all: no
// handler, no cursor, not a button. Exercise's strip is how you move around
// the week; this one is how the week looks, and offering a tap here would
// promise a peek Home has nowhere to put.
//
// SEVEN LOOKS FOR TEN STATES, and the full state is still spoken. Each state
// maps to the nearest look (weekCircleLook), and every cell keeps its
// aria-label from dayLabel(d) — the one sentence the Exercise strip and the
// coach also use — so nothing the old glyphs said is lost to a screen reader.
// ---------------------------------------------------------------------------
import { countsTowardWeekTally, type TrainingWeekDay } from '@/hooks/useTrainingWeek'
import { dayLabel, SHORT_DAY, weekBoundaryIndex, weekBoundaryNote } from '@/lib/week-glyphs'

export type WeekCircleLook = 'done' | 'partial' | 'missed' | 'today' | 'due' | 'rest' | 'away'

/**
 * Which look a day wears. Exported so the gate asks the function rather than
 * reading a ternary.
 *  - done, and a day swapped for something she did → mint dot
 *  - partly done → half-mint dot
 *  - missed → warn dot
 *  - today, still due → the small mint dot inside today's outline
 *  - a training day still ahead → plain dot
 *  - rest, recovery, before the plan, rest chosen → a dash
 *  - moved away → a dash (the session is on the day it moved to)
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

/** What each look puts in its cell: a dot or a dash, in its colour. Today-due draws its own mint dot. */
const CELL_MARK: Record<WeekCircleLook, { glyph: string; color: string }> = {
  done: { glyph: '●', color: 'var(--primary-text)' },
  partial: { glyph: '●', color: 'color-mix(in srgb, var(--primary-text) 55%, transparent)' },
  missed: { glyph: '●', color: 'var(--role-warn-text)' },
  today: { glyph: '', color: 'var(--primary)' },
  due: { glyph: '●', color: 'var(--muted-foreground)' },
  rest: { glyph: '–', color: 'var(--muted-foreground)' },
  away: { glyph: '–', color: 'var(--muted-foreground)' },
}

/**
 * THE WEEK INSIDE THE SESSION CARD (design 2c): seven 26px cells, Monday to Sunday, the letters under them.
 * Today is outlined in mint whatever happened today (the "you are here" mark); what a cell HOLDS is its state.
 * The week's count is spoken with the group.
 */
export function HomeWeekStrip({ days, todayName, done, planned }: { days: TrainingWeekDay[]; todayName: string; done: number; planned: number }) {
  // WHERE THE TRAINING WEEK CHANGES (docs/plans/week-boundaries.md S5). The strip is Monday to Sunday and the
  // plan's weeks run from the day it began, so most strips hold two of them; a hairline in the gap before the
  // first day of the new one says so, and HomeWeekBoundaryNote says it in words under the strip.
  const boundary = weekBoundaryIndex(days)
  return (
    <div data-home-week role="group" aria-label={`${done} of ${planned} sessions done this week`}>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const isToday = d.dayName === todayName
          const look = weekCircleLook(d, isToday)
          const mark = CELL_MARK[look]
          return (
            <span
              key={d.date}
              // A LIST, not a row of controls: role="img" with a spoken label.
              role="img"
              aria-label={dayLabel(d)}
              data-look={look}
              data-today={isToday ? '' : undefined}
              data-week-boundary={i === boundary ? 'start' : undefined}
              className="relative flex h-[26px] items-center justify-center rounded-[8px] border text-[0.6875rem] leading-none"
              style={isToday
                ? { borderColor: 'rgba(var(--glow-rgb), .45)', background: 'rgba(var(--glow-rgb), .10)', color: mark.color }
                : { borderColor: 'transparent', color: mark.color }}
            >
              {i === boundary && <span aria-hidden className="absolute -left-[3px] top-1 bottom-1 w-px bg-[color:var(--hairline)]" data-testid="home-week-boundary-mark" />}
              {look === 'today'
                ? <span aria-hidden className="glow-mint-box size-1.5 rounded-full" style={{ background: 'var(--primary)' }} />
                : <span aria-hidden className={look === 'done' ? 'glow-mint' : undefined}>{mark.glyph}</span>}
            </span>
          )
        })}
      </div>
      <div aria-hidden className="mt-1 grid grid-cols-7 gap-1 text-center text-[0.625rem] text-muted-foreground">
        {days.map(d => (
          <span key={d.date} className={d.dayName === todayName ? 'font-semibold text-primary-text' : undefined}>
            {(SHORT_DAY[d.dayName] ?? d.dayName).slice(0, 1)}
          </span>
        ))}
      </div>
      <span className="sr-only" data-home-week-count>{done}/{planned}</span>
    </div>
  )
}

/**
 * "Session 2 of 3" for the card's eyebrow: today's place among the week's counted training days, of the same
 * count the tally gives (countsTowardWeekTally). Null when today is not one of them (rest, moved away, swapped):
 * a rest day is never "session N".
 */
export function sessionOrdinal(days: TrainingWeekDay[], todayDate: string): { n: number; of: number } | null {
  const counted = days.filter(d => countsTowardWeekTally(d.state))
  const at = counted.findIndex(d => d.date === todayDate)
  return at < 0 ? null : { n: at + 1, of: counted.length }
}

/** The week boundary in words, under the strip, only on a strip that holds one. */
export function HomeWeekBoundaryNote({ days, todayDate }: { days: TrainingWeekDay[]; todayDate?: string }) {
  const note = todayDate ? weekBoundaryNote(days, todayDate) : null
  return note ? <p className="mt-1 text-center text-[0.625rem] text-muted-foreground" data-testid="home-week-boundary-note">{note}</p> : null
}
