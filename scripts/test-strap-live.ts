// test:strap-live — LIVE HEART RATE FROM A STRAP, the phone half (docs/plans/live-heart-rate.md stage 2,
// src/lib/strap-live.ts, health-heart.ts fillHeartFromStrap).
// 1. pairing and the live number, against a pretend strap: remembered, connected, live, stale after 5s, gone when the
//    link drops, forgotten with its readings;
// 2. the readings survive the app closing (kept on the phone), the last four hours only;
// 3. a session's figure from the strap, against a pretend database that records what it was ASKED: a workout and a
//    real cardio session get theirs, a session that already has one is left alone, a session still running keeps its
//    readings, nothing happens with no strap paired;
// 4. the settings: the plugin loaded by a dynamic import only, Android's scan never for location, location only for
//    Android 11 and older, the iPhone's sentence;
// 5. nothing judges the number.
import { readFileSync } from 'fs'

const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
}

import { setSupabaseClient } from '../src/lib/supabase'
import {
  pairStrap, pairedStrap, connectPairedStrap, flushStrapReadings, forgetStrap, liveHeartRate, onStrapValue, strapState, strapReadingsBetween,
  __resetStrapForTests, STALE_MS, type StrapAdapter,
} from '../src/lib/strap-live'
import { fillHeartFromStrap } from '../src/lib/health-heart'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const dv = (...bytes: number[]) => new DataView(new Uint8Array(bytes).buffer)
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '')

// A pretend strap: hands back what was picked, keeps the notification callback so the gate can send readings.
let send: ((v: DataView) => void) | null = null
let drop: (() => void) | null = null
let picked: { id: string; name: string } | null = { id: 'AA:BB', name: 'Polar H10' }
const connects: string[] = []
const disconnects: string[] = []
const fake: StrapAdapter = {
  pick: async () => picked,
  connect: async (id, onValue, onGone) => { connects.push(id); send = onValue; drop = onGone },
  disconnect: async (id) => { disconnects.push(id) },
}
;(globalThis as { __strapAdapterForTest?: StrapAdapter | null }).__strapAdapterForTest = fake

