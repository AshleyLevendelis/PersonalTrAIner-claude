import type { MacroTargets } from '@/lib/types'
import type { EatenDay } from '@/lib/meal-store'
import { addDays } from '@/lib/session-move'

// ---------------------------------------------------------------------------
// THE WEEK'S AVERAGE (his 13 Nov 2026 strategy, slice 4d; docs/plans/flexible-nutrition.md). Monday to Sunday, the
// FINISHED days he logged something on, averaged. A day over is not a failure if the week lands: body composition
// follows the week's energy balance (CSCS, population-level nutrition). Display only: nothing here cuts a later day,
// which is also slice 5's "no compensation" rule.
//
// Finished days only: today is still being eaten, and averaging a half-logged day in would read every week as under.
// A day with nothing logged is left out and COUNTED, so "3 days logged" never passes itself off as the week.
// ---------------------------------------------------------------------------

export interface WeeklyAverage {
  /** Finished days this week with at least one meal logged. */
  daysLogged: number
  /** Finished days this week (Monday up to yesterday). */
  daysSoFar: number
  kcal: number
  protein: number
  targetKcal: number
  targetProtein: number
}

/** "2026-11-09" for any date in that Monday-to-Sunday week. Walked as a calendar date (session-move's addDays), never a timestamp. */
export function mondayOfDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const back = (new Date(y, m - 1, d).getDay() + 6) % 7
  return addDays(date, -back)
}

/** The finished days of this week before today, Monday first. Empty on a Monday. */
export function finishedDaysThisWeek(today: string): string[] {
  const out: string[] = []
  for (let i = 0, day = mondayOfDate(today); i < 7 && day < today; i++, day = addDays(day, 1)) out.push(day)
  return out
}

/** The average over the days he logged, or null when no finished day this week has anything logged. */
export function weeklyAverage(eaten: Record<string, EatenDay>, today: string, targets: MacroTargets): WeeklyAverage | null {
  const days = finishedDaysThisWeek(today)
  const logged = days.map(d => eaten[d]).filter((e): e is EatenDay => !!e && e.meals > 0)
  if (logged.length === 0) return null
  const sum = logged.reduce((a, e) => ({ kcal: a.kcal + e.kcal, protein: a.protein + e.protein }), { kcal: 0, protein: 0 })
  return {
    daysLogged: logged.length,
    daysSoFar: days.length,
    kcal: Math.round(sum.kcal / logged.length),
    protein: Math.round(sum.protein / logged.length),
    targetKcal: Math.round(targets.calories),
    targetProtein: Math.round(targets.protein),
  }
}

const n = (v: number) => Math.round(v).toLocaleString('en-GB')
const days = (k: number) => `${k} day${k === 1 ? '' : 's'}`

/** "This week so far: 2,140 kcal a day against 2,200, protein 150 g against 160 (3 days logged)". */
export function weeklyAverageLine(a: WeeklyAverage): string {
  return `This week so far: ${n(a.kcal)} kcal a day against ${n(a.targetKcal)}, protein ${a.protein} g against ${a.targetProtein}`
    + ` (${days(a.daysLogged)} logged${a.daysLogged < a.daysSoFar ? ` of ${a.daysSoFar}` : ''}).`
}

/** The starter tier's line (show numbers off): the count only, never a number of calories or grams. */
export function weeklyLoggedLine(a: WeeklyAverage): string {
  return `This week so far: food logged on ${days(a.daysLogged)}${a.daysLogged < a.daysSoFar ? ` of ${a.daysSoFar}` : ''}.`
}
