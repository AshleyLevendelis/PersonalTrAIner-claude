import type { UserProfile, WorkoutDay, Exercise, RecommendedCardio, PlannedActivity } from '@/lib/types'
import { getExerciseEntry } from '@/lib/exercise-db'
import { getSessionMaximumSeconds, estimateDaySeconds } from '@/lib/session-duration'

// ---------------------------------------------------------------------------
// THE PATHWAY (strategy slice 3, his rulings of 13 Nov 2026): the starting-out
// plan's walks, then two short home strength sessions from week 3, balance work
// from 65, and a swim or ride in place of one walk a week when he enjoys one.
// docs/plans/pathway.md holds the CSCS basis.
//
// What this file does NOT do, and why: it never reads age to make anything
// lighter, shorter or easier. Age only ADDS (a balance hold), on his ruling
// "age only adds safeguards and never downgrades".
// ---------------------------------------------------------------------------

export type AgeBand = 'under_50' | '50_to_64' | '65_and_over'

const BALANCE_FROM_AGE = 65

/** The age band from the age the app holds; null when it holds none (nothing is assumed). */
export function ageBand(age: number | null | undefined): AgeBand | null {
  if (typeof age !== 'number' || !Number.isFinite(age) || age <= 0) return null
  if (age >= BALANCE_FROM_AGE) return '65_and_over'
  if (age >= 50) return '50_to_64'
  return 'under_50'
}

/** Does this person get balance work added? Only ever adds; never read to take anything away. */
export function needsBalanceWork(profile: Pick<UserProfile, 'age'>): boolean {
  return ageBand(profile.age) === '65_and_over'
}

export const BALANCE_HOLD = 'Single-Leg Balance Hold'

/** The warm-up line for an ordinary plan (65 and over): the same hold, a hand near support. */
export const BALANCE_WARMUP_ITEM = {
  name: BALANCE_HOLD,
  prescription: '2 x 20-30s each leg, a hand near a counter or wall',
  purpose: 'Balance work, added from 65: it keeps you steady on your feet and lowers the chance of a fall',
  duration_seconds: 120,
} as const

// ---------------------------------------------------------------------------
// Home strength from week 3
// ---------------------------------------------------------------------------

export const HOME_STRENGTH_FROM_WEEK = 3
/**
 * Week 9 on (blocks 3 and 4): more reps, the same two sets. Progression by reps
 * (double progression) keeps the session inside the 10-15 minutes his strategy
 * asks for; a third set took it to about 17.
 */
const MORE_REPS_FROM_WEEK = 9
const HOME_STRENGTH_SETS = 2
/** Between sets: 45s, never 30 (his 18 Sep 2026 rest ruling holds even at bodyweight). */
const HOME_STRENGTH_REST = '45s'
const HOME_STRENGTH_DAYS = 2
/** The walk on a strength day is shortened to fit the session length he chose, never below this. */
export const SHORTEST_WALK_ON_STRENGTH_DAY = 15

/**
 * One move per pattern, in session order: squat, push, pull, hinge. `instead`
 * is the pattern's knee-friendly or joint-friendly alternative, tried when the
 * first is ruled out by an injury or a ban. A pattern with neither is left out
 * and the day's note says so.
 */
const CIRCUIT: { pattern: 'squat' | 'push' | 'pull' | 'hinge'; first: string; instead?: string; cue: string }[] = [
  { pattern: 'squat', first: 'Box Squat (Bodyweight)', instead: 'Wall Sit', cue: 'sit to a chair and stand back up' },
  { pattern: 'push', first: 'Incline Push-Ups', cue: 'hands on a worktop or the back of a sofa' },
  { pattern: 'pull', first: 'Towel Row', cue: 'a towel round a sturdy door handle' },
  { pattern: 'hinge', first: 'Glute Bridge', cue: 'lying on your back, feet flat' },
]

function homeStrengthReps(weekNumber: number, timed: boolean): string {
  const later = weekNumber >= MORE_REPS_FROM_WEEK
  if (timed) return later ? '30-40s' : '20-30s'
  return later ? '12-15' : '8-12'
}

