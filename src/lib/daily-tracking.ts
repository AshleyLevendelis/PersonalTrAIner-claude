import { supabase } from './supabase'
import type { DailyMetric, DailyNutritionTarget, WorkoutSession, WorkoutExerciseRow, ExerciseSetLog, CardioLog } from './types'

export async function upsertDailyMetric(metric: Omit<DailyMetric, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('daily_metrics')
    .upsert(
      { ...metric, updated_at: new Date().toISOString() },
      { onConflict: 'profile_id,date' }
    )
    .select()
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getDailyMetrics(profileId: string, startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('profile_id', profileId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (error) throw error
  return data as DailyMetric[]
}

export async function upsertNutritionTarget(target: Omit<DailyNutritionTarget, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('daily_nutrition_targets')
    .upsert(
      { ...target, updated_at: new Date().toISOString() },
      { onConflict: 'profile_id,date' }
    )
    .select()
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getNutritionTargets(profileId: string, startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from('daily_nutrition_targets')
    .select('*')
    .eq('profile_id', profileId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (error) throw error
  return data as DailyNutritionTarget[]
}

export async function upsertWorkoutSession(
  session: Omit<WorkoutSession, 'id' | 'created_at' | 'updated_at'>,
  exercises: Omit<WorkoutExerciseRow, 'id' | 'workout_session_id' | 'created_at' | 'updated_at'>[]
) {
  const { data: sessionData, error: sessionError } = await supabase
    .from('workout_sessions')
    .upsert(
      { ...session, updated_at: new Date().toISOString() },
      { onConflict: 'profile_id,date' }
    )
    .select()
    .maybeSingle()

  if (sessionError) throw sessionError
  if (!sessionData) throw new Error('Failed to upsert workout session')

  const { error: deleteError } = await supabase
    .from('workout_exercises')
    .delete()
    .eq('workout_session_id', sessionData.id)

  if (deleteError) throw deleteError

  if (exercises.length > 0) {
    const rows = exercises.map(ex => ({
      ...ex,
      workout_session_id: sessionData.id,
    }))

    const { error: insertError } = await supabase
      .from('workout_exercises')
      .insert(rows)

    if (insertError) throw insertError
  }

  return sessionData
}

export async function getWorkoutSession(profileId: string, date: string) {
  const { data: session, error: sessionError } = await supabase
    .from('workout_sessions')
    .select('*')
    .eq('profile_id', profileId)
    .eq('date', date)
    .maybeSingle()

  if (sessionError) throw sessionError
  if (!session) return null

  const { data: exercises, error: exError } = await supabase
    .from('workout_exercises')
    .select('*')
    .eq('workout_session_id', session.id)
    .order('execution_order', { ascending: true })

  if (exError) throw exError

  return { session: session as WorkoutSession, exercises: (exercises || []) as WorkoutExerciseRow[] }
}

export async function getWeeklyTracking(profileId: string, startDate: string, endDate: string) {
  const [metrics, nutrition, sessions] = await Promise.all([
    getDailyMetrics(profileId, startDate, endDate),
    getNutritionTargets(profileId, startDate, endDate),
    supabase
      .from('workout_sessions')
      .select('*')
      .eq('profile_id', profileId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true }),
  ])

  if (sessions.error) throw sessions.error

  return {
    metrics,
    nutrition,
    sessions: sessions.data as WorkoutSession[],
  }
}

/**
 * Marks a session finished. Stamps finished_at, and — when the session knows
 * when it started (set-log-store stamps started_at on the first set of the
 * day) — records the real elapsed duration instead of the default estimate.
 */
export async function markSessionCompleted(sessionId: string) {
  const finishedAt = new Date()
  const { data: session } = await supabase
    .from('workout_sessions')
    .select('started_at')
    .eq('id', sessionId)
    .maybeSingle()

  const update: Record<string, unknown> = {
    is_completed: true,
    finished_at: finishedAt.toISOString(),
    updated_at: finishedAt.toISOString(),
  }
  if (session?.started_at) {
    const elapsedMin = Math.round((finishedAt.getTime() - new Date(session.started_at).getTime()) / 60000)
    if (elapsedMin > 0 && elapsedMin < 24 * 60) update.duration_minutes = elapsedMin
  }

  const { error } = await supabase
    .from('workout_sessions')
    .update(update)
    .eq('id', sessionId)

  if (error) throw error
}

export interface WeeklyDashboardDay {
  date: string
  metric: DailyMetric | null
  nutrition: DailyNutritionTarget | null
  session: WorkoutSession | null
  exercises: WorkoutExerciseRow[]
  workoutLogs: ExerciseSetLog[]
  cardioLogs: CardioLog[]
}

export async function getWeeklyDashboard(
  profileId: string,
  startDate: string,
  endDate: string
): Promise<WeeklyDashboardDay[]> {
  const [metrics, nutrition, sessionsResult, cardioResult] = await Promise.all([
    getDailyMetrics(profileId, startDate, endDate),
    getNutritionTargets(profileId, startDate, endDate),
    supabase
      .from('workout_sessions')
      .select('*')
      .eq('profile_id', profileId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true }),
    supabase
      .from('cardio_logs')
      .select('*')
      .eq('user_id', profileId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('completed_at', { ascending: false }),
  ])

  if (sessionsResult.error) throw sessionsResult.error
  const sessions = sessionsResult.data as WorkoutSession[]
  const allCardio = (cardioResult.data || []) as CardioLog[]

  // Set logs hang off sessions in the unified store (C0) — fetch by session id
  // and stamp each row with its session's date for the per-day view.
  const sessionIds = sessions.map(s => s.id).filter(Boolean) as string[]
  let allExercises: WorkoutExerciseRow[] = []
  let allLogs: ExerciseSetLog[] = []
  if (sessionIds.length > 0) {
    const [exercisesResult, logsResult] = await Promise.all([
      supabase
        .from('workout_exercises')
        .select('*')
        .in('workout_session_id', sessionIds)
        .order('execution_order', { ascending: true }),
      supabase
        .from('exercise_set_logs')
        .select('*')
        .in('session_id', sessionIds)
        .order('exercise_name')
        .order('set_number', { ascending: true }),
    ])
    if (exercisesResult.error) throw exercisesResult.error
    allExercises = (exercisesResult.data || []) as WorkoutExerciseRow[]
    const dateBySession = new Map(sessions.map(s => [s.id, s.date]))
    allLogs = ((logsResult.data || []) as (ExerciseSetLog & { session_id: string })[]).map(row => ({
      ...row,
      weight_kg: Number(row.weight_kg),
      date: dateBySession.get(row.session_id) ?? '',
    }))
  }

  const days: WeeklyDashboardDay[] = []
  const current = new Date(startDate)
  const end = new Date(endDate)

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0]
    const metric = metrics.find(m => m.date === dateStr) || null
    const nut = nutrition.find(n => n.date === dateStr) || null
    const sess = sessions.find(s => s.date === dateStr) || null
    const exs = sess?.id
      ? allExercises.filter(e => e.workout_session_id === sess.id)
      : []

    days.push({ date: dateStr, metric, nutrition: nut, session: sess, exercises: exs, workoutLogs: allLogs.filter(l => l.date === dateStr), cardioLogs: allCardio.filter(c => c.date === dateStr) })
    current.setDate(current.getDate() + 1)
  }

  return days
}

export async function instantiateWorkoutSession(
  profileId: string,
  date: string,
  splitType: string,
  durationMinutes: number,
  nutritionTargetId?: string
): Promise<WorkoutSession> {
  const session: Omit<WorkoutSession, 'id' | 'created_at' | 'updated_at'> = {
    profile_id: profileId,
    date,
    split_type: splitType,
    duration_minutes: durationMinutes,
    is_completed: false,
    nutrition_target_id: nutritionTargetId,
  }

  const { data, error } = await supabase
    .from('workout_sessions')
    .upsert(
      { ...session, updated_at: new Date().toISOString() },
      { onConflict: 'profile_id,date' }
    )
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Failed to instantiate workout session')
  return data as WorkoutSession
}

// Set WRITES live exclusively in set-log-store.ts (C0 Part 3) — the legacy
// upsertWorkoutLog/getLogsForDate pair is gone with the workout_logs table.

/** Recent working-set history from the unified store (chat/AI context). */
export async function getRecentLogs(
  userId: string,
  days: number = 14,
): Promise<ExerciseSetLog[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('exercise_set_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('is_warmup', false)
    .gte('completed_at', sinceStr)
    .order('completed_at', { ascending: false })
    .order('exercise_name')
    .order('set_number')

  if (error) throw error
  return ((data || []) as (ExerciseSetLog & { session_id?: string })[]).map(row => ({
    ...row,
    weight_kg: Number(row.weight_kg),
    date: row.date || (row.completed_at ?? '').slice(0, 10),
  }))
}

export function formatLogsForAI(logs: ExerciseSetLog[]): string {
  if (logs.length === 0) return ''

  const grouped: Record<string, Record<string, { weight: number; reps: number; bw: boolean }[]>> = {}
  for (const log of logs) {
    if (!grouped[log.date]) grouped[log.date] = {}
    if (!grouped[log.date][log.exercise_name]) grouped[log.date][log.exercise_name] = []
    grouped[log.date][log.exercise_name].push({ weight: log.weight_kg, reps: log.reps_completed, bw: log.is_bodyweight })
  }

  const lines: string[] = []
  for (const date of Object.keys(grouped).sort()) {
    const exercises = grouped[date]
    const parts: string[] = []
    for (const [name, sets] of Object.entries(exercises)) {
      const setsStr = sets.map(s => s.bw ? `BW x ${s.reps}` : `${s.weight}kg x ${s.reps}`).join(', ')
      parts.push(`${name}: ${setsStr}`)
    }
    lines.push(`${date}: ${parts.join(' | ')}`)
  }

  return lines.join('\n')
}

export async function insertCardioLog(
  userId: string,
  date: string,
  activityName: string,
  durationMinutes: number,
  intensityRpe: number,
  avgHeartRate?: number | null,
  notes?: string | null,
): Promise<CardioLog> {
  const { data, error } = await supabase
    .from('cardio_logs')
    .insert({
      user_id: userId,
      date,
      activity_name: activityName,
      duration_minutes: durationMinutes,
      intensity_rpe: intensityRpe,
      avg_heart_rate: avgHeartRate || null,
      notes: notes || null,
      completed_at: new Date().toISOString(),
    })
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Failed to save cardio log')
  return data as CardioLog
}

export async function getCardioLogsForDate(
  userId: string,
  date: string,
): Promise<CardioLog[]> {
  const { data, error } = await supabase
    .from('cardio_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .order('completed_at', { ascending: false })

  if (error) throw error
  return (data || []) as CardioLog[]
}

export async function getRecentCardioLogs(
  userId: string,
  days: number = 14,
): Promise<CardioLog[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('cardio_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('date', sinceStr)
    .order('date', { ascending: false })
    .order('completed_at', { ascending: false })

  if (error) throw error
  return (data || []) as CardioLog[]
}

export function formatCardioLogsForAI(logs: CardioLog[]): string {
  if (logs.length === 0) return ''

  const grouped: Record<string, CardioLog[]> = {}
  for (const log of logs) {
    if (!grouped[log.date]) grouped[log.date] = []
    grouped[log.date].push(log)
  }

  const lines: string[] = []
  for (const date of Object.keys(grouped).sort()) {
    const entries = grouped[date]
    const parts = entries.map(e => {
      let s = `${e.activity_name} for ${e.duration_minutes}min at RPE ${e.intensity_rpe}`
      if (e.avg_heart_rate) s += ` (HR: ${e.avg_heart_rate}bpm)`
      return s
    })
    lines.push(`${date}: ${parts.join(' | ')}`)
  }

  return lines.join('\n')
}
