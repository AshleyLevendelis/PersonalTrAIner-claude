// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §5 — the dashboard's one aggregator. "The Dashboard
// owns no number" — every field here is read (or computed by a pure helper)
// from a source that already exists elsewhere: exercise_set_logs (via
// useActiveSession's already-fetched today-logs + getRecentLogs/
// getRecentCardioLogs for the streak window), meal_events (via
// getTodayLedger), daily_metrics (via getRecentWeighIns), the mesocycle
// (phase/today's/tomorrow's WorkoutDay), the memory store (goals), and the
// PR cache (getPRCache). Nothing here writes; this module is read-only by
// construction, matching §5.1's rule.
// ---------------------------------------------------------------------------

import { getTodayLedger, type MealMacros } from './meal-store'
import { getRecentLogs, getRecentCardioLogs } from './daily-tracking'
import { getRecentWeighIns } from './nutrition-targets'
import { getTotalForDate as getWaterTotalForDate } from './water-store'
import { getPRCache } from './pr-engine'
import { getActiveGoals } from './memory-store'
import { computeStreak, type StreakDayInput } from './streak'
import { computeWeightTrend, type WeightTrendResult } from './weight-trend'
import { selectCoachTip, type CoachTipContext } from './coach-tips'
import { getActiveMesocycleWeek } from './calculations'
import { supabase } from './supabase'
import type { UserProfile, MacroTargets, WorkoutDay, MesocycleWeek, ExerciseSetLog } from './types'

export type SessionStatus = 'rest' | 'not_started' | 'in_progress' | 'done'

export interface TodaySession {
  status: SessionStatus
  focus: string | null
  exerciseNames: string[]
  setsLogged: number
  setsPlanned: number
}

export interface PhaseContext {
  weekNumber: number
  totalWeeks: number
  phaseLabel: string | null
  phaseFocus: string | null
  isDeload: boolean
  isCalibrationWeek: boolean
}

export interface RecentPR {
  exerciseName: string
  weightKg: number
  date: string
}

export interface WeightSeriesPoint {
  date: string
  kg: number
}

export interface DashboardData {
  today: string
  dayName: string
  session: TodaySession
  tomorrowLabel: string
  coachTip: string | null
  // All null together when the profile has no body metrics — see `macros`
  // on the input type. Null means "no target exists", never "the target is 0".
  caloriesEaten: number | null
  caloriesTarget: number | null
  proteinEaten: number | null
  proteinTarget: number | null
  carbsEaten: number | null
  carbsTarget: number | null
  fatEaten: number | null
  fatTarget: number | null
  weightTrend: WeightTrendResult | null
  /** Oldest-first — for the Home trend chart (tab-restructure). Same source as weightTrend (getRecentWeighIns), just re-mapped/re-ordered for charting rather than averaging. */
  weightSeries: WeightSeriesPoint[]
  /** The active body_weight_kg goal's target, if one exists — drawn as a reference line on the Home trend chart. Null when no goal has been set (no UI existed to set one before this; chat's record_goal was the only path). */
  weightGoalKg: number | null
  recentPRs: RecentPR[]
  streak: number
  whatsLeftLine: string | null
  phase: PhaseContext | null
  /** Tab restructure — Home's calorie/water tiles are read-only nav tiles into Nutrition; the read itself still belongs here (the one aggregator), not in Dashboard.tsx, which no longer imports water-store at all. */
  waterMl: number
  waterTargetMl: number
}

const KNOWN_LIFT_FIELD: Record<string, keyof Pick<UserProfile, 'known_squat_kg' | 'known_bench_kg' | 'known_deadlift_kg'>> = {
  'Barbell Squats': 'known_squat_kg',
  'Barbell Bench Press': 'known_bench_kg',
  'Deadlifts': 'known_deadlift_kg',
}

function findWorkoutDay(days: WorkoutDay[], dayName: string): WorkoutDay | undefined {
  return days.find(d => d.day === dayName)
}

function daysAgo(dateStr: string, todayStr: string): number {
  return Math.round((new Date(`${todayStr}T00:00:00`).getTime() - new Date(`${dateStr}T00:00:00`).getTime()) / 86_400_000)
}

