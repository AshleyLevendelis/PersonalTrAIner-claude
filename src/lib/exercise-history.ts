import type { BestReading } from './coach-voice'
// ---------------------------------------------------------------------------
// Part 3: exercise history — every session an exercise appears in, a
// strength trend, and a real persisted PR list, all DERIVED from
// exercise_set_logs (the one durable, already-synced table) rather than a
// new table. This is a distinct domain from session-derive.ts, whose scope
// is documented as "today's live session only" — historical/analytical
// reads across many past sessions belong here instead.
//
// The PR list is genuinely persisted (survives, is real) because it's
// sourced from exercise_set_logs, not the fragile localStorage cache
// pr-engine.ts uses for the live in-session "PR!" badge — that cache stays
// untouched; this is additive, not a replacement.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'
import { isMalformedZeroWeight, getSetsForSession } from './set-log-store'
import { prMetricFor, calculateE1RM, type PRMetric } from './pr-engine'

export interface ExerciseHistorySetRow {
  setNumber: number
  weightKg: number
  repsCompleted: number
  rpe: number | null
  isBodyweight: boolean
  /** Belt or vest weight on a bodyweight lift, kg. Its own field since
   * migration 20260825120000 — writing it into weightKg produced a row
   * saying "this pull-up weighed 15kg", indistinguishable from a 15kg lift. */
  addedLoadKg?: number | null
}

export interface ExerciseHistorySession {
  sessionId: string
  date: string // YYYY-MM-DD
  sets: ExerciseHistorySetRow[]
  /** EXTERNAL LOAD ONLY, and deliberately still so. block-review.ts reads
   * this and its own comment depends on the meaning ("groupSetsBySession
   * skips bodyweight sets when computing topSetWeightKg"), so bodyweight
   * work arrives in its own fields BESIDE these rather than by widening
   * what these two mean underneath a reader that is right today. */
  topSetWeightKg: number
  topSetE1RM: number
  /** Most reps in one UNWEIGHTED bodyweight set this session. */
  topSetReps: number
  /** Most weight hung from a belt this session, in kg. */
  topSetAddedLoadKg: number
}

interface RawHistoryRow {
  session_id: string
  date: string
  set_number: number
  weight_kg: number
  reps_completed: number
  rpe: number | null
  is_bodyweight: boolean
  added_load_kg?: number | null
}

/**
 * Pure — groups already-fetched rows into per-session entries, newest date
 * first. Split out from getExerciseHistory so the grouping/top-set logic is
 * unit-testable without a network call.
 */
