// test:walk-session — A COUNTED WALK (his request 26 Nov 2026, "Start walk ... Congratulations, you completed 3,000 steps.
// Your average heart rate was this", and his ruling "Both": the phone's step sensor live, the health store at the end).
// 1. the rules: the larger of the two counts, a count no walk could hold refused, minutes, his sentence;
// 2. a walk end to end against a pretend sensor, health store, strap and database that records what it was ASKED:
//    start, count, the sensor restarted mid-walk, finish, the effort tap that saves it, discard;
// 3. the save carries steps and the highest heart rate, and a database without the column still saves the walk;
// 4. the health store catching up later raises a walk's steps and never lowers them.
const store = new Map<string, string>()
// Node's own navigator has no onLine, which the cardio queue reads as offline and holds every save.
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
}

import { setSupabaseClient } from '../src/lib/supabase'
import { HEALTH_STEPS_CONNECTED_KEY } from '../src/lib/steps-store'
import { HEALTH_HEART_CONNECTED_KEY } from '../src/lib/health-heart'
import { onStrapValue, __resetStrapForTests } from '../src/lib/strap-live'
import { flushPending } from '../src/lib/cardio-log-store'
import { cardioReadback } from '../src/lib/cardio-effort'
import {
  walkSteps, plausibleWalkSteps, walkMinutes, walkCongratulations, startWalk, activeWalk, startCountingSteps, refreshStoreSteps,
  liveWalkSteps, finishWalk, saveWalk, discardWalk, topUpWalkSteps, WALK_KEY, type StepSensor,
} from '../src/lib/walk-session'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

// THE PRETEND PHONE: a sensor whose ticks the test drives, a health store whose step total the test sets.
let tick: ((n: number) => void) | null = null
let sensorGranted = true
let sensorStops = 0
const sensor: StepSensor = {
  available: async () => true,
  requestAccess: async () => sensorGranted,
  start: async (on) => { tick = on },
  stop: async () => { sensorStops++; tick = null },
}
let storeSteps = 0
let storeAsked: { start: string; end: string }[] = []
let watchHeart: { bpm: number; at: string }[] = []
;(globalThis as { __stepSensorForTest?: unknown }).__stepSensorForTest = sensor
;(globalThis as { __healthAdapterForTest?: unknown }).__healthAdapterForTest = {
  platform: 'android',
  isAvailable: async () => ({ available: true }),
  requestStepsAccess: async () => true,
  stepsBetween: async (s: Date, e: Date) => { storeAsked.push({ start: s.toISOString(), end: e.toISOString() }); return storeSteps },
  requestHeartAccess: async () => true,
  heartRateSamples: async (s: Date, e: Date) => watchHeart.filter(x => Date.parse(x.at) >= s.getTime() && Date.parse(x.at) <= e.getTime()),
  restingHeartRateSamples: async () => [],
}

