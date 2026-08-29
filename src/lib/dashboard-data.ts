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
import { selectCoachTipWithKey, type CoachTipContext } from './coach-tips'
import { computeConsistency, type ConsistencyScore } from './consistency-score'
import { getActiveMesocycleWeek } from './calculations'
import { supabase } from './supabase'
import type { UserProfile, MacroTargets, WorkoutDay, MesocycleWeek, ExerciseSetLog } from './types'
import { estimateDaySeconds } from './session-duration'

export type SessionStatus = 'rest' | 'not_started' | 'in_progress' | 'done'

export interface TodaySession {
  status: SessionStatus
  focus: string | null
  exerciseNames: string[]
  setsLogged: number
  setsPlanned: number
  /**
   * The session at a glance, replacing three truncated names of six.
   *
   * "Prone Y-T Raises · Trap Bar Deadlift · Chest Dips · +3 more" told you
   * almost nothing you could act on: the names were clipped, the count was
   * buried in "+3 more", and the two facts that decide whether you can train
   * right now — how long it takes and what the top set is — were absent.
   * Every value here was already in the plan; none of it was surfaced.
   */
  exerciseCount: number
  /** Whole minutes, from the same estimator the time cap and the audit use. */
  estimatedMinutes: number | null
  /** Minutes still to go, once sets have been logged. Null before that. */
  minutesLeft: number | null
  /** The heaviest external load in the session, e.g. "bench from 92.5 kg". */
  leadLift: { name: string; kg: number } | null
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
  /** Which rule produced coachTip — drives the bubble's reply chips. */
  coachTipKey: string | null
  /** Null when nothing measurable has happened yet this plan week — a 0% would read as a verdict rather than an absence. */
  consistency: ConsistencyScore | null
  caloriesEaten: number
  caloriesTarget: number
  proteinEaten: number
  proteinTarget: number
  carbsEaten: number
  carbsTarget: number
  fatEaten: number
  fatTarget: number
  /**
   * False when the trainee has no body metrics on record, so the four
   * *Target numbers above are placeholders and MUST NOT be rendered.
   *
   * The absence doctrine (MissingBodyMetricsNotice): "Deliberately NOT here:
   * a placeholder figure, a dash standing in for a real number, a population
   * average... The rule is an absence, stated plainly." The zeroes are only
   * here because getTodayLedger needs a target shape to compute what was
   * EATEN, which is a real number either way; this flag is what stops "of 0
   * kcal" reaching a screen.
   */
  hasNutritionTargets: boolean
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
   * Null when the trainee declined a body metric, so no calorie/protein
   * target can be computed. NOT a reason to withhold the whole dashboard —
   * the training half of this payload doesn't depend on it at all. See
   * hasNutritionTargets below.
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

  // The glance line's three facts, derived here rather than in the component:
  // Dashboard.tsx renders, this file is the one aggregator. estimateDaySeconds
  // is the SAME estimator the plan's time cap and test:audit use, so the
  // number on Home cannot disagree with the number the plan was built to.
  const estimatedMinutes = todayWorkoutDay && todayWorkoutDay.exercises.length > 0
    ? Math.round(estimateDaySeconds(todayWorkoutDay) / 60)
    : null
  // The heaviest externally-loaded lift, which is what people actually want to
  // know before deciding to go. Bodyweight and band work carry no kg and are
  // skipped rather than reported as 0.
  const leadLift = (todayWorkoutDay?.exercises ?? [])
    .filter(e => typeof e.suggested_load_kg === 'number' && (e.suggested_load_kg ?? 0) > 0)
    .sort((a, b) => (b.suggested_load_kg ?? 0) - (a.suggested_load_kg ?? 0))
    .map(e => ({ name: e.name, kg: e.suggested_load_kg as number }))[0] ?? null

  const session: TodaySession = isRestDay
    ? { status: 'rest', focus: null, exerciseNames: [], setsLogged: 0, setsPlanned: 0,
        exerciseCount: 0, estimatedMinutes: null, minutesLeft: null, leadLift: null }
    : {
        status: explicitlyCompleted || (setsPlanned > 0 && nonWarmupToday.length >= setsPlanned)
          ? 'done'
          : nonWarmupToday.length > 0 ? 'in_progress' : 'not_started',
        focus: todayWorkoutDay!.focus,
        exerciseNames: todayWorkoutDay!.exercises.map(e => e.name),
        setsLogged: nonWarmupToday.length,
        setsPlanned,
        exerciseCount: todayWorkoutDay!.exercises.length,
        estimatedMinutes,
        // Pro-rated by sets remaining rather than re-estimated: the estimator
        // works on a whole day, and a part-finished day is not a smaller day.
        minutesLeft: estimatedMinutes != null && setsPlanned > 0 && nonWarmupToday.length > 0
          ? Math.max(0, Math.round(estimatedMinutes * (1 - Math.min(1, nonWarmupToday.length / setsPlanned))))
          : null,
        leadLift,
      }

  // ---- Nutrition ----------------------------------------------------------
  // A zeroed target shape when we have no body metrics: getTodayLedger needs
  // one to compute what was EATEN, which is real either way. The targets it
  // returns in that case are not, which is what hasNutritionTargets marks.
  const NO_TARGETS: MacroTargets = { calories: 0, protein: 0, carbs: 0, fat: 0 }
  const hasNutritionTargets = macros != null
  const ledger = await getTodayLedger(profileId, todayStr, macros ?? NO_TARGETS)
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

