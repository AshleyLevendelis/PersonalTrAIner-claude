// ---------------------------------------------------------------------------
// Gate for Tools 2a (design handoff tab polish, 31 Oct 2026, her "build, keep
// my rulings"). Calls the card's decisions rather than reading them where it
// can; reads the component only for what is a wiring question.
//
//   1. The plate chips are plate-math's greedy pass, per side of a 20 kg bar,
//      never more than asked, and the stepper is clamped 20-300 in 2.5s.
//   2. The card starts on the next prescribed STRAIGHT-barbell lift, in order.
//   3. The last round is named and timed by the preset table and the sheet.
//   4. The tiles open their own timer directly; Start reruns the last round.
//   5. Every number on the tab is read from a live source, never typed.
//   6. Hooks sit above the full-screen early return (the crash the driver found).
//   7. Plate ink passes 4.5:1 on every plate.
//
// One exit, and every check runs every time.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  eachSidePlates, stepPlateKg, clampPlateKg, nextBarbellLift, lastRoundLine, weekEyebrow, programProgress,
  PLATE_LOOK, PLATE_INK, PLATE_CARD_MIN_KG, PLATE_CARD_MAX_KG, PLATE_CARD_DEFAULT_KG,
} from '../src/lib/tools-card'
import { plateCombinations } from '../src/lib/plate-math'
import { ROUND_PRESETS, describeRoundPreset } from '../src/lib/timer-engine'
import { clock, workingSeconds } from '../src/lib/round-setup'
import { getExerciseEntry, EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { loadingMode } from '../src/lib/load-prescription'
import type { WorkoutDay, MesocycleWeek } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const read = (p: string) => strip(readFileSync(join(ROOT, p), 'utf8'))

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

console.log('\n1. Each side of the bar, and the stepper\n')
{
  // THE REFERENCE, written out here on purpose: the handoff's own rule, so the
  // app's greedy pass is held to it rather than to itself.
  const reference = (kg: number) => {
    let side = Math.floor(((kg - 20) / 2) / 1.25 + 1e-9) * 1.25
    const out: number[] = []
    for (const p of [25, 20, 15, 10, 5, 2.5, 1.25]) while (side >= p - 1e-9) { side -= p; out.push(p) }
    return out
  }
  let mismatch: unknown = null, over: unknown = null, notSame: unknown = null, cases = 0
  for (let kg = 20; kg <= 300 + 1e-9; kg += 1.25) {
    cases++
    const got = eachSidePlates(kg)
    if (JSON.stringify(got) !== JSON.stringify(reference(kg))) mismatch ??= { kg, got, want: reference(kg) }
    if (20 + 2 * sum(got) > kg + 1e-9) over ??= { kg, got }
    // NOT A SECOND COPY OF THE MATHS: the same per-side weight the full calculator finds.
    const full = plateCombinations(kg, 20)[0]?.perSideKg ?? 0
    if (Math.abs(full - sum(got)) > 1e-9) notSame ??= { kg, card: sum(got), calculator: full }
  }
  check(`swept ${cases} weights, 20-300 kg`, cases === 225, cases)
  check('the chips are the greedy pass: 25, 20, 15, 10, 5, 2.5, 1.25, heaviest first', mismatch === null, mismatch)
  check('...never loading more than asked', over === null, over)
  check('...and the same per-side weight the full calculator finds', notSame === null, notSame)
  check('72.5 kg is a 25 and a 1.25 each side (the handoff\'s own example)', JSON.stringify(eachSidePlates(72.5)) === '[25,1.25]', eachSidePlates(72.5))
  check('an empty bar is bar only', eachSidePlates(20).length === 0)

  check('+ is 2.5 kg', stepPlateKg(72.5, 1) === 75 && stepPlateKg(72.5, -1) === 70, [stepPlateKg(72.5, 1), stepPlateKg(72.5, -1)])
  check('− stops at the empty bar', stepPlateKg(PLATE_CARD_MIN_KG, -1) === 20 && stepPlateKg(21, -1) === 20, stepPlateKg(21, -1))
  check('+ stops at 300', stepPlateKg(PLATE_CARD_MAX_KG, 1) === 300 && stepPlateKg(299, 1) === 300, stepPlateKg(299, 1))
  let kg = 300
  for (let i = 0; i < 112; i++) kg = stepPlateKg(kg, -1)
  check('112 taps down from 300 land on exactly 20, with no float drift', kg === 20, kg)
  check('a prescribed weight outside the range is held inside it', clampPlateKg(500) === 300 && clampPlateKg(10) === 20 && clampPlateKg(NaN) === PLATE_CARD_DEFAULT_KG,
    [clampPlateKg(500), clampPlateKg(10), clampPlateKg(NaN)])
}

console.log('\n2. Which lift the card starts on\n')
{
  const squat = 'Barbell Squats'
  const tbar = 'T-Bar Rows'
  const dbName = EXERCISE_DATABASE.find(e => loadingMode(e) === 'dumbbell')?.name ?? ''
  const benchName = EXERCISE_DATABASE.find(e => e.name !== squat && loadingMode(e) === 'barbell' && e.equipment.includes('barbell')
    && !e.equipment.some(q => ['trap bar', 't-bar', 'landmine', 'smith machine'].includes(q)))?.name ?? ''
  check('the fixture names are real lifts (sanity check on this section)',
    getExerciseEntry(squat)?.equipment.includes('barbell') === true && !!getExerciseEntry(tbar) && !!dbName && !!benchName, { dbName, benchName })
  const ex = (name: string, kg: number | null, tier?: string) => ({ name, sets: 3, reps: '5', rest: '120s', substitution: '', suggested_load_kg: kg, tier } as WorkoutDay['exercises'][number])
  const day = (exercises: WorkoutDay['exercises']): WorkoutDay => ({ day: 'Monday', focus: 'x', exercises } as WorkoutDay)
  const today = '2026-10-28'
  const week = [
    { date: '2026-10-26', state: 'done', session: day([ex(benchName, 90)]) },
    { date: '2026-10-27', state: 'missed', session: day([ex(benchName, 85)]) },
    { date: today, state: 'due', session: day([ex(squat, 30, 'tier_0_primer'), ex(dbName, 22), ex(tbar, 32.5), ex(squat, 72.5), ex(benchName, 60)]) },
    { date: '2026-10-30', state: 'due', session: day([ex(benchName, 62.5)]) },
  ]
  const got = nextBarbellLift(week, today)
  check('today\'s first straight-barbell lift wins, past the primer, the dumbbell and the T-bar', got?.name === squat && got?.kg === 72.5, got)
  const doneToday = week.map(d => d.date === today ? { ...d, state: 'done' } : d)
  check('...a session already done passes to the next one this week', nextBarbellLift(doneToday, today)?.kg === 62.5, nextBarbellLift(doneToday, today))
  const movedToday = week.map(d => d.date === today ? { ...d, movedTo: { date: '2026-10-31' } } : d)
  check('...and so does one moved away', nextBarbellLift(movedToday, today)?.kg === 62.5, nextBarbellLift(movedToday, today))
  check('...an unfinished day today still counts', nextBarbellLift(week.map(d => d.date === today ? { ...d, state: 'partial' } : d), today)?.kg === 72.5)
  check('past days never count, done or missed', nextBarbellLift(week.slice(0, 2), today) === null)
  check('after this week, next week\'s plan', nextBarbellLift(week.slice(0, 2), today, [day([ex(dbName, 20)]), day([ex(benchName, 70)])])?.kg === 70)
  check('a lift lighter than the bar is not a plate question', nextBarbellLift([{ date: today, state: 'due', session: day([ex(benchName, 15)]) }], today) === null)
  check('nothing ahead: no lift is named', nextBarbellLift([], today, []) === null)
}

console.log('\n3. The last round is named and timed by the presets and the sheet\n')
{
  let wrong: unknown = null
  for (const p of ROUND_PRESETS) {
    const line = lastRoundLine(p.config)
    if (line.name !== p.label || line.numbers !== describeRoundPreset(p) || line.total !== clock(workingSeconds(p.config))) wrong ??= { preset: p.key, line }
  }
  check(`every preset (${ROUND_PRESETS.length}) is named by its own label, numbers and length`, ROUND_PRESETS.length >= 6 && wrong === null, wrong)
  const custom = lastRoundLine({ rounds: 5, workSeconds: 45, restSeconds: 15 })
  check('...and anything else is honestly Custom', custom.name === 'Custom' && custom.numbers === '5 × 45s / 15s' && custom.total === '4:45', custom)
  check('Tabata is 3:50 of work and rest, the sheet\'s own figure (not the mock\'s 4:00)', lastRoundLine(ROUND_PRESETS[0].config).total === '3:50', lastRoundLine(ROUND_PRESETS[0].config))
}

console.log('\n4. The header and the program bar come off the plan\n')
{
  const meso = Array.from({ length: 16 }, (_, i) => ({ week_number: i + 1, label: '', days: [], block_number: Math.floor(i / 4) + 1 } as MesocycleWeek))
  check('"Week 6 of 16 · B2"', weekEyebrow(meso, 6) === 'Week 6 of 16 · B2', weekEyebrow(meso, 6))
  check('...a 12-week plan says 12', weekEyebrow(meso.slice(0, 12), 1) === 'Week 1 of 12 · B1', weekEyebrow(meso.slice(0, 12), 1))
  check('...and no plan, no line', weekEyebrow([], 1) === null && weekEyebrow(undefined, 1) === null)
  check('the bar is weeks begun over weeks planned', programProgress(meso, 4) === 0.25 && programProgress(meso, 16) === 1 && programProgress(undefined, 3) === null, [programProgress(meso, 4), programProgress(meso, 16)])
}

console.log('\n5. The tab is wired to them, and to its live sources\n')
{
  const tools = read('src/components/ToolsTab.tsx')
  const card = read('src/components/PlateCard.tsx')
  const lib = read('src/lib/tools-card.ts')
  // TILES OPEN THEIR OWN TIMER.
  check('each tile is one of the three modes and opens that one',
    /TIMER_CHOICES\.map\(choice => \([\s\S]{0,200}data-timer-choice=\{choice\.mode\}[\s\S]{0,60}onClick=\{\(\) => openTimer\(choice\.mode\)\}/.test(tools))
  const openTimer = tools.slice(tools.indexOf('const openTimer ='), tools.indexOf('const openTimer =') + 300)
  check('...which shows that timer and opens the sheet, with no chooser state in between',
    /setTimerPick\(mode\)/.test(openTimer) && /setTimersOpen\(true\)/.test(openTimer) && !/setTimerPick\(null\)/.test(tools) && !/timer-choices/.test(tools), openTimer.slice(0, 200))
  // THE LAST ROUND.
  check('the last round is the one she chose or ran, shown only when there is one',
    /const lastRound = timers\.selectedRoundConfig/.test(tools) && /\{lastRound && lastLine && \(/.test(tools) && /lastRoundLine\(lastRound\)/.test(tools))
  check('...named through the presets, with no protocol typed on the tab',
    !/Tabata(?!, EMOM, intervals)|'EMOM'|'40\/20'|'30\/30'|Boxing/.test(tools), tools.match(/.{0,30}(Tabata|EMOM|Boxing).{0,30}/g))
  check('...and Start reruns exactly it, with the countdown its label states',
    /timers\.startRound\(\{ \.\.\.lastRound, leadInSeconds: prefs\.countdownSeconds \}\)/.test(tools) && /\{startLabel\(prefs\.countdownSeconds\)\}/.test(tools))
  // LIVE SOURCES, NEVER THE MOCK'S NUMBERS.
  check('sessions and PRs come from the history and the records beaten',
    /getSessionHistory\(profileId/.test(tools) && /prs: getRecordsBeaten\(profileId\)\.length/.test(tools) && /\{historyCount\.prs\} PR/.test(tools))
  check('the grocery numbers follow the list as it changes',
    /subscribeGroceryStore\(read\)/.test(tools) && /\{groceryCount\.checked\}\/\{groceryCount\.total\}/.test(tools) && /bar\(groceryCount\.checked \/ groceryCount\.total\)/.test(tools))
  check('the program line and bar, and the week line, come off the mesocycle',
    /programSummary\(mesocycle, liveWeek \?\? 1\)/.test(tools) && /programProgress\(mesocycle, liveWeek\)/.test(tools) && /weekEyebrow\(mesocycle, liveWeek\)/.test(tools))
  check('none of the mock\'s numbers are typed in',
    !/16 weeks|block 1 of 4|6\/14|14 items|3 PRs|5 sessions|72\.5|Deadlifts/.test(tools + card), (tools + card).match(/16 weeks|block 1 of 4|6\/14|14 items|3 PRs|5 sessions|72\.5|Deadlifts/g))
  // THE PLATE CARD.
  check('the plate card starts on the next barbell lift, or the default with no name',
    /nextBarbellLift\(\s*week\.days, todayDate/.test(tools) && /liftName=\{nextLift\?\.name \?\? null\}/.test(tools) && /startKg=\{nextLift\?\.kg \?\? PLATE_CARD_DEFAULT_KG\}/.test(tools))
  check('...its chips are eachSidePlates of the weight shown, and the stepper is stepPlateKg',
    /const plates = eachSidePlates\(kg\)/.test(card) && /stepPlateKg\(k, -1\)/.test(card) && /stepPlateKg\(k, 1\)/.test(card))
  check('...and tapping it opens the full calculator on that weight',
    /onClick=\{\(\) => onOpen\(kg\)\}/.test(card) && /<PlateCalculator open=\{plateOpen\} onOpenChange=\{setPlateOpen\} initialWeight=\{plateStartKg\}/.test(tools))
  check('no second copy of the plate list in the card or its lib',
    !/\[\s*25,\s*20,\s*15/.test(card + lib) && /greedyPlatesPerSide\(kg, PLATE_CARD_BAR_KG\)/.test(lib))

  // 6. HOOK ORDER. A hook below `if (roundLive && timers.roundFullScreen) return`
  // runs on one render and not the next, and React throws: the whole tab went
  // to its error screen the moment Full screen was tapped.
  const body = tools.slice(tools.indexOf('export function ToolsTab('))
  const early = body.indexOf('if (roundLive && timers.roundFullScreen)')
  const lateHooks = [...body.slice(early).matchAll(/\buse[A-Z]\w*\(/g)].map(m => m[0])
  check('the full-screen early return was found (sanity check on the next one)', early > 0)
  check('every hook is called above the full-screen early return', early > 0 && lateHooks.length === 0, lateHooks)
}

console.log('\n7. Plate labels are readable\n')
{
  const lum = (hex: string) => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  const plates = Object.keys(PLATE_LOOK).map(Number)
  const low = plates.filter(p => ratio(PLATE_LOOK[p].bg, PLATE_INK) < 4.5).map(p => ({ p, ratio: ratio(PLATE_LOOK[p].bg, PLATE_INK).toFixed(2) }))
  check('all seven plates have a look', plates.length === 7, plates)
  check('the label ink is 4.5:1 or better on every plate', low.length === 0, low)
  check('...and heavier plates are taller', plates.sort((a, b) => b - a).every((p, i, a) => i === 0 || PLATE_LOOK[p].h < PLATE_LOOK[a[i - 1]].h))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} check(s) failed\n`); process.exit(1) }
console.log('Tools 2a: the plates, the lift, the round and the numbers are all the app\'s own.\n')
