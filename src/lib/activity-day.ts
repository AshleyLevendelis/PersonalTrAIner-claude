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
 * ONE PHRASE FOR ONE THING. "Walk · 20m · RPE 4".
 *
 * Both surfaces that print a timed prescription print it this way — the card
 * on Today and the row in the week list, which said "20 min @ RPE 4" and
 * "20m · RPE 4" respectively for the identical fact. Effort disappears rather
 * than printing "RPE undefined", because PlannedActivity's targetRpe is
 * deliberately optional: a first walking prescription may carry no effort
 * target at all.
 */
export function prescriptionLine(p: TimedPrescription): string {
  const effort = p.targetRpe != null ? ` · RPE ${p.targetRpe}` : ''
  return `${p.activity} · ${p.duration}m${effort}`
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
