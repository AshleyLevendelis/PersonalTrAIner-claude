/**
 * Dashboard regression suite (VISION-ARCHITECTURE.md §5 Part 5 verification).
 *
 *   1. streak.ts: rest days counted correctly (transparent — never count or break)
 *   2. coach-tips.ts: never renders without supporting data
 *   3. water target: user-set, never auto-suggested/computed
 *   4. calories-in matches the ledger (direct passthrough, no recomputation)
 *   5. weight-trend.ts: rolling average + sparse-data handling
 *
 * House style: fake Supabase (test-grocery.ts/test-memory.ts's shape) for
 * anything hitting the DB; pure unit tests directly for the pure modules.
 */

// --- Environment shims --------------------------------------------------

const storeMap = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => storeMap.get(k) ?? null,
    setItem: (k: string, v: string) => { storeMap.set(k, String(v)) },
    removeItem: (k: string) => { storeMap.delete(k) },
    clear: () => { storeMap.clear() },
  },
  configurable: true,
})
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })

// --- Fake Supabase (test-pending-actions.ts's shape) ------------------------

type Row = Record<string, unknown>
const db: Record<string, Row[]> = {
  meal_events: [], user_goals: [], daily_metrics: [], exercise_set_logs: [],
  cardio_logs: [], workout_sessions: [], water_logs: [], fitness_profiles: [],
}
const UNIQUES: Record<string, string[][]> = {}

function uniqueViolation(table: string, row: Row): boolean {
  const keys = UNIQUES[table] ?? []
  return keys.some(cols => db[table].some(existing => existing.id !== row.id && cols.every(c => existing[c] === row[c])))
}
function cmp(a: unknown, b: unknown): number {
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

function fakeFrom(table: string) {
  db[table] = db[table] ?? []
  const filters: ((r: Row) => boolean)[] = []
  const orders: [string, boolean][] = []
  let limitN: number | null = null
  let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select'
  let payload: Row[] = []
  let onConflict: string[] | null = null
  let updateObj: Row | null = null
  let single = false

  const exec = (): { data: unknown; error: { code?: string; message: string } | null } => {
    if (op === 'insert') {
      const inserted: Row[] = []
      for (const raw of payload) {
        const row: Row = { id: crypto.randomUUID(), created_at: raw.created_at ?? new Date().toISOString(), ...raw }
        if (uniqueViolation(table, row)) return { data: null, error: { code: '23505', message: 'duplicate key' } }
        db[table].push(row)
        inserted.push(row)
      }
      return { data: single ? inserted[0] ?? null : inserted, error: null }
    }
    if (op === 'upsert') {
      for (const raw of payload) {
        const existing = onConflict ? db[table].find(r => onConflict!.every(c => r[c] === raw[c])) : undefined
        if (existing) Object.assign(existing, raw)
        else db[table].push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...raw })
      }
      return { data: null, error: null }
    }
    if (op === 'update') {
      const updated: Row[] = []
      for (const r of db[table]) if (filters.every(f => f(r))) { Object.assign(r, updateObj); updated.push(r) }
      return { data: single ? (updated[0] ?? null) : updated, error: null }
    }
    if (op === 'delete') {
      db[table] = db[table].filter(r => !filters.every(f => f(r)))
      return { data: null, error: null }
    }
    let rows = db[table].filter(r => filters.every(f => f(r)))
    for (const [col, asc] of [...orders].reverse()) rows = [...rows].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]))
    if (limitN != null) rows = rows.slice(0, limitN)
    const data = single ? (rows[0] ?? null) : rows.map(r => ({ ...r }))
    return { data, error: null }
  }

  const api: Record<string, unknown> = {
    select: () => api,
    insert: (rows: Row | Row[]) => { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return api },
    upsert: (rows: Row | Row[], opts?: { onConflict?: string }) => {
      op = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]
      onConflict = opts?.onConflict ? opts.onConflict.split(',') : null
      return api
    },
    update: (obj: Row) => { op = 'update'; updateObj = obj; return api },
    delete: () => { op = 'delete'; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api },
    in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
    is: (c: string, v: unknown) => { filters.push(r => (v === null ? r[c] == null : r[c] === v)); return api },
    gte: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) >= 0); return api },
    lte: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) <= 0); return api },
    order: (c: string, opts?: { ascending?: boolean }) => { orders.push([c, opts?.ascending !== false]); return api },
    limit: (n: number) => { limitN = n; return api },
    maybeSingle: () => { single = true; return api },
    single: () => { single = true; return api },
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve().then(() => resolve(exec()), reject),
  }
  return api
}
const fakeClient = { from: fakeFrom }

