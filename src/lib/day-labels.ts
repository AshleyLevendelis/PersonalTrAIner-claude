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
