import { supabase } from './supabase'
import type { ExerciseSetLog } from './types'

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

export interface SessionPRHit {
  exerciseName: string
  result: PRResult
}

/**
 * "PRs hit this session" — diffs each exercise's best set TODAY against a
 * snapshot of the PR cache captured at startSession() (not the live cache,
 * which checkForPR has already mutated set-by-set during the session — by
 * finish time the live cache no longer has an honest "before" baseline).
 * Read-only: never touches the live cache. Same weight-OR-e1rm comparison
 * rule as checkForPR/getTopPRSet, generalized to an explicit baseline.
 */
export function computeSessionPRs(
  preSessionSnapshot: Record<string, PRRecord>,
  todayLogs: ExerciseSetLog[],
): SessionPRHit[] {
  const byExercise = new Map<string, ExerciseSetLog[]>()
  for (const log of todayLogs) {
    if (log.is_warmup) continue
    if (log.weight_kg <= 0 && !log.is_bodyweight) continue
    if (log.reps_completed <= 0) continue
    if (log.is_bodyweight) continue // bodyweight sets have no comparable load PR
    const list = byExercise.get(log.exercise_name) ?? []
    list.push(log)
    byExercise.set(log.exercise_name, list)
  }

  const hits: SessionPRHit[] = []
  for (const [exerciseName, sets] of byExercise) {
    const existing = preSessionSnapshot[exerciseName] ?? { maxWeight: 0, maxE1RM: 0, date: '' }
    let best: PRResult | null = null
    let bestE1RM = 0
    for (const s of sets) {
      const e1rm = calculateE1RM(s.weight_kg, s.reps_completed)
      const isWeightPR = s.weight_kg > existing.maxWeight
      const isE1RMPR = e1rm > existing.maxE1RM
      if ((isWeightPR || isE1RMPR) && e1rm > bestE1RM) {
        bestE1RM = e1rm
        best = {
          type: isWeightPR && isE1RMPR ? 'both' : isWeightPR ? 'weight' : 'e1rm',
          newE1RM: e1rm,
          newWeight: s.weight_kg,
          previousE1RM: existing.maxE1RM,
          previousWeight: existing.maxWeight,
        }
      }
    }
    if (best) hits.push({ exerciseName, result: best })
  }
  return hits
}

/** Seeds the localStorage PR cache from unified-store history (working sets only). PR storage itself stays localStorage this round — DB-backed PRs land in C2. */
export async function seedPRCacheFromHistory(userId: string): Promise<void> {
  const existing = getPRCache(userId)
  if (Object.keys(existing).length > 0) return

  const { data, error } = await supabase
    .from('exercise_set_logs')
    .select('exercise_name, weight_kg, reps_completed')
    .eq('user_id', userId)
    .eq('is_warmup', false)
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
