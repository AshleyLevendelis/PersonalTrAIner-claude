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
  check('each exercise: sets, reps, load, rest and done, the done never over the sets', JSON.stringify(sent.exercises?.[0]) === JSON.stringify({ id: 'bench', name: 'Barbell Bench Press', sets: 3, reps: '10', load: '100 kg', restSeconds: 120, done: 1, kg: 100, step: 2.5 }) && sent.exercises?.[1]?.done === 3, sent.exercises)
  check('no zone maximum is sent as 0 (the watch shows no zone)', JSON.parse(watchTodayPayload({ date: 'd', title: 't', estimatedMax: null, rows: [{ id: 'a', name: 'A', sets: 1, reps: '5', suggestedLoad: null, restSeconds: 60, done: 0 }] }) ?? '{}').estimatedMax === 0)
  // HIS "ADJUST REPS AND WEIGHT" (27 Nov 2026): the watch steps the planned weight a notch at a time.
  const steps = JSON.parse(watchTodayPayload({ date: 'd', title: 't', estimatedMax: null, rows: [
    { id: 'db', name: 'Dumbbell Row', sets: 3, reps: '10', suggestedLoad: '~22kg per hand', restSeconds: 60, done: 0, stepKg: 2 },
    { id: 'pu', name: 'Push-Up', sets: 3, reps: '12', suggestedLoad: 'BW', restSeconds: 60, done: 0 },
  ] }) ?? '{}').exercises
  check('the planned weight goes as a number with the implement\'s notch (22 a hand, a 2 kg step)', steps?.[0]?.kg === 22 && steps?.[0]?.step === 2, steps?.[0])
  check('...and bodyweight has no weight to step (null)', steps?.[1]?.kg === null, steps?.[1])
  // THE WEEK AHEAD (27 Nov 2026, the gym-floor review): the coming days ride with today; the watch picks by date.
  const wk = JSON.parse(watchTodayPayload({ date: '2026-11-27', title: 'Upper', estimatedMax: null,
    rows: [{ id: 'b', name: 'Bench', sets: 3, reps: '10', suggestedLoad: '~100kg', restSeconds: 90, done: 2 }],
    days: [
      { date: '2026-11-26', title: 'Old', rows: [{ id: 'x', name: 'X', sets: 1, reps: '5', suggestedLoad: null, restSeconds: 60, done: 0 }] },
      { date: '2026-11-28', title: 'Legs', rows: [{ id: 'sq', name: 'Back Squat', sets: 4, reps: '6', suggestedLoad: '~120kg', restSeconds: 150, done: 3 }] },
      { date: '2026-11-29', title: 'Rest', rows: [] },
    ] }) ?? '{}')
  check('the days ahead ride with today, each with its date, name and exercises', wk.days?.length === 1 && wk.days[0].date === '2026-11-28' && wk.days[0].title === 'Legs' && wk.days[0].exercises?.[0]?.kg === 120, wk.days)
  check('...never a day already gone, nor one with nothing in it', !JSON.stringify(wk.days).includes('2026-11-26') && !JSON.stringify(wk.days).includes('2026-11-29'))
  check('...and a day ahead starts at no sets done, whatever the row said', wk.days?.[0]?.exercises?.[0]?.done === 0)
  const restDay = JSON.parse(watchTodayPayload({ date: '2026-11-27', title: '', estimatedMax: null, rows: [],
    days: [{ date: '2026-11-28', title: 'Legs', rows: [{ id: 'sq', name: 'Back Squat', sets: 4, reps: '6', suggestedLoad: '~120kg', restSeconds: 150, done: 0 }] }] }) ?? 'null')
  check('a rest day still sends the week ahead (and no session for today)', restDay?.exercises?.length === 0 && restDay?.days?.[0]?.date === '2026-11-28', restDay)
  const todayStoreSrc = strip(read("android/wear/src/main/java/uk/co/personaltrainerapp/wear/TodayStore.java"))
  check('the watch reads today\'s session out of the week ahead when today\'s own is not the one sent', /JSONObject o = dayFor\(new JSONObject\(raw\), today\(\)\)/.test(todayStoreSrc) && /if \(date\.equals\(sent\.optString\("date"\)\)\) return sent;/.test(todayStoreSrc) && /sent\.optJSONArray\("days"\)/.test(todayStoreSrc))
  // A PLANNED CARDIO SESSION (27 Nov 2026): sent with today and with the days ahead, under the plan's own name.
  const { watchCardioOf } = await import('../src/lib/planned-rounds')
  const bike = watchCardioOf({ activity: 'Assault Bike Rounds', duration: 16, targetRpe: 8, rounds: { rounds: 4, workSeconds: 180, restSeconds: 60 } } as never)
  check('a rounds session goes to the watch as its rounds, work and rest, its name and the card\'s line', bike?.activity === 'Assault Bike Rounds' && bike.rounds === 4 && bike.workSeconds === 180 && bike.restSeconds === 60 && bike.minutes === 16 && /4 × 3 min hard · 1 min rest/.test(bike.line), bike)
  const jog = watchCardioOf({ activity: 'Easy jog', duration: 20, targetRpe: 3 } as never)
  check('a steady session goes as its minutes (no rounds)', jog?.rounds === 0 && jog.minutes === 20 && jog.effort === 'Easy', jog)
  check('no planned session, nothing', watchCardioOf(null) === null)
  const cj = JSON.parse(watchTodayPayload({ date: '2026-11-27', title: 'Conditioning', estimatedMax: null, rows: [], cardio: jog,
    days: [{ date: '2026-11-29', title: 'Bike', rows: [], cardio: bike }] }) ?? 'null')
  check('a cardio-only day is sent (no exercises), with "on foot" for a jog', cj?.cardio?.activity === 'Easy jog' && cj.cardio.onFoot === true && cj.exercises.length === 0, cj?.cardio)
  check('...and a cardio day ahead rides with today, not on foot for the bike', cj?.days?.[0]?.cardio?.rounds === 4 && cj.days[0].cardio.onFoot === false, cj?.days)
  // TODAY'S CHANGE ON THE CARD REACHES THE WATCH: one store, read by the card and by the watch link, every write announced.
  const pr = await import('../src/lib/planned-rounds')
  ;(globalThis as unknown as { window: EventTarget }).window ??= new EventTarget()
  let heard = 0
  const offChange = pr.subscribeTodayChange(() => { heard++ })
  pr.writeTodayChange('p1', '2026-11-27', 'Assault Bike Rounds', { rounds: { rounds: 3, workSeconds: 180, restSeconds: 60 } })
  const changed = watchCardioOf(pr.withTodayChange({ activity: 'Assault Bike Rounds', duration: 16, targetRpe: 8, rounds: { rounds: 4, workSeconds: 180, restSeconds: 60 } } as never, pr.readTodayChange('p1', '2026-11-27', 'Assault Bike Rounds')))
  check('a change made on the card today (3 rounds, not 4) is what the watch is sent, under the same name', changed?.rounds === 3 && changed.activity === 'Assault Bike Rounds', changed)
  check('...every write is announced, so the screen sends it again', heard === 1, heard)
  check('...for that date only', pr.readTodayChange('p1', '2026-11-28', 'Assault Bike Rounds') === null)
  pr.writeTodayChange('p1', '2026-11-27', 'Assault Bike Rounds', null)
  check('..."Back to the plan" clears it', pr.readTodayChange('p1', '2026-11-27', 'Assault Bike Rounds') === null && heard === 2)
  offChange()
  const panelSrc = strip(read('src/components/exercise/TodayPanel.tsx'))
  check('the screen sends the watch today\'s cardio WITH today\'s change, and listens for a new one', /watchCardioOf\(withTodayChange\(plannedToday, readTodayChange\(profileId \?\? 'anon', today, plannedToday\.activity\)\)\)/.test(panelSrc) && /subscribeTodayChange\(/.test(panelSrc))
  check('...and the card writes through the same store', /writeTodayChange\(who, date, activity, c\)/.test(strip(read('src/components/exercise/PlannedSessionHero.tsx'))))
  const tsSrc = strip(read("android/wear/src/main/java/uk/co/personaltrainerapp/wear/TodayStore.java"))
  check('the watch reads the planned cardio, and a day with only cardio is a session', /JSONObject cj = o\.optJSONObject\("cardio"\)/.test(tsSrc) && /if \(\(arr == null \|\| arr\.length\(\) == 0\) && s\.cardio == null\) return null;/.test(tsSrc))
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
  check('a weight under any other name is never read (only the watch\'s "kg")', !JSON.stringify(waitingWatchSets()).includes('140') && r6.sets === 1)
  // HIS "ADJUST REPS AND WEIGHT": what he did on the watch rides with the set; a number no set has is dropped.
  await applyWatchEvents([
    { id: 'a1', type: 'set', date: '2026-11-27', exerciseId: 'row', name: 'Cable Row', setNumber: 1, reps: 8, kg: 57.5, at: 4 },
    { id: 'a2', type: 'set', date: '2026-11-27', exerciseId: 'row', name: 'Cable Row', setNumber: 2, reps: 9000, kg: -5, at: 5 },
  ], ctx)
  const a1 = waitingWatchSets().find(x => x.id === 'a1'), a2 = waitingWatchSets().find(x => x.id === 'a2')
  check('his reps and weight ride with the set', a1?.reps === 8 && a1?.kg === 57.5, a1)
  check('...a count or weight no set has is dropped, never saved', a2 != null && a2.reps === undefined && a2.kg === undefined, a2)
  // UNDO: a set still waiting simply comes off; one the list already saved waits here to be deleted from it.
  await applyWatchEvents([{ id: 'u1', type: 'set-undo', date: '2026-11-27', exerciseId: 'row', name: 'Cable Row', setNumber: 1, at: 6 }], ctx)
  // Kept behind the set, not taken off here: only the Exercise tab knows whether it already pressed that set's tick
  // (a set saved a moment ago is still in this queue until the save is confirmed; verify:watch-sets 5 drives both).
  const qa = waitingWatchSets()
  check('an undo is kept BEHIND the set it undoes, for the Exercise tab to settle', qa.findIndex(x => x.id === 'a1') >= 0 && qa.findIndex(x => x.id === 'a1') < qa.findIndex(x => x.id === 'u1'), qa.map(x => x.id))
  await applyWatchEvents([{ id: 'u2', type: 'set-undo', date: '2026-11-27', exerciseId: 'fly', name: 'Cable Fly', setNumber: 3, at: 7 }], ctx)
  check('an undo of a set already on the list waits, to delete it there', waitingWatchSets().some(x => x.id === 'u2' && x.undo), waitingWatchSets())
  queueWatchSet({ id: 'again', date: '2026-11-27', exerciseId: 'fly', name: 'Cable Fly', setNumber: 3, reps: 12, at: 8 })
  const q = waitingWatchSets()
  check('...and the same set logged again waits BEHIND the undo, both kept', q.findIndex(x => x.id === 'u2') >= 0 && q.findIndex(x => x.id === 'u2') < q.findIndex(x => x.id === 'again'), q.map(x => x.id))
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
  // REVERSED 27 Nov 2026 by his "Adjust reps and weight": the set carries his reps, and his weight under "kg" only.
  const mainSrc = strip(read(`${W}MainActivity.java`))
  // ONLY WHERE HE CHANGED THEM: unchanged, the phone saves its own number, the right one even for a session that came
  // days ago with the week ahead.
  check('a watch set carries his reps and his weight ("kg") only where he changed them from the plan', /if \(reps != LiftFlow\.plannedReps\(x\.reps\)\) e\.put\("reps", reps\)/.test(mainSrc) && /if \(x\.kg >= 0 && kg != x\.kg\) e\.put\("kg", kg\)/.test(mainSrc) && !/put\("weight/.test(mainSrc))
  check('steps and distance only on foot (walk, run, or a planned session the phone calls on foot), as the phone records them', /onFoot = "cardio"\.equals\(kind\) && \("Walk"\.equals\(activity\) \|\| "Run"\.equals\(activity\) \|\| onFootPlanned\)/.test(service))
  const main = strip(read(`${W}MainActivity.java`))
  // HIS FLOW, 27 Nov 2026 ("One tap, with options"): the words and the order come from LiftFlow, which
  // test:watch-flow RUNS; these hold that the screens draw what it decides rather than words of their own.
  check('the lift screen draws LiftFlow\'s kicker, the exercise, his reps and weight as numbers to tap, and the set', /kicker\(LiftFlow\.liftKicker\(setNumber\)/.test(main) && /setLine\(x, /.test(main) && /tapNumber\(r, LiftFlow\.countText\(reps, x\.reps\), null, reps != LiftFlow\.plannedReps\(x\.reps\) \? WatchStyle\.VIOLET : FG, v -> showEdit\(x, false\)\)/.test(main) && /tapNumber\(r, load\[0\], load\[1\], kg != x\.kg \? WatchStyle\.VIOLET : MINT, v -> showEdit\(x, true\)\)/.test(main) && /"Set " \+ setNumber \+ " of " \+ x\.sets/.test(main))
  check('Log set is ONE tap: it ticks the set and starts the rest', /edge\(LiftFlow\.logLabel\(x\), R\.drawable\.ic_check, v -> setDone\(s, x\)\)/.test(main) && /startRest\(x\.restSeconds \* 1000L, x\.restSeconds \* 1000L, after\)/.test(main))
  check('the rest\'s button is LiftFlow\'s "Next set" / "Next exercise", and ends the rest in the service', /edge\(LiftFlow\.restButton\(same\), 0, v -> endRest\(\)\)/.test(main) && /private void endRest\(\) \{\s*WorkoutService\.rest\(this, 0, 0, null, null\);/.test(main) && /nextLine = text\(LiftFlow\.restLine\(x, setNumber, same\)/.test(main))
  // BIG ENOUGH FOR SHAKY, SWEATY HANDS (28 Nov 2026, his words): every session screen's one action is the edge
  // button across the bottom of the face, and nothing he taps mid-session is under 48dp.
  const fnBody = (name: string) => new RegExp(`private void ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}`).exec(main)?.[0] ?? ''
  const edgeDp = Number(/static final int EDGE_DP = (\d+);/.exec(main)?.[1] ?? 0)
  check('the edge button is the whole bottom of the face, at least 56dp tall, and never scrolls away', edgeDp >= 56 && /root\.addView\(edgeBtn, new FrameLayout\.LayoutParams\(FrameLayout\.LayoutParams\.MATCH_PARENT, dp\(EDGE_DP\), Gravity\.BOTTOM\)\)/.test(main), edgeDp)
  check('each session screen\'s action is on it: Log set, Next set, Done, End workout', ['showLift', 'showRest', 'showEdit', 'showSessionDone'].every(f => /\bedge\(/.test(fnBody(f))) && !['showLift', 'showRest', 'showEdit', 'showSessionDone'].some(f => /\bbutton\(/.test(fnBody(f))))
  check('...and it goes when a screen without one is drawn', (main.match(/column\.removeAllViews\(\);\s*hideEdge\(\);/g) ?? []).length === (main.match(/column\.removeAllViews\(\);/g) ?? []).length)
  const minH = (name: string) => Number(new RegExp(`setMinHeight\\(dp\\((\\d+)\\)\\)`).exec(fnBody(name))?.[1] ?? 0)
  const roundDp = Number(/new LinearLayout\.LayoutParams\(dp\((\d+)\), dp\(\1\)\)\);/.exec(fnBody('round'))?.[1] ?? 0)
  check('the numbers to tap, the ±15s, the quiet actions are 48dp tall at least, the − / + 56dp', minH('tapNumber') >= 48 && minH('small') >= 48 && /setMinHeight\(dp\((4[89]|[5-9]\d)\)\)/.test(/private TextView quiet\([\s\S]*?\n    \}/.exec(main)?.[0] ?? '') && roundDp >= 56, { tap: minH('tapNumber'), small: minH('small'), round: roundDp })
  // THE GYM-FLOOR REVIEW, 27 Nov 2026: what a lifter needs with chalky hands and a sleeping screen.
  check('the bezel turns the number being changed (rotary events, on the edit screen only)', /screen == Screen\.EDIT && ev\.getAction\(\) == MotionEvent\.ACTION_SCROLL[\s\S]{0,120}SOURCE_ROTARY_ENCODER[\s\S]{0,160}stepEdit\(delta > 0 \? 1 : -1\)/.test(main))
  check('the − / + step through LiftFlow, by the implement\'s notch and the count\'s step', /LiftFlow\.stepKg\(TodayStore\.kg\(this, editing\), dir, editing\.step\)/.test(main) && /LiftFlow\.stepReps\(TodayStore\.reps\(this, editing\), dir, editing\.reps\)/.test(main))
  check('the rest moves ±15s', /small\(nudge, "−15s", v -> nudgeRest\(-1\)\)/.test(main) && /small\(nudge, "\+15s", v -> nudgeRest\(1\)\)/.test(main) && /LiftFlow\.nudgeRestMs\(left, dir\)/.test(main))
  const undoSrc = /private void undoLast\([\s\S]*?\n    \}/.exec(main)?.[0] ?? ''
  check('Undo takes the set off the watch AND tells the phone ("set-undo")', /TodayStore\.untick\(this, x\)/.test(undoSrc) && /e\.put\("type", "set-undo"\)/.test(undoSrc) && /PhoneLink\.send\(this, e\)/.test(undoSrc), undoSrc.slice(0, 200))
  check('"All exercises" lists every one, and a tap makes it the next', /quiet\("All exercises", v -> showList\(\)\)/.test(main) && /TodayStore\.choose\(this, e\); showLift\(\);/.test(main))
  check('"Next exercise" is offered on the lift screen and, mid-exercise, on the rest', /if \(exerciseAfter\(s, x\) != null\) quiet\("Next exercise", v -> moveOn\(x\)\)/.test(main) && /if \(same && exerciseAfter\(s, x\) != null\) quiet\("Next exercise", v -> moveOn\(x\)\)/.test(main))
  const moveOn = /private void moveOn\([\s\S]*?\n    \}/.exec(main)?.[0] ?? ''
  check('moving on is kept on the watch only: nothing is sent, so the phone keeps those sets open', /TodayStore\.skip\(this, x\)/.test(moveOn) && !/PhoneLink/.test(moveOn), moveOn)
  check('the watch decides "what next" through LiftFlow, with its own counts', /LiftFlow\.next\(s\.exercises, state\)/.test(main) && /TodayStore\.skipped\(MainActivity\.this, x\)/.test(main) && /prefs\(c\)\.getBoolean\(skipKey\(x\), false\)/.test(todayStore) && /"skip:" \+ today\(\)/.test(todayStore))
  check('...and a move-on is saved, so it holds when the watch screen is reopened', /static void skip\(Context c, Exercise x\) \{ prefs\(c\)\.edit\(\)\.putBoolean\(skipKey\(x\), true\)\.apply\(\); \}/.test(todayStore))
  // THE REST BUZZES WITH THE SCREEN OFF: the workout service holds it, keeps the CPU awake for it, and buzzes 10s
  // before (LiftFlow.warnBeforeMs) and at the end; the screen only shows it.
  check('the rest buzzes from the workout service, early and at the end, with the CPU kept awake', /restLock\.acquire\(left \+ 15_000L\)/.test(service) && /main\.postDelayed\(warnBuzz, left - warn\)/.test(service) && /main\.postDelayed\(endBuzz, left\)/.test(service) && /LiftFlow\.warnBeforeMs\(LIVE\.restTotalMs\)/.test(service))
  check('...and the screen never buzzes itself (no second buzz)', !/vibrate\(/.test(main))
  // A PLANNED CARDIO SESSION RUNS IN THE SERVICE: every buzz of IntervalFlow scheduled with the CPU held, under the plan's name.
  check('a planned session\'s buzzes are IntervalFlow\'s, scheduled in the service with the CPU kept awake', /IntervalFlow\.buzzes\(l\.pRounds, l\.pWork, l\.pRest, l\.pMinutes\)/.test(service) && /restLock\.acquire\(total \+ 60_000L\)/.test(service) && /main\.postDelayed\(r, in\)/.test(service))
  check('...it starts from the watch\'s home under the plan\'s own activity name (so the phone marks the day done)', /button\("Start " \+ \(k\.rounds > 0 \? "intervals" : "session"\), true, 0, v -> startPlannedCardio\(k\)\)/.test(main) && /WorkoutService\.startPlanned\(this, k\)/.test(main) && /putExtra\(EXTRA_ACTIVITY, k\.activity\)/.test(service))
  check('...and its screen reads IntervalFlow: WORK / REST, the round, this round\'s time left', /IntervalFlow\.kicker\(ph, l\.effort\)/.test(main) && /IntervalFlow\.line\(ph, l\.pMinutes\)/.test(main) && /duration\(ph\.leftMs \+ 999\)/.test(main))
  // THE REVIEW OF 27 NOV 2026, before his first gym test (an independent read of the watch code, findings fixed):
  const manifest = read('android/wear/src/main/AndroidManifest.xml')
  const styles = read('android/wear/src/main/res/values/styles.xml')
  check('swipe-to-close is off (a swipe mid-workout closed the app)', /android:theme="@style\/WatchTheme"/.test(manifest) && /<item name="android:windowSwipeToDismiss">false<\/item>/.test(styles))
  const back = /public void onBackPressed\(\) \{[\s\S]*?\n    \}/.exec(main)?.[0] ?? ''
  check('Back steps back a screen: a number or the list to the set, never out of an ended workout', /case EDIT: case LIST: showLift\(\); return;/.test(back) && /case LOGGED:[\s\S]*?return;/.test(back) && !/case LOGGED:[^;]*super/.test(back), back.slice(0, 300))
  check('Health Services is declared, so Android does not hide it', /<package android:name="com\.google\.android\.wearable\.healthservices" \/>/.test(manifest))
  check('a buzz is an alarm, so Do Not Disturb does not swallow it', /VibrationAttributes\.USAGE_ALARM/.test(service))
  check('a workout type the watch does not list falls back to a general workout (no crash)', /ExerciseType use = caps\.getSupportedExerciseTypes\(\)\.contains\(type\) \? type : ExerciseType\.WORKOUT;/.test(service) && /getExerciseTypeCapabilities\(use\)/.test(service))
  check('a start that fails ends any earlier exercise and tries once more', /exercise\.endExerciseAsync\(\), new FutureCallback<Void>\(\)[\s\S]{0,200}exercise\.startExerciseAsync\(config\)/.test(service))
  check('the last set of a session can be undone from "Session done"', /private void showSessionDone\(\) \{[\s\S]*?quiet\("Undo set " \+ TodayStore\.done\(this, last\), v -> undoLast\(s, last\)\)/.test(main))
  check('a rest asked of a service with no workout stops it', /if \(LIVE\.running\) scheduleRest\([^)]*\)[^;]*;\s*else stopSelf\(\);/.test(service))
  check('a denied heart-rate permission says where to switch it on', /if \(!hasHeartPermission\(\)\) \{ askForHeart\(\); return; \}/.test(main) && /Switch it on in the watch's Settings/.test(main))
  check('...and ending a workout cancels every buzz still to come', /for \(Runnable r : programBuzzes\) main\.removeCallbacks\(r\);/.test(service))
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
  check('permissions are asked when he starts a workout, not on install alone', /if \(!hasHeartPermission\(\)\) \{ askForHeart\(\); return; \}/.test(main))
  const bridge = strip(read('src/lib/watch-bridge.ts'))
  check('the plugin is loaded inside the Android phone app only, by a dynamic import', /await import\('@capacitor\/core'\)/.test(bridge) && /getPlatform\(\) !== 'android'/.test(bridge) && !/^import .*@capacitor/m.test(bridge))
  check('the phone shows the watch\'s live number as the watch\'s', /liveHeartSource\(\) === 'watch' \? 'Heart rate live from your watch\.'/.test(read('src/components/RecordActivityCard.tsx')))
  check('every reader of the strap\'s readings reads the watch\'s too', ['src/lib/health-heart.ts', 'src/lib/activity-recording.ts', 'src/lib/watch-workouts.ts'].every(f => /hasOwnReadings\(\)/.test(read(f)) && !/strap\.pairedStrap\(\)/.test(strip(read(f)))))

  console.log('\n5. The look is the app\'s (his "the watch needs to look more high end", 27 Nov 2026)')
  const css = read('src/index.css')
  const nightshift = css.slice(css.indexOf('[data-theme="nightshift"]'), css.indexOf('}', css.indexOf('[data-theme="nightshift"]')))
  const token = (name: string, src = nightshift) => new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(src)?.[1]?.toUpperCase()
  const style = read(`${W}WatchStyle.java`)
  const javaColor = (name: string) => new RegExp(`${name} = Color\\.parseColor\\("(#[0-9A-Fa-f]{6})"\\)`).exec(style)?.[1]?.toUpperCase()
  const pairs: [string, string | undefined][] = [
    ['BG', token('background')], ['FG', token('foreground')], ['MUTED', token('muted-foreground')], ['BORDER', token('border')],
    ['MINT', token('theme-primary')], ['MINT_2', token('theme-primary-2')], ['ON_MINT', token('primary-foreground')],
    ['VIOLET', token('role-ai', css)], ['HEART', token('destructive', css)], ['NUM', token('num-hero')],
  ]
  const off = pairs.filter(([j, t]) => !t || javaColor(j) !== t).map(([j, t]) => `${j}: watch ${javaColor(j)} app ${t}`)
  check('every watch colour is the app\'s own (the default theme)', off.length === 0, off)
  const fonts = ['space_grotesk_medium', 'space_grotesk_semibold', 'space_grotesk_bold', 'jetbrains_mono_bold']
  const { existsSync, statSync } = await import('fs')
  check('the app\'s font, Space Grotesk, and a monospace for numbers, are in the watch app', fonts.every(f => existsSync(`android/wear/src/main/res/font/${f}.ttf`) && statSync(`android/wear/src/main/res/font/${f}.ttf`).size > 20_000) && fonts.every(f => style.includes(`R.font.${f}`)))
  const icons = ['ic_walk', 'ic_run', 'ic_bike', 'ic_other', 'ic_heart', 'ic_check']
  check('the app\'s own icons (lucide), every one the screens use', icons.every(i => /lucide/.test(read(`android/wear/src/main/res/drawable/${i}.xml`))) && icons.every(i => main.includes(`R.drawable.${i}`)))
  const ringSrc = strip(read(`${W}RingView.java`))
  check('progress lives on the edge ring: sets in mint, rest in violet, the zone in the heart\'s colour', /ring\.set\(sessionFraction\(s\), MINT\)/.test(main) && /ring\.set\(live\.restTotalMs > 0 \? left \/ \(float\) live\.restTotalMs : 0f, WatchStyle\.VIOLET\)/.test(main) && /ring\.set\(zone \/ 5f, WatchStyle\.HEART\)/.test(main) && /drawArc/.test(ringSrc))
  check('numbers are monospaced, so the clock does not shuffle', /clock = mono\(/.test(main) && /restClock = mono\(/.test(main) && /heartBpm = inline\(heartRow, "–", \d+, FG, WatchStyle\.mono\(this\)\)/.test(main))
  check('a stale heart rate shows a dash, never its last number', /heartBpm\.setText\(fresh \? String\.valueOf\(l\.bpm\) : "–"\)/.test(main) && /System\.currentTimeMillis\(\) - l\.bpmAt <= WorkoutService\.HR_HOLD_MS/.test(main))
  const svcHr = strip(read('android/wear/src/main/java/uk/co/personaltrainerapp/wear/WorkoutService.java'))
  const holdMs = Number(/HR_HOLD_MS = ([\d_]+)L?;/.exec(svcHr)?.[1]?.replace(/_/g, ''))
  check('the watch holds a reading through a sensor skip exactly as long as the phone does', holdMs === strap.WATCH_STALE_MS, { holdMs })
  check('with the screen off the watch is asked for heart rate every five seconds, where it says it can (his walk, 27 Nov 2026)',
    /if \(caps\.getSupportedBatchingModeOverrides\(\)\.contains\(BatchingMode\.HEART_RATE_5_SECONDS\)\) \{\s*builder\.setBatchingModeOverrides\(java\.util\.Collections\.singleton\(BatchingMode\.HEART_RATE_5_SECONDS\)\);/.test(svcHr) && /ExerciseConfig config = builder\.build\(\);/.test(svcHr))
  check('readings go to the phone every second, never five (the phone ran behind the wrist)', Number(/BATCH_MS = (\d+);/.exec(svcHr)?.[1]) <= 1000)

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.error(`${failures} failure(s)`); process.exit(1) }
  console.log('All watch-app checks passed.')
}
main().catch(e => { console.error('crashed', e); process.exit(1) })
