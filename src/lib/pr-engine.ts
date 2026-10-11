import type { BestReading } from './coach-voice'
import { supabase } from './supabase'
import { getLocalDateString } from './dev-clock'
import { getExerciseEntry } from './exercise-db'
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

/**
 * HOW A PR RESULT IS READ OUT, decided here rather than at each screen.
 *
 * Two screens used to rebuild this with their own ternary over four fields,
 * and both got the estimate case wrong in the same way: `type === 'e1rm'`
 * means the WEIGHT did not move — you lifted less for more reps — so printing
 * newWeight alone told someone whose best is 100kg that their new best was
 * 95kg. Ashley's ruling, 17 Sep 2026, from three options: keep celebrating
 * it, and show the whole set.
 *
 * 'both' and 'weight' stay a plain weight: the bar genuinely went up.
 */
export function readingFor(result: PRResult): BestReading {
  if (result.metric === 'reps') return { kind: 'reps', reps: result.newReps }
  if (result.metric === 'added_load') return { kind: 'added_load', addedKg: result.newAddedLoadKg }
  if (result.type === 'e1rm') return { kind: 'best_set', weightKg: result.newWeight, reps: result.newReps }
  return { kind: 'load', weightKg: result.newWeight }
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
    // A BUILD-UP SET IS NOT A PERSONAL BEST, and this is the structural place
    // to say so rather than at each caller. Added 17 Sep 2026, when warm-up
    // rows became real: without it a 20kg opener on a brand-new exercise is a
    // candidate maximum, and on a high-rep build-up it can win the bodyweight
    // "most reps in one set" record outright.
    .filter(l => !l.is_warmup)
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

/**
 * THE SAME ROWS, KEPT BY DAY — 9 Oct 2026 (M12).
 *
 * "Is this a personal best?" needs the record as it stood BEFORE the day
 * being asked about, and the all-time cache above cannot say: it is rebuilt
 * after every set, so by the second set of a session it already holds the
 * first. The finish card used to lean on a snapshot taken when Start workout
 * was pressed — which a session opened by ticking a set never took, so that
 * session compared every lift with nothing and called all of them records.
 *
 * Each exercise's best per calendar day, so any reader can ask for the record
 * before a date (getPRBaseline). The baseline is derived, never remembered:
 * two ways of starting a session cannot disagree about it.
 */
type DayBest = Omit<PRRecord, 'date'>
const dayCache = new Map<string, Record<string, Record<string, DayBest>>>()

/** False until the first read of this person's sets has come back. An empty
 * baseline then means "not known yet", not "never lifted". */
export function isPRCacheLoaded(userId: string): boolean {
  return dayCache.has(userId)
}

function foldDay(into: PRRecord, day: DayBest, date: string): void {
  if (day.maxWeight > into.maxWeight) { into.maxWeight = day.maxWeight; into.date = date }
  if (day.maxE1RM > into.maxE1RM) { into.maxE1RM = day.maxE1RM; into.date = date }
  if (day.maxAddedLoad > into.maxAddedLoad) { into.maxAddedLoad = day.maxAddedLoad; into.date = date }
  if (day.maxReps > into.maxReps) { into.maxReps = day.maxReps; into.date = date }
}

/**
 * Every exercise's record from the days strictly BEFORE `beforeDate`. An
 * exercise first logged on or after that date is simply absent — which is
 * what "no earlier record to beat" looks like.
 */
export function getPRBaseline(userId: string, beforeDate: string): Record<string, PRRecord> {
  const out: Record<string, PRRecord> = {}
  for (const [exerciseName, days] of Object.entries(dayCache.get(userId) ?? {})) {
    const earlier = Object.keys(days).filter(d => d < beforeDate).sort()
    if (earlier.length === 0) continue
    const record = { ...EMPTY_PR_RECORD }
    for (const d of earlier) foldDay(record, days[d], d)
    out[exerciseName] = record
  }
  return out
}

/**
 * WHICH MOVEMENTS CAN HOLD A RECORD AT ALL — decided as a CSCS, 9 Oct 2026.
 *
 * A personal best is progress on something being TRAINED. Movement prep (the
 * catalogue's `primer` tier: band abductions, arm circles, wall slides) is
 * done to get ready, at a deliberately easy dose, and a cardio machine is
 * logged in minutes — neither has a "best" worth a trophy, and Home had been
 * leading with them ("New PR this week: Standing Band Hip Abduction at 0kg").
 * Left out where the records are BUILT, so every reader agrees: the badge,
 * the finish card, Home, Tools and what the coach is told.
 *
 * A name the catalogue does not know (something typed under "add unplanned
 * work") counts: it is a lift somebody chose to do.
 */
export function canHoldRecord(exerciseName: string): boolean {
  const tier = getExerciseEntry(exerciseName)?.mechanics_tier
  return tier !== 'primer' && tier !== 'cardio'
}

/** A day on which a lift's record genuinely moved: there was an earlier record, and this beat it. */
export interface RecordBeaten {
  exerciseName: string
  metric: PRMetric
  /** The new record, in the metric's own unit — kilograms, added kilograms, or reps. */
  value: number
  previous: number
  date: string
}

/**
 * EVERY REAL PERSONAL BEST, oldest first — what "N PRs" counts and what Home's
 * "Recent PRs" lists.
 *
 * Both used to read the all-time cache instead: Tools counted its KEYS (the
 * number of exercises ever logged — "7 PRs" after two workouts) and Home took
 * every entry dated this week, which on a first week is every exercise.
 *
 * Only the top figure moving counts here (the bar, the belt, the reps). A best
 * the ESTIMATE found — less weight for more reps — is celebrated where it
 * happens, on the set and the finish card, as before.
 */
export function getRecordsBeaten(userId: string): RecordBeaten[] {
  const out: RecordBeaten[] = []
  for (const [exerciseName, days] of Object.entries(dayCache.get(userId) ?? {})) {
    const best = { load: 0, added_load: 0, reps: 0 }
    for (const date of Object.keys(days).sort()) {
      const today = { load: days[date].maxWeight, added_load: days[date].maxAddedLoad, reps: days[date].maxReps }
      for (const metric of ['load', 'added_load', 'reps'] as const) {
        // `best > 0` IS THE BASELINE RULE: the first figure ever logged has
        // nothing before it to beat.
        if (best[metric] > 0 && today[metric] > best[metric]) {
          out.push({ exerciseName, metric, value: today[metric], previous: best[metric], date })
        }
        best[metric] = Math.max(best[metric], today[metric])
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * True when this lift has never been logged before `onDate` — the set being
 * ticked is where its record STARTS. False while the records have not been
 * read (nothing is claimed about history the app has not seen), and for a
 * movement that holds no record.
 */
export function isFirstTimeLogged(userId: string, exerciseName: string, onDate: string): boolean {
  if (!isPRCacheLoaded(userId) || !canHoldRecord(exerciseName)) return false
  return !Object.keys(dayCache.get(userId)?.[exerciseName] ?? {}).some(d => d < onDate)
}

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
    // `*`, NOT A COLUMN LIST, so this keeps working on a database that has
    // not run the drop migration. Naming `drop_index` here would be rejected
    // outright before the column exists — and this function swallows the
    // error (`if (error || !data) return`), so every personal best in the app
    // would quietly vanish until somebody ran db:push-both.
    .select('*')
    .eq('user_id', userId)
    .eq('is_warmup', false)
    .gt('reps_completed', 0)

  if (error || !data) return

  const cache: Record<string, PRRecord> = {}
  const byDay: Record<string, Record<string, DayBest>> = {}
  for (const row of data) {
    // A DROP IS NOT A PERSONAL BEST — Ashley's ruling, 19 Sep 2026, and the
    // CSCS basis recorded with it: a drop is performed already fatigued,
    // immediately after a working set, with no rest. It is the easier half of
    // one effort, which is the same reasoning that already excludes warm-ups
    // two lines up. This is the SEVENTH member of the exclusion family named
    // in the comment above, and it is here rather than in the query for the
    // reason that comment now gives.
    if (((row as { drop_index?: number | null }).drop_index ?? 0) > 0) continue
    // MOVEMENT PREP HOLDS NO RECORD — see canHoldRecord. Here, where the
    // records are built, so no reader downstream has to remember it.
    if (!canHoldRecord(row.exercise_name)) continue
    const shape: SetShape = {
      weightKg: Number(row.weight_kg),
      reps: row.reps_completed,
      isBodyweight: !!row.is_bodyweight,
      addedLoadKg: row.added_load_kg == null ? null : Number(row.added_load_kg),
    }
    const metric = prMetricFor(shape)
    if (!metric) continue

    // THE LIFTER'S OWN CALENDAR DAY. This read the UTC date off the
    // timestamp, which files an evening set under tomorrow for anyone west of
    // Greenwich — harmless while the date was only a label, and wrong now
    // that "before today" is decided on it.
    const completed = new Date(String(row.completed_at))
    const date = isNaN(completed.getTime()) ? (String(row.completed_at).split('T')[0] ?? '') : getLocalDateString(completed)
    const current = cache[row.exercise_name] ?? { ...EMPTY_PR_RECORD }
    cache[row.exercise_name] = current
    const days = (byDay[row.exercise_name] ??= {})
    const day = (days[date] ??= { maxWeight: 0, maxE1RM: 0, maxAddedLoad: 0, maxReps: 0 })
    if (metric === 'load') {
      day.maxWeight = Math.max(day.maxWeight, shape.weightKg)
      day.maxE1RM = Math.max(day.maxE1RM, calculateE1RM(shape.weightKg, shape.reps))
    } else if (metric === 'added_load') {
      day.maxAddedLoad = Math.max(day.maxAddedLoad, Number(shape.addedLoadKg ?? 0))
    } else {
      day.maxReps = Math.max(day.maxReps, shape.reps)
    }

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
  dayCache.set(userId, byDay)
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
  /** The day the set belongs to. It is compared with the record from BEFORE
   * that day: the live cache already holds this session's earlier sets, so
   * read against it the second set of a first-ever session "beat" the first. */
  onDate: string,
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
  const existing = getPRBaseline(userId, onDate)[exerciseName] ?? EMPTY_PR_RECORD
  return comparePR(metric, set, existing)
}

/**
 * The comparison itself, shared by all three PR entry points so they
 * cannot answer differently about the same set.
 *
 * A FIRST LOG IS A BASELINE, NOT A PERSONAL BEST — decided as a CSCS, 9 Oct
 * 2026 (M12). A record is an improvement on an earlier performance; with no
 * earlier performance of the same kind there is nothing to have beaten, and
 * calling it a best teaches somebody that turning up is the same as getting
 * stronger. Until this, anything beat an empty record: the tester's first
 * session finished on five "New PRs", all first-ever logs.
 *
 * "Of the same kind" matters: the first set under a belt has no earlier belt
 * set to beat even after a year of bodyweight reps, and the first loaded set
 * of a movement only ever done unloaded is where its weight record begins.
 * Ashley's rulings on WHAT the record is (most reps in one set at bodyweight,
 * added weight once a belt goes on, the whole set for an estimated best) are
 * untouched — this is only about whether there was one to beat.
 */
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
    if (!(existing.maxReps > 0)) return null
    if (!(set.reps > existing.maxReps)) return null
    return { ...base, type: 'reps', newReps: set.reps }
  }

  if (metric === 'added_load') {
    const added = Number(set.addedLoadKg ?? 0)
    if (!(existing.maxAddedLoad > 0)) return null
    if (!(added > existing.maxAddedLoad)) return null
    return { ...base, type: 'added_load', newAddedLoadKg: added, newReps: set.reps }
  }

  if (!(existing.maxWeight > 0 || existing.maxE1RM > 0)) return null
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
  /** The session's day — see checkForPR. */
  onDate: string,
): { setNumber: number; result: PRResult } | null {
  const existing = getPRBaseline(userId, onDate)[exerciseName] ?? EMPTY_PR_RECORD

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
    // A DROP IS NOT A PERSONAL BEST (Ashley, 19 Sep 2026) — and this was the
    // NINTH place one could take a record: the finish card is handed the
    // day's raw rows, and nothing here asked. Movement prep likewise: it is
    // absent from the baseline by construction, and is refused by name here
    // so the rule does not lean on what a caller happens to pass.
    if ((log.drop_index ?? 0) > 0) continue
    if (!canHoldRecord(log.exercise_name)) continue
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
