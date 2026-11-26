// THE WATCH REPORT (step 0 of docs/plans/health-data-next.md, 27 Nov 2026; src/lib/health-diagnostics.ts). As logic:
//   1. what a list of records looks like (count, length, gap, age, who wrote them)
//   2. the report's words, for a read that worked, one that failed and one whose switch is off
//   3. gathering: only what his switches allow is read, a failed read is said and never stops the report
//   4. COUNTS AND TIMES ONLY: no reading can reach the report
//   5. source properties: no permission sheet, nothing saved or sent, Profile's words, the privacy page
// The screen half is verify:watch-report. One exit, at the bottom.
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { summariseRecords, diagnosticsText, gatherDiagnostics, stamp, span, type Diagnostics, type RecordSummary } from '../src/lib/health-diagnostics'
import type { HealthAdapter, HealthRecord } from '../src/lib/health-steps'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
let failures = 0, ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`) }
}

// A fixed "now": Wednesday 16 Sep 2026, 14:05 on this machine's clock. Nothing here reads the calendar.
const NOW = new Date(2026, 8, 16, 14, 5, 0)
const MIN = 60000
const rec = (minsAgo: number, lenMin: number, source: string | null = 'Samsung Health', device: string | null = 'watch'): HealthRecord =>
  ({ start: new Date(NOW.getTime() - minsAgo * MIN).toISOString(), end: new Date(NOW.getTime() - (minsAgo - lenMin) * MIN).toISOString(), source, device })

// A pretend phone. Every reading it hands out is a number that would be recognised if it leaked into the report.
const LEAK = { steps: 76543, bpm: 187, metres: 98765, kcal: 4321 }
const storage = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: k => storage.get(k) ?? null, setItem: (k, v) => { storage.set(k, String(v)) }, removeItem: k => { storage.delete(k) },
  clear: () => storage.clear(), key: () => null, length: 0,
} as Storage
const SWITCH = { steps: 'fitplan_health_steps_connected', heart: 'fitplan_health_heart_connected', workouts: 'fitplan_health_workouts_connected', sleep: 'fitplan_health_sleep_connected' }
let asked: string[] = []
function phone(opts: { distance?: 'minute' | 'none' | 'throws'; workouts?: 'run' | 'none'; noRecords?: boolean } = {}): HealthAdapter {
  const a: HealthAdapter = {
    platform: 'android',
    isAvailable: async () => ({ available: true }),
    requestStepsAccess: async () => { asked.push('REQUEST steps'); return true },
    requestHeartAccess: async () => { asked.push('REQUEST heart'); return true },
    requestActivityAccess: async () => { asked.push('REQUEST activity'); return true },
    requestWorkoutAccess: async () => { asked.push('REQUEST workouts'); return true },
    requestSleepAccess: async () => { asked.push('REQUEST sleep'); return true },
    stepsBetween: async () => { asked.push('stepsTotal'); return LEAK.steps },
    heartRateSamples: async () => { asked.push('heartSamples'); return [{ bpm: LEAK.bpm, at: NOW.toISOString() }] },
    distanceMetersBetween: async () => { asked.push('distanceTotal'); return LEAK.metres },
    activeKcalBetween: async () => { asked.push('kcalTotal'); return LEAK.kcal },
    workoutsBetween: async () => {
      asked.push('workouts')
      if (opts.workouts === 'none') return []
      return [
        { id: 'blip', type: 'walking', start: new Date(NOW.getTime() - 33 * MIN).toISOString(), end: new Date(NOW.getTime() - 30 * MIN).toISOString(), kcal: 9, distanceM: 210, source: 'Samsung Health' },
        { id: 'run', type: 'running', start: new Date(NOW.getTime() - 132 * MIN).toISOString(), end: new Date(NOW.getTime() - 90 * MIN).toISOString(), kcal: LEAK.kcal, distanceM: LEAK.metres, source: 'Samsung Health' },
        { id: 'lift', type: 'strengthTraining', start: new Date(NOW.getTime() - 3000 * MIN).toISOString(), end: new Date(NOW.getTime() - 2945 * MIN).toISOString(), kcal: null, distanceM: null, source: 'Samsung Health' },
      ]
    },
    sleepSessions: async () => {
      asked.push('sleep')
      return Array.from({ length: 3 }, (_, i) => {
        const bed = new Date(2026, 8, 15 - i, 23, 15).getTime()
        return { start: new Date(bed).toISOString(), end: new Date(bed + 450 * MIN).toISOString(), stages: i === 2 ? null : [{ start: new Date(bed).toISOString(), end: new Date(bed + 430 * MIN).toISOString(), stage: 'light' }, { start: new Date(bed + 430 * MIN).toISOString(), end: new Date(bed + 450 * MIN).toISOString(), stage: 'awake' }] }
      })
    },
  }
  if (!opts.noRecords) a.recordsBetween = async (kind, start, end) => {
    asked.push(`records:${kind}`)
    if (kind === 'distance' && opts.distance === 'throws') throw new Error('SecurityException:   no READ_DISTANCE\n permission')
    if (kind === 'distance' && opts.distance === 'none') return []
    const step = kind === 'heartRate' ? 0.5 : kind === 'restingHeartRate' ? 1440 : 1
    const out: HealthRecord[] = []
    for (let t = start.getTime(); t < end.getTime(); t += step * MIN) out.push({ start: new Date(t).toISOString(), end: new Date(t + (kind === 'heartRate' || kind === 'restingHeartRate' ? 0 : MIN)).toISOString(), source: 'Samsung Health', device: 'watch' })
    return out
  }
  return a
}
const use = (a: HealthAdapter | null, on: (keyof typeof SWITCH)[]) => {
  ;(globalThis as { __healthAdapterForTest?: HealthAdapter | null }).__healthAdapterForTest = a
  storage.clear()
  for (const k of on) storage.set(SWITCH[k], '1')
  asked = []
}

async function main() {
  console.log('\n1. What a list of records looks like')
  {
    const s = summariseRecords([rec(10, 1), rec(9, 1), rec(8, 1), rec(30, 5, 'Google Fit', 'phone')], NOW)
    check('it counts them', s.count === 4, s)
    check('the typical length is the middle one (three of a minute, one of five: 60 s)', s.typicalLengthSec === 60, s.typicalLengthSec)
    check('the typical gap is between one start and the next, in time order (21, 1, 1 min: 60 s)', s.typicalGapSec === 60, s.typicalGapSec)
    check('the newest is aged from when it ENDED (ended 7 min ago)', s.newestAgoMin === 7, s.newestAgoMin)
    check('who wrote them, most first, app and device together', JSON.stringify(s.sources) === JSON.stringify([{ name: 'Samsung Health, watch', count: 3 }, { name: 'Google Fit, phone', count: 1 }]), s.sources)
    const jumbled = summariseRecords([rec(5, 1), rec(60, 1), rec(30, 1)], NOW)
    check('...whatever order the phone hands them over in (starts 60, 30 and 5 min ago: gaps 30 and 25, middle 27.5 min)', jumbled.typicalGapSec === 1650, jumbled.typicalGapSec)
    const none = summariseRecords([], NOW)
    check('nothing gives a count of 0 and no invented times', none.count === 0 && none.typicalLengthSec === null && none.typicalGapSec === null && none.newestAgoMin === null && none.sources.length === 0, none)
    const one = summariseRecords([rec(5, 0, null, null)], NOW)
    check('one instant reading: length 0, no gap, and an app with no name is said so', one.count === 1 && one.typicalLengthSec === 0 && one.typicalGapSec === null && one.sources[0].name === 'unnamed app', one)
    const bad = summariseRecords([{ start: 'not a time', end: 'nor this', source: 'X', device: null }, rec(5, 1)], NOW)
    check('a record with no readable time is not counted', bad.count === 1, bad)
    check('lengths of time read plainly: 45 s, 1 min, 2 h 5 min, 3 h', span(45) === '45 s' && span(60) === '1 min' && span(7500) === '2 h 5 min' && span(10800) === '3 h', [span(45), span(60), span(7500), span(10800)])
    check('a moment reads as the phone\'s own clock: "Wed 16 Sep 14:05"', stamp(NOW) === 'Wed 16 Sep 14:05', stamp(NOW))
  }

  console.log('\n2. The report\'s words')
  const ok = (v: RecordSummary) => ({ state: 'ok' as const, value: v })
  const sum = (count: number, len: number | null, gap: number | null, agoMin: number | null): RecordSummary => ({ count, typicalLengthSec: len, typicalGapSec: gap, newestAgoMin: agoMin, sources: count ? [{ name: 'Samsung Health, watch', count }] : [] })
  const base: Diagnostics = {
    madeAt: NOW, platform: 'android', storeName: 'Health Connect', store: { available: true },
    switches: { steps: true, heart: true, workouts: true, sleep: false, strap: 'paired' },
    stepsTotal: { state: 'ok', value: true },
    records: { steps: ok(sum(1440, 60, 60, 2)), distance: { state: 'failed', why: 'SecurityException: no READ_DISTANCE' }, calories: ok(sum(0, null, null, null)), heartRate: ok(sum(2880, 0, 30, 0)), restingHeartRate: ok(sum(0, null, null, null)) },
    workouts: { state: 'ok', value: { count: 3, kinds: [{ name: 'running', count: 2 }, { name: 'strengthTraining', count: 1 }], sources: [{ name: 'Samsung Health', count: 3 }],
      latest: { type: 'running', start: new Date(NOW.getTime() - 132 * MIN).toISOString(), minutes: 42, source: 'Samsung Health', ownDistance: true, ownCalories: false, inside: { heartRate: 2520, distance: 42, steps: null } } } },
    sleep: { state: 'off' },
  }
  {
    const t = diagnosticsText(base)
    const lines = t.split('\n')
    check('it opens by saying what it is and is not', lines[0] === 'WATCH REPORT (counts and times only, no readings)', lines[0])
    check('then when, which phone, and whether the health store is there', lines[1] === 'Made Wed 16 Sep 14:05 · Android · Health Connect available', lines[1])
    check('then every switch as it stands', lines[2] === 'Switches: steps on, heart rate on, workouts on, sleep off, strap paired', lines[2])
    check('steps: the total came back, then the records, their length, gap and age, and who wrote them', t.includes("STEPS, last 24 hours\n today's total: came back\n records: 1,440 · each about 1 min long · about 1 min apart · newest 2 min ago\n from: Samsung Health, watch 1,440"), t)
    check('a read that failed says so, in the phone\'s own words', t.includes('DISTANCE, last 24 hours\n could not be read: SecurityException: no READ_DISTANCE'))
    check('a kind with nothing says 0, with no made-up times', t.includes('CALORIES BURNED, last 24 hours\n records: 0\n'))
    check('heart rate is "readings", with no length (an instant), 30 s apart, newest just now', t.includes('HEART RATE, last 24 hours\n readings: 2,880 · about 30 s apart · newest just now'))
    check('workouts: how many, which kinds in the store\'s own words, and from what', t.includes('WORKOUTS, last 14 days\n found: 3\n kinds: running 2, strengthTraining 1\n from: Samsung Health 3'))
    check('the latest workout: what, when, how long, and what it carried of its own', t.includes(' latest: running · Wed 16 Sep 11:53 · 42 min\n  its own distance: yes · its own calories: no'))
    check('...and how finely it is shared: heart 60 a minute, distance 1.0 a minute', t.includes('  heart readings inside it: 2,520 (60 a minute)') && t.includes('  distance records inside it: 42 (1.0 a minute)'))
    check('...and a kind that could not be read inside it says so', t.includes('  step records inside it: could not be read'))
    check('a switch that is off: not read, and said', t.includes('SLEEP, last 16 nights\n not read: its switch is off'))
    const slept = diagnosticsText({ ...base, sleep: { state: 'ok', value: { sessions: 14, withStages: 12, stageNames: ['awake', 'deep', 'light', 'rem'], newestEnd: new Date(2026, 8, 16, 6, 48).toISOString(), nights: 13 } } })
    check('sleep: sessions, how many have stages and which, the nights the app counts, when the newest ended', slept.includes('SLEEP, last 16 nights\n sessions: 14 · with stages: 12 (awake, deep, light, rem)\n nights the app counts: 13 · newest ended Wed 16 Sep 06:48'), slept.split('\n').slice(-3))
    const gone = diagnosticsText({ ...base, platform: 'ios', storeName: 'Apple Health', store: { available: false, reason: 'not installed' }, switches: { ...base.switches, strap: 'none' }, stepsTotal: { state: 'ok', value: false } })
    check('a missing health store, an iPhone, no strap and an empty total are each said', gone.includes('iPhone · Apple Health NOT available (not installed)') && gone.includes('strap not paired') && gone.includes("today's total: came back as nothing"), gone.split('\n').slice(1, 6))
    const offSteps = diagnosticsText({ ...base, stepsTotal: { state: 'off' }, records: { ...base.records, steps: { state: 'off' } } })
    check('steps off: one line, and no line about a total that was never asked for', offSteps.includes('STEPS, last 24 hours\n not read: its switch is off\n') && !/today's total/.test(offSteps))
    check('no line is blank at the end, and nothing leaks (undefined, NaN, null, [object)', !/undefined|NaN|null|\[object/.test(t + slept + gone) && !t.endsWith('\n'))
  }

  console.log('\n3. Gathering: only what his switches allow')
  {
    use(null, [])
    check('in a browser there is nothing to report on', (await gatherDiagnostics(NOW)) === null)

    use(phone(), [])
    const off = (await gatherDiagnostics(NOW))!
    check('every switch off: nothing is read from the phone at all', asked.length === 0, asked)
    check('...and every part says its switch is off', off.stepsTotal.state === 'off' && Object.values(off.records).every(r => r.state === 'off') && off.workouts.state === 'off' && off.sleep.state === 'off', off)

    use(phone(), ['heart'])
    const heartOnly = (await gatherDiagnostics(NOW))!
    check('heart rate alone: heart and resting heart rate are read, nothing else', JSON.stringify([...asked].sort()) === JSON.stringify(['records:heartRate', 'records:restingHeartRate']), asked)
    check('...steps, distance, calories, workouts and sleep stay off', heartOnly.records.steps.state === 'off' && heartOnly.records.distance.state === 'off' && heartOnly.records.calories.state === 'off' && heartOnly.workouts.state === 'off' && heartOnly.sleep.state === 'off')
    check('...and resting heart rate is counted over 14 days (one a day)', heartOnly.records.restingHeartRate.state === 'ok' && heartOnly.records.restingHeartRate.value.count === 14, heartOnly.records.restingHeartRate)

    use(phone({ workouts: 'none' }), ['workouts'])
    const workoutsOnly = (await gatherDiagnostics(NOW))!
    check('workouts alone: heart readings ARE read (that switch asked for them), resting heart rate is not', asked.includes('records:heartRate') && !asked.includes('records:restingHeartRate') && workoutsOnly.records.heartRate.state === 'ok' && workoutsOnly.records.restingHeartRate.state === 'off', asked)

    use(phone(), ['sleep'])
    const sleepOnly = (await gatherDiagnostics(NOW))!
    check('sleep alone: only sleep is read', JSON.stringify(asked) === JSON.stringify(['sleep']), asked)
    check('...3 sessions, 2 with stages, the stage names, and the nights the app\'s own rule counts', sleepOnly.sleep.state === 'ok' && sleepOnly.sleep.value.sessions === 3 && sleepOnly.sleep.value.withStages === 2 && sleepOnly.sleep.value.stageNames.join() === 'awake,light' && sleepOnly.sleep.value.nights === 3, sleepOnly.sleep)

    use(phone(), ['steps', 'heart', 'workouts', 'sleep'])
    const all = (await gatherDiagnostics(NOW))!
    check('everything on: NO permission sheet is ever asked for by making a report', !asked.some(a => a.startsWith('REQUEST')), asked)
    check('...and no reading-carrying read is used except the step total\'s yes or no', !asked.includes('heartSamples') && !asked.includes('distanceTotal') && !asked.includes('kcalTotal'), asked)
    const w = all.workouts.state === 'ok' ? all.workouts.value : null
    check('workouts: three found, counted by kind and by app', w?.count === 3 && JSON.stringify(w.kinds) === JSON.stringify([{ name: 'running', count: 1 }, { name: 'strengthTraining', count: 1 }, { name: 'walking', count: 1 }]) && w.sources[0].count === 3, w)
    check('the latest is the newest one long enough to say anything (the 42 min run, not the 3 min blip after it)', w?.latest?.type === 'running' && w.latest.minutes === 42, w?.latest)
    check('...with heart readings every 30 s inside it (84), and distance and steps a minute (42 each)', w?.latest?.inside.heartRate === 84 && w.latest.inside.distance === 42 && w.latest.inside.steps === 42, w?.latest?.inside)
    check('...and what it carried of its own', w?.latest?.ownDistance === true && w.latest.ownCalories === true)
    check('the 24 hours hold a record a minute (1,440) and a heart reading every 30 s (2,880)', all.records.steps.state === 'ok' && all.records.steps.value.count === 1440 && all.records.heartRate.state === 'ok' && all.records.heartRate.value.count === 2880, [all.records.steps, all.records.heartRate])

    use(phone({ distance: 'throws' }), ['steps', 'workouts'])
    // Null-safe: a refused read that stopped the whole report must FAIL these, not end the run.
    const denied = await gatherDiagnostics(NOW).catch(() => null)
    const dd = denied?.records.distance
    check('a read the phone refuses is said in its own words, on one line', dd?.state === 'failed' && dd.why === 'SecurityException: no READ_DISTANCE permission', dd ?? 'the report was not made')
    check('...the rest of the report is still made', denied?.records.steps.state === 'ok' && denied.workouts.state === 'ok')
    const dw = denied?.workouts.state === 'ok' ? denied.workouts.value.latest : null
    check('...and inside the workout that kind reads "could not be read", the others still counted', dw?.inside.distance === null && dw.inside.steps === 42, dw)

    use(phone({ distance: 'none' }), ['steps', 'workouts'])
    const totals = (await gatherDiagnostics(NOW))!
    check('a watch that shares a workout\'s distance as a total only: 0 distance records inside it, its own distance yes', totals.workouts.state === 'ok' && totals.workouts.value.latest?.inside.distance === 0 && totals.workouts.value.latest.ownDistance === true, totals.workouts.state === 'ok' ? totals.workouts.value.latest : null)
    check('...and the words say so: "distance records inside it: 0 (0.0 a minute)"', diagnosticsText(totals).includes('  distance records inside it: 0 (0.0 a minute)'))

    use(phone({ workouts: 'none' }), ['workouts'])
    const noWorkouts = (await gatherDiagnostics(NOW))!
    check('no workouts: found 0, and no "latest" block', noWorkouts.workouts.state === 'ok' && noWorkouts.workouts.value.count === 0 && noWorkouts.workouts.value.latest === null && !/latest:/.test(diagnosticsText(noWorkouts)))

    use(phone({ noRecords: true }), ['steps', 'heart'])
    const old = (await gatherDiagnostics(NOW))!
    check('a phone app that cannot list records says so, and still answers the step total', old.records.steps.state === 'failed' && /cannot read it/.test(old.records.steps.why) && old.stepsTotal.state === 'ok', old.records.steps)
  }

  console.log('\n4. Counts and times only')
  {
    use(phone(), ['steps', 'heart', 'workouts', 'sleep'])
    const text = diagnosticsText((await gatherDiagnostics(NOW))!)
    const leaked = Object.entries(LEAK).filter(([, v]) => text.includes(String(v)) || text.includes(v.toLocaleString('en-GB')))
    check('no step count, heart rate, distance or calorie figure the phone holds is anywhere in the report', leaked.length === 0, leaked)
    check('the proof binds: the phone really does hold those figures (the step total is asked and is 76,543)', asked.includes('stepsTotal') && (await phone().stepsBetween(NOW, NOW)) === LEAK.steps)
    const types = strip(read('src/lib/health-steps.ts'))
    const shape = types.match(/export interface HealthRecord \{([^}]*)\}/)?.[1] ?? ''
    check('a record carries when and from what, and has no field for a reading', /start: string/.test(shape) && /source:/.test(shape) && !/value|bpm|count|steps|kcal|metres|meters/i.test(shape), shape)
    const reader = types.slice(types.indexOf('recordsBetween: async'), types.indexOf('requestSleepAccess: async'))
    check('...and the real reader hands back no value (the reading never leaves the phone\'s own call)', reader.length > 50 && !/\.value/.test(reader), reader.length)
  }

  console.log('\n5. Source properties')
  {
    const lib = strip(read('src/lib/health-diagnostics.ts'))
    check('making a report never asks the phone for a permission', !/request[A-Z][A-Za-z]*Access\(/.test(lib))
    check('...saves nothing and sends nothing (no database, no storage write, no network)', !/supabase|setItem|fetch\(|sendBeacon/.test(lib))
    const profile = strip(read('src/components/HealthStepsSection.tsx'))
    const section = profile.slice(profile.indexOf('export function HealthReportSection'))
    check('Profile promises exactly that: no readings in it, nothing saved or sent', /No step counts, heart rates or sleep times are in it\. Nothing is saved or sent\./.test(section))
    check('the report is made only on his tap (no read on mount)', !/useEffect/.test(section) && /onClick=\{\(\) => void make\(\)\}/.test(section))
    check('a phone that refuses the copy is told what to do instead, and the text stays on screen and selectable', /Press and hold the text to select it, or take a screenshot\./.test(section) && /<pre[^>]*select-text[^>]*data-watch-report/.test(section))
    const screen = strip(read('src/components/ProfileScreen.tsx'))
    check('it sits in the phone health sheet, which is drawn only in the phone app', /healthPlatform && <Suspense[^\n]*<HealthReportSection \/>/.test(screen))
    const privacy = read('public/privacy.html')
    check('the privacy page says what the report reads, that it holds no readings, and that it is not saved or sent', /Check what your watch shares<\/strong>/.test(privacy) && /holds no readings, and is not saved or sent by the app/.test(privacy))
  }

  console.log(`\n${ran} checks ran, ${failures} failed`)
  process.exit(failures > 0 ? 1 : 0)
}
void main()
