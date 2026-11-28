// ---------------------------------------------------------------------------
// "ADD A WEIGHT SESSION JUST FOR TODAY" ON A REST DAY: THE COACH'S HALF OF "TRAIN ANYWAY" (his report and ruling,
// 28 Nov 2026: "The app should be able to do whatever I ask it but give reasons or advise around it. Ie make
// suggestions for changes or recommendations to not train with reasons why"). The coach had answered "There's no
// session on Saturday to swap — it's a rest day" and done nothing.
//
// It is the rest day card's "Train anyway" (borrowed-day.ts), reached from the chat: one of the week's sessions is
// borrowed for TODAY only, written with the same writeBorrowedDay, and nothing on the plan moves. What is new is the
// choice and the advice, both mine under his CSCS delegation:
//
//   WHICH SESSION. (1) The one he named, if it is on offer. (2) A session he MISSED earlier this week: a rest day spent
//   making up missed work restores the week's volume rather than adding to it. (3) Otherwise the upcoming session whose
//   own day is furthest away, so the same work is least likely to land on back-to-back days. (4) Tomorrow's session
//   only when nothing else is left, and then the card says to take tomorrow as the rest. (5) With every session already
//   trained this week, the one trained longest ago is repeated and the card says it is extra work on top of a full
//   week, with the easier option beside it. It never refuses: the only "no" is a day that already has a session.
//
//   THE ADVICE. A rest day is where the week's training is absorbed; training through one is fine when fresh, and the
//   price is recovery before the next session, which the card names. One line on what the borrowed session is (made
//   up, early, tomorrow's, or a repeat), and one on the lighter choice when tired or sore. No sentence claims a
//   physiological effect the app cannot know about him.
// ---------------------------------------------------------------------------
import type { WorkoutDay } from './types'
import { trainAnywayOptions } from './borrowed-day'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export interface TrainTodayCell { date: string; dayName: string; state: string; session?: WorkoutDay | null }

export type TrainTodayWhy = 'named' | 'missed' | 'ahead' | 'tomorrow' | 'repeat'

export type TrainTodayPlan =
  | { ok: true; day: string; focus: string; why: TrainTodayWhy; lead: string; advice: string[] }
  | { ok: false; reason: string }

const ahead = (from: string, to: string) => {
  const a = WEEKDAYS.indexOf(from), b = WEEKDAYS.indexOf(to)
  return a < 0 || b < 0 ? 7 : (b - a + 7) % 7 || 7
}

/** "Upper Push" or the weekday when the plan row has no name. */
const focusOf = (d: WorkoutDay) => (d.focus && d.focus.trim()) || `${d.day}'s session`

