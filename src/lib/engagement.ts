// ---------------------------------------------------------------------------
// HOW SOMEONE IS GETTING ON, READ FROM WHAT IS KEPT — his strategy of 13 Nov 2026, slice 1 "Measurement"
// (docs/plans/measurement.md): "Retention at weeks 1, 4 and 12, sessions completed, days logged, and the response to
// each coach moment." One pure reader over the facts the app keeps (sessions, logs, coach_moment_log), so every later
// slice is judged by the same numbers. Weeks are counted from the day he started, week 1 = days 0-6.
// ---------------------------------------------------------------------------
import { daysBetween } from './session-move'
import { ANSWER_WINDOW_MS, type MomentLogRow } from './moment-log'

export interface EngagementInput {
  /** The day he started (the profile's creation date, local). */
  startDate: string
  /** Today, local. Weeks after today are not reported. */
  today: string
  /** One entry per session completed (a finished workout, a logged walk or run), by its local date. */
  sessionDates: string[]
  /** Every date anything was logged on (a set, a meal, a weigh-in, water, steps, cardio). Duplicates are fine. */
  loggedDates: string[]
  moments: Pick<MomentLogRow, 'moment' | 'sent_at' | 'answered_at'>[]
  /** Local date of an instant, so a moment falls in the week he saw it. */
  localDate: (iso: string) => string
}

export interface EngagementWeek {
  week: number
  sessionsCompleted: number
  daysLogged: number
  momentsSent: number
  momentsAnswered: number
}

export interface Engagement {
  weeks: EngagementWeek[]
  /** Anything logged in that week of his time with the app; null when that week has not ended yet. */
  retained: { week1: boolean | null; week4: boolean | null; week12: boolean | null }
}

/** The week of his time with the app that a date falls in (1-based); 0 before he started. */
export function weekOf(startDate: string, date: string): number {
  const d = daysBetween(startDate, date)
  return d < 0 ? 0 : Math.floor(d / 7) + 1
}

export function readEngagement(input: EngagementInput): Engagement {
  const current = weekOf(input.startDate, input.today)
  const weeks: EngagementWeek[] = Array.from({ length: Math.max(current, 0) }, (_, i) => ({
    week: i + 1, sessionsCompleted: 0, daysLogged: 0, momentsSent: 0, momentsAnswered: 0,
  }))
  const at = (w: number) => (w >= 1 && w <= current ? weeks[w - 1] : null)
  for (const d of input.sessionDates) { const w = at(weekOf(input.startDate, d)); if (w) w.sessionsCompleted++ }
  for (const d of new Set(input.loggedDates)) { const w = at(weekOf(input.startDate, d)); if (w) w.daysLogged++ }
  for (const m of input.moments) {
    const w = at(weekOf(input.startDate, input.localDate(m.sent_at)))
    if (!w) continue
    w.momentsSent++
    if (m.answered_at) w.momentsAnswered++
  }
  // A week counts only once it has ENDED: week 4 is not "lost" on its second day.
  const retainedIn = (n: number): boolean | null => (current > n ? (weeks[n - 1]?.daysLogged ?? 0) > 0 : null)
  return { weeks, retained: { week1: retainedIn(1), week4: retainedIn(4), week12: retainedIn(12) } }
}

/**
 * HOW MANY TIMES RUNNING A MOMENT WAS IGNORED, newest first: slice 2's "a moment ignored three times running drops a
 * level" reads this. A send still inside its answer window is neither answered nor ignored yet, so it is skipped.
 */
export function ignoredRun(rows: Pick<MomentLogRow, 'moment' | 'sent_at' | 'answered_at'>[], moment: string, nowMs: number): number {
  const mine = rows.filter(r => r.moment === moment).sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at))
  let run = 0
  for (const r of mine) {
    if (r.answered_at) break
    if (nowMs - Date.parse(r.sent_at) < ANSWER_WINDOW_MS) continue
    run++
  }
  return run
}

/** Three unanswered in a row turns the coach down a level (his strategy, 13 Nov 2026, slice 2). */
export const IGNORED_BEFORE_TURNING_DOWN = 3

/**
 * SHOULD THE COACH TURN ITSELF DOWN? When the same moment has gone unanswered three times running since the last time
 * it turned down, his daily limit drops one level: Lots to Normal, Normal to Light. Light stays Light. Rows sent before
 * the last drop are not counted again, so a drop needs three NEW ignores. Null when nothing should change.
 */
export function turnDownFor(
  rows: Pick<MomentLogRow, 'moment' | 'sent_at' | 'answered_at'>[],
  frequency: 'light' | 'normal' | 'lots',
  droppedAt: string | null | undefined,
  nowMs: number,
): { to: 'light' | 'normal'; moment: string } | null {
  if (frequency === 'light') return null
  const since = droppedAt ? Date.parse(droppedAt) : Number.NEGATIVE_INFINITY
  const fresh = rows.filter(r => Date.parse(r.sent_at) > since)
  for (const moment of new Set(fresh.map(r => r.moment))) {
    if (ignoredRun(fresh, moment, nowMs) >= IGNORED_BEFORE_TURNING_DOWN) return { to: frequency === 'lots' ? 'normal' : 'light', moment }
  }
  return null
}
