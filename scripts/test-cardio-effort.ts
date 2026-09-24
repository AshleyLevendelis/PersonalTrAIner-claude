/**
 * CARDIO, LOGGED LIKE A LIFTING SET — the parts a screen cannot show.
 *
 * Ashley, 24 Sep 2026, from three options: every cardio log in the app looks
 * like a set row — boxes, the mint ✓, the plan pre-filled so one tap logs it,
 * a read-back with Undo, and effort as Easy / Steady / Hard everywhere. The
 * browser drivers (verify:rest-day, verify:finisher, verify:mobility-filler,
 * verify:planned-activity, verify:round-presets, verify:what-happened) hold
 * what she sees. This holds what she cannot:
 *
 *   1. what the three words MEAN, as RPE numbers, with literals on one side;
 *   2. what is STORED — a plan's exact RPE survives being logged as-is;
 *   3. that what was planned and what was done are written in one phrase;
 *   4. the two store defects the read-back exposed (a tombstoned undo read
 *      back as a log, and a synced log losing its Undo), and the undo window
 *      measured on the app's adjustable clock instead of real time;
 *   5. that no screen writes cardio around the shared row or invents an effort.
 */

// --- Environment shims (test-cardio-log.ts's shape) ------------------------

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
const nav = { onLine: true }
Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true })

type Row = Record<string, unknown>
const db: Record<string, Row[]> = { cardio_logs: [] }
const cmp = (a: unknown, b: unknown) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  const orders: [string, boolean][] = []
  let op: 'select' | 'insert' | 'delete' = 'select'
  let payload: Row[] = []
  let single = false
  const exec = () => {
    if (op === 'insert') {
      const inserted = payload.map(raw => { const row = { id: crypto.randomUUID(), ...raw }; db[table].push(row); return row })
      return { data: single ? inserted[0] ?? null : inserted, error: null }
    }
    if (op === 'delete') { db[table] = db[table].filter(r => !filters.every(f => f(r))); return { data: null, error: null } }
    let rows = db[table].filter(r => filters.every(f => f(r)))
    for (const [col, asc] of [...orders].reverse()) rows = [...rows].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]))
    return { data: single ? rows[0] ?? null : rows.map(r => ({ ...r })), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    insert: (rows: Row | Row[]) => { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return api },
    delete: () => { op = 'delete'; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api },
    order: (c: string, o?: { ascending?: boolean }) => { orders.push([c, o?.ascending !== false]); return api },
    limit: () => api,
    single: () => { single = true; return api },
    then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve().then(() => res(exec()), rej),
  }
  return api
}

// --- Harness: one exit ---------------------------------------------------------

import { readFileSync, readdirSync } from 'fs'
let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (p: string) => strip(readFileSync(p, 'utf8'))

