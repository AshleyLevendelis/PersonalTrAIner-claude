// ---------------------------------------------------------------------------
// WHICH DAYS OF THE PLAN MAY STILL BE CHANGED, AND WHICH DATES A CHANGE COVERS.
//
// docs/plans/adaptations-respect-the-week-already-trained.md, rules 1 and 2.
// Test log H11, 9 Oct 2026: "ease off my knees for two weeks", said on the
// Thursday of week 1, rewrote the Thursday session the tester had already
// finished (the completed day then showed Spanish Squat where Box Squat was
// logged), rewrote the Monday and Tuesday before it, and left days 12 to 14
// untouched, because the smallest thing any adaptation or rebuild could
// address was a whole plan week.
//
// TWO ANSWERS, BOTH PURE, BOTH FROM DATES:
//
//   planDaysInWindow — "which plan rows are trained on the N days from today".
//     What an adaptation touches. Never a week number.
//   buildDayGuard    — "has this plan row already been trained". What NOTHING
//     may rewrite: an adaptation, a kit change, or any rebuild offer.
//
// "Which session is on this date" is asked of `sessionForDate`, the resolver
// every screen already uses, so a moved session is judged on the day it is
// actually run and this file holds no second opinion about that.
//
// THE WEEK BOUNDARY, stated rather than hidden. A plan week is seven days
// counted from the MOMENT the plan was made (`getActiveMesocycleWeek`), so on
// the weekday the plan was made the app shows last week's row before that
// time of day and this week's after it. That is how the live screen behaves
// today and it is not changed here. So a date can be served by two rows, and
// both ends are read: a window covers both, and a row is protected when any
// date it serves is. Erring this way can only adapt a day too many or protect
// a day too many, never leave a date in the window on unadapted work that
// could have been changed.
// ---------------------------------------------------------------------------

import type { MesocycleWeek } from './types'
import { sessionForDate, addDays, dayNameOf, type SessionMove } from './session-move'

export interface PlanDayRef {
  weekNumber: number
  dayName: string
}

/** A plan row, and the date it is trained on. */
export interface PlanDayOnDate extends PlanDayRef {
  date: string
}

/** True when this plan row has already been trained and must not be rewritten. */
export type DayGuard = (weekNumber: number, dayName: string) => boolean

export interface PlanCalendar {
  /** When the plan was made — the instant week 1 starts. */
  planCreatedAt: string | undefined
  /** YYYY-MM-DD on the app's own clock. */
  today: string
  /** Sessions moved to another day, both ends. */
  moves: SessionMove[]
}

const DAY_MS = 86_400_000
const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Monday first, the order every screen lists a week in. Unknown names sort last. */
export function weekdayIndex(dayName: string): number {
  const i = WEEKDAY_ORDER.indexOf(dayName)
  return i === -1 ? WEEKDAY_ORDER.length : i
}

