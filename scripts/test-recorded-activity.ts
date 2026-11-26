// test:recorded-activity — RECORD A WALK OR RUN (his request 25 Nov 2026; his ruling "A, build it").
// src/lib/activity-figures.ts, src/lib/activity-recording.ts, docs/plans/recorded-activity.md.
// 1. the figures: the device's calories win, a strap alone gives an estimate marked as one, a zero is "nothing";
// 2. the estimate: the published equation with the resting share taken off, and no estimate where it is not valid;
// 3. Start, End, Keep going, Throw away, kept on the phone;
// 4. End reads the phone for exactly the window, and logging writes the figures, End's instant, and clears;
// 5. a watch that syncs late fills only what is missing, a device figure replaces an estimate, every read names him;
// 6. calories burned never reach the food target.
import { readFileSync } from 'fs'

const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
}
Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true }) // the queue keeps the log on the phone; no network here

import { setSupabaseClient } from '../src/lib/supabase'
import { cardioKindsFor, customCardioName, tracksSteps } from '../src/lib/cardio-kinds'
import { activityFiguresLine, clockText, estimateActiveKcal, recordingFigures } from '../src/lib/activity-figures'
import {
  currentRecording, discardRecording, endRecording, fillRecordedFromHealth, gatherFigures, lateFill, logRecording,
  looksForgotten, resumeRecording, startRecording,
} from '../src/lib/activity-recording'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

