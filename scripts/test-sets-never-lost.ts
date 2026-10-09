/**
 * H20, 9 Oct 2026 — "Sets never look lost".
 *
 * The tester logged seven sets, the connection dropped for ten minutes, and the
 * screen read "0 logged" — for minutes, and again after a reload. Nothing was
 * lost. The app could not tell "the read failed" from "nothing is logged", had
 * no copy of a set once it had synced, and dropped a set that gave up retrying
 * off the grid altogether.
 *
 * EVERY OTHER GATE'S FAKE ALWAYS ANSWERS. That is why none of them saw this:
 * the logging round-trip's "offline" turns `navigator.onLine` off, and the
 * store has a guard for exactly that. The case here is a connection that is UP
 * BUT DEAD — the browser still says online, every request fails — and the
 * Supabase client RETURNS that failure as `{ data: null, error }` rather than
 * throwing it (postgrest-js, read in the installed package). So this fake can
 * fail reads the same way, per CLAUDE.md: "a fake that ignores filters cannot
 * see a missing filter".
 *
 * What is pinned is the PROPERTY — a set the phone knows about is in the day's
 * view whatever the network is doing — not which storage key holds it.
 */

// --- Environment shims (before importing any lib modules) -------------------

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
// ONLINE THROUGHOUT. The whole point: the phone never learns it is offline.
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })

// --- A fake Supabase whose network can die ----------------------------------

type Row = Record<string, unknown>
const db: Record<string, Row[]> = { workout_sessions: [], exercise_set_logs: [], cardio_logs: [] }

/** Every request fails the way a dead connection does through this client: resolved, with an error, no code. */
let networkDead = false
/** A server that rejects one exercise outright — a constraint, so the write can never succeed as-is. */
let rejectExerciseId: string | null = null
/** Holds the NEXT set-logs read after the server has answered it, so a sync can finish while the answer is in flight. */
let holdNextSetRead: { release: () => void; taken: Promise<void> } | null = null
let reads = 0

const DEAD = () => ({ data: null, error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' } })

function cmp(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  const orders: [string, boolean][] = []
  let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select'
  let payload: Row[] = []
  let onConflict: string[] | null = null
  let updateObj: Row | null = null
  let single = false
  let limitN: number | null = null

  const exec = (): { data: unknown; error: { code?: string; message: string } | null } => {
    if (networkDead) return DEAD()
    if (op === 'insert' || op === 'upsert') {
      const stored: Row[] = []
      for (const raw of payload) {
        if (rejectExerciseId && raw.exercise_id === rejectExerciseId) {
          return { data: null, error: { code: '23514', message: 'new row for relation "exercise_set_logs" violates check constraint' } }
        }
        const existing = onConflict ? db[table].find(r => onConflict!.every(c => (r[c] ?? 0) === (raw[c] ?? 0))) : undefined
        if (existing) { Object.assign(existing, raw); stored.push(existing) }
        else { const row: Row = { id: crypto.randomUUID(), ...raw }; db[table].push(row); stored.push(row) }
      }
      return { data: single ? stored[0] ?? null : stored, error: null }
    }
    if (op === 'update') {
      for (const r of db[table]) if (filters.every(f => f(r))) Object.assign(r, updateObj)
      return { data: null, error: null }
    }
    if (op === 'delete') {
      db[table] = db[table].filter(r => !filters.every(f => f(r)))
      return { data: null, error: null }
    }
    reads++
    let rows = db[table].filter(r => filters.every(f => f(r)))
    for (const [col, asc] of [...orders].reverse()) rows = [...rows].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]))
    if (limitN != null) rows = rows.slice(0, limitN)
    return { data: single ? (rows[0] ?? null) : rows.map(r => ({ ...r })), error: null }
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
    gte: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) >= 0); return api },
    lte: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) <= 0); return api },
    lt: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) < 0); return api },
    gt: (c: string, v: unknown) => { filters.push(r => cmp(r[c], v) > 0); return api },
    is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return api },
    match: (obj: Row) => { for (const [c, v] of Object.entries(obj)) filters.push(r => (r[c] ?? 0) === (v ?? 0)); return api },
    order: (c: string, opts?: { ascending?: boolean }) => { orders.push([c, opts?.ascending !== false]); return api },
    limit: (n: number) => { limitN = n; return api },
    maybeSingle: () => { single = true; return api },
    single: () => { single = true; return api },
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      // THE ANSWER IS COMPUTED NOW AND DELIVERED LATER when a read is held —
      // which is what a slow response is: the server read its rows before a
      // write that the phone hears about first.
      const answer = exec()
      const hold = table === 'exercise_set_logs' && op === 'select' ? holdNextSetRead : null
      if (hold) holdNextSetRead = null
      return (hold ? hold.taken : Promise.resolve()).then(() => resolve(answer), reject)
    },
  }
  return api
}