export interface LoadDashboardDataInput {
  profile: UserProfile
  /**
   * Null when the profile has no weight/height/age/sex — targets are ABSENT,
   * not estimated (macro-calculator.ts's resolveBodyMetrics). Every nutrition
   * field below then comes back null and the dashboard renders the absence,
   * exactly as the Nutrition tab does. This was `MacroTargets` and the caller
   * guarded with `if (!macros) return` BEFORE clearing its loading flag —
   * which left Home stuck on "Loading your day…" forever for anyone who
   * declined a weight.
   */
  macros: MacroTargets | null
  /** Flat week-1 plan — used as the day-of-week SCHEDULE pattern (which weekdays are training days) for both the streak and rest-day detection. */
  exercisePlan: WorkoutDay[]
  mesocycle: MesocycleWeek[]
  planCreatedAt?: string
  /** Today's already-fetched logs from useActiveSession — avoids a second independent fetch/race with the Exercise tab. */
  todayLogs: ExerciseSetLog[]
  liveWeek: number
  dayName: string
  todayStr: string
  /** Real Date for "tomorrow" resolution — respects the dev clock via the caller (getAppNow). */
  now: Date
}

export async function loadDashboardData(input: LoadDashboardDataInput): Promise<DashboardData> {
  const { profile, macros, exercisePlan, mesocycle, planCreatedAt, todayLogs, liveWeek, dayName, todayStr, now } = input
  const profileId = profile.id
  if (!profileId) throw new Error('loadDashboardData requires a saved profile')

  const totalWeeks = mesocycle.length || 4
  const liveWeekData = mesocycle.find(w => w.week_number === liveWeek)
  const todayWorkoutDay = liveWeekData ? findWorkoutDay(liveWeekData.days, dayName) : findWorkoutDay(exercisePlan, dayName)

  const tomorrowDate = new Date(now.getTime() + 86_400_000)
  const tomorrowName = tomorrowDate.toLocaleDateString('en-US', { weekday: 'long' })
  // Tomorrow's schedule is read from the SAME week's plan (or next week if
  // tomorrow rolls into a new plan week) — approximated via the flat
  // week-1 pattern for the schedule shape (which days train), same source
  // the streak uses, since day-of-week availability doesn't change week to
  // week within a mesocycle.
  const tomorrowWorkoutDay = findWorkoutDay(exercisePlan, tomorrowName)
  const tomorrowLabel = tomorrowWorkoutDay && tomorrowWorkoutDay.exercises.length > 0
    ? `Tomorrow: ${tomorrowWorkoutDay.focus}`
    : 'Tomorrow: Rest'

  // ---- Today's session status --------------------------------------------
  const nonWarmupToday = todayLogs.filter(l => !l.is_warmup)
  const setsPlanned = todayWorkoutDay?.exercises.reduce((s, ex) => s + ex.sets, 0) ?? 0
  const isRestDay = !todayWorkoutDay || todayWorkoutDay.exercises.length === 0

  let explicitlyCompleted = false
  if (!isRestDay) {
    const { data } = await supabase.from('workout_sessions').select('is_completed').eq('profile_id', profileId).eq('date', todayStr).maybeSingle()
    explicitlyCompleted = !!data?.is_completed
  }

  const session: TodaySession = isRestDay
    ? { status: 'rest', focus: null, exerciseNames: [], setsLogged: 0, setsPlanned: 0 }
    : {
        status: explicitlyCompleted || (setsPlanned > 0 && nonWarmupToday.length >= setsPlanned)
          ? 'done'
          : nonWarmupToday.length > 0 ? 'in_progress' : 'not_started',
        focus: todayWorkoutDay!.focus,
        exerciseNames: todayWorkoutDay!.exercises.map(e => e.name),
        setsLogged: nonWarmupToday.length,
        setsPlanned,
      }

  // ---- Nutrition ----------------------------------------------------------
  const ledger = macros ? await getTodayLedger(profileId, todayStr, macros) : null
  const waterMl = await getWaterTotalForDate(profileId, todayStr)
  const waterTargetMl = profile.water_target_ml ?? 2000

  // ---- Weight trend ---------------------------------------------------------
  const weighIns = await getRecentWeighIns(profileId, 14)
  const goals = await getActiveGoals(profileId)
  const weightGoal = goals.find(g => g.metric === 'body_weight_kg' && g.baseline_value != null && g.target_value != null)
  const weightTrend = computeWeightTrend(
    weighIns.map(w => ({ date: w.date, weightKg: w.weight_kg })),
    todayStr,
    weightGoal ? { targetKg: weightGoal.target_value!, baselineKg: weightGoal.baseline_value! } : null,
  )
  // getRecentWeighIns returns newest-first; the Home trend chart plots
  // left-to-right chronologically, so this is the one place that reverses it.
  const weightSeries: WeightSeriesPoint[] = [...weighIns].reverse().map(w => ({ date: w.date, kg: w.weight_kg }))

  // ---- Recent PRs -----------------------------------------------------------
  const prCache = getPRCache(profileId)
  const recentPRs: RecentPR[] = Object.entries(prCache)
    .filter(([, pr]) => daysAgo(pr.date, todayStr) >= 0 && daysAgo(pr.date, todayStr) <= 7)
    .map(([exerciseName, pr]) => ({ exerciseName, weightKg: pr.maxWeight, date: pr.date }))
    .sort((a, b) => b.date.localeCompare(a.date))

  // ---- Streak + session-pace + protein-adherence window (shared reads) ---
  const [workingLogs, cardioLogs] = await Promise.all([
    getRecentLogs(profileId, 35),
    getRecentCardioLogs(profileId, 35),
  ])
  const loggedDates = new Set<string>([...workingLogs.map(l => l.date), ...cardioLogs.map(c => c.date)])

  // A day is scheduled if it SAYS it is (is_scheduled), falling back to the
  // old "has exercises" inference only for plans stored before that field
  // existed. Without the field, an activity-shaped day — a walk, a swim, no
  // exercises array — would never count as scheduled, so logging it could
  // never build a streak: streak.ts treats an unscheduled day as transparent,
  // putting a completed walk in the same bucket as an untouched rest day.
  const scheduledWeekdays = new Set(
    exercisePlan.filter(d => (d.is_scheduled ?? d.exercises.length > 0)).map(d => d.day),
  )
  const streakDays: StreakDayInput[] = []
  for (let i = 34; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000)
    const dateStr = d.toISOString().slice(0, 10) === todayStr ? todayStr : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const weekdayName = d.toLocaleDateString('en-US', { weekday: 'long' })
    const scheduled = scheduledWeekdays.has(weekdayName)
    const logged = loggedDates.has(dateStr)
    if (dateStr === todayStr && scheduled && !logged) continue // today, not over yet — not a miss (streak.ts's contract)
    streakDays.push({ date: dateStr, scheduled, logged, planWeek: getActiveMesocycleWeek(planCreatedAt, d, totalWeeks) })
  }
  const streakResult = computeStreak(streakDays)

  // Session pace: distinct trained dates in the current plan week so far vs the same span last plan week.
  const daysIntoCurrentWeek = streakDays.filter(d => d.planWeek === getActiveMesocycleWeek(planCreatedAt, now, totalWeeks)).length
  const currentPlanWeek = getActiveMesocycleWeek(planCreatedAt, now, totalWeeks)
  const sessionsThisWeekSoFar = new Set(workingLogs.filter(l => streakDays.find(d => d.date === l.date && d.planWeek === currentPlanWeek)).map(l => l.date)).size
    + cardioLogs.filter(c => streakDays.find(d => d.date === c.date && d.planWeek === currentPlanWeek)).length
  const lastPlanWeek = currentPlanWeek - 1
  const lastWeekDatesSameSpan = streakDays.filter(d => d.planWeek === lastPlanWeek).slice(0, daysIntoCurrentWeek).map(d => d.date)
  const sessionsLastWeekSameSpan = new Set(workingLogs.filter(l => lastWeekDatesSameSpan.includes(l.date)).map(l => l.date)).size

  const scheduledSoFarThisWeek = streakDays.filter(d => d.planWeek === currentPlanWeek && d.scheduled).length
  const loggedOfScheduledSoFarThisWeek = streakDays.filter(d => d.planWeek === currentPlanWeek && d.scheduled && d.logged).length

  // Protein adherence: consecutive PRIOR days (not including in-progress
  // today) hitting >=95% of target. Bounded to at most 14 sequential
  // getTodayLedger calls, breaking on the first miss — usually far fewer
  // in practice. A single ranged meal_events query grouped by date would
  // be cheaper; left as the simpler per-date reuse of the existing ledger
  // function for this first pass (read-cost discipline's actual
  // requirement — "fetch once per mount, not on every render" — still
  // holds, since this whole function runs once per dashboard mount).
  const proteinTarget = macros?.protein ?? 0
  let proteinStreak = 0
  if (macros && proteinTarget > 0) {
    for (let i = 1; i <= 14; i++) {
      const d = new Date(now.getTime() - i * 86_400_000)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const dayLedger = await getTodayLedger(profileId, dateStr, macros!).catch(() => null)
      if (!dayLedger || dayLedger.eaten.protein < proteinTarget * 0.95) break
      proteinStreak++
    }
  }

  // Known-lift progress since onboarding baseline.
  const knownLiftProgress = Object.entries(KNOWN_LIFT_FIELD)
    .map(([exerciseName, field]) => {
      const baseline = profile[field]
      const current = prCache[exerciseName]?.maxWeight
      if (baseline == null || current == null) return null
      return { name: exerciseName, deltaKg: Math.round((current - baseline) * 10) / 10 }
    })
    .filter((x): x is { name: string; deltaKg: number } => x !== null)

  const coachTipCtx: CoachTipContext = {
    today: todayStr,
    proteinAdherenceStreakDays: proteinStreak,
    knownLiftProgress,
    sessionsThisWeekSoFar,
    sessionsLastWeekSameSpan,
    scheduledSoFarThisWeek,
    loggedOfScheduledSoFarThisWeek,
    weightTrend: weightTrend ? { ratePerWeekKg: weightTrend.ratePerWeekKg ?? 0, towardGoal: weightTrend.onTrackForGoal } : null,
    recentPRs: recentPRs.map(p => ({ exerciseName: p.exerciseName, weightKg: p.weightKg })),
  }
  const coachTip = selectCoachTip(coachTipCtx)

  // ---- What's left today (one line, omitted when nothing's outstanding) ---
  const gaps: string[] = []
  if (session.status === 'in_progress') {
    const remaining = session.setsPlanned - session.setsLogged
    if (remaining > 0) gaps.push(`${remaining} set${remaining === 1 ? '' : 's'} left in today's session`)
  }
  // Only a gap if there ARE targets to fall short of. With no body metrics
  // there is no meal ledger at all, and "no meals logged yet" would be
  // nagging about something the app can't currently help with.
  if (ledger && ledger.eaten.kcal === 0) gaps.push('no meals logged yet')
  const weighedInRecently = weighIns.filter(w => daysAgo(w.date, todayStr) <= 13).length >= 3
  const weighedInToday = weighIns.some(w => w.date === todayStr)
  if (weighedInRecently && !weighedInToday) gaps.push('no weigh-in yet today')
  const whatsLeftLine = gaps.length > 0 ? gaps.join(' · ') : null

  // ---- Phase context --------------------------------------------------------
  const phase: PhaseContext | null = liveWeekData
    ? {
        weekNumber: liveWeekData.week_number,
        totalWeeks,
        phaseLabel: liveWeekData.phase_label ?? null,
        phaseFocus: liveWeekData.phase_focus ?? null,
        isDeload: !!liveWeekData.is_deload,
        isCalibrationWeek: !!liveWeekData.isCalibrationWeek,
      }
    : null

  return {
    today: todayStr,
    dayName,
    session,
    tomorrowLabel,
    coachTip,
    // Null, not 0 — a zero target is the fabrication this whole line of work
    // removed. The dashboard hides the tile rather than printing "0 of 0".
    caloriesEaten: ledger ? ledger.eaten.kcal : null,
    caloriesTarget: ledger ? ledger.targets.calories : null,
    proteinEaten: ledger ? ledger.eaten.protein : null,
    proteinTarget: ledger ? ledger.targets.protein : null,
    carbsEaten: ledger ? ledger.eaten.carbs : null,
    carbsTarget: ledger ? ledger.targets.carbs : null,
    fatEaten: ledger ? ledger.eaten.fat : null,
    fatTarget: ledger ? ledger.targets.fat : null,
    weightTrend,
    weightSeries,
    weightGoalKg: weightGoal?.target_value ?? null,
    recentPRs,
    streak: streakResult.currentStreak,
    whatsLeftLine,
    phase,
    waterMl,
    waterTargetMl,
  }
}

export type { MealMacros }
