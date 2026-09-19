// ---------------------------------------------------------------------------
// ONE FIXED "TODAY" FOR EVERY HARNESS RUN.
//
// WHY THIS EXISTS, measured 14 Sep 2026. Eight browser drivers were red on the
// 13th. On the 14th, three of them were green — same commit, same machine, no
// code change: `ramp-readonly`, `coach-week-move`, `program-move`. Proven rather
// than guessed, by running one driver twice on one machine under two timezones
// that fall on different calendar days:
//
//     TZ=Pacific/Kiritimati  (Monday)  verify:coach-week-move  → 0 failing
//     TZ=Etc/GMT+12          (Sunday)  verify:coach-week-move  → 2 failing
//
// A red check is information. A check that flips with the calendar means GREEN
// IS NOT EVIDENCE — and you cannot tell which kind you have by looking at it.
// Every comparison this suite has ever been used for, including "these fail
// identically on main" on 13 Sep, was weaker than it appeared.
//
// WHERE THE DRIFT CAME FROM — three layers, all in the harness, none in the app:
//   1. real.tsx built its training-day pattern from `new Date().getDay()`, so
//      which day was due, which was rest, and what "tomorrow" held moved daily.
//   2. A dozen fixture seeds were `Date.now()`-relative — created_at, logged
//      sessions, moved_to_date, chat timestamps.
//   3. Only 2 of 37 drivers pinned a date at all, and the one that did seeded
//      its pin from the real clock too.
//
// THE SEAM IS THE APP'S OWN: src/lib/dev-clock.ts. `setDevClockOverride` writes
// `fitplan_dev_clock_<profileId>` and `getAppNow` is what the app reads
// everywhere it asks what day it is. Nothing new was needed — the anchor just
// had to stop being the machine's calendar.
//
// .mjs ON PURPOSE, not .ts: the pages are TypeScript and the drivers are plain
// Node. Only a plain ES module can be imported by both, and two copies kept in
// sync is exactly the drift this file exists to end. `.tour-harness` is outside
// tsconfig's `include` (["src"]), so nothing type-checks it either way.
// ---------------------------------------------------------------------------

/**
 * A WEDNESDAY, deliberately: the fixture's four training days then fall either
 * side of "today", so a driver can look backwards at a logged session and
 * forwards at a moved one without the week wrapping.
 *
 * Absolute, not an offset from now. An offset would be the same bug wearing a
 * constant.
 */
export const ANCHOR_ISO = '2026-09-16'

/** The anchor as a Date, at local midnight — never `new Date()`. */
export function anchorDate() {
  const [y, m, d] = ANCHOR_ISO.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** `2026-09-16` from a Date, in LOCAL terms — `toISOString()` would shift it. */
export function iso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** The weekday the anchor falls on, e.g. 'Wednesday'. */
export function anchorDayName() {
  return DAY_NAMES[anchorDate().getDay()]
}

/** N days before the anchor, as a Date. */
export function daysAgo(n) {
  const d = anchorDate()
  d.setDate(d.getDate() - n)
  return d
}

/** N days after the anchor, as a Date. */
export function daysAhead(n) {
  const d = anchorDate()
  d.setDate(d.getDate() + n)
  return d
}

/**
 * The millisecond value the fixtures use where they used to write
 * `Date.now()`. Named so the substitution reads as deliberate at the call site.
 */
export function anchorNowMs() {
  return anchorDate().getTime()
}

/**
 * The occurrence of a weekday NEAREST the anchor — e.g. `'Monday'` from a
 * Wednesday anchor is the Monday two days before, not the one five days after.
 *
 * Why "nearest" rather than "the Monday of the anchor's week": a driver that
 * pins today to this date is standing a day or two either side of the anchor,
 * so the fixture's seeded history (logged sessions a few days back, a moved
 * session a few days on) still reads the way it was seeded. Ties go to the
 * earlier date, so the answer never depends on which way you happened to look.
 */
export function nearestAnchorDate(dayName) {
  const target = DAY_NAMES.indexOf(dayName)
  if (target < 0) throw new Error(`nearestAnchorDate: not a weekday name — ${dayName}`)
  const forward = (target - anchorDate().getDay() + 7) % 7
  const offset = forward <= 3 ? forward : forward - 7
  return iso(daysAhead(offset))
}