export function planTrainToday(input: {
  plan: WorkoutDay[]
  todayName: string
  todayDate: string
  week: TrainTodayCell[]
  /** Does today already hold a session (its own, a moved one, or one borrowed already)? */
  todayHasSession: boolean
  todayFocus?: string | null
  borrowedOn?: (date: string) => string | null
  /** What he named, in his words or the coach's: a weekday ("Tuesday's") or a session's name ("legs"). */
  named?: string | null
}): TrainTodayPlan {
  if (input.todayHasSession) {
    return { ok: false, reason: `Today already has ${input.todayFocus ? input.todayFocus : 'a session'} on it, so that's your session for today.` }
  }
  const sessions = input.plan.filter(d => d.exercises.length > 0 && d.day !== input.todayName)
  if (sessions.length === 0) return { ok: false, reason: "Your plan has no weights sessions to bring onto today yet." }
  const open = new Set(trainAnywayOptions({ plan: input.plan, todayName: input.todayName, week: input.week, borrowedOn: input.borrowedOn }).map(o => o.day))
  const tomorrowName = WEEKDAYS[(WEEKDAYS.indexOf(input.todayName) + 1) % 7]

  let pick: WorkoutDay | undefined
  let why: TrainTodayWhy | undefined
  const said = (input.named ?? '').toLowerCase()
  if (said.trim()) {
    const words: string[] = said.match(/[a-z]+/g) ?? []
    pick = sessions.find(d => words.includes(d.day.toLowerCase()))
      ?? sessions.find(d => open.has(d.day) && (d.focus ?? '').toLowerCase().split(/[^a-z]+/).some(w => w.length > 2 && words.includes(w)))
      ?? sessions.find(d => (d.focus ?? '').toLowerCase().split(/[^a-z]+/).some(w => w.length > 2 && words.includes(w)))
    if (pick) why = 'named'
  }
  if (!pick) {
    const missed = input.week
      .filter(c => c.date < input.todayDate && c.state === 'missed')
      .map(c => sessions.find(d => d.day === (c.session?.day ?? c.dayName)))
      .filter((d): d is WorkoutDay => !!d && open.has(d.day))
    if (missed.length > 0) { pick = missed[missed.length - 1]; why = 'missed' }
  }
  if (!pick) {
    const upcoming = sessions.filter(d => open.has(d.day) && d.day !== tomorrowName)
      .sort((a, b) => ahead(input.todayName, b.day) - ahead(input.todayName, a.day))
    if (upcoming.length > 0) { pick = upcoming[0]; why = 'ahead' }
  }
  if (!pick && open.has(tomorrowName)) { pick = sessions.find(d => d.day === tomorrowName); why = 'tomorrow' }
  if (!pick) {
    // Everything trained this week: the session trained longest ago comes round again.
    const trainedOrder = input.week.filter(c => c.date < input.todayDate && (c.state === 'done' || c.state === 'partial'))
      .map(c => c.session?.day ?? input.borrowedOn?.(c.date) ?? c.dayName)
    pick = trainedOrder.map(n => sessions.find(d => d.day === n)).find((d): d is WorkoutDay => !!d) ?? sessions[0]
    why = 'repeat'
  }
  if (why === 'named' && pick && pick.day === tomorrowName && open.has(pick.day)) why = 'tomorrow'
  if (why === 'named' && pick && !open.has(pick.day)) why = 'repeat'

  const focus = focusOf(pick!)
  // The next session after today on its own day, the one a rest day is recovery for.
  const next = sessions.filter(d => d.day !== pick!.day || why === 'repeat')
    .sort((a, b) => ahead(input.todayName, a.day) - ahead(input.todayName, b.day))[0]
  const nextWords = next ? (next.day === tomorrowName ? `tomorrow's ${focusOf(next)}` : `${focusOf(next)} on ${next.day}`) : null

  const advice: string[] = []
  advice.push(nextWords
    ? `Today is a planned rest day. Training is fine if you feel fresh; the cost is less recovery before ${nextWords}.`
    : 'Today is a planned rest day. Training is fine if you feel fresh; the cost is less recovery before your next session.')
  if (why === 'missed') advice.push(`It makes up ${pick!.day}'s session, which you missed this week, so the week ends with the work it was built on.`)
  else if (why === 'ahead' || (why === 'named' && pick!.day !== tomorrowName)) advice.push(`It's ${pick!.day}'s session done early, so on ${pick!.day} you can rest instead.`)
  else if (why === 'tomorrow') advice.push("It's tomorrow's session, so take tomorrow as your rest rather than doing it twice.")
  else advice.push("You've already trained every session this week, so this is extra work on top of a full week. Keep the weights you used last time.")
  advice.push(`If you're sore or tired, a 20 to 30 minute walk does more for ${next ? 'your next session' : 'the week'} than a full session.`)
  advice.push('Just today: your plan doesn\'t change.')

  return { ok: true, day: pick!.day, focus, why: why!, lead: `do ${pick!.day}'s **${focus}** today`, advice }
}

/**
 * Does this ask for a WEIGHTS session ("add a weight session just for today", "can I lift today", "a gym session")?
 * The deployed coach reaches for the activity swap on a rest day; these words turn its dead end into the borrow card.
 * Cardio words (a run, a ride, a swim, a class) are not this: they are a planned cardio session, a different offer.
 */
export function asksForWeightsSession(said: string): boolean {
  const t = said.toLowerCase()
  if (/\b(run|running|jog|ride|cycle|cycling|bike|swim|swimming|walk|hike|class|yoga|pilates|cardio)\b/.test(t)) return false
  return /\b(weights?|lift|lifting|strength|gym|resistance|weight session|workout|session|train(ing)?)\b/.test(t)
}
