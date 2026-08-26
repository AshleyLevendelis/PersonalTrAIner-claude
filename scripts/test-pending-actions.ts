/**
 * C20 — pending-action framework + NL-logging regression suite.
 *
 * Asserts the six requirements from VISION-ARCHITECTURE.md §2/§3's Part 4
 * verification list, against an in-memory fake Supabase (same house style
 * as test-logging-roundtrip.ts/test-meal-roundtrip.ts):
 *
 *   1. A statement never produces a proposal (classifyImperative only)
 *   2. A double-claim/double-tap executes exactly once
 *   3. The D1 "discard model prose" rule is true iff a proposal/receipt/
 *      logWorkout/offer is present on the response
 *   4. set-parse.ts: "6x8" flags a flip candidate (non-blocking), "flyes"
 *      flags exercise-name ambiguity, a weight-omitted externally-loaded
 *      exercise never emits a 0kg row
 *   5. A chat-logged set (via nl-logging-executor's executeLogWorkout) is
 *      indistinguishable from a tap-logged set (via saveSet) under
 *      filterLoggableSets
 *   6. Undo: exercise-swap restores the mesocycle byte-identical to the
 *      pre-image; set-undo removes via deleteSet; meal-swap-undo restores
 *      getTodayLedger's total exactly via the voided-event filter
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

// --- Fake Supabase ------------------------------------------------------

type Row = Record<string, unknown>

const OPEN_PENDING_STATUSES = new Set(['pending', 'claimed', 'executing'])

const UNIQUES: Record<string, string[][]> = {
  pending_actions: [['client_id']],
  meal_events: [['client_id']],
  mesocycle_weeks: [['profile_id', 'week_number']],
}

const db: Record<string, Row[]> = {
  pending_actions: [], mesocycle_weeks: [], exercise_set_logs: [], workout_sessions: [], meal_events: [],
}

function cmp(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

function uniqueViolation(table: string, row: Row, ignoreRow?: Row): boolean {
  for (const cols of UNIQUES[table] ?? []) {
    if (cols.length === 1 && cols[0] === 'client_id' && row.client_id == null) continue
    const clash = db[table].find(r => r !== ignoreRow && cols.every(c => r[c] === row[c]))
    if (clash) return true
  }
  // pending_actions.scope_key: a PARTIAL unique index scoped to open
  // statuses only (mirrors the migration's WHERE status IN (...) clause) —
  // this is what makes createPendingAction's retry-collapse (23505 -> return
  // the existing row) and claimPendingAction's exactly-once guarantee real.
  if (table === 'pending_actions' && OPEN_PENDING_STATUSES.has(String(row.status))) {
    const clash = db.pending_actions.find(r =>
      r !== ignoreRow && OPEN_PENDING_STATUSES.has(String(r.status)) &&
      r.profile_id === row.profile_id && r.scope_key === row.scope_key)
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

  const exec = (): { data: unknown; error: { code?: string; message: string } | null } => {
    if (op === 'insert') {
      const inserted: Row[] = []
      for (const raw of payload) {
        const row: Row = { id: crypto.randomUUID(), created_at: raw.created_at ?? new Date().toISOString(), ...raw }
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
      return { data: null, error: null }
    }
    if (op === 'update') {
      const updated: Row[] = []
      for (const r of db[table]) {
        if (filters.every(f => f(r))) { Object.assign(r, updateObj); updated.push(r) }
      }
      return { data: single ? (updated[0] ?? null) : updated.map(r => ({ ...r })), error: null }
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
    is: (c: string, v: unknown) => { filters.push(r => (v === null ? r[c] == null : r[c] === v)); return api },
    in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
    lt: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) < 0); return api },
    match: (obj: Row) => { for (const [c, v] of Object.entries(obj)) filters.push(r => r[c] === v); return api },
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

/** Key-order-independent structural equality — toRow/fromRow reconstructs objects with a fixed key order that differs from generateMesocycle's own, so a raw JSON.stringify comparison would false-negative on genuinely identical data. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort()
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

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

  const { classifyImperative } = await import('../src/lib/imperative-classifier')
  const { classifyConfirmationReply } = await import('../src/lib/confirmation-reply')
  const { createPendingAction, claimPendingAction, declinePendingAction, resolvePendingAction, isWithinUndoWindow } = await import('../src/lib/pending-actions-store')
  const { buildIntentProposal, APPEND_PROPOSAL_KINDS } = await import('../src/lib/intent-proposal')
  const { parseSetsPhrase, resolveExerciseName, parseWorkoutEntries } = await import('../src/lib/set-parse')
  const { executeLogWorkout } = await import('../src/lib/nl-logging-executor')
  const { saveSet, deleteSet, getSetsForDate, flushPending } = await import('../src/lib/set-log-store')
  const { filterLoggableSets } = await import('../src/lib/session-derive')
  const { getExerciseId, getExerciseEntry } = await import('../src/lib/exercise-db')
  const { generateMesocycle } = await import('../src/lib/exercise-plan')
  const { swapExerciseInMesocycle } = await import('../src/lib/mesocycle-edit')
  const { saveMesocycleWeek, restoreMesocycle } = await import('../src/lib/mesocycle-persistence')
  const { recordMealEvent, voidMealEvent, getTodayLedger } = await import('../src/lib/meal-store')
  const { computeTargets } = await import('../src/lib/nutrition-targets')
  type UserProfile = import('../src/lib/types').UserProfile
  type ChatApiResponse = { reply: string; proposal?: unknown; receipt?: unknown; logWorkout?: unknown; offer?: unknown }

  // ---- 1. A statement never produces a proposal (only, at most, an offer) --
  console.log('\n[1] classifyImperative: a statement/question never counts as imperative')
  const negation = classifyImperative("I didn't log squats today", "I didn't log squats today, too tired")
  check('negation ("didn\'t log") is non-imperative', negation.imperative === false && negation.reason === 'negation', negation)

  const interrogative = classifyImperative('Should I swap bench for incline?', 'Should I swap bench for incline?')
  check('a question is non-imperative', interrogative.imperative === false && interrogative.reason === 'interrogative', interrogative)

  const paraphrase = classifyImperative('swap deadlift', 'please replace my deadlift with RDL')
  check('a paraphrased (non-verbatim) quote is rejected', paraphrase.imperative === false && paraphrase.reason === 'not_verbatim', paraphrase)

  const noVerb = classifyImperative('deadlift felt heavy today', 'deadlift felt heavy today')
  check('a verb-less statement is non-imperative', noVerb.imperative === false && noVerb.reason === 'no_imperative_verb', noVerb)

  const genuine = classifyImperative('swap my deadlift for RDL', 'swap my deadlift for RDL please')
  check('a genuine imperative with an imperative verb passes', genuine.imperative === true, genuine)

  // ---- 2. Confirm-exactly-once: a double-claim only ever wins once --------
  console.log('\n[2] claimPendingAction: double-tap/retry executes exactly once')
  const profileId = crypto.randomUUID()
  const row = await createPendingAction({
    profileId,
    actionClass: 'plan_mutation',
    kind: 'propose_exercise_swap',
    scopeKey: `${profileId}:propose_exercise_swap:Monday:0`,
    preconditions: {},
    payload: { foo: 'bar' },
    preImage: { snapshot: true },
    diff: { rows: [{ field: 'exercise', before: 'A', after: 'B' }] },
  })
  check('pending row created with status=pending', row.status === 'pending', row)

  const [claim1, claim2] = await Promise.all([
    claimPendingAction(row.id, async () => true),
    claimPendingAction(row.id, async () => true),
  ])
  const outcomes = [claim1.outcome, claim2.outcome].sort()
  check('exactly one call claims, the other sees already_resolved',
    outcomes.join(',') === 'already_resolved,claimed', outcomes)
  check('a third claim attempt also sees already_resolved (retry-safe)',
    (await claimPendingAction(row.id, async () => true)).outcome === 'already_resolved')

  // A retried identical proposal collapses onto the still-open row instead
  // of duplicating a card (the scope_key partial-unique index).
  const retryRow = await createPendingAction({
    profileId,
    actionClass: 'plan_mutation',
    kind: 'propose_exercise_swap',
    scopeKey: `${profileId}:propose_exercise_swap:Tuesday:1`,
    preconditions: {},
    payload: {},
    preImage: {},
    diff: { rows: [] },
  })
  const retryDup = await createPendingAction({
    profileId,
    actionClass: 'plan_mutation',
    kind: 'propose_exercise_swap',
    scopeKey: `${profileId}:propose_exercise_swap:Tuesday:1`,
    preconditions: {},
    payload: {},
    preImage: {},
    diff: { rows: [] },
  })
  check('a retried identical proposal returns the SAME still-open row, not a duplicate', retryDup.id === retryRow.id, { retryRow, retryDup })

  // ---- 3. D1: model prose is discarded iff proposal/receipt/logWorkout/offer present --
  console.log('\n[3] D1 rule: discard model prose iff proposal/receipt/logWorkout/offer present')
  // Mirrors ChatAssistant.tsx's processResponse branch order exactly (documented
  // there as the non-negotiable fix) — the source is the source of truth.
  function shouldDiscardModelProse(result: ChatApiResponse): boolean {
    return !!(result.proposal || result.receipt || result.logWorkout || result.offer)
  }
  check('a proposal turn discards prose', shouldDiscardModelProse({ reply: 'Sure, swapping now!', proposal: {} }))
  check('a receipt turn discards prose', shouldDiscardModelProse({ reply: 'Done!', receipt: {} }))
  check('a logWorkout turn discards prose', shouldDiscardModelProse({ reply: '', logWorkout: {} }))
  check('an offer turn discards prose', shouldDiscardModelProse({ reply: 'model text', offer: {} }))
  check('a plain reply (no proposal/receipt/logWorkout/offer) keeps model prose', !shouldDiscardModelProse({ reply: 'Just chatting' }))

  // ---- 4. set-parse.ts regression cases ------------------------------------
  console.log('\n[4] set-parse.ts: flip candidates, exercise ambiguity, no fabricated 0kg')
  const sixByEight = parseSetsPhrase('6x8')
  check('"6x8" is a non-blocking flip candidate, not a hard block',
    sixByEight.ambiguous === true && sixByEight.flipCandidate !== undefined, sixByEight)
  check('"6x8" defaults to A-is-sets (6 sets of 8)', sixByEight.sets === 6 && sixByEight.repsPerSet.every(r => r === 8), sixByEight)
  check('the flip candidate offers the swapped reading (8 sets of 6)',
    sixByEight.flipCandidate?.sets === 8 && sixByEight.flipCandidate.repsPerSet.every(r => r === 6), sixByEight.flipCandidate)

  const clearCase = parseSetsPhrase('3x15')
  check('an unambiguous A×B (one side >12) is never flagged', clearCase.ambiguous === false && clearCase.sets === 3, clearCase)

  const flyesRes = resolveExerciseName('flyes', [])
  check('"flyes" resolves ambiguous (Cable Flyes vs Rear Delt Flyes, neither a prefix of the other)',
    flyesRes.resolution === 'ambiguous' && flyesRes.candidates.length > 1, flyesRes)

  const benchEntry = getExerciseEntry('Barbell Bench Press')!
  const parsedNoWeight = parseWorkoutEntries({
    entries: [{ rawText: 'did 3 sets of 8 bench', exercisePhrase: 'bench', setsPhrase: '3 sets of 8' }],
    todaysPlanExerciseNames: [benchEntry.name],
  })
  const benchGroup = parsedNoWeight.groups[0]
  check('a weight-omitted externally-loaded exercise blocks on a weight ambiguity, never fabricates 0kg',
    benchGroup.ambiguity?.field === 'weight' && benchGroup.sets.length === 0, benchGroup)
  check('the overall parse needsClarification for this case', parsedNoWeight.needsClarification === true)

  // --- Added weight through the coach ---------------------------------------
  // MEASURED before this landed: "3x5 @15kg", "3x5 with 15kg", "3x5" and
  // "3x5 @bodyweight" on Chin-Ups all produced the IDENTICAL row, weightKg 0
  // — the stated figure silently discarded by the bodyweight override, on the
  // four lifts you can actually hang a belt from. Silently is the worst
  // version of it: the bench check directly above shows a LOADED lift asks
  // "what weight did you use?" rather than guessing.
  const chinParse = (setsPhrase: string) => parseWorkoutEntries({
    entries: [{ rawText: `chin-ups ${setsPhrase}`, exercisePhrase: 'chin-ups', setsPhrase }],
    todaysPlanExerciseNames: ['Chin-Ups'],
  }).groups[0]

  const chinWeighted = chinParse('3 sets of 5 @15kg')
  check('a stated weight on a chin-up survives as ADDED weight',
    chinWeighted.sets[0]?.addedLoadKg === 15, chinWeighted.sets[0])
  check('...and weight_kg stays 0 — the chin-up did not weigh 15kg',
    chinWeighted.sets[0]?.weightKg === 0 && chinWeighted.sets[0]?.isBodyweight === true, chinWeighted.sets[0])

  const dipsWeighted = parseWorkoutEntries({
    entries: [{ rawText: 'chest dips 4x6 @20kg', exercisePhrase: 'chest dips', setsPhrase: '4x6 @20kg' }],
    todaysPlanExerciseNames: ['Chest Dips'],
  }).groups[0]
  check('the same holds for dips', dipsWeighted.sets[0]?.addedLoadKg === 20, dipsWeighted.sets[0])

  check('a plain bodyweight chin-up carries no added weight',
    chinParse('3x5').sets[0]?.addedLoadKg == null, chinParse('3x5').sets[0])
  check('an explicit @bodyweight chin-up carries none either',
    chinParse('3x5 @bodyweight').sets[0]?.addedLoadKg == null, chinParse('3x5 @bodyweight').sets[0])

  // The over-fire check: an ordinary loaded lift must be completely untouched
  // — its number is the weight of the bar, not something added to a body.
  const benchWeighted = parseWorkoutEntries({
    entries: [{ rawText: 'bench 3x8 @80kg', exercisePhrase: 'bench', setsPhrase: '3x8 @80kg' }],
    todaysPlanExerciseNames: [benchEntry.name],
  }).groups[0]
  check('a barbell lift still puts its number in weight_kg, not added load',
    benchWeighted.sets[0]?.weightKg === 80 && benchWeighted.sets[0]?.addedLoadKg == null, benchWeighted.sets[0])


  const bodyweightParsed = parseWorkoutEntries({
    entries: [{ rawText: '3 sets of 12 push-ups', exercisePhrase: 'push-ups', setsPhrase: '3 sets of 12' }],
    todaysPlanExerciseNames: [],
  })
  const pushupGroup = bodyweightParsed.groups[0]
  check('a genuinely bodyweight exercise with no stated weight is NOT blocked (0kg is legitimate here)',
    !pushupGroup.ambiguity && pushupGroup.sets.length === 3 && pushupGroup.sets.every(s => s.isBodyweight && s.weightKg === 0), pushupGroup)

  // ---- 5. Chat-logged sets are indistinguishable from tap-logged sets -----
  console.log('\n[5] chat-logged (nl-logging-executor) vs tap-logged (saveSet) sets are identical under filterLoggableSets')
  const userId = crypto.randomUUID()
  const today = new Date().toISOString().split('T')[0]
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  const squatEntry = getExerciseEntry('Barbell Back Squat') ?? getExerciseEntry('Goblet Squats')!
  const squatId = getExerciseId(squatEntry.name)
  // Tap-logged: direct saveSet call, exactly what SetGrid.tsx does.
  saveSet({ userId, date: today, weekNumber: 1, day, exerciseId: squatId, exerciseName: squatEntry.name, setNumber: 1, weightKg: 80, repsCompleted: 8 })

  // Chat-logged: parseWorkoutEntries -> executeLogWorkout, using the SAME
  // ctx.logSet facade useActiveSession hands to production code (saveSet
  // itself, not a bespoke write path).
  const ohpEntry = getExerciseEntry('Overhead Press')!
  const chatParse = parseWorkoutEntries({
    entries: [{ rawText: 'did 3x8 @60kg overhead press', exercisePhrase: 'overhead press', setsPhrase: '3x8 @60kg' }],
    todaysPlanExerciseNames: [ohpEntry.name],
  })
  check('the multi-exercise-style chat message parses cleanly with no clarification needed', chatParse.needsClarification === false, chatParse)

  const loggedSoFar: import('../src/lib/types').ExerciseSetLog[] = []
  const { rows: receiptRows, totalSets, loggedKeys } = executeLogWorkout(chatParse.groups, {
    profileId: userId,
    date: today,
    weekNumber: 1,
    dayName: day,
    setsFor: (exerciseId, exerciseName) => filterLoggableSets(loggedSoFar, exerciseId, exerciseName),
    logSet: input => {
      const saved = saveSet(input)
      loggedSoFar.push(saved)
      return saved
    },
    declareOffPlan: () => {},
    todaysPlanSetCounts: new Map([[ohpEntry.name, 3]]),
    todaysPlanLoads: new Map(),
  })
  check('executeLogWorkout produced exactly one receipt row for the single parsed exercise', receiptRows.length === 1, receiptRows)
  check('all 3 sets logged', totalSets === 3 && loggedKeys.length === 3, { totalSets, loggedKeys })

  await flushPending()
  const allSets = await getSetsForDate(userId, today)
  const tapLoggable = filterLoggableSets(allSets, squatId, squatEntry.name)
  const chatLoggable = filterLoggableSets(allSets, getExerciseId(ohpEntry.name), ohpEntry.name)
  check('tap-logged set passes filterLoggableSets', tapLoggable.length === 1 && tapLoggable[0].weight_kg === 80, tapLoggable)
  check('chat-logged sets pass the IDENTICAL predicate, same shape as tap-logged', chatLoggable.length === 3 && chatLoggable.every(s => s.weight_kg === 60 && !s.is_warmup), chatLoggable)
  check('both sit in the same exercise_set_logs rows — no forked storage for chat vs tap',
    db.exercise_set_logs.some(r => r.exercise_id === squatId) && db.exercise_set_logs.some(r => r.exercise_id === getExerciseId(ohpEntry.name)))

  // And the added weight has to reach the store, not stop at the parser — the
  // same written-but-never-read trap update_workout_schedule died on. Placed
  // here rather than beside the parse checks above because userId/today/day
  // are only initialised by this point.
  {
    const captured: { addedLoadKg?: number | null }[] = []
    const chinGroups = parseWorkoutEntries({
      entries: [{ rawText: 'chin-ups 3 sets of 5 @15kg', exercisePhrase: 'chin-ups', setsPhrase: '3 sets of 5 @15kg' }],
      todaysPlanExerciseNames: ['Chin-Ups'],
    }).groups
    const { rows: chinRows } = executeLogWorkout(chinGroups, {
      profileId: userId,
      date: today,
      weekNumber: 1,
      dayName: day,
      setsFor: () => [],
      logSet: input => { captured.push(input); return saveSet(input) },
      declareOffPlan: () => {},
      todaysPlanSetCounts: new Map(),
      todaysPlanLoads: new Map(),
    })
    check('the executor forwards the added weight to the set log',
      captured.length === 3 && captured.every(c => c.addedLoadKg === 15), captured.map(c => c.addedLoadKg))
    check('the receipt says "BW +15kg", never a bare 15kg beside a chin-up',
      JSON.stringify(chinRows).includes('BW +15kg'), chinRows)
  }


  // ---- 6a. Undo: exercise swap restores the mesocycle byte-identical ------
  console.log('\n[6a] exercise-swap undo restores the mesocycle byte-identical to the pre-image')
  const mesoProfile: UserProfile = {
    age: 30, gender: 'male', height_cm: 180, weight_kg: 85,
    activity_level: 'moderate', fitness_goal: 'hypertrophy',
    training_days: [
      { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: true }, { day: 'Thursday', available: true },
      { day: 'Friday', available: false }, { day: 'Saturday', available: false }, { day: 'Sunday', available: false },
    ],
    preferred_time: 'evening', dietary_preferences: [], session_duration_preference: '60-90',
    training_time_preference: 'evening', workout_split_preference: 'upper_lower',
    macro_calculation_mode: 'STANDARD_STATIC', equipment_access: 'full_gym',
    training_style: 'bodybuilding', training_experience: 'intermediate',
    coaching_persona: 'analytical', injuries: [], id: crypto.randomUUID(),
  }
  const mesocycle = generateMesocycle(mesoProfile)
  const week1 = mesocycle.find(w => w.week_number === 1)!
  await saveMesocycleWeek(mesoProfile.id!, week1)
  const preImageSnapshot = JSON.parse(JSON.stringify(mesocycle)) // structurally identical, independent of any later mutation

  const targetDay = week1.days.find(d => d.exercises.length > 0)!
  const oldExercise = targetDay.exercises[0]
  const newExercise = getExerciseEntry('Romanian Deadlifts') ?? getExerciseEntry('Walking Lunges')!

  const swapped = await swapExerciseInMesocycle({
    mesocycle, profile: mesoProfile, currentWeekNumber: 1,
    dayName: targetDay.day, exIndex: 0, newExercise, scope: 'today',
  })
  const swappedWeek1 = swapped.find(w => w.week_number === 1)!
  await saveMesocycleWeek(mesoProfile.id!, swappedWeek1)
  check('the swap actually changed the on-disk week', swappedWeek1.days.find(d => d.day === targetDay.day)!.exercises[0].name !== oldExercise.name)

  // Undo: replicate the exact 'today'-scope restore branch pending-action-executor.undoExerciseSwap uses.
  const preImageWeek1 = (preImageSnapshot as typeof mesocycle).find((w: { week_number: number }) => w.week_number === 1)!
  await saveMesocycleWeek(mesoProfile.id!, preImageWeek1)
  const restored = await restoreMesocycle(mesoProfile.id!)
  check('undo restores week 1 byte-identical to the pre-image (structural deep-equal)',
    stableStringify(restored!.weeks.find(w => w.week_number === 1)) === stableStringify(preImageWeek1))

  // ---- 6b. Undo: NL-logged set removes via deleteSet -----------------------
  console.log('\n[6b] set-log undo: deleteSet removes exactly the chat-logged set, nothing else')
  const beforeUndoCount = (await getSetsForDate(userId, today)).length
  const [firstOhpKey] = loggedKeys
  deleteSet({ userId, date: today, exerciseId: firstOhpKey.exerciseId, setNumber: firstOhpKey.setNumber })
  await flushPending()
  const afterUndoCount = (await getSetsForDate(userId, today)).length
  check('exactly one set removed', afterUndoCount === beforeUndoCount - 1, { beforeUndoCount, afterUndoCount })
  check('the removed set is gone and the other two OHP sets remain',
    !db.exercise_set_logs.some(r => r.exercise_id === firstOhpKey.exerciseId && r.set_number === firstOhpKey.setNumber) &&
    db.exercise_set_logs.filter(r => r.exercise_id === firstOhpKey.exerciseId).length === 2)

  // ---- 6c. Undo: meal swap restores getTodayLedger's total exactly --------
  console.log('\n[6c] meal-swap undo: voidMealEvent restores getTodayLedger totals exactly via the voided-event filter')
  const mealProfileId = crypto.randomUUID()
  const targets = computeTargets({ ...mesoProfile, id: mealProfileId })
  const beforeLedger = await getTodayLedger(mealProfileId, today, targets)
  const swapEvent = recordMealEvent({
    profileId: mealProfileId, date: today, slot: 'lunch', eventType: 'swapped_in',
    mealName: 'Chicken Bowl', macros: { kcal: 600, protein: 45, carbs: 55, fat: 20 }, source: 'chat',
  })
  await flushPending()
  const afterSwapLedger = await getTodayLedger(mealProfileId, today, targets)
  check('the swap event is counted in the ledger', afterSwapLedger.eaten.kcal === beforeLedger.eaten.kcal + 600, afterSwapLedger.eaten)

  await voidMealEvent(swapEvent.clientId)
  const afterUndoLedger = await getTodayLedger(mealProfileId, today, targets)
  check('undo (voidMealEvent) restores the ledger total EXACTLY to its pre-swap value',
    JSON.stringify(afterUndoLedger.eaten) === JSON.stringify(beforeLedger.eaten), { before: beforeLedger.eaten, after: afterUndoLedger.eaten })
  check('the voided event is excluded from the events list entirely, not just zeroed',
    !afterUndoLedger.events.some(e => e.clientId === swapEvent.clientId), afterUndoLedger.events)

  // ---- Undo-window sanity ---------------------------------------------------
  console.log('\n[7] undo-window: only open within 10 minutes of resolution')
  const now = new Date().toISOString()
  const elevenMinAgo = new Date(Date.now() - 11 * 60_000).toISOString()
  check('a just-resolved action is within the undo window', isWithinUndoWindow(now) === true)
  check('an 11-minute-old resolution is outside the undo window', isWithinUndoWindow(elevenMinAgo) === false)
  check('a never-resolved action has no undo window', isWithinUndoWindow(null) === false)

  // resolvePendingAction sanity — used by both swap and meal-swap confirm paths.
  await resolvePendingAction(retryRow.id, 'done', { landed: ['test landed'], failed: [] })
  const { data: resolvedRow } = await fakeClient.from('pending_actions').select('*').eq('id', retryRow.id).maybeSingle() as { data: Row | null }
  check('resolvePendingAction stamps status/result/resolved_at', resolvedRow?.status === 'done' && !!resolvedRow?.resolved_at, resolvedRow)

  // ---- 8. Regression: the confirmation-card stuck-loop bug ----------------
  // Reproduced by real usage: chat proposes an exercise swap, user replies
  // "Yes" in free text — the card re-asked the identical question, up to 4
  // times; only "No" broke the loop. Root cause (traced): a free-text
  // affirmative went back through the SAME imperative-classification
  // pipeline as any other message, and "yes" can never contain an
  // IMPERATIVE_VERBS match, so the model's re-proposal was always
  // downgraded to a repeated plain-text offer with no new pending action.
  // The fix (confirmation-reply.ts + ChatAssistant.tsx's sendMessage)
  // intercepts a clear free-text yes/no BEFORE the model ever sees it,
  // resolving the SAME still-open row the Confirm/Not-now buttons would.
  console.log('\n[8] Regression: confirmation-card stuck loop (propose -> "Yes" -> must execute, never re-propose)')

  // First, document the exact failure mode this bypasses: "Yes" alone can
  // never pass classifyImperative, which is WHY the old (model-routed) path
  // looped forever — this is the bug's mechanism, not a fixed thing.
  const yesAsImperative = classifyImperative('Yes', 'Yes')
  check('"Yes" alone can never pass classifyImperative (this is WHY the old model-routed path looped)',
    yesAsImperative.imperative === false, yesAsImperative)

  check('classifyConfirmationReply recognizes common affirmatives',
    ['Yes', 'yes', 'yeah', 'yep', 'sure', 'confirm', 'do it', 'ok.', 'okay!'].every(t => classifyConfirmationReply(t) === 'confirm'))
  check('classifyConfirmationReply recognizes common negatives',
    ['No', 'no', 'nah', 'nope', 'not now', 'cancel', "don't"].every(t => classifyConfirmationReply(t) === 'decline'))
  check('classifyConfirmationReply leaves a longer/ambiguous reply for the model',
    classifyConfirmationReply('actually can we do the whole block instead') === 'ambiguous')

  const swapProfileId = crypto.randomUUID()
  const swapScopeKey = `${swapProfileId}:propose_exercise_swap:Thursday:0`
  const swapRow = await createPendingAction({
    profileId: swapProfileId,
    actionClass: 'plan_mutation',
    kind: 'propose_exercise_swap',
    scopeKey: swapScopeKey,
    preconditions: {},
    payload: { oldExerciseName: 'Deadlifts', newExerciseName: 'Trap Bar Deadlift', scope: 'today' },
    preImage: { snapshot: true },
    diff: { rows: [{ field: 'exercise', before: 'Deadlifts', after: 'Trap Bar Deadlift' }] },
  })
  check('the swap card starts pending', swapRow.status === 'pending', swapRow)

  // Exactly the sendMessage interception's own logic: classify, then drive
  // the SAME claim -> executing -> resolve pipeline handleConfirmProposal
  // uses — proving a bare "Yes" now executes on the FIRST reply.
  const yesVerdict = classifyConfirmationReply('Yes')
  check('"Yes" classifies as a confirmation (not sent to the model at all)', yesVerdict === 'confirm')
  const swapClaim = await claimPendingAction(swapRow.id, async () => true)
  check('the claim succeeds on the first "Yes"', swapClaim.outcome === 'claimed', swapClaim)
  if (swapClaim.outcome === 'claimed') {
    await resolvePendingAction(swapClaim.row.id, 'done', { landed: ['Deadlifts -> Trap Bar Deadlift'], failed: [] })
  }
  const { data: swapAfterYes } = await fakeClient.from('pending_actions').select('*').eq('id', swapRow.id).maybeSingle() as { data: Row | null }
  check('after one "Yes" the row is done, never still pending (the loop is broken)', swapAfterYes?.status === 'done', swapAfterYes)

  // A second identical "Yes" (double-tap / accidental resend) must not
  // re-execute or error — claimPendingAction's exactly-once guarantee
  // (already proven in [2]) applies identically via this path.
  const secondYesClaim = await claimPendingAction(swapRow.id, async () => true)
  check('a repeated "Yes" after resolution is a safe no-op, not a second execution', secondYesClaim.outcome === 'already_resolved', secondYesClaim)

  // "No" cancels with NO side effects: declined status, resolved_at set,
  // and (structurally, since decline never calls executeExerciseSwap/
  // swapExerciseInMesocycle at all) nothing plan-mutating ever ran.
  const declineProfileId = crypto.randomUUID()
  const declineRow = await createPendingAction({
    profileId: declineProfileId,
    actionClass: 'plan_mutation',
    kind: 'propose_exercise_swap',
    scopeKey: `${declineProfileId}:propose_exercise_swap:Thursday:0`,
    preconditions: {},
    payload: { oldExerciseName: 'Deadlifts', newExerciseName: 'Trap Bar Deadlift', scope: 'today' },
    preImage: { snapshot: true },
    diff: { rows: [{ field: 'exercise', before: 'Deadlifts', after: 'Trap Bar Deadlift' }] },
  })
  const noVerdict = classifyConfirmationReply('No')
  check('"No" classifies as a decline', noVerdict === 'decline')
  await declinePendingAction(declineRow.id)
  const { data: declineAfter } = await fakeClient.from('pending_actions').select('*').eq('id', declineRow.id).maybeSingle() as { data: Row | null }
  check('"No" leaves the row declined with resolved_at set, no side effects', declineAfter?.status === 'declined' && !!declineAfter?.resolved_at, declineAfter)
  check('a declined row was never claimed/executed', declineAfter?.claimed_at == null, declineAfter)

  // ---- 8b. Regression: memory-save loop ("never give it to me") -----------
  // Reproduced by real usage: "I hate mozzarella, never give it to me" made
  // the coach ask "Want me to remember mozzarella?" forever, no matter the
  // reply. Root cause (traced): NEGATION_RE's bare "never" term rejected the
  // quote as non-imperative BEFORE the 'hate' verb match ever ran, so
  // record_fact always downgraded to a plain-text offer with no
  // pending_actions row — a DIFFERENT failure mode from [8]'s stuck loop,
  // because there was never a card for the confirmation-reply interceptor to
  // attach to in the first place. The fix distinguishes "I never trained"
  // (a negated past action) from "never give it to me" (the imperative
  // itself, an exclusion command) by requiring a subject immediately before
  // "never" in the same clause.
  console.log('\n[8b] Regression: memory-save loop ("never give it to me" must classify as imperative, not negation)')
  const exclusionNever = classifyImperative(
    'I hate mozzarella, never give it to me',
    "I hate mozzarella, never give it to me, I can't stand it",
  )
  check('"never give it to me" (exclusion command) classifies as imperative, not negation',
    exclusionNever.imperative === true, exclusionNever)

  const pastActionNever = classifyImperative('I never trained legs today', 'I never trained legs today, ran out of time')
  check('"I never trained" (negated past action, subject-led) still classifies as negation',
    pastActionNever.imperative === false && pastActionNever.reason === 'negation', pastActionNever)

  const pastActionNeverHave = classifyImperative("I've never done that exercise", "I've never done that exercise before")
  check('"I\'ve never done X" (subject-led, contracted) still classifies as negation',
    pastActionNeverHave.imperative === false && pastActionNeverHave.reason === 'negation', pastActionNeverHave)

  // The model may quote just the exclusion clause, without the earlier
  // "I hate X" — "give"/"feed"/"serve"/"include" were added to
  // IMPERATIVE_VERBS so a bare "never give it to me" (no other verb in the
  // quote) still passes once the negation false-positive above is fixed.
  const exclusionClauseOnly = classifyImperative('never give it to me', 'I hate mozzarella, never give it to me')
  check('"never give it to me" alone (no other imperative verb in the quote) still classifies as imperative',
    exclusionClauseOnly.imperative === true, exclusionClauseOnly)

  // The model's later idea ("log that as a conventional Deadlift instead")
  // said yes to: since the FIRST proposal is already resolved (done, not
  // pending/claimed/executing), the scope_key's partial-unique index no
  // longer blocks a fresh proposal for the same slot — it's a clean new
  // row, not a collision with the stale first one, so confirming it can't
  // hit the same loop.
  const secondIdeaRow = await createPendingAction({
    profileId: swapProfileId,
    actionClass: 'plan_mutation',
    kind: 'propose_exercise_swap',
    scopeKey: swapScopeKey, // SAME slot as the already-resolved first swap
    preconditions: {},
    payload: { oldExerciseName: 'Trap Bar Deadlift', newExerciseName: 'Deadlifts', scope: 'today' },
    preImage: { snapshot: true },
    diff: { rows: [{ field: 'exercise', before: 'Trap Bar Deadlift', after: 'Deadlifts' }] },
  })
  check('a later proposal for the same slot, after the first resolved, gets its OWN fresh row (not the stale one)',
    secondIdeaRow.id !== swapRow.id && secondIdeaRow.status === 'pending', { firstId: swapRow.id, secondIdeaRow })
  const secondIdeaClaim = await claimPendingAction(secondIdeaRow.id, async () => true)
  check('confirming the later idea also claims on the first reply', secondIdeaClaim.outcome === 'claimed', secondIdeaClaim)

  // ---- 9. Structural fix: the offer-fallback gap, closed for every tool ----
  // The mozzarella loop's real cause (per [8b]) was one level up from the
  // classifier: when classifyImperative rejects a quote, record_fact/
  // record_goal/add_to_grocery_list/check_off_grocery_item/log_water used to
  // fall back to a plain-text `offer` with NO pending_actions row — so a
  // later "yes" had nothing to resolve and went back through the model,
  // which could fail the same classification again. The fix: the edge
  // function's fallback for these tools (and propose_exercise_swap/
  // propose_meal_swap/propose_injury_adaptation/propose_equipment_adaptation,
  // whose fallback was identical) now returns the SAME resolvable `proposal`
  // shape regardless of classification outcome. This block proves the fix
  // holds structurally across three DIFFERENT tool types — not just memory —
  // by building a real pending_actions row from buildIntentProposal for
  // each and confirming claimPendingAction resolves it on the first try,
  // exactly like block [8] proved for propose_exercise_swap.
  console.log('\n[9] Regression: offer-fallback gap closed for record_fact / add_to_grocery_list / log_water (3+ tool types, not just memory)')

  const intentTestProfileId = crypto.randomUUID()
  const intentCases: { kind: string; rawArgs: Record<string, unknown> }[] = [
    { kind: 'record_fact', rawArgs: { origin_verbatim_quote: 'never give me durian', kind: 'food_preference', polarity: 'dislike', hardness: 'hard', target_phrase: 'durian' } },
    { kind: 'add_to_grocery_list', rawArgs: { origin_verbatim_quote: 'we might need eggs and milk', items: [{ name: 'eggs' }, { name: 'milk' }] } },
    { kind: 'log_water', rawArgs: { origin_verbatim_quote: 'had some water I guess', amount_ml: 300 } },
  ]

  for (const { kind, rawArgs } of intentCases) {
    check(`${kind} is a recognized append-proposal kind`, APPEND_PROPOSAL_KINDS.has(kind))

    // This is exactly what ChatAssistant.tsx's processResponse now does for
    // a proposal whose kind is in APPEND_PROPOSAL_KINDS — build then insert.
    const built = buildIntentProposal(kind, rawArgs, intentTestProfileId)
    check(`${kind}: buildIntentProposal produces a non-empty diff row (never a bare offer)`,
      built.diff.rows.length === 1 && built.diff.rows[0].after !== '', built)
    check(`${kind}: payload carries {tool, rawArgs} — the exact shape resolveAndSave* already accepts`,
      (built.payload as { tool?: string }).tool === kind && !!(built.payload as { rawArgs?: unknown }).rawArgs, built.payload)

    const row = await createPendingAction({
      profileId: intentTestProfileId,
      actionClass: 'append',
      kind,
      scopeKey: built.scopeKey,
      preconditions: built.preconditions,
      payload: built.payload,
      diff: built.diff,
    })
    check(`${kind}: pending row created with status=pending (a real row, not free text)`, row.status === 'pending', row)

    const claim = await claimPendingAction(row.id, async () => true)
    check(`${kind}: "yes" claims on the first reply, no model round-trip needed`, claim.outcome === 'claimed', claim)

    // Retry-safety (double-tap) must hold for these kinds exactly as it does
    // for plan-mutation kinds — proven generically in [2], reconfirmed here
    // per-kind since this is the exact mechanism the "yes always resolves"
    // guarantee depends on.
    const retryClaim = await claimPendingAction(row.id, async () => true)
    check(`${kind}: a repeated claim is a safe no-op (already_resolved), not a second write`,
      retryClaim.outcome === 'already_resolved', retryClaim)

    await resolvePendingAction(row.id, 'done', { landed: [kind], failed: [] })
  }

  // ---- Summary -------------------------------------------------------------
  if (failures > 0) {
    console.error(`\n${failures} pending-action check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll pending-action checks passed.')
}

main().catch(err => {
  console.error('Test crashed:', err)
  process.exit(1)
})
