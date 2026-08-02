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

  const exec = (): { data: unknown; error: { code?: string; message: string } | null } => {
    if (fakeOffline) return { data: null, error: { message: 'network unavailable (fake offline)' } }
    if (op === 'insert') {
      const inserted: Row[] = []
      for (const raw of payload) {
        const row: Row = { id: crypto.randomUUID(), ...raw }
        if (table === 'workout_sessions') row.is_completed = row.is_completed ?? false
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
