import type { TrainingWeekDay } from '@/hooks/useTrainingWeek'

// ---------------------------------------------------------------------------
// LAYOUT-DESIGN.md §1.3 — seven cells, always, today boxed. Marks only, no
// volume numbers or focus labels (open question Q2 — as-designed default:
// marks only). Tap a non-today cell opens the peek in place; tapping
// today's own boxed cell is a no-op (there's nothing to peek at — you're
// already looking at it).
// ---------------------------------------------------------------------------

const GLYPH: Record<TrainingWeekDay['state'], string> = {
  done: '✓',
  partial: '◐',
  due: '●',
  missed: '○',
  rest: '–',
  recovery: '~',
}

const SHORT_DAY: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu',
  Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
}

export function WeekStrip({
  days,
  todayName,
  onSelectDay,
}: {
  days: TrainingWeekDay[]
  todayName: string
  onSelectDay: (dayName: string) => void
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map(d => {
        const isToday = d.dayName === todayName
        return (
          <button
            key={d.date}
            type="button"
            onClick={() => { if (!isToday) onSelectDay(d.dayName) }}
            className={`flex flex-col items-center gap-0.5 rounded-md py-1.5 text-xs transition-colors ${
              isToday ? 'bg-primary/10 border border-primary/40 font-semibold' : 'hover:bg-accent/40'
            }`}
            aria-label={`${d.dayName}: ${d.state}`}
          >
            <span className="text-[10px] text-muted-foreground">{SHORT_DAY[d.dayName] ?? d.dayName.slice(0, 3)}</span>
            <span className="text-sm leading-none">{GLYPH[d.state]}</span>
          </button>
        )
      })}
    </div>
  )
}
