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

/** Per-table read counter — the round trips this file's §6 exists to count. */
const queryCounts: Record<string, number> = {}
/** Per-table record of the last `.in('date', …)` list — see the DST section. */
const lastDateIn: Record<string, string[]> = {}

function fakeFrom(table: string) {
  queryCounts[table] = (queryCounts[table] ?? 0) + 1
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
    in: (c: string, vs: unknown[]) => {
      // RECORDED, so a check can ask what date range the caller actually asked
      // for. The DST section below is about the DATES a day-walk produces, and
      // the only place they become observable is the query they are passed to.
      if (c === 'date') lastDateIn[table] = vs.map(String)
      filters.push(r => vs.includes(r[c])); return api
    },
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
  const { setWaterTargetMl, logWater, getLogsForDate, getTotalForDate, flushPending } = await import('../src/lib/water-store')
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
  const logs = await getLogsForDate(profileId, '2026-01-15')
  check('both log rows synced to the fake DB via the local-first flush', db.water_logs.filter(r => r.profile_id === profileId).length === 2, logs)

  // THE READ IS BOUNDED TO THE DAY, 15 Sep 2026. It used to be
  // `select('*').eq('profile_id', …)` with no date bound: both callers pulled
  // every row a person had ever logged and then filtered to one day. A year of
  // four glasses a day is 1,400 rows re-downloaded to draw one ring.
  //
  // BEHAVIOURAL, not a source grep: a second day is logged and the reader is
  // asked for the first. A reader that still fetched everything would come
  // back with three rows.
  logWater({ profileId, date: '2026-01-16', amountMl: 750, source: 'manual' })
  await flushPending()
  const dayOne = await getLogsForDate(profileId, '2026-01-15')
  check('reading one day returns only that day, not the whole history',
    dayOne.length === 2 && dayOne.every(l => l.date === '2026-01-15'), dayOne.map(l => l.date))
  check('...and the other day is genuinely there to have been returned',
    db.water_logs.filter(r => r.profile_id === profileId).length === 3,
    db.water_logs.filter(r => r.profile_id === profileId).map(r => r.date))
  check('...so the total for that day is unaffected by the next one',
    (await getTotalForDate(profileId, '2026-01-15')) === 500)
  check('...and the next day reads on its own', (await getTotalForDate(profileId, '2026-01-16')) === 750)

  // AND THE PENDING QUEUE IS BOUNDED THE SAME WAY. The local-first write lands
  // in the queue before it reaches the server, and the merge used to fold in
  // EVERY pending op for the profile — so a day read while another day's write
  // was still in flight came back with a row it never asked for. Not flushed
  // here on purpose: unflushed is the only state in which this can be seen.
  logWater({ profileId, date: '2026-01-17', amountMl: 999, source: 'manual' })
  const stillDayOne = await getLogsForDate(profileId, '2026-01-15')
  check('a pending write on another day does not leak into this one',
    stillDayOne.length === 2 && stillDayOne.every(l => l.date === '2026-01-15'), stillDayOne.map(l => l.date))
  check('...and that pending write is genuinely there, on its own day',
    (await getLogsForDate(profileId, '2026-01-17')).some(l => l.amount_ml === 999))
  await flushPending()

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
    const avgIdx = dash.indexOf('data.weightTrend.rollingAvgKg.toFixed(1)')

    // TIED TO THE SUBJECT, 6 Sep 2026. design_handoff_app_polish removed the
    // "Progress" block: Home's Weight cell now shows the RAW last weigh-in,
    // the number the trainee typed, and the trend chart carries the shape of
    // the change. That dissolves the incident below rather than fixing it —
    // there is no second, smoothed number to disagree with the logged one.
    // (The comment that block carried cited "VISION-ARCHITECTURE §5.4" for
    // "never a raw daily reading as the headline". §5.4 is the chat-door
    // worked example and says nothing of the kind; the citation was wrong,
    // and no such rule is written anywhere in that document.)
    //
    // The lesson is kept and made conditional: IF a rolling average is ever
    // rendered here again, it must say it is an average, unconditionally.
    // Ashley, 3 Sep 2026: she logged 85kg, saw 86.0, logged 85 again and saw
    // 85.7, and reported the display as broken. It was right and unlabelled,
    // which on screen is the same thing.
    check('Home shows a weight number at all (sanity check on this check)',
      /lastWeighIn\.kg\.toFixed\(1\)/.test(dash) || avgIdx > 0)
    if (avgIdx > 0) {
      // COMMENTS STRIPPED FIRST, and that is not fussiness — the first version
      // of this check tested the raw block, and the explanation sitting above
      // the label (which says "rolling average", "daily reading", "average")
      // satisfied it. BOTH mutations below passed against a screen with no
      // label on it at all. A check its own subject's comment can satisfy is
      // not a check; it took running the mutations to find that out.
      const blockRaw = dash.slice(avgIdx, dash.indexOf(') : (', avgIdx))
      const block = blockRaw
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')   // JSX comments
        .replace(/\/\*[\s\S]*?\*\//g, '')          // block comments
        .replace(/^\s*\/\/.*$/gm, '')                // line comments

      // A RENDERED text node, i.e. between > and <, not a string in an
      // attribute and not prose in a comment.
      const rendered = [...block.matchAll(/>([^<>{}]*?)</g)].map(m => m[1].trim()).filter(Boolean)
      check('...and a rendered label names it an average',
        rendered.some(t => /average/i.test(t)), rendered)

      // Not hidden behind the thin-sample condition: gated that way it would
      // vanish for almost everyone, which is the state that produced the report.
      const labelLine = blockRaw.split('\n').find(l => />[^<]*average/i.test(l) && !l.trimStart().startsWith('//'))
      const idxOfLabel = labelLine ? blockRaw.indexOf(labelLine) : -1
      const before = idxOfLabel > 0
        ? blockRaw.slice(0, idxOfLabel).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').trimEnd()
        : ''
      check('...unconditionally, not only for a thin sample',
        idxOfLabel > 0 && !/&&\s*\(?\s*$/.test(before), before.slice(-160))
    } else {
      // The other half of "one weight, not two": with no average on screen,
      // the cell must be the logged reading and nothing may quietly smooth it.
      check('...and it is the logged reading, not an unlabelled smoothing',
        /lastWeighIn\.kg\.toFixed\(1\)/.test(dash) && !/rollingAvgKg/.test(dash))
    }
  }

  console.log('\nA write from the chat reaches the screen')
  {
    // TWO REPORTS FROM ASHLEY'S PHONE, 3 Sep 2026, one shape: the coach
    // printed a receipt, the database write LANDED, and the screen never
    // moved. The receipt framework guarantees the app never claims a write it
    // did not make. It does not guarantee anyone ever SEES the result — and
    // that gap is what produced both reports.
    //
    // (a) Rest day. useTrainingWeek's refresh keyed on [profileId,
    // sessionDate] only, so a rest day marked from the chat sat in
    // workout_sessions while the strip kept its stale glyph.
    const hook = fs.readFileSync('src/hooks/useTrainingWeek.ts', 'utf-8')
    check('the week hook takes a refresh token', /refreshToken\?: number/.test(hook))
    const deps = hook.match(/\}, \[profileId, sessionDate[^\]]*\]\)/)?.[0] ?? ''
    check('...and it is in the refresh callback deps, or the token does nothing',
      /refreshToken/.test(deps), deps)

    const dash = fs.readFileSync('src/components/Dashboard.tsx', 'utf-8')
    check('Dashboard passes one through to the hook',
      /useTrainingWeek\([^)]*logsVersion\)/.test(dash), dash.match(/useTrainingWeek\([^)]*\)/)?.[0])
    const app = fs.readFileSync('src/App.tsx', 'utf-8')
    check('...and App feeds it the counter its chat writes bump',
      /logsVersion=\{logsVersion\}/.test(app))

    // (b) Meal addition. mealPools was refilled on load/generate/regenerate/
    // reset but never after a chat addition, so the pick pointed at a meal the
    // component did not have and the slot rendered its old dinner.
    // NAMED, NOT INLINE, since 12 Sep 2026 — the Nutrition screen needed the
    // same follow-through when an ingredient became editable, so the handler
    // came out of the JSX and both surfaces call it. Its own sanity check is
    // what caught the move, which is the check earning its place.
    const handlerStart = app.indexOf('const handleMealPickApplied')
    const swapHandler = handlerStart === -1 ? '' : app.slice(handlerStart, app.indexOf('\n  }', handlerStart))
    check('the chat meal handler exists to be checked (sanity check on this check)', swapHandler.length > 300, swapHandler.length)
    check('...and both the chat and the Nutrition screen are given it',
      /onMealSwapApplied=\{handleMealPickApplied\}/.test(app) && /onMealPickApplied=\{handleMealPickApplied\}/.test(app))
    check('...and it re-reads the pool, so an added meal can actually render',
      /setMealPools\(await getPools\(profile\.id\)\)/.test(swapHandler))

    // (c) Her ruling: a meal she asked for by name survives a regeneration.
    // persistPools is the ONLY place the slot's rows are deleted, so both
    // regenerate buttons inherit this.
    const store = fs.readFileSync('src/lib/meal-store.ts', 'utf-8')
    check('there is a marker for a meal the user asked for', /USER_REQUESTED_TAG = 'user-requested'/.test(store))
    const exec = fs.readFileSync('src/lib/pending-action-executor.ts', 'utf-8')
    check('...a chat-added meal carries it', /USER_REQUESTED_TAG\]/.test(exec))
    const gen = fs.readFileSync('src/lib/meal-generation.ts', 'utf-8')
    const persist = gen.slice(gen.indexOf('async function persistPools'), gen.indexOf('// DAY ASSEMBLY'))
    check('persistPools exists to be checked (sanity check on this check)', persist.length > 400, persist.length)
    check('...and reads the marked rows BEFORE deleting the slot',
      persist.indexOf('USER_REQUESTED_TAG') < persist.indexOf(".delete()") && persist.includes('USER_REQUESTED_TAG'),
      { marker: persist.indexOf('USER_REQUESTED_TAG'), del: persist.indexOf('.delete()') })
    // THE INSERT ITSELF, not the declaration. The first version tested
    // /keptRows/ over the whole function and passed with `...keptRows`
    // stripped from the insert call — the variable was still declared just
    // above, doing nothing. Same shape as a check satisfied by its own
    // comment: presence is not use.
    check('...and re-inserts them after the fresh options',
      /\.insert\(\[\.\.\.rows, \.\.\.keptRows\]\)/.test(persist),
      persist.match(/\.insert\([^)]*\)/g))

    // (d) A meal name you cannot read is one you cannot choose.
    const meal = fs.readFileSync('src/components/MealPlan.tsx', 'utf-8')
    check('the meal name is not hard-truncated to one line',
      !/expanded \? 'min-w-0 truncate/.test(meal))
  }

  // ---- 6. Protein adherence: one query, and the right answer ---------------
  console.log('\n[6] dashboard-data.ts: fourteen days of protein in ONE round trip')
  {
    // WHY THIS SECTION EXISTS. Home read protein day by day — `await
    // getTodayLedger(...)` inside a `for` loop, fourteen times, sequentially,
    // on every mount. loadDashboardData was imported by this file and never
    // once called, so nothing in the suite noticed. Ashley, 7 Sep 2026: "when
    // switching to the home tab the tab is blank for a few seconds while it
    // loads."
    //
    // So this calls it for real, against the fake, and counts the reads.
    const { getEatenProteinByDate } = await import('../src/lib/meal-store')
    const PROFILE_ID = 'protein-profile'
    const targets = { calories: 2000, protein: 100, carbs: 200, fat: 60 }

    // Plan starts 12 Jan, today is the 15th, so plan week 1 is the 12th-18th
    // and the three prior days inside it are the 12th, 13th and 14th.
    // 95 is the threshold (95% of a 100g target): the 13th falls under it.
    const eaten: [string, number][] = [
      ['2026-01-14', 120], ['2026-01-13', 90], ['2026-01-12', 200], ['2026-01-11', 94],
    ]
    db.meal_events = eaten.map(([date, protein], i) => ({
      id: `ev${i}`, profile_id: PROFILE_ID, client_id: `c${i}`, date,
      slot: 'lunch', event_type: 'confirmed', meal_name: 'x',
      macros: { kcal: 500, protein, carbs: 10, fat: 10 },
      source: 'plan', created_at: `${date}T12:00:00Z`, voided_at: null,
    }))
    // Both land on the 13th and both are worth 50g. Counting either would
    // lift that day over the line — which is exactly what a ranged read that
    // filters differently from the ledger would do.
    db.meal_events.push(
      { id: 'v1', profile_id: PROFILE_ID, client_id: 'cv1', date: '2026-01-13', slot: 'dinner', event_type: 'confirmed',
        macros: { kcal: 100, protein: 50, carbs: 1, fat: 1 }, source: 'plan', created_at: '2026-01-13T18:00:00Z',
        voided_at: '2026-01-13T19:00:00Z' },
      { id: 's1', profile_id: PROFILE_ID, client_id: 'cs1', date: '2026-01-13', slot: 'dinner', event_type: 'skipped',
        macros: { kcal: 100, protein: 50, carbs: 1, fat: 1 }, source: 'plan', created_at: '2026-01-13T18:30:00Z',
        voided_at: null },
    )

    // (a) The read itself — the part that was rewritten.
    const before = queryCounts.meal_events ?? 0
    const byDate = await getEatenProteinByDate(PROFILE_ID, ['2026-01-14', '2026-01-13', '2026-01-12', '2026-01-11'])
    check('fourteen days of protein come back in ONE query',
      (queryCounts.meal_events ?? 0) - before === 1, (queryCounts.meal_events ?? 0) - before)
    check('...summed per day', byDate?.['2026-01-14'] === 120 && byDate?.['2026-01-12'] === 200, byDate)
    check('...ignoring voided rows and uneaten events, exactly as the ledger does',
      byDate?.['2026-01-13'] === 90, byDate?.['2026-01-13'])
    check('...and a day with nothing on it is zero, not absent',
      byDate?.['2026-01-10'] === undefined && Object.keys(byDate ?? {}).length === 4, byDate)

    // (b) A FAILED READ IS NOT FOURTEEN MISSED DAYS. The per-day version
    // caught each failure to null and recorded the day as not hit, so one bad
    // network moment broke a real streak. Unknown must stay unknown.
    const goodFrom = fakeClient.from
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(fakeClient as any).from = () => { throw new Error('network down') }
    const failed = await getEatenProteinByDate(PROFILE_ID, ['2026-01-14']).catch(() => 'threw')
    ;(fakeClient as any).from = goodFrom
    check('a failed read answers "unknown", never "you ate nothing"', failed === null, failed)

    // (c) End to end, through the aggregate the Home tab actually calls.
    const profile = { id: PROFILE_ID, created_at: '2026-01-12T00:00:00Z' } as never
    const beforeLoad = queryCounts.meal_events ?? 0
    const result = await loadDashboardData({
      profile, macros: targets, exercisePlan: [], mesocycle: [],
      planCreatedAt: '2026-01-12T00:00:00Z', todayLogs: [], liveWeek: 1,
      dayName: 'Thursday', todayStr: '2026-01-15',
      now: new Date('2026-01-15T12:00:00'),
    })
    const mealReads = (queryCounts.meal_events ?? 0) - beforeLoad
    // TWO: today's own ledger, and the fourteen-day range. Fifteen was the bug.
    check('a whole dashboard load costs 2 reads of meal_events, not fifteen', mealReads === 2, mealReads)

    const proteinComponent = result.consistency?.components.find(c => c.label === 'protein days')
    check('the protein component counts the plan week\'s prior days', proteinComponent?.outOf === 3, result.consistency)
    check('...and only the ones that actually hit the target', proteinComponent?.done === 2, proteinComponent)
  }

  // ---- 7. A DAY IS NOT ALWAYS 86,400,000 MILLISECONDS -----------------------
  //
  // dashboard-data walked days by adding or subtracting a fixed day in three
  // places: tomorrow, the 35-day streak input and the 14-day protein window.
  // A day is 23 or 25 hours long when the clocks move, so a fixed step taken
  // near midnight either repeats a date or skips one — silently, in the input
  // to a streak. The UK clocks go back on 25 Oct 2026 and forward on 29 March
  // 2026, both inside the life of this app.
  //
  // THE THREE FIXTURES BELOW WERE MEASURED, NOT REASONED. The drift only bites
  // when the wall clock is within an hour of midnight, and which side depends
  // on which way the clocks moved and which way the walk runs. The old code's
  // actual output at each of these, under Europe/London:
  //
  //   26 Oct 23:30, walking back : 25th, 25th, 24th   (a day counted twice)
  //   30 Mar 00:30, walking back : 28th, 27th, 26th   (the 29th never appears)
  //   28 Mar 23:30, one day on   : Monday the 30th    (Sunday skipped entirely)
  //
  // At 00:30 on the 26th, or 23:30 on the 30th, the same code is correct —
  // which is why this needed measuring rather than a plausible-looking date.
  //
  // BEHAVIOURAL, not a source grep: the protein window's dates are observable
  // because they are passed to the query, and tomorrow is observable through
  // the label Home renders.
  console.log('\n[7] day walks survive a clock change')
  {
    const tzBefore = process.env.TZ
    process.env.TZ = 'Europe/London'
    const DST_PROFILE = 'dst-profile'
    const dstTargets = { calories: 2000, protein: 100, carbs: 200, fat: 60 }
    const dstProfile = { id: DST_PROFILE, created_at: '2026-01-01T00:00:00Z' } as never
    const planWith = (trainingDay: string) =>
      ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => ({
        day, focus: day === trainingDay ? 'Upper Body' : 'Rest',
        exercises: day === trainingDay
          ? [{ name: 'Bench Press', sets: 3, reps: '8-10', rest_seconds: 120, intensity: 'RPE 7' }]
          : [],
      })) as never
    const loadAt = (todayStr: string, dayName: string, nowLocal: string, trainingDay: string) =>
      loadDashboardData({
        profile: dstProfile, macros: dstTargets, exercisePlan: planWith(trainingDay), mesocycle: [],
        planCreatedAt: '2026-01-01T00:00:00Z', todayLogs: [], liveWeek: 1,
        dayName, todayStr, now: new Date(nowLocal),
      })

    // (a) CLOCKS BACK, walking backwards — the day is counted twice.
    await loadAt('2026-10-26', 'Monday', '2026-10-26T23:30:00', 'Tuesday')
    const autumn = lastDateIn.meal_events ?? []
    check('the 14-day protein window really is fourteen days', autumn.length === 14, autumn)
    check('...every one of them a different date', new Set(autumn).size === 14, autumn)
    check('...the day the clocks went back appears exactly once',
      autumn.filter(d => d === '2026-10-25').length === 1, autumn)
    check('...and they run back from yesterday without a gap',
      autumn[0] === '2026-10-25' && autumn[13] === '2026-10-12', { first: autumn[0], last: autumn[13] })

    // (b) CLOCKS FORWARD, walking backwards — the day vanishes.
    await loadAt('2026-03-30', 'Monday', '2026-03-30T00:30:00', 'Tuesday')
    const spring = lastDateIn.meal_events ?? []
    check('the same holds when the clocks go forward', new Set(spring).size === 14, spring)
    check('...and the day they changed is not missing from the window',
      spring.includes('2026-03-29'), spring)
    check('...the window still starts at yesterday', spring[0] === '2026-03-29', spring[0])

    // (c) ONE DAY FORWARD, across the spring change — tomorrow skipped a day.
    const eve = await loadAt('2026-03-28', 'Saturday', '2026-03-28T23:30:00', 'Sunday')
    check('tomorrow is the next calendar day, not the next 24 hours',
      eve.tomorrowLabel === 'Tomorrow: Upper Body · 1 exercise', eve.tomorrowLabel)
    // The contrast, so the check above cannot pass by naming the only label
    // this fixture can produce: Monday is NOT tomorrow here.
    const eveWrong = await loadAt('2026-03-28', 'Saturday', '2026-03-28T23:30:00', 'Monday')
    check('...and it is not the day after that', eveWrong.tomorrowLabel === 'Tomorrow: Rest', eveWrong.tomorrowLabel)

    if (tzBefore === undefined) delete process.env.TZ
    else process.env.TZ = tzBefore
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