function slotFor(name: string, weekNumber: number, cue: string, pattern?: Exercise['movement_pattern']): Exercise | null {
  const entry = getExerciseEntry(name)
  if (!entry) return null
  const timed = entry.prescription_type === 'time'
  return {
    id: entry.id,
    name: entry.name,
    sets: HOME_STRENGTH_SETS,
    reps: homeStrengthReps(weekNumber, timed),
    rest: HOME_STRENGTH_REST,
    substitution: '',
    prescription_type: entry.prescription_type,
    ...(pattern ? { movement_pattern: pattern } : {}),
    tier: 'tier_2_secondary',
    intensity: 'RPE 5-6',
    suggested_load: 'Bodyweight',
    suggested_load_kg: null,
    load_guidance: `At home: ${cue}. Stop each set with two to four more you could have done.`,
  }
}

export interface HomeCircuit {
  exercises: Exercise[]
  /** Patterns left out because nothing safe was eligible, in plain words. */
  leftOut: string[]
}

/**
 * The home circuit for a week. `eligible` is the plan's own pool test
 * (equipment, injuries and bans), handed in by the generator so this file and
 * the plan can never disagree about what is safe for this person.
 */
export function homeCircuit(
  profile: Pick<UserProfile, 'age'>,
  weekNumber: number,
  eligible: (name: string) => boolean,
): HomeCircuit {
  const exercises: Exercise[] = []
  const leftOut: string[] = []
  for (const move of CIRCUIT) {
    const pick = [move.first, move.instead].find((n): n is string => !!n && eligible(n))
    const slot = pick ? slotFor(pick, weekNumber, move.cue, move.pattern) : null
    if (slot) exercises.push(slot)
    else leftOut.push(move.pattern)
  }
  if (needsBalanceWork(profile) && eligible(BALANCE_HOLD)) {
    // One hold a leg, as two timed sets taken left then right (a format every screen and the session clock already
    // read). Balance practice is frequent and short; the ordinary plan's warm-up carries it on the other days.
    const hold = slotFor(BALANCE_HOLD, weekNumber, 'standing on one leg, a hand near a counter. Left leg, then right')
    // 15s to change legs: a balance hold is not a lift, and the rest floors are about lifts.
    if (hold) exercises.push({ ...hold, sets: 2, rest: '15s' })
  }
  return { exercises, leftOut }
}

/** Minutes for the circuit, by the app's own session clock (the same one every screen and budget reads). */
export function circuitMinutes(exercises: Exercise[]): number {
  return Math.round(estimateDaySeconds({ day: 'circuit', focus: '', exercises }) / 60)
}

/** Which walk days take the strength: up to two, as far apart as the week allows (never back to back if avoidable). */
export function strengthDayIndices(days: WorkoutDay[]): number[] {
  const walks = days.map((d, i) => ({ d, i })).filter(x => x.d.plannedActivity && x.d.exercises.length === 0)
  if (walks.length <= HOME_STRENGTH_DAYS) return walks.map(w => w.i)
  const order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const pos = (name: string) => Math.max(0, order.findIndex(o => o.startsWith(name.toLowerCase().slice(0, 3))))
  // THE PAIR FURTHEST APART ROUND THE WEEK, not only inside it: Monday and Sunday are six days apart on the strip and
  // one day apart in his life, because next Monday follows. The smaller of the two gaps decides; the earliest pair wins
  // a tie.
  let best: [number, number] = [walks[0].i, walks[1].i]
  let bestGap = -1
  for (let a = 0; a < walks.length; a++) {
    for (let b = a + 1; b < walks.length; b++) {
      const inside = Math.abs(pos(walks[b].d.day) - pos(walks[a].d.day))
      const gap = Math.min(inside, 7 - inside)
      if (gap > bestGap) { bestGap = gap; best = [walks[a].i, walks[b].i] }
    }
  }
  return best
}

// The reason names no number: the plan's own final time check can shorten the walk again, and a sentence quoting a
// figure the row no longer shows would be the app contradicting itself.
function walkAsCardio(activity: PlannedActivity, minutes: number, cut: boolean): RecommendedCardio {
  return {
    activity: activity.activity,
    duration: minutes,
    targetRpe: activity.targetRpe ?? 3,
    timing: 'post_session',
    reason: cut
      ? 'Your walk, after the strength work, a little shorter today so the day fits the time you set aside.'
      : `Your walk, after the strength work. Same easy pace as always.`,
  }
}

