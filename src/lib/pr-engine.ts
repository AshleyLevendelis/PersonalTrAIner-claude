import { supabase } from './supabase'
import type { ExerciseSetLog } from './types'

/**
 * WHICH RECORD A SET CAN MOVE. Ashley's ruling, 16 Sep 2026, from three
 * options — most reps in ONE set, over session-total reps (an easy
 * high-volume day beats a hard one, so the app would congratulate someone
 * for going easier) and over converting bodyweight to an estimated load
 * (one tidy line, but the conversion factors are numbers the app would
 * INVENT and then show as if measured — load-prescription.ts's header
 * already forbids exactly that).
 *
 * And the half that makes it coherent, also hers: once a belt goes on,
 * ADDED WEIGHT becomes the record, and the reps record stays as the
 * best-without-weight. They are different lifts and both are kept.
 */
export type PRMetric = 'load' | 'added_load' | 'reps'

/** The shape every PR decision reads. One classifier, one input type, so
 * the badge, the cache, the session summary and the history cannot drift
 * apart — the disagreement SetGrid's own comment warns about inside a
 * single function, generalised to the five places that had it. */
export interface SetShape {
  weightKg: number
  reps: number
  isBodyweight: boolean
  addedLoadKg?: number | null
}

/**
 * THE ONE PLACE that decides what a set competes on. Order matters: a belt
 * outranks bodyweight, because a weighted chin-up is not a rep record with
 * an asterisk, it is its own lift.
 *
 * Returns null when the set cannot hold any record: no reps, or the
 * malformed zero-weight-not-bodyweight shape that set-log-store already
 * names (isMalformedZeroWeight) — a row that claims an external lift and
 * carries no load.
 */
export function prMetricFor(set: SetShape): PRMetric | null {
  if (!(set.reps > 0)) return null
  if (Number(set.addedLoadKg ?? 0) > 0) return 'added_load'
  if (set.isBodyweight) return 'reps'
  if (set.weightKg > 0) return 'load'
  return null
}

export interface PRRecord {
  maxWeight: number
  maxE1RM: number
  /** Most weight ever hung from a belt or vest on this movement, in kg. */
  maxAddedLoad: number
  /** Most reps in a single UNWEIGHTED set. Stays put once a belt goes on —
   * it is the best-without-weight and does not stop being true. */
  maxReps: number
  date: string
}

export interface PRResult {
  type: 'weight' | 'e1rm' | 'both' | 'reps' | 'added_load'
  /** Which record moved. Readers must branch on this rather than assuming
   * kilograms: a reps figure rendered into a "kg" slot reads as a weight,
   * which is worse than showing nothing at all. */
  metric: PRMetric
  newE1RM: number
  newWeight: number
  previousE1RM: number
  previousWeight: number
  newReps: number
  previousReps: number
  newAddedLoadKg: number
  previousAddedLoadKg: number
}

export interface SessionSet {
  setNumber: number
  weight: number
  reps: number
  isBodyweight?: boolean
  addedLoadKg?: number | null
}

/**
 * Logged rows -> the shape the PR paths compare. It LIVED IN SetGrid.tsx as
 * a private one-liner filtering `l.weight_kg > 0`, which was the quietest of
 * the six places bodyweight work was dropped: not in the engine, not near
 * any of the others, and invisible to a gate that can only call exports.
 * Moved here so the invariant is structural — the filter it must not have
 * is now somewhere a check can reach.
 */
export function toSessionSets(logs: ExerciseSetLog[]): SessionSet[] {
  return logs
    .filter(l => l.reps_completed > 0)
    .map(l => ({
      setNumber: l.set_number,
      weight: l.weight_kg,
      reps: l.reps_completed,
      isBodyweight: !!l.is_bodyweight,
      addedLoadKg: l.added_load_kg ?? null,
    }))
}

/** A record with nothing in it yet — spelled once so a new field cannot be
 * forgotten at one of the three places that need an empty baseline. */
