import type { UserProfile, WorkoutDay, PlannedActivity } from '@/lib/types'
import { hasHealthCondition } from '@/lib/health-conditions'
import { effectiveRecoveryCapacity } from '@/lib/concurrent-activity'
import { roundsMinutes } from '@/lib/planned-rounds'

// ---------------------------------------------------------------------------
// CARDIO DAYS A WEEK (his ruling 24 Nov 2026, "A, build it"): someone who loves cardio is asked how many cardio days a
// week they want (0-3), and the plan builds those as sessions of their own: intervals on the round timer, or steady
// minutes on a countdown (planned-rounds.ts and PlannedRoundsStart carry them to the screen and the log).
//
// Mine (CSCS), recorded in BACKLOG with the basis:
//   - CARDIO DAYS REPLACE LIFTING DAYS DOWN TO TWO, as running does (running.ts): two strength sessions a week is the
//     floor most guidance sets for keeping strength and muscle, so with fewer days to spare the cardio days are fewer,
//     and with two days or fewer there are none (the goal's conditioning still sits inside the lifting days).
//   - A MIX, MOSTLY STEADY: one day is intervals; two are intervals and steady; three are two intervals and one steady,
//     never two interval days in a row. A beginner or low recovery gets at most one interval day.
//   - LOW IMPACT, BY FEEL: a bike, rower, cross-trainer or brisk uphill walk, never jumping; effort in words (Hard /
//     Steady), never a heart rate. A health condition (pregnancy included) caps intervals at RPE 7, never all-out, with
//     longer recoveries.
//   - PROGRESSION: an interval day adds a round each week of a block (to two more than it started), a steady day adds
//     five minutes (to ten more); a deload week is lighter; each later block works five seconds longer, to 45s.
//   - A RUNNING GOAL WINS: runs are this person's cardio, so a running goal leaves the cardio days unused.
// ---------------------------------------------------------------------------

export const CARDIO_DAYS_OPTIONS = [0, 1, 2, 3] as const
export type CardioDaysCount = (typeof CARDIO_DAYS_OPTIONS)[number]

/** The plan marks its cardio days by these activity names; the logs read them back by the same words. */
export const INTERVALS_ACTIVITY = 'Cardio intervals'
export const STEADY_ACTIVITY = 'Steady cardio'

/** What he asked for, 0-3; anything else (not asked, a stray value) is none. */
export function cardioDaysRequested(profile: Pick<UserProfile, 'cardio_days_per_week'> | null | undefined): CardioDaysCount {
  const n = Number(profile?.cardio_days_per_week)
  return n === 1 || n === 2 || n === 3 ? n : 0
}

/** Lifting keeps two days: the cardio days he can have from this many training days. */
export function cardioDaysFrom(requested: number, trainingDays: number): number {
  return Math.max(0, Math.min(requested, trainingDays - 2))
}

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const idx = (day: string) => Math.max(0, WEEK.indexOf(day.toLowerCase().slice(0, 3)))

export interface CardioSplit {
  liftDays: string[]
  cardioDays: { day: string; kind: 'intervals' | 'steady' }[]
}

function bits(m: number): number { let c = 0; for (; m; m &= m - 1) c++; return c }

/** How many of the cardio days are intervals: one, one, two; one at most for a beginner or low recovery. */
export function intervalDaysFor(cardioDays: number, cautious: boolean): number {
  if (cardioDays <= 0) return 0
  const n = cardioDays >= 3 ? 2 : 1
  return cautious ? Math.min(1, n) : n
}

/**
 * WHICH DAYS: every way of choosing the cardio days (and which are intervals) from the training days, the best kept. An
 * interval day the day before a lifting day costs most (tired legs spoil the lift); two interval days in a row cost
 * the same; cardio days back to back and lifting days back to back cost a little. Earliest wins a tie.
 */
export function chooseCardioDays(available: string[], cardioDays: number, intervals: number): CardioSplit {
  const days = [...available].sort((a, b) => idx(a) - idx(b))
  if (cardioDays <= 0) return { liftDays: days, cardioDays: [] }
  const n = days.length
  let best: { score: number; split: CardioSplit } | null = null
  for (let mask = 0; mask < 1 << n; mask++) {
    if (bits(mask) !== cardioDays) continue
    const cardio = days.filter((_, i) => mask & (1 << i))
    const lift = days.filter((_, i) => !(mask & (1 << i)))
    for (let im = 0; im < 1 << cardio.length; im++) {
      if (bits(im) !== intervals) continue
      const split: CardioSplit = { liftDays: lift, cardioDays: cardio.map((d, k) => ({ day: d, kind: im & (1 << k) ? 'intervals' : 'steady' })) }
      const score = scoreSplit(split)
      if (!best || score < best.score) best = { score, split }
    }
  }
  return best!.split
}

function scoreSplit(split: CardioSplit): number {
  const lift = new Set(split.liftDays.map(idx))
  const cardio = new Set(split.cardioDays.map(c => idx(c.day)))
  const hard = new Set(split.cardioDays.filter(c => c.kind === 'intervals').map(c => idx(c.day)))
  const next = (i: number) => (i + 1) % 7
  let score = 0
  for (const i of hard) {
    if (lift.has(next(i))) score += 10
    if (hard.has(next(i))) score += 10
  }
  for (const i of cardio) if (cardio.has(next(i))) score += 2
  for (const i of lift) if (lift.has(next(i))) score += 1
  return score
}

