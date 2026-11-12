import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, ChevronUp, Dumbbell, Footprints, Moon } from 'lucide-react'
import type { TrainingWeekDay } from '@/hooks/useTrainingWeek'
import type { Exercise } from '@/lib/types'
import { getExerciseEntry } from '@/lib/exercise-db'
import { unloadedLoadLabel } from '@/lib/load-prescription'
import { weekDayRow, weekMainLift, exerciseLoadBadge, loadPhrase, type WeekDayRow } from '@/lib/exercise-week'
import { Swatch } from './ExerciseBar'
import { groupsUpTo } from './ReadOnlyDayList'
import { groupExercises } from '@/lib/session-derive'

// ---------------------------------------------------------------------------
// XW3: THE WEEK ON ONE SCREEN (his Exercise Week handoff, 12 Nov 2026: "I like this way of seeing the upcoming week's
// sessions"). Shown ONLY when "Week" is tapped ("this should be only when you select to view the week, otherwise show
// just the day's workout"). One row per day, Monday to Sunday, read off the training week the strip and Home read
// (useTrainingWeek): a ring that is full with a tick when the day is done, the main lift and its weight, the minutes,
// and "Done" or a chevron. A rest day is one quiet line. A tap opens a day in place, ONE at a time. Read-only, as browse
// is: the opened day is drawn by the ONE read-only day list (each exercise with its ⋮, swap and ban, as on a peeked
// day), its first few exercises only, and "N more exercises ›" is the peek the strip opens.
// ---------------------------------------------------------------------------

const DAY3: Record<string, string> = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' }
const SHOWN = 3

const unloadedFor = (ex: Exercise): string | null => {
  const e = getExerciseEntry(ex.name)
  const stated = ex.suggested_load_kg != null || ex.suggested_assistance_kg != null || ex.suggested_added_load_kg != null
  return e && !stated ? unloadedLoadLabel(e) : null
}

function DayRing({ kind, done }: { kind: 'session' | 'recovery'; done: boolean }) {
  const ink = kind === 'recovery' ? 'var(--ramp-label)' : 'var(--primary)'
  const Icon = done ? Check : kind === 'recovery' ? Footprints : Dumbbell
  return (
    <span
      className="flex size-11 shrink-0 items-center justify-center rounded-full"
      data-day-ring={done ? 'full' : 'empty'}
      style={done
        ? { boxShadow: `inset 0 0 0 4px ${ink}`, color: ink }
        : { boxShadow: 'inset 0 0 0 4px color-mix(in srgb, var(--foreground) 9%, transparent)', color: 'var(--muted-foreground)' }}
    >
      <Icon className="size-4" strokeWidth={done ? 3 : 2} aria-hidden />
    </span>
  )
}

