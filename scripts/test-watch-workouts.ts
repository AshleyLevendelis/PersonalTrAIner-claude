// WORKOUTS THE WATCH RECORDED, AND A RESTING HEART RATE FROM THE NIGHT (his brief 26 Nov 2026). The rules, as logic:
//   1. the store's word for a workout becomes the app's, and anything unknown is a plain "Workout"
//   2. what is offered: real workouts the app does not already hold, never one twice
//   3. the offer's "when" line
//   4. a resting figure worked out from overnight readings when the watch shares none
//   5. source properties: the switch gates every read, nothing is logged without his tap, a blind read offers nothing
// The screen half is verify:watch-workouts. One exit, at the bottom.
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  watchActivityName, isStrengthWorkout, countsSteps, watchWorkoutMinutes, watchOffers, watchWhenLine, localDateOf,
  MIN_OFFER_MINUTES, LOOK_BACK_HOURS, activityFamily, isPlannedKind,
} from '../src/lib/watch-workouts'
import { heartSeries, heartRange, heartZones, mostlyZone, zoneOf, ZONES, pacePerKm, estimatedMaxHeartRate, rowSpans } from '../src/lib/heart-series'
import { restingFromOvernight, restingByDay, OVERNIGHT_MIN_READINGS, OVERNIGHT_TO_HOUR } from '../src/lib/health-heart'
import type { WatchWorkout } from '../src/lib/health-steps'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
let failures = 0, ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`) }
}

// A fixed "now": Wednesday 16 Sep 2026, 14:00 local. Nothing here reads the machine's calendar.
const NOW = new Date(2026, 8, 16, 14, 0, 0)
const at = (minsAgo: number) => new Date(NOW.getTime() - minsAgo * 60000).toISOString()
const w = (id: string, type: string, startAgo: number, endAgo: number, extra: Partial<WatchWorkout> = {}): WatchWorkout =>
  ({ id, type, start: at(startAgo), end: at(endAgo), kcal: null, distanceM: null, source: 'Samsung Health', ...extra })
const run = w('run', 'running', 132, 90, { kcal: 410, distanceM: 5200 })
const offer = (o: Partial<Parameters<typeof watchOffers>[0]>) => watchOffers({ workouts: [run], cardio: [], sessions: [], dismissed: [], now: NOW, ...o }).map(x => x.id)

// ---------------------------------------------------------------------------
console.log('\n1. The store\'s word becomes the app\'s')
// ---------------------------------------------------------------------------
{
  check('running is a Run, walking a Walk, cycling Cycling', watchActivityName('running') === 'Run' && watchActivityName('walking') === 'Walk' && watchActivityName('cycling') === 'Cycling')
  check('every kind of strength session is "Strength training"', ['strengthTraining', 'traditionalStrengthTraining', 'functionalStrengthTraining', 'weightlifting'].every(t => watchActivityName(t) === 'Strength training' && isStrengthWorkout(t)))
  check('a run is not strength', !isStrengthWorkout('running'))
  check('a type the app has no word for is a plain "Workout", never the store\'s own code', watchActivityName('paddleSports') === 'Workout' && watchActivityName('') === 'Workout')
  check('steps are kept on foot only (a ride\'s steps are noise)', countsSteps('running') && countsSteps('walking') && countsSteps('hiking') && !countsSteps('cycling') && !countsSteps('strengthTraining') && !countsSteps('swimming'))
  check('minutes are whole and from the watch\'s own start and end', watchWorkoutMinutes(run) === 42)
  check('a workout that ends before it starts has no length', watchWorkoutMinutes({ start: at(10), end: at(20) }) === 0)
}

// ---------------------------------------------------------------------------
console.log('\n2. What is offered')
// ---------------------------------------------------------------------------
{
  check('a run the app knows nothing about is offered', JSON.stringify(offer({})) === '["run"]')
  check(`under ${MIN_OFFER_MINUTES} minutes is not a workout`, offer({ workouts: [w('blip', 'walking', 33, 30)] }).length === 0)
  check(`...and exactly ${MIN_OFFER_MINUTES} minutes is`, offer({ workouts: [w('five', 'walking', 35, 30)] }).length === 1)
  check('one still running (its end is in the future) is not offered yet', offer({ workouts: [w('live', 'running', 20, -5)] }).length === 0)
  check(`older than ${LOOK_BACK_HOURS} hours is not offered`, offer({ workouts: [w('old', 'running', LOOK_BACK_HOURS * 60 + 60, LOOK_BACK_HOURS * 60 + 20)] }).length === 0)
  check('...and one from yesterday evening is', offer({ workouts: [w('yday', 'running', 20 * 60, 19 * 60 + 20)] }).length === 1)
  check('a dismissed one never comes back', offer({ dismissed: ['run'] }).length === 0)
  check('the same workout listed twice by the store is offered once', offer({ workouts: [run, { ...run }] }).length === 1)

  // Already held: the app's own recorded run (it knows its start).
  check('the app\'s own recording of that time is not offered again', offer({ cardio: [{ activity_name: 'Run', date: localDateOf(run.start), duration_minutes: 41, started_at: at(131), completed_at: at(89) }] }).length === 0)
  // ...a workout session that covers it.
  check('a workout session covering that time is not offered again', offer({ workouts: [w('lift', 'strengthTraining', 70, 15)], sessions: [{ started_at: at(72), finished_at: at(14) }] }).length === 0)
  check('...nor one still running since before it', offer({ workouts: [w('lift', 'strengthTraining', 70, 15)], sessions: [{ started_at: at(80), finished_at: null }] }).length === 0)
  check('a session that only brushes it (ten of its 42 minutes) does not hide it', offer({ sessions: [{ started_at: at(100), finished_at: at(60) }] }).length === 1)
  check('a session covering more than half of it does', offer({ sessions: [{ started_at: at(125), finished_at: at(95) }] }).length === 0)
  // A log typed later has no true time: the same activity that day at about the same length is the same workout.
  const typed = (minutes: number, name = 'Run', date = localDateOf(run.start)) => ({ activity_name: name, date, duration_minutes: minutes, completed_at: at(5) })
  check('a run typed in by hand that day at about the same length is the same run', offer({ cardio: [typed(40)] }).length === 0 && offer({ cardio: [typed(45)] }).length === 0)
  check('...whatever the capitals', offer({ cardio: [typed(42, 'run')] }).length === 0)
  check('a typed run of a very different length is a different run', offer({ cardio: [typed(20)] }).length === 1)
  check('a typed WALK that day is not his run', offer({ cardio: [typed(42, 'Walk')] }).length === 1)
  check('a typed run on another day is not this one', offer({ cardio: [typed(42, 'Run', '2026-09-14')] }).length === 1)
  // Logged from the offer before the recorded-activity migration: no started_at was kept, the typed rule still holds it.
  check('one logged from the offer on a database with no start column is still not offered twice', offer({ cardio: [{ activity_name: 'Run', date: localDateOf(run.start), duration_minutes: 42, completed_at: at(1) }] }).length === 0)

  const order = watchOffers({ workouts: [w('a', 'running', 300, 250), w('b', 'cycling', 100, 40), w('c', 'walking', 200, 150)], cardio: [], sessions: [], dismissed: [], now: NOW }).map(x => x.id)
  check('the newest is offered first', JSON.stringify(order) === '["b","c","a"]', order)
  check('a workout with an unreadable time is never offered', offer({ workouts: [{ ...run, id: 'bad', start: 'not a time' }] }).length === 0)
}

// ---------------------------------------------------------------------------
console.log('\n3. When it was')
// ---------------------------------------------------------------------------
{
  const today = '2026-09-16'
  check('today: "Today, 11:48"', watchWhenLine(run, today) === 'Today, 11:48', watchWhenLine(run, today))
  check('yesterday: "Yesterday, 18:00"', watchWhenLine({ start: new Date(2026, 8, 15, 18, 0).toISOString() }, today) === 'Yesterday, 18:00')
  check('before that, the weekday: "Mon, 07:05"', watchWhenLine({ start: new Date(2026, 8, 14, 7, 5).toISOString() }, today) === 'Mon, 07:05')
  check('the date a workout is logged to is the local date it began', localDateOf(new Date(2026, 8, 15, 23, 50).toISOString()) === '2026-09-15')
}

// ---------------------------------------------------------------------------
console.log('\n4. A resting figure from the night')
// ---------------------------------------------------------------------------
{
  const night = (day: number, bpms: number[], hour = 2) => bpms.map((bpm, i) => ({ bpm, at: new Date(2026, 8, day, hour, i * 5, 0).toISOString() }))
  const ten = [52, 53, 54, 55, 56, 57, 58, 59, 60, 61]
  check('ten overnight readings give one figure for that date', restingFromOvernight(night(16, ten)).get('2026-09-16') !== undefined && restingFromOvernight(night(16, ten)).size === 1)
  check('...the reading a tenth of the way up from the lowest, not the single lowest', restingFromOvernight(night(16, ten)).get('2026-09-16') === 53, restingFromOvernight(night(16, ten)).get('2026-09-16'))
  check('a lone dropout does not become the figure', restingFromOvernight(night(16, [31, ...ten])).get('2026-09-16') === 52)
  // LITERALS, not the constant on both sides: a check that slices by the constant it tests moves with it (cutting
  // the minimum to 1 passed, found by mutation). Seven readings is no night; eight is.
  check('seven readings: the night has no figure', restingFromOvernight(night(16, ten.slice(0, 7))).size === 0)
  check('...and eight does', restingFromOvernight(night(16, ten.slice(0, 8))).size === 1 && OVERNIGHT_MIN_READINGS === 8)
  check('daytime readings are not a night', restingFromOvernight(night(16, ten, 14)).size === 0 && restingFromOvernight(night(16, ten, OVERNIGHT_TO_HOUR)).size === 0)
  check('a reading no heart makes at rest is ignored (220 on a sleeping wrist)', restingFromOvernight(night(16, [...ten.slice(0, 8), 220, 221])).get('2026-09-16') === 52)
  const two = restingFromOvernight([...night(15, ten), ...night(16, ten.map(b => b + 6))])
  check('each night is its own date', two.get('2026-09-15') === 53 && two.get('2026-09-16') === 59, [...two])
  check('the watch\'s own resting figures are read as before (the lowest that day)', restingByDay([{ bpm: 58, at: new Date(2026, 8, 16, 4).toISOString() }, { bpm: 61, at: new Date(2026, 8, 16, 9).toISOString() }]).get('2026-09-16') === 58)
  const src = strip(read('src/lib/health-heart.ts'))
  check('the night\'s figure is used ONLY when the store holds no resting figure at all (the two are never mixed)', /if \(byDay\.size === 0\) \{[\s\S]{0,700}restingFromOvernight\(/.test(src) && (src.match(/restingFromOvernight\(/g) ?? []).length === 2)
  check('...read a night at a time, never one read for the fortnight', /for \(let i = 0; i < 14; i\+\+\)[\s\S]{0,500}heartRateSamples\(start,/.test(src))
}

// ---------------------------------------------------------------------------
console.log('\n5. The switch, the tap and the blind read')
// ---------------------------------------------------------------------------
{
  const lib = strip(read('src/lib/watch-workouts.ts'))
  const readFn = lib.slice(lib.indexOf('export async function readWatchOffers'), lib.indexOf('export async function logWatchWorkout'))
  check('reading offers is gated on the switch before anything is asked of the phone', readFn.indexOf('if (!isWatchWorkoutsConnected()) return []') > 0 && readFn.indexOf('if (!isWatchWorkoutsConnected()) return []') < readFn.indexOf('healthAdapter'))
  check('a read that cannot see what the app holds offers nothing', /if \(cardio\.source !== 'server' \|\| sessions\.error\) return \[\]/.test(readFn))
  check('held logs come from the app\'s one cardio reader (so a log still on the phone counts)', /readCardioLogs\(profileId/.test(readFn))
  check('reading offers saves nothing', !/saveCardioLog\(|\.insert\(|\.upsert\(|\.update\(/.test(readFn))
  const card = strip(read('src/components/WatchWorkoutsCard.tsx'))
  check('the only route to a log is the effort tap', (card.match(/logWatchWorkout\(/g) ?? []).length === 1 && /onEffort=\{e => void log\(e\)\}/.test(card) && /effort=\{null\}/.test(card))
  check('no effort is chosen for him', !/effort=\{['"`]/.test(card))
  const home = strip(read('src/components/Dashboard.tsx'))
  check('Home loads the watch code only in the phone app', /if \(!isPhoneApp\(\)\) return[\s\S]{0,200}import\('@\/lib\/watch-workouts'\)/.test(home) && !/^import .*watch-workouts/m.test(home))
  check('...and mounts the card only with the switch on', /\{watchOn && profile\.id && \(/.test(home))
  const adapter = strip(read('src/lib/health-steps.ts'))
  check('the phone is asked to READ workouts and never to write', /requestAuthorization\(\{ read: \['workouts', 'distance', 'calories', 'heartRate', 'steps'\] \}\)/.test(adapter) && !/write:/.test(adapter))
  const log = lib.slice(lib.indexOf('export async function logWatchWorkout'))
  check('a logged workout keeps the watch\'s own start and end', /startedAt: w\.start/.test(log) && /endedAt: w\.end/.test(log) && /date: localDateOf\(w\.start\)/.test(log))
  check('the watch\'s own calories are never marked an estimate', /kcalEstimated: ownKcal != null \? false : f\.kcalEstimated/.test(log))
}

// ---------------------------------------------------------------------------
console.log('\n6. What the heart rate looked like (the summary\'s graph, time by effort and pace)')
// ---------------------------------------------------------------------------
{
  const start = new Date(2026, 8, 16, 10, 0, 0), end = new Date(2026, 8, 16, 10, 40, 0)
  const every = (mins: number, bpm: (minute: number) => number) => Array.from({ length: Math.floor(40 / mins) + 1 }, (_, i) => ({ bpm: bpm(i * mins), at: new Date(start.getTime() + i * mins * 60000).toISOString() }))
  // 40 minutes, a reading a minute: 10 minutes at 110, 20 at 140, 10 at 170 (the last reading, at 40:00, holds no time).
  const stepped = every(1, m => (m < 10 ? 110 : m < 30 ? 140 : 170))

  const series = heartSeries(stepped, start, end, 8)
  check('the graph is at most the points asked for, in order, each inside the session', series.length === 8 && series.every((p, i) => p.t > 0 && p.t < 1 && (i === 0 || p.t > series[i - 1].t)), series)
  check('...each point the average of its slice (the first two are 110, the last two 170)', series[0].bpm === 110 && series[1].bpm === 110 && series[6].bpm === 170 && series[7].bpm === 170, series.map(p => p.bpm))
  check('a watch that wrote a reading every second and one every minute draw the same shape', JSON.stringify(heartSeries(every(1, m => 100 + m), start, end, 8).map(p => p.bpm)) === JSON.stringify(heartSeries(Array.from({ length: 2401 }, (_, i) => ({ bpm: 100 + i / 60, at: new Date(start.getTime() + i * 1000).toISOString() })), start, end, 8).map(p => Math.round(p.bpm))))
  check('fewer than three readings is no graph', heartSeries(stepped.slice(0, 2), start, end).length === 0)
  check('readings outside the session are not on it', heartSeries([...stepped, { bpm: 200, at: new Date(end.getTime() + 60000).toISOString() }], start, end, 8).every(p => p.bpm <= 170))
  check('a reading no heart makes (0, 260) is dropped, not drawn', heartRange([...stepped, { bpm: 0, at: new Date(start.getTime() + 90000).toISOString() }, { bpm: 260, at: new Date(start.getTime() + 150000).toISOString() }], start, end)?.low === 110 && heartRange([...stepped, { bpm: 260, at: new Date(start.getTime() + 150000).toISOString() }], start, end)?.high === 170)
  check('the range is the true lowest and highest reading', JSON.stringify(heartRange(stepped, start, end)) === '{"low":110,"high":170}')

  check('the estimated maximum is 208 minus 0.7 x age: 187 at 30, 173 at 50', estimatedMaxHeartRate(30) === 187 && estimatedMaxHeartRate(50) === 173)
  check('...and there is none without an age', estimatedMaxHeartRate(null) === null && estimatedMaxHeartRate(undefined) === null && estimatedMaxHeartRate(0) === null && estimatedMaxHeartRate(140) === null)

  // FIVE ZONES, each a tenth of the maximum (his ruling 26 Nov 2026). At a maximum of 200: zone 2 from 120, zone 3
  // from 140, zone 4 from 160, zone 5 from 180.
  check('the lines are 60, 70, 80 and 90% of the maximum', zoneOf(119, 200) === 1 && zoneOf(120, 200) === 2 && zoneOf(139, 200) === 2 && zoneOf(140, 200) === 3 && zoneOf(159, 200) === 3 && zoneOf(160, 200) === 4 && zoneOf(179, 200) === 4 && zoneOf(180, 200) === 5 && zoneOf(200, 200) === 5)
  check('each zone carries the app\'s effort word: 1 and 2 are easy, 3 is steady, 4 and 5 are hard', ZONES.map(z => z.effort).join(',') === 'easy,easy,steady,hard,hard' && ZONES.map(z => z.word).join(',') === 'Very easy,Easy,Steady,Hard,All out')
  // The stepped session at a maximum of 200: 10 minutes at 110 (zone 1), 20 at 140 (zone 3), 10 at 170 (zone 4).
  const z = heartZones(stepped, start, end, 200)
  check('time in zones: 10 minutes in zone 1 (110), 20 in zone 3 (140), 10 in zone 4 (170)', z !== null && JSON.stringify(z.minutes) === '[10,0,20,10,0]', z)
  check('...each zone\'s floor in beats, for the range the screen prints (120, 140, 160, 180)', z !== null && JSON.stringify(z.floors) === '[0,120,140,160,180]' && z.maxUsed === 200, z)
  const flat = (bpm: number) => heartZones(every(1, () => bpm), start, end, 200)?.minutes.join(',')
  check('a whole session at 179 is zone 4, at 180 zone 5', flat(179) === '0,0,0,40,0' && flat(180) === '0,0,0,0,40', [flat(179), flat(180)])
  const over = heartZones(every(1, m => (m < 20 ? 150 : 200)), start, end, 180)
  check('a session that went over the estimate is measured against its own highest reading (150 is zone 3 of 200, not zone 4 of 180)', over?.maxUsed === 200 && over?.minutes.join(',') === '0,0,20,0,20', over)
  check('no estimate (no age, or a condition ticked), no zones', heartZones(stepped, start, end, null) === null)
  check('a watch that dropped out for most of the session draws no zones (15 of 40 minutes read)', heartZones(stepped.slice(0, 4), start, end, 200) === null, heartZones(stepped.slice(0, 4), start, end, 200))
  check('...and a gap is not effort: one reading stands for five minutes at most', heartZones([stepped[0], stepped[1], stepped[2], ...stepped.slice(20)], start, end, 200)?.minutes[0] === 7, heartZones([stepped[0], stepped[1], stepped[2], ...stepped.slice(20)], start, end, 200))

  const zm = (minutes: [number, number, number, number, number]) => ({ minutes, floors: [0, 120, 140, 160, 180] as [number, number, number, number, number], maxUsed: 200 })
  check('mostly: the zone with the most minutes', mostlyZone(zm([3, 4, 28, 6, 1])) === 3 && mostlyZone(zm([3, 4, 8, 26, 1])) === 4 && mostlyZone(zm([30, 4, 8, 2, 0])) === 1)
  check('...a tie goes to the lower zone, never the higher', mostlyZone(zm([10, 10, 10, 10, 10])) === 1 && mostlyZone(zm([0, 0, 10, 10, 0])) === 3)
  check('...and nothing to say with no zones', mostlyZone(null) === null && mostlyZone(zm([0, 0, 0, 0, 0])) === null)

  check('pace: 42 minutes over 5.2 km is 8:05 a kilometre', pacePerKm(42, 5.2) === '8:05', pacePerKm(42, 5.2))
  check('...seconds are two digits (30 min over 5 km is 6:00)', pacePerKm(30, 5) === '6:00')
  check('no distance, no pace', pacePerKm(42, null) === null && pacePerKm(42, 0) === null && pacePerKm(0, 5) === null)
  check('a distance that makes no pace (90 seconds a km, 40 minutes a km) shows none', pacePerKm(15, 10) === null && pacePerKm(40, 1) === null)

  check('tiles fill their rows: 3 is one row, 4 is two and two, 5 is three and two', JSON.stringify(rowSpans(3)) === '[2,2,2]' && JSON.stringify(rowSpans(4)) === '[3,3,3,3]' && JSON.stringify(rowSpans(5)) === '[2,2,2,3,3]')
  check('...7 is three, two, two (never one alone beside two gaps)', JSON.stringify(rowSpans(7)) === '[2,2,2,3,3,3,3]', rowSpans(7))
  check('...and every row adds up to the full width, for 1 to 9 tiles', [1, 2, 3, 4, 5, 6, 7, 8, 9].every(n => rowSpans(n).length === n && rowSpans(n).reduce((a, x) => a + x, 0) % 6 === 0))
}

// ---------------------------------------------------------------------------
console.log('\n7. The plan beside it, and who sees effort bands')
// ---------------------------------------------------------------------------
{
  check('a run and a jog are one kind; a walk and a hike another', activityFamily('Run') === 'run' && activityFamily('Easy jog') === 'run' && activityFamily('Walk') === 'walk' && activityFamily('Hike') === 'walk' && activityFamily('Run') !== activityFamily('Walk'))
  check('a bike by any name is cycling', activityFamily('Assault Bike — 4 × 3 min') === 'cycle' && activityFamily('Cycling') === 'cycle' && activityFamily('Spin class') === 'cycle')
  check('a name with no movement in it has no kind', activityFamily('Steady cardio') === null && activityFamily('') === null && activityFamily(null) === null)
  check('the watch\'s run IS the plan\'s easy jog', isPlannedKind('running', 'Easy jog'))
  check('...and is not the plan\'s swim or bike', !isPlannedKind('running', 'Swim') && !isPlannedKind('running', 'Assault Bike — 4 × 3 min'))
  check('a plan that names no movement ("Steady cardio", "Cardio intervals") is met by any cardio the watch names', isPlannedKind('running', 'Steady cardio') && isPlannedKind('cycling', 'Cardio intervals') && isPlannedKind('rowing', 'Steady cardio'))
  check('...but never by strength training, yoga or a workout the app has no word for', !isPlannedKind('strengthTraining', 'Steady cardio') && !isPlannedKind('yoga', 'Steady cardio') && !isPlannedKind('paddleSports', 'Cardio intervals'))
  check('a plan that is not cardio at all is met by nothing', !isPlannedKind('running', 'Mobility') && !isPlannedKind('running', null))

  const lib = strip(read('src/lib/watch-workouts.ts'))
  const log = lib.slice(lib.indexOf('export async function logWatchWorkout'), lib.indexOf('export async function readWatchHeart'))
  check('counted as the plan\'s session, it is saved under the session\'s own name (so the day reads done)', /activityName: p\.asPlanned\?\.activity \|\| watchActivityName\(w\.type\)/.test(log))
  check('...keeping the plan\'s exact effort number when he taps the effort it asked for', /intensityRpe: rpeToStore\(p\.effort, p\.asPlanned\?\.targetRpe\)/.test(log))
  const card = strip(read('src/components/WatchWorkoutsCard.tsx'))
  check('the plan is put beside a workout only for TODAY\'s session, still to do, and never a strength workout', /const plan = planned && !planned\.done && !strength && localDateOf\(w\.start\) === today \? planned : null/.test(card))
  check('what it counts as is his choice when made, the kind of movement otherwise', /countAs\?\.id === w\.id \? countAs\.plan : isPlannedKind\(w\.type, plan\.activity\)/.test(card))
  check('a strength session, a health condition or pregnancy: no zones', /const estimatedMax = noHeartBands \|\| isStrengthWorkout\(shown\.type\) \? null : estimatedMaxHeartRate\(body\.age\)/.test(card))
  const home = strip(read('src/components/Dashboard.tsx'))
  check('...and Home says so from the profile\'s own ticks', /noHeartBands=\{\(profile\.health_conditions \?\? \[\]\)\.length > 0\}/.test(home))
  const figs = strip(read('src/components/WorkoutFigures.tsx'))
  check('each zone is its number, its word, its range and its minutes, never colour alone', /Z\{ZONES\[i\]\.zone\}/.test(figs) && /\{ZONES\[i\]\.word\}/.test(figs) && /\{range\(i\)\}/.test(figs) && /\{zones\.minutes\[i\]\}/.test(figs))
  check('...and the screen says the zones come from an ESTIMATED top heart rate', /Zones are tenths of an estimated top heart rate of \{zones\.maxUsed\}/.test(figs))
  check('the heart rate graph carries a spoken label with its average and highest', /aria-label=\{`Heart rate over the session/.test(figs))
}

console.log(`\n${ran} checks ran, ${failures} failed`)
process.exit(failures > 0 ? 1 : 0)
