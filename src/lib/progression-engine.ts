import { supabase } from './supabase'
import { getExerciseEntry, getExerciseId } from './exercise-db'
import { categorize, getLoadIncrementKg, isExternallyLoaded } from './load-prescription'
import { getLastSessionSets, getSetsForDate } from './set-log-store'
import type { ExerciseTier, ExerciseSetLog } from './types'

// ---------------------------------------------------------------------------
// All progression reads run against the unified store (exercise_set_logs via
// set-log-store's merged reads — C0 Part 4), keyed by exercise_id, working
// sets only. The documented §3 contract is preserved exactly: recency by
// completed_at, strictly-before-sessionDate scoping, the every-set-hit-top-
// reps gate, equipment-aware increments. What changed vs the legacy set_logs
// reads: duplicates can no longer exist (unique key upstream), sets arrive
// ordered by set_number, and the progression base weight is the MAX working-
// set weight — not whichever row the database happened to return first
// (landmine L3: with ramped loading, "first row" could be a light early set).
// ---------------------------------------------------------------------------

export interface ProgressionResult {
  exerciseName: string
  currentWeight: number
  newWeight: number
  reason: string
  type: 'overload' | 'primer_complete'
}

const NON_PROGRESSABLE_TIERS: Set<string> = new Set([
  'tier_0_primer',
  'tier_4_finisher',
])

const NON_PROGRESSABLE_DB_TIERS: Set<string> = new Set([
  'primer',
  'cardio',
])

function isProgressable(exerciseName: string, tier?: ExerciseTier): boolean {
  if (tier && NON_PROGRESSABLE_TIERS.has(tier)) return false
  const entry = getExerciseEntry(exerciseName)
  if (entry && NON_PROGRESSABLE_DB_TIERS.has(entry.mechanics_tier)) return false
  if (entry && entry.equipment.length === 0) return false
  return true
}

function parseRepRange(reps: string): { low: number; high: number } {
  const rangeMatch = reps.match(/^(\d+)\s*-\s*(\d+)$/)
  if (rangeMatch) {
    return { low: parseInt(rangeMatch[1]), high: parseInt(rangeMatch[2]) }
  }
  const single = parseInt(reps)
  if (!isNaN(single)) return { low: single, high: single }
  return { low: 8, high: 12 }
}

function calculateIncrement(currentWeight: number): number {
  if (currentWeight <= 0) return 2.5
  const increment = currentWeight * 0.025
  return Math.max(1, Math.round(increment * 2) / 2)
}

/** The progression base: the heaviest working set of the session (kills L3 — never "whichever row came back first"). */
function maxWorkingWeight(sets: ExerciseSetLog[]): number {
  return sets.reduce((max, s) => Math.max(max, s.weight_kg), 0)
}

/**
 * Same-session progressive-overload check (the toast after a completed set).
 * Reads today's merged sets — including ones still pending sync — so it works
 * mid-session even if the network is behind.
 */
export async function checkDoubleProgression(
  userId: string,
  exerciseName: string,
  sessionDate: string,
  prescribedSets: number,
  prescribedReps: string,
  tier?: ExerciseTier
): Promise<ProgressionResult | null> {
  const exerciseId = getExerciseId(exerciseName)
  const todaySets = (await getSetsForDate(userId, sessionDate))
    .filter(s => (s.exercise_id ?? getExerciseId(s.exercise_name)) === exerciseId && !s.is_warmup)
    .sort((a, b) => a.set_number - b.set_number)

  if (!isProgressable(exerciseName, tier)) {
    if (todaySets.length >= prescribedSets) {
      return {
        exerciseName,
        currentWeight: 0,
        newWeight: 0,
        reason: 'Primer / finisher completed — no load progression applicable.',
        type: 'primer_complete',
      }
    }
    return null
  }

  if (todaySets.length < prescribedSets) return null

  const relevantSets = todaySets.slice(0, prescribedSets)
  const { high: topReps } = parseRepRange(prescribedReps)

  const allAtTop = relevantSets.every(s => s.reps_completed >= topReps)
  const avgRpe = relevantSets.reduce((sum, s) => sum + (s.rpe ?? 7), 0) / relevantSets.length
  const rpeQualifies = avgRpe <= 8

  if (!allAtTop || !rpeQualifies) return null

  const currentWeight = maxWorkingWeight(relevantSets)
  const increment = calculateIncrement(currentWeight)
  const newWeight = currentWeight + increment

  return {
    exerciseName,
    currentWeight,
    newWeight,
    reason: `All ${prescribedSets} sets completed at ${topReps} reps with RPE ${avgRpe.toFixed(1)} — progressive overload triggered.`,
    type: 'overload',
  }
}

export interface DoubleProgressionRecommendation {
  weightKg: number
  /** True when every logged set from the last session hit the top of the rep range and the weight bumped up. */
  didProgress: boolean
  note: string
}

/**
 * True double progression from the trainee's actual last session, per the
 * rule this app shows next to every loaded exercise: hit the top of the rep
 * range on every set → the weight goes up by one loading-mode-sized
 * increment; anything short of that → hold the weight and chase reps first.
 * `sessionDate` scopes the lookup to sessions strictly before it, so
 * re-running this mid-session doesn't pick up sets just logged today.
 */
export async function getDoubleProgressionRecommendation(
  profileId: string,
  exerciseName: string,
  sessionDate: string,
  prescribedRepRangeHigh: number,
): Promise<DoubleProgressionRecommendation | null> {
  const exerciseId = getExerciseId(exerciseName)
  const sessionSets = await getLastSessionSets(profileId, exerciseId, sessionDate)
  if (sessionSets.length === 0) return null

  const lastWeight = maxWorkingWeight(sessionSets)
  const hitTopOnAllSets = sessionSets.every(s => s.reps_completed >= prescribedRepRangeHigh)

  if (!hitTopOnAllSets) {
    return {
      weightKg: lastWeight,
      didProgress: false,
      note: `Held at ${lastWeight}kg — didn't hit ${prescribedRepRangeHigh} reps on every set last time. Aim for more reps before adding load.`,
    }
  }

  const entry = getExerciseEntry(exerciseName)
  const increment = entry && isExternallyLoaded(entry) ? getLoadIncrementKg(entry, categorize(entry), lastWeight) : calculateIncrement(lastWeight)
  const weightKg = lastWeight + increment

  return {
    weightKg,
    didProgress: true,
    note: `Hit ${prescribedRepRangeHigh} reps on every set last time — up to ${weightKg}kg. Reps reset toward the bottom of the range.`,
  }
}

/** Most recent logged working set for an exercise (optionally scoped to a mesocycle week). */
export async function getLastLoggedWeight(
  userId: string,
  exerciseName: string,
  weekNumber?: number
): Promise<{ weight_kg: number; reps_completed: number } | null> {
  let query = supabase
    .from('exercise_set_logs')
    .select('weight_kg, reps_completed')
    .eq('user_id', userId)
    .eq('exercise_id', getExerciseId(exerciseName))
    .eq('is_warmup', false)
    .order('completed_at', { ascending: false })
    .limit(1)

  if (weekNumber !== undefined) {
    query = query.eq('week_number', weekNumber)
  }

  const { data } = await query
  if (!data || data.length === 0) return null
  return { weight_kg: Number(data[0].weight_kg), reps_completed: data[0].reps_completed }
}
