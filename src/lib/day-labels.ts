// ---------------------------------------------------------------------------
// WHAT A `YYYY-MM-DD` DATE IS CALLED ON SCREEN.
//
// Read in UTC on the date's own components, so no timezone and no clock change
// can move a date onto its neighbour's name — the same reason meal-rotation's
// epochDay is calendar arithmetic rather than a division. One file, because
// the Nutrition strip, its headings and the shopping list's meal lines all
// name days, and three private formatters is how "Mon" comes to mean two
// different dates on one screen.
// ---------------------------------------------------------------------------

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function utc(date: string): Date | null {
  const m = DATE.exec(date)
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null
}

/** "Mon". An unparseable date is returned as itself rather than as "Invalid Date". */
export function weekdayShort(date: string): string {
  const d = utc(date)
  return d ? d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }) : date
}

/** "Monday". */
export function weekdayLong(date: string): string {
  const d = utc(date)
  return d ? d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }) : date
}

/** "29" — the day of the month. */
export function dayOfMonth(date: string): string {
  const d = utc(date)
  return d ? String(d.getUTCDate()) : date
}

/** "Monday 29 September". */
export function longDate(date: string): string {
  const d = utc(date)
  return d ? d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : date
}

/**
 * "Thu 8 Oct" — a date in a list or on a receipt: the weigh-in history, the
 * session history, a day-swap's rows. The year is added ("Thu 8 Oct 2025")
 * only when `today` is given and the date is not in today's year, the same
 * rule the chat's day pill follows.
 *
 * 9 Oct 2026 (test log L24): these places printed the stored value,
 * "2026-10-08", beside screens that said "Thu 8 Oct". Built from parts rather
 * than taken whole from the locale so the form cannot drift with a browser's
 * idea of British punctuation ("Thu, 8 Oct").
 */
export function shortDate(date: string, today?: string): string {
  const d = utc(date)
  if (!d) return date
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' })
  const base = `${part({ weekday: 'short' })} ${d.getUTCDate()} ${part({ month: 'short' })}`
  const thisYear = today ? utc(today)?.getUTCFullYear() : undefined
  return thisYear !== undefined && thisYear !== d.getUTCFullYear() ? `${base} ${d.getUTCFullYear()}` : base
}

/**
 * "8 Oct 2026" — a date that has to stand on its own with its year: when a
 * goal is due, when a remembered fact was added. Accepts a full timestamp as
 * well ("2026-10-08T09:14:00Z"), read on its date part.
 */
export function datedWithYear(dateOrTimestamp: string): string {
  const d = utc(dateOrTimestamp.slice(0, 10))
  if (!d) return dateOrTimestamp
  return `${d.getUTCDate()} ${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}`
}

/** "8 Oct" — a date inside a sentence that already says which year it is about ("until 15 Oct"). */
export function dayAndMonth(date: string): string {
  const d = utc(date.slice(0, 10))
  if (!d) return date
  return `${d.getUTCDate()} ${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}`
}

/**
 * A day as a sentence names it: "today", or the weekday ("Wednesday"). One
 * function because the Move sheet, the coach's card and its receipt all name
 * the same two days, and a sentence that says "Tuesday" on one and "today" on
 * the other about the same date is the disagreement this file exists to stop.
 */
export function dayLabel(date: string, today: string): string {
  return date === today ? 'today' : weekdayLong(date)
}
