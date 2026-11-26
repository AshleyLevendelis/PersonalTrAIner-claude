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
  MIN_OFFER_MINUTES, LOOK_BACK_HOURS,
} from '../src/lib/watch-workouts'
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

console.log(`\n${ran} checks ran, ${failures} failed`)
process.exit(failures > 0 ? 1 : 0)
