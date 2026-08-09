/**
 * M0/M1 Part 7 — meal foundation + meal generation round-trip integration
 * test.
 *
 * Same harness philosophy as test-logging-roundtrip.ts: an in-memory fake
 * Supabase (matching meal_events' unique partial index on client_id,
 * daily_metrics' (profile_id, date) constraint, and meal_plan_slots' plain
 * insert/delete/select shape) plus a localStorage shim, injected via
 * setSupabaseClient(). Covers:
 *
 *   1. Living targets: a daily_metrics weigh-in CHANGES computed targets
 *      (weight sensitivity), and no weigh-in falls back to onboarding weight
 *   2. The sex-differentiated calorie floor (1500 male / 1200 female)
 *   3. Static-mode consistency fix: calories === P*4 + C*4 + F*9 exactly,
 *      including when the carb floor / calorie rail engages
 *   4. Ledger arithmetic: confirmed + swapped_in + extra count as eaten,
 *      skipped adds zero; remaining = targets − eaten (negatives allowed)
 *   5. Event idempotency via client_id: a duplicate flush of the same event
 *      cannot create a second row (23505 treated as already-synced)
 *   6. Poison-pill safety: a permanently-rejected event dead-letters without
 *      blocking later events
 *   7. (M1) Full pool round trip: a verified proposal persists into
 *      meal_plan_slots, getPools reads it back, swapPoolMeal swaps — and
 *      (vision-architecture patch round, fix 5) does NOT touch the ledger;
 *      swapping which pool option is assigned is a plan-state change, not
 *      a consumption event
 *   8. (M1) Vegan fixture: a meat-containing AI proposal is rejected by the
 *      verification pipeline before it ever reaches persistence
 *   9. (M1) Scaler convergence: scaleToTarget lands a mis-portioned proposal
 *      within tolerance, and rejects rather than forces an absurd factor
 */

// --- Environment shims (before importing any lib modules) -------------------

const storeMap = new Map<string, string>()
const localStorageShim = {
  getItem: (k: string) => storeMap.get(k) ?? null,
  setItem: (k: string, v: string) => { storeMap.set(k, String(v)) },
  removeItem: (k: string) => { storeMap.delete(k) },
  clear: () => { storeMap.clear() },
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageShim, configurable: true })

const navShim = { onLine: true }
Object.defineProperty(globalThis, 'navigator', { value: navShim, configurable: true })

// --- Fake Supabase ----------------------------------------------------------

type Row = Record<string, unknown>

const UNIQUES: Record<string, string[][]> = {
  meal_events: [['client_id']],
  daily_metrics: [['profile_id', 'date']],
  daily_nutrition_targets: [['profile_id', 'date']],
}

const VALID_EVENT_TYPES = new Set(['confirmed', 'swapped_in', 'extra', 'skipped'])

const db: Record<string, Row[]> = { meal_events: [], daily_metrics: [], daily_nutrition_targets: [], meal_plan_slots: [] }

