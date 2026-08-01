import { supabase } from './supabase'

export interface PRRecord {
  maxWeight: number
  maxE1RM: number
  date: string
}

export interface PRResult {
  type: 'weight' | 'e1rm' | 'both'
  newE1RM: number
  newWeight: number
  previousE1RM: number
  previousWeight: number
}

export interface SessionSet {
  setNumber: number
  weight: number
  reps: number
}

const CACHE_KEY_PREFIX = 'pr_records_'

function getCacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`
}

export function calculateE1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}

export function getPRCache(userId: string): Record<string, PRRecord> {
  try {
    const raw = localStorage.getItem(getCacheKey(userId))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function savePRCache(userId: string, cache: Record<string, PRRecord>): void {
  localStorage.setItem(getCacheKey(userId), JSON.stringify(cache))
}

export function checkForPR(
  userId: string,
  exerciseName: string,
  weight: number,
  reps: number,
): PRResult | null {
  if (weight <= 0 || reps <= 0) return null

  const newE1RM = calculateE1RM(weight, reps)
  const cache = getPRCache(userId)
  const existing = cache[exerciseName]

  if (!existing) {
    cache[exerciseName] = { maxWeight: weight, maxE1RM: newE1RM, date: new Date().toISOString().split('T')[0] }
    savePRCache(userId, cache)
    return { type: 'both', newE1RM, newWeight: weight, previousE1RM: 0, previousWeight: 0 }
  }

  const isWeightPR = weight > existing.maxWeight
  const isE1RMPR = newE1RM > existing.maxE1RM

  if (!isWeightPR && !isE1RMPR) return null

  const result: PRResult = {
    type: isWeightPR && isE1RMPR ? 'both' : isWeightPR ? 'weight' : 'e1rm',
    newE1RM,
    newWeight: weight,
    previousE1RM: existing.maxE1RM,
    previousWeight: existing.maxWeight,
  }

  cache[exerciseName] = {
    maxWeight: Math.max(existing.maxWeight, weight),
    maxE1RM: Math.max(existing.maxE1RM, newE1RM),
    date: new Date().toISOString().split('T')[0],
  }
  savePRCache(userId, cache)
  return result
}

/**
 * Given all completed sets in a session for one exercise,
 * returns the single set number that holds the top PR (highest E1RM).
 * Returns null if no set in the session is a PR.
 */
export function getTopPRSet(
  userId: string,
  exerciseName: string,
  sessionSets: SessionSet[],
): { setNumber: number; result: PRResult } | null {
  const cache = getPRCache(userId)
  const existing = cache[exerciseName]
  if (!existing) return null

  let bestSetNumber: number | null = null
  let bestE1RM = 0
  let bestResult: PRResult | null = null

  for (const s of sessionSets) {
    if (s.weight <= 0 || s.reps <= 0) continue
    const e1rm = calculateE1RM(s.weight, s.reps)
    const isWeightPR = s.weight > existing.maxWeight
    const isE1RMPR = e1rm > existing.maxE1RM

    if ((isWeightPR || isE1RMPR) && e1rm > bestE1RM) {
      bestE1RM = e1rm
      bestSetNumber = s.setNumber
      bestResult = {
        type: isWeightPR && isE1RMPR ? 'both' : isWeightPR ? 'weight' : 'e1rm',
        newE1RM: e1rm,
        newWeight: s.weight,
        previousE1RM: existing.maxE1RM,
        previousWeight: existing.maxWeight,
      }
    }
  }

  if (!bestSetNumber || !bestResult) return null
  return { setNumber: bestSetNumber, result: bestResult }
}

export async function seedPRCacheFromHistory(userId: string): Promise<void> {
  const existing = getPRCache(userId)
  if (Object.keys(existing).length > 0) return

  const { data, error } = await supabase
    .from('workout_logs')
    .select('exercise_name, weight_kg, reps_completed')
    .eq('user_id', userId)
    .gt('weight_kg', 0)
    .gt('reps_completed', 0)

  if (error || !data || data.length === 0) return

  const cache: Record<string, PRRecord> = {}
  for (const row of data) {
    const e1rm = calculateE1RM(Number(row.weight_kg), row.reps_completed)
    const current = cache[row.exercise_name]
    if (!current) {
      cache[row.exercise_name] = { maxWeight: Number(row.weight_kg), maxE1RM: e1rm, date: '' }
    } else {
      if (Number(row.weight_kg) > current.maxWeight) current.maxWeight = Number(row.weight_kg)
      if (e1rm > current.maxE1RM) current.maxE1RM = e1rm
    }
  }
  savePRCache(userId, cache)
}

export async function getLastSessionForExercise(
  userId: string,
  exerciseName: string,
  excludeDate: string,
): Promise<{ weight_kg: number; reps_completed: number; set_number: number }[]> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('weight_kg, reps_completed, set_number, date')
    .eq('user_id', userId)
    .eq('exercise_name', exerciseName)
    .neq('date', excludeDate)
    .order('date', { ascending: false })
    .order('set_number', { ascending: true })
    .limit(10)

  if (error || !data || data.length === 0) return []

  const latestDate = data[0].date
  return data
    .filter(row => row.date === latestDate)
    .map(row => ({
      weight_kg: Number(row.weight_kg),
      reps_completed: row.reps_completed,
      set_number: row.set_number,
    }))
}
