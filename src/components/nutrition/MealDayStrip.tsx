import { dayOfMonth, longDate, weekdayShort } from '@/lib/day-labels'

// ---------------------------------------------------------------------------
// THE MEAL DAYS — Ashley, 27 Sep 2026, from three options: "Day strip".
// "A row of days across the top of Nutrition, today highlighted. Tap a day to
// see its meals, swap one, or add that day to the shopping list."
//
// A NAVIGATOR, so it borrows the Exercise strip's look rather than Home's:
// Home's strip is a record with no affordance at all, and says so; Exercise's
// is how you move around the week, which is what this is. Seven days from
// today, because the rotation is seven days long — an eighth would be the
// first one again.
//
// TWO MARKS, NOT ONE. "Today" is always named, whichever day is open; the day
// on screen is the filled one. With a single highlight, opening Monday made
// today indistinguishable from any other day, and the way back was a guess.
// ---------------------------------------------------------------------------

export function MealDayStrip({
  dates,
  today,
  selected,
  onSelect,
}: {
  /** `YYYY-MM-DD`, today first. */
  dates: string[]
  today: string
  selected: string
  onSelect: (date: string) => void
}) {
  return (
    <div className="grid grid-cols-7 gap-1" role="group" aria-label="Choose a day to see its meals" data-testid="meal-day-strip">
      {dates.map(date => {
        const isToday = date === today
        const isSelected = date === selected
        return (
          <button
            key={date}
            type="button"
            onClick={() => onSelect(date)}
            aria-pressed={isSelected}
            aria-label={`${isToday ? 'Today, ' : ''}${longDate(date)}`}
            data-meal-day={date}
            data-meal-day-selected={isSelected ? 'yes' : 'no'}
            className="flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-[10px] transition-colors"
            style={isSelected
              ? { background: 'rgba(var(--glow-rgb),.14)', border: '1px solid rgba(var(--glow-rgb),.45)' }
              : { border: '1px solid transparent' }}
          >
            <span className={`text-[0.5625rem] uppercase tracking-[.08em] ${isToday ? 'font-semibold text-primary-text' : 'text-muted-foreground'}`}>
              {isToday ? 'Today' : weekdayShort(date)}
            </span>
            <span className={`tabular-mono text-[0.9375rem] leading-none ${isSelected ? 'font-semibold text-primary-text glow-mint' : isToday ? 'text-primary-text' : 'text-foreground'}`}>
              {dayOfMonth(date)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
