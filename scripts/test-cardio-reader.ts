/**
 * H7 + H21 + M14, 9 Oct 2026 — "One cardio reader".
 *
 * The tester logged "skipping rope, 12 min, Steady" from the Exercise tab and
 * the planned finisher "Brisk Walk or Light Cycling · 30 min · Easy". Both
 * saved. Neither appeared in the session, on the Session complete card, in
 * Session history or on Home, and the coach said the rope "hasn't been written
 * down yet". A day replaced by football showed a ⇄ and nothing else.
 *
 * The cause was not a lost write. `cardio_logs` had three partial readers —
 * one date with the queue merged (the rest-day card), fourteen and thirty-five
 * days from the server alone (the coach, the streak) — and the surfaces above
 * had none at all. This gate pins the one reader they share now, and what each
 * of them is handed from it.
 *
 * THE FAKE HONOURS ITS FILTERS (a range read that ignored `gte`/`lte` would
 * pass a reader that forgot to send them) AND CAN FAIL, because half of what
 * "the coach is told" means is "including what has not reached the server".
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
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })

type Row = Record<string, unknown>
const db: Record<string, Row[]> = {
  workout_sessions: [], exercise_set_logs: [], cardio_logs: [],
  daily_metrics: [], daily_nutrition_targets: [], workout_exercises: [],
}
let networkDead = false
const DEAD = () => ({ data: null, error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' } })
/** Every filter each cardio read was sent with — so "it asked for a range" is checked, not assumed. */
const cardioReads: string[][] = []

