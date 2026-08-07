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
import { calculateE1RM } from './pr-engine'

export interface ExerciseHistorySetRow {
  setNumber: number
  weightKg: number
  repsCompleted: number
  rpe: number | null
  isBodyweight: boolean
}

export interface ExerciseHistorySession {
  sessionId: string
  date: string // YYYY-MM-DD
  sets: ExerciseHistorySetRow[]
  topSetWeightKg: number
  topSetE1RM: number
}

interface RawHistoryRow {
  session_id: string
  date: string
  set_number: number
  weight_kg: number
  reps_completed: number
  rpe: number | null
  is_bodyweight: boolean
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
      }))
      .sort((a, b) => a.setNumber - b.setNumber)
    let topSetWeightKg = 0
    let topSetE1RM = 0
    for (const s of sets) {
      if (s.isBodyweight) continue
      const e1rm = calculateE1RM(s.weightKg, s.repsCompleted)
      if (s.weightKg > topSetWeightKg) topSetWeightKg = s.weightKg
      if (e1rm > topSetE1RM) topSetE1RM = e1rm
    }
    sessions.push({ sessionId, date: sessionRows[0].date, sets, topSetWeightKg, topSetE1RM })
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
    .select('session_id, completed_at, set_number, weight_kg, reps_completed, rpe, is_bodyweight')
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
}

/** Oldest-first, for charting. Pure. */
export function deriveStrengthTrend(sessions: ExerciseHistorySession[]): TrendPoint[] {
  return [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => ({ date: s.date, topSetWeightKg: s.topSetWeightKg, topSetE1RM: s.topSetE1RM }))
}

/** The chart's own empty-state gate — honest until there are 2+ points. */
export function hasEnoughTrendData(points: TrendPoint[]): boolean {
  return points.length >= 2
}

export interface PRMoment {
  date: string
  sessionId: string
  weightKg: number
  e1rm: number
  kind: 'weight' | 'e1rm' | 'both'
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
  for (const session of oldestFirst) {
    if (session.topSetWeightKg <= 0 && session.topSetE1RM <= 0) continue
    const isWeightPR = session.topSetWeightKg > runningMaxWeight
    const isE1RMPR = session.topSetE1RM > runningMaxE1RM
    if (isWeightPR || isE1RMPR) {
      moments.push({
        date: session.date,
        sessionId: session.sessionId,
        weightKg: session.topSetWeightKg,
        e1rm: session.topSetE1RM,
        kind: isWeightPR && isE1RMPR ? 'both' : isWeightPR ? 'weight' : 'e1rm',
      })
    }
    runningMaxWeight = Math.max(runningMaxWeight, session.topSetWeightKg)
    runningMaxE1RM = Math.max(runningMaxE1RM, session.topSetE1RM)
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
  if (error || !data) return []

  const entries = await Promise.all(
    data.map(async (row: { id: string; date: string; split_type: string; day: string | null; duration_minutes: number | null; is_completed: boolean }) => {
      const sets = await getSetsForSession(row.id)
      const { totalVolumeKg, totalSets } = sumVolumeAndSets(
        sets.filter(s => !s.is_warmup).map(s => ({ weightKg: s.weight_kg, repsCompleted: s.reps_completed }))
      )
      return {
        sessionId: row.id,
        date: row.date,
        splitType: row.split_type,
        day: row.day,
        durationMinutes: row.duration_minutes,
        isCompleted: row.is_completed,
        totalVolumeKg,
        totalSets,
      }
    })
  )
  return entries
}