// --- Test harness -----------------------------------------------------------

let failures = 0
function check(label: string, condition: boolean, extra?: unknown) {
  if (condition) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — got ${JSON.stringify(extra)}` : ''}`) }
}

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient(fakeClient as any)

  const { computeStreak } = await import('../src/lib/streak')
  const { selectCoachTip } = await import('../src/lib/coach-tips')
  const { computeWeightTrend } = await import('../src/lib/weight-trend')
  const { setWaterTargetMl, logWater, getAllLogs, getTotalForDate, flushPending } = await import('../src/lib/water-store')
  const { loadDashboardData } = await import('../src/lib/dashboard-data')

  // ---- 1. Streak: rest days counted correctly -------------------------------
  console.log('\n[1] streak.ts: rest days are transparent — never count, never break')

  const allTrainedNoRest = [
    { date: '2026-01-01', scheduled: true, logged: true, planWeek: 1 },
    { date: '2026-01-02', scheduled: true, logged: true, planWeek: 1 },
    { date: '2026-01-03', scheduled: true, logged: true, planWeek: 1 },
  ]
  check('3 scheduled+logged days in a row = streak of 3', computeStreak(allTrainedNoRest).currentStreak === 3, computeStreak(allTrainedNoRest))

  const withRestDaysInterleaved = [
    { date: '2026-01-01', scheduled: true, logged: true, planWeek: 1 },
    { date: '2026-01-02', scheduled: false, logged: false, planWeek: 1 }, // rest day, not logged
    { date: '2026-01-03', scheduled: true, logged: true, planWeek: 1 },
    { date: '2026-01-04', scheduled: false, logged: false, planWeek: 1 }, // rest day
    { date: '2026-01-05', scheduled: true, logged: true, planWeek: 1 },
  ]
  check('rest days interleaved with training days do not break or count toward the streak (still 3)',
    computeStreak(withRestDaysInterleaved).currentStreak === 3, computeStreak(withRestDaysInterleaved))

  const restDayAtEnd = [
    { date: '2026-01-01', scheduled: true, logged: true, planWeek: 1 },
    { date: '2026-01-02', scheduled: true, logged: true, planWeek: 1 },
    { date: '2026-01-03', scheduled: false, logged: false, planWeek: 1 }, // most recent day is a rest day
  ]
  check('a rest day as the MOST RECENT day still shows the streak from before it (2, not 0)',
    computeStreak(restDayAtEnd).currentStreak === 2, computeStreak(restDayAtEnd))

  const missedTrainingDay = [
    { date: '2026-01-01', scheduled: true, logged: true, planWeek: 1 },
    { date: '2026-01-02', scheduled: true, logged: false, planWeek: 1 }, // missed, no make-up used yet this week
    { date: '2026-01-03', scheduled: true, logged: true, planWeek: 1 },
  ]
  const missedResult = computeStreak(missedTrainingDay)
  check('one missed scheduled day consumes the make-up token (forgiven) rather than breaking immediately',
    missedResult.currentStreak === 2 && !missedResult.brokenByMissedDay, missedResult)

  const twoMissedSameWeek = [
    { date: '2026-01-01', scheduled: true, logged: true, planWeek: 1 },
    { date: '2026-01-02', scheduled: true, logged: false, planWeek: 1 }, // the OLDER miss this week
    { date: '2026-01-03', scheduled: true, logged: false, planWeek: 1 }, // the MORE RECENT miss this week — walking backward, this one is forgiven first
    { date: '2026-01-04', scheduled: true, logged: true, planWeek: 1 },
  ]
  const twoMissResult = computeStreak(twoMissedSameWeek)
  check('two missed scheduled days in the SAME plan week: the more recent miss is forgiven (streak keeps the day-4 count), the older one breaks the walk right after',
    twoMissResult.brokenByMissedDay && twoMissResult.currentStreak === 1, twoMissResult)

  const missedDifferentWeeks = [
    { date: '2026-01-01', scheduled: true, logged: false, planWeek: 1 }, // miss, week 1 — forgiven
    { date: '2026-01-02', scheduled: true, logged: true, planWeek: 1 },
    { date: '2026-01-08', scheduled: true, logged: false, planWeek: 2 }, // miss, week 2 — separate token, forgiven
    { date: '2026-01-09', scheduled: true, logged: true, planWeek: 2 },
  ]
  check('a make-up token is per PLAN WEEK, not shared globally — two misses in two different weeks are both forgiven',
    !computeStreak(missedDifferentWeeks).brokenByMissedDay, computeStreak(missedDifferentWeeks))

  // ---- 2. Coach tips never render without supporting data --------------------
  console.log('\n[2] coach-tips.ts: never renders a tip without real supporting data')

  const emptyCtx = {
    today: '2026-01-15', proteinAdherenceStreakDays: 0, knownLiftProgress: [],
    sessionsThisWeekSoFar: 0, sessionsLastWeekSameSpan: 0, scheduledSoFarThisWeek: 0,
    loggedOfScheduledSoFarThisWeek: 0, weightTrend: null, recentPRs: [],
  }
  check('zero supporting data anywhere -> null (never a generic fallback message)', selectCoachTip(emptyCtx) === null, selectCoachTip(emptyCtx))

  const belowThresholdCtx = { ...emptyCtx, proteinAdherenceStreakDays: 2 } // below the >=3 threshold
  check('a protein streak below the 3-day threshold does not fire the rule', selectCoachTip(belowThresholdCtx) === null, selectCoachTip(belowThresholdCtx))

  const oneRealSignal = { ...emptyCtx, proteinAdherenceStreakDays: 5 }
  const tip = selectCoachTip(oneRealSignal)
  check('a genuine 5-day protein streak DOES produce a tip, and it names the real number', tip !== null && tip!.includes('5'), tip)

  const flatWeightCtx = { ...emptyCtx, weightTrend: { ratePerWeekKg: 0.01, towardGoal: null } }
  check('a near-zero weight-trend rate (<0.05kg/wk) is not specific enough to report — no tip from it', selectCoachTip(flatWeightCtx) === null, selectCoachTip(flatWeightCtx))

  // Rotation: same day -> same tip across repeated calls (deterministic, not re-randomized every render).
  const multiSignalCtx = { ...emptyCtx, proteinAdherenceStreakDays: 4, recentPRs: [{ exerciseName: 'Barbell Squats', weightKg: 100 }] }
  const first = selectCoachTip(multiSignalCtx)
  const second = selectCoachTip(multiSignalCtx)
  check('the same day + same context always selects the same tip (stable across re-renders)', first === second, { first, second })

  // ---- 3. Water target: user-set, never auto-suggested -----------------------
  console.log('\n[3] water target is a plain user-set value, never computed')

  const profileId = crypto.randomUUID()
  db.fitness_profiles.push({ id: profileId, water_target_ml: 2000 })
  await setWaterTargetMl(profileId, 3500)
  const updatedProfile = db.fitness_profiles.find(p => p.id === profileId)
  check('setWaterTargetMl writes EXACTLY the value passed in — no derivation from weight/activity/goal', updatedProfile?.water_target_ml === 3500, updatedProfile)

  const fs = await import('fs')
  const migrationSql = fs.readFileSync('supabase/migrations/20260807090000_create_dashboard_tables.sql', 'utf-8')
  check("the DEFAULT is a literal constant (2000), not a formula referencing weight/activity/goal columns",
    /water_target_ml integer NOT NULL DEFAULT 2000/.test(migrationSql) && !/weight_kg|activity_level|fitness_goal/.test(migrationSql.split('water_target_ml')[1]?.slice(0, 200) ?? ''))

  logWater({ profileId, date: '2026-01-15', amountMl: 300, source: 'manual' })
  logWater({ profileId, date: '2026-01-15', amountMl: 200, source: 'chat' })
  await flushPending()
  const total = await getTotalForDate(profileId, '2026-01-15')
  check('water total is a plain sum over logged entries (300 + 200 = 500)', total === 500, total)
  const logs = await getAllLogs(profileId)
  check('both log rows synced to the fake DB via the local-first flush', db.water_logs.filter(r => r.profile_id === profileId).length === 2, logs)

  // ---- 4. Calories-in matches the ledger (direct passthrough) -----------------
  console.log('\n[4] dashboard-data.ts: calories-in is a direct passthrough from getTodayLedger, never recomputed')

  const dashSrc = fs.readFileSync('src/lib/dashboard-data.ts', 'utf-8')
  check('caloriesEaten is assigned directly from ledger.eaten.kcal (no arithmetic in between)',
    /caloriesEaten:\s*ledger\.eaten\.kcal/.test(dashSrc))
  check('caloriesTarget is assigned directly from ledger.targets.calories', /caloriesTarget:\s*ledger\.targets\.calories/.test(dashSrc))
  check('proteinEaten is assigned directly from ledger.eaten.protein', /proteinEaten:\s*ledger\.eaten\.protein/.test(dashSrc))

  // End-to-end: seed a meal_events row and confirm loadDashboardData's
  // caloriesEaten matches it exactly.
  const profileId2 = crypto.randomUUID()
  const today2 = '2026-01-15'
  db.meal_events.push({
    id: crypto.randomUUID(), profile_id: profileId2, date: today2, slot: 'lunch', event_type: 'confirmed',
    meal_name: 'Chicken Rice Bowl', macros: { kcal: 620, protein: 45, carbs: 60, fat: 15 }, source: 'plan',
    client_id: crypto.randomUUID(), created_at: new Date().toISOString(), voided_at: null,
  })
  const profile = {
    id: profileId2, age: 30, gender: 'male' as const, height_cm: 178, weight_kg: 80, activity_level: 'moderate' as const,
    fitness_goal: 'hypertrophy' as const, training_days: [
      { day: 'Monday', available: true }, { day: 'Tuesday', available: false }, { day: 'Wednesday', available: true },
      { day: 'Thursday', available: false }, { day: 'Friday', available: true }, { day: 'Saturday', available: false }, { day: 'Sunday', available: false },
    ],
    preferred_time: 'morning' as const, dietary_preferences: [], session_duration_preference: '60-90' as const,
    workout_split_preference: 'ai_recommendation' as const, macro_calculation_mode: 'STANDARD_STATIC' as const,
    equipment_access: 'full_gym' as const, training_style: 'bodybuilding' as const, training_experience: 'intermediate' as const,
    coaching_persona: 'supportive' as const, injuries: [], recovery_capacity: 'moderate' as const, conditioning_preference: 'tolerate' as const,
  }
  const macros = { calories: 2400, protein: 180, carbs: 250, fat: 70 }
  const restDayPlan = [
    { day: 'Monday', focus: 'Push', exercises: [{ name: 'Barbell Bench Press', sets: 3, reps: '8-10', rest: '90s', substitution: '' }] },
    { day: 'Tuesday', focus: 'Rest', exercises: [] },
    { day: 'Wednesday', focus: 'Pull', exercises: [{ name: 'Barbell Rows', sets: 3, reps: '8-10', rest: '90s', substitution: '' }] },
    { day: 'Thursday', focus: 'Rest', exercises: [] },
    { day: 'Friday', focus: 'Legs', exercises: [{ name: 'Barbell Squats', sets: 3, reps: '8-10', rest: '90s', substitution: '' }] },
    { day: 'Saturday', focus: 'Rest', exercises: [] },
    { day: 'Sunday', focus: 'Rest', exercises: [] },
  ]
  const now = new Date(`${today2}T12:00:00`) // 2026-01-15 is a Thursday — a rest day in this fixture
  const dashData = await loadDashboardData({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profile: profile as any, macros, exercisePlan: restDayPlan as any, mesocycle: [], planCreatedAt: undefined,
    todayLogs: [], liveWeek: 1, dayName: 'Thursday', todayStr: today2, now,
  })
  check('loadDashboardData.caloriesEaten matches the seeded meal_events row exactly (620)', dashData.caloriesEaten === 620, dashData.caloriesEaten)
  check('loadDashboardData.caloriesTarget matches the targets passed in (2400)', dashData.caloriesTarget === 2400, dashData.caloriesTarget)
  check('a day with no plan entry (Thursday, empty exercises) resolves to a rest-day session', dashData.session.status === 'rest', dashData.session)

  // The trainee who declined a body metric. computeTargets returns null for
  // them, and Dashboard used to require macros before it would load anything
  // at all — so the entire Home tab sat on "Loading your day…" forever, and
  // the weigh-in card inside it (the one thing that would have given us their
  // weight) was unreachable. The payload must survive an absent target, and
  // must MARK it rather than reporting a zero as though it were a target.
  const noTargets = await loadDashboardData({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profile: profile as any, macros: null, exercisePlan: restDayPlan as any, mesocycle: [], planCreatedAt: undefined,
    todayLogs: [], liveWeek: 1, dayName: 'Thursday', todayStr: today2, now,
  })
  check('the dashboard still loads with no macro targets at all', !!noTargets)
  check('...and says so, rather than reporting a target of zero', noTargets.hasNutritionTargets === false)
  check('...while what was actually EATEN is still real and unchanged', noTargets.caloriesEaten === 620, noTargets.caloriesEaten)
  check('...and the training half is completely unaffected', noTargets.session.status === 'rest', noTargets.session)
  check('a profile WITH targets is still marked as having them', dashData.hasNutritionTargets === true)

  // ---- 5. Weight trend: rolling average + sparse data -------------------------
  console.log('\n[5] weight-trend.ts: rolling average, and honest handling of sparse data')

  check('zero weigh-ins -> null (no trend to show)', computeWeightTrend([], '2026-01-15', null) === null)

  const oneOldWeighIn = [{ date: '2025-12-01', weightKg: 90 }] // more than 7 days before "today"
  check('a weigh-in outside the last 7 days -> null (no stale number shown as current)', computeWeightTrend(oneOldWeighIn, '2026-01-15', null) === null)

  const singleRecentWeighIn = [{ date: '2026-01-14', weightKg: 82 }]
  const singleResult = computeWeightTrend(singleRecentWeighIn, '2026-01-15', null)
  check('a single recent weigh-in produces a level (avg) but no rate yet — sparse data handled honestly',
    singleResult !== null && singleResult.rollingAvgKg === 82 && singleResult.ratePerWeekKg === null, singleResult)

  const twoWindows = [
    { date: '2026-01-15', weightKg: 80 }, { date: '2026-01-14', weightKg: 80.5 }, // last-7 window
    { date: '2026-01-08', weightKg: 82 }, { date: '2026-01-07', weightKg: 82.5 }, // prior-7 window
  ]
  const twoWindowResult = computeWeightTrend(twoWindows, '2026-01-15', null)
  check('rolling average over the last-7 window is the mean of just that window (80.25)', twoWindowResult?.rollingAvgKg === 80.25, twoWindowResult)
  check('rate is the difference vs the PRIOR 7-day window\'s mean (80.25 - 82.25 = -2)', twoWindowResult?.ratePerWeekKg === -2, twoWindowResult)

  const losingGoal = { targetKg: 75, baselineKg: 90 } // trying to lose weight
  const onTrack = computeWeightTrend(twoWindows, '2026-01-15', losingGoal)
  check('losing weight toward a lower-target goal is reported on-track', onTrack?.onTrackForGoal === true, onTrack)

  const gainingGoalButLosing = { targetKg: 95, baselineKg: 90 } // trying to GAIN, but trend is losing
  const offTrack = computeWeightTrend(twoWindows, '2026-01-15', gainingGoalButLosing)
  check('losing weight while the goal wants gain is reported off-track, not silently ignored', offTrack?.onTrackForGoal === false, offTrack)

  const duplicateDateEntry = [
    { date: '2026-01-15', weightKg: 79 }, { date: '2026-01-15', weightKg: 80 }, // same-day correction
  ]
  const dupResult = computeWeightTrend(duplicateDateEntry, '2026-01-15', null)
  check('a same-day duplicate weigh-in (a correction) uses the LAST entry, not both averaged in', dupResult?.rollingAvgKg === 80 && dupResult?.sampleCount === 1, dupResult)

  // ---- Summary -------------------------------------------------------------
  if (failures > 0) {
    console.error(`\n${failures} dashboard check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll dashboard checks passed.')
}

main().catch(err => {
  console.error('Test crashed:', err)
  process.exit(1)
})
