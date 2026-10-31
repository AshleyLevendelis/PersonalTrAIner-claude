// ---------------------------------------------------------------------------
// test:exercise-2a — THE EXERCISE TAB, tab polish design 2a (31 Oct 2026; her
// "build, keep my rulings"). What the new layout must keep true, run rather
// than read where it can be:
//
//  1. THE COACH LINE follows the sets with the plan's own numbers — "Set 1
//     done. Hold 72.5 kg for set 2." only where 72.5 is what the next box
//     logs, "probe" only on a calibration week's probe lift, never an invented
//     judgement ("moved well"), and the tab's own line when the sets give
//     nothing to say.
//  2. ONE REST TIMER: the row under a set is a view of useActiveSession's
//     engine (no clock of its own), sits under the set it follows and never
//     after the last, the dock stands aside while it is in view, and
//     unticking the set cancels it.
//  3. THE RAMP FOLDS but its rows are the same loggable rows (saved as
//     warm-ups) and never counted; open while there are rows to do.
//  4. THE PLATE BUTTON sits in the weight box and opens the calculator at the
//     number that row would log.
//  5. EVERY CHANGE IN THE ⋮, on every row; the two ways to add are "Add
//     exercise" and "I also did…", and the 30 Oct "＋ Add" disclosure is gone.
//
// Browser half: verify:exercise-2a.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import { exerciseCoachLine, PROBE_LINE, type CoachLineExercise, type CoachLineSet } from '../src/lib/exercise-coach-line'
import { carriedWeightFor } from '../src/lib/set-row'
import { restBelongsToSet } from '../src/components/exercise/InlineRest'
import { filterLoggableSets, filterWarmupSets } from '../src/lib/session-derive'
import type { ExerciseSetLog } from '../src/lib/types'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`) }
}
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// ---- 1. The coach line ---------------------------------------------------------
console.log('\n1. The coach line: the plan\'s own numbers, by logged set')
const dead: CoachLineExercise = { name: 'Deadlifts', sets: 3, reps: '6', loadKg: 72.5, unit: 'kg' }
const bench: CoachLineExercise = { name: 'Bench Press', sets: 3, reps: '8', loadKg: 60, unit: 'kg' }
const sets = (...kg: number[]): CoachLineSet[] => kg.map((w, i) => ({ set_number: i + 1, weight_kg: w }))
const NOTE = 'Load goes up this week on the main lifts.'
const line = (o: Partial<Parameters<typeof exerciseCoachLine>[0]>) => exerciseCoachLine({
  exercises: [dead, bench], logged: [[], []], probeIndex: null, fallback: NOTE, carry: carriedWeightFor, ...o,
})
const all: string[] = []
const said = (o: Partial<Parameters<typeof exerciseCoachLine>[0]>) => { const r = line(o); if (r) all.push(r.text); return r }

check('nothing logged, not a calibration week: the tab\'s own line', said({})?.text === NOTE, said({}))
check('nothing logged, calibration week, on the probe lift: "Set 1 is a probe. Stop with 3-4 reps in reserve."', said({ probeIndex: 0 })?.text === PROBE_LINE && PROBE_LINE === 'Set 1 is a probe. Stop with 3-4 reps in reserve.', said({ probeIndex: 0 }))
check('...but not when the probe lift is not the one she is on', said({ probeIndex: 1 })?.text === NOTE, said({ probeIndex: 1 }))
check('set 1 in: "Set 1 done. Hold 72.5 kg for set 2."', said({ logged: [sets(72.5), []] })?.text === 'Set 1 done. Hold 72.5 kg for set 2.', said({ logged: [sets(72.5), []] }))
check('...holding what she LIFTED, the number the next box logs, not the plan\'s', said({ logged: [sets(75), []] })?.text === 'Set 1 done. Hold 75 kg for set 2.', said({ logged: [sets(75), []] }))
const db: CoachLineExercise = { name: 'Dumbbell Row', sets: 3, reps: '10', loadKg: 24, unit: 'kg per hand' }
check('...in the plan\'s own unit: "24 kg per hand", never a bare number', said({ exercises: [db], logged: [sets(24)] })?.text === 'Set 1 done. Hold 24 kg per hand for set 2.', said({ exercises: [db], logged: [sets(24)] }))
const stepped: CoachLineExercise = { ...dead, perSetLoadKg: [60, 65, 70] }
check('a plan that steps the load names the next number, without "Hold"', said({ exercises: [stepped], logged: [sets(60)] })?.text === 'Set 1 done. 65 kg for set 2.', said({ exercises: [stepped], logged: [sets(60)] }))
check('one set left: "One set left. Same weight."', said({ logged: [sets(72.5, 72.5), []] })?.text === 'One set left. Same weight.', said({ logged: [sets(72.5, 72.5), []] }))
check('the lift done: "Deadlifts done. Next: Bench Press, 3 × 8 at 60 kg."', said({ logged: [sets(72.5, 72.5, 72.5), []] })?.text === 'Deadlifts done. Next: Bench Press, 3 × 8 at 60 kg.', said({ logged: [sets(72.5, 72.5, 72.5), []] }))
check('every set in: it says so, and nothing more', said({ logged: [sets(72.5, 72.5, 72.5), sets(60, 60, 60)] })?.text === 'Bench Press done. Every working set is logged.', said({ logged: [sets(72.5, 72.5, 72.5), sets(60, 60, 60)] }))
check('the probe lift after set 1: climb by the cue\'s own rule, never "Hold"', said({ probeIndex: 0, logged: [sets(40), []] })?.text === 'Set 1 done. 5 or more reps left? Go up 5-10% for set 2.', said({ probeIndex: 0, logged: [sets(40), []] }))
check('...and at a stated limit, reps rather than weight', /Add reps, not weight, for set 2/.test(said({ probeIndex: 0, probeAtLimit: true, logged: [sets(40), []] })?.text ?? ''))
check('she skipped the first lift and is on the second: the line is about the second', said({ logged: [[], sets(60)], recentIndex: 1 })?.text === 'Set 1 done. Hold 60 kg for set 2.', said({ logged: [[], sets(60)], recentIndex: 1 }))
check('a superset member part-way: the partner is next, so no per-set line', said({ exercises: [{ ...dead, inSuperset: true }, bench], logged: [sets(72.5), []] })?.text === NOTE)
check('a set done at bodyweight names no weight', said({ exercises: [{ ...dead, loadKg: null }], logged: [[{ set_number: 1, weight_kg: 0, is_bodyweight: true }]] })?.text === 'Set 1 done. Set 2 next.')
check('NO JUDGEMENT THE APP CANNOT MAKE: nothing it said "moved well", "felt", "easy for you"', all.length >= 14 && all.every(t => !/moved well|felt|looked|strong|great/i.test(t)), all)
check('"probe" ONLY in a calibration week: every line without a probe lift is probe-free', (() => {
  const outs = [[[], []], [sets(72.5), []], [sets(72.5, 72.5), []], [sets(72.5, 72.5, 72.5), []]].map(logged => line({ logged: logged as CoachLineSet[][], fallback: 'Calibration-free week note.' })?.text ?? '')
  return outs.every(t => !/probe/i.test(t))
})())

{
  const panel = code('src/components/exercise/TodayPanel.tsx')
  check('TodayPanel builds the line through exerciseCoachLine with the set-row carry, the tab\'s line as its fallback', /exerciseCoachLine\(\{/.test(panel) && /carry: carriedWeightFor/.test(panel) && /fallback: todayNudge\?\.text \?\? null/.test(panel))
  check('...the probe lift is the calibration anchor, only in a calibration week and only with a weight to search for', /const anchor = currentMesoWeekObj\?\.isCalibrationWeek \? resolveCalibrationAnchorIndex\(exs\) : null/.test(panel) && /rows\[anchor\]\.suggested_load_kg != null && !!anchorEntry && isExternallyLoaded\(anchorEntry\)/.test(panel))
  check('...the weights are the ROW\'s (progressed or eased), through the same function the list uses', (panel.match(/liveRowExercise\(/g) ?? []).length >= 3)
  check('...and it is drawn as the coach line (TrainerNudge line), a clamped week note opening the rest of its sentence', /<TrainerNudge line text=\{coachLine\.text\}[^>]*clamp=\{!weekNotesOpen\} onOpen=\{weekNotesOpen \? undefined : \(\) => setWeekNotesOpen\(true\)\}/.test(panel))
}

// ---- 2. One rest timer -------------------------------------------------------
console.log('\n2. One rest timer, under the set it follows')
{
  const rest = (label: string | null, next: number | null) => ({ restEndsAt: label ? '2026-10-31T10:02:00Z' : null, restLabel: label, restTargetSetNumber: next })
  check('the rest after set 1 sits under set 1', restBelongsToSet(rest('Deadlifts', 2), 'Deadlifts', 1))
  check('...and not under set 2', !restBelongsToSet(rest('Deadlifts', 2), 'Deadlifts', 2))
  check('...nor under another lift\'s set 1', !restBelongsToSet(rest('Deadlifts', 2), 'Bench Press', 1))
  check('after the LAST set (it leads into nothing) no row is drawn', !restBelongsToSet(rest('Deadlifts', null), 'Deadlifts', 3))
  check('no rest running, no row', !restBelongsToSet(rest(null, null), 'Deadlifts', 1))
  const inline = code('src/components/exercise/InlineRest.tsx')
  check('the row keeps no clock: it reads the engine\'s remaining time and total', /restRemainingMs, restTotalMs, restTargetSetNumber, adjustRest, dismissRest \} = useActiveSession\(\)/.test(inline) && !/setInterval|setTimeout|Date\.now|new Date\(/.test(inline))
  check('...−15, +15 and Skip are the engine\'s own adjust and dismiss', /adjustRest\(-15\)/.test(inline) && /adjustRest\(15\)/.test(inline) && /onClick=\{dismissRest\}/.test(inline))
  check('...at zero it says GO and the set', /over \? 'Go' : 'Rest'/.test(inline) && /over \? `Set \$\{restTargetSetNumber/.test(inline))
  const grid = code('src/components/exercise/SetGrid.tsx')
  check('the grid draws it only where restBelongsToSet says, after the set\'s last row (its drops)', /const restHere = !warm && rowIndex === lastRowOfSet\(setNumber\) && restBelongsToSet\(rest, exerciseName, setNumber\)/.test(grid) && /\{restHere && <InlineRest \/>\}/.test(grid))
  check('unticking (deleting) a working set cancels ITS rest', /deleteSet\(\{[^}]*\}\)\s*if \(!isWarm\(ref\) && !isDrop\(ref\) && restBelongsToSet\(rest, exerciseName, ref\.setNumber\)\) dismissRest\(\)/.test(grid))
  const dock = code('src/components/BottomDock.tsx')
  check('the dock stands aside while the row is in view — one countdown on screen', /useSyncExternalStore\(subscribeInlineRest, inlineRestOnScreen/.test(dock) && /\(hasRest && !inlineRestShown\)/.test(dock))
  check('...and the row reports being in view only while it is (an observer, cleared on unmount)', /new IntersectionObserver/.test(inline) && /setInlineRestVisible\(id, false\)/.test(inline))
}

