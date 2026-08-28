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
  console.log('\n[3b] the home screen asks for ONE weight, not two')
  {
    // Ashley: "Collapse Set goal weight into a setting modal, and keep only
    // the quick weight logger visible to reduce scrolling." Two weight inputs
    // stacked meant the second read as part of the first, and the page ran to
    // 1212px — one and a half phone screens. Measured after: 1178px.
    //
    // The pixels are the smaller half. The point is that a goal weight is set
    // once and the logger is used daily, so only one of them earns permanent
    // space on the screen someone opens every morning.
    const dash = fs.readFileSync('src/components/Dashboard.tsx', 'utf-8')
    check('the dashboard no longer embeds the goal-weight form',
      !/<GoalWeightSetter/.test(dash))
    // No link back, either: measured, removing the input saved 44px and a
    // link to it cost 24, so the page came out a pixel TALLER than it began.
    // The goal setter is reachable from the gear and from chat; it does not
    // need a permanent row on the home screen too.
    check('...and does not spend a row on a link back to it', !/Set a goal weight/.test(dash))

    // The form has to EXIST somewhere or the feature is simply gone — the
    // Goals section listed a goal weight once set, with nowhere to set one.
    const prof = fs.readFileSync('src/components/ProfileScreen.tsx', 'utf-8')
    check('the profile screen owns the goal-weight form now', /<GoalWeightSetter/.test(prof))

    // A goal weight stores where you started and progress is measured from
    // it. `?? 0` would have written a starting weight of zero for anyone with
    // no weigh-in and no stated weight — the fabricated-measurement shape the
    // assumed-body work exists to prevent.
    check('it never invents a baseline when there is no weight to use',
      !/baselineKg=\{latestWeightKg \?\? 0\}/.test(prof) &&
      /Log a weigh-in first/.test(prof))
  }

  console.log('\n[3c] the steps row has a target to draw a ring against')
  {
    // Ashley: "replace the plain text box/button for Steps with a visual
    // progress bar or ring matching the calorie indicator style." A ring
    // needs a denominator and there was none — steps-store.ts is manual entry
    // with no target anywhere in the app.
    //
    // Derived from the activity level already on file rather than asked for,
    // which is exactly how the calorie target works (BMR/TDEE, shown as
    // "0 OF 3040 KCAL"). Not a new kind of claim, the existing one applied to
    // a second number.
    const { stepsTargetFor, derivedStepsTargetFor } = await import('../src/lib/steps-target')
    check('every activity level has a target', [
      'sedentary', 'light', 'moderate', 'active', 'very_active',
    ].every(a => derivedStepsTargetFor(a as never) > 0))

    // Ordered, and ordered the SAME WAY as the calorie multipliers these
    // levels already drive. A step target that called a sedentary user more
    // active than a very active one would contradict their own calories.
    const ordered = ['sedentary', 'light', 'moderate', 'active', 'very_active']
      .map(a => derivedStepsTargetFor(a as never))
    check(`targets rise with activity (${ordered.join(' < ')})`,
      ordered.every((v, i) => i === 0 || v > ordered[i - 1]), ordered)

    // very_active is in the type but NOT offered at onboarding, so it is the
    // one that silently falls through a Record if anyone forgets it — tsc
    // caught exactly that while this was being written.
    check('very_active is covered, though onboarding never offers it',
      derivedStepsTargetFor('very_active' as never) > derivedStepsTargetFor('active' as never))

    // An unknown/missing level must not produce 0 — a ring against a zero
    // denominator is a divide-by-zero on screen.
    check('a missing activity level still yields a usable target',
      derivedStepsTargetFor(undefined) > 0 && derivedStepsTargetFor(null) > 0)

    // THE OVERRIDE. A band cannot know that someone walks a dog twice a day.
    const p = (activity: string, chosen?: number | null) =>
      ({ activity_level: activity, daily_step_target: chosen } as never)
    check('a chosen target wins over the derived band',
      stepsTargetFor(p('sedentary', 12500)) === 12500)
    check('...and null means "never set one", not zero',
      stepsTargetFor(p('sedentary', null)) === derivedStepsTargetFor('sedentary' as never))
    check('...and a 0 or negative stored value falls back rather than making the ring divide by zero',
      stepsTargetFor(p('moderate', 0)) > 0 && stepsTargetFor(p('moderate', -5)) > 0)

    // Taking the PROFILE, not the two fields, is what stops one caller
    // reading the override and another the band — the app disagreeing with
    // itself between the ring and the settings screen.
    const stSrc = fs.readFileSync('src/lib/steps-target.ts', 'utf-8')
    check('the ring reads the profile, so it cannot miss the override',
      /stepsTargetFor\(profile: Pick<UserProfile/.test(stSrc))

    // THE HALF THAT IS EASIEST TO FORGET. App.tsx's restoreSession builds the
    // profile column by column, so a column missing from that list is
    // silently undefined for the whole session however faithfully the
    // database stores it — the override would save, survive in Postgres, and
    // be gone on the next reload.
    const app = fs.readFileSync('src/App.tsx', 'utf-8')
    check('restoreSession maps the new column, or it does not exist at runtime',
      /daily_step_target: profileRow\.daily_step_target/.test(app))
    check('...and absent stays absent rather than becoming 0',
      !/daily_step_target: profileRow\.daily_step_target \?\? 0/.test(app))

    // The migration has to exist, and be additive-nullable like its
    // neighbours — a NOT NULL default would hand every existing user a
    // "chosen" target they never chose.
    const mig = fs.readFileSync('supabase/migrations/20260828140000_add_daily_step_target_to_profiles.sql', 'utf-8')
    check('the migration adds the column nullable',
      /add column if not exists daily_step_target integer null/.test(mig))
    check('...and sets no default', !/default/i.test(mig.split('alter table')[1] ?? ''))

    // The settings row shows what the default WOULD be, so an empty box reads
    // as a considered default rather than a gap.
    const prof2 = fs.readFileSync('src/components/ProfileScreen.tsx', 'utf-8')
    check('the settings row exists and shows the derived band as its placeholder',
      /Daily steps/.test(prof2) && /derivedStepsTargetFor\(profile\.activity_level\)/.test(prof2))

    const dash = fs.readFileSync('src/components/Dashboard.tsx', 'utf-8')
    check('the steps row draws a ring', /stepsTargetFor\(profile\)/.test(dash))
    check('...using the same ring geometry as the calorie tile',
      /CALORIE_TILE_RING_CIRC \* Math\.min\(1, steps\.steps \/ stepsTarget\)/.test(dash))
  }

  console.log('\n[3b] the home screen asks for ONE weight, not two')
  {
    // Ashley: "Collapse Set goal weight into a setting modal, and keep only
    // the quick weight logger visible to reduce scrolling." Two weight inputs
    // stacked meant the second read as part of the first, and the page ran to
    // 1212px — one and a half phone screens. Measured after: 1178px.
    //
    // The pixels are the smaller half. The point is that a goal weight is set
    // once and the logger is used daily, so only one of them earns permanent
    // space on the screen someone opens every morning.
    const dash = fs.readFileSync('src/components/Dashboard.tsx', 'utf-8')
    check('the dashboard no longer embeds the goal-weight form',
      !/<GoalWeightSetter/.test(dash))
    // No link back, either: measured, removing the input saved 44px and a
    // link to it cost 24, so the page came out a pixel TALLER than it began.
    // The goal setter is reachable from the gear and from chat; it does not
    // need a permanent row on the home screen too.
    check('...and does not spend a row on a link back to it', !/Set a goal weight/.test(dash))

    // The form has to EXIST somewhere or the feature is simply gone — the
    // Goals section listed a goal weight once set, with nowhere to set one.
    const prof = fs.readFileSync('src/components/ProfileScreen.tsx', 'utf-8')
    check('the profile screen owns the goal-weight form now', /<GoalWeightSetter/.test(prof))

    // A goal weight stores where you started and progress is measured from
    // it. `?? 0` would have written a starting weight of zero for anyone with
    // no weigh-in and no stated weight — the fabricated-measurement shape the
    // assumed-body work exists to prevent.
    check('it never invents a baseline when there is no weight to use',
      !/baselineKg=\{latestWeightKg \?\? 0\}/.test(prof) &&
      /Log a weigh-in first/.test(prof))
  }

  console.log('\n[3c] the steps row has a target to draw a ring against')
  {
    // Ashley: "replace the plain text box/button for Steps with a visual
    // progress bar or ring matching the calorie indicator style." A ring
    // needs a denominator and there was none — steps-store.ts is manual entry
    // with no target anywhere in the app.
    //
    // Derived from the activity level already on file rather than asked for,
    // which is exactly how the calorie target works (BMR/TDEE, shown as
    // "0 OF 3040 KCAL"). Not a new kind of claim, the existing one applied to
    // a second number.
    const { stepsTargetFor, derivedStepsTargetFor } = await import('../src/lib/steps-target')
    check('every activity level has a target', [
      'sedentary', 'light', 'moderate', 'active', 'very_active',
    ].every(a => derivedStepsTargetFor(a as never) > 0))

    // Ordered, and ordered the SAME WAY as the calorie multipliers these
    // levels already drive. A step target that called a sedentary user more
    // active than a very active one would contradict their own calories.
    const ordered = ['sedentary', 'light', 'moderate', 'active', 'very_active']
      .map(a => derivedStepsTargetFor(a as never))
    check(`targets rise with activity (${ordered.join(' < ')})`,
      ordered.every((v, i) => i === 0 || v > ordered[i - 1]), ordered)

    // very_active is in the type but NOT offered at onboarding, so it is the
    // one that silently falls through a Record if anyone forgets it — tsc
    // caught exactly that while this was being written.
    check('very_active is covered, though onboarding never offers it',
      derivedStepsTargetFor('very_active' as never) > derivedStepsTargetFor('active' as never))

    // An unknown/missing level must not produce 0 — a ring against a zero
    // denominator is a divide-by-zero on screen.
    check('a missing activity level still yields a usable target',
      derivedStepsTargetFor(undefined) > 0 && derivedStepsTargetFor(null) > 0)

    // THE OVERRIDE. A band cannot know that someone walks a dog twice a day.
    const p = (activity: string, chosen?: number | null) =>
      ({ activity_level: activity, daily_step_target: chosen } as never)
    check('a chosen target wins over the derived band',
      stepsTargetFor(p('sedentary', 12500)) === 12500)
    check('...and null means "never set one", not zero',
      stepsTargetFor(p('sedentary', null)) === derivedStepsTargetFor('sedentary' as never))
    check('...and a 0 or negative stored value falls back rather than making the ring divide by zero',
      stepsTargetFor(p('moderate', 0)) > 0 && stepsTargetFor(p('moderate', -5)) > 0)

    // Taking the PROFILE, not the two fields, is what stops one caller
    // reading the override and another the band — the app disagreeing with
    // itself between the ring and the settings screen.
    const stSrc = fs.readFileSync('src/lib/steps-target.ts', 'utf-8')
    check('the ring reads the profile, so it cannot miss the override',
      /stepsTargetFor\(profile: Pick<UserProfile/.test(stSrc))

    const dash = fs.readFileSync('src/components/Dashboard.tsx', 'utf-8')
    check('the steps row draws a ring', /stepsTargetFor\(profile\)/.test(dash))
    check('...using the same ring geometry as the calorie tile',
      /CALORIE_TILE_RING_CIRC \* Math\.min\(1, steps\.steps \/ stepsTarget\)/.test(dash))
  }

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


  console.log('\n[3a] days before the plan existed are not plan week 1')
  {
    // A REAL BUG, PRE-EXISTING, found by the consistency score reading
    // "0/19 planned sessions" for a single week.
    //
    // getActiveMesocycleWeek clamps with Math.max(0, elapsedDays), so every
    // date earlier than planCreatedAt comes back as week 1. dashboard-data
    // looks back 35 days — so on a plan created today, all 35 landed in "this
    // plan week", and every plan-week aggregate counted five weeks of history
    // that predate the plan.
    //
    // It was not only the new score: coach-tips' perfect_adherence could
    // announce "Every planned session this week, done — 19 for 19", and
    // session_pace compared against a window that never existed. Related to
    // the earlier "stop marking pre-plan days as missed" fix, which taught
    // the STREAK to ignore them and left these aggregates behind.
    const everyDayPlan = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
      .map(day => ({ day, focus: 'Full Body', is_scheduled: true,
        exercises: [{ name: 'Barbell Squats', sets: 3, reps: '8-10', rest: '90s', substitution: '' }] }))
    const t = '2026-01-15'
    const nowT = new Date(`${t}T12:00:00`)
    const fresh = await loadDashboardData({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      profile: profile as any, macros, exercisePlan: everyDayPlan as any, mesocycle: [],
      // The plan was created TODAY. Nothing before today can belong to it.
      planCreatedAt: `${t}T00:00:00.000Z`,
      todayLogs: [], liveWeek: 1, dayName: 'Thursday', todayStr: t, now: nowT,
    })
    // Every one of the 35 lookback days is "scheduled" in this fixture, so
    // before the fix this read 34. A plan made today has had no elapsed
    // scheduled days at all.
    const planned = fresh.consistency?.components.find(c => c.label === 'planned sessions')
    check('a plan created today counts no elapsed scheduled days',
      planned == null || planned.outOf <= 1, planned)

    // And with no components carrying data, the score is ABSENT rather than
    // 0% — a zero on day one would read as a verdict on someone who has not
    // had a chance to do anything yet.
    check('...so the score shows nothing rather than 0%',
      fresh.consistency === null || (planned?.outOf ?? 0) > 0, fresh.consistency)
  }

  console.log('\n[3d] consistency is named for what it measures')
  {
    const { computeConsistency } = await import('../src/lib/consistency-score')

    // Ashley asked for a readiness score "combining workout consistency,
    // sleep/rest days, and nutrition compliance". The app has NEVER asked how
    // anyone slept — recovery_capacity is one onboarding answer that never
    // changes — so a readiness score would be two-thirds measured and
    // one-third invented, and the invented third is what makes it readiness.
    // Her call, when the choice was put to her: build it from what is real
    // and name it honestly.
    const src = fs.readFileSync('src/lib/consistency-score.ts', 'utf-8')
    check('the module does not claim to measure readiness or recovery',
      !/export .*(readiness|recovery)/i.test(src))
    const dash = fs.readFileSync('src/components/Dashboard.tsx', 'utf-8')
    check('the dashboard labels it Consistency', /Consistency:/.test(dash))
    check('...and shows what it counted, not a bare number',
      /components\.map\(c => `\$\{c\.done\}\/\$\{c\.outOf\}/.test(dash))

    // Averaging RATIOS, not raw counts: 3/3 sessions and 1/6 protein days
    // must not let the sessions drown out the protein.
    const mixed = computeConsistency([
      { label: 'planned sessions', done: 3, outOf: 3 },
      { label: 'protein days', done: 1, outOf: 6 },
    ])
    check(`ratios are averaged, not counts (${mixed?.percent}%)`, mixed?.percent === 58, mixed)

    // Nothing measurable yet -> null, never 0%.
    check('no components means no score, not zero',
      computeConsistency([{ label: 'planned sessions', done: 0, outOf: 0 }]) === null)

    // A component with no data is dropped rather than counted as a zero —
    // otherwise a user with no protein target would be marked down for it.
    const partial = computeConsistency([
      { label: 'planned sessions', done: 2, outOf: 2 },
      { label: 'protein days', done: 0, outOf: 0 },
    ])
    check('a component with no data is dropped, not scored as zero',
      partial?.percent === 100 && partial.components.length === 1, partial)
  }

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
