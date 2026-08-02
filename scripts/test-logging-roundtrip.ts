/**
 * C0 Part 7 — logging round-trip integration test.
 *
 * Simulates a multi-week logging flow against an in-memory fake Supabase
 * (same query-builder surface, same unique constraints as the real
 * exercise_set_logs / workout_sessions schema) plus a localStorage shim:
 *
 *   1. Week-1 session via saveSet, including an edit and a delete
 *   2. Offline-queued set: local read visibility, then flush on reconnect
 *   3. Week-2 double-progression recommendation matches the documented rule
 *      (every-set-hit-top-reps -> equipment-aware increment; MAX weight base)
 *   4. Ghost values read the last session correctly
 *   5. PR cache seeds from the unified store
 *   6. The chat edge function's write shape lands in the same store and is
 *      visible to progression
 *   7. Duplicate rows are structurally impossible (re-save + re-flush)
 *
 * No credentials needed: setSupabaseClient() injects the fake.
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
  workout_sessions: [['profile_id', 'date']],
  exercise_set_logs: [['user_id', 'session_id', 'exercise_id', 'set_number', 'is_warmup'], ['client_id']],
}

const db: Record<string, Row[]> = { workout_sessions: [], exercise_set_logs: [] }
let fakeOffline = false

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

  // Mirrors exercise_set_logs.weight_kg NUMERIC(6,2) — a real Postgres
  // numeric-field-overflow, code 22003, is exactly how a fat-fingered weight
  // (e.g. 10005 instead of 100.5) fails in production. Used by the poison-pill
  // dead-letter regression test.
  const numericOverflow = (row: Row): boolean =>
    table === 'exercise_set_logs' && typeof row.weight_kg === 'number' && (row.weight_kg > 9999.99 || row.weight_kg < 0)

  const exec = (): { data: unknown; error: { code?: string; message: string } | null } => {
    if (fakeOffline) return { data: null, error: { message: 'network unavailable (fake offline)' } }
    if (op === 'insert') {
      const inserted: Row[] = []
      for (const raw of payload) {
        const row: Row = { id: crypto.randomUUID(), ...raw }
        if (table === 'workout_sessions') row.is_completed = row.is_completed ?? false
        if (numericOverflow(row)) return { data: null, error: { code: '22003', message: 'numeric field overflow' } }
        if (uniqueViolation(table, row)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
        db[table].push(row)
        inserted.push(row)
      }
      return { data: single ? inserted[0] ?? null : inserted, error: null }
    }
    if (op === 'upsert') {
      for (const raw of payload) {
        if (numericOverflow(raw)) return { data: null, error: { code: '22003', message: 'numeric field overflow' } }
        const existing = onConflict ? db[table].find(r => onConflict!.every(c => r[c] === raw[c])) : undefined
        if (existing) {
          Object.assign(existing, raw)
          if (uniqueViolation(table, existing, existing)) return { data: null, error: { code: '23505', message: 'duplicate key (secondary unique)' } }
        } else {
          const row: Row = { id: crypto.randomUUID(), ...raw }
          if (uniqueViolation(table, row)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
          db[table].push(row)
        }
      }
      return { data: null, error: null }
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
    neq: (c: string, v: unknown) => { filters.push(r => r[c] !== v); return api },
    gt: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) > 0); return api },
    gte: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) >= 0); return api },
    lt: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) < 0); return api },
    is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return api },
    in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
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

/** Test-only helper: get-or-create a workout_sessions row directly against the fake db, for tests that need to plant rows below set-log-store's own API (e.g. simulating a pre-fix malformed row). */
function ensureWorkoutSessionForTest(profileId: string, date: string, day: string): string {
  const existing = db.workout_sessions.find(s => s.profile_id === profileId && s.date === date)
  if (existing) return existing.id as string
  const row = {
    id: crypto.randomUUID(), profile_id: profileId, date, day,
    split_type: 'training', duration_minutes: 45, is_completed: false,
    started_at: `${date}T08:00:00.000Z`,
  }
  db.workout_sessions.push(row)
  return row.id
}

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

function isoDatePlusDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient(fakeClient as any)

  const {
    saveSet, deleteSet, flushPending, getSetsForDate, getLastSessionSets, getSyncState,
  } = await import('../src/lib/set-log-store')
  const { getDoubleProgressionRecommendation, checkDoubleProgression } = await import('../src/lib/progression-engine')
  const { seedPRCacheFromHistory, getPRCache } = await import('../src/lib/pr-engine')
  const { getExerciseEntry, getExerciseId, slugifyExerciseName } = await import('../src/lib/exercise-db')
  const { getLoadIncrementKg, categorize, isExternallyLoaded } = await import('../src/lib/load-prescription')

  const userId = crypto.randomUUID()
  const W1 = isoDatePlusDays(0)   // "today" — week 1 session
  const W2 = isoDatePlusDays(7)   // next week's session date (progression cutoff)
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  const bench = 'Barbell Bench Press'
  const benchId = getExerciseId(bench)

  // ---- 1. Week-1 session: save, edit, delete -------------------------------
  console.log('\n[1] week-1 session via saveSet (edit + delete included)')
  for (let s = 1; s <= 3; s++) {
    saveSet({ userId, date: W1, weekNumber: 1, day, exerciseId: benchId, exerciseName: bench, setNumber: s, weightKg: 60, repsCompleted: 12 })
  }
  // Edit set 2 before sync (coalesces in the pending store)
  saveSet({ userId, date: W1, weekNumber: 1, day, exerciseId: benchId, exerciseName: bench, setNumber: 2, weightKg: 62.5, repsCompleted: 12 })
  // Add a 4th set, then delete it
  saveSet({ userId, date: W1, weekNumber: 1, day, exerciseId: benchId, exerciseName: bench, setNumber: 4, weightKg: 60, repsCompleted: 8 })
  deleteSet({ userId, date: W1, exerciseId: benchId, setNumber: 4 })

  await flushPending()
  const benchRows = db.exercise_set_logs.filter(r => r.exercise_id === benchId)
  check('exactly 3 bench rows after edit+delete+flush', benchRows.length === 3, benchRows.length)
  check('edited set 2 carries the new weight', benchRows.find(r => r.set_number === 2)?.weight_kg === 62.5)
  check('deleted set 4 is absent', !benchRows.some(r => r.set_number === 4))
  const session = db.workout_sessions.find(s => s.profile_id === userId && s.date === W1)
  check('session auto-created with started_at + week/day', !!session && !!session.started_at && session.week_number === 1 && session.day === day)
  check('pending queue drained', getSyncState().queuedCount === 0)

  // Edit AFTER sync — upsert on the natural key, still no duplicate
  saveSet({ userId, date: W1, weekNumber: 1, day, exerciseId: benchId, exerciseName: bench, setNumber: 2, weightKg: 62.5, repsCompleted: 12 })
  await flushPending()
  check('re-save after sync does not duplicate (L2)', db.exercise_set_logs.filter(r => r.exercise_id === benchId).length === 3)

  // ---- 2. Offline queue + flush on reconnect -------------------------------
  console.log('\n[2] offline-logged set: local visibility, then flush')
  navShim.onLine = false
  fakeOffline = true
  const squats = 'Goblet Squats'
  const squatsId = getExerciseId(squats)
  saveSet({ userId, date: W2, weekNumber: 2, day, exerciseId: squatsId, exerciseName: squats, setNumber: 1, weightKg: 24, repsCompleted: 10 })
  const offlineView = await getSetsForDate(userId, W2)
  check('offline read sees the pending set', offlineView.length === 1 && offlineView[0].weight_kg === 24)
  check('queue counts the offline set', getSyncState().queuedCount === 1)
  check('nothing reached the server while offline', !db.exercise_set_logs.some(r => r.exercise_id === squatsId))

  navShim.onLine = true
  fakeOffline = false
  await flushPending()
  check('flush lands the offline set server-side', db.exercise_set_logs.filter(r => r.exercise_id === squatsId).length === 1)
  check('queue empty after reconnect flush', getSyncState().queuedCount === 0)

  // ---- 3. Week-2 double-progression recommendation -------------------------
  console.log('\n[3] double-progression rule (documented §3 contract)')
  const benchEntry = getExerciseEntry(bench)!
  const expectedBase = 62.5 // MAX working-set weight of the week-1 session
  const expectedIncrement = isExternallyLoaded(benchEntry)
    ? getLoadIncrementKg(benchEntry, categorize(benchEntry), expectedBase)
    : 2.5
  const rec = await getDoubleProgressionRecommendation(userId, bench, W2, 12)
  check('recommendation exists for week 2', rec != null)
  check('all-sets-at-top -> didProgress', rec?.didProgress === true, rec ?? undefined)
  check(`progressed weight = max(62.5) + equipment increment (${expectedIncrement})`, rec?.weightKg === expectedBase + expectedIncrement, rec?.weightKg)

  // Not-all-at-top -> hold at last weight
  const rows2 = 'Cable Rows'
  const rowsId = getExerciseId(rows2)
  saveSet({ userId, date: W1, weekNumber: 1, day, exerciseId: rowsId, exerciseName: rows2, setNumber: 1, weightKg: 50, repsCompleted: 12 })
  saveSet({ userId, date: W1, weekNumber: 1, day, exerciseId: rowsId, exerciseName: rows2, setNumber: 2, weightKg: 50, repsCompleted: 9 })
  await flushPending()
  const recHold = await getDoubleProgressionRecommendation(userId, rows2, W2, 12)
  check('short of top reps -> hold', recHold?.didProgress === false && recHold.weightKg === 50, recHold ?? undefined)

  // Ramped session -> base is the MAX set, not the first (L3)
  const dead = 'Deadlifts'
  const deadId = getExerciseId(dead)
  for (const [i, w] of [60, 80, 100].entries()) {
    saveSet({ userId, date: W1, weekNumber: 1, day, exerciseId: deadId, exerciseName: dead, setNumber: i + 1, weightKg: w, repsCompleted: 8 })
  }
  await flushPending()
  const recRamp = await getDoubleProgressionRecommendation(userId, dead, W2, 8)
  const deadEntry = getExerciseEntry(dead)!
  const deadInc = getLoadIncrementKg(deadEntry, categorize(deadEntry), 100)
  check('ramped session progresses from MAX (100), not first row (L3)', recRamp?.weightKg === 100 + deadInc, recRamp?.weightKg)

  // Same-session overload toast (merged reads; prescribed 3x8-12 all at 12)
  const toast = await checkDoubleProgression(userId, bench, W1, 3, '8-12')
  check('same-session overload toast fires', toast?.type === 'overload' && toast.currentWeight === expectedBase, toast ?? undefined)

  // ---- 4. Ghost values -----------------------------------------------------
  console.log('\n[4] ghosts read the last session')
  const ghosts = await getLastSessionSets(userId, benchId, W2)
  check('ghosts return the week-1 bench session in set order',
    ghosts.length === 3 && ghosts.map(g => g.set_number).join(',') === '1,2,3' && ghosts[1].weight_kg === 62.5,
    ghosts.map(g => [g.set_number, g.weight_kg]))

  // ---- 5. PR cache seeds from the unified store ----------------------------
  console.log('\n[5] PR seeding')
  localStorageShim.removeItem(`pr_records_${userId}`)
  await seedPRCacheFromHistory(userId)
  const prCache = getPRCache(userId)
  check('PR cache seeded with bench max weight', prCache[bench]?.maxWeight === 62.5, prCache[bench])
  check('PR cache seeded deadlift max', prCache[dead]?.maxWeight === 100, prCache[dead])

  // ---- 6. Chat edge function write shape lands in the same store -----------
  console.log('\n[6] chat write path (edge-function payload shape)')
  // Mirror of ensureWorkoutSession + upsertUnifiedSets in chat-gemini/index.ts
  const chatEx = 'Landmine Press'  // not in the exercise DB — exercises the slug fallback
  const chatSlug = slugifyExerciseName(chatEx)
  const sessionId = session!.id
  for (let s = 1; s <= 2; s++) {
    const { error } = await (fakeClient.from('exercise_set_logs') as any).upsert({
      session_id: sessionId,
      user_id: userId,
      exercise_id: chatSlug,
      exercise_name: chatEx,
      week_number: null,
      day,
      set_number: s,
      weight_kg: 40,
      reps_completed: 10,
      rpe: null,
      unit: 'reps',
      is_bodyweight: false,
      is_warmup: false,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,session_id,exercise_id,set_number,is_warmup' })
    check(`chat set ${s} upserts cleanly`, error === null, error ?? undefined)
  }
  check('chat slug matches app-side getExerciseId for the same name', chatSlug === getExerciseId(chatEx))
  const chatGhosts = await getLastSessionSets(userId, chatSlug, W2)
  check('progression/ghost reads see chat-logged sets', chatGhosts.length === 2 && chatGhosts[0].weight_kg === 40, chatGhosts.length)

  // ---- 7. Duplicates structurally impossible -------------------------------
  console.log('\n[7] duplicate impossibility sweep')
  const keys = db.exercise_set_logs.map(r => [r.user_id, r.session_id, r.exercise_id, r.set_number, r.is_warmup].join('|'))
  check('no duplicate natural keys anywhere', new Set(keys).size === keys.length, keys.length - new Set(keys).size)
  const dupe = await (fakeClient.from('exercise_set_logs') as any).insert({
    session_id: sessionId, user_id: userId, exercise_id: benchId, exercise_name: bench,
    set_number: 1, weight_kg: 1, reps_completed: 1, is_warmup: false,
  })
  check('raw duplicate insert is rejected by the unique constraint', dupe.error?.code === '23505')

  // ---- 8. Poison-pill: dead-letter, never head-of-line block --------------
  console.log('\n[8] poison-pill queue item — dead-letters, queue keeps draining (fix #1)')
  const { getDeadLetterItems, retryDeadLetterItem, discardDeadLetterItem } = await import('../src/lib/set-log-store')
  const squats2 = 'Front Squats'
  const squats2Id = getExerciseId(squats2)
  const rows3 = 'Seated Cable Row'
  const rows3Id = getExerciseId(rows3)
  // A typo'd weight (numeric(6,2) max is 9999.99) — permanently rejected by
  // the DB on every retry. Queued directly via saveSet to simulate data that
  // reached the store before/without the new client-side bound (e.g. a stale
  // client, or a future caller that forgets to validate).
  saveSet({ userId, date: W2, weekNumber: 2, day, exerciseId: squats2Id, exerciseName: squats2, setNumber: 1, weightKg: 10005, repsCompleted: 8 })
  // A perfectly healthy set queued right after the poison item.
  saveSet({ userId, date: W2, weekNumber: 2, day, exerciseId: rows3Id, exerciseName: rows3, setNumber: 1, weightKg: 45, repsCompleted: 10 })
  await flushPending()

  check('healthy set queued after the poison item still syncs (no head-of-line block)',
    db.exercise_set_logs.some(r => r.exercise_id === rows3Id && r.weight_kg === 45))
  check('poisoned set never reaches the server', !db.exercise_set_logs.some(r => r.exercise_id === squats2Id))
  check('poisoned set is not stuck in the pending queue', getSyncState().queuedCount === 0, getSyncState())
  const deadLetter = getDeadLetterItems()
  check('poisoned set is dead-lettered exactly once', deadLetter.filter(d => d.exerciseName === squats2).length === 1, deadLetter)
  check('dead-letter reason is permanent (constraint violation, not a retry-exhaustion)',
    deadLetter.find(d => d.exerciseName === squats2)?.reason === 'permanent')
  check('sync state reports the dead-lettered item', getSyncState().deadLetterCount === 1, getSyncState())

  // Discard: removed from dead-letter, never resurfaces.
  const poisonedId = deadLetter.find(d => d.exerciseName === squats2)!.clientId
  discardDeadLetterItem(poisonedId)
  check('discarded dead-letter item is gone', getDeadLetterItems().length === 0)

  // Retry: re-queues with a fresh id; still permanently fails (same bad
  // weight) but must dead-letter again WITHOUT blocking anything queued
  // alongside it — proves retry doesn't regress to head-of-line blocking.
  saveSet({ userId, date: W2, weekNumber: 2, day, exerciseId: squats2Id, exerciseName: squats2, setNumber: 1, weightKg: 10005, repsCompleted: 8 })
  await flushPending()
  const secondDeadLetter = getDeadLetterItems()
  check('re-queued poison item dead-letters again', secondDeadLetter.length === 1, secondDeadLetter)
  retryDeadLetterItem(secondDeadLetter[0].clientId)
  await flushPending()
  check('retrying a still-bad item dead-letters again rather than wedging the queue', getDeadLetterItems().length === 1 && getSyncState().queuedCount === 0)
  discardDeadLetterItem(getDeadLetterItems()[0].clientId)

  // ---- 9. Chat 0kg rows never poison progression/ghosts (fix #2) ----------
  // The edge function itself runs on Deno and isn't executable from this Node
  // harness, so this exercises the downstream guard directly: a malformed row
  // (weight_kg=0, is_bodyweight=false — what a pre-fix chat log without a
  // stated weight used to write) must be invisible to ghosts and progression,
  // as if it never happened, falling back to the last REAL session.
  console.log('\n[9] chat 0kg rows excluded from progression/ghosts as malformed (fix #2)')
  const ohp = 'Overhead Press'
  const ohpId = getExerciseId(ohp)
  const ohpSessionEarlier = isoDatePlusDays(-7)
  const ohpSessionMalformed = isoDatePlusDays(-1)

  // A real prior session with a genuine working weight.
  for (let s = 1; s <= 2; s++) {
    saveSet({ userId, date: ohpSessionEarlier, weekNumber: 1, day, exerciseId: ohpId, exerciseName: ohp, setNumber: s, weightKg: 35, repsCompleted: 10 })
  }
  await flushPending()
  // A malformed row landing AFTER it chronologically — simulating a pre-fix
  // chat log that had no weight stated, written directly (bypassing saveSet,
  // which the app itself never does, but the read-side guard must not trust
  // the write path to have been correct).
  const malformedSession = await ensureWorkoutSessionForTest(userId, ohpSessionMalformed, day)
  db.exercise_set_logs.push({
    id: crypto.randomUUID(), session_id: malformedSession, user_id: userId,
    exercise_id: ohpId, exercise_name: ohp, week_number: 2, day,
    set_number: 1, weight_kg: 0, reps_completed: 10, rpe: null, unit: 'reps',
    is_bodyweight: false, is_warmup: false, completed_at: `${ohpSessionMalformed}T12:00:00.000Z`,
  })

  const ohpGhosts = await getLastSessionSets(userId, ohpId, W2)
  check('malformed-only latest session is skipped; ghosts fall back to the last REAL session',
    ohpGhosts.length === 2 && ohpGhosts.every(g => g.weight_kg === 35), ohpGhosts)

  // checkDoubleProgression: today's own sets are a mix of malformed + real —
  // the malformed one must not count toward "every prescribed set landed".
  const mixedEx = 'Incline Dumbbell Press'
  const mixedId = getExerciseId(mixedEx)
  const mixedSession = await ensureWorkoutSessionForTest(userId, W1, day)
  db.exercise_set_logs.push(
    { id: crypto.randomUUID(), session_id: mixedSession, user_id: userId, exercise_id: mixedId, exercise_name: mixedEx, week_number: 1, day, set_number: 1, weight_kg: 0, reps_completed: 10, rpe: null, unit: 'reps', is_bodyweight: false, is_warmup: false, completed_at: `${W1}T09:00:00.000Z` },
    { id: crypto.randomUUID(), session_id: mixedSession, user_id: userId, exercise_id: mixedId, exercise_name: mixedEx, week_number: 1, day, set_number: 2, weight_kg: 22.5, reps_completed: 12, rpe: 7, unit: 'reps', is_bodyweight: false, is_warmup: false, completed_at: `${W1}T09:02:00.000Z` },
  )
  const mixedProgression = await checkDoubleProgression(userId, mixedEx, W1, 2, '8-12')
  check('malformed set excluded from the prescribed-set count -> no premature overload toast',
    mixedProgression === null, mixedProgression ?? undefined)

  // Priority-order mirror of the edge function's resolveWeight (documents the
  // intended order; the Deno source is the source of truth and isn't
  // executable here — see supabase/functions/chat-gemini/index.ts).
  function mirrorResolveWeight(stated: number | undefined, isBW: boolean | undefined, lastLogged: number | null, planSuggested: number | null) {
    if (isBW) return { weightKg: 0, source: 'bodyweight' }
    if (typeof stated === 'number' && stated > 0) return { weightKg: stated, source: 'stated' }
    if (lastLogged != null) return { weightKg: lastLogged, source: 'history' }
    if (planSuggested != null) return { weightKg: planSuggested, source: 'plan' }
    return null
  }
  check('resolveWeight order: explicit stated weight wins over everything', mirrorResolveWeight(100, false, 80, 70)?.source === 'stated')
  check('resolveWeight order: bodyweight flag short-circuits even if a weight is stated as 0', mirrorResolveWeight(undefined, true, 80, 70)?.source === 'bodyweight')
  check('resolveWeight order: falls back to last logged history when unstated', mirrorResolveWeight(undefined, false, 80, 70)?.source === 'history')
  check('resolveWeight order: falls back to plan suggestion when no history', mirrorResolveWeight(undefined, false, null, 70)?.source === 'plan')
  check('resolveWeight order: unresolved (null) when nothing is available — caller must skip + ask', mirrorResolveWeight(undefined, false, null, null) === null)

  // ---- Summary -------------------------------------------------------------
  if (failures > 0) {
    console.error(`\n${failures} logging round-trip check(s) FAILED.`)
    process.exit(1)
  }
  console.log('\nAll logging round-trip checks passed.')
}

main().catch(err => {
  console.error('Test crashed:', err)
  process.exit(1)
})