// ---- 3. The folded ramp ---------------------------------------------------------
console.log('\n3. The ramp folds; its rows are the same rows, never counted')
{
  const grid = code('src/components/exercise/SetGrid.tsx')
  const row = code('src/components/exercise/ExerciseRow.tsx')
  check('one row with "Ramp up", how far, and "not counted", and a toggle', /data-testid="warmup-caption"/.test(grid) && /aria-expanded=\{rampOpen\}/.test(grid) && />Ramp up</.test(grid) && />not counted</.test(grid))
  check('folded rows are left out only while the fold is shut', /if \(warm && !showWarm\) return null/.test(grid) && /const showWarm = !hasFold \|\| rampOpen/.test(grid))
  check('open, they are the same grid rows, saved as WARM-UPS through the one save', /data-testid=\{warm \? 'warmup-row'/.test(grid) && /isWarmup: warm,/.test(grid) && /onClick=\{\(\) => handleSaveSet\(ref\)\}/.test(grid))
  check('open while ANY of the grid\'s build-up rows is still to do (an added one too), folded once done, then her choice', /const rampOpen = rampChoice \?\? rampDone < warmupRowNumbers\.length/.test(grid) && /const rampDone = warmupRowNumbers\.filter\(n => warmupLogs\.some\(l => l\.set_number === n\)\)\.length/.test(grid))
  check('...remembered per exercise for the session (date and lift)', /const rampKey = `\$\{date\}:\$\{exerciseId\}`/.test(row) && /rampFoldChoice\.set\(rampKey, open\)/.test(row) && /rampOpen=\{rampChoice\}/.test(row))
  const log = (n: number, warm: boolean): ExerciseSetLog => ({ user_id: 'u', date: '2026-10-31', exercise_name: 'Deadlifts', exercise_id: 'deadlifts', set_number: n, weight_kg: 60, reps_completed: 5, is_bodyweight: false, is_warmup: warm })
  const logs = [log(1, true), log(2, true), log(3, true), log(1, false)]
  check('NOT COUNTED, run: three ramp rows and a set are one working set and three warm-ups', filterLoggableSets(logs, 'deadlifts', 'Deadlifts').length === 1 && filterWarmupSets(logs, 'deadlifts', 'Deadlifts').length === 3)
  check('the card\'s working count is that same filter', /workingDone/.test(row) && /data-testid="working-counter">Working \{rampProgress\.workingDone\}/.test(row))
}

// ---- 4. The plate button -------------------------------------------------------
console.log('\n4. The plate button sits in the box and opens at the row\'s weight')
{
  const grid = code('src/components/exercise/SetGrid.tsx')
  const at = grid.indexOf('data-testid="row-plate-calc"')
  const box = grid.lastIndexOf('id={`setgrid-weight-', at)
  const wrap = grid.lastIndexOf('<div className="relative min-w-0">', at)
  check('it is drawn inside the weight box\'s own wrapper, after the box', at > 0 && box > 0 && wrap > 0 && wrap < box && box < at && !grid.slice(wrap, at).includes('</div>'), { at, box, wrap })
  check('it opens the calculator at what the row would LOG: typed, else the blank box\'s number', /onClick=\{\(\) => onOpenPlateCalc\(parseFloat\(input\.weight \|\| defaultWeightFor\(ref\)\) \|\| 0\)\}/.test(grid))
  check('...only where a plate calculator means something (not a cable stack)', /const plateButton = !!onOpenPlateCalc && takesPlateCalculator\(catalogEntry\)/.test(grid) && /\{onOpenPlateCalc && plateButton && \(/.test(grid))
  const row = code('src/components/exercise/ExerciseRow.tsx')
  check('the footer\'s "Plate calculator" link is gone from the card', !/>\s*Plate calculator\s*</.test(row) && !/>\s*Plate calculator\s*</.test(grid))
}

// ---- 5. Menus and the two ways to add -------------------------------------------
console.log('\n5. Every change in the ⋮, on every row; "Add exercise" and "I also did…"')
{
  const row = code('src/components/exercise/ExerciseRow.tsx')
  check('a closed row carries the same ⋮ as the open card', /trailing=\{menu\}/.test(row) && /<div className="-mr-1 shrink-0">\{menu\}<\/div>/.test(row))
  const menuAt = row.indexOf('function ExerciseMenu')
  const menu = row.slice(menuAt)
  check('the menu holds swap, move, take out and ban', ['swap-exercise', 'move-up', 'move-down', 'remove-exercise', 'ban-exercise'].every(id => menu.includes(`data-testid="${id}"`)))
  check('...and no change-verb is left loose outside it', !/Swap exercise|Take out of this session|Ban exercise/.test(row.slice(0, menuAt)))
  const panel = code('src/components/exercise/TodayPanel.tsx')
  check('"Add exercise" is one button opening the add sheet', /data-testid="add-exercise"\s*onClick=\{\(\) => setAddOpen\(true\)\}/.test(panel) && />\s*Add exercise\s*</.test(panel.replace(/<Plus[^>]*\/>/g, '')))
  check('"I also did…" sits in "Did something off-plan?" and opens the unplanned log', /Did something off-plan\?\s*<button[\s\S]{0,120}data-testid="add-unplanned"\s*onClick=\{\(\) => setUnplannedWorkOpen\(true\)\}[\s\S]{0,300}I also did…/.test(panel))
  check('the "＋ Add" disclosure is gone', !/data-testid="add-open"/.test(panel) && !/addChoicesOpen/.test(panel))
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
console.log('Exercise 2a keeps its rulings: one rest timer, the ramp loggable and uncounted, the line from the plan.')