export function ExerciseWeekView({ days, todayName, onOpenDay, renderDay }: {
  days: TrainingWeekDay[]
  todayName: string
  /** The opened day's first `limit` exercises, drawn by the shared read-only day list (TodayPanel wires its handlers). */
  renderDay: (day: TrainingWeekDay, limit: number) => ReactNode
  /** Closes the week and shows that day: today's own view for today, the strip's peek for any other. */
  onOpenDay: (dayName: string) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2" data-testid="exercise-week">
      {days.map(day => {
        const row: WeekDayRow = weekDayRow(day, unloadedFor)
        const isToday = day.dayName === todayName
        const label = `${isToday ? 'Today' : `${DAY3[day.dayName] ?? day.dayName} ${Number(day.date.slice(8, 10))}`}`
        if (row.kind === 'rest') {
          return (
            <div key={day.date} className="flex min-h-12 items-center gap-3 px-3.5 text-[0.875rem] text-text-tertiary" data-week-day={day.date} data-week-day-kind="rest">
              <Moon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <span className={`font-semibold ${isToday ? 'text-primary-text' : 'text-foreground'}`}>{label}</span> · Rest day{row.note ? ` · ${row.note}` : ''}
              </span>
            </div>
          )
        }
        const isOpen = open === day.date
        const session = day.session
        const total = session && row.kind === 'session' ? session.exercises.length : 0
        // Whole groups, as the list draws them: a superset is never cut in half, so "N more" counts what is really left.
        const shown = session && row.kind === 'session'
          ? groupsUpTo(groupExercises(session.exercises), SHOWN).reduce((n, g) => n + (g.kind === 'single' ? 1 : g.members.length), 0)
          : 0
        const main = session && row.kind === 'session' ? weekMainLift(session) : null
        const mainPhrase = main ? loadPhrase(exerciseLoadBadge(main, unloadedFor(main))) : null
        return (
          <div
            key={day.date}
            className="rounded-[18px]"
            style={{
              background: isToday ? 'color-mix(in srgb, var(--primary) 8%, var(--surface-deep))' : 'color-mix(in srgb, var(--foreground) 4%, transparent)',
              border: `1px solid ${isOpen ? 'color-mix(in srgb, var(--ramp-label) 75%, transparent)' : isToday ? 'rgba(var(--glow-rgb), .35)' : 'transparent'}`,
            }}
            data-week-day={day.date}
            data-week-day-kind={row.kind}
            data-week-day-open={isOpen ? 'yes' : 'no'}
            data-week-day-done={row.done ? 'yes' : 'no'}
          >
            <button
              type="button"
              onClick={() => setOpen(o => (o === day.date ? null : day.date))}
              aria-expanded={isOpen}
              className="flex min-h-16 w-full items-center gap-3 px-3.5 py-2.5 text-left"
            >
              <DayRing kind={row.kind} done={row.done} />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold leading-[1.25]" data-week-day-title>
                  <span className={isToday ? 'text-primary-text' : ''}>{label}</span> · {row.title}
                </span>
                <span className="mt-0.5 block truncate text-[0.75rem] text-muted-foreground" data-week-day-line>
                  {isOpen && row.kind === 'session'
                    ? [`${row.sets} sets`, main ? [main.name, mainPhrase].filter(Boolean).join(' ') : null].filter(Boolean).join(' · ')
                    : row.status ?? row.line}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                <Swatch color={row.kind === 'recovery' ? 'var(--ramp-track-done)' : 'var(--working-track-done)'} />
                <span className="tabular-mono text-[0.875rem] font-bold text-foreground" data-week-day-minutes>{row.minutes}</span> min
              </span>
              {row.done && !isOpen
                ? <span className="shrink-0 text-[0.75rem] font-semibold text-primary-text" data-week-day-status="done">Done</span>
                : isOpen ? <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            </button>
            {isOpen && (
              <div className="px-3.5 pb-1" data-week-day-list>
                {row.kind === 'recovery' && session?.plannedActivity && (
                  <p className="border-t border-[color:var(--hairline)] py-3 text-[0.875rem]">
                    {session.plannedActivity.activity} · <span className="tabular-mono">{session.plannedActivity.duration}</span> min
                    {session.plannedActivity.reason && <span className="mt-1 block text-[0.75rem] text-muted-foreground">{session.plannedActivity.reason}</span>}
                  </p>
                )}
                {row.kind === 'session' && <div className="border-t border-[color:var(--hairline)]" data-week-day-exercises data-week-day-total={total}>{renderDay(day, SHOWN)}</div>}
                <button
                  type="button"
                  onClick={() => onOpenDay(day.dayName)}
                  className="flex min-h-11 w-full items-center justify-between border-t border-[color:var(--hairline)] text-[0.8125rem] font-semibold text-primary-text"
                  data-testid="week-day-more"
                >
                  {total > shown ? `${total - shown} more exercise${total - shown === 1 ? '' : 's'}` : isToday ? "Open today's workout" : `Open ${day.dayName}`}
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
