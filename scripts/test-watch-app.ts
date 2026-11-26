// test:watch-app — THE WATCH APP AND THE PHONE'S HALF (27 Nov 2026; docs/plans/watch-app.md, his "Go in the watch with
// your recommendations"; his vision: "Track workouts steps and heart rate. On a weight workout see 'next exercise 3x10
// bench press @100kg' then start rest from watch, start next set").
// 1. what the watch is sent: the row's own figures ("100 kg", "4 kg per hand", "BW"), the keys the watch reads;
// 2. the watch's events on the phone: heart rate into the strap's store (live, a session's figure, the gates that read
//    it), a cardio start shown, a cardio end logged once with the watch's steps, a set queued once;
// 3. the two sides agree: message paths, the zone split, the payload's keys, the believable heart rate range;
// 4. the watch app's settings: same app id, its own module, permissions asked on Start, the phone's seven health reads
//    untouched; nothing typed on the watch (no weight sent from it).
// The Exercise tab pressing its own tick is driven in verify:watch-sets. NOTHING HERE RUNS ON A WATCH.
import { readFileSync } from 'fs'

const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k),
}
Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true })
// The phone's health store, holding a count of its own (a phone left on the bench), so the watch's figure has something
// to win over.
;(globalThis as { __healthAdapterForTest?: unknown }).__healthAdapterForTest = {
  isAvailable: async () => ({ available: true }),
  stepsBetween: async () => 999,
}

type Row = Record<string, unknown>
const db: Record<string, Row[]> = { cardio_logs: [] }
function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let op: 'select' | 'insert' | 'delete' | 'update' = 'select'
  let payload: Row[] = []
  const exec = () => {
    db[table] ??= []
    if (op === 'insert') { const rows = payload.map(r => ({ id: `r${Math.random()}`, ...r })); db[table].push(...rows); return { data: rows[0] ?? null, error: null } }
    return { data: db[table].filter(r => filters.every(f => f(r))).map(r => ({ ...r })), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api, insert: (r: Row | Row[]) => { op = 'insert'; payload = Array.isArray(r) ? r : [r]; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api },
    gte: (c: string, v: unknown) => { filters.push(r => String(r[c]) >= String(v)); return api },
    lte: (c: string, v: unknown) => { filters.push(r => String(r[c]) <= String(v)); return api },
    in: (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return api },
    order: () => api, single: () => api, maybeSingle: () => api,
    then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve().then(() => res(exec()), rej),
  }
  return api
}

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/<!--[\s\S]*?-->/g, '')
const read = (p: string) => { try { return readFileSync(p, 'utf8') } catch { return '' } }

