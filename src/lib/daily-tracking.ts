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




/**
 * Marks a session finished. Stamps finished_at, and — when the session knows
 * when it started (set-log-store stamps started_at on the first set of the
 * day) — records the real elapsed duration instead of the default estimate.
 */
export async function markSessionCompleted(sessionId: string, finishedAt: Date = new Date()) {
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

/**
 * Records — or clears — "I'm resting this prescribed training day".
 *
 * READ BEFORE WRITE rather than an upsert, for the reason
 * swap_session_for_activity's handler states in the edge function:
 * workout_sessions.split_type is NOT NULL with no default, so an upsert
 * payload has to carry it, and would then overwrite a real session's split
 * with a placeholder whenever the row already existed.
 *
 * Returns whether the write landed. A caller that says "marked as a rest
 * day" on a false here would be repeating the exact lie this whole path
 * exists to stop.
 */
export async function setDeliberateRest(
  profileId: string,
  date: string,
  resting: boolean,
): Promise<boolean> {
  const { data: existing, error: readErr } = await supabase
    .from('workout_sessions')
    .select('id')
    .eq('profile_id', profileId)
    .eq('date', date)
    .maybeSingle()
  if (readErr) {
    console.error('setDeliberateRest: reading the day failed', readErr)
    return false
  }

  if (existing?.id) {
    const { error } = await supabase
      .from('workout_sessions')
      .update({ deliberate_rest: resting, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) console.error('setDeliberateRest: update failed', error)
    return !error
  }

  // Nothing to clear if there is no row — and creating one to say "not
  // resting" would write a session that never existed.
  if (!resting) return true

  const { error } = await supabase.from('workout_sessions').insert({
    profile_id: profileId,
    date,
    // Names what this row is rather than borrowing a training split it never
    // had, exactly as the swap path does. 0 is the honest lifting duration.
    split_type: 'rest',
    duration_minutes: 0,
    is_completed: false,
    deliberate_rest: true,
  })
  if (error) console.error('setDeliberateRest: insert failed', error)
  return !error
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
    .order('completed_at', { ascending: true })

  if (error) throw error
  const rows = ((data || []) as (ExerciseSetLog & { session_id?: string })[]).map(row => ({
    ...row,
    weight_kg: Number(row.weight_kg),
    date: row.date || (row.completed_at ?? '').slice(0, 10),
  }))

  // Most-recent DAY first (so the chat context leads with what just
  // happened), but ASCENDING within a day — completed_at is a fine-grained,
  // effectively-unique timestamp now, so sorting purely by it (descending)
  // reversed every session's set order (a ramp read as 80kg, 70kg, 60kg
  // instead of the order it was actually performed in).
  return rows.sort((a, b) => {
    const dayCompare = b.date.localeCompare(a.date)
    if (dayCompare !== 0) return dayCompare
    return (a.completed_at ?? '').localeCompare(b.completed_at ?? '')
  })
}

/**
 * Local clock time for a set, or '' when the row has no timestamp.
 *
 * WHY THIS EXISTS. Ashley, 5 Sep 2026, at 17:41: the coach told her "you
 * logged one set of Clamshells (8 reps at bodyweight) AT 10:00 PM TODAY" — a
 * time that had not happened yet. Nothing in this function had ever sent a
 * time, so the model had no source for it and produced one that sounded
 * plausible. `completed_at` was sitting on every row, unused.
 *
 * Local, not UTC, and deliberately so: this repo has already shipped one
 * "coach insists you didn't train when you did" bug from a UTC/local mismatch
 * (see chat-plan-context's todayStr comment). A time is only useful if it is
 * the time on the trainee's own clock.
 */
function setTimeLabel(completedAt?: string): string {
  if (!completedAt) return ''
  const d = new Date(completedAt)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function formatLogsForAI(logs: ExerciseSetLog[]): string {
  if (logs.length === 0) return ''

  const grouped: Record<string, Record<string, { weight: number; reps: number; bw: boolean; at: string }[]>> = {}
  for (const log of logs) {
    if (!grouped[log.date]) grouped[log.date] = {}
    if (!grouped[log.date][log.exercise_name]) grouped[log.date][log.exercise_name] = []
    grouped[log.date][log.exercise_name].push({
      weight: log.weight_kg, reps: log.reps_completed, bw: log.is_bodyweight,
      at: setTimeLabel(log.completed_at),
    })
  }

  const lines: string[] = []
  for (const date of Object.keys(grouped).sort()) {
    const exercises = grouped[date]
    const parts: string[] = []
    for (const [name, sets] of Object.entries(exercises)) {
      const setsStr = sets.map(s => s.bw ? `BW x ${s.reps}` : `${s.weight}kg x ${s.reps}`).join(', ')
      // The times, once, after the sets — not repeated per set, which would
      // treble the line length for something read at a glance. Omitted
      // entirely when no row carries one, so an absent time reads as absent
      // rather than as a value the model may fill in.
      const times = [...new Set(sets.map(s => s.at).filter(Boolean))]
      parts.push(`${name}: ${setsStr}${times.length > 0 ? ` [logged at ${times.join(', ')}]` : ''}`)
    }
    lines.push(`${date}: ${parts.join(' | ')}`)
  }

  return lines.join('\n')
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


