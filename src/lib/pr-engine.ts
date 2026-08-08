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

// In-memory only, keyed by userId — DB (exercise_set_logs) is the sole
// source of truth. Re-derived wholesale by refreshPRCacheFromDB, which
// useActiveSession's refresh() calls after every mutation surface this app
// has (logSet, deleteSet, chat-logged sets via refreshToken). This is what
// makes a deleted/undone set evict and a chat-logged set ingest — the old
// localStorage cache only ever grew via checkForPR's own local writes and
// was never reconciled against reality.
const memCache = new Map<string, Record<string, PRRecord>>()

export function calculateE1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}

/** Synchronous read of the in-memory cache — empty until the first
 * refreshPRCacheFromDB resolves (seeded at app root, see useActiveSession). */
export function getPRCache(userId: string): Record<string, PRRecord> {
  return memCache.get(userId) ?? {}
}

/** Re-derives the full PR cache from exercise_set_logs (working sets only —
 * matches derivePRHistory's filters in exercise-history.ts, the same source
 * Part 3's history view reads). Replaces the cache wholesale rather than
 * merging, so a deleted set's contribution disappears on the next call. */
export async function refreshPRCacheFromDB(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('exercise_set_logs')
    .select('exercise_name, weight_kg, reps_completed, completed_at')
    .eq('user_id', userId)
    .eq('is_warmup', false)
    .gt('weight_kg', 0)
    .gt('reps_completed', 0)

  if (error || !data) return

  const cache: Record<string, PRRecord> = {}
  for (const row of data) {
    const e1rm = calculateE1RM(Number(row.weight_kg), row.reps_completed)
    const date = String(row.completed_at).split('T')[0] ?? ''
    const current = cache[row.exercise_name]
    if (!current) {
      cache[row.exercise_name] = { maxWeight: Number(row.weight_kg), maxE1RM: e1rm, date }
    } else {
      // date tracks whichever set most recently pushed either max forward —
      // dashboard-data.ts's "recent PRs" line filters on it, so it must be
      // the date the record was actually set, not just the last row scanned.
      if (Number(row.weight_kg) > current.maxWeight) { current.maxWeight = Number(row.weight_kg); current.date = date }
      if (e1rm > current.maxE1RM) { current.maxE1RM = e1rm; current.date = date }
    }
  }
  memCache.set(userId, cache)
}

/**
 * Optimistic "did this set just PR" check against the current in-memory
 * cache, for immediate UI feedback (the badge animation) before the
 * follow-up refreshPRCacheFromDB (triggered by the caller's own refresh()
 * after saveSet) confirms it. Read-only — never mutates the cache itself,
 * since a local write here is exactly the divergence bug this replaces:
 * the DB refresh is the only writer now.
 */
export function checkForPR(
  userId: string,
  exerciseName: string,
  weight: number,
  reps: number,
): PRResult | null {
  if (weight <= 0 || reps <= 0) return null

  const newE1RM = calculateE1RM(weight, reps)
  const existing = getPRCache(userId)[exerciseName]

  if (!existing) {
    return { type: 'both', newE1RM, newWeight: weight, previousE1RM: 0, previousWeight: 0 }
  }

  const isWeightPR = weight > existing.maxWeight
  const isE1RMPR = newE1RM > existing.maxE1RM

  if (!isWeightPR && !isE1RMPR) return null

  return {
    type: isWeightPR && isE1RMPR ? 'both' : isWeightPR ? 'weight' : 'e1rm',
    newE1RM,
    newWeight: weight,
    previousE1RM: existing.maxE1RM,
    previousWeight: existing.maxWeight,
  }
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
