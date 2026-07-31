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

export async function markSessionCompleted(sessionId: string) {
  const { error } = await supabase
    .from('workout_sessions')
    .update({ is_completed: true, updated_at: new Date().toISOString() })
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
  const [metrics, nutrition, sessionsResult, logsResult, cardioResult] = await Promise.all([
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
      .from('workout_logs')
      .select('*')
      .eq('user_id', profileId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('set_number', { ascending: true }),
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
  const allLogs = (logsResult.data || []) as ExerciseSetLog[]
  const allCardio = (cardioResult.data || []) as CardioLog[]

  const sessionIds = sessions.map(s => s.id).filter(Boolean) as string[]
  let allExercises: WorkoutExerciseRow[] = []
  if (sessionIds.length > 0) {
    const { data, error } = await supabase
      .from('workout_exercises')
      .select('*')
      .in('workout_session_id', sessionIds)
      .order('execution_order', { ascending: true })
    if (error) throw error
    allExercises = (data || []) as WorkoutExerciseRow[]
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

export async function upsertWorkoutLog(
  userId: string,
  date: string,
  exerciseName: string,
  setNumber: number,
  weightKg: number,
  repsCompleted: number,
  isBodyweight: boolean = false,
): Promise<ExerciseSetLog> {
  const { data, error } = await supabase
    .from('workout_logs')
    .upsert(
      {
        user_id: userId,
        date,
        exercise_name: exerciseName,
        set_number: setNumber,
        weight_kg: isBodyweight ? 0 : weightKg,
        reps_completed: repsCompleted,
        is_bodyweight: isBodyweight,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,date,exercise_name,set_number' }
    )
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Failed to save workout log')
  return data as ExerciseSetLog
}

export async function getLogsForDate(
  userId: string,
  date: string,
): Promise<ExerciseSetLog[]> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .order('exercise_name')
    .order('set_number')

  if (error) throw error
  return (data || []) as ExerciseSetLog[]
}

export async function getRecentLogs(
  userId: string,
  days: number = 14,
): Promise<ExerciseSetLog[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('date', sinceStr)
    .order('date', { ascending: false })
    .order('exercise_name')
    .order('set_number')

  if (error) throw error
  return (data || []) as ExerciseSetLog[]
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
