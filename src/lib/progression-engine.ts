import { supabase } from './supabase'
import { getExerciseEntry } from './exercise-db'
import type { ExerciseTier } from './types'

export interface ProgressionResult {
  exerciseName: string
  currentWeight: number
  newWeight: number
  reason: string
  type: 'overload' | 'primer_complete'
}

interface SetLogRow {
  exercise_name: string
  weight_kg: number
  reps_completed: number
  rpe: number | null
  set_number: number
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

export async function checkDoubleProgression(
  userId: string,
  exerciseName: string,
  weekNumber: number,
  day: string,
  prescribedSets: number,
  prescribedReps: string,
  tier?: ExerciseTier
): Promise<ProgressionResult | null> {
  if (!isProgressable(exerciseName, tier)) {
    const { data: logs } = await supabase
      .from('set_logs')
      .select('exercise_name, weight_kg, reps_completed, rpe, set_number')
      .eq('user_id', userId)
      .eq('exercise_name', exerciseName)
      .eq('week_number', weekNumber)
      .eq('day', day)
      .order('set_number', { ascending: true })

    if (logs && logs.length >= prescribedSets) {
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

  const { data: logs } = await supabase
    .from('set_logs')
    .select('exercise_name, weight_kg, reps_completed, rpe, set_number')
    .eq('user_id', userId)
    .eq('exercise_name', exerciseName)
    .eq('week_number', weekNumber)
    .eq('day', day)
    .order('set_number', { ascending: true })

  if (!logs || logs.length < prescribedSets) return null

  const relevantSets = logs.slice(0, prescribedSets) as SetLogRow[]
  const { high: topReps } = parseRepRange(prescribedReps)

  const allAtTop = relevantSets.every(s => s.reps_completed >= topReps)
  const avgRpe = relevantSets.reduce((sum, s) => sum + (s.rpe || 7), 0) / relevantSets.length
  const rpeQualifies = avgRpe <= 8

  if (!allAtTop || !rpeQualifies) return null

  const currentWeight = relevantSets[0].weight_kg
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

/**
 * The weight logged for this exercise in the trainee's most recent prior
 * session — used to progress week 2+ prescriptions off real performance
 * instead of the bodyweight-multiplier estimate. `sessionDate` scopes the
 * lookup to sessions strictly before it, so re-running this mid-session
 * doesn't pick up sets just logged today.
 */
export async function getLastSessionLoad(
  profileId: string,
  exerciseName: string,
  sessionDate: string
): Promise<number | null> {
  const { data } = await supabase
    .from('set_logs')
    .select('weight_kg, completed_at')
    .eq('user_id', profileId)
    .eq('exercise_name', exerciseName)
    .lt('completed_at', sessionDate)
    .order('completed_at', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return null
  return data[0].weight_kg
}

/** Applies the same safe overload increment used by checkDoubleProgression, so a logged 80kg becomes ~82kg next week rather than the bodyweight-multiplier estimate. */
export function getProgressedWeight(lastWeightKg: number): number {
  return lastWeightKg + calculateIncrement(lastWeightKg)
}

export async function getLastLoggedWeight(
  userId: string,
  exerciseName: string,
  weekNumber?: number
): Promise<{ weight_kg: number; reps_completed: number } | null> {
  let query = supabase
    .from('set_logs')
    .select('weight_kg, reps_completed')
    .eq('user_id', userId)
    .eq('exercise_name', exerciseName)
    .order('completed_at', { ascending: false })
    .limit(1)

  if (weekNumber !== undefined) {
    query = query.eq('week_number', weekNumber)
  }

  const { data } = await query
  if (!data || data.length === 0) return null
  return { weight_kg: data[0].weight_kg, reps_completed: data[0].reps_completed }
}

export async function logSet(params: {
  userId: string
  exerciseName: string
  exercisePlanId?: string
  weekNumber: number
  day: string
  setNumber: number
  weightKg: number
  repsCompleted: number
  rpe?: number
}): Promise<void> {
  await supabase.from('set_logs').insert({
    user_id: params.userId,
    exercise_plan_id: params.exercisePlanId || null,
    exercise_name: params.exerciseName,
    week_number: params.weekNumber,
    day: params.day,
    set_number: params.setNumber,
    weight_kg: params.weightKg,
    reps_completed: params.repsCompleted,
    rpe: params.rpe || null,
  })
}

export async function logEntireSession(params: {
  userId: string
  weekNumber: number
  day: string
  exercises: Array<{
    name: string
    sets: number
    reps: string
    weight_kg: number
    exercisePlanId?: string
  }>
}): Promise<void> {
  const rows = params.exercises.flatMap(ex => {
    const { high } = parseRepRange(ex.reps)
    return Array.from({ length: ex.sets }, (_, i) => ({
      user_id: params.userId,
      exercise_plan_id: ex.exercisePlanId || null,
      exercise_name: ex.name,
      week_number: params.weekNumber,
      day: params.day,
      set_number: i + 1,
      weight_kg: ex.weight_kg,
      reps_completed: high,
      rpe: null,
    }))
  })

  if (rows.length > 0) {
    await supabase.from('set_logs').insert(rows)
  }
}

export async function getSessionLogs(
  userId: string,
  weekNumber: number,
  day: string
): Promise<SetLogRow[]> {
  const { data } = await supabase
    .from('set_logs')
    .select('exercise_name, weight_kg, reps_completed, rpe, set_number')
    .eq('user_id', userId)
    .eq('week_number', weekNumber)
    .eq('day', day)
    .order('exercise_name')
    .order('set_number', { ascending: true })

  return (data || []) as SetLogRow[]
}