async function main() {
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: fakeFrom } as any)
  const { watchLoadText, watchTodayPayload, waitingWatchSets, queueWatchSet } = await import('../src/lib/watch-session')
  const { applyWatchEvents } = await import('../src/lib/watch-bridge')
  const strap = await import('../src/lib/strap-live')
  const rec = await import('../src/lib/recording-store')
  const { ZONES } = await import('../src/lib/heart-series')

  console.log('\n1. What the watch is sent')
  check('"~100kg" reads "100 kg"', watchLoadText({ suggestedLoad: '~100kg' }) === '100 kg', watchLoadText({ suggestedLoad: '~100kg' }))
  check('"~4kg per hand" keeps its "per hand"', watchLoadText({ suggestedLoad: '~4kg per hand' }) === '4 kg per hand', watchLoadText({ suggestedLoad: '~4kg per hand' }))
  check('bodyweight reads BW, with any added weight', watchLoadText({ suggestedLoad: 'BW' }) === 'BW' && watchLoadText({ suggestedLoad: 'BW', addedLoadKg: 10 }) === 'BW + 10 kg')
  check('no weight is no text, never "0 kg"', watchLoadText({ suggestedLoad: null }) === '')
  const json = watchTodayPayload({ date: '2026-11-27', title: 'Upper Push', estimatedMax: 182, rows: [
    { id: 'bench', name: 'Barbell Bench Press', sets: 3, reps: '10', suggestedLoad: '~100kg', restSeconds: 120, done: 1 },
    { id: 'fly', name: 'Cable Fly', sets: 3, reps: '12-15', suggestedLoad: '~15kg', restSeconds: 60, done: 5 },
  ] })
  const sent = JSON.parse(json ?? '{}')
  check('the payload names today, the session and the zone maximum', sent.date === '2026-11-27' && sent.title === 'Upper Push' && sent.estimatedMax === 182, sent)
  check('each exercise: sets, reps, load, rest and done, the done never over the sets', JSON.stringify(sent.exercises?.[0]) === JSON.stringify({ id: 'bench', name: 'Barbell Bench Press', sets: 3, reps: '10', load: '100 kg', restSeconds: 120, done: 1 }) && sent.exercises?.[1]?.done === 3, sent.exercises)
  check('no zone maximum is sent as 0 (the watch shows no zone)', JSON.parse(watchTodayPayload({ date: 'd', title: 't', estimatedMax: null, rows: [{ id: 'a', name: 'A', sets: 1, reps: '5', suggestedLoad: null, restSeconds: 60, done: 0 }] }) ?? '{}').estimatedMax === 0)
  check('nothing to send with no rows', watchTodayPayload({ date: 'd', title: 't', estimatedMax: null, rows: [] }) === null)

  console.log('\n2. The watch\'s events on the phone')
  const ctx = { profileId: 'p1', body: { weightKg: 80, age: 40, gender: 'male' as const } }
  const now = Date.now()
  const r1 = await applyWatchEvents([{ id: 'h1', type: 'hr', samples: [[now - 3000, 139], [now - 2000, 141], [now - 1000, 143], [now - 500, 900]] }], ctx)
  check('heart rate readings go into the live store, a reading no heart makes dropped', r1.readings === 3 && strap.liveHeartRate() === 143, { r1, live: strap.liveHeartRate() })
  check('...said as the watch\'s', strap.liveHeartSource() === 'watch')
  check('...and with no strap paired the readings still count for a session\'s figure', !strap.pairedStrap() && strap.hasOwnReadings())
  const sum = strap.strapReadingsBetween(new Date(now - 10_000), new Date(now))
  check('...the session\'s figure reads them', sum?.max === 143, sum)
  strap.__resetStrapForTests()
  const late = Date.now() - 60 * 60_000
  await applyWatchEvents([{ id: 'h2', type: 'hr', samples: [[late, 120], [late + 1000, 121], [late + 2000, 119]] }], ctx)
  check('a batch that waited on the watch is kept at its own time but is never "live"', strap.liveHeartRate() === null && strap.strapReadingsBetween(new Date(late - 1000), new Date(late + 5000))?.max === 121, { live: strap.liveHeartRate(), sum: strap.strapReadingsBetween(new Date(late - 1000), new Date(late + 5000)) })

  rec.writeRecording(null)
  const startedAt = Date.parse('2026-11-27T09:00:00')
  await applyWatchEvents([{ id: 'c1', type: 'cardio-start', activity: 'Walk', startedAt }], ctx)
  check('a walk started on the watch shows running on the phone', rec.readRecording()?.activity === 'Walk' && rec.readRecording()?.startedAt === new Date(startedAt).toISOString(), rec.readRecording())
  rec.writeRecording({ activity: 'Run', startedAt: new Date(startedAt).toISOString() })
  await applyWatchEvents([{ id: 'c1b', type: 'cardio-start', activity: 'Walk', startedAt }], ctx)
  check('...never over a workout already open on the phone', rec.readRecording()?.activity === 'Run')
  rec.writeRecording({ activity: 'Walk', startedAt: new Date(startedAt).toISOString() })
  const end = { id: 'c2', type: 'cardio-end', activity: 'Walk', startedAt, endedAt: startedAt + 30 * 60_000, effort: 'steady', zone: 3, steps: 3400, distanceM: 2600, kcal: 140, avgBpm: 118, maxBpm: 131 }
  const r2 = await applyWatchEvents([end], ctx)
  const logs = db.cardio_logs.length ? db.cardio_logs : JSON.parse(store.get('fitplan_cardio_pending_v1') ?? '[]')
  const { getCardioLogsForDateMerged } = await import('../src/lib/cardio-log-store')
  const merged = await getCardioLogsForDateMerged('p1', '2026-11-27')
  const w = merged.find(l => l.activity_name === 'Walk')
  check('ended on the watch with its effort tap: logged', r2.logged === 1 && !!w, { r2, merged, logs: logs.length })
  check('...30 minutes, Steady, with the watch\'s steps (over the phone\'s 999), distance and calories', w?.duration_minutes === 30 && w?.steps === 3400 && Number(w?.distance_km) === 2.6 && w?.active_kcal === 140 && w?.kcal_estimated === false, w)
  check('...and the effort he tapped', (w?.intensity_rpe ?? 0) >= 5 && (w?.intensity_rpe ?? 0) <= 6, w?.intensity_rpe)
  check('...the open workout on the phone is closed', rec.readRecording() === null)
  const r3 = await applyWatchEvents([{ ...end, id: 'c3' }], ctx)
  check('THE SAME WORKOUT IS NEVER LOGGED TWICE (ended on the phone too, or sent again)', r3.logged === 0 && (await getCardioLogsForDateMerged('p1', '2026-11-27')).filter(l => l.activity_name === 'Walk').length === 1)
  rec.writeRecording({ activity: 'Bike', startedAt: new Date().toISOString() })
  await applyWatchEvents([{ ...end, id: 'c4', activity: 'Run', startedAt: startedAt + 3 * 3600_000, endedAt: startedAt + 3.5 * 3600_000 }], ctx)
  check('logging a watch workout leaves a different open workout on the phone as it was', rec.readRecording()?.activity === 'Bike')
  const r4 = await applyWatchEvents([{ id: 'c5', type: 'cardio-end', activity: 'Walk', startedAt: startedAt + 6 * 3600_000, endedAt: startedAt + 6 * 3600_000 + 20 * 60_000, effort: 'flat-out' }], ctx)
  check('an effort the app does not know is not logged as a guess', r4.logged === 0)

  const r5 = await applyWatchEvents([
    { id: 's1', type: 'set', date: '2026-11-27', exerciseId: 'bench', name: 'Barbell Bench Press', setNumber: 1, at: 1 },
    { id: 's1', type: 'set', date: '2026-11-27', exerciseId: 'bench', name: 'Barbell Bench Press', setNumber: 1, at: 1 },
    { id: 's2', type: 'set', date: '2026-11-27', exerciseId: 'bench', name: 'Barbell Bench Press', setNumber: 2, at: 2 },
  ], ctx)
  check('a set ticked on the watch waits for the Exercise tab, once', r5.sets === 3 && waitingWatchSets().length === 2, waitingWatchSets())
  queueWatchSet({ id: 'other-id', date: '2026-11-27', exerciseId: 'bench', name: 'Barbell Bench Press', setNumber: 2, at: 3 })
  check('...the same set under another id is still one set', waitingWatchSets().length === 2)
  const r6 = await applyWatchEvents([{ id: 'x', type: 'set', name: 'Bench', setNumber: 1, date: '2026-11-27', weightKg: 140 }], ctx)
  check('THE WATCH SENDS NO WEIGHT and none is read: the tab\'s own tick decides it', !JSON.stringify(waitingWatchSets()).includes('140') && r6.sets === 1)
  const r7 = await applyWatchEvents([null, 'junk', { type: 'hr', samples: 'no' }, { id: 'h9', type: 'hr', samples: [[Date.now(), 99]] }], ctx)
  check('a bad event never stops the rest', r7.readings === 1)

  console.log('\n3. The two sides agree')
  const W = 'android/wear/src/main/java/uk/co/personaltrainerapp/wear/'
  const P = 'android/app/src/main/java/uk/co/personaltrainerapp/'
  const proto = read(`${W}Protocol.java`)
  const today = /TODAY_PATH = "([^"]+)"/.exec(proto)?.[1], event = /EVENT_PATH = "([^"]+)"/.exec(proto)?.[1]
  check('the watch reads today at the path the phone writes', !!today && read(`${P}WatchBridgePlugin.java`).includes(`PutDataMapRequest.create("${today}")`), today)
  check('the phone listens at the path the watch sends on', !!event && read(`${P}PhoneWatchListenerService.java`).includes(`"${event}".equals(event.getPath())`), event)
  const froms = (/FROM = \{([^}]+)\}/.exec(read(`${W}Zones.java`))?.[1] ?? '').split(',').map(Number)
  check('the watch\'s zones are the phone\'s five (tenths of the maximum)', JSON.stringify(froms) === JSON.stringify(ZONES.map(z => z.from)), { watch: froms, phone: ZONES.map(z => z.from) })
  const todayStore = strip(read(`${W}TodayStore.java`))
  const keys = ['date', 'title', 'estimatedMax', 'exercises', 'id', 'name', 'sets', 'reps', 'load', 'restSeconds', 'done']
  check('every key the phone sends is one the watch reads', keys.every(k => todayStore.includes(`"${k}"`)), keys.filter(k => !todayStore.includes(`"${k}"`)))
  const service = strip(read(`${W}WorkoutService.java`))
  check('the watch drops heart rates the phone would (30 to 230)', /bpm < 30 \|\| bpm > 230/.test(service))
  check('the watch sends no weight with a set', !/"weight/i.test(strip(read(`${W}MainActivity.java`))))
  check('steps and distance only on foot (walk, run), as the phone records them', /onFoot = "cardio"\.equals\(kind\) && \("Walk"\.equals\(activity\) \|\| "Run"\.equals\(activity\)\)/.test(service))
  const main = strip(read(`${W}MainActivity.java`))
  check('the lift screen says "Next", the exercise, "sets × reps @ load" and the set', /"NEXT"/.test(main) && /x\.sets \+ " × " \+ x\.reps/.test(main) && /" @ " \+ x\.load/.test(main) && /"Set " \+ setNumber \+ " of " \+ x\.sets/.test(main))
  check('Set done starts the rest; Start next set ends it', /button\("Set done" \+ rest/.test(main) && /restEndsAt = SystemClock\.elapsedRealtime\(\) \+ x\.restSeconds \* 1000L/.test(main) && /button\("Start next set"/.test(main))
  check('the rest ends with a buzz, once', /if \(!restBuzzed\) \{ restBuzzed = true; buzz\(\); \}/.test(main))
  check('End is tapped twice, so a sleeve does not end a run', /now - endArmedAt < 3000/.test(main))

  console.log('\n4. The watch app\'s settings')
  const settings = read('android/settings.gradle')
  check('the watch is its own module in the phone\'s project', /include ':wear'/.test(settings))
  const wearGradle = read('android/wear/build.gradle')
  check('same app id as the phone, or they cannot talk', /applicationId "uk\.co\.personaltrainerapp"/.test(wearGradle) && /applicationId "uk\.co\.personaltrainerapp"/.test(read('android/app/build.gradle')))
  check('signed with the phone\'s key file', /keystore\.properties/.test(wearGradle))
  check('a version code of its own range', Number(/versionCode (\d+)/.exec(wearGradle)?.[1]) >= 1000)
  const wm = strip(read('android/wear/src/main/AndroidManifest.xml'))
  check('a watch app that needs its phone', /android\.hardware\.type\.watch/.test(wm) && /wearable\.standalone" android:value="false"/.test(wm))
  check('heart rate under BODY_SENSORS to Wear OS 5 and the health permission after', /BODY_SENSORS" android:maxSdkVersion="35"/.test(wm) && /health\.READ_HEART_RATE/.test(wm))
  check('the workout runs as a health foreground service', /foregroundServiceType="health"/.test(wm) && /FOREGROUND_SERVICE_HEALTH/.test(wm))
  check('the watch reads only heart rate among health permissions', (wm.match(/android\.permission\.health\.[A-Z_]+/g) ?? []).every(p => p === 'android.permission.health.READ_HEART_RATE'))
  const pm = strip(read('android/app/src/main/AndroidManifest.xml'))
  const kept = (pm.match(/<uses-permission android:name="android\.permission\.health\.([A-Z_]+)"\s*\/>/g) ?? []).map(l => /health\.([A-Z_]+)/.exec(l)![1]).sort()
  const SEVEN = ['READ_ACTIVE_CALORIES_BURNED', 'READ_DISTANCE', 'READ_EXERCISE', 'READ_HEART_RATE', 'READ_RESTING_HEART_RATE', 'READ_SLEEP', 'READ_STEPS']
  check('the phone keeps exactly its seven health reads: none added for the watch', JSON.stringify(kept) === JSON.stringify(SEVEN), kept)
  check('the phone listens for the watch\'s messages only on its own paths', /MESSAGE_RECEIVED/.test(pm) && /android:pathPrefix="\/pt\/"/.test(pm))
  check('the phone app registers the watch plugin', /registerPlugin\(WatchBridgePlugin\.class\)/.test(read(`${P}MainActivity.java`)))
  check('permissions are asked when he starts a workout, not on install alone', /if \(!hasHeartPermission\(\)\) \{ askPermissions\(\); return; \}/.test(main))
  const bridge = strip(read('src/lib/watch-bridge.ts'))
  check('the plugin is loaded inside the Android phone app only, by a dynamic import', /await import\('@capacitor\/core'\)/.test(bridge) && /getPlatform\(\) !== 'android'/.test(bridge) && !/^import .*@capacitor/m.test(bridge))
  check('the phone shows the watch\'s live number as the watch\'s', /liveHeartSource\(\) === 'watch' \? 'Heart rate live from your watch\.'/.test(read('src/components/RecordActivityCard.tsx')))
  check('every reader of the strap\'s readings reads the watch\'s too', ['src/lib/health-heart.ts', 'src/lib/activity-recording.ts', 'src/lib/watch-workouts.ts'].every(f => /hasOwnReadings\(\)/.test(read(f)) && !/strap\.pairedStrap\(\)/.test(strip(read(f)))))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.error(`${failures} failure(s)`); process.exit(1) }
  console.log('All watch-app checks passed.')
}
main().catch(e => { console.error('crashed', e); process.exit(1) })