  // DAYS BEFORE THE PLAN EXISTED ARE NOT PLAN WEEK 1.
  //
  // getActiveMesocycleWeek clamps with Math.max(0, elapsedDays), so every date
  // earlier than planCreatedAt comes back as week 1. The lookback above is 35
  // days, so on a plan created today all 35 landed in "this plan week" — and
  // every aggregate below counted five weeks of history that predate the plan
  // as though it were the current week. Caught by the consistency score
  // reading "0/19 planned sessions" for a single week; it also made
  // coach-tips' perfect_adherence able to announce "Every planned session
  // this week, done — 19 for 19", and skewed session_pace's comparison.
  //
  // Related but not the same as the earlier "stop marking pre-plan days as
  // missed" fix: that one taught the STREAK to ignore them, and these
  // plan-week aggregates were never taught the same thing.
  const planStartStr = planCreatedAt ? new Date(planCreatedAt).toISOString().slice(0, 10) : null
  const sincePlanStart = (d: { date: string }) => planStartStr == null || d.date >= planStartStr

  // Session pace: distinct trained dates in the current plan week so far vs the same span last plan week.
  const currentPlanWeek = getActiveMesocycleWeek(planCreatedAt, now, totalWeeks)
  const inCurrentPlanWeek = (d: { date: string; planWeek: number }) =>
    d.planWeek === currentPlanWeek && sincePlanStart(d)
  const daysIntoCurrentWeek = streakDays.filter(inCurrentPlanWeek).length
  const sessionsThisWeekSoFar = new Set(workingLogs.filter(l => streakDays.find(d => d.date === l.date && inCurrentPlanWeek(d))).map(l => l.date)).size
    + cardioLogs.filter(c => streakDays.find(d => d.date === c.date && inCurrentPlanWeek(d))).length
  const lastPlanWeek = currentPlanWeek - 1
  const lastWeekDatesSameSpan = streakDays.filter(d => d.planWeek === lastPlanWeek && sincePlanStart(d)).slice(0, daysIntoCurrentWeek).map(d => d.date)
  const sessionsLastWeekSameSpan = new Set(workingLogs.filter(l => lastWeekDatesSameSpan.includes(l.date)).map(l => l.date)).size

  const scheduledSoFarThisWeek = streakDays.filter(d => inCurrentPlanWeek(d) && d.scheduled).length
  const loggedOfScheduledSoFarThisWeek = streakDays.filter(d => inCurrentPlanWeek(d) && d.scheduled && d.logged).length

  // Protein adherence: consecutive PRIOR days (not including in-progress
  // today) hitting >=95% of target. Bounded to at most 14 sequential
  // getTodayLedger calls, breaking on the first miss — usually far fewer
  // in practice. A single ranged meal_events query grouped by date would
  // be cheaper; left as the simpler per-date reuse of the existing ledger
  // function for this first pass (read-cost discipline's actual
  // requirement — "fetch once per mount, not on every render" — still
  // holds, since this whole function runs once per dashboard mount).
  const proteinTarget = macros?.protein ?? 0
  // Collect the days FIRST, then derive from them, rather than breaking out of
  // the loop on the first miss. The streak still stops at the first miss (it
  // is a streak) — but the consistency score needs to know how many days in
  // the current plan week were hit, which a loop that exits early cannot say.
  // Same fourteen fetches either way: no new reads, more answers.
  const proteinDays: { date: string; hit: boolean }[] = []
  if (proteinTarget > 0) {
    for (let i = 1; i <= 14; i++) {
      const d = new Date(now.getTime() - i * 86_400_000)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const dayLedger = await getTodayLedger(profileId, dateStr, macros!).catch(() => null)
      proteinDays.push({ date: dateStr, hit: !!dayLedger && dayLedger.eaten.protein >= proteinTarget * 0.95 })
    }
  }
  let proteinStreak = 0
  for (const day of proteinDays) { if (!day.hit) break; proteinStreak++ }

  // Consistency — sessions and protein over the CURRENT PLAN WEEK, which is
  // the window the user is actually living in. Water is left out on purpose;
  // see consistency-score.ts for why.
  const weekDates = new Set(streakDays.filter(inCurrentPlanWeek).map(d => d.date))
  const proteinDaysThisWeek = proteinDays.filter(d => weekDates.has(d.date))
  const consistency = computeConsistency([
    { label: 'planned sessions', done: loggedOfScheduledSoFarThisWeek, outOf: scheduledSoFarThisWeek },
    { label: 'protein days', done: proteinDaysThisWeek.filter(d => d.hit).length, outOf: proteinDaysThisWeek.length },
  ])

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
    // Both already read above for the water tile — passed through rather than
    // re-fetched. The hour is read HERE, not inside coach-tips, which is a
    // pure function by design.
    waterMl,
    waterTargetMl,
    hourOfDay: new Date().getHours(),
  }
  const selectedTip = selectCoachTipWithKey(coachTipCtx)
  const coachTip = selectedTip?.text ?? null
  const coachTipKey = selectedTip?.key ?? null

  // ---- What's left today (one line, omitted when nothing's outstanding) ---
  const gaps: string[] = []
  if (session.status === 'in_progress') {
    const remaining = session.setsPlanned - session.setsLogged
    if (remaining > 0) gaps.push(`${remaining} set${remaining === 1 ? '' : 's'} left in today's session`)
  }
  if (ledger.eaten.kcal === 0) gaps.push('no meals logged yet')
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
    coachTipKey,
    consistency,
    caloriesEaten: ledger.eaten.kcal,
    caloriesTarget: ledger.targets.calories,
    proteinEaten: ledger.eaten.protein,
    proteinTarget: ledger.targets.protein,
    carbsEaten: ledger.eaten.carbs,
    carbsTarget: ledger.targets.carbs,
    fatEaten: ledger.eaten.fat,
    fatTarget: ledger.targets.fat,
    hasNutritionTargets,
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
