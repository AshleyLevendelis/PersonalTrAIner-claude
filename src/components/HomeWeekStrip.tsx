// ---------------------------------------------------------------------------
// Home's week strip — THE RECORD, not the navigator.
//
// The same seven marks Exercise shows, at 26px instead of 38px and with no
// affordance at all: no handler, no cursor, no focus ring, not a button. That
// is the whole distinction. Exercise's strip is how you move around the week;
// this one is how the week looks, and offering a tap here would promise a
// peek that Home has nowhere to put.
//
// Glyphs come from the shared vocabulary so the two strips cannot drift into
// meaning different things by the same mark.
// ---------------------------------------------------------------------------
import type { TrainingWeekDay } from '@/hooks/useTrainingWeek'
import { GLYPH, STATE_LABEL, SHORT_DAY } from '@/lib/week-glyphs'

export function HomeWeekStrip({ days, todayName }: { days: TrainingWeekDay[]; todayName: string }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map(d => {
        const isToday = d.dayName === todayName
        const isDone = d.state === 'done'
        return (
          <div
            key={d.date}
            // A LIST, not a row of controls. role="img" with a spoken label
            // keeps it legible to a screen reader without announcing seven
            // buttons that do nothing.
            role="img"
            aria-label={`${d.dayName}: ${STATE_LABEL[d.state]}`}
            className="flex h-[26px] flex-col items-center justify-center rounded-lg"
            style={{
              background: isToday
                ? 'rgba(var(--glow-rgb), .10)'
                : isDone ? 'rgba(var(--glow-rgb), .16)' : 'transparent',
              border: isToday ? '1px solid rgba(var(--glow-rgb), .45)' : '1px solid transparent',
            }}
          >
            {isToday ? (
              <span aria-hidden className="size-[6px] rounded-full bg-primary" />
            ) : (
              <span
                aria-hidden
                className={`leading-none ${isDone ? 'text-[0.75rem] text-primary' : 'text-[0.6875rem] text-muted-foreground'}`}
              >
                {GLYPH[d.state]}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Mon–Sun, under the strip. Separate so the strip itself stays 26px exactly. */
export function HomeWeekStripLabels({ days }: { days: TrainingWeekDay[] }) {
  return (
    <div className="mt-1 grid grid-cols-7 gap-1" aria-hidden>
      {days.map(d => (
        <span key={d.date} className="text-center text-[0.625rem] text-muted-foreground">
          {(SHORT_DAY[d.dayName] ?? d.dayName.slice(0, 3)).slice(0, 1)}
        </span>
      ))}
    </div>
  )
}
