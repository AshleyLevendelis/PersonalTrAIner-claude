import { getActiveMesocycleWeek } from './calculations'
import type { MesocycleWeek, WorkoutDay } from './types'

// ---------------------------------------------------------------------------
// WHICH PLAN WEEK A DATE IS IN, AND THAT WEEK'S DAYS (6 Oct 2026; Ashley's ruling:
// a training week runs from the day the plan started). docs/plans/week-boundaries.md.
//
// The Home and Exercise strips show a Monday-to-Sunday window, but a plan begun on a
// Thursday changes week on a Thursday, so unless the plan began on a Monday every strip
// holds two plan weeks. Resolving all seven days against ONE week's days gave the days
// of the other week that week's sessions. The answer is per DATE, and getActiveMesocycleWeek
// already gives exactly one week for a date, so this is the one place that turns a date into
// the days to look in.
// ---------------------------------------------------------------------------

interface PlanWeekOfDate {
  /** 1-based plan week this date falls in (clamped to the plan's length; dates before the plan are week 1). */
  week: number
  /** That week's days, or `fallbackDays` when the mesocycle has no such week. */
  days: WorkoutDay[]
}

/**
 * The plan week `date` (YYYY-MM-DD, a local calendar date) falls in, with its days. Null when
 * a per-date answer is impossible (no mesocycle yet, or no plan start), and the caller keeps
 * using the single week it was handed — the behaviour every legacy profile had.
 */
function planWeekForDate(
  date: string,
  mesocycle: MesocycleWeek[] | undefined,
  planCreatedAt: string | undefined,
  fallbackDays: WorkoutDay[],
): PlanWeekOfDate | null {
  if (!mesocycle || mesocycle.length === 0 || !planCreatedAt) return null
  const week = getActiveMesocycleWeek(planCreatedAt, new Date(`${date}T12:00:00`), mesocycle.length)
  const found = mesocycle.find(w => w.week_number === week)
  return { week, days: found ? found.days : fallbackDays }
}

/**
 * The days to look a DATE up in. For any date in TODAY's plan week that is `liveDays`, exactly as
 * the caller derived them (it is what the rest of the screen shows, and what a dev week-override
 * forces, so nothing can disagree with the card beside it); for a date in any other plan week it
 * is that week's own days. `week` is that date's plan week, absent when no per-date answer exists.
 */
export function planDaysForDate(
  date: string,
  today: string,
  liveDays: WorkoutDay[],
  mesocycle: MesocycleWeek[] | undefined,
  planCreatedAt: string | undefined,
): { week: number | undefined; days: WorkoutDay[] } {
  const own = planWeekForDate(date, mesocycle, planCreatedAt, liveDays)
  if (!own) return { week: undefined, days: liveDays }
  const todays = planWeekForDate(today, mesocycle, planCreatedAt, liveDays)
  return { week: own.week, days: own.week === todays?.week ? liveDays : own.days }
}
