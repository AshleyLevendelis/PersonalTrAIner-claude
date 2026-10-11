// ---------------------------------------------------------------------------
// WHAT THEY LOGGED AS EATEN, for the coach (runs 3-4 of the live-app test, H26,
// 10 Oct 2026).
//
// Asked about yesterday, the coach said "I can't see what you logged
// yesterday" and sent the tester to "calorie rings for yesterday" on the
// Nutrition tab, which only opens today and the days ahead. The data was
// always there (every meal logged is a row); the coach was simply never given
// it, by a rule written when it was not. Ashley: "Give the coach yesterday's
// totals and stop it naming a view that does not exist."
//
// Totals per day, today and the seven before it, from the same arithmetic the
// streak uses (getEatenByDate). Said as LOGGED, never as eaten-in-fact: a day
// with nothing logged is a day with nothing logged.
// ---------------------------------------------------------------------------
import type { EatenDay } from './meal-store'

const DAY_FMT = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

/** The dates the coach is told about: today first, then each day before it. */
export function eatenWindow(today: string, daysBack = 7): string[] {
  const out: string[] = []
  const base = new Date(`${today}T12:00:00`)
  for (let i = 0; i <= daysBack; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() - i)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return out
}

/**
 * The block, or null when the log could not be read (the caller then tells the
 * coach it is unknown this turn, never that nothing was eaten).
 */
export function buildCoachEatenSummary(byDate: Record<string, EatenDay> | null, today: string, daysBack = 7): string | null {
  if (!byDate) return null
  return eatenWindow(today, daysBack).map((date, i) => {
    const label = i === 0 ? `Today (${DAY_FMT(date)})` : i === 1 ? `Yesterday (${DAY_FMT(date)})` : DAY_FMT(date)
    const d = byDate[date]
    if (!d || d.meals === 0) return `- ${label}: nothing logged`
    const r = (n: number) => Math.round(n)
    return `- ${label}: ${r(d.kcal)} kcal · P ${r(d.protein)} g · C ${r(d.carbs)} g · F ${r(d.fat)} g, from ${d.meals} logged ${d.meals === 1 ? 'entry' : 'entries'}`
  }).join('\n')
}
