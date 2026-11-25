// ---------------------------------------------------------------------------
// WHAT IS COMING UP, SAID AHEAD (Ashley's brief, 25 Nov 2026: "still not proactive enough ... a great personal trainer
// feels like someone who has been watching your week, knows what you're doing next").
//
// The coach's reminders were written from almost nothing: "Today is a training day and nothing is logged yet." So the
// best a reminder could say was "are you ready for your session today?", the same words every training morning. The
// server cannot run the plan engine, so Home works these out from the plan it already holds and sends them ahead with
// the other facts (moment-facts.ts), keyed by DATE, so a server reading them tomorrow still knows which day is which:
//   - each of yesterday, today and tomorrow: the session's name, its main lift and that lift's weight, whether the
//     session is built around heavy leg work, and any hard leg-taxing class or sport on that weekday (the profile's
//     "other training");
//   - one pattern worth raising, from the same finders the chat reads (coach-patterns.ts): a stuck lift, "Too hard"
//     piling up, protein short three logged days running.
//
// WHAT COUNTS AS A CLASH is mine (CSCS), basis in BACKLOG: hard leg-dominant conditioning, running or combat sport on
// the same day as, or the day before, a session built around a heavy lower-body lift. That is where the interference
// effect and plain fatigue cost the most quality on the lift; the standard answer is strength first on the day and a
// trimmed accessory block, never a dropped main lift (his 13 Sep "protect the main lift" ruling for shortening).
// ---------------------------------------------------------------------------
import type { ConcurrentActivity, WorkoutDay } from './types'
import { getExerciseEntry } from './exercise-db'
import { formatLoad, isLowerBodyMovement, labelModeForEntry } from './load-prescription'
import { activityDays } from './concurrent-activity'
import type { stuckLifts, lowProtein } from './coach-patterns'

export interface DayBrief {
  /** The session's name ("Lower Body Strength"); null on a rest day. */
  session: string | null
  /** Its main lift, by name, when it carries a weight. */
  lift: string | null
  /** That lift's planned weight as every screen prints it ("85kg", "24kg per hand"). */
  weight: string | null
  /** The session is built around a heavy lower-body lift. */
  heavyLegs: boolean
  /** Hard, leg-taxing classes or sport on this day, in the person's own words ("Muay Thai"). */
  hardActivities: string[]
}

export type PatternAhead =
  | { kind: 'stuck_lift'; lift: string; weight: string; sessions: number }
  | { kind: 'too_hard'; times: number }
  | { kind: 'low_protein'; days: number }

export interface DaysAhead {
  /** The local date these were worked out on. */
  asOf: string
  /** Keyed by local date (YYYY-MM-DD). */
  days: Record<string, DayBrief>
  pattern: PatternAhead | null
}

/** What a class or sport asks of the legs, read off the demands the coach mapped it onto. */
const LEG_TAXING = new Set(['knee_dominant', 'running', 'conditioning', 'striking', 'grappling'])
const COMBAT = new Set(['striking', 'grappling'])
/** The same line the plan uses for "hard" (concurrent-activity.ts HARD_ACTIVITY_INTENSITY). */
const HARD = 0.7

/** A class or sport hard enough on the legs to cost a heavy lower-body session its quality. */
export function isLegTaxing(a: ConcurrentActivity): boolean {
  const demands = (a.movement_demands ?? []).filter(d => LEG_TAXING.has(d))
  if (demands.length === 0) return false
  return demands.some(d => COMBAT.has(d)) || (typeof a.intensity === 'number' && a.intensity >= HARD)
}

/** The day's brief. `weekday` is the full name ("Tuesday"), the spelling the profile's other training uses. */
export function dayBriefOf(day: WorkoutDay | null | undefined, weekday: string, activities: ConcurrentActivity[] | undefined): DayBrief {
  const hardActivities = (activities ?? [])
    .filter(a => activityDays([a]).has(weekday) && isLegTaxing(a))
    .map(a => a.name.trim())
    .filter(Boolean)
  const exercises = day?.exercises ?? []
  if (!day || exercises.length === 0) return { session: null, lift: null, weight: null, heavyLegs: false, hardActivities }
  const main = exercises.find(e => e.tier === 'tier_1_primary' && Number(e.suggested_load_kg) > 0)
  const entry = main ? getExerciseEntry(main.name) : undefined
  const heavyLegs = main
    ? !!entry && isLowerBodyMovement(entry)
    : /\b(?:leg|legs|lower)\b/i.test(day.focus ?? '')
  return {
    session: day.focus || null,
    lift: main?.name ?? null,
    weight: main && entry ? formatLoad(Number(main.suggested_load_kg), labelModeForEntry(entry)).replace(/^~/, '') : null,
    heavyLegs,
    hardActivities,
  }
}

/** The one pattern worth a message, the most actionable first: a stuck lift, then "Too hard" piling up, then protein. */
export function patternAheadOf(input: {
  stuck: ReturnType<typeof stuckLifts>
  tooHard: number | null
  protein: ReturnType<typeof lowProtein>
}): PatternAhead | null {
  const s = input.stuck[0]
  if (s) return { kind: 'stuck_lift', lift: s.name, weight: `${s.weightKg}kg`, sessions: s.sessions }
  if (input.tooHard != null) return { kind: 'too_hard', times: input.tooHard }
  if (input.protein) return { kind: 'low_protein', days: input.protein.days }
  return null
}
