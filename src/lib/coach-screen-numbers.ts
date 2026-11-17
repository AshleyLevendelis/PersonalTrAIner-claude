// ---------------------------------------------------------------------------
// ONE PICTURE FOR THE SCREENS AND THE COACH: stage 3 of docs/plans/coach-reaches-everything.md (17 Nov 2026). The coach
// must never quote a number the screen does not show. These are the readers the chat strip and the coach's context
// BOTH call, so a figure in the coach's facts is the figure on the screen by construction (test:coach-screen-numbers).
// ---------------------------------------------------------------------------
import { kcalPillText } from './chat-context-strip'
import { getLedgerSnapshot } from './meal-store'

/** Today's dated cell in the week the strips draw, already resolved through moves and swaps; null when absent. */
export function todayScreenCell<T extends { date: string }>(days: readonly T[] | null | undefined, date: string): T | null {
  return (days ?? []).find(d => d.date === date) ?? null
}

/** What Home and the chat strip say was eaten today: the meal ledger's snapshot, else the dashboard's figure. */
export function screenEatenKcal(profileId: string | null | undefined, date: string, fallback: number | null | undefined): number | null {
  if (!profileId) return null
  return getLedgerSnapshot(profileId, date)?.eaten.kcal ?? fallback ?? null
}

/** "1,410 kcal left (eaten 990 of 2,400 kcal)": the strip's own words, so the coach never does the subtraction. */
export function coachTodayCalories(target: number, eaten: number): string {
  return `${kcalPillText(target, eaten)} (eaten ${Math.round(eaten).toLocaleString()} of ${Math.round(target).toLocaleString()} kcal)`
}
