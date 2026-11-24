// test:health-heart — HEART RATE FROM THE PHONE (his ruling 24 Nov 2026, "1 + 2, build it"; src/lib/health-heart.ts).
// 1. the rules: which readings count, a session's figure, a resting figure a day, the week's line;
// 2. the sync, against a pretend phone and a pretend database that records what it was ASKED (CLAUDE.md: a fake that
//    ignores filters cannot see a missing one): a workout and a real cardio session get their figure, a cardio log
//    typed in later does not get a desk's, the resting days are saved, nothing happens switched off;
// 3. nothing prescribes by heart rate.
import { readFileSync } from 'fs'

const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
}

import { setSupabaseClient } from '../src/lib/supabase'
import {
  summariseHeartRate, looksLikeExercise, restingByDay, restingTrend, heartLine, cardioWindow, workoutWindow,
  syncHeartFromHealth, HEALTH_HEART_CONNECTED_KEY,
} from '../src/lib/health-heart'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const at = (iso: string, plusMin: number) => new Date(Date.parse(iso) + plusMin * 60000).toISOString()

async function main() {
  console.log('\n1. The rules')
  const start = new Date('2026-11-24T10:00:00Z'), end = new Date('2026-11-24T10:30:00Z')
  const run = [{ bpm: 120, at: at('2026-11-24T10:00:00Z', 2) }, { bpm: 150, at: at('2026-11-24T10:00:00Z', 10) }, { bpm: 171, at: at('2026-11-24T10:00:00Z', 20) },
    { bpm: 60, at: at('2026-11-24T10:00:00Z', -10) }, { bpm: 400, at: at('2026-11-24T10:00:00Z', 15) }]
  const sum = summariseHeartRate(run, start, end)
  check('a session\'s figure: the average and highest inside its time, an impossible 400 left out, a reading before it left out', sum?.avg === 147 && sum?.max === 171 && sum?.readings === 3, sum)
  check('fewer than three readings is no figure', summariseHeartRate(run.slice(0, 2), start, end) === null)
  check('a cardio figure is kept only when the heart clearly worked (highest 100+)', looksLikeExercise({ avg: 120, max: 140, readings: 9 }) && !looksLikeExercise({ avg: 72, max: 88, readings: 9 }))
  check('the line under a log: "♥ 147 avg · 171 max", and nothing without an average', heartLine(147, 171) === '♥ 147 avg · 171 max' && heartLine(null, 171) === null && heartLine(140, null) === '♥ 140 avg')
  const days = restingByDay([{ bpm: 58, at: '2026-11-20T03:00:00' }, { bpm: 61, at: '2026-11-20T05:00:00' }, { bpm: 200, at: '2026-11-21T03:00:00' }, { bpm: 60, at: '2026-11-21T04:00:00' }])
  check('a resting figure a day: the lowest believable reading, an impossible one left out', days.get('2026-11-20') === 58 && days.get('2026-11-21') === 60 && days.size === 2, [...days])
  const rows = (start: number, n: number, bpm: number) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse('2026-11-24T12:00:00Z') - (start + i) * 86400000).toISOString().slice(0, 10), bpm }))
  check('the week\'s line: this week against last, in words', restingTrend([...rows(0, 5, 58), ...rows(7, 5, 60)], '2026-11-24')?.line === 'Resting heart rate 58 · 2 lower than last week', restingTrend([...rows(0, 5, 58), ...rows(7, 5, 60)], '2026-11-24'))
  check('...higher said as higher, and no comparison without three days last week', restingTrend([...rows(0, 4, 63), ...rows(7, 4, 60)], '2026-11-24')?.line === 'Resting heart rate 63 · 3 higher than last week'
    && restingTrend([...rows(0, 4, 63), ...rows(7, 2, 60)], '2026-11-24')?.line === 'Resting heart rate 63')
  check('fewer than three days this week is no line', restingTrend(rows(0, 2, 58), '2026-11-24') === null)
  check('a cardio log\'s time is its minutes back from when it was logged', cardioWindow({ completed_at: '2026-11-24T10:30:00Z', duration_minutes: 30 })?.start.toISOString() === '2026-11-24T10:00:00.000Z')
  check('a workout\'s time is its own start to finish; none without both, none over six hours', !!workoutWindow({ started_at: '2026-11-24T09:00:00Z', finished_at: '2026-11-24T10:00:00Z' })
    && workoutWindow({ started_at: '2026-11-24T09:00:00Z', finished_at: null }) === null && workoutWindow({ started_at: '2026-11-24T01:00:00Z', finished_at: '2026-11-24T09:00:00Z' }) === null)

  console.log('\n2. The sync')
  const asked: string[] = []
  const updates: { table: string; patch: Record<string, unknown>; id: unknown }[] = []
  const upserts: { table: string; rows: unknown }[] = []
  const tables: Record<string, unknown[]> = {
    cardio_logs: [
      { id: 'run', user_id: 'p1', date: '2026-11-24', duration_minutes: 30, completed_at: '2026-11-24T10:30:00Z', avg_heart_rate: null },
      { id: 'typed', user_id: 'p1', date: '2026-11-24', duration_minutes: 30, completed_at: '2026-11-24T14:30:00Z', avg_heart_rate: null },
      { id: 'done', user_id: 'p1', date: '2026-11-24', duration_minutes: 30, completed_at: '2026-11-24T10:30:00Z', avg_heart_rate: 140 },
    ],
    workout_sessions: [{ id: 'lift', profile_id: 'p1', date: '2026-11-24', started_at: '2026-11-24T17:00:00Z', finished_at: '2026-11-24T18:00:00Z', is_completed: true, avg_heart_rate: null }],
  }
  const query = (table: string) => {
    const filters: string[] = []
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push(`${c}=${v}`); return q },
      in: (c: string, v: unknown[]) => { filters.push(`${c} in ${v.join(',')}`); return q },
      gte: () => q, lte: () => q,
      then: (res: (x: unknown) => void) => { asked.push(`${table}: ${filters.join(' & ')}`); res({ data: tables[table] ?? [], error: null }) },
      update: (patch: Record<string, unknown>) => ({ eq: (_c: string, id: unknown) => { updates.push({ table, patch, id }); return Promise.resolve({ error: null }) } }),
      upsert: (rows: unknown) => { upserts.push({ table, rows }); return Promise.resolve({ error: null }) },
    }
    return q
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: query } as any)
  const working = (s: string, mins: number, bpm: number) => Array.from({ length: mins }, (_, i) => ({ bpm: bpm + (i % 5) * 4, at: at(s, i) }))
  const phone = {
    platform: 'android' as const,
    isAvailable: async () => ({ available: true }),
    requestStepsAccess: async () => true,
    stepsBetween: async () => 0,
    requestHeartAccess: async () => true,
    heartRateSamples: async (s: Date, e: Date) => [
      ...working('2026-11-24T10:00:00Z', 30, 140), // the run
      ...Array.from({ length: 30 }, (_, i) => ({ bpm: 70 + (i % 3), at: at('2026-11-24T14:00:00Z', i) })), // a desk, when the typed log claims
      ...working('2026-11-24T17:00:00Z', 60, 110), // the lifting
    ].filter(x => Date.parse(x.at) >= s.getTime() && Date.parse(x.at) <= e.getTime()),
    restingHeartRateSamples: async () => [{ bpm: 58, at: '2026-11-23T04:00:00' }, { bpm: 57, at: '2026-11-24T04:00:00' }],
  }
  ;(globalThis as { __healthAdapterForTest?: unknown }).__healthAdapterForTest = phone

  const off = await syncHeartFromHealth('p1', '2026-11-24', new Date('2026-11-24T20:00:00Z'))
  check('switched off: nothing read, nothing written', off.cardio === 0 && off.workouts === 0 && off.restingDays === 0 && updates.length === 0 && asked.length === 0, { off, asked })
  store.set(HEALTH_HEART_CONNECTED_KEY, '1')
  const r = await syncHeartFromHealth('p1', '2026-11-24', new Date('2026-11-24T20:00:00Z'))
  const runUpd = updates.find(u => u.id === 'run'), liftUpd = updates.find(u => u.id === 'lift')
  check('the run gets its average and highest', runUpd?.table === 'cardio_logs' && typeof runUpd.patch.avg_heart_rate === 'number' && (runUpd.patch.max_heart_rate as number) >= 150, runUpd)
  check('the cardio typed in later gets no figure (its time was a desk)', !updates.some(u => u.id === 'typed'), updates.map(u => u.id))
  check('a log that already has one is left alone', !updates.some(u => u.id === 'done'))
  check('the lifting session gets its figure, from its own start to finish', liftUpd?.table === 'workout_sessions' && (liftUpd.patch.avg_heart_rate as number) >= 110 && (liftUpd.patch.avg_heart_rate as number) < 130, liftUpd)
  const rest = upserts.find(u => u.table === 'daily_resting_heart_rate')?.rows as { date: string; bpm: number; source: string; profile_id: string }[] | undefined
  check('the resting days are saved, one a day, as Health Connect\'s', rest?.length === 2 && rest.every(x => x.source === 'health_connect' && x.profile_id === 'p1'), rest)
  check('the result counts what it did', r.cardio === 1 && r.workouts === 1 && r.restingDays === 2, r)
  check('every read names this person (his own rows only)', asked.length >= 2 && asked.every(a => /(user_id|profile_id)=p1/.test(a)), asked)

  console.log('\n3. Nothing prescribes by heart rate')
  const words = ['src/lib/health-heart.ts', 'src/components/HealthStepsSection.tsx'].map(f => readFileSync(f, 'utf8')).join('\n')
  const shown = [...words.matchAll(/`([^`]*)`|'([^']{12,})'/g)].map(m => m[1] ?? m[2]).join('\n')
  check('no shown sentence sets a heart rate target or zone', !/\b(aim for|keep (it|your heart) (under|below|above)|zone \d|target heart|bpm target|% of max)/i.test(shown))
  const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')
  check('Android may write no heart data: WRITE_HEART_RATE and WRITE_RESTING_HEART_RATE stay removed', /WRITE_HEART_RATE" tools:node="remove"/.test(manifest) && /WRITE_RESTING_HEART_RATE" tools:node="remove"/.test(manifest))
  check('the privacy page names heart rate, so it says what is read', /heart rate/i.test(readFileSync('public/privacy.html', 'utf8')))

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
  console.log('test:health-heart passed: heart rate is read after sessions and at rest, never from a desk, never as a target.')
}

main().catch(e => { console.error(e); process.exit(1) })