/**
 * THE WEEK'S NOTE ON THE PATHWAY, for a week with home strength in it: no load words (there is no load), the minutes
 * and the effort. The walk's own reason comes first, as on every walking week.
 */
/** The day's name on a strength + walk day, and the mark a week is a pathway week by. */
export const PATHWAY_FOCUS = 'Home strength + walk'

/** A week of the pathway: a home strength day in it, or nothing but activities. Read from the week itself. */
export function isPathwayWeek(week: { days: WorkoutDay[] }): boolean {
  return week.days.some(d => d.focus === PATHWAY_FOCUS)
    || (week.days.length > 0 && week.days.every(d => d.exercises.length === 0) && week.days.some(d => !!d.plannedActivity))
}

export const PATHWAY_STRENGTH_NOTE = 'Two short home strength sessions this week, about 15 minutes each, then your walk. Easy effort: stop each move with a few more in the tank.'

// ---------------------------------------------------------------------------
// Swim or ride in place of a walk
// ---------------------------------------------------------------------------

export type EnjoyedActivity = 'swimming' | 'cycling'
export const ENJOYED_ACTIVITY_OPTIONS: { value: EnjoyedActivity; label: string; activity: string }[] = [
  { value: 'swimming', label: 'Swimming', activity: 'Swim' },
  { value: 'cycling', label: 'Cycling', activity: 'Cycle' },
]

function enjoyedThisWeek(enjoyed: readonly string[] | null | undefined, weekNumber: number): (typeof ENJOYED_ACTIVITY_OPTIONS)[number] | null {
  const picks = ENJOYED_ACTIVITY_OPTIONS.filter(o => (enjoyed ?? []).includes(o.value))
  if (picks.length === 0) return null
  return picks[(weekNumber - 1) % picks.length]
}

// ---------------------------------------------------------------------------
// The week
// ---------------------------------------------------------------------------

/**
 * One pathway week, applied after the walks are stamped. Only ADDS: strength
 * from week 3 on two walk days, and one walk a week as a swim or ride he said
 * he enjoys. The walk's minutes and effort are the starting-out plan's own.
 */
export function applyPathwayWeek(
  days: WorkoutDay[],
  weekNumber: number,
  profile: Pick<UserProfile, 'age' | 'session_duration_preference' | 'enjoyed_activities'>,
  eligible: (name: string) => boolean,
): WorkoutDay[] {
  const out = days.map(d => ({ ...d }))
  const strength = weekNumber >= HOME_STRENGTH_FROM_WEEK ? strengthDayIndices(out) : []

  if (strength.length > 0) {
    const circuit = homeCircuit(profile, weekNumber, eligible)
    if (circuit.exercises.length > 0) {
      const maxMinutes = Math.round(getSessionMaximumSeconds(profile.session_duration_preference || '30-45') / 60)
      const work = circuitMinutes(circuit.exercises)
      for (const i of strength) {
        const walk = out[i].plannedActivity!
        const room = maxMinutes - work
        const minutes = Math.max(SHORTEST_WALK_ON_STRENGTH_DAY, Math.min(walk.duration, room))
        out[i] = {
          day: out[i].day,
          focus: PATHWAY_FOCUS,
          exercises: circuit.exercises.map(e => ({ ...e })),
          is_scheduled: true,
          recommendedCardio: walkAsCardio(walk, minutes, minutes < walk.duration),
          ...(circuit.leftOut.length > 0
            ? { conditioning_note: `Left out for now to work around what you've told me: the ${circuit.leftOut.join(' and ')} move.` }
            : {}),
        } as WorkoutDay
      }
    }
  }

  const swap = enjoyedThisWeek(profile.enjoyed_activities, weekNumber)
  if (swap) {
    // The LAST walk-only day, so the swim or ride sits away from the first strength day.
    for (let i = out.length - 1; i >= 0; i--) {
      const a = out[i].plannedActivity
      if (!a || out[i].exercises.length > 0 || a.activity !== 'Walk') continue
      out[i] = {
        ...out[i],
        focus: swap.activity,
        plannedActivity: {
          ...a,
          activity: swap.activity,
          reason: `A ${swap.label.toLowerCase()} session in place of one walk this week, because you said you enjoy it. Same easy effort and the same minutes.`,
        },
      }
      break
    }
  }
  return out
}