export const EMPTY_PR_RECORD: PRRecord = { maxWeight: 0, maxE1RM: 0, maxAddedLoad: 0, maxReps: 0, date: '' }

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
  // THE `.gt('weight_kg', 0)` THAT USED TO BE HERE EXCLUDED EVERY BODYWEIGHT
  // SET IN THE DATABASE QUERY ITSELF, before any logic could see it. It was
  // one of six independent exclusions (this, checkForPR's guard,
  // getTopPRSet's continue, computeSessionPRs's continue, the history loop's
  // continue, and SetGrid's toSessionSets filter) — so a home trainee with no
  // kit had an empty graph and no personal best, for ever. Fixing any one of
  // them alone would have changed nothing visible, which is why the gate
  // covers all six by name.
  //
  // reps_completed > 0 stays: a set with no reps is not a set. The malformed
  // zero-weight-not-bodyweight shape is filtered by prMetricFor instead of
  // by the query, so there is one rule rather than two.
  const { data, error } = await supabase
    .from('exercise_set_logs')
    .select('exercise_name, weight_kg, reps_completed, completed_at, is_bodyweight, added_load_kg')
    .eq('user_id', userId)
    .eq('is_warmup', false)
    .gt('reps_completed', 0)

  if (error || !data) return

  const cache: Record<string, PRRecord> = {}
  for (const row of data) {
    const shape: SetShape = {
      weightKg: Number(row.weight_kg),
      reps: row.reps_completed,
      isBodyweight: !!row.is_bodyweight,
      addedLoadKg: row.added_load_kg == null ? null : Number(row.added_load_kg),
    }
    const metric = prMetricFor(shape)
    if (!metric) continue

    const date = String(row.completed_at).split('T')[0] ?? ''
    const current = cache[row.exercise_name] ?? { ...EMPTY_PR_RECORD }
    cache[row.exercise_name] = current

    // date tracks whichever max this row most recently pushed forward —
    // dashboard-data.ts's "recent PRs" line filters on it, so it must be
    // the date the record was actually set, not just the last row scanned.
    // Unchanged in meaning; it now has three kinds of max to watch instead
    // of two.
    if (metric === 'load') {
      const e1rm = calculateE1RM(shape.weightKg, shape.reps)
      if (shape.weightKg > current.maxWeight) { current.maxWeight = shape.weightKg; current.date = date }
      if (e1rm > current.maxE1RM) { current.maxE1RM = e1rm; current.date = date }
    } else if (metric === 'added_load') {
      const added = Number(shape.addedLoadKg ?? 0)
      if (added > current.maxAddedLoad) { current.maxAddedLoad = added; current.date = date }
    } else {
      if (shape.reps > current.maxReps) { current.maxReps = shape.reps; current.date = date }
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
  set: SetShape,
): PRResult | null {
  // TAKES THE WHOLE SET, not a bare weight. The old signature was
  // (weight, reps) and opened `if (weight <= 0) return null`, so a
  // bodyweight set could never raise the badge — while SetGrid's comment
  // beside the call claimed it kept "bodyweight, PR by reps" behaviour.
  // There was no PR by reps. A comment asserting a behaviour the function
  // it calls cannot produce reads as a deliberate design choice and hid
  // this for weeks.
  const metric = prMetricFor(set)
  if (!metric) return null
  const existing = getPRCache(userId)[exerciseName] ?? EMPTY_PR_RECORD
  return comparePR(metric, set, existing)
}

/** The comparison itself, shared by all three PR entry points so they
 * cannot answer differently about the same set. */
function comparePR(metric: PRMetric, set: SetShape, existing: PRRecord): PRResult | null {
  const base = {
    metric,
    newE1RM: 0,
    newWeight: 0,
    previousE1RM: existing.maxE1RM,
    previousWeight: existing.maxWeight,
    newReps: 0,
    previousReps: existing.maxReps,
    newAddedLoadKg: 0,
    previousAddedLoadKg: existing.maxAddedLoad,
  }

  if (metric === 'reps') {
    if (!(set.reps > existing.maxReps)) return null
    return { ...base, type: 'reps', newReps: set.reps }
  }

  if (metric === 'added_load') {
    const added = Number(set.addedLoadKg ?? 0)
    if (!(added > existing.maxAddedLoad)) return null
    return { ...base, type: 'added_load', newAddedLoadKg: added, newReps: set.reps }
  }

  const newE1RM = calculateE1RM(set.weightKg, set.reps)
  const isWeightPR = set.weightKg > existing.maxWeight
  const isE1RMPR = newE1RM > existing.maxE1RM
  if (!isWeightPR && !isE1RMPR) return null
  return {
    ...base,
    type: isWeightPR && isE1RMPR ? 'both' : isWeightPR ? 'weight' : 'e1rm',
    newE1RM,
    newWeight: set.weightKg,
    newReps: set.reps,
  }
}

/**
 * WHICH OF TWO PRs IN ONE SESSION IS "THE" PR. Returns > 0 when `a` wins.
 *
 * METRIC FIRST, MAGNITUDE ONLY WITHIN IT. The first version of this compared
 * magnitudes alone and the gate caught it immediately: 20 bodyweight reps
 * beat a 15kg belt set, because 20 > 15 as numbers. The comment beside it
 * already claimed the belt "wins on its own terms rather than by being a
 * bigger number" — describing behaviour the code did not have, which is the
 * same trap this whole change exists to clean up (SetGrid's "PR by reps"
 * comment over a function that produced no PR at all). Written down because
 * it happened while fixing an instance of itself.
 *
 * The order is prMetricFor's, for the same reason: a belt outranks
 * bodyweight because a weighted chin-up is its own lift, and external load
 * outranks both because an exercise carrying any is not a bodyweight
 * movement.
 */
const METRIC_RANK: Record<PRMetric, number> = { added_load: 3, load: 2, reps: 1 }

function prMagnitude(result: PRResult): number {
  if (result.metric === 'reps') return result.newReps
  if (result.metric === 'added_load') return result.newAddedLoadKg
  return result.newE1RM
}

function prBeats(a: PRResult, b: PRResult | null): boolean {
  if (!b) return true
  const rankA = METRIC_RANK[a.metric]
  const rankB = METRIC_RANK[b.metric]
  if (rankA !== rankB) return rankA > rankB
  return prMagnitude(a) > prMagnitude(b)
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
  const existing = getPRCache(userId)[exerciseName] ?? EMPTY_PR_RECORD

  let bestSetNumber: number | null = null
  let bestResult: PRResult | null = null

  for (const s of sessionSets) {
    // The `s.weight <= 0` half of the old guard lived here too, and was the
    // reason the badge could not land on a bodyweight row even once the
    // cache knew about it. prMetricFor decides now, in one place.
    const shape: SetShape = {
      weightKg: s.weight,
      reps: s.reps,
      isBodyweight: s.isBodyweight ?? false,
      addedLoadKg: s.addedLoadKg ?? null,
    }
    const metric = prMetricFor(shape)
    if (!metric) continue
    const result = comparePR(metric, shape, existing)
    if (!result) continue
    if (prBeats(result, bestResult)) {
      bestSetNumber = s.setNumber
      bestResult = result
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
    // `if (log.is_bodyweight) continue // bodyweight sets have no comparable
    // load PR` stood here. True as written and wrong as a conclusion: they
    // have no comparable LOAD, which is a reason to compare something else,
    // not a reason to drop them. prMetricFor picks what.
    if (prMetricFor({
      weightKg: Number(log.weight_kg),
      reps: log.reps_completed,
      isBodyweight: !!log.is_bodyweight,
      addedLoadKg: log.added_load_kg ?? null,
    }) === null) continue
    const list = byExercise.get(log.exercise_name) ?? []
    list.push(log)
    byExercise.set(log.exercise_name, list)
  }

  const hits: SessionPRHit[] = []
  for (const [exerciseName, sets] of byExercise) {
    const existing = preSessionSnapshot[exerciseName] ?? EMPTY_PR_RECORD
    let best: PRResult | null = null
    for (const s of sets) {
      const shape: SetShape = {
        weightKg: Number(s.weight_kg),
        reps: s.reps_completed,
        isBodyweight: !!s.is_bodyweight,
        addedLoadKg: s.added_load_kg ?? null,
      }
      const metric = prMetricFor(shape)
      if (!metric) continue
      const result = comparePR(metric, shape, existing)
      if (!result) continue
      if (prBeats(result, best)) best = result
    }
    if (best) hits.push({ exerciseName, result: best })
  }
  return hits
}