async function main() {
  const { effortForRpe, rpeToStore, cardioReadback, EFFORTS } = await import('../src/lib/cardio-effort')
  const { prescriptionLine } = await import('../src/lib/activity-day')

  console.log('\n1. The three words, as numbers — literals on one side, so the scale cannot agree with itself')
  // The everyday talk-test scale the app's own plan labels use: every RPE-4
  // prescription says "conversational pace", RPE 5 is Zone-2 steady work, 7-8
  // are the intervals.
  const want: Record<number, string> = { 1: 'easy', 2: 'easy', 3: 'easy', 4: 'easy', 5: 'steady', 6: 'steady', 7: 'hard', 8: 'hard', 9: 'hard', 10: 'hard' }
  const got = Object.fromEntries(Object.keys(want).map(k => [k, effortForRpe(Number(k))]))
  check('RPE 1-4 is Easy, 5-6 Steady, 7-10 Hard', Object.keys(want).every(k => got[k] === want[Number(k)]), got)
  check('no number, no word — never a guess', effortForRpe(undefined) === null && effortForRpe(null) === null && effortForRpe(0) === null && effortForRpe(NaN) === null)
  check('each word stores the number the planning form has always used (3 / 5 / 7)',
    EFFORTS.map(e => `${e.label}:${e.rpe}`).join(',') === 'Easy:3,Steady:5,Hard:7', EFFORTS.map(e => `${e.label}:${e.rpe}`))
  check('...and each word\'s own number maps back to it', EFFORTS.every(e => effortForRpe(e.rpe) === e.key))

  console.log('\n2. What is STORED')
  check('logging a plan as prescribed keeps the plan\'s exact RPE — an RPE-8 finisher is an 8, not Hard\'s 7',
    rpeToStore('hard', 8) === 8 && rpeToStore('easy', 2) === 2 && rpeToStore('easy', 4) === 4, [rpeToStore('hard', 8), rpeToStore('easy', 2), rpeToStore('easy', 4)])
  check('choosing a different word stores THAT word\'s number — it is a statement about how it felt',
    rpeToStore('easy', 8) === 3 && rpeToStore('steady', 8) === 5 && rpeToStore('hard', 3) === 7, [rpeToStore('easy', 8), rpeToStore('steady', 8), rpeToStore('hard', 3)])
  check('with no plan behind it, a word stores its own number',
    rpeToStore('easy') === 3 && rpeToStore('steady') === 5 && rpeToStore('hard') === 7)

  console.log('\n3. Planned and done, in one phrase')
  check('the read-back is "activity · minutes · effort", in words', cardioReadback({ activity: 'Walk', minutes: 20, rpe: 3 }) === 'Walk · 20 min · Easy',
    cardioReadback({ activity: 'Walk', minutes: 20, rpe: 3 }))
  check('...and drops the effort rather than inventing one', cardioReadback({ activity: 'Walk', minutes: 20 }) === 'Walk · 20 min')
  const cases = [{ activity: 'Cycle', duration: 35, targetRpe: 3 }, { activity: 'Rowing Intervals', duration: 11, targetRpe: 8 }, { activity: 'Walk', duration: 20 }]
  check('what the plan prints and what a saved row prints are the SAME words for the same numbers',
    cases.every(c => prescriptionLine(c) === cardioReadback({ activity: c.activity, minutes: c.duration, rpe: c.targetRpe })),
    cases.map(c => [prescriptionLine(c), cardioReadback({ activity: c.activity, minutes: c.duration, rpe: c.targetRpe })]))
  check('...and no RPE number reaches the screen phrase', cases.every(c => !/RPE/.test(prescriptionLine(c))), cases.map(c => prescriptionLine(c)))

  console.log('\n4. The store under the read-back')
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: fakeFrom } as any)
  const store = await import('../src/lib/cardio-log-store')
  const { setDevClockOverride } = await import('../src/lib/dev-clock')
  const userId = crypto.randomUUID()
  const date = '2026-09-24'

  // (a) A TOMBSTONE IS NOT A LOG. Offline, a log cannot flush, so an undo of it
  // tombstones rather than drops (deleteCardioLog's in-flight race path).
  nav.onLine = false
  const offline = store.saveCardioLog({ userId, date, activityName: 'Walk', durationMinutes: 20, intensityRpe: 3 })!
  await store.deleteCardioLog(offline.clientId!)
  const tomb = JSON.parse(localStorage.getItem('fitplan_cardio_pending_v1') || '[]').find((i: Row) => i.clientId === offline.clientId)
  check('the undo left a tombstone, so this case is the one being asked (sanity check)', tomb?.pendingDelete === true, tomb)
  const afterTomb = await store.getCardioLogsForDateMerged(userId, date)
  check('...and the day\'s read-back does not return it — an undone walk does not come back as "✓ Walk"',
    !afterTomb.some(r => r.clientId === offline.clientId), afterTomb.map(r => r.activity_name))
  check('...nor is it offered for undo a second time', store.isCardioLogUndoable(offline.clientId) === false)
  nav.onLine = true
  await store.flushPending()

  // (b) A SYNCED LOG KEEPS ITS UNDO. The server copy has no clientId; the read
  // must carry the local one over, or Undo vanishes the moment the network answers.
  const kept = store.saveCardioLog({ userId, date, activityName: 'Swim', durationMinutes: 30, intensityRpe: 4 })!
  await store.flushPending()
  const merged = await store.getCardioLogsForDateMerged(userId, date)
  const swim = merged.filter(r => r.activity_name === 'Swim')
  check('the synced swim reads back exactly once', swim.length === 1 && swim[0].syncStatus === 'synced', swim)
  check('...still carrying the handle its Undo needs', swim[0]?.clientId === kept.clientId, swim[0])
  check('...and is undoable', store.isCardioLogUndoable(swim[0]?.clientId) === true)
  check('an unknown or missing id is not undoable — no button over a no-op', store.isCardioLogUndoable('nope') === false && store.isCardioLogUndoable(undefined) === false)

  // (c) THE UNDO WINDOW IS REAL TIME. With the app's clock moved (a dev-clock
  // override — what every browser driver runs under), a log is stamped days
  // away from now; the window used to read that stamp, so the log was "older
  // than ten minutes" at birth, pruned on the next flush, and Undo no-opped.
  setDevClockOverride(userId, '2020-01-01')
  const moved = store.saveCardioLog({ userId, date, activityName: 'Row', durationMinutes: 15, intensityRpe: 7 })!
  await store.flushPending()
  // Read BEFORE the flush that prunes, so the sanity check asks about the
  // stamp and the next check alone asks about the window.
  const movedItem = JSON.parse(localStorage.getItem('fitplan_cardio_pending_v1') || '[]').find((i: Row) => i.clientId === moved.clientId)
  check('the stamp really is the moved clock (sanity check — else this asks nothing)', String(movedItem?.completedAt ?? '').startsWith('2020-01-01'), movedItem)
  await store.flushPending() // the flush that would prune it
  check('...and a log made a moment ago is still undoable under it, past the flush that prunes', store.isCardioLogUndoable(moved.clientId) === true)
  await store.deleteCardioLog(moved.clientId!)
  check('...and Undo really deletes it', !db.cardio_logs.some(r => r.activity_name === 'Row'), db.cardio_logs.map(r => r.activity_name))
  setDevClockOverride(userId, null)

  // (d) ...and the window still closes. Aged by hand, eleven minutes back.
  const old = store.saveCardioLog({ userId, date, activityName: 'Bike', durationMinutes: 25, intensityRpe: 5 })!
  await store.flushPending()
  const items = JSON.parse(localStorage.getItem('fitplan_cardio_pending_v1') || '[]') as Row[]
  const it = items.find(i => i.clientId === old.clientId)!
  it.savedAtMs = Date.now() - 11 * 60 * 1000
  localStorage.setItem('fitplan_cardio_pending_v1', JSON.stringify(items))
  check('eleven minutes on, it is no longer offered for undo', store.isCardioLogUndoable(old.clientId) === false)

  console.log('\n5. No screen writes around the row, and none invents an effort')
  // DERIVED, not listed: every component in the app, so a new screen that
  // writes cardio its own way fails here without anyone remembering to add it.
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx$/.test(e.name) ? [`${dir}/${e.name}`] : []))
  const components = walk('src/components').map(f => [f.split('/').pop()!.replace(/\.tsx$/, ''), read(f)] as const)
  check('the component sweep found the app (sanity check — an empty sweep proves nothing)', components.length > 50 && components.some(([n]) => n === 'CardioSetRow'), components.length)
  const writers = components.filter(([, s]) => /saveCardioLog\(/.test(s)).map(([n]) => n).sort()
  check('only the shared row and the What-happened sheet write a cardio log from a screen', writers.join(',') === 'CardioSetRow,WhatHappenedSheet', writers)
  const invented = components.filter(([, s]) => /intensityRpe:\s*\d/.test(s)).map(([n]) => n)
  check('...and no screen writes an effort as a bare number nobody chose', invented.length === 0, invented)
  const wh = components.find(([n]) => n === 'WhatHappenedSheet')![1]
  check('the What-happened sheet stores the effort she chose', /intensityRpe: rpeToStore\(effort!\)/.test(wh))
  const plan = components.find(([n]) => n === 'AddCardioSessionSheet')![1]
  check('the form that PLANS cardio uses the same three words, not a copy of them',
    /import \{ EFFORTS \} from '@\/lib\/cardio-effort'/.test(readFileSync('src/components/exercise/AddCardioSessionSheet.tsx', 'utf8')) && !/rpe:\s*[357]\s*\}/.test(plan))
  const row = components.find(([n]) => n === 'CardioSetRow')![1]
  const planned = row.slice(row.indexOf('export function PlannedCardioRow'), row.indexOf('export interface CardioPick'))
  check('the planned row hands the plan\'s own RPE to the store rule', /intensityRpe: rpeToStore\(effort, prescription\.targetRpe\)/.test(planned))
  const unplanned = row.slice(row.indexOf('export function UnplannedCardioEntry'))
  check('...and the unplanned entry hands over the chosen preset\'s', /intensityRpe: rpeToStore\(effort, chosen\?\.rpe\)/.test(unplanned))

  console.log(`\ncardio-effort: ${ran} checks ran`)
  if (failures > 0) {
    console.error(`cardio-effort: ${failures} check(s) FAILED`)
    process.exit(1)
  }
  console.log('Cardio effort is three words everywhere, and what is logged is what was chosen.')
}

main().catch(err => { console.error('Test crashed:', err); process.exit(1) })
