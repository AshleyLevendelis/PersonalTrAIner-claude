import { Check } from 'lucide-react'
import { calendarShortLabel, type ProgramCalendarRow } from '@/lib/program-calendar'
import { shortPhaseLabel } from '@/lib/periodization'
import type { TrainingWeekDay } from '@/hooks/useTrainingWeek'

// ---------------------------------------------------------------------------
// THE PROGRAM AS A CALENDAR (10 Nov 2026, Ashley: "the option to see my training weeks as a calendar view", the phase
// strip above it kept exactly as it is). One row per calendar week, Monday to Sunday, real dates, each date's session
// read from the plan week that date is in (program-calendar.ts). Read-only: a tap opens that day in the list, where
// every change to it already lives. What happened this week (a move, a swap) comes from the same week read the list
// uses, so the two views cannot disagree about it; a logged day carries the list's own tick.
// ---------------------------------------------------------------------------

const HEAD = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

interface ProgramCalendarProps {
  rows: ProgramCalendarRow[]
  todayDate: string
  /** This week's days as the list reads them (moves and swaps laid over the plan), keyed by date. */
  liveCells: Map<string, TrainingWeekDay>
  /** `${planWeek}|${dayName}`, as the list's own ticks are keyed. */
  loggedDays: Set<string>
  /** The plan week whose rows the screen is showing in the list, so the calendar marks it. */
  browseWeek: number
  onPick: (planWeek: number, dayName: string) => void
}

