// ---------------------------------------------------------------------------
// test:circuit-log — A WORKOUT MADE OF TIMER BLOCKS (Ashley's ruling A, 8 Oct 2026,
// docs/plans/timer-circuit-log.md). She skipped her session and did 5 x 3 min skipping
// rope, 3 x 30s push-ups, 3 x 30s sit-ups and 5 x 15s assault bike on 45s rest off the
// round timer, and the app could only call each block "Intervals".
//
// Holds: the shape and name a block is written down as; when "count it as today's
// workout" is offered (and every case where it must not be); the coach's evidence
// rules (every number and the effort are HERS); and the coach's write and Undo, run
// against a fake database, leaving the same rows the screen leaves.
// ---------------------------------------------------------------------------
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


let failures = 0
let ran = 0
function check(label: string, condition: boolean, extra?: unknown) {
  ran++
  if (condition) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — got ${JSON.stringify(extra)}` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
import { readFileSync } from 'fs'

const HER_MESSAGE = 'This morning I went to the gym and didnt do the prescribed workout. Instead I used the apps round timee and did 5rounds of 3mins of skipping rope, 3rounds of 30seconds push ups,3x30secs sits ups and then 5x15seconds on 45seconds rest on the assault bike. Thats still a decent workout but the app has no way of logging or tracking that.'

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient(fakeClient as any)
  const { blockShape } = await import('../src/lib/timer-engine')
  const { circuitName, blockNames, blockLine, circuitOfferFor, BLOCK_NAMES } = await import('../src/lib/circuit')
  const ev = await import('../supabase/functions/_shared/message-evidence.ts')

  console.log('\n1. A block is written down the way she would write it')
  check('5 × 3 min of rope', blockShape({ rounds: 5, workSeconds: 180, restSeconds: 0 }) === '5 × 3 min', blockShape({ rounds: 5, workSeconds: 180, restSeconds: 0 }))
  check('3 × 30s of push-ups', blockShape({ rounds: 3, workSeconds: 30, restSeconds: 0 }) === '3 × 30s', blockShape({ rounds: 3, workSeconds: 30, restSeconds: 0 }))
  check('5 × 15s on the bike, with its 45s rest', blockShape({ rounds: 5, workSeconds: 15, restSeconds: 45 }) === '5 × 15s, 45s rest', blockShape({ rounds: 5, workSeconds: 15, restSeconds: 45 }))
  check('an EMOM by its interval', blockShape({ rounds: 10, workSeconds: 60, restSeconds: 0, style: 'emom' }) === '10 × every 1 min')
  check('the timer offers her four blocks by name', ['Skipping rope', 'Push-ups', 'Sit-ups', 'Assault bike'].every(n => (BLOCK_NAMES as readonly string[]).includes(n)), BLOCK_NAMES)
  check('...and never "Intervals"', !(BLOCK_NAMES as readonly string[]).some(n => /interval/i.test(n)))

  console.log('\n2. The day is named for its blocks')
  const four = [{ activity_name: 'Skipping rope' }, { activity_name: 'Push-ups' }, { activity_name: 'Sit-ups' }, { activity_name: 'Assault bike' }]
  check('four blocks', circuitName(blockNames(four)) === 'Circuit: Skipping rope, Push-ups, Sit-ups and Assault bike', circuitName(blockNames(four)))
  check('one block is just its name', circuitName(['Skipping rope']) === 'Skipping rope')
  check('the same block twice is named once, first place kept',
    JSON.stringify(blockNames([{ activity_name: 'Push-ups' }, { activity_name: 'Rope' }, { activity_name: 'push-ups ' }])) === JSON.stringify(['Push-ups', 'Rope']))
  check('a block reads back with its shape', blockLine({ activity_name: 'Push-ups', duration_minutes: 2, notes: '3 × 30s' }) === 'Push-ups · 3 × 30s')
  check('...or its minutes when it has none', blockLine({ activity_name: 'Run', duration_minutes: 20, notes: null }) === 'Run · 20 min')

  console.log('\n3. "Count it as today\'s workout" is offered only when it is true and still open')
  const logs = [{ activity_name: 'Skipping rope', duration_minutes: 15, notes: '5 × 3 min' }, { activity_name: 'Push-ups', duration_minutes: 2, notes: '3 × 30s' }]
  const base = { dayState: 'due' as const, sessionFocus: 'Upper Pull & Core', sessionHasExercises: true, workingSetsToday: 0, logs }
  const yes = circuitOfferFor(base)
  check('blocks logged, the session still due: offered', !!yes, yes)
  check('...naming the session it would replace', yes?.sessionFocus === 'Upper Pull & Core', yes)
  check('...and the name the day will carry', yes?.name === 'Circuit: Skipping rope and Push-ups', yes?.name)
  check('...with every block on its own line', JSON.stringify(yes?.lines) === JSON.stringify(['Skipping rope · 5 × 3 min', 'Push-ups · 3 × 30s']), yes?.lines)
  for (const state of ['swapped', 'moved', 'partial', 'done', 'rest_chosen', 'missed', 'rest', 'recovery'] as const) {
    check(`not when the day is already ${state}`, circuitOfferFor({ ...base, dayState: state }) === null)
  }
  check('not once she has lifted today (the blocks are extra work, not instead)', circuitOfferFor({ ...base, workingSetsToday: 1 }) === null)
  check('not on a day with no lifting session', circuitOfferFor({ ...base, sessionFocus: null, sessionHasExercises: false }) === null)
  check('not on a walk day (nothing to lift to replace)', circuitOfferFor({ ...base, sessionHasExercises: false }) === null)
  check('not with nothing logged', circuitOfferFor({ ...base, logs: [] }) === null)

  console.log('\n4. The coach builds the card only from what SHE said')
  const secs = ev.statedDurationsSeconds(HER_MESSAGE)
  check('her message, as typed, yields 3 min, 30s, 15s and 45s', [180, 30, 15, 45].every(n => secs.includes(n)), secs)
  check('...and her round counts', ev.statedCount(HER_MESSAGE, 5) && ev.statedCount(HER_MESSAGE, 3), null)
  check('...but not a count she never wrote', !ev.statedCount(HER_MESSAGE, 4) && !ev.statedCount(HER_MESSAGE, 8), null)
  check('...nor the 3 hiding inside "30"', !ev.statedCount('30 seconds of push-ups', 3), null)
  check('"five rounds" counts as 5', ev.statedCount('five rounds of skipping', 5), null)
  check('"a decent workout" is NOT an effort', ev.statedEffort(HER_MESSAGE) === null, ev.statedEffort(HER_MESSAGE))
  check('"hard" is hard', ev.statedEffort('it was hard') === 'hard')
  check('"steady" is steady', ev.statedEffort('pretty steady really') === 'steady')
  check('the last effort she named wins', ev.statedEffort('started easy, finished brutal') === 'hard', ev.statedEffort('started easy, finished brutal'))

  const server = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
  const h0 = server.indexOf('if (name === "propose_circuit_log")')
  const handler = h0 >= 0 ? server.slice(h0, server.indexOf('if (name === "log_meal")', h0)) : ''
  const at = (re: RegExp) => { const m = re.exec(handler); return m ? m.index : -1 }
  const checkRounds = at(/statedCount\(evidence, rounds\)/)
  const checkWork = at(/said\(work\)/)
  const askEffort = at(/if \(!effort\)/)
  const card = at(/kind: "propose_circuit_log"/)
  check('the handler exists', handler.length > 0)
  check('a block is refused unless she stated its rounds and work time', checkRounds >= 0 && checkWork >= 0 && checkRounds < card && checkWork < card, { checkRounds, checkWork, card })
  check('a rest she never gave is zero, not the model\'s number', /rest > 0 && said\(rest\) \? rest : 0/.test(handler))
  check('no effort in her words: it asks, before any card', askEffort >= 0 && card >= 0 && askEffort < card, { askEffort, card })
  check('the effort on the card is hers, never the model\'s argument', /effort = statedEffort\(/.test(handler) && !/args\.effort/.test(handler))
  check('the evidence is her messages, not the assistant\'s', /t\.role !== "assistant"/.test(handler))

  console.log('\n5. The coach writes the rows the screen writes, and Undo removes them')
  const { executeCircuitLog, undoCircuitLog } = await import('../src/lib/pending-action-executor')
  const { flushPending: flushCardio } = await import('../src/lib/cardio-log-store')
  const PID = 'circuit-user'
  const payload = {
    date: '2026-10-08', dayName: 'Thursday', intensityRpe: 8,
    swapName: 'Circuit: Skipping rope and Assault bike', sessionFocus: 'Upper Pull & Core',
    blocks: [
      { activityName: 'Skipping rope', rounds: 5, workSeconds: 180, restSeconds: 0, durationMinutes: 15, shape: '5 × 3 min' },
      { activityName: 'Assault bike', rounds: 5, workSeconds: 15, restSeconds: 45, durationMinutes: 4, shape: '5 × 15s, 45s rest' },
    ],
  }
  // An unrelated block on the same day with the SAME shape as one of the circuit's, which Undo
  // must leave alone: only name AND shape together pick out what the card wrote.
  db.cardio_logs.push({ id: 'keep-me', user_id: PID, date: '2026-10-08', activity_name: 'Rowing', duration_minutes: 15, intensity_rpe: 3, notes: '5 × 3 min' })
  const result = await executeCircuitLog({ id: PID } as never, payload)
  await flushCardio()
  const mine = () => db.cardio_logs.filter(r => r.user_id === PID)
  check('it reports success', result.receipt.failed.length === 0, result.receipt)
  check('one cardio row per block, under its own name', JSON.stringify(mine().map(r => r.activity_name).sort()) === JSON.stringify(['Assault bike', 'Rowing', 'Skipping rope']), mine())
  check('...each with its shape as the note', mine().some(r => r.activity_name === 'Assault bike' && r.notes === '5 × 15s, 45s rest'), mine())
  check('...the minutes by the timer\'s rule', mine().find(r => r.activity_name === 'Skipping rope')?.duration_minutes === 15, mine())
  check('...and her stated effort, not a default', mine().every(r => r.id === 'keep-me' || r.intensity_rpe === 8), mine())
  const day = () => db.workout_sessions.find(r => r.profile_id === PID && r.date === '2026-10-08')
  check('the day is counted as her workout, named for the blocks', day()?.swapped_for_activity === 'Circuit: Skipping rope and Assault bike', day())
  check('...with no extra cardio row for the swap itself', mine().length === 3, mine().length)
  const undone = await undoCircuitLog(PID, payload)
  check('Undo reports success', undone === true)
  check('Undo removes the blocks', mine().length === 1 && mine()[0].id === 'keep-me', mine())
  check('...and clears the swap', day()?.swapped_for_activity == null, day())

  const noSwap = await executeCircuitLog({ id: 'circuit-two' } as never, { ...payload, swapName: null })
  await flushCardio()
  check('without a session to replace it logs the blocks and marks nothing', noSwap.receipt.failed.length === 0
    && !db.workout_sessions.some(r => r.profile_id === 'circuit-two'), db.workout_sessions)

  console.log('\n6. Both screens show the same offer, and the timer names the block')
  const today = strip(readFileSync('src/components/exercise/TodayPanel.tsx', 'utf8'))
  const tools = strip(readFileSync('src/components/ToolsTab.tsx', 'utf8'))
  const offer = strip(readFileSync('src/components/exercise/CircuitOffer.tsx', 'utf8'))
  check('Today renders the offer', /<CircuitOffer[\s\S]{0,300}session=\{workout\}/.test(today))
  check('Tools renders the same offer under a logged block', /loggedNote && \(\s*<CircuitOffer/.test(tools))
  check('the offer decides through circuitOfferFor', /circuitOfferFor\(\{/.test(offer))
  check('...and writes the day swap with the offer\'s own name', /setSwappedForActivity\(profileId, date, offer\.name\)/.test(offer))
  check('...and writes no cardio row of its own', !/saveCardioLog/.test(offer))
  const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
  const b0 = chat.indexOf('const buildCircuitLogProposal')
  const builder = b0 >= 0 ? chat.slice(b0, chat.indexOf('const buildMissedSessionProposal', b0)) : ''
  check('the coach\'s card shapes blocks with the timer\'s blockShape', /shape: blockShape\(config\)/.test(builder))
  check('...names the day with circuitName', /circuitName\(blocks\.map/.test(builder))
  check('...and only replaces a session that is still due', /dayState === 'due'/.test(builder))
}

main().catch(err => { console.error('Test crashed:', err); failures++ }).finally(() => {
  console.log(`\n${ran} checks ran`)
  console.log(failures === 0 ? '\nA circuit is logged block by block, by both surfaces, from what she said.\n' : `\n${failures} circuit-log check(s) FAILED.\n`)
  process.exit(failures === 0 ? 0 : 1)
})