function cmp(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  const sent: string[] = []
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
        const existing = onConflict ? (db[table] ??= []).find(r => onConflict!.every(c => (r[c] ?? 0) === (raw[c] ?? 0))) : undefined
        if (existing) { Object.assign(existing, raw); stored.push(existing) }
        else { const row: Row = { id: crypto.randomUUID(), ...raw }; (db[table] ??= []).push(row); stored.push(row) }
      }
      return { data: single ? stored[0] ?? null : stored, error: null }
    }
    if (op === 'update') { for (const r of db[table] ?? []) if (filters.every(f => f(r))) Object.assign(r, updateObj); return { data: null, error: null } }
    if (op === 'delete') { db[table] = (db[table] ?? []).filter(r => !filters.every(f => f(r))); return { data: null, error: null } }
    if (table === 'cardio_logs') cardioReads.push([...sent])
    let rows = (db[table] ?? []).filter(r => filters.every(f => f(r)))
    for (const [col, asc] of [...orders].reverse()) rows = [...rows].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]))
    if (limitN != null) rows = rows.slice(0, limitN)
    return { data: single ? (rows[0] ?? null) : rows.map(r => ({ ...r })), error: null }
  }
  const f = (name: string, c: string, v: unknown, test: (r: Row) => boolean) => { sent.push(`${name}:${c}:${String(v)}`); filters.push(test); return api }
  const api: Record<string, unknown> = {
    select: () => api,
    insert: (rows: Row | Row[]) => { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return api },
    upsert: (rows: Row | Row[], opts?: { onConflict?: string }) => { op = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]; onConflict = opts?.onConflict ? opts.onConflict.split(',') : null; return api },
    update: (obj: Row) => { op = 'update'; updateObj = obj; return api },
    delete: () => { op = 'delete'; return api },
    eq: (c: string, v: unknown) => f('eq', c, v, r => r[c] === v),
    gte: (c: string, v: unknown) => f('gte', c, v, r => cmp(r[c], v) >= 0),
    lte: (c: string, v: unknown) => f('lte', c, v, r => cmp(r[c], v) <= 0),
    lt: (c: string, v: unknown) => f('lt', c, v, r => cmp(r[c], v) < 0),
    gt: (c: string, v: unknown) => f('gt', c, v, r => cmp(r[c], v) > 0),
    is: (c: string, v: unknown) => f('is', c, v, r => (r[c] ?? null) === v),
    not: (c: string, o: string, v: unknown) => f('not', c, v, r => (o === 'is' ? (r[c] ?? null) !== v : r[c] !== v)),
    in: (c: string, vs: unknown[]) => f('in', c, vs.length, r => vs.includes(r[c])),
    match: (obj: Row) => { for (const [c, v] of Object.entries(obj)) filters.push(r => (r[c] ?? 0) === (v ?? 0)); return api },
    order: (c: string, opts?: { ascending?: boolean }) => { orders.push([c, opts?.ascending !== false]); return api },
    limit: (n: number) => { limitN = n; return api },
    maybeSingle: () => { single = true; return api },
    single: () => { single = true; return api },
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve().then(() => resolve(exec()), reject),
  }
  return api
}

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
  setSupabaseClient({ from: fakeFrom } as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const any = async (path: string) => (await import(path)) as any
  const cardio = await any('../src/lib/cardio-log-store')
  const sets = await any('../src/lib/set-log-store')
  const history = await any('../src/lib/exercise-history')
  const tracking = await any('../src/lib/daily-tracking')
  // Absent before the fix — each check that needs one then fails by name.
  const lines = await import('../src/lib/cardio-lines').then(m => m as Record<string, unknown>).catch(() => ({} as Record<string, unknown>))
  const glyphs = await any('../src/lib/week-glyphs')

  const userId = crypto.randomUUID()
  const THU = '2026-10-08'   // a lifting day with a planned finisher and some rope
  const TUE = '2026-10-06'   // lifting swapped for football
  const SUN = '2026-10-04'   // nothing lifted; a walk
  const FRI = '2026-10-09'   // nothing lifted; a swim — NEWER than every session, so the list's order is really tested
  const FINISHER = 'Brisk Walk or Light Cycling'

  // ---- The tester's Thursday ------------------------------------------------
  sets.saveSet({ userId, date: THU, weekNumber: 1, day: 'Thursday', exerciseId: 'goblet-squat', exerciseName: 'Goblet Squat', setNumber: 1, weightKg: 16, repsCompleted: 10 })
  sets.saveSet({ userId, date: THU, weekNumber: 1, day: 'Thursday', exerciseId: 'goblet-squat', exerciseName: 'Goblet Squat', setNumber: 2, weightKg: 16, repsCompleted: 10 })
  await sets.flushPending()
  cardio.saveCardioLog({ userId, date: THU, activityName: FINISHER, durationMinutes: 30, intensityRpe: 4 })
  cardio.saveCardioLog({ userId, date: THU, activityName: 'skipping rope', durationMinutes: 12, intensityRpe: 5 })
  cardio.saveCardioLog({ userId, date: SUN, activityName: 'Walk', durationMinutes: 45, intensityRpe: 3 })
  cardio.saveCardioLog({ userId, date: FRI, activityName: 'Swim', durationMinutes: 20, intensityRpe: 5 })
  await cardio.flushPending()
  // Tuesday: "I did something else instead" — the day flag, and the activity's own log.
  db.workout_sessions.push({ id: crypto.randomUUID(), profile_id: userId, date: TUE, split_type: 'swapped', duration_minutes: 0, is_completed: false, swapped_for_activity: 'Football', day: null })
  cardio.saveCardioLog({ userId, date: TUE, activityName: 'Football', durationMinutes: 60, intensityRpe: 7, notes: 'Swapped in place of the prescribed lifting session' })
  await cardio.flushPending()
  check('(the fixture: five cardio logs and two set rows reached the server)', db.cardio_logs.length === 5 && db.exercise_set_logs.length === 2, { cardio: db.cardio_logs.length, sets: db.exercise_set_logs.length })

  // ---- 1. The one reader ------------------------------------------------------
  console.log('\n[1] one reader, over a range of days')
  const read = cardio.readCardioLogs as ((u: string, r: { from: string; to?: string }) => Promise<{ rows: Row[]; source: string }>) | undefined
  check('there is a ranged reader', typeof read === 'function')
  cardioReads.length = 0
  const week = read ? await read(userId, { from: TUE, to: THU }) : { rows: [], source: 'none' }
  check('Tuesday to Thursday: football, the walk-or-cycle and the rope — not Sunday\'s walk',
    week.rows.map(r => r.activity_name).sort().join('|') === ['Football', FINISHER, 'skipping rope'].sort().join('|'), week.rows.map(r => r.activity_name))
  check('...and it ASKED the server for that range, rather than filtering afterwards',
    cardioReads.some(sent => sent.includes(`gte:date:${TUE}`) && sent.includes(`lte:date:${THU}`)), cardioReads)
  check('...for this person only', cardioReads.every(sent => sent.includes(`eq:user_id:${userId}`)), cardioReads)
  const open = read ? await read(userId, { from: THU }) : { rows: [], source: 'none' }
  check('an open-ended range reaches everything from that day on', open.rows.map(r => r.activity_name).sort().join('|') === [FINISHER, 'Swim', 'skipping rope'].sort().join('|'), open.rows.map(r => r.activity_name))

  // Something logged a second ago, on a connection that has just died.
  networkDead = true
  cardio.saveCardioLog({ userId, date: THU, activityName: 'Stretching', durationMinutes: 10, intensityRpe: 3 })
  await cardio.flushPending()
  const dead = read ? await read(userId, { from: TUE, to: THU }) : { rows: [], source: 'none' }
  check('with the connection dead it still answers — the three it knew, plus the one waiting on the phone',
    dead.rows.length === 4 && dead.source === 'cache' && dead.rows.some(r => r.activity_name === 'Stretching' && r.syncStatus === 'pending'),
    { n: dead.rows.length, source: dead.source, names: dead.rows.map(r => r.activity_name) })
  const deadOut = read ? await read(userId, { from: SUN, to: SUN }) : { rows: [], source: 'none' }
  check('...and a waiting log does not leak into a range it is not in', deadOut.rows.every(r => r.activity_name !== 'Stretching'), deadOut.rows.map(r => r.activity_name))

  // ---- 2. The coach -----------------------------------------------------------
  console.log('\n[2] what the coach is told')
  const forCoach = tracking.cardioHistoryForCoach as ((u: string, today: string, days?: number) => Promise<string>) | undefined
  // Before the fix the coach's text came from the server-only read.
  const coachText = forCoach
    ? await forCoach(userId, THU, 14)
    : tracking.formatCardioLogsForAI(await tracking.getRecentCardioLogs(userId, 3650).catch(() => []))
  check('the coach is told about the rope logged on the Exercise tab', /skipping rope for 12min/.test(coachText), coachText)
  check('...and the planned finisher', new RegExp(`${FINISHER} for 30min`).test(coachText), coachText)
  check('...AND WHAT HAS NOT REACHED THE SERVER YET — "it hasn\'t been written down" was this', /Stretching for 10min/.test(coachText), coachText)
  check('...each under its own date', new RegExp(`${TUE}: Football for 60min`).test(coachText) && new RegExp(`${THU}: .*skipping rope`).test(coachText), coachText)
  const narrow = forCoach ? await forCoach(userId, THU, 1) : ''
  check('the window is honoured: one day back from Thursday leaves Tuesday\'s football out', !!forCoach && !/Football/.test(narrow) && /skipping rope/.test(narrow), narrow)
  check('...and is counted back from the day it is given, not from the machine\'s clock', !!forCoach && /Football/.test(await forCoach(userId, THU, 2)))
  networkDead = false
  await cardio.flushPending()

  // ---- 3. Session history -----------------------------------------------------
  console.log('\n[3] session history')
  const entries: Row[] = await history.getSessionHistory(userId)
  const thu = entries.find(e => e.date === THU)
  const thuCardio = (thu?.cardio ?? []) as string[]
  check('Thursday\'s session lists its finisher, as its own line (H21)', thuCardio.includes(`${FINISHER} · 30 min · Easy`), thu)
  check('...and the unplanned rope (H7)', thuCardio.includes('skipping rope · 12 min · Steady'), thu)
  check('...WITHOUT folding the minutes into the lifting figures: still 2 sets, 320 kg',
    thu?.totalSets === 2 && thu?.totalVolumeKg === 320, { sets: thu?.totalSets, kg: thu?.totalVolumeKg })
  check('...or into its duration', thu?.durationMinutes === 45, thu?.durationMinutes)
  const sun = entries.find(e => e.date === SUN)
  check('a day with cardio and no lifting is in the history too', !!sun && ((sun.cardio ?? []) as string[]).includes('Walk · 45 min · Easy'), sun)
  check('...marked as cardio only, so a count of lifting sessions can leave it out', sun?.cardioOnly === true, sun)
  check('...and never marked as a failed load', !sun?.loadError, sun)
  const tue = entries.find(e => e.date === TUE)
  check('the day swapped for football says so: "Football · 60 min · Hard" (M14)', ((tue?.cardio ?? []) as string[]).includes('Football · 60 min · Hard'), tue)
  check('one entry per date — the swapped day is not listed twice', entries.filter(e => e.date === TUE).length === 1, entries.filter(e => e.date === TUE).length)
  check('newest first — Friday\'s swim above Thursday\'s session, Sunday\'s walk last', entries.map(e => e.date).join(',') === [FRI, THU, TUE, SUN].join(','), entries.map(e => e.date))
  check('...a cardio-only day carries its weekday, like every other row', sun?.day === 'Sunday', sun?.day)
  // RE-ANCHORED 9 Oct 2026 (M15/M30). This expected Tuesday among the LIFTING
  // sessions: its row is the "swapped for football" note, with no set in it,
  // and history listed every row ("swapped · 0m · 0kg · 0 sets"). A row with
  // no working set is a note about a day; Tuesday is still in the history —
  // once — as the activity it was.
  check('the lifting sessions are the days somebody lifted: Thursday alone', entries.filter(e => !e.cardioOnly).map(e => e.date).sort().join(',') === [THU].join(','), entries.filter(e => !e.cardioOnly).map(e => e.date))
  check('...and the swapped day is an activity entry, not a session with nothing in it', tue?.cardioOnly === true && tue?.totalSets === 0, tue)

  // ---- 4. Which logs a training day lists under "Additional work" --------------
  console.log('\n[4] the training day: what the finisher row shows, and what is left over')
  const unclaimed = lines.unclaimedCardio as ((logs: Row[], claimed: readonly (string | null | undefined)[]) => Row[]) | undefined
  check('there is one rule for it', typeof unclaimed === 'function')
  const today = (await cardio.getCardioLogsForDateMerged(userId, THU)) as Row[]
  const left = unclaimed ? unclaimed(today, [FINISHER, undefined]) : []
  check('the finisher is left to its own row; the rope and the stretch are the receipts',
    left.map(r => r.activity_name).sort().join('|') === 'Stretching|skipping rope', left.map(r => r.activity_name))
  const twoWalks = [{ activity_name: 'Walk', id: 'a' }, { activity_name: 'Walk', id: 'b' }, { activity_name: 'Row', id: 'c' }]
  check('a planned row claims ONE log — a second walk on a walking day is still shown',
    !!unclaimed && unclaimed(twoWalks, ['Walk']).map(r => r.id).join(',') === 'b,c', unclaimed?.(twoWalks, ['Walk']))
  check('nothing planned: every log is a receipt', !!unclaimed && unclaimed(twoWalks, []).length === 3)
  check('a planned activity nobody logged claims nothing', !!unclaimed && unclaimed(twoWalks, ['Swim', null]).length === 3)

  // ---- 5. The line ---------------------------------------------------------------
  console.log('\n[5] one line per log, the same words everywhere')
  const line = lines.cardioLine as ((l: Row) => string) | undefined
  check('"Brisk Walk or Light Cycling · 30 min · Easy"', line?.({ activity_name: FINISHER, duration_minutes: 30, intensity_rpe: 4 }) === `${FINISHER} · 30 min · Easy`,
    line?.({ activity_name: FINISHER, duration_minutes: 30, intensity_rpe: 4 }))
  check('a protocol after a dash is the instruction, not the name',
    line?.({ activity_name: 'Rowing Intervals — 6 rounds of 20s hard / 40s easy', duration_minutes: 11, intensity_rpe: 8 }) === 'Rowing Intervals · 11 min · Hard')
  check('an effort nobody gave is left out, never invented', line?.({ activity_name: 'Swim', duration_minutes: 20, intensity_rpe: 0 }) === 'Swim · 20 min')

  // ---- 6. The week, and the day that was swapped ----------------------------------
  console.log('\n[6] the week strip\'s data, and a day replaced by something else')
  networkDead = false
  // Logged with the phone offline, so it is still on the phone when the week is
  // read — a save normally starts sending at once, and the fake answers at once.
  ;(globalThis.navigator as { onLine: boolean }).onLine = false
  cardio.saveCardioLog({ userId, date: '2026-10-07', activityName: 'Yoga', durationMinutes: 25, intensityRpe: 3 })
  const dash = (await tracking.getWeeklyDashboard(userId, '2026-10-05', '2026-10-11')) as Array<{ date: string; cardioLogs: Row[] }>
  ;(globalThis.navigator as { onLine: boolean }).onLine = true
  check('(the yoga had not reached the server when the week was read)', !db.cardio_logs.some(r => r.activity_name === 'Yoga'))
  check('the week\'s cardio comes through the same reader — a log still on the phone is in it',
    (dash.find(d => d.date === '2026-10-07')?.cardioLogs ?? []).some(c => c.activity_name === 'Yoga'), dash.find(d => d.date === '2026-10-07')?.cardioLogs)
  check('...on its own day and no other', dash.filter(d => d.cardioLogs.some(c => c.activity_name === 'Yoga')).length === 1)
  await cardio.flushPending()

  const swappedLine = lines.swappedActivityLine as ((activity: string | null | undefined, logs: Row[]) => string | null) | undefined
  const tuesday = dash.find(d => d.date === TUE)?.cardioLogs ?? []
  check('a swapped day reads "Football · 60 min · Hard"', swappedLine?.('Football', tuesday) === 'Football · 60 min · Hard', swappedLine?.('Football', tuesday))
  check('...matched whatever the capitals', swappedLine?.('football', tuesday) === 'Football · 60 min · Hard', swappedLine?.('football', tuesday))
  check('...and when no minutes were given, it is just the name — never an invented duration', swappedLine?.('Muay Thai', tuesday) === 'Muay Thai', swappedLine?.('Muay Thai', tuesday))
  check('...and a day that was not swapped has no such line', swappedLine?.(null, tuesday) === null, swappedLine?.(null, tuesday))
  const label = glyphs.dayLabel as ((d: Row) => string) | undefined
  check('the strip SAYS the activity, not only "swapped"',
    label?.({ dayName: 'Tuesday', state: 'swapped', swappedLine: 'Football · 60 min · Hard' }) === 'Tuesday: swapped for Football · 60 min · Hard',
    label?.({ dayName: 'Tuesday', state: 'swapped', swappedLine: 'Football · 60 min · Hard' }))
  check('...and every other day reads as it did', label?.({ dayName: 'Monday', state: 'missed' }) === 'Monday: missed' && label?.({ dayName: 'Friday', state: 'swapped' }) === 'Friday: swapped for another activity',
    [label?.({ dayName: 'Monday', state: 'missed' }), label?.({ dayName: 'Friday', state: 'swapped' })])

  // ---- 7. The count that must not move -------------------------------------------
  console.log('\n[7] "N sessions" on Tools is still a count of lifting sessions')
  const { readFileSync } = await import('fs')
  const { join, dirname } = await import('path')
  const { fileURLToPath } = await import('url')
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const strip = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const tools = strip(readFileSync(join(root, 'src/components/ToolsTab.tsx'), 'utf8'))
  // History now lists a day of cardio with no lifting. The subtitle counted
  // rows; left alone it would have gone from "2 sessions" to 4 on this fixture
  // without anybody deciding a walk is a session.
  // RE-ANCHORED 9 Oct 2026: the count moved into one function the history
  // dialog's own gate calls (test:history-streak), and the swapped day's note
  // is no longer a session — 1 of 4 here, where it was 2.
  const { countSessions } = await import('../src/lib/exercise-history')
  check('the subtitle counts sessions through the one function that leaves cardio-only days out', /sessions:\s*countSessions\(rows\)/.test(tools))
  check('...which on this history is 1, where every entry would be 4', countSessions(entries as never) === 1 && entries.length === 4, { lifting: countSessions(entries as never), all: entries.length })

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} cardio-reader check(s) FAILED.`); process.exitCode = 1; return }
  console.log('All cardio-reader checks passed.')
}

main().catch(err => {
  console.error('Test crashed:', err)
  process.exitCode = 1
}).finally(() => { process.exit(process.exitCode ?? 0) })