/** The training days left to lifting when cardio days are asked for, or null when there are none (or a running goal). */
export function cardioSplitFor(profile: Pick<UserProfile, 'cardio_days_per_week' | 'running_goal' | 'training_days' | 'training_experience' | 'recovery_capacity' | 'concurrent_activities'>): CardioSplit | null {
  if (profile.running_goal) return null
  const available = (profile.training_days ?? []).filter(d => d.available).map(d => d.day)
  const count = cardioDaysFrom(cardioDaysRequested(profile), available.length)
  if (count === 0) return null
  const cautious = profile.training_experience === 'beginner' || effectiveRecoveryCapacity(profile) === 'low'
  return chooseCardioDays(available, count, intervalDaysFor(count, cautious))
}

// ---------------------------------------------------------------------------
// The sessions
// ---------------------------------------------------------------------------

type DoseProfile = Pick<UserProfile, 'training_experience' | 'health_conditions' | 'injuries'>

function capped(profile: DoseProfile): boolean {
  return hasHealthCondition(profile)
}

/** Where he can do it: low impact always; a sore knee, hip or ankle keeps off the walk and the rower. */
function whereLine(profile: DoseProfile): string {
  const lowerJoint = (profile.injuries ?? []).some(j => /knee|hip|ankle/i.test(j))
  return lowerJoint
    ? 'On a bike or cross-trainer, whichever you have.'
    : 'On a bike, rower, cross-trainer or a brisk uphill walk, whichever you have.'
}

/** One interval session: the rounds the timer runs, and the session's minutes (rounds plus 10 minutes easy either side). */
export function intervalSession(profile: DoseProfile, weekInBlock: number, blockIndex: number, isDeload: boolean): PlannedActivity {
  const cap = capped(profile)
  const level = profile.training_experience
  const startRounds = level === 'beginner' ? 6 : level === 'advanced' ? 10 : 8
  const w = Math.max(1, Math.min(weekInBlock, 3))
  const rounds = isDeload ? Math.max(4, startRounds - 2) : startRounds + (w - 1)
  const work = cap || level === 'beginner' ? 30 : Math.min(45, 30 + 5 * Math.max(0, blockIndex))
  const rest = cap || level === 'beginner' ? 90 : 60
  const config = { rounds, workSeconds: work, restSeconds: rest }
  const targetRpe = cap ? 7 : isDeload ? 7 : 8
  const effort = cap ? 'hard but never all-out' : 'hard'
  return {
    activity: INTERVALS_ACTIVITY,
    duration: roundsMinutes(config) + 10,
    targetRpe,
    rounds: config,
    reason: `${rounds} rounds of ${work}s ${effort}, ${rest}s easy, with 5 minutes easy to warm up and to cool down. ${whereLine(profile)}`,
  }
}

/** One steady session: minutes at a pace you could talk at. */
export function steadySession(profile: DoseProfile, weekInBlock: number, isDeload: boolean): PlannedActivity {
  const start = profile.training_experience === 'beginner' ? 20 : 30
  const w = Math.max(1, Math.min(weekInBlock, 3))
  const full = start + 5 * (w - 1)
  const minutes = isDeload ? Math.max(15, Math.round((start * 0.7) / 5) * 5) : full
  return {
    activity: STEADY_ACTIVITY,
    duration: minutes,
    targetRpe: 5,
    reason: `${minutes} minutes at a pace you could hold a conversation at. ${whereLine(profile)}`,
  }
}

export function isCardioDay(day: Pick<WorkoutDay, 'plannedActivity'> | null | undefined): boolean {
  const a = day?.plannedActivity?.activity
  return a === INTERVALS_ACTIVITY || a === STEADY_ACTIVITY
}

/**
 * The week with its cardio days added, in calendar order. A day already carrying one of these sessions (a rebuild handed
 * a saved week) is dropped first, and so is anything on a cardio day without exercises (an optional rest-day
 * suggestion): the cardio session is that day. A day carrying exercises is never dropped.
 */
export function withCardioDays(
  days: WorkoutDay[],
  profile: Parameters<typeof cardioSplitFor>[0] & DoseProfile,
  weekInBlock: number,
  blockIndex: number,
  isDeload: boolean,
): WorkoutDay[] {
  const split = cardioSplitFor(profile)
  if (!split) return days
  const names = new Set(split.cardioDays.map(c => idx(c.day)))
  const kept = days.filter(d => !isCardioDay(d) && (d.exercises.length > 0 || !names.has(idx(d.day))))
  const added = split.cardioDays.map(c => {
    const planned = c.kind === 'intervals' ? intervalSession(profile, weekInBlock, blockIndex, isDeload) : steadySession(profile, weekInBlock, isDeload)
    return { day: c.day, focus: planned.activity, exercises: [], is_scheduled: true, plannedActivity: planned } as WorkoutDay
  })
  return [...kept, ...added].sort((a, b) => idx(a.day) - idx(b.day))
}