function localDateOf(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * The plan week(s) that serve a date: the week at the start of the day and the
 * week at the end of it. One number on six days of seven; two on the weekday
 * the plan was made. Empty before the plan starts and after its last week.
 */
export function planWeeksOnDate(planCreatedAt: string | undefined, date: string, totalWeeks: number): number[] {
  if (!planCreatedAt || totalWeeks <= 0) return totalWeeks > 0 ? [1] : []
  const start = new Date(planCreatedAt).getTime()
  if (date < localDateOf(planCreatedAt)) return []
  const weekAt = (instant: number): number | null => {
    const index = Math.floor(Math.max(0, Math.floor((instant - start) / DAY_MS)) / 7)
    return index >= totalWeeks ? null : index + 1
  }
  const weeks = [weekAt(new Date(`${date}T00:00:00`).getTime()), weekAt(new Date(`${date}T23:59:59`).getTime())]
  return [...new Set(weeks.filter((w): w is number => w !== null))]
}

/** The plan row(s) trained on one date, moves taken into account. Empty on a rest day. */
export function planRowsOnDate(mesocycle: MesocycleWeek[], calendar: PlanCalendar, date: string): PlanDayOnDate[] {
  const rows: PlanDayOnDate[] = []
  for (const weekNumber of planWeeksOnDate(calendar.planCreatedAt, date, mesocycle.length)) {
    const week = mesocycle.find(w => w.week_number === weekNumber)
    if (!week) continue
    const resolved = sessionForDate({ date, plan: week.days, moves: calendar.moves })
    if (resolved.day) rows.push({ weekNumber, dayName: resolved.day.day, date })
  }
  return rows
}

/**
 * RULE 2 — A WINDOW IS DATES. The plan rows trained on each of the `days`
 * dates starting today, in date order. `days` omitted means to the end of the
 * plan (a lasting injury, or "rebuild from today").
 */
export function planDaysInWindow(mesocycle: MesocycleWeek[], calendar: PlanCalendar, days?: number): PlanDayOnDate[] {
  const horizon = days ?? mesocycle.length * 7 + 8
  const seen = new Set<string>()
  const out: PlanDayOnDate[] = []
  for (let i = 0; i < horizon; i++) {
    const date = addDays(calendar.today, i)
    for (const row of planRowsOnDate(mesocycle, calendar, date)) {
      const key = `${row.weekNumber}|${row.dayName}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(row)
    }
  }
  return out
}

export interface DayGuardInput extends PlanCalendar {
  /** Dates with at least one logged set. */
  loggedDates: Iterable<string>
  /** Dates the person finished, marked missed, rested on purpose, or swapped for another activity. */
  closedDates: Iterable<string>
}

/**
 * RULE 1 — A SESSION ALREADY TRAINED IS NEVER REWRITTEN.
 *
 * A plan row is protected when any date it is trained on is before today, has
 * logged sets, or was closed by the person (finished, missed, rested, swapped
 * for something else). Today is open until something is logged on it. A
 * session moved to another day is judged on the day it moved TO.
 *
 * Basis (CSCS): the training record is the evidence progression is built
 * from. A plan row that disagrees with the log makes both untrustworthy.
 */
export function buildDayGuard(mesocycle: MesocycleWeek[], input: DayGuardInput): DayGuard {
  const logged = new Set(input.loggedDates)
  const closed = new Set(input.closedDates)
  const protectedRows = new Set<string>()
  const served = new Set<string>()
  const key = (w: number, d: string) => `${w}|${d}`

  const first = input.planCreatedAt ? localDateOf(input.planCreatedAt) : input.today
  const from = first < input.today ? first : input.today
  const last = addDays(from, mesocycle.length * 7 + 8)
  for (let date = from; date <= last; date = addDays(date, 1)) {
    const trained = date < input.today || logged.has(date) || closed.has(date)
    for (const row of planRowsOnDate(mesocycle, input, date)) {
      served.add(key(row.weekNumber, row.dayName))
      if (trained) protectedRows.add(key(row.weekNumber, row.dayName))
    }
  }

  return (weekNumber, dayName) => {
    const k = key(weekNumber, dayName)
    if (protectedRows.has(k)) return true
    if (served.has(k)) return false
    // A row no date reaches (its session was moved outside the plan, or the
    // plan has no start date to count from). Judge it on its own weekday in
    // its own week: everything in a week before the live one is history.
    const liveWeeks = planWeeksOnDate(input.planCreatedAt, input.today, mesocycle.length)
    const live = liveWeeks.length > 0 ? Math.min(...liveWeeks) : 1
    if (weekNumber !== live) return weekNumber < live
    return weekdayIndex(dayName) < weekdayIndex(dayNameOf(input.today))
  }
}

/**
 * For gates and for a plan nobody has trained on yet (onboarding). NOT for any
 * path that changes a live plan: those load the real guard, and
 * `test:adaptations-respect-trained` fails if this is named under `src/`
 * outside this file.
 */
export const NOTHING_TRAINED: DayGuard = () => false

/** Sort key for anything listed per plan day: week, then weekday, then position. */
export function comparePlanDays(a: PlanDayRef & { position?: number }, b: PlanDayRef & { position?: number }): number {
  return a.weekNumber - b.weekNumber
    || weekdayIndex(a.dayName) - weekdayIndex(b.dayName)
    || (a.position ?? 0) - (b.position ?? 0)
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "8 Oct". Spelled out here, not left to the phone's locale, so every phone prints the same card. */
export function dayAndMonth(date: string): string {
  const d = new Date(`${date}T12:00:00`)
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`
}

/** "Thu 8 Oct" — the date on a card. */
export function shortDate(date: string): string {
  return `${SHORT_DAYS[new Date(`${date}T12:00:00`).getDay()]} ${dayAndMonth(date)}`
}

/** "Thu 8 Oct – Wed 21 Oct", or one date when the window is a single day. */
export function describeDateSpan(from: string, days: number): string {
  const to = addDays(from, Math.max(1, days) - 1)
  return to === from ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`
}
