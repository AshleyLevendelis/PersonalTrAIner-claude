// ---------------------------------------------------------------------------
// WHICH DAY A WORKOUT TOLD TO THE CHAT BELONGS TO.
//
// "I did squats yesterday, 3x8 at 50" reaches the app as sets plus a date. Until
// 19 Nov 2026 the date was dropped on the phone and the sets were written onto
// TODAY: the wrong day's session showed work done, the week's count moved, and
// a record carried the wrong date. Found by tracing the path, not by a report.
//
// So the day is decided here, once, from the date the coach passed and the
// app's own today:
//   - no date, or today's: today, exactly as before;
//   - a day in the last two weeks: that day (the same write the Exercise
//     screen's "I did it, not in the app" makes);
//   - anything else is refused in a sentence and nothing is written. A day that
//     has not happened cannot have been trained, and older than two weeks is
//     where a mistyped date does the most damage for the least use.
//
// Pure, and date arithmetic on the date STRINGS (no instants, no time zone).
// ---------------------------------------------------------------------------

/** How far back the chat will log a session. */
export const PAST_LOG_DAYS = 14

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export interface PastLogDay {
  kind: 'past'
  /** YYYY-MM-DD */
  date: string
  /** "Tuesday" */
  dayName: string
  /** "Tuesday 17 Nov": what he reads. */
  label: string
}
export type LogDay = { kind: 'today' } | PastLogDay | { kind: 'refused'; say: string }

/** A calendar date as a count of days, or null when the string is not a real YYYY-MM-DD date. */
function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = Date.UTC(y, mo - 1, d)
  const back = new Date(t)
  // 2026-02-31 is not a date: Date would roll it into March.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null
  return Math.round(t / 86_400_000)
}

export function logDayFor(raw: string | null | undefined, today: string): LogDay {
  const said = (raw ?? '').trim()
  if (!said || said === today) return { kind: 'today' }
  const then = dayNumber(said)
  const now = dayNumber(today)
  if (then === null || now === null) {
    return { kind: 'refused', say: "I couldn't tell which day that was, so nothing was logged. Tell me the day and I'll put it there." }
  }
  if (then > now) return { kind: 'refused', say: "That day hasn't happened yet, so nothing was logged. Tell me once it's done and I'll put it in." }
  if (now - then > PAST_LOG_DAYS) {
    return { kind: 'refused', say: `That's more than two weeks back, so I haven't logged it from here. Nothing was changed.` }
  }
  const when = new Date(then * 86_400_000)
  const dayName = WEEKDAYS[when.getUTCDay()]
  return { kind: 'past', date: said, dayName, label: `${dayName} ${when.getUTCDate()} ${MONTHS[when.getUTCMonth()]}` }
}