async function main() {
  console.log('\n1. Pairing and the live number')
  picked = null
  const cancelled = await pairStrap()
  check('closing the phone\'s picker pairs nothing and remembers nothing', !cancelled.ok && cancelled.reason === 'cancelled' && pairedStrap() === null && connects.length === 0, cancelled)
  picked = { id: 'AA:BB', name: 'Polar H10' }
  const paired = await pairStrap()
  check('picking a strap remembers it on this phone and connects to it', paired.ok && pairedStrap()?.id === 'AA:BB' && pairedStrap()?.name === 'Polar H10' && connects[0] === 'AA:BB' && strapState() === 'connected', { paired, connects, state: strapState() })
  check('connected with no reading yet shows nothing', liveHeartRate() === null)
  const now = Date.now()
  send!(dv(0x06, 152))
  check('a reading is the live number', liveHeartRate() === 152)
  send!(dv(0x04, 160))
  check('a reading the strap says it took without skin contact does not replace it', liveHeartRate() === 152)
  check(`after ${STALE_MS / 1000}s with nothing new, nothing is shown (never the last number)`, liveHeartRate(now + STALE_MS + 1000) === null && liveHeartRate(now + 1000) === 152)
  await connectPairedStrap()
  check('asking to connect while connected does not connect twice', connects.length === 1, connects)
  drop!()
  check('the link dropping clears the live number and says so', liveHeartRate() === null && strapState() === 'lost')
  await connectPairedStrap()
  check('...and the strap is connected again on the next open', connects.length === 2 && strapState() === 'connected', connects)

  console.log('\n2. The readings stay on the phone, through the app closing')
  // A strap sends in time order; a fresh store so these come after nothing newer.
  __resetStrapForTests()
  store.delete('fitplan_heart_strap_readings')
  const t0 = Date.now() - 20 * 60000
  for (let i = 0; i < 10; i++) onStrapValue(dv(0x00, 130 + i), new Date(t0 + i * 60000))
  onStrapValue(dv(0x00, 140), new Date(t0 + 10 * 60000))
  flushStrapReadings()
  const kept = store.get('fitplan_heart_strap_readings')
  check('the readings are written to the phone', !!kept && JSON.parse(kept).length >= 3, kept?.slice(0, 80))
  __resetStrapForTests()
  check('after the app closes and opens, the session\'s readings are still there', strapReadingsBetween(new Date(t0), new Date(t0 + 11 * 60000))?.readings === 11, strapReadingsBetween(new Date(t0), new Date(t0 + 11 * 60000)))
  const old = Date.now() - 5 * 3600000
  store.set('fitplan_heart_strap_readings', JSON.stringify([[old, 150], [old + 60000, 151], [old + 120000, 152]]))
  __resetStrapForTests()
  check('readings older than four hours are not brought back', strapReadingsBetween(new Date(Date.now() - 6 * 3600000), new Date()) === null)

  console.log('\n3. A session\'s figure from the strap')
  __resetStrapForTests()
  store.delete('fitplan_heart_strap_readings')
  const asked: string[] = []
  const updates: { table: string; patch: Record<string, unknown>; id: unknown }[] = []
  const today = new Date().toISOString().slice(0, 10)
  const T = (minAgo: number) => new Date(Date.now() - minAgo * 60000)
  const tables: Record<string, unknown[]> = {
    cardio_logs: [
      { id: 'run', user_id: 'p1', date: today, duration_minutes: 30, completed_at: T(60).toISOString(), avg_heart_rate: null },
      { id: 'had', user_id: 'p1', date: today, duration_minutes: 30, completed_at: T(60).toISOString(), avg_heart_rate: 138 },
    ],
    workout_sessions: [
      { id: 'lift', profile_id: 'p1', date: today, started_at: T(150).toISOString(), finished_at: T(100).toISOString(), is_completed: true, avg_heart_rate: null },
      { id: 'now', profile_id: 'p1', date: today, started_at: T(20).toISOString(), finished_at: null, is_completed: false, avg_heart_rate: null },
    ],
  }
  const query = (table: string) => {
    const filters: string[] = []
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push(`${c}=${v}`); return q },
      in: (c: string, v: unknown[]) => { filters.push(`${c} in ${v.join(',')}`); return q },
      then: (res: (x: unknown) => void) => { asked.push(`${table}: ${filters.join(' & ')}`); res({ data: tables[table] ?? [], error: null }) },
      update: (patch: Record<string, unknown>) => ({ eq: (_c: string, id: unknown) => { updates.push({ table, patch, id }); return Promise.resolve({ error: null }) } }),
    }
    return q
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: query } as any)
  store.delete('fitplan_heart_strap')
  const none = await fillHeartFromStrap('p1', today)
  check('no strap paired: nothing read, nothing written', none.cardio === 0 && none.workouts === 0 && asked.length === 0 && updates.length === 0, { none, asked })
  store.set('fitplan_heart_strap', JSON.stringify({ id: 'AA:BB', name: 'Polar H10' }))
  // In time order, as a strap sends them: the lifting session, then the run, then the session still running.
  for (let m = 149; m >= 101; m -= 4) onStrapValue(dv(0x00, 110 + (m % 7)), T(m))
  for (let m = 89; m >= 61; m -= 2) onStrapValue(dv(0x00, 150 + (m % 5)), T(m))
  for (let m = 19; m >= 1; m -= 3) onStrapValue(dv(0x00, 120), T(m)) // the session still running
  const done = await fillHeartFromStrap('p1', today)
  const run = updates.find(u => u.id === 'run'), lift = updates.find(u => u.id === 'lift')
  check('the run gets its average and highest from the strap', !!run && Number(run.patch.avg_heart_rate) >= 150 && Number(run.patch.max_heart_rate) === 154, run)
  check('the lifting session gets its own, from its own time only', !!lift && Number(lift.patch.max_heart_rate) <= 116 && Number(lift.patch.avg_heart_rate) >= 110, lift)
  check('a session that already has a figure is left alone, and the one still running is not given one', !updates.some(u => u.id === 'had' || u.id === 'now') && done.cardio === 1 && done.workouts === 1, { updates, done })
  check('every read names this person (his own rows only)', asked.length === 2 && asked.every(a => /(user_id|profile_id)=p1/.test(a)), asked)
  check('the session still running keeps every reading from its start', strapReadingsBetween(T(20), T(0))?.readings === 7, strapReadingsBetween(T(20), T(0)))
  check('readings no session needs any more are dropped from the phone (the lifting session\'s older than two hours)', strapReadingsBetween(T(150), T(121)) === null, strapReadingsBetween(T(150), T(121)))
  check('...while the last two hours always stay (a cardio log typed in later still finds its readings)', strapReadingsBetween(T(119), T(100))?.readings === 5, strapReadingsBetween(T(119), T(100)))

  // A LONG SESSION STILL RUNNING (past the two hours that always stay): its readings from the start are kept.
  __resetStrapForTests()
  store.delete('fitplan_heart_strap_readings')
  tables.cardio_logs = []
  tables.workout_sessions = [{ id: 'long', profile_id: 'p1', date: today, started_at: T(180).toISOString(), finished_at: null, is_completed: false, avg_heart_rate: null }]
  for (let m = 179; m >= 125; m -= 6) onStrapValue(dv(0x00, 125), T(m))
  await fillHeartFromStrap('p1', today)
  check('a session running for three hours keeps its readings from its start, past the two hours that always stay', strapReadingsBetween(T(180), T(121))?.readings === 10, strapReadingsBetween(T(180), T(121)))

  console.log('\n4. The settings')
  const live = strip(readFileSync('src/lib/strap-live.ts', 'utf8'))
  check('the Bluetooth plugin is loaded by a dynamic import only (the website\'s download does not grow)', /await import\('@capacitor-community\/bluetooth-le'\)/.test(live))
  const statics = ['src/lib/strap-live.ts', 'src/components/LiveHeart.tsx', 'src/components/HealthStepsSection.tsx', 'src/components/ProfileScreen.tsx', 'src/main.tsx', 'src/App.tsx', 'src/components/timers/RoundCard.tsx', 'src/components/timers/TimersPanel.tsx', 'src/components/exercise/TodayPanel.tsx']
    .filter(f => /^import[^\n]*['"]@capacitor-community\/bluetooth-le['"]/m.test(readFileSync(f, 'utf8')))
  check('no file imports the plugin statically', statics.length === 0, statics)
  check('the scan is declared never for location in the code too', /androidNeverForLocation:\s*true/.test(live))
  check('the picker shows only things sending heart rate', /requestDevice\(\{\s*services:\s*\[HEART_RATE_SERVICE\]/.test(live))
  const man = strip(readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8'))
  check('Android: BLUETOOTH_SCAN declared never for location', /android\.permission\.BLUETOOTH_SCAN"[^>]*usesPermissionFlags="neverForLocation"[^>]*tools:node="replace"/.test(man))
  check('Android: BLUETOOTH_CONNECT declared', /android\.permission\.BLUETOOTH_CONNECT"/.test(man))
  const loc = [...man.matchAll(/<uses-permission android:name="android\.permission\.ACCESS_(FINE|COARSE)_LOCATION"([^>]*)\/>/g)]
  check('Android: location only for Android 11 and older (the plugin declares it for every version)', loc.length === 2 && loc.every(m => /maxSdkVersion="30"/.test(m[2]) && /tools:node="replace"/.test(m[2])), loc.map(m => m[0]))
  const plist = readFileSync('ios/App/App/Info.plist', 'utf8')
  const bt = (plist.match(/<key>NSBluetoothAlwaysUsageDescription<\/key>\s*<string>([^<]+)<\/string>/) ?? [])[1] ?? ''
  check('iPhone: the Bluetooth sentence says it reads heart rate only', /heart rate/i.test(bt) && /heart rate only/i.test(bt), bt)
  const main = strip(readFileSync('src/main.tsx', 'utf8'))
  check('a paired strap is connected when the app opens and comes back to the front, inside the phone app only', /if \(inPhoneApp\) \{[\s\S]*?connectPairedStrap\(\)[\s\S]*?visibilitychange/.test(main))
  const dash = strip(readFileSync('src/components/Dashboard.tsx', 'utf8'))
  const strapAt = dash.indexOf('fillHeartFromStrap('), healthAt = dash.indexOf('syncHeartFromHealth(')
  check('the strap fills before the watch, so where both exist the strap\'s figure is the one kept', strapAt > 0 && healthAt > 0 && strapAt < healthAt, { strapAt, healthAt })

  console.log('\n5. Nothing judges the number')
  const badge = strip(readFileSync('src/components/LiveHeart.tsx', 'utf8'))
  const section = strip(readFileSync('src/components/HealthStepsSection.tsx', 'utf8'))
  check('no zone, target or "too high" in the live number or the strap row', !/\b(zone|target|too high|too low|% of)\b/i.test(badge + live + section.slice(section.indexOf('HeartStrapSection'))))

  await forgetStrap()
  check('forgetting the strap forgets it, its readings and its link', pairedStrap() === null && !store.has('fitplan_heart_strap_readings') && disconnects.includes('AA:BB') && liveHeartRate() === null && strapState() === 'none', { disconnects })

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
  console.log('test:strap-live passed: a paired strap gives a live number, keeps its readings on the phone, and fills each session\'s figure first.')
}

main().catch(e => { console.error(e); process.exit(1) })