function cmp(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

function uniqueViolation(table: string, row: Row, ignoreRow?: Row): boolean {
  for (const cols of UNIQUES[table] ?? []) {
    // meal_events.client_id is a PARTIAL unique index (WHERE client_id IS
    // NOT NULL) — null client_ids never clash, same as exercise_set_logs.
    if (cols.length === 1 && cols[0] === 'client_id' && row.client_id == null) continue
    const clash = db[table].find(r => r !== ignoreRow && cols.every(c => r[c] === row[c]))
    if (clash) return true
  }
  return false
}

function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  const orders: [string, boolean][] = []
  let limitN: number | null = null
  let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select'
  let payload: Row[] = []
  let onConflict: string[] | null = null
  let updateObj: Row | null = null
  let single = false

  // Mirrors meal_events' CHECK (event_type IN (...)) — a real Postgres
  // check_violation is 23514, which meal-store must classify as PERMANENT
  // and dead-letter rather than retry forever.
  const checkViolation = (row: Row): boolean =>
    table === 'meal_events' && row.event_type != null && !VALID_EVENT_TYPES.has(String(row.event_type))

  const exec = (): { data: unknown; error: { code?: string; message: string } | null } => {
    if (op === 'insert') {
      const inserted: Row[] = []
      for (const raw of payload) {
        const row: Row = { id: crypto.randomUUID(), created_at: raw.created_at ?? new Date().toISOString(), ...raw }
        if (checkViolation(row)) return { data: null, error: { code: '23514', message: 'new row violates check constraint "meal_events_event_type_check"' } }
        if (uniqueViolation(table, row)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
        db[table].push(row)
        inserted.push(row)
      }
      return { data: single ? inserted[0] ?? null : inserted, error: null }
    }
    if (op === 'upsert') {
      for (const raw of payload) {
        const existing = onConflict ? db[table].find(r => onConflict!.every(c => r[c] === raw[c])) : undefined
        if (existing) {
          Object.assign(existing, raw)
        } else {
          const row: Row = { id: crypto.randomUUID(), ...raw }
          if (uniqueViolation(table, row)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
          db[table].push(row)
        }
      }
      const found = onConflict ? db[table].find(r => onConflict!.every(c => r[c] === payload[0][c])) : null
      return { data: single ? (found ? { ...found } : null) : null, error: null }
    }
    if (op === 'update') {
      for (const r of db[table]) if (filters.every(f => f(r))) Object.assign(r, updateObj)
      return { data: null, error: null }
    }
    if (op === 'delete') {
      db[table] = db[table].filter(r => !filters.every(f => f(r)))
      return { data: null, error: null }
    }
    let rows = db[table].filter(r => filters.every(f => f(r)))
    for (const [col, asc] of [...orders].reverse()) {
      rows = [...rows].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]))
    }
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
    // Postgrest's .is(col, null) — rows never insert with the column set, so
    // undefined and null both count as "unset" (real Postgres has no such
    // ambiguity; this fake's rows just don't always carry every column).
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
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures++
    console.error(`  FAIL: ${label}${extra !== undefined ? ` — got ${JSON.stringify(extra)}` : ''}`)
  }
}

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient(fakeClient as any)

  const { computeTargets, getLatestWeightKg } = await import('../src/lib/nutrition-targets')
  const { recordMealEvent, flushPending, getTodayLedger, getDeadLetterCount } = await import('../src/lib/meal-store')
  const { upsertDailyMetric } = await import('../src/lib/daily-tracking')
  const { getStaticDailyMacros } = await import('../src/lib/macro-calculator')
  type UserProfile = import('../src/lib/types').UserProfile

  const PROFILE_ID = 'meal-test-profile'
  const TODAY = new Date().toISOString().split('T')[0]

  const baseProfile: UserProfile = {
    id: PROFILE_ID,
    age: 37, gender: 'male', height_cm: 178, weight_kg: 87,
    activity_level: 'moderate', fitness_goal: 'fat_loss',
    training_days: [], preferred_time: 'morning', dietary_preferences: [],
    session_duration_preference: '60-90', workout_split_preference: 'ai_recommendation',
    macro_calculation_mode: 'STANDARD_STATIC', equipment_access: 'full_gym',
    training_style: 'bodybuilding', training_experience: 'advanced',
    coaching_persona: 'analytical', injuries: [],
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  }

  // -------------------------------------------------------------------------
  console.log('\n[1] Living targets: weigh-ins change targets; none falls back to onboarding weight')
  const noWeighIn = computeTargets(baseProfile)
  check('no weigh-in: protein anchors to onboarding 87kg (2.0 g/kg = 174g)', noWeighIn.protein === 174, noWeighIn)

  await upsertDailyMetric({ profile_id: PROFILE_ID, date: TODAY, weight_kg: 80 })
  const latest = await getLatestWeightKg(PROFILE_ID)
  check('getLatestWeightKg reads the weigh-in back', latest === 80, latest)

  const withWeighIn = computeTargets(baseProfile, { latestWeightKg: latest })
  check('weigh-in overrides onboarding weight (protein 2.0 x 80 = 160g)', withWeighIn.protein === 160, withWeighIn)
  check('weight change changes calories too', withWeighIn.calories !== noWeighIn.calories, { before: noWeighIn.calories, after: withWeighIn.calories })

  // A second weigh-in the same day overwrites, not duplicates
  await upsertDailyMetric({ profile_id: PROFILE_ID, date: TODAY, weight_kg: 79.5 })
  const latest2 = await getLatestWeightKg(PROFILE_ID)
  check('same-day re-weigh overwrites (79.5 replaces 80)', latest2 === 79.5, latest2)

  // -------------------------------------------------------------------------
  console.log('\n[2] Sex-differentiated calorie floor (1500 male / 1200 female)')
  // A small sedentary profile whose TDEE - 500 lands far below both floors.
  const smallMale: UserProfile = { ...baseProfile, gender: 'male', age: 70, height_cm: 150, weight_kg: 45, activity_level: 'sedentary' }
  const smallFemale: UserProfile = { ...smallMale, gender: 'female' }
  const maleT = getStaticDailyMacros(smallMale)
  const femaleT = getStaticDailyMacros(smallFemale)
  // The floor applies to the pre-allocation calorie target; the final number
  // is the macro sum, which can sit slightly above the floor (carb floor).
  check('male floor: calories never below 1500-derived allocation', maleT.calories >= 1500 - 25, maleT)
  check('female floor: calories can go below 1500 but not below ~1200', femaleT.calories >= 1200 - 25 && femaleT.calories < maleT.calories, femaleT)

  // -------------------------------------------------------------------------
  console.log('\n[3] Static-mode consistency: calories === P*4 + C*4 + F*9 exactly')
  for (const [label, p] of [
    ['standard fat-loss profile', baseProfile],
    ['floor-engaged small male', smallMale],
    ['floor-engaged small female', smallFemale],
    ['conditioning goal', { ...baseProfile, fitness_goal: 'conditioning' } as UserProfile],
  ] as const) {
    const t = getStaticDailyMacros(p)
    const sum = t.protein * 4 + t.carbs * 4 + t.fat * 9
    check(`${label}: calories (${t.calories}) === macro sum (${sum})`, t.calories === sum, t)
  }

  // -------------------------------------------------------------------------
  console.log('\n[4] Ledger arithmetic: eaten = confirmed + swapped_in + extra; skipped adds zero')
  const targets = computeTargets(baseProfile, { latestWeightKg: latest2 })

  recordMealEvent({ profileId: PROFILE_ID, date: TODAY, slot: 'breakfast', eventType: 'confirmed', mealName: 'Planned Breakfast', macros: { kcal: 500, protein: 40, carbs: 50, fat: 15 }, source: 'plan' })
  recordMealEvent({ profileId: PROFILE_ID, date: TODAY, slot: 'lunch', eventType: 'swapped_in', mealName: 'Chicken Wrap', macros: { kcal: 650, protein: 45, carbs: 60, fat: 22 }, source: 'chat' })
  recordMealEvent({ profileId: PROFILE_ID, date: TODAY, slot: null, eventType: 'extra', mealName: 'Flat White', macros: { kcal: 120, protein: 6, carbs: 9, fat: 6 }, source: 'chat' })
  recordMealEvent({ profileId: PROFILE_ID, date: TODAY, slot: 'snack', eventType: 'skipped', mealName: 'Planned Snack', macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, source: 'plan' })
  await flushPending()

  const ledger = await getTodayLedger(PROFILE_ID, TODAY, targets)
  check('all four events present', ledger.events.length === 4, ledger.events.length)
  check('eaten kcal = 500 + 650 + 120 (skipped adds zero)', ledger.eaten.kcal === 1270, ledger.eaten)
  check('eaten protein = 40 + 45 + 6', ledger.eaten.protein === 91, ledger.eaten)
  check('remaining kcal = targets − eaten', ledger.remaining.kcal === targets.calories - 1270, ledger.remaining)
  check('remaining protein = targets − eaten', ledger.remaining.protein === targets.protein - 91, ledger.remaining)

  // Overshoot stays honest (negative remaining, never clamped)
  recordMealEvent({ profileId: PROFILE_ID, date: TODAY, slot: null, eventType: 'extra', mealName: 'Massive Pizza', macros: { kcal: 3000, protein: 90, carbs: 300, fat: 130 }, source: 'manual' })
  await flushPending()
  const overshoot = await getTodayLedger(PROFILE_ID, TODAY, targets)
  check('overshoot yields NEGATIVE remaining (not clamped)', overshoot.remaining.kcal < 0, overshoot.remaining)

  // -------------------------------------------------------------------------
  console.log('\n[5] client_id idempotency: duplicate flush cannot create a second row')
  const before = db.meal_events.length
  const evt = recordMealEvent({ profileId: PROFILE_ID, date: TODAY, slot: 'dinner', eventType: 'confirmed', mealName: 'Dinner', macros: { kcal: 700, protein: 50, carbs: 70, fat: 20 }, source: 'plan' })
  await flushPending()
  // Simulate a retry of an already-synced op: re-queue the SAME clientId
  // (as a crashed-before-dequeue client would) and flush again.
  const pendingRaw = JSON.parse(storeMap.get('fitplan_mealevent_pending_v1') ?? '[]')
  pendingRaw.push({ ...evt, attempts: 0 })
  storeMap.set('fitplan_mealevent_pending_v1', JSON.stringify(pendingRaw))
  await flushPending()
  const after = db.meal_events.length
  check('exactly one new row despite double-flush of the same client_id', after === before + 1, { before, after })
  const pendingLeft = JSON.parse(storeMap.get('fitplan_mealevent_pending_v1') ?? '[]')
  check('duplicate op drained from the queue (23505 treated as synced)', pendingLeft.length === 0, pendingLeft)

  // -------------------------------------------------------------------------
  console.log('\n[6] Poison-pill safety: a permanently-rejected event dead-letters without blocking')
  const deadBefore = getDeadLetterCount()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordMealEvent({ profileId: PROFILE_ID, date: TODAY, slot: null, eventType: 'not_a_real_type' as any, mealName: 'Poison', macros: { kcal: 1, protein: 0, carbs: 0, fat: 0 }, source: 'manual' })
  const good = recordMealEvent({ profileId: PROFILE_ID, date: TODAY, slot: null, eventType: 'extra', mealName: 'After Poison', macros: { kcal: 200, protein: 10, carbs: 20, fat: 8 }, source: 'manual' })
  await flushPending()
  check('poison event dead-lettered (23514 check violation = permanent)', getDeadLetterCount() === deadBefore + 1, getDeadLetterCount())
  check('the GOOD event behind it still synced', db.meal_events.some(r => r.client_id === good.clientId), undefined)
  const pendingAfterPoison = JSON.parse(storeMap.get('fitplan_mealevent_pending_v1') ?? '[]')
  check('queue fully drained (nothing stuck behind the poison row)', pendingAfterPoison.length === 0, pendingAfterPoison)

  // -------------------------------------------------------------------------
  console.log('\n[7] Full pool round trip: generation -> persistence -> pool read -> swap (no ledger event)')
  {
    const { verifyProposal, computeSlotBudgets } = await import('../src/lib/meal-generation')
    const { getPools, swapPoolMeal } = await import('../src/lib/meal-store')

    const targets = getStaticDailyMacros(baseProfile)
    const lunchBudget = computeSlotBudgets(targets, 3, false).lunch!

    const proposalA = {
      slot: 'lunch', name: 'Verified Chicken Rice Bowl',
      ingredients: ['200g chicken breast', '220g cooked basmati rice', '1 tbsp olive oil', '100g broccoli'],
      prep: '20 min', cuisine: 'Other',
    }
    const proposalB = {
      slot: 'lunch', name: 'Verified Salmon Bowl',
      // Protein-dense on purpose (salmon-heavy, rice-light): the pipeline's
      // post-scale protein floor is strict, and a proposal whose unscaled
      // protein:calorie ratio sits below the budget's ratio can miss the
      // floor even at a perfectly sane scale factor (a prior version of this
      // fixture — 180g salmon / 200g rice — did exactly that in testing).
      ingredients: ['300g salmon', '80g cooked basmati rice', '100g broccoli'],
      prep: '20 min', cuisine: 'Other',
    }
    const rejectLog: string[] = []
    const optionA = verifyProposal(proposalA, 'lunch', lunchBudget, [], rejectLog)
    const optionB = verifyProposal(proposalB, 'lunch', lunchBudget, [], rejectLog)
    check('both proposals verified and accepted', optionA !== null && optionB !== null, rejectLog)

    // Persist exactly like meal-generation.ts's persistPools does.
    await fakeClient.from('meal_plan_slots').delete().eq('profile_id', PROFILE_ID).eq('slot', 'lunch')
    const rows = [optionA!, optionB!].map((opt, i) => ({
      profile_id: PROFILE_ID, slot: 'lunch', pool_index: i, name: opt.name, ingredients: opt.ingredients,
      macros: { kcal: opt.macros.calories, protein: opt.macros.protein, carbs: opt.macros.carbs, fat: opt.macros.fat },
      tags: opt.tags,
    }))
    await fakeClient.from('meal_plan_slots').insert(rows)

    const pools = await getPools(PROFILE_ID)
    check('getPools reads both persisted options back, ordered by pool_index', pools.lunch?.length === 2 && pools.lunch[0].name === optionA!.name, pools.lunch)

    const ledgerBefore = await getTodayLedger(PROFILE_ID, TODAY, targets)
    const eventCountBefore = ledgerBefore.events.length
    const eatenBefore = ledgerBefore.eaten

    const swapped = await swapPoolMeal(PROFILE_ID, 'lunch', optionA!.name, undefined)
    check('swapPoolMeal returns the OTHER pool option', swapped?.name === optionB!.name, swapped)

    await flushPending()
    const poolLedger = await getTodayLedger(PROFILE_ID, TODAY, targets)
    check('the swap recorded no ledger event at all', poolLedger.events.length === eventCountBefore, poolLedger.events)
    check('getTodayLedger eaten totals are unaffected by the swap', JSON.stringify(poolLedger.eaten) === JSON.stringify(eatenBefore), poolLedger.eaten)
  }

  // -------------------------------------------------------------------------
  console.log('\n[8] Vegan fixture: a meat-containing AI proposal is rejected before persistence')
  {
    const { verifyProposal, computeSlotBudgets } = await import('../src/lib/meal-generation')
    const targets = getStaticDailyMacros(baseProfile)
    const dinnerBudget = computeSlotBudgets(targets, 3, false).dinner!

    // A mocked generator response — exactly the shape generate-meals returns,
    // with no network call involved. Chicken makes this an automatic vegan
    // violation regardless of how well it hits the macro budget.
    const meatProposal = {
      slot: 'dinner', name: 'Herb-Roasted Chicken Thigh with Rice',
      ingredients: ['220g chicken thigh', '200g cooked basmati rice', '100g green beans'],
      prep: '25 min', cuisine: 'Other',
    }
    const rejectLog: string[] = []
    const result = verifyProposal(meatProposal, 'dinner', dinnerBudget, ['vegan'], rejectLog)
    check('meat proposal against vegan prefs is rejected (null, not persisted)', result === null, result)
    check('rejection log names the diet violation', rejectLog.some(l => l.includes('vegan') && l.includes('contains_meat')), rejectLog)

    // The same proposal, unrestricted, must NOT be rejected by diet rules —
    // confirms the vegan case above is the diet check firing, not some other
    // unrelated failure (e.g. coverage) masking the real signal.
    const unrestrictedLog: string[] = []
    const unrestrictedResult = verifyProposal(meatProposal, 'dinner', dinnerBudget, [], unrestrictedLog)
    check('the SAME proposal with no dietary restriction is not diet-rejected', unrestrictedLog.every(l => !l.includes('diet violation')), unrestrictedLog)
  }

  // -------------------------------------------------------------------------
  console.log('\n[9] Scaler convergence: within-tolerance scaling succeeds, absurd factors are rejected')
  {
    const { parseIngredientLines } = await import('../src/lib/portion-scaler')
    const { scaleToTarget, isWithinCalorieTolerance, meetsProteinFloor, computeScaleFactor, isScaleFactorAbsurd, CALORIE_TOLERANCE } = await import('../src/lib/portion-scaler')
    const { computeMealMacros } = await import('../src/lib/food-db')

    // Moderately oversized proposal (~20% over target) — a sane scale should converge.
    const parsed = parseIngredientLines(['250g chicken breast', '260g cooked basmati rice', '1 tbsp olive oil'])
    const actual = computeMealMacros(parsed)
    const target = { kcal: Math.round(actual.kcal * 0.83), protein: Math.round(actual.protein * 0.83) - 2, carbs: Math.round(actual.carbs * 0.83), fat: Math.round(actual.fat * 0.83) }
    const scaled = scaleToTarget(parsed, { kcal: actual.kcal, protein: actual.protein, carbs: actual.carbs, fat: actual.fat }, target)
    check('a moderate scale is not rejected as absurd', scaled.rejectedReason === undefined, scaled.rejectedReason)
    const recomputed = computeMealMacros(scaled.ingredients)
    check(`scaled result lands within +/-${CALORIE_TOLERANCE * 100}% of target calories`, isWithinCalorieTolerance(recomputed.kcal, target.kcal), { got: recomputed.kcal, target: target.kcal })
    check('scaled result meets the protein floor', meetsProteinFloor(recomputed.protein, target.protein), { got: recomputed.protein, target: target.protein })

    // Absurd case: target is a fraction of what the proposal could plausibly become.
    const tinyTarget = { kcal: Math.round(actual.kcal * 0.2), protein: 5, carbs: 5, fat: 2 }
    const absurdScale = computeScaleFactor(actual.kcal, tinyTarget.kcal)
    check('a 5x-undershoot scale factor is flagged absurd', isScaleFactorAbsurd(absurdScale), absurdScale)
    const absurdResult = scaleToTarget(parsed, { kcal: actual.kcal, protein: actual.protein, carbs: actual.carbs, fat: actual.fat }, tinyTarget)
    check('scaleToTarget rejects rather than forcing the absurd factor', absurdResult.rejectedReason !== undefined, absurdResult.rejectedReason)
  }

  // -------------------------------------------------------------------------
  console.log('\n[10] logMealEaten (turn 7 "Log this meal") + its undo')
  {
    const { logMealEaten, voidMealEvent } = await import('../src/lib/meal-store')
    const day = '2099-01-01' // isolated date, deliberately far from any real "today" so this block's totals don't mix with [4]/[5]'s TODAY-scoped events
    const preTargets = computeTargets(baseProfile, { latestWeightKg: latest2 })

    const beforeLedger = await getTodayLedger(PROFILE_ID, day, preTargets)
    check('no events logged yet for this isolated date', beforeLedger.events.length === 0, beforeLedger.events)

    const logged = logMealEaten(PROFILE_ID, day, 'breakfast', 'Oat Bowl', { kcal: 420, protein: 28, carbs: 55, fat: 10 })
    await flushPending()
    const afterLog = await getTodayLedger(PROFILE_ID, day, preTargets)
    check('logMealEaten lands as a confirmed event the ledger counts', afterLog.eaten.kcal === 420 && afterLog.eaten.protein === 28, afterLog.eaten)
    check('the logged event carries the slot/name it was given', afterLog.events.some(e => e.slot === 'breakfast' && e.mealName === 'Oat Bowl' && e.eventType === 'confirmed'), afterLog.events)

    await voidMealEvent(logged.clientId)
    const afterUndo = await getTodayLedger(PROFILE_ID, day, preTargets)
    check('undo (voidMealEvent) removes it from the ledger sum', afterUndo.eaten.kcal === 0 && afterUndo.eaten.protein === 0, afterUndo.eaten)
    check('the voided row is excluded, not counted twice', afterUndo.events.every(e => e.eventType !== 'confirmed' || e.mealName !== 'Oat Bowl'), afterUndo.events)
  }

  // -------------------------------------------------------------------------
  if (failures > 0) {
    console.error(`\n${failures} meal round-trip check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll meal round-trip checks passed.')
}

main().catch(err => {
  console.error('Test harness crashed:', err)
  process.exit(1)
})
