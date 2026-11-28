// ---------------------------------------------------------------------------
// A WORKOUT THE WATCH RECORDED, WAITING TO BE LOGGED, FOR THE COACH (28 Nov 2026, docs/audits/coach-awareness-2026-11-28.md
// (a) 7).
//
// Home offers "From your watch" for a workout the watch recorded that the app does not hold (watch-workouts.ts,
// watchOffers). The coach was told nothing, so "did my run this morning count?" was answered blind. His ruling 28 Nov
// 2026, "Mention it once, in its daily message": folded into the day's first unprompted message, within his limit, with
// a one-tap Log, never its own notification, never twice.
//
// Two pure halves, both from the offer list Home itself draws (so the coach never names a workout Home does not show):
//   buildCoachWatchWaiting  the context block, in the offer card's words (watchActivityName, watchWorkoutMinutes,
//                           watchWhenLine); it tells the coach the mention is the daily message's, not every reply's.
//   watchDailyMention       the one line the day's first unprompted message carries, and the ids it names, or null.
//                           Once per workout: the caller keeps the ids it was handed and passes them back.
// ---------------------------------------------------------------------------
import { watchActivityName, watchWhenLine, watchWorkoutMinutes } from './watch-workouts'
import type { WatchWorkout } from './health-steps'

type Offer = Pick<WatchWorkout, 'id' | 'type' | 'start' | 'end'>

/** How many waiting workouts are named; more is said as a count. */
export const WATCH_WAITING_MAX_NAMED = 3

function describe(w: Offer, today: string): string {
  return `${watchActivityName(w.type)}, ${watchWorkoutMinutes(w)} min, ${watchWhenLine(w, today)}`
}

/** "WATCH WORKOUTS WAITING TO BE LOGGED ...", or '' when Home offers none. */
export function buildCoachWatchWaiting(offers: readonly Offer[], today: string): string {
  if (offers.length === 0) return ''
  const shown = offers.slice(0, WATCH_WAITING_MAX_NAMED)
  const lines = shown.map(w => `- ${describe(w, today)}`)
  if (offers.length > shown.length) lines.push(`- and ${offers.length - shown.length} more`)
  return 'WATCH WORKOUTS WAITING TO BE LOGGED (offered on Home under "From your watch"; nothing is logged until they tap Log, '
    + 'and each counts as extra work, never in place of a session). Do not bring these up yourself: the day\'s first '
    + 'message mentions them once. Talk about one only when they raise it:\n'
    + lines.join('\n')
}

/** The day's first unprompted message's one line about waiting workouts, and the ids it names; null when none is new. */
export function watchDailyMention(offers: readonly Offer[], alreadyMentioned: readonly string[], today: string): { line: string; ids: string[]; action: 'Log it' } | null {
  const fresh = offers.filter(w => !alreadyMentioned.includes(w.id))
  if (fresh.length === 0) return null
  const first = fresh[0]
  const what = `${watchWorkoutMinutes(first)} min ${watchActivityName(first.type).toLowerCase()}`
  const line = fresh.length === 1
    ? `Your watch recorded a ${what} (${watchWhenLine(first, today)}). Want to log it?`
    : `Your watch recorded a ${what} (${watchWhenLine(first, today)}) and ${fresh.length - 1} more. Want to log them?`
  return { line, ids: fresh.map(w => w.id), action: 'Log it' }
}