async function main() {
  const body = { weightKg: 80, age: 35, gender: 'male' as const }
  const start = new Date('2026-11-25T08:00:00Z'), end = new Date('2026-11-25T08:48:00Z')

  console.log('\n1. The figures')
  const dev = recordingFigures({ start, end, steps: 5012.4, distanceM: 3840, deviceKcal: 300.2, heart: { avg: 112, max: 131 } }, body)
  check('his example: 48 min, 5,012 steps, 3.84 km, 300 kcal from the watch, not an estimate', dev.minutes === 48 && dev.steps === 5012 && dev.distanceKm === 3.84 && dev.kcal === 300 && !dev.kcalEstimated, dev)
  check('...and its heart rate', dev.avgHeartRate === 112 && dev.maxHeartRate === 131)
  const strapOnly = recordingFigures({ start, end, steps: null, distanceM: null, deviceKcal: null, heart: { avg: 130, max: 150 } }, body)
  check('a strap and no watch: calories are the estimate, marked as one', strapOnly.kcal != null && strapOnly.kcal > 0 && strapOnly.kcalEstimated, strapOnly)
  const devAndStrap = recordingFigures({ start, end, deviceKcal: 300, heart: { avg: 130, max: 150 } }, body)
  check('a watch AND a strap: the watch\'s figure wins over the estimate', devAndStrap.kcal === 300 && !devAndStrap.kcalEstimated)
  const zero = recordingFigures({ start, end, steps: 0, distanceM: 0, deviceKcal: 0, heart: null }, body)
  check('a zero from the phone is "nothing recorded", never a claim of no steps or no calories', zero.steps === null && zero.distanceKm === null && zero.kcal === null, zero)
  check('an impossible count is refused', recordingFigures({ start, end, steps: 900_000, deviceKcal: 50_000 }, body).steps === null && recordingFigures({ start, end, deviceKcal: 50_000 }, body).kcal === null)
  check('a recording under a minute still logs one minute', recordingFigures({ start, end: new Date(start.getTime() + 20000) }, body).minutes === 1)
  check('the line under the log: "5,012 steps · 300 kcal"', activityFiguresLine({ steps: 5012, active_kcal: 300, kcal_estimated: false }) === '5,012 steps · 300 kcal')
  check('an estimate reads as one: "≈ 280 kcal (estimate)"', activityFiguresLine({ active_kcal: 280, kcal_estimated: true }) === '≈ 280 kcal (estimate)')
  check('a log with neither has no line', activityFiguresLine({}) === null && activityFiguresLine({ steps: 0, active_kcal: null }) === null)
  check('the clock: 12:04 and 1:02:09', clockText(724000) === '12:04' && clockText(3729000) === '1:02:09')

  console.log('\n2. The estimate (Keytel 2005, resting share off)')
  // Male, 80 kg, 35, HR 130, 30 min: (-55.0969 + 82.017 + 15.904 + 7.0595) / 4.184 = 11.924 kcal/min; minus 80/60.
  const k = estimateActiveKcal({ avg: 130, max: 150 }, 30, body)
  check('the published equation, by hand: 318 kcal', k === Math.round((11.92412 - 80 / 60) * 30), k)
  const f = estimateActiveKcal({ avg: 130, max: 150 }, 30, { ...body, gender: 'female' })
  const u = estimateActiveKcal({ avg: 130, max: 150 }, 30, { weightKg: 80, age: 35 })
  check('the female equation differs, and no sex on the profile averages the two', f != null && f !== k && u != null && Math.abs(u - (k! + f) / 2) <= 1, { k, f, u })
  check('under 90 average, no estimate (the equation is for a working heart)', estimateActiveKcal({ avg: 85, max: 100 }, 30, body) === null)
  check('no weight or no age, no estimate (nothing invented)', estimateActiveKcal({ avg: 130, max: 150 }, 30, { age: 35 }) === null && estimateActiveKcal({ avg: 130, max: 150 }, 30, { weightKg: 80 }) === null)
  check('a harder heart burns more', (estimateActiveKcal({ avg: 160, max: 175 }, 30, body) ?? 0) > (k ?? 0))

  console.log('\n3. Start, End, Keep going, Throw away')
  const t0 = new Date('2026-11-25T08:00:00Z')
  const r = await startRecording('Run', t0)
  check('Start keeps the recording on the phone', currentRecording()?.activity === 'Run' && currentRecording()?.startedAt === t0.toISOString() && !!store.get('fitplan_activity_recording'))
  const again = await startRecording('Walk', new Date('2026-11-25T08:05:00Z'))
  check('a second Start never restarts a running recording', again.startedAt === r.startedAt && again.activity === 'Run')
  endRecording(new Date('2026-11-25T08:30:00Z'))
  check('End fixes the window', currentRecording()?.endedAt === '2026-11-25T08:30:00.000Z')
  resumeRecording()
  check('Keep going takes End back, from the same start', currentRecording()?.endedAt === undefined && currentRecording()?.startedAt === t0.toISOString())
  check('six hours is "forgotten", half an hour is not', looksForgotten({ activity: 'Walk', startedAt: t0.toISOString(), endedAt: '2026-11-25T15:00:00Z' }) && !looksForgotten({ activity: 'Walk', startedAt: t0.toISOString(), endedAt: '2026-11-25T08:30:00Z' }))
  discardRecording()
  check('Throw away leaves nothing', currentRecording() === null && !store.get('fitplan_activity_recording'))

  console.log('\n4. End reads the phone for the window; logging writes it down')
  const windows: string[] = []
  const phone = {
    platform: 'android' as const,
    isAvailable: async () => ({ available: true }),
    requestStepsAccess: async () => true,
    requestActivityAccess: async () => true,
    stepsBetween: async (s: Date, e: Date) => { windows.push(`steps ${s.toISOString()} ${e.toISOString()}`); return 5012 },
    distanceMetersBetween: async () => 3840,
    activeKcalBetween: async () => { throw new Error('calories not allowed') },
    heartRateSamples: async (s: Date) => Array.from({ length: 20 }, (_, i) => ({ bpm: 120 + i, at: new Date(s.getTime() + i * 60000).toISOString() })),
  }
  ;(globalThis as { __healthAdapterForTest?: unknown }).__healthAdapterForTest = phone
  await startRecording('Walk', new Date('2026-11-25T08:00:00Z'))
  check('the first Start asks the phone once', store.get('fitplan_activity_access_asked') === '1')
  const ended = endRecording(new Date('2026-11-25T08:48:00Z'))!
  const g = await gatherFigures(ended, body)
  check('the phone is read for exactly Start to End', windows[0] === 'steps 2026-11-25T08:00:00.000Z 2026-11-25T08:48:00.000Z', windows)
  check('a refused calories read still leaves the steps and distance', g.steps === 5012 && g.distanceKm === 3.84 && g.phoneRead, g)
  check('...and with a heart rate, the calories become the estimate', g.kcal != null && g.kcalEstimated && g.avgHeartRate != null, g)
  const realSteps = phone.stepsBetween
  phone.stepsBetween = async () => { throw new Error('steps not allowed') }
  const g2 = await gatherFigures(ended, body)
  phone.stepsBetween = realSteps
  check('a refused steps read still leaves the distance', g2.steps === null && g2.distanceKm === 3.84, g2)
  const view = logRecording({ profileId: 'p1', date: '2026-11-25', recording: ended, figures: g, effort: 'steady' })
  const queued = JSON.parse(store.get('fitplan_cardio_pending_v1') ?? '[]').at(-1) ?? {}
  check('it logs as a Walk, 48 min, the effort he tapped', view?.activity_name === 'Walk' && view?.duration_minutes === 48 && view?.intensity_rpe === 5, view)
  check('the log ends at End, not at the effort tap', queued.completedAt === '2026-11-25T08:48:00.000Z' && queued.startedAt === '2026-11-25T08:00:00.000Z', queued)
  check('the figures go with it: steps, distance, calories marked estimated, heart rate', view?.steps === 5012 && view?.distance_km === 3.84 && view?.active_kcal === g.kcal && view?.kcal_estimated === true && view?.max_heart_rate === g.maxHeartRate, view)
  check('logging clears the recording', currentRecording() === null)

  console.log('\n5. A watch that syncs late')
  check('missing steps and distance are filled', JSON.stringify(lateFill({ activity_name: 'Walk', steps: null, distance_km: null, active_kcal: 300 }, recordingFigures({ start, end, steps: 5000, distanceM: 3800, deviceKcal: 310 }, {}))) === JSON.stringify({ steps: 5000, distance_km: 3.8 }))
  check('a device figure replaces an estimate', JSON.stringify(lateFill({ steps: 5000, distance_km: 3.8, active_kcal: 280, kcal_estimated: true }, recordingFigures({ start, end, deviceKcal: 310 }, {}))) === JSON.stringify({ active_kcal: 310, kcal_estimated: false }))
  check('a device figure already there is never overwritten, nor are steps', lateFill({ steps: 5000, distance_km: 3.8, active_kcal: 300, kcal_estimated: false }, recordingFigures({ start, end, steps: 6000, distanceM: 4000, deviceKcal: 410 }, {})) === null)
  const asked: string[] = []
  const updates: { patch: Record<string, unknown>; filters: string[] }[] = []
  const rows = [
    { id: 'rec', user_id: 'p1', date: '2026-11-25', activity_name: 'Walk', started_at: '2026-11-25T08:00:00Z', completed_at: '2026-11-25T08:48:00Z', steps: null, distance_km: null, active_kcal: 280, kcal_estimated: true },
    { id: 'typed', user_id: 'p1', date: '2026-11-25', started_at: null, completed_at: '2026-11-25T12:00:00Z', steps: null },
  ]
  const query = () => {
    const filters: string[] = []
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push(`${c}=${v}`); return q },
      in: (c: string, v: unknown[]) => { filters.push(`${c} in ${v.join(',')}`); return q },
      then: (res: (x: unknown) => void) => { asked.push(filters.join(' & ')); res({ data: rows, error: null }) },
      update: (patch: Record<string, unknown>) => {
        const uf: string[] = []
        const u = { eq: (c: string, v: unknown) => { uf.push(`${c}=${v}`); return u }, then: (res: (x: unknown) => void) => { updates.push({ patch, filters: uf }); res({ error: null }) } }
        return u
      },
    }
    return q
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: query } as any)
  phone.activeKcalBetween = async () => 305
  const filled = await fillRecordedFromHealth('p1', '2026-11-25')
  const upd = updates[0]
  check('the recorded walk gets its steps, distance and the watch\'s calories', filled === 1 && upd?.patch.steps === 5012 && upd?.patch.distance_km === 3.84 && upd?.patch.active_kcal === 305 && upd?.patch.kcal_estimated === false, updates)
  check('a log typed in (not recorded) is never touched', updates.length === 1)
  check('every read and every write names this person', asked.length > 0 && asked.every(a => a.includes('user_id=p1')) && updates.every(x => x.filters.includes('user_id=p1')), { asked, updates })

  console.log('\n6. Calories burned never reach the food target')
  const food = ['src/lib/macro-calculator.ts', 'src/App.tsx'].map(p => readFileSync(p, 'utf8')).join('\n')
  check('nothing that works out the targets reads a log\'s calories burned', !/active_kcal|activeKcal/.test(food))
  const card = readFileSync('src/components/RecordActivityCard.tsx', 'utf8')
  check('the card never picks an effort for him (EffortBox starts empty)', /<EffortBox effort=\{null\}/.test(card))
  // HIS 26 NOV RULING: with a heart rate the zone logs it; with none, Easy / Steady / Hard ("Keep Easy/Steady/Hard").
  const cardCode = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check('with a heart rate zone, one Log button saves the zone\'s own effort word', /\{zone \? \([\s\S]*?onClick=\{\(\) => log\(ZONES\[zone - 1\]\.effort, zone\)\}[\s\S]*?\) : \([\s\S]*?<EffortBox effort=\{null\}/.test(cardCode))
  check('...the zone is the one the summary charts (same readings, same estimate), and none with a condition ticked', /const zone = samples \? mostlyZone\(zonesFor\(\{ samples, start, end, estimatedMax \}\)\) : null/.test(cardCode) && /const estimatedMax = noHeartBands \? null : estimatedMaxHeartRate\(body\.age\)/.test(cardCode))
  check('...and the effort question waits for the heart readings (never Easy / Steady / Hard for a moment before the zone)', /\{reading \|\| !figures \|\| !samples \? \(/.test(cardCode) && /useState<HeartReading\[\] \| null>\(null\)/.test(cardCode))

  console.log('\n7. Any cardio, started from Exercise; steps and distance only on foot (his words, 27 Nov 2026)')
  {
    const gym = cardioKindsFor('full_gym').map(k => k.label)
    const home = cardioKindsFor('home_gym').map(k => k.label)
    check('the chooser offers what he named: walk, jog, run, hill sprints, assault bike', ['Walk', 'Jog', 'Run', 'Hill sprints', 'Assault bike'].every(k => gym.includes(k)), gym)
    check('machines are offered to a full gym only; what needs nothing is offered to everyone', !home.includes('Assault bike') && !home.includes('Rower') && ['Walk', 'Jog', 'Run', 'Hill sprints'].every(k => home.includes(k)) && cardioKindsFor(null).length === home.length, home)
    check('no two kinds share a name (the name is what the log is called)', new Set(cardioKindsFor('full_gym').map(k => k.activity)).size === cardioKindsFor('full_gym').length)
    check('on foot: walk, jog, run, hill sprints, hike, treadmill', ['Walk', 'Jog', 'Run', 'Hill Sprints', 'Hike', 'Treadmill', 'Brisk Walk', 'Walk-run'].every(tracksSteps))
    check('not on foot: bikes, rower, swim, skipping, elliptical, football', ['Assault Bike', 'Exercise Bike', 'Cycling', 'Rowing Machine', 'Swim', 'Skipping', 'Elliptical', 'Ski Erg', 'Football', '', null].every(a => !tracksSteps(a)))
    check('his own name is tidied and capitalised; nothing that is not a name is taken', customCardioName('  football ') === 'Football' && customCardioName('boxing  class') === 'Boxing class' && customCardioName('') === null && customCardioName(' 12 ') === null && customCardioName('x') === null)
    check('...and held to forty letters', (customCardioName('a'.repeat(80)) ?? '').length === 40)

    // An Assault Bike, on a phone that holds 5,012 steps and 3.84 km for that hour.
    discardRecording()
    await startRecording('Assault Bike', new Date('2026-11-25T09:00:00Z'))
    const bikeEnd = endRecording(new Date('2026-11-25T09:20:00Z'))!
    const before = windows.length
    const gb = await gatherFigures(bikeEnd, body)
    check('a bike takes NO steps and NO distance, though the phone holds both for that time', gb.steps === null && gb.distanceKm === null && gb.phoneRead === true, gb)
    check('...the phone is not even asked for its steps', windows.length === before, windows.slice(before))
    check('...and it still gets its heart rate and its calories', gb.avgHeartRate != null && gb.kcal != null, gb)
    const bikeView = logRecording({ profileId: 'p1', date: '2026-11-25', recording: bikeEnd, figures: gb, effort: 'hard' })
    check('it is logged under the name he picked', bikeView?.activity_name === 'Assault Bike' && bikeView?.steps == null && bikeView?.distance_km == null, bikeView)
    check('a watch that syncs later never hands a ride the day\'s steps or a distance worked out from them', lateFill({ activity_name: 'Assault Bike', steps: null, distance_km: null, active_kcal: 200, kcal_estimated: false }, recordingFigures({ start: new Date('2026-11-25T09:00:00Z'), end: new Date('2026-11-25T09:20:00Z'), steps: 900, distanceM: 600, deviceKcal: 210 }, {})) === null)
    check('...but its calories still replace an estimate', JSON.stringify(lateFill({ activity_name: 'Assault Bike', steps: null, distance_km: null, active_kcal: 180, kcal_estimated: true }, recordingFigures({ start: new Date('2026-11-25T09:00:00Z'), end: new Date('2026-11-25T09:20:00Z'), steps: 900, distanceM: 600, deviceKcal: 210 }, {}))) === JSON.stringify({ active_kcal: 210, kcal_estimated: false }))

    // A recording begun before this change was kept as one of two kinds.
    store.set('fitplan_activity_recording', JSON.stringify({ kind: 'run', startedAt: '2026-11-25T10:00:00.000Z' }))
    check('a recording kept the old way (a "run") is still his Run', currentRecording()?.activity === 'Run', currentRecording())
    store.set('fitplan_activity_recording', JSON.stringify({ activity: '   ', startedAt: '2026-11-25T10:00:00.000Z' }))
    check('...and one with no name at all is not a recording', currentRecording() === null)
    discardRecording()

    const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    const tools = strip(readFileSync('src/components/ToolsTab.tsx', 'utf8'))
    check('Tools no longer holds the recorder', !/RecordActivityCard|activity-recording/.test(tools))
    const day = strip(readFileSync('src/components/exercise/OwnWorkoutDay.tsx', 'utf8'))
    check('the Start chooser on Exercise offers cardio today only, and never over a recording already open', /\{isToday && !recording && \(\s*<div[^>]*data-testid="own-choose-cardio"/.test(day))
    check('...he picks, then presses Start: nothing starts on the pick alone', /onClick=\{\(\) => setCardioPick\(/.test(day) && /data-testid="own-cardio-start" disabled=\{!cardioName\} onClick=\{startCardio\}/.test(day) && (day.match(/startRecording\(/g) ?? []).length === 1)
    const panel = strip(readFileSync('src/components/exercise/TodayPanel.tsx', 'utf8'))
    const row = panel.indexOf('<WeekContextRow'), active = panel.indexOf('<ActiveCardio'), own = panel.indexOf('<OwnWorkoutDay')
    check('the open workout is drawn at the top of Exercise, above the day (End is never under a lifting day\'s exercises)', row > 0 && active > row && own > active, { row, active, own })
    check('...and nothing of it is downloaded until a recording has been open', /if \(!profileId \|\| !\(recording \|\| seen\)\) return null/.test(day) && /lazyWithReload\(\(\) => import\('@\/components\/RecordActivityCard'\)\)/.test(day))
  }

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
  console.log('test:recorded-activity passed: Start and End set the window, the phone fills it, a strap gives a marked estimate.')
}

main().catch(e => { console.error(e); process.exit(1) })
