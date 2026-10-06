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
import { GLYPH, STATE_LABEL, SHORT_DAY, weekBoundaryIndex, weekBoundaryNote } from '@/lib/week-glyphs'

export function HomeWeekStrip({ days, todayName }: { days: TrainingWeekDay[]; todayName: string }) {
  // WHERE THE TRAINING WEEK CHANGES. The strip is Monday to Sunday and the plan's weeks run from the day it
  // began, so most strips hold two of them; a hairline in the gap before the first day of the new one says so.
  const boundary = weekBoundaryIndex(days)
  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((d, i) => {
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
            className="relative flex h-[26px] flex-col items-center justify-center rounded-lg"
            data-week-boundary={i === boundary ? 'start' : undefined}
            style={{
              background: isToday
                ? 'rgba(var(--glow-rgb), .10)'
                : isDone ? 'rgba(var(--glow-rgb), .16)' : 'transparent',
              border: isToday ? '1px solid rgba(var(--glow-rgb), .45)' : '1px solid transparent',
            }}
          >
            {i === boundary && <span aria-hidden className="absolute -left-[3px] top-0.5 bottom-0.5 w-px bg-border" data-testid="home-week-boundary-mark" />}
            {/* TODAY'S CELL SAYS WHAT HAPPENED. This drew a plain dot for
                today whatever its state, so a day swapped, moved or finished
                TODAY could never show ⇄, → or ✓ here — Ashley, 8 Sep 2026:
                "still not moving markers". The dot now means exactly what it
                means on the Exercise strip (WeekContextRow): due, and only
                due. Same rule, same glyph file, so the two cannot drift. */}
            {isToday && d.state === 'due' ? (
              <span aria-hidden className="size-[6px] rounded-full bg-primary" />
            ) : (
              <span
                aria-hidden
                className={`leading-none ${isDone ? 'text-[0.75rem]' : 'text-[0.6875rem]'} ${isDone || isToday ? 'text-primary-text' : 'text-muted-foreground'}`}
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
export function HomeWeekStripLabels({ days, todayDate }: { days: TrainingWeekDay[]; todayDate?: string }) {
  const note = todayDate ? weekBoundaryNote(days, todayDate) : null
  return (
    <>
      <div className="mt-1 grid grid-cols-7 gap-1" aria-hidden>
        {days.map(d => (
          <span key={d.date} className="text-center text-[0.625rem] text-muted-foreground">
            {(SHORT_DAY[d.dayName] ?? d.dayName.slice(0, 3)).slice(0, 1)}
          </span>
        ))}
      </div>
      {note && <p className="mt-1 text-center text-[0.625rem] text-muted-foreground" data-testid="home-week-boundary-note">{note}</p>}
    </>
  )
}
