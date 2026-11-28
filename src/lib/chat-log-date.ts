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
//   - any earlier day: that day (the same write the Exercise screen's "I did
//     it, not in the app" makes). Until 28 Nov 2026 this stopped at two weeks;
//     his ruling that day ("users can add or remove or change workouts ...
//     whatever they want") widened it, so a workout from last month can be put
//     on last month. A day more than a week back is named with its date (and
//     its year when that is not this year's), so a mistyped date shows on the
//     line that says where it went;
//   - a day that has not happened yet, a day before his plan began, or a date
//     that is not a date, is refused in a sentence and nothing is written. A
//     day still to come cannot have been trained.
//
// The coach's other logging cards (one cardio activity, a circuit, taking a
// log off) ask the same question through the same function.
//
// Pure, and date arithmetic on the date STRINGS (no instants, no time zone).
// ---------------------------------------------------------------------------

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export interface PastLogDay {
  kind: 'past'
  /** YYYY-MM-DD */
  date: string
  /** "Tuesday" */
  dayName: string
  /** "Tuesday 17 Nov" ("Tuesday 17 Nov 2025" when over a week back in another year): what he reads. */
  label: string
  /** How a card names it: the weekday inside the last week ("Tuesday"), the label further back. */
  words: string
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

/**
 * `earliest` is the first day of his plan (YYYY-MM-DD, local). A day before it is refused, the way the screen's "I did
 * it, not in the app" says "No session was planned": a set is filed under a plan week and day, and a day before the
 * plan has neither (the week count clamps it to week 1, so the current plan's week 1 would read as done). It is also
 * the floor that keeps a wrong year from being written: the session log has no card and no Undo yet.
 */
export function logDayFor(raw: string | null | undefined, today: string, earliest: string | null = null): LogDay {
  const said = (raw ?? '').trim()
  if (!said || said === today) return { kind: 'today' }
  const then = dayNumber(said)
  const now = dayNumber(today)
  if (then === null || now === null) {
    return { kind: 'refused', say: "I couldn't tell which day that was, so nothing was logged. Tell me the day and I'll put it there." }
  }
  if (then > now) return { kind: 'refused', say: "That day hasn't happened yet, so nothing was logged. Tell me once it's done and I'll put it in." }
  const first = earliest ? dayNumber(earliest) : null
  if (first !== null && then < first) {
    const f = new Date(first * 86_400_000)
    return { kind: 'refused', say: `That's before your plan began on ${WEEKDAYS[f.getUTCDay()]} ${f.getUTCDate()} ${MONTHS[f.getUTCMonth()]}, so nothing was logged. If the date's wrong, tell me the right one.` }
  }
  const when = new Date(then * 86_400_000)
  const dayName = WEEKDAYS[when.getUTCDay()]
  const year = now - then < 7 || when.getUTCFullYear() === Number(today.slice(0, 4)) ? '' : ` ${when.getUTCFullYear()}`
  const label = `${dayName} ${when.getUTCDate()} ${MONTHS[when.getUTCMonth()]}${year}`
  return { kind: 'past', date: said, dayName, label, words: now - then < 7 ? dayName : label }
}

/** The same refusal said for taking a log OFF a day: nothing was logged becomes nothing was changed, and a bad date asks for the right one. */
export function refusalToTakeOff(say: string): string {
  if (/hasn't happened yet/.test(say)) return "That day hasn't happened yet, so there's nothing logged on it to take off."
  if (/couldn't tell which day/.test(say)) return "I couldn't tell which day that was, so nothing was changed. Tell me the day and I'll look."
  return say.replace('so nothing was logged', 'so nothing was changed')
}
