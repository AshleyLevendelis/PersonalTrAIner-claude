/**
 * A DAY WHOSE WHOLE PRESCRIPTION IS AN ACTIVITY — a walk, a swim, a ride.
 *
 * This module exists because the answer to "is this a session?" was being
 * guessed, separately, in four places, and every one of them guessed the same
 * way: `exercises.length > 0`. That is true of a gym day and false of a
 * beginner's 20-minute walk, so the walking plan — the only plan a true
 * beginner gets — was invisible to tomorrow's preview, to the week list, and
 * to the card that should have shown it. The card fell through to a blank
 * "log a walk or other activity" form: the plan said walk, and the screen
 * asked what you did.
 *
 * So the decision lives here, once, and the screens ask rather than infer.
 * A LEAF MODULE by design — it imports a type and nothing else — for the
 * reason tradeoff-shape.ts records: a phrasebook that reaches into the plan
 * engine drags the exercise catalogue into the main chunk.
 *
 * A gate over these functions proves the ANSWERS are right. It cannot prove a
 * screen asks the question — that is what verify:planned-activity is for.
 */

import type { WorkoutDay } from './types'
import { cardioReadback } from './cardio-effort'

/** The shape both a prescribed activity and a cardio finisher share. */
export interface TimedPrescription {
  activity: string
  duration: number
  targetRpe?: number
}

/**
 * Is this a day the plan SCHEDULED, whatever it prescribes?
 *
 * `is_scheduled` is the answer when the day carries it; the exercise count is
 * the fallback for plans stored before that field existed. Written as one
 * expression so the fallback cannot drift between readers — it had already
 * drifted, with dashboard-data.ts asking the flag and every screen counting
 * exercises.
 */
export function isScheduledDay(day?: WorkoutDay | null): boolean {
  if (!day) return false
  return day.is_scheduled ?? day.exercises.length > 0
}

/**
 * ONE PHRASE FOR ONE THING. "Walk · 20 min · Easy".
 *
 * Both surfaces that print a timed prescription print it this way — the card
 * on Today and the row in the week list, which said "20 min @ RPE 4" and
 * "20m · RPE 4" respectively for the identical fact. Effort disappears rather
 * than printing "RPE undefined", because PlannedActivity's targetRpe is
 * deliberately optional: a first walking prescription may carry no effort
 * target at all.
 *
 * THE SAME PHRASE A SAVED CARDIO ROW READS BACK, since 24 Sep 2026 — Ashley's
 * "like a lifting set" ruling put effort in three words everywhere, so the
 * plan saying "RPE 4" above a row that logs "Easy" would be one fact in two
 * vocabularies. It is literally the read-back function: what was planned and
 * what was done are written the same way, so they can be compared by eye.
 */
export function prescriptionLine(p: TimedPrescription): string {
  return cardioReadback({ activity: p.activity, minutes: p.duration, rpe: p.targetRpe })
}

/**
 * What a one-line preview of this day is measured in — minutes for an
 * activity day, exercises for a gym day. Never "0 exercises", which is the
 * empty card's lie at preview size.
 */
export function dayDetail(day: WorkoutDay): string {
  const planned = day.plannedActivity
  if (planned) return `${planned.duration} minutes`
  const n = day.exercises.length
  return `${n} exercise${n === 1 ? '' : 's'}`
}

/** How far back another day's optional cardio can be logged from its own day: the chat's rule for an earlier day (19 Nov 2026). */
export const LOG_BACK_DAYS = 14

/**
 * ANOTHER DAY'S OPTIONAL CARDIO, AS AN EXERCISE (his report 25 Nov 2026: "The optional rest day exercises should be
 * loggable like other exercises"). Today's card has logged it since 24 Sep; any other day showed one grey sentence.
 *   - `log`: today, or a past day inside the plan and the last LOG_BACK_DAYS days. The row logs to THAT date.
 *   - `ahead`: a day still to come. The row shows the prescription; nothing is logged before it happens, the rule a
 *     peeked training day keeps (its exercises are read-only).
 *   - `closed`: further back than that, read-only.
 * Dates are YYYY-MM-DD local; compared as days, never instants.
 */
export function optionalCardioMode(date: string, today: string): 'log' | 'ahead' | 'closed' {
  if (date > today) return 'ahead'
  const [y, m, d] = today.split('-').map(Number)
  const back = new Date(Date.UTC(y, m - 1, d - LOG_BACK_DAYS))
  const earliest = back.toISOString().slice(0, 10)
  return date >= earliest ? 'log' : 'closed'
}

/**
 * THE OPTIONAL CARDIO'S NAME AS A TITLE (his 25 Nov 2026 screenshot: rest-day cardio drawn like today's session). A
 * plan line reads "Zone 2 Aerobic Base (walking, cycling, swimming) — conversational pace, ~60-70% max HR": the title is
 * the name alone, and the choices and the protocol go on the line under it, in that order.
 */
export function optionalCardioTitle(activity: string): { title: string; detail: string | null } {
  const dash = /^(.*?)\s+[—–-]\s+(.+)$/.exec(activity.trim())
  const name = dash ? dash[1] : activity.trim()
  const protocol = dash ? dash[2] : null
  const paren = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(name)
  const title = paren ? paren[1] : name
  const detail = [paren ? paren[2] : null, protocol].filter(Boolean).join(' · ')
  return { title, detail: detail || null }
}
