// ---------------------------------------------------------------------------
// THEIR OWN WORKOUTS, FOR THE COACH (28 Nov 2026, docs/audits/coach-awareness-2026-11-28.md, gap (a) 2).
//
// Exercise lets him start a workout of his own, plan one on a day ahead, and keep saved ones (his request 25 Nov 2026,
// "a separate workout"). The coach was told none of it: a set from his own session reached it as an ordinary set, with
// no sign the plan had not asked for it, and a Saturday he had put "Push day" on read to the coach as a rest day. This
// block says what the Exercise screen says about each, in the screen's own words (ownWorkoutSummary, planSummary), so
// the coach and the card agree.
//
// His ruling 28 Nov 2026, "Comment, kindly": the coach comments on one as on any session, never a telling-off.
//
// Pure: the stored workouts and plans, today's date and the window in; one block out ('' when there are none).
// ---------------------------------------------------------------------------
import { ownWorkoutSummary, hasAnythingSaved, type OwnWorkout } from './own-workout'
import { planSummary, type OwnPlan } from './own-workout-plans'

/** How far back a finished own workout is still worth naming, and how far ahead a planned one. */
export const OWN_PAST_DAYS = 7
export const OWN_AHEAD_DAYS = 6
const MAX_SAVED_NAMED = 8

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
function shift(date: string, days: number): string {
  // Calendar arithmetic on the date's own parts (Date.UTC carries the month and year), never an instant's UTC date.
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}
function weekday(date: string): string {
  return WEEKDAY[new Date(`${date}T12:00:00Z`).getUTCDay()]
}
function dayWords(date: string, today: string): string {
  if (date === today) return `Today (${date})`
  if (date === shift(today, 1)) return `Tomorrow (${date})`
  if (date === shift(today, -1)) return `Yesterday (${date})`
  return `${weekday(date)} (${date})`
}
function title(name: string): string {
  return name.trim() ? `"${name.trim()}"` : 'an unnamed workout'
}
function liftsDone(w: OwnWorkout): string[] {
  return w.items.flatMap(i => (i.kind === 'lift' ? (i.sets.some(s => s.done) ? [i.name] : []) : (i.done && i.activity ? [i.activity] : [])))
}

export function buildCoachOwnWorkouts(input: {
  workouts: readonly OwnWorkout[]
  plans: readonly OwnPlan[]
  today: string
}): string {
  const { today } = input
  const from = shift(today, -OWN_PAST_DAYS)
  const until = shift(today, OWN_AHEAD_DAYS)
  const lines: string[] = []

  const done = input.workouts
    .filter(w => w.date >= from && w.date <= today)
    .filter(w => hasAnythingSaved(w) || (w.date === today && !w.finishedAtIso))
    .sort((a, b) => (a.date === b.date ? b.startedAtIso.localeCompare(a.startedAtIso) : a.date < b.date ? 1 : -1))
  for (const w of done) {
    const state = w.date === today && w.mode === 'live' && !w.finishedAtIso ? 'in progress now' : 'done'
    const what = liftsDone(w)
    lines.push(`- ${dayWords(w.date, today)}: ${title(w.name)}, ${state}: ${ownWorkoutSummary(w)}${what.length > 0 ? ` (${what.join(', ')})` : ''}`)
  }

  const live = input.plans.filter(p => !p.deleted)
  const ahead = live
    .flatMap(p => p.onDates.filter(d => d >= today && d <= until).map(d => ({ p, d })))
    .filter(({ p, d }) => !(d === today && done.some(w => w.date === today && w.planId === p.id)))
    .sort((a, b) => a.d.localeCompare(b.d))
  for (const { p, d } of ahead) {
    lines.push(`- Planned for ${dayWords(d, today)}: ${title(p.name)}, ${planSummary(p)}`)
  }

  const named = live.map(p => p.name.trim()).filter(Boolean)
  if (named.length > 0) {
    const shown = named.slice(0, MAX_SAVED_NAMED)
    lines.push(`- Saved workouts: ${shown.join(', ')}${named.length > shown.length ? ` and ${named.length - shown.length} more` : ''}`)
  }

  return lines.length === 0
    ? ''
    : `THEIR OWN WORKOUTS (sessions they chose, separate from the plan; a day with one planned is theirs to train, and the sets also appear in the workout history. Comment on one kindly, as on any session, never as a telling-off for leaving the plan):\n${lines.join('\n')}`
}
