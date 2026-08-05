/**
 * Memory & goals regression suite (VISION-ARCHITECTURE.md §1 Part 5).
 *
 * Against an in-memory fake Supabase (house style, matching
 * test-pending-actions.ts):
 *   1. A stated preference persists (memory-store) and is honoured by the
 *      relevant generator (fact-compiler -> meal-generation's hard filter)
 *   2. A deleted memory stops affecting generation
 *   3. A directional goal is never reported as a tracked percentage
 *      (goal-progress.ts)
 *   4. A conflicting fact/goal triggers reconciliation rather than a
 *      silent overwrite (memory-reconcile.ts)
 *   5. Incidental conversation does not create memories
 *      (classifyImperative, reused from the chat action framework)
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

// --- Fake Supabase -------------------------------------------------------

type Row = Record<string, unknown>
const db: Record<string, Row[]> = { user_facts: [], user_goals: [], user_context_facts: [] }

function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  const orders: [string, boolean][] = []
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row[] = []
  let updateObj: Row | null = null
  let single = false

  const exec = (): { data: unknown; error: null } => {
    if (op === 'insert') {
      const inserted = payload.map(raw => {
        const row: Row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), status: raw.status ?? 'active', ...raw }
        db[table].push(row)
        return row
      })
      return { data: single ? inserted[0] ?? null : inserted, error: null }
    }
    if (op === 'update') {
      const updated: Row[] = []
      for (const r of db[table]) if (filters.every(f => f(r))) { Object.assign(r, updateObj); updated.push(r) }
      return { data: updated, error: null }
    }
    if (op === 'delete') {
      db[table] = db[table].filter(r => !filters.every(f => f(r)))
      return { data: null, error: null }
    }
    let rows = db[table].filter(r => filters.every(f => f(r)))
    for (const [col, asc] of [...orders].reverse()) rows = [...rows].sort((a, b) => (asc ? 1 : -1) * (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0))
    const data = single ? (rows[0] ?? null) : rows.map(r => ({ ...r }))
    return { data, error: null }
  }

  const api: Record<string, unknown> = {
    select: () => api,
    insert: (rows: Row | Row[]) => { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return api },
    update: (obj: Row) => { op = 'update'; updateObj = obj; return api },
    delete: () => { op = 'delete'; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api },
    in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
    order: (c: string, opts?: { ascending?: boolean }) => { orders.push([c, opts?.ascending !== false]); return api },
    maybeSingle: () => { single = true; return api },
    single: () => { single = true; return api },
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve().then(() => resolve(exec()), reject),
  }
  return api
}

const fakeClient = { from: fakeFrom }

// --- Test harness ---------------------------------------------------------

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

  const { createFact, getActiveFacts, retireFact, deleteFactPermanently, createGoal, getActiveGoals } = await import('../src/lib/memory-store')
  const { compileExerciseExclusions, compileFoodDislikes, resolveExerciseTarget, resolveFoodTarget } = await import('../src/lib/fact-compiler')
  const { checkFactConflict, checkGoalConflict } = await import('../src/lib/memory-reconcile')
  const { computeGoalProgress } = await import('../src/lib/goal-progress')
  const { classifyImperative } = await import('../src/lib/imperative-classifier')
  const { verifyProposal } = await import('../src/lib/meal-generation')

  const profileId = crypto.randomUUID()

  // ---- 1. A stated preference persists and is honoured by the generator --
  console.log('\n[1] a stated hard exercise dislike persists and is honoured by generateExercisePlan\'s exclusions channel')
  const legPressResolution = resolveExerciseTarget('leg press')
  check('exercise target resolves to at least one real catalog name', legPressResolution.resolution === 'resolved' && legPressResolution.resolvedRefs.length > 0, legPressResolution)

  const dislikeFact = await createFact({
    profileId, kind: 'exercise_preference', source: 'chat',
    rawPhrase: "I hate leg press, my knees can't handle it",
    displayText: "won't do leg press",
    polarity: 'dislike', hardness: 'hard',
    resolvedRefs: legPressResolution.resolution === 'resolved' ? legPressResolution.resolvedRefs : [],
  })
  const activeAfterCreate = await getActiveFacts(profileId)
  check('fact persisted and readable back', activeAfterCreate.some(f => f.id === dislikeFact.id))

  const exclusions = compileExerciseExclusions(activeAfterCreate)
  check('compileExerciseExclusions includes the resolved exercise name(s)',
    legPressResolution.resolution === 'resolved' && legPressResolution.resolvedRefs.every(r => exclusions.includes(r)), exclusions)

  // Food side: the SAME hard filter meal-generation.ts's verifyProposal already enforces.
  const foodDislikeFact = await createFact({
    profileId, kind: 'food_preference', source: 'chat',
    rawPhrase: "I can't stand mushrooms", displayText: "won't eat mushrooms",
    polarity: 'dislike', hardness: 'hard', resolvedRefs: resolveFoodTarget('mushrooms'),
  })
  const activeFoodFacts = await getActiveFacts(profileId)
  const dislikedFoods = compileFoodDislikes(activeFoodFacts)
  check('compileFoodDislikes includes the stated food', dislikedFoods.includes('mushrooms'), dislikedFoods)

  const rejectLog: string[] = []
  const mushroomProposal = {
    slot: 'lunch', name: 'Chicken and Mushroom Rice Bowl',
    ingredients: ['200g chicken breast', '220g cooked basmati rice', '100g mushrooms', '1 tbsp olive oil'],
    prep: '25 min', cuisine: 'Other',
  }
  const budget = { calories: 700, protein: 45, carbs: 80, fat: 20 }
  const rejected = verifyProposal(mushroomProposal, 'lunch', budget, [], rejectLog, dislikedFoods)
  check('a meal containing the disliked food is rejected by verifyProposal using the compiled list', rejected === null, rejectLog)
  check('rejection log names the disliked food', rejectLog.some(l => l.includes('mushroom')), rejectLog)

  // ---- 2. A deleted memory stops affecting generation ----------------------
  console.log('\n[2] deleting a fact removes its effect from the next compile + generation pass')
  await deleteFactPermanently(foodDislikeFact.id)
  const activeAfterDelete = await getActiveFacts(profileId)
  check('deleted fact no longer in active facts', !activeAfterDelete.some(f => f.id === foodDislikeFact.id))
  const dislikedFoodsAfterDelete = compileFoodDislikes(activeAfterDelete)
  check('compileFoodDislikes no longer includes the deleted food', !dislikedFoodsAfterDelete.includes('mushrooms'), dislikedFoodsAfterDelete)

  const rejectLog2: string[] = []
  const acceptedNow = verifyProposal(mushroomProposal, 'lunch', budget, [], rejectLog2, dislikedFoodsAfterDelete)
  check('the same meal is now accepted (the exact "confirm regenerate -> appears again" loop the browser test exercises)', acceptedNow !== null, rejectLog2)

  // retire (soft-delete, used by undo) has the same immediate compile effect
  await retireFact(dislikeFact.id)
  const activeAfterRetire = await getActiveFacts(profileId)
  check('retiring a fact (the undo path) also removes it from active facts', !activeAfterRetire.some(f => f.id === dislikeFact.id))
  check('compileExerciseExclusions reflects the retire immediately', compileExerciseExclusions(activeAfterRetire).length === 0, compileExerciseExclusions(activeAfterRetire))

  // ---- 3. A directional goal is never reported as a tracked percentage ----
  console.log('\n[3] a directional goal never produces a tracked percent')
  const directionalGoal = await createGoal({
    profileId, metric: 'directional', trackable: 'directional',
    source: 'chat', rawPhrase: 'I just want to look leaner', displayText: 'look leaner',
  })
  check('directional goal writes with status=active (no baseline required)', directionalGoal.status === 'active', directionalGoal)
  const directionalProgress = computeGoalProgress(directionalGoal, profileId, 84.2)
  check('computeGoalProgress returns percent=null for a directional goal, even with a plausible current value available', directionalProgress.percent === null, directionalProgress)

  const measurableGoal = await createGoal({
    profileId, metric: 'body_weight_kg', trackable: 'measurable',
    baselineValue: 90, baselineSource: 'user_stated', targetValue: 82,
    source: 'chat', rawPhrase: 'get to 82kg', displayText: '90kg -> 82kg',
  })
  check('measurable goal with a baseline writes as active (Decision #4)', measurableGoal.status === 'active', measurableGoal)
  const measurableProgress = computeGoalProgress(measurableGoal, profileId, 86)
  check('measurable goal DOES compute a percent once current data is available', measurableProgress.percent !== null && measurableProgress.current === 86, measurableProgress)
  check('percent reflects (86-90)/(82-90) = 50%', measurableProgress.percent === 50, measurableProgress)

  const noBaselineGoal = await createGoal({
    profileId, metric: 'lift_working_kg', trackable: 'measurable', metricRef: 'Barbell Bench Press',
    targetValue: 100, source: 'chat', rawPhrase: 'get my bench to 100kg', displayText: 'bench -> 100kg',
  })
  check('a measurable goal created with NO baseline writes as needs_baseline, never active (the DB CHECK\'s own contract)', noBaselineGoal.status === 'needs_baseline', noBaselineGoal)
  const activeGoalsList = await getActiveGoals(profileId)
  check('needs_baseline goals still surface (memory screen must show them, not hide them)', activeGoalsList.some(g => g.id === noBaselineGoal.id))

  // ---- 4. A conflicting fact/goal triggers reconciliation ------------------
  console.log('\n[4] conflicting facts/goals surface for confirmation instead of silently overwriting')
  const existingFacts = [{
    id: 'x', profile_id: profileId, kind: 'food_preference' as const, status: 'active' as const, source: 'chat' as const,
    source_message_id: null, raw_phrase: 'I love salmon', display_text: 'prefers salmon', supersedes_id: null,
    polarity: 'like' as const, hardness: 'soft' as const, resolved_refs: ['salmon'],
    timing_subject: null, timing_relation: null, timing_anchor: null, timing_slot: null,
    constraint_kind: null, weekday: null, client_id: null, created_at: new Date().toISOString(), retired_at: null,
  }]
  const oppositeConflict = checkFactConflict({ kind: 'food_preference', polarity: 'dislike', resolvedRefs: ['salmon'] }, existingFacts)
  check('an opposite-polarity statement about the same target is flagged, not silently written', oppositeConflict.needsConfirmation, oppositeConflict)
  const sameDirection = checkFactConflict({ kind: 'food_preference', polarity: 'like', resolvedRefs: ['salmon'] }, existingFacts)
  check('a same-direction restatement is NOT flagged (reinforcement, not a conflict)', !sameDirection.needsConfirmation)

  // The concrete Part 2 case: onboarding says 90kg working bench, user
  // later states a 115kg 1RM. ~78% ratio is realistic — must NOT be
  // flagged as a conflict, but the relationship IS checked (not blindly
  // stacked): an implausible ratio (e.g. a "1RM" lower than the working
  // weight) IS flagged.
  const plausible1RM = checkGoalConflict(
    { metric: 'lift_1rm_kg', metricRef: 'Barbell Bench Press', baselineValue: 115 },
    [], { known_bench_kg: 90 },
  )
  check('a 1RM consistent with the known working weight (90/115 ≈ 78%) is accepted without asking', !plausible1RM.needsConfirmation, plausible1RM)

  const clearlyImplausible1RM = checkGoalConflict(
    { metric: 'lift_1rm_kg', metricRef: 'Barbell Bench Press', baselineValue: 92 },
    [], { known_bench_kg: 90 },
  )
  check('a 1RM barely above the known working weight (90/92 ≈ 98% ratio, above the plausible ceiling) IS flagged rather than silently accepted', clearlyImplausible1RM.needsConfirmation, clearlyImplausible1RM)

  // Same-metric, materially different baseline restated later.
  const existingGoals = [{
    id: 'g1', profile_id: profileId, metric: 'body_weight_kg' as const, trackable: 'measurable' as const,
    metric_ref: null, baseline_value: 90, baseline_captured_at: new Date().toISOString(), baseline_source: 'user_stated' as const,
    target_value: 82, target_date: null, status: 'active' as const, source: 'chat' as const, source_message_id: null,
    raw_phrase: '', display_text: '', supersedes_id: null, client_id: null, created_at: new Date().toISOString(),
  }]
  const restated = checkGoalConflict({ metric: 'body_weight_kg', baselineValue: 78 }, existingGoals, {})
  check('a materially different restated baseline for the same metric is flagged, not silently superseded', restated.needsConfirmation, restated)

  // ---- 5. Incidental conversation does not create memories -----------------
  console.log('\n[5] incidental mentions never pass the imperative gate record_fact/record_goal share with propose_*')
  const incidental = classifyImperative('I had eggs today', 'I had eggs today, they were good')
  check('a plain statement of fact about the day is non-imperative — record_fact must not fire', incidental.imperative === false, incidental)
  const question = classifyImperative('should I avoid dairy?', 'should I avoid dairy? I read something about it')
  check('a question about a preference is non-imperative', question.imperative === false, question)
  const clear = classifyImperative('avoid dairy, always', "please avoid dairy, always — I'm lactose intolerant")
  check('a clearly-stated hard constraint using an imperative verb passes the gate', clear.imperative === true, clear)

  // ---- Summary -------------------------------------------------------------
  if (failures > 0) {
    console.error(`\n${failures} memory check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll memory checks passed.')
}

main().catch(err => {
  console.error('Test crashed:', err)
  process.exit(1)
})