export function ProgramCalendar({ rows, todayDate, liveCells, loggedDays, browseWeek, onPick }: ProgramCalendarProps) {
  if (rows.length === 0) {
    return <p className="mt-5 text-[0.8125rem] text-muted-foreground" data-testid="program-calendar-empty">The calendar appears once your plan has its weeks.</p>
  }
  let lastBlock: number | null = null
  return (
    <div className="mt-5 flex flex-col" data-testid="program-calendar">
      <div className="grid grid-cols-[34px_repeat(7,minmax(0,1fr))] gap-x-1 pb-1.5" aria-hidden>
        <span />
        {HEAD.map((d, i) => (
          <span key={i} className="text-center text-[0.625rem] font-semibold uppercase tracking-[.1em] text-muted-foreground">{d}</span>
        ))}
      </div>
      {rows.map(row => {
        const inPlan = row.cells.filter(c => c.planWeek != null)
        const weeks = [...new Set(inPlan.map(c => c.planWeek as number))]
        const block = inPlan[0]?.blockNumber ?? null
        const blockStarts = block != null && block !== lastBlock
        if (block != null) lastBlock = block
        const phase = inPlan[0]?.phaseLabel ?? null
        const weekLabel = weeks.length === 0 ? '' : weeks.length === 1 ? `W${weeks[0]}` : `W${weeks[0]}–${weeks[weeks.length - 1]}`
        const holdsToday = row.cells.some(c => c.date === todayDate)
        return (
          <div key={row.monday} className="flex flex-col">
            {(blockStarts || row.monthLabel) && (
              <div className="mt-2.5 mb-1 flex items-baseline justify-between gap-2 px-0.5">
                {row.monthLabel
                  ? <span className="text-[0.75rem] font-semibold text-foreground" data-calendar-month>{row.monthLabel}</span>
                  : <span />}
                {blockStarts && phase && (
                  <span className="truncate text-[0.625rem] font-semibold uppercase tracking-[.1em]" style={{ color: 'var(--primary-text)' }} data-calendar-block>
                    {shortPhaseLabel(phase)}
                  </span>
                )}
              </div>
            )}
            <div
              className="grid grid-cols-[34px_repeat(7,minmax(0,1fr))] gap-x-1 py-[3px]"
              data-calendar-row={row.monday}
              style={holdsToday ? { background: 'color-mix(in srgb, var(--primary) 6%, transparent)', borderRadius: 10 } : undefined}
            >
              <span
                className={`self-center text-center text-[0.6875rem] font-semibold tabular-nums ${weeks.includes(browseWeek) ? '' : 'text-muted-foreground'}`}
                style={weeks.includes(browseWeek) ? { color: 'var(--primary-text)' } : undefined}
              >
                {weekLabel}
              </span>
              {row.cells.map(cell => {
                const live = liveCells.get(cell.date)
                const isToday = cell.date === todayDate
                const outside = cell.kind === 'outside'
                // WHAT RUNS HERE THIS WEEK, from the list's own week read: a session moved away leaves the day empty,
                // and one moved in is drawn where it landed.
                const movedTo = live?.movedTo ?? null
                const movedIn = live?.movedFrom ? live.session ?? null : null
                const kind = movedTo ? 'rest' : movedIn ? (movedIn.exercises.length > 0 ? 'train' : 'activity') : cell.kind
                const focus = movedIn ? movedIn.focus ?? cell.focus : cell.focus
                const swapped = live?.state === 'swapped'
                const done = cell.planWeek != null && loggedDays.has(`${cell.planWeek}|${cell.dayName}`)
                const trains = kind === 'train' || kind === 'activity'
                const missed = !!live?.markedMissed
                const rested = !!live?.deliberateRest
                const label = swapped ? 'Swap' : movedTo ? `→${movedTo.dayName.slice(0, 3)}` : missed ? 'Missed' : rested ? 'Rest' : calendarShortLabel(focus, kind)
                const background = outside
                  ? 'transparent'
                  : trains
                    ? cell.deload
                      ? 'color-mix(in srgb, var(--role-warn) 16%, transparent)'
                      : 'color-mix(in srgb, var(--primary) 14%, transparent)'
                    : 'color-mix(in srgb, var(--border) 40%, transparent)'
                const describe = outside
                  ? `${cell.dayName} ${cell.dayOfMonth}, outside your plan`
                  : `${cell.dayName} ${cell.dayOfMonth}, week ${cell.planWeek}: ${movedTo ? `moved to ${movedTo.dayName}` : swapped ? 'swapped' : missed ? `${focus ?? 'session'}, missed` : rested ? 'rest day you chose' : trains ? focus ?? 'session' : 'rest'}${done ? ', done' : ''}${isToday ? ', today' : ''}`
                return (
                  <button
                    key={cell.date}
                    type="button"
                    disabled={outside}
                    aria-label={describe}
                    aria-current={isToday ? 'date' : undefined}
                    data-calendar-date={cell.date}
                    data-calendar-kind={movedTo ? 'moved' : swapped ? 'swapped' : missed ? 'missed' : rested ? 'rested' : kind}
                    onClick={() => { if (cell.planWeek != null) onPick(cell.planWeek, cell.dayName) }}
                    className="relative flex min-h-[48px] min-w-0 flex-col items-center justify-start rounded-[9px] border-0 px-0.5 pt-1 pb-1 disabled:cursor-default"
                    style={{
                      background,
                      boxShadow: isToday ? 'inset 0 0 0 1.5px var(--primary)' : undefined,
                      opacity: outside ? 0.35 : 1,
                    }}
                  >
                    <span className={`text-[0.6875rem] tabular-nums leading-none ${isToday ? 'font-bold' : 'font-medium'} ${trains ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {cell.dayOfMonth}
                    </span>
                    {label && (
                      <span className={`mt-1 w-full truncate text-center text-[0.59375rem] leading-tight ${trains ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                        {label}
                      </span>
                    )}
                    {done && (
                      <Check aria-hidden className="absolute right-[3px] top-[3px] size-[10px] text-[color:var(--primary-text)]" strokeWidth={3} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[0.6875rem] text-muted-foreground" data-testid="program-calendar-key">
        <span className="inline-flex items-center gap-1"><span className="inline-block size-2.5 rounded-[3px]" style={{ background: 'color-mix(in srgb, var(--primary) 34%, transparent)' }} />Session</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block size-2.5 rounded-[3px]" style={{ background: 'color-mix(in srgb, var(--role-warn) 34%, transparent)' }} />Deload week</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block size-2.5 rounded-[3px]" style={{ background: 'color-mix(in srgb, var(--border) 70%, transparent)' }} />Rest</span>
        <span>Tap a day to open it.</span>
      </div>
    </div>
  )
}