const fakeClient = { from: fakeFrom }

// --- Harness ---------------------------------------------------------------

let failures = 0
let ran = 0
function check(label: string, condition: boolean, extra?: unknown) {
  ran++
  if (condition) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — got ${JSON.stringify(extra)}` : ''}`) }
}

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient(fakeClient as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store = (await import('../src/lib/set-log-store')) as any
  const { saveSet, deleteSet, flushPending, getSetsForDate, getDeadLetterItems, getSyncState } = store
  // The read that can SAY it failed. Absent before the fix — every check that
  // needs it then fails by name instead of the gate crashing on an import.
  type Read = { rows: Array<Record<string, unknown>>; source: string; lastKnown: boolean }
  const read = async (userId: string, date: string): Promise<Read> =>
    typeof store.readSetsForDate === 'function'
      ? store.readSetsForDate(userId, date)
      : { rows: await getSetsForDate(userId, date), source: 'unreported', lastKnown: true }

  const userId = crypto.randomUUID()
  const date = '2026-10-09'
  const press = { exerciseId: 'dumbbell-floor-press', exerciseName: 'Dumbbell Floor Press' }
  const slides = { exerciseId: 'wall-slides', exerciseName: 'Wall Slides' }
  const set = (ex: typeof press, n: number, kg = 20, reps = 10) =>
    saveSet({ userId, date, weekNumber: 1, day: 'Friday', ...ex, setNumber: n, weightKg: kg, repsCompleted: reps, isBodyweight: kg === 0 })
  const named = (rows: Array<Record<string, unknown>>) => rows.map(r => `${r.exercise_id}#${r.set_number}`).sort()

  // ---- 1. A set that synced still has a copy on the phone -------------------
  console.log('\n[1] sets that synced, then the connection dies WITHOUT a read in between')
  set(slides, 1, 0, 12); set(slides, 2, 0, 12); set(press, 1)
  await flushPending()
  check('the three sets reached the server', db.exercise_set_logs.length === 3, db.exercise_set_logs.length)
  check('...and left the queue', getSyncState().queuedCount === 0, getSyncState())
  networkDead = true
  const afterDrop = await read(userId, date)
  check('a read on the dead connection still returns all three', afterDrop.rows.length === 3, named(afterDrop.rows))
  check('...and says the answer came from the phone, not the server', afterDrop.source === 'cache', afterDrop.source)
  check('the plain array read agrees (the readers that take an array are not left behind)',
    (await getSetsForDate(userId, date)).length === 3)

  // ---- 2. A read that DID land is remembered -------------------------------
  console.log('\n[2] a set the phone only knows from a server read (logged by the coach, or on another device)')
  networkDead = false
  const sessionId = db.workout_sessions.find(s => s.profile_id === userId && s.date === date)?.id
  db.exercise_set_logs.push({
    id: crypto.randomUUID(), session_id: sessionId, user_id: userId, exercise_id: 'skullcrushers', exercise_name: 'Skullcrushers',
    set_number: 1, weight_kg: 12, reps_completed: 10, is_bodyweight: false, is_warmup: false, unit: 'reps', rpe: null,
    completed_at: `${date}T18:00:00.000Z`,
  })
  const live = await read(userId, date)
  check('a read on a live connection returns four and says so', live.rows.length === 4 && live.source === 'server', { n: live.rows.length, source: live.source })
  networkDead = true
  const remembered = await read(userId, date)
  check('...and the same four come back once the connection is dead', remembered.rows.length === 4, named(remembered.rows))

  // ---- 3. A tick during the outage adds to the screen, never wipes it -------
  console.log('\n[3] tapping the tick while the connection is dead')
  set(press, 2)
  await flushPending()
  const midOutage = await read(userId, date)
  check('the new set joins the four already known — five, not one', midOutage.rows.length === 5, named(midOutage.rows))
  const waiting = midOutage.rows.find(r => r.exercise_id === press.exerciseId && r.set_number === 2)
  check('...and is marked as not sent yet, rather than passed off as saved', waiting?.syncStatus === 'waiting' || waiting?.syncStatus === 'saving', waiting?.syncStatus)
  check('...while a set the server already has carries no such mark',
    midOutage.rows.filter(r => r.exercise_id === slides.exerciseId).every(r => r.syncStatus === undefined),
    midOutage.rows.map(r => r.syncStatus))

  // ---- 4. A dead connection is not a reason to give up on a set -------------
  console.log('\n[4] ten more failed attempts on the same dead connection')
  for (let i = 0; i < 10; i++) await flushPending()
  check('the set is still queued — a set that never reached the server is not "failed"', getSyncState().queuedCount === 1, getSyncState())
  check('...nothing was moved to the "didn\'t save" list', getDeadLetterItems().length === 0, getDeadLetterItems())
  const stillThere = await read(userId, date)
  check('...and it is still on the screen', stillThere.rows.length === 5, named(stillThere.rows))
  check('...now marked as waiting for a connection',
    stillThere.rows.find(r => r.exercise_id === press.exerciseId && r.set_number === 2)?.syncStatus === 'waiting',
    stillThere.rows.find(r => r.exercise_id === press.exerciseId && r.set_number === 2)?.syncStatus)

  // ---- 5. Reconnect ---------------------------------------------------------
  console.log('\n[5] the connection comes back')
  networkDead = false
  await flushPending()
  check('the waiting set reaches the server on its own — no Retry tap', db.exercise_set_logs.length === 5, db.exercise_set_logs.length)
  const back = await read(userId, date)
  check('the day reads five from the server, none of them marked', back.source === 'server' && back.rows.length === 5 && back.rows.every(r => r.syncStatus === undefined),
    { source: back.source, marks: back.rows.map(r => r.syncStatus) })

  // ---- 6. A set the server REJECTS stays on the grid ------------------------
  console.log('\n[6] a set the server refuses outright')
  const kickback = { exerciseId: 'band-tricep-kickback', exerciseName: 'Band Tricep Kickback' }
  rejectExerciseId = kickback.exerciseId
  set(kickback, 1, 5, 15)
  await flushPending()
  check('it lands on the "didn\'t save" list', getDeadLetterItems().length === 1, getDeadLetterItems())
  const withFailed = await read(userId, date)
  const failedRow = withFailed.rows.find(r => r.exercise_id === kickback.exerciseId)
  check('...and is STILL in the day\'s view — it does not vanish from the grid', !!failedRow, named(withFailed.rows))
  check('...marked as failed, so the row can say so', failedRow?.syncStatus === 'failed', failedRow?.syncStatus)
  check('the plain array read leaves it out, as it always has — what the plan prescribes next never rested on a set the server refused',
    !(await getSetsForDate(userId, date)).some((r: Record<string, unknown>) => r.exercise_id === kickback.exerciseId))
  rejectExerciseId = null
  check('retrying it from the row is possible by naming the set', typeof store.retryFailedSet === 'function')
  store.retryFailedSet?.({ userId, date, exerciseId: kickback.exerciseId, setNumber: 1, isWarmup: false, dropIndex: 0 })
  await flushPending()
  const retried = await read(userId, date)
  check('...and once it lands the mark is gone and the list is empty',
    retried.rows.find(r => r.exercise_id === kickback.exerciseId)?.syncStatus === undefined && getDeadLetterItems().length === 0,
    { mark: retried.rows.find(r => r.exercise_id === kickback.exerciseId)?.syncStatus, dead: getDeadLetterItems().length })

  // A failed set that is then re-entered must not come back as "failed" on top
  // of its own replacement once the replacement has saved.
  rejectExerciseId = kickback.exerciseId
  set(kickback, 2, 5, 15)
  await flushPending()
  rejectExerciseId = null
  set(kickback, 2, 5, 12)
  await flushPending()
  const reentered = await read(userId, date)
  const k2 = reentered.rows.filter(r => r.exercise_id === kickback.exerciseId && r.set_number === 2)
  check('re-entering a failed set replaces it — one row, saved, twelve reps',
    k2.length === 1 && k2[0].syncStatus === undefined && k2[0].reps_completed === 12 && getDeadLetterItems().length === 0,
    { k2, dead: getDeadLetterItems().length })

  // ---- 7. A delete is remembered too ----------------------------------------
  console.log('\n[7] deleting a saved set, then losing the connection')
  deleteSet({ userId, date, exerciseId: kickback.exerciseId, setNumber: 2, isWarmup: false, dropIndex: 0 })
  await flushPending()
  networkDead = true
  const afterDelete = await read(userId, date)
  check('the deleted set does not come back from the phone\'s copy',
    !afterDelete.rows.some(r => r.exercise_id === kickback.exerciseId && r.set_number === 2), named(afterDelete.rows))
  check('...and everything else is still there', afterDelete.rows.length === 6, named(afterDelete.rows))
  networkDead = false

  // ---- 8. Empty and unknown are different answers ---------------------------
  console.log('\n[8] "nothing logged" and "could not check" are not the same answer')
  const fresh = '2026-10-10'
  const loadedEmpty = await read(userId, fresh)
  check('a day with nothing on it, read from the server: empty, and known', loadedEmpty.rows.length === 0 && loadedEmpty.source === 'server' && loadedEmpty.lastKnown === true, loadedEmpty)
  const other = '2026-10-11'
  networkDead = true
  const unknown = await read(userId, other)
  check('a day the phone has never managed to read: empty, from the phone, and NOT known',
    unknown.rows.length === 0 && unknown.source === 'cache' && unknown.lastKnown === false, unknown)
  const knownEmpty = await read(userId, fresh)
  check('the day that WAS read as empty stays known-empty when the connection dies', knownEmpty.source === 'cache' && knownEmpty.lastKnown === true, knownEmpty)
  networkDead = false

  // ---- 9. A slow answer cannot un-log a set ---------------------------------
  console.log('\n[9] a read answered BEFORE a set saved, arriving AFTER it')
  const raceDate = '2026-10-12'
  await read(userId, raceDate)
  ;(globalThis.navigator as { onLine: boolean }).onLine = false   // hold the flush, not the read
  saveSet({ userId, date: raceDate, weekNumber: 1, day: 'Monday', ...press, setNumber: 1, weightKg: 20, repsCompleted: 10 })
  await flushPending()
  ;(globalThis.navigator as { onLine: boolean }).onLine = true
  // First sync the session row so the held read actually reaches the set-logs query.
  await store.ensureSessionSynced(userId, raceDate)
  let release!: () => void
  holdNextSetRead = { release: () => release(), taken: new Promise<void>(r => { release = r }) }
  const slow = read(userId, raceDate)
  await new Promise(r => setTimeout(r, 20))             // the server has answered: no rows yet
  await flushPending()                                   // ...and now the set saves and leaves the queue
  check('(the set did save while the read was in flight)', db.exercise_set_logs.some(r => r.exercise_id === press.exerciseId && String(r.completed_at ?? '').length > 0 && getSyncState().queuedCount === 0))
  release()
  const slowAnswer = await slow
  check('the late answer still shows the set', slowAnswer.rows.length === 1, named(slowAnswer.rows))
  networkDead = true
  const afterSlow = await read(userId, raceDate)
  check('...and the phone\'s copy was not overwritten with the stale, empty answer', afterSlow.rows.length === 1, named(afterSlow.rows))
  networkDead = false

  // ---- 10. What the phone knows, without waiting for the network ------------
  console.log('\n[10] the phone\'s own copy, read with no request at all')
  const before = reads
  const local = typeof store.getLocalSetsForDate === 'function' ? store.getLocalSetsForDate(userId, date) : null
  check('there is a synchronous read of the day', !!local && Array.isArray(local.rows))
  check('...it made no request', reads === before, reads - before)
  check('...and holds the same six sets the server has', local?.rows.length === 6, local ? named(local.rows) : null)

  // ---- 11. Cardio: the same hole, the same answer ---------------------------
  console.log('\n[11] a logged finisher on a dead connection')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardio = (await import('../src/lib/cardio-log-store')) as any
  const readCardio = async (): Promise<{ rows: Array<Record<string, unknown>>; source: string }> =>
    typeof cardio.readCardioLogsForDate === 'function'
      ? cardio.readCardioLogsForDate(userId, date)
      : { rows: await cardio.getCardioLogsForDateMerged(userId, date), source: 'unreported' }
  cardio.saveCardioLog({ userId, date, activityName: 'Brisk Walk or Light Cycling', durationMinutes: 30, intensityRpe: 4 })
  await cardio.flushPending()
  check('the walk reached the server', db.cardio_logs.length === 1, db.cardio_logs.length)
  const cardioLive = await readCardio()
  check('read on a live connection: one walk, from the server', cardioLive.rows.length === 1 && cardioLive.source === 'server', cardioLive)
  networkDead = true
  const cardioDead = await readCardio()
  check('read on a dead connection: the walk is still logged', cardioDead.rows.length === 1, cardioDead)
  check('...and the read says it could not reach the server', cardioDead.source === 'cache', cardioDead.source)
  // Ten minutes on, the store has dropped its own short-lived copy (the Undo
  // window). The walk must not go with it.
  const KEY = 'fitplan_cardio_pending_v1'
  storeMap.set(KEY, JSON.stringify((JSON.parse(storeMap.get(KEY) ?? '[]') as Array<{ status: string }>).filter(i => i.status !== 'synced')))
  const cardioLater = await readCardio()
  check('...including after the Undo window has closed', cardioLater.rows.length === 1, cardioLater)
  cardio.saveCardioLog({ userId, date, activityName: 'skipping rope', durationMinutes: 12, intensityRpe: 6 })
  for (let i = 0; i < 10; i++) await cardio.flushPending()
  const cardioBoth = await readCardio()
  check('a second activity logged during the outage joins it', cardioBoth.rows.length === 2, cardioBoth.rows.map(r => r.activity_name))
  check('...and ten failed attempts later it is still waiting, not filed under "didn\'t save"',
    cardio.getPendingCardioFailures().length === 0 && cardioBoth.rows.find(r => r.activity_name === 'skipping rope')?.syncStatus === 'pending',
    { failed: cardio.getPendingCardioFailures().length, status: cardioBoth.rows.find(r => r.activity_name === 'skipping rope')?.syncStatus })
  check('the array read agrees', (await cardio.getCardioLogsForDateMerged(userId, date)).length === 2)
  networkDead = false
  await cardio.flushPending()
  const cardioBack = await readCardio()
  check('reconnected: both, once each, from the server', cardioBack.source === 'server' && cardioBack.rows.length === 2, cardioBack.rows.map(r => r.activity_name))
  // The same case [1] makes for sets: a log that SYNCED with no read after it.
  // The read above is not what keeps it — the copy made when it saved is.
  cardio.saveCardioLog({ userId, date, activityName: 'Swim', durationMinutes: 20, intensityRpe: 4 })
  await cardio.flushPending()
  check('(a third log reached the server, and nothing has read the day since)', db.cardio_logs.length === 3, db.cardio_logs.length)
  networkDead = true
  storeMap.set(KEY, JSON.stringify((JSON.parse(storeMap.get(KEY) ?? '[]') as Array<{ status: string }>).filter(i => i.status !== 'synced')))
  const cardioUnread = await readCardio()
  check('a log that saved, with no read since and the Undo window closed, is still there on a dead connection',
    cardioUnread.rows.some(r => r.activity_name === 'Swim') && cardioUnread.rows.length === 3, cardioUnread.rows.map(r => r.activity_name))
  networkDead = false

  // ---- 12. The words ---------------------------------------------------------
  console.log('\n[12] what a person is told when something did not save')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const voice = (await import('../src/lib/coach-voice')) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const health = (await import('../src/lib/queue-health')) as any
  const plain = typeof health.plainSyncError === 'function' ? health.plainSyncError : null
  check('there is one place that turns a failure into words', !!plain)
  const RAW = [
    'TypeError: Failed to fetch',
    'TypeError: NetworkError when attempting to fetch resource.',
    'TypeError: Load failed',
    'new row for relation "exercise_set_logs" violates check constraint "weight_kg_check"',
    'numeric field overflow',
    "Wouldn't sync",
    '',
  ]
  for (const raw of RAW) {
    const said: string = plain ? plain(raw) : raw
    check(`"${raw || '(empty)'}" → no code words reach the screen`,
      said.length > 0 && !/TypeError|fetch|NetworkError|relation|constraint|numeric|overflow|undefined|null|NaN|\bsync\b/i.test(said), said)
  }
  check('a dead connection and a refused write are told apart',
    !!plain && plain('TypeError: Failed to fetch') !== plain('numeric field overflow'))
  check('...and a refusal that happens to mention a timeout is still a refusal when the queue says so',
    !!plain && plain('canceling statement due to statement timeout', { refused: true }) === plain('numeric field overflow'))

  // THE CARD ITSELF. The words above are only worth anything if the card
  // shows them — it printed `item.errorMessage` straight onto the screen.
  // Comments stripped first, or the note explaining the removal would satisfy
  // the check that it was removed.
  const { readFileSync } = await import('fs')
  const { join, dirname } = await import('path')
  const { fileURLToPath } = await import('url')
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const strip = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const card = strip(readFileSync(join(root, 'src/components/OfflineStatusIndicator.tsx'), 'utf8'))
  check('the card never draws the raw failure', !/\{\s*item\.errorMessage\s*\}/.test(card))
  check('...it draws the plain sentence in its place', /\{\s*plainSyncError\(item\.errorMessage/.test(card))
  check('no colour on it depends on a `dark:` class nothing in this app ever sets', !/\bdark:/.test(card), card.match(/\bdark:[\w/-]+/g))

  // ---- 13. What the session screen says about a count it cannot make ---------
  console.log('\n[13] the count, and the line under the session title')
  const count = voice.loggedCountLabel as ((n: number, s: { known: boolean; loading: boolean }) => string) | undefined
  check('a known day with nothing on it reads "0 logged"', count?.(0, { known: true, loading: false }) === '0 logged', count?.(0, { known: true, loading: false }))
  check('a day the phone cannot check never reads "0 logged"',
    !!count && !/\b0 logged/.test(count(0, { known: false, loading: true })) && !/\b0 logged/.test(count(0, { known: false, loading: false })),
    count ? [count(0, { known: false, loading: true }), count(0, { known: false, loading: false })] : null)
  check('...and says different things while it is still asking and once it has failed',
    !!count && count(0, { known: false, loading: true }) !== count(0, { known: false, loading: false }))
  check('a set held on the phone is counted even when the day could not be checked', count?.(1, { known: false, loading: false }) === '1 logged')
  const line = voice.reconnectingLine as ((known: boolean) => string) | undefined
  check('"your sets are safe" is only said when the phone holds them', !!line && /safe/i.test(line(true)) && !/safe/i.test(line(false)), line ? [line(true), line(false)] : null)

  // ---- Summary -----------------------------------------------------------------
  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} sets-never-lost check(s) FAILED.`); process.exitCode = 1; return }
  console.log('All sets-never-lost checks passed.')
}

main().catch(err => {
  console.error('Test crashed:', err)
  process.exitCode = 1
}).finally(() => { process.exit(process.exitCode ?? 0) })