export function groupSetsBySession(rows: RawHistoryRow[]): ExerciseHistorySession[] {
  const bySession = new Map<string, RawHistoryRow[]>()
  for (const row of rows) {
    const list = bySession.get(row.session_id) ?? []
    list.push(row)
    bySession.set(row.session_id, list)
  }

  const sessions: ExerciseHistorySession[] = []
  for (const [sessionId, sessionRows] of bySession) {
    const sets: ExerciseHistorySetRow[] = sessionRows
      .map(r => ({
        setNumber: r.set_number,
        weightKg: Number(r.weight_kg),
        repsCompleted: r.reps_completed,
        rpe: r.rpe,
        isBodyweight: r.is_bodyweight,
        addedLoadKg: r.added_load_kg ?? null,
      }))
      .sort((a, b) => a.setNumber - b.setNumber)
    let topSetWeightKg = 0
    let topSetE1RM = 0
    let topSetReps = 0
    let topSetAddedLoadKg = 0
    for (const s of sets) {
      // `if (s.isBodyweight) continue` stood here and was the reason the
      // strength graph was permanently empty for anyone training without
      // kit — the session's tops both stayed 0, and derivePRHistory below
      // then skipped the whole session on `<= 0 && <= 0`. The continue is
      // gone; what replaces it is a BRANCH, because the three kinds of set
      // hold three different records and always did.
      const metric = prMetricFor({
        weightKg: s.weightKg,
        reps: s.repsCompleted,
        isBodyweight: s.isBodyweight,
        addedLoadKg: s.addedLoadKg,
      })
      if (!metric) continue
      if (metric === 'load') {
        const e1rm = calculateE1RM(s.weightKg, s.repsCompleted)
        if (s.weightKg > topSetWeightKg) topSetWeightKg = s.weightKg
        if (e1rm > topSetE1RM) topSetE1RM = e1rm
      } else if (metric === 'added_load') {
        const added = Number(s.addedLoadKg ?? 0)
        if (added > topSetAddedLoadKg) topSetAddedLoadKg = added
      } else if (s.repsCompleted > topSetReps) {
        topSetReps = s.repsCompleted
      }
    }
    sessions.push({ sessionId, date: sessionRows[0].date, sets, topSetWeightKg, topSetE1RM, topSetReps, topSetAddedLoadKg })
  }

  return sessions.sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * All non-warmup, non-malformed sets ever logged for one exercise, newest
 * session first — the purpose-built idx_exercise_set_logs_user_exercise_completed
 * index makes this a single indexed query.
 */
export async function getExerciseHistory(userId: string, exerciseId: string, limit = 300): Promise<ExerciseHistorySession[]> {
  const { data, error } = await supabase
    .from('exercise_set_logs')
    .select('session_id, completed_at, set_number, weight_kg, reps_completed, rpe, is_bodyweight, added_load_kg')
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId)
    .eq('is_warmup', false)
    .order('completed_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []

  const rows: RawHistoryRow[] = data
    .filter((r: { weight_kg: number; is_bodyweight: boolean }) => !isMalformedZeroWeight(r))
    .map((r: { session_id: string; completed_at: string; set_number: number; weight_kg: number; reps_completed: number; rpe: number | null; is_bodyweight: boolean }) => ({
      session_id: r.session_id,
      date: r.completed_at.slice(0, 10),
      set_number: r.set_number,
      weight_kg: Number(r.weight_kg),
      reps_completed: r.reps_completed,
      rpe: r.rpe,
      is_bodyweight: r.is_bodyweight,
    }))

  return groupSetsBySession(rows)
}

export interface TrendPoint {
  date: string
  topSetWeightKg: number
  topSetE1RM: number
  /** The number the chart actually plots, in the series' own metric. */
  value: number
}

export interface TrendSeries {
  /** What the points ARE. A chart that does not know this can only guess,
   * and guessing wrong renders reps as kilograms — a number in the wrong
   * unit is worse than no number, because it looks right. Null when there
   * is nothing plottable at all. */
  metric: PRMetric | null
  points: TrendPoint[]
}

/**
 * Oldest-first, for charting. Pure.
 *
 * ONE SERIES, ONE UNIT. An exercise can change metric over a lifetime —
 * unweighted chin-ups for months, then a belt — and those are not the same
 * line: 12 and 12 mean different things. So the metric is taken from the
 * MOST RECENT session that has one (what you are doing now is what the
 * graph is about), and only the sessions sharing it are plotted. The others
 * are not lost; they are in the history list and in their own record, which
 * is what Ashley's ruling means by the reps best "staying as the
 * best-without-weight".
 */
export function deriveStrengthTrend(sessions: ExerciseHistorySession[]): TrendSeries {
  const oldestFirst = [...sessions].sort((a, b) => a.date.localeCompare(b.date))
  const metricOf = (s: ExerciseHistorySession): PRMetric | null =>
    s.topSetAddedLoadKg > 0 ? 'added_load'
      : s.topSetWeightKg > 0 ? 'load'
      : s.topSetReps > 0 ? 'reps'
      : null

  let metric: PRMetric | null = null
  for (let i = oldestFirst.length - 1; i >= 0; i--) {
    const m = metricOf(oldestFirst[i])
    if (m) { metric = m; break }
  }
  if (!metric) return { metric: null, points: [] }

  const valueOf = (s: ExerciseHistorySession): number =>
    metric === 'added_load' ? s.topSetAddedLoadKg : metric === 'reps' ? s.topSetReps : s.topSetE1RM

  const points = oldestFirst
    .filter(s => metricOf(s) === metric)
    .map(s => ({ date: s.date, topSetWeightKg: s.topSetWeightKg, topSetE1RM: s.topSetE1RM, value: valueOf(s) }))
  return { metric, points }
}

/** The chart's own empty-state gate — honest until there are 2+ points. */
export function hasEnoughTrendData(series: TrendSeries): boolean {
  return series.points.length >= 2
}

/** What the trend is a trend OF, in Ashley's words rather than the code's.
 * One place, so the chart's caption and any future reader agree. */
/**
 * The same decision as pr-engine's readingFor, for the history list's own
 * PRMoment shape. Two shapes, one rule — a moment whose `kind` is 'e1rm' is
 * a best the ESTIMATE found, so it shows the whole set rather than a weight
 * that is lower than the standing weight record. Ashley's ruling, 17 Sep 2026.
 */
export function readingForMoment(moment: PRMoment): BestReading {
  if (moment.metric === 'reps') return { kind: 'reps', reps: moment.reps }
  if (moment.metric === 'added_load') return { kind: 'added_load', addedKg: moment.addedLoadKg }
  if (moment.kind === 'e1rm') return { kind: 'best_set', weightKg: moment.weightKg, reps: moment.reps }
  return { kind: 'load', weightKg: moment.weightKg }
}

export function trendLabel(metric: PRMetric | null): string {
  if (metric === 'reps') return 'Best set, in reps'
  if (metric === 'added_load') return 'Added weight'
  return 'Strength trend'
}

export interface PRMoment {
  date: string
  sessionId: string
  weightKg: number
  e1rm: number
  /** Reps in the best set, when the record is a reps record. */
  reps: number
  /** Belt weight, when the record is an added-load record. */
  addedLoadKg: number
  kind: 'weight' | 'e1rm' | 'both' | 'reps' | 'added_load'
  /** Which record moved — readers branch on this, never on the kg fields
   * being nonzero, because a reps PR legitimately has 0 in both. */
  metric: PRMetric
}

/**
 * DERIVED PR list — not a new table. Walks sessions oldest-first, tracks a
 * running max weight/e1rm, and records a PRMoment each time a session's top
 * set beats the running max on weight, e1rm, or both. Sourced from
 * exercise_set_logs (durable, already-synced) rather than the localStorage
 * cache pr-engine.ts uses for live in-session badges. Returns newest-first
 * for display.
 */
export function derivePRHistory(sessions: ExerciseHistorySession[]): PRMoment[] {
  const oldestFirst = [...sessions].sort((a, b) => a.date.localeCompare(b.date))
  const moments: PRMoment[] = []
  let runningMaxWeight = 0
  let runningMaxE1RM = 0
  let runningMaxReps = 0
  let runningMaxAdded = 0
  const blank = { weightKg: 0, e1rm: 0, reps: 0, addedLoadKg: 0 }
  for (const session of oldestFirst) {
    // THE GUARD THAT STOOD HERE — `topSetWeightKg <= 0 && topSetE1RM <= 0`
    // — skipped every bodyweight session outright, because both of those
    // are legitimately 0 when nothing external was lifted. Three running
    // maxima now, and a session can push any of them.
    const where = { date: session.date, sessionId: session.sessionId }

    if (session.topSetAddedLoadKg > runningMaxAdded) {
      moments.push({ ...blank, ...where, addedLoadKg: session.topSetAddedLoadKg, kind: 'added_load', metric: 'added_load' })
    }
    if (session.topSetReps > runningMaxReps) {
      moments.push({ ...blank, ...where, reps: session.topSetReps, kind: 'reps', metric: 'reps' })
    }
    const isWeightPR = session.topSetWeightKg > runningMaxWeight
    const isE1RMPR = session.topSetE1RM > runningMaxE1RM
    if (isWeightPR || isE1RMPR) {
      moments.push({
        ...blank,
        ...where,
        weightKg: session.topSetWeightKg,
        e1rm: session.topSetE1RM,
        kind: isWeightPR && isE1RMPR ? 'both' : isWeightPR ? 'weight' : 'e1rm',
        metric: 'load',
      })
    }
    runningMaxWeight = Math.max(runningMaxWeight, session.topSetWeightKg)
    runningMaxE1RM = Math.max(runningMaxE1RM, session.topSetE1RM)
    runningMaxReps = Math.max(runningMaxReps, session.topSetReps)
    runningMaxAdded = Math.max(runningMaxAdded, session.topSetAddedLoadKg)
  }
  return moments.reverse()
}

export interface SessionHistoryEntry {
  sessionId: string
  date: string
  splitType: string
  day: string | null
  durationMinutes: number | null
  isCompleted: boolean
  totalVolumeKg: number
  totalSets: number
  /** True when the sets query for this session failed — totalVolumeKg/totalSets are 0 as a placeholder, NOT a real "nothing logged" result. Callers must render this distinctly (e.g. "Couldn't load"), never as a genuine zero. */
  loadError?: boolean
}

/** Pure — sets × reps summed, and a raw count. Bodyweight sets (weight 0) contribute 0 volume, matching computeSessionSummary's convention. */
export function sumVolumeAndSets(sets: { weightKg: number; repsCompleted: number }[]): { totalVolumeKg: number; totalSets: number } {
  return {
    totalVolumeKg: sets.reduce((sum, s) => sum + s.weightKg * s.repsCompleted, 0),
    totalSets: sets.length,
  }
}

/** Overall (not per-exercise) session list — date/name/duration/volume, newest first. */
export async function getSessionHistory(userId: string, limit = 30): Promise<SessionHistoryEntry[]> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('id, date, split_type, day, duration_minutes, is_completed')
    .eq('profile_id', userId)
    .order('date', { ascending: false })
    .limit(limit)
  if (error) {
    console.error(`getSessionHistory(${userId}) failed to load workout_sessions:`, error)
    throw error
  }
  if (!data) return []

  const entries = await Promise.all(
    data.map(async (row: { id: string; date: string; split_type: string; day: string | null; duration_minutes: number | null; is_completed: boolean }) => {
      const base = {
        sessionId: row.id,
        date: row.date,
        splitType: row.split_type,
        day: row.day,
        durationMinutes: row.duration_minutes,
        isCompleted: row.is_completed,
      }
      // A failed sets query must render as "couldn't load", never as a
      // silent 0kg/0sets indistinguishable from a genuinely empty session —
      // that ambiguity was itself the bug (see set-log-store.ts's
      // getSetsForSession, which now throws instead of swallowing the error).
      try {
        const sets = await getSetsForSession(row.id)
        const { totalVolumeKg, totalSets } = sumVolumeAndSets(
          sets.filter(s => !s.is_warmup).map(s => ({ weightKg: s.weight_kg, repsCompleted: s.reps_completed }))
        )
        return { ...base, totalVolumeKg, totalSets }
      } catch (setsError) {
        console.error(`getSessionHistory: sets query failed for session ${row.id}:`, setsError)
        return { ...base, totalVolumeKg: 0, totalSets: 0, loadError: true }
      }
    })
  )
  return entries
}

/**
 * Which plan days have at least one logged working set, keyed
 * `${week_number}|${day}` — the browse view's completion marks (design 5a).
 * Read-only by construction: this is the "per-day boolean from the log
 * store" §7.3 allows a browse surface, and the only completion signal it
 * gets — never SetGrid, never the write facade. Legacy rows written before
 * week_number/day landed on the table simply don't mark a day, which
 * degrades to the pre-5a behaviour (no tick) rather than a wrong one.
 */
export async function getLoggedPlanDays(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('exercise_set_logs')
    .select('week_number, day')
    .eq('user_id', userId)
    .eq('is_warmup', false)
    .not('week_number', 'is', null)
    .limit(5000)
  if (error || !data) return new Set()
  const keys = new Set<string>()
  for (const r of data as { week_number: number | null; day: string | null }[]) {
    if (r.week_number != null && r.day) keys.add(`${r.week_number}|${r.day}`)
  }
  return keys
}
