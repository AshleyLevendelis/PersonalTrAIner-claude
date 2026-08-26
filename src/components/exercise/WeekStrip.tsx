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
  // A training day that fell before this plan existed. Deliberately the
  // faintest mark in the set: it is not a rest day (the plan didn't choose
  // it) and emphatically not a missed one (nothing was ever owed).
  before_plan: '·',
  // Lifting deliberately swapped for something else, announced at the time.
  // Distinct from every mark above because it is the only one that says work
  // HAPPENED but not this work — an arrow, not an absence.
  swapped: '⇄',
}

/**
 * Spoken form of each state. The aria-label used to interpolate the raw
 * state name, so a screen reader announced "partial" and would now announce
 * "before_plan" — identifiers, not English.
 */
const STATE_LABEL: Record<TrainingWeekDay['state'], string> = {
  done: 'done',
  partial: 'partly done',
  due: 'due',
  missed: 'missed',
  rest: 'rest day',
  recovery: 'active recovery',
  before_plan: 'before your plan started',
  swapped: 'swapped for another activity',
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
            // Density pass 3b: today is marked by a lit label and (when the
            // session is still outstanding) a pulsing mint dot — no fill, no
            // border. The state glyph is kept for every other case so a
            // done/missed/rest day still reads at a glance.
            className={`flex flex-col items-center gap-1 rounded-md py-1.5 text-xs transition-colors ${
              isToday ? 'font-semibold' : 'hover:bg-accent/40'
            }`}
            aria-label={`${d.dayName}: ${STATE_LABEL[d.state]}`}
          >
            <span className={`text-[10px] ${isToday ? 'text-primary glow-mint' : 'text-muted-foreground'}`}>
              {SHORT_DAY[d.dayName] ?? d.dayName.slice(0, 3)}
            </span>
            {isToday && d.state === 'due' ? (
              <span aria-hidden className="my-[3px] size-[7px] rounded-full bg-primary glow-dot" />
            ) : (
              <span className={`text-sm leading-none ${isToday ? 'text-primary glow-mint' : ''}`}>{GLYPH[d.state]}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