// THE PRETEND DATABASE: records every insert, read and update, and can refuse a column like a database before its migration.
const inserts: Record<string, unknown>[] = []
const asked: string[] = []
const updates: { patch: Record<string, unknown>; id: unknown }[] = []
let missingColumn: string | null = null
let rows: Record<string, unknown>[] = []
const query = (table: string) => {
  const filters: string[] = []
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => { filters.push(`${c}=${v}`); return q },
    in: (c: string, v: unknown[]) => { filters.push(`${c} in ${v.join(',')}`); return q },
    then: (res: (x: unknown) => void) => { asked.push(`${table}: ${filters.join(' & ')}`); res({ data: rows, error: null }) },
    insert: (row: Record<string, unknown>) => ({
      select: () => ({
        single: async () => {
          if (missingColumn && missingColumn in row) return { data: null, error: { code: 'PGRST204', message: `Could not find the '${missingColumn}' column of 'cardio_logs' in the schema cache` } }
          inserts.push({ ...row })
          return { data: { id: `id${inserts.length}` }, error: null }
        },
      }),
    }),
    update: (patch: Record<string, unknown>) => ({ eq: (_c: string, id: unknown) => { updates.push({ patch, id }); return Promise.resolve({ error: null }) } }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  }
  return q
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
setSupabaseClient({ from: query } as any)

const hr = (bpm: number) => new DataView(new Uint8Array([0, bpm]).buffer)
const t0 = new Date('2026-11-26T09:00:00Z')
const plus = (min: number) => new Date(t0.getTime() + min * 60000)

async function main() {
  console.log('\n1. The rules')
  check('the larger of the two counts is kept', walkSteps(3120, 2980, 34) === 3120 && walkSteps(2900, 3300, 34) === 3300)
  check('one count alone is kept; neither is no count, never 0', walkSteps(null, 3300, 34) === 3300 && walkSteps(3120, null, 34) === 3120 && walkSteps(null, null, 34) === null)
  check('a count no walk could hold in its minutes is refused, so the other is kept', walkSteps(90000, 3300, 34) === 3300 && plausibleWalkSteps(90000, 34) === null)
  check('...a brisk walk or a run is believed (200 a minute)', plausibleWalkSteps(6800, 34) === 6800)
  check('a walk is at least a minute, and rounds to whole minutes', walkMinutes(t0.toISOString(), plus(0.2)) === 1 && walkMinutes(t0.toISOString(), plus(34.4)) === 34)
  check('his sentence, with the walk\'s own numbers',
    walkCongratulations({ minutes: 34, steps: 3120, avgHeartRate: 118, maxHeartRate: 141 }) === 'Congratulations, you completed 3,120 steps in 34 minutes. Your average heart rate was 118, and your highest was 141.',
    walkCongratulations({ minutes: 34, steps: 3120, avgHeartRate: 118, maxHeartRate: 141 }))
  check('no heart rate: the steps sentence alone, no number invented', walkCongratulations({ minutes: 34, steps: 3120, avgHeartRate: null, maxHeartRate: null }) === 'Congratulations, you completed 3,120 steps in 34 minutes.')
  check('no steps: the walk named by its minutes, never "0 steps"', walkCongratulations({ minutes: 1, steps: null, avgHeartRate: null, maxHeartRate: null }) === 'Congratulations, you completed a 1-minute walk.')
  check('a saved walk reads back with its steps', cardioReadback({ activity: 'Walk', minutes: 34, rpe: 3, steps: 3120 }) === 'Walk · 34 min · Easy · 3,120 steps'
    && cardioReadback({ activity: 'Walk', minutes: 34, rpe: 3 }) === 'Walk · 34 min · Easy')

  console.log('\n2. A walk, end to end')
  store.set(HEALTH_STEPS_CONNECTED_KEY, '1')
  const w = startWalk('p1', '2026-11-26', t0)
  check('Start keeps the walk on the phone from the tap, with its day and its real start', activeWalk()?.startedAt === t0.toISOString() && activeWalk()?.date === '2026-11-26' && !!store.get(WALK_KEY))
  check('a second Start keeps the walk running, never restarts it', startWalk('p1', '2026-11-26', plus(5)).startedAt === w.startedAt)
  check('the sensor starts counting', (await startCountingSteps()) === true && tick !== null)
  tick!(400); tick!(1200)
  check('...and each tick is the walk\'s steps so far', activeWalk()?.sensorSteps === 1200)
  // The app was closed and reopened mid-walk: the sensor counts from zero again.
  check('the sensor restarted mid-walk', (await startCountingSteps()) === true)
  tick!(800)
  check('...adds to what it had already counted, never starts the walk again from 0', activeWalk()?.sensorSteps === 2000, activeWalk())
  storeSteps = 1500
  await refreshStoreSteps(plus(20))
  check('the health store is asked for the walk\'s own minutes', activeWalk()?.storeSteps === 1500 && storeAsked.at(-1)?.start === t0.toISOString(), storeAsked.at(-1))
  check('the live count is the larger of the two', liveWalkSteps(activeWalk()!, plus(20)) === 2000)
  // A strap sent through the walk; a reading before the walk does not count.
  __resetStrapForTests()
  onStrapValue(hr(70), plus(-5))
  ;[110, 118, 126, 141, 115].forEach((b, i) => onStrapValue(hr(b), plus(5 + i * 5)))
  storeSteps = 3120
  const r = await finishWalk(plus(34))
  check('Finish stops the sensor', sensorStops >= 1 && tick === null)
  check('Finish keeps the larger count (the store caught up past the sensor)', r?.steps === 3120, r)
  check('...over the walk\'s minutes', r?.minutes === 34)
  check('the heart rate is the strap\'s for the walk only (the 70 before it left out)', r?.avgHeartRate === 122 && r?.maxHeartRate === 141, r)
  check('the finished walk waits for its effort tap: nothing is saved yet', inserts.length === 0 && !!activeWalk()?.result)
  check('a second Finish returns the same result, never a new one', (await finishWalk(plus(40)))?.endedAt === r?.endedAt)
  const view = saveWalk('easy')
  await flushPending()
  const row = inserts.at(-1) ?? {}
  check('the effort tap saves it as a walk, on its day, at that effort', !!view && row.activity_name === 'Walk' && row.date === '2026-11-26' && row.intensity_rpe === 3 && row.duration_minutes === 34, row)
  check('...with its steps and its average and highest heart rate', row.steps === 3120 && row.avg_heart_rate === 122 && row.max_heart_rate === 141, row)
  check('...and the walk is cleared from the phone', activeWalk() === null && !store.get(WALK_KEY))
  check('a tap with nothing waiting saves nothing', saveWalk('easy') === null)

  console.log('\n3. No sensor, no strap, a database before the migration')
  sensorGranted = false
  storeSteps = 0
  startWalk('p1', '2026-11-26', plus(60))
  check('he says no to the phone\'s question: no live counting, the walk carries on', (await startCountingSteps()) === false && activeWalk() !== null)
  __resetStrapForTests()
  store.set(HEALTH_HEART_CONNECTED_KEY, '1')
  watchHeart = Array.from({ length: 10 }, (_, i) => ({ bpm: 100 + i, at: plus(62 + i * 2).toISOString() }))
  storeSteps = 2200
  const r2 = await finishWalk(plus(90))
  check('the health store\'s count alone is kept', r2?.steps === 2200, r2)
  check('with no strap, the watch\'s heart rate for the walk', r2?.avgHeartRate === 105 && r2?.maxHeartRate === 109, r2)
  missingColumn = 'steps'
  saveWalk('steady')
  await flushPending()
  const row2 = inserts.at(-1) ?? {}
  check('a database without the steps column still saves the walk, the steps the one thing lost', row2.intensity_rpe === 5 && !('steps' in row2) && row2.max_heart_rate === 109, row2)
  missingColumn = null
  store.delete(HEALTH_STEPS_CONNECTED_KEY)
  storeSteps = 0
  startWalk('p1', '2026-11-26', plus(120))
  const r3 = await finishWalk(plus(125))
  check('no count from either: no steps, never 0', r3?.steps === null, r3)
  await discardWalk()
  check('End without saving clears it and saves nothing', activeWalk() === null && inserts.length === 2)

  console.log('\n4. The health store catches up later')
  rows = [
    { id: 'walk', user_id: 'p1', steps: 2000, completed_at: '2026-11-26T10:00:00Z', duration_minutes: 30 },
    { id: 'run', user_id: 'p1', steps: null, completed_at: '2026-11-26T11:00:00Z', duration_minutes: 30 },
    { id: 'more', user_id: 'p1', steps: 4000, completed_at: '2026-11-26T12:00:00Z', duration_minutes: 30 },
  ]
  storeSteps = 3100
  check('switched off: nothing read', (await topUpWalkSteps('p1', '2026-11-26')) === 0 && asked.length === 0)
  store.set(HEALTH_STEPS_CONNECTED_KEY, '1')
  storeAsked = []
  const raised = await topUpWalkSteps('p1', '2026-11-26')
  check('a walk the store now knows more about is raised', raised === 1 && updates.some(u => u.id === 'walk' && u.patch.steps === 3100), updates)
  check('a walk with more steps than the store has is never lowered', !updates.some(u => u.id === 'more'))
  check('a cardio log that was not a counted walk is not given steps', !updates.some(u => u.id === 'run') && storeAsked.length === 2, storeAsked)
  check('...each over its own minutes', storeAsked[0]?.start === '2026-11-26T09:30:00.000Z' && storeAsked[0]?.end === '2026-11-26T10:00:00.000Z', storeAsked[0])
  check('every read names this person (his own walks only)', asked.length >= 1 && asked.every(a => /user_id=p1/.test(a) && /date in 2026-11-25,2026-11-26/.test(a)), asked)

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.log(`${failures} check(s) failed`); process.exit(1) }
  console.log('A walk counts its steps two ways, keeps the larger, and saves only on his tap.')
}

void main()
