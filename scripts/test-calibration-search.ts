/**
 * Gate: calibration week is a search, not a prescription.
 *
 * Ashley, 10 Sep 2026, after training on it: the weights were too light, the
 * screen prescribed 72.5kg × 3 while the banner said "add until 3-4 reps in
 * reserve", and she expected week 2 to crawl up from a number that was wrong
 * to begin with. docs/plans/calibration-is-a-search.md has the measurement;
 * the short version is that the ENGINE already re-anchored next week's
 * session to her heaviest set, and the INPUT undid it — a tick on an
 * untouched box logged the pre-filled guess, three times, as her working
 * weight.
 *
 * Five things this file holds down:
 *
 *  1. THE ENGINE writes a calibration session's heaviest set into the printed
 *     program for the rest of the block — automatically, once, from
 *     calibration week only (her ruling, 10 Sep) — and writes nothing when
 *     the heaviest set is at or below the guess. Executed on a generated
 *     plan, not read off the source.
 *  2. THE GRID gives sets 2+ no default in a calibration week, refuses a tick
 *     on an empty box, and offers the next weight off the last LOGGED set.
 *  3. THE SCREEN draws the ramp before the number, labels the number "start
 *     here", and hides the three identical per-set chips.
 *  4. THE HOOK from a finished session reaches the planner — after the
 *     "nothing logged" exit, never before it.
 *  5. OUTSIDE a calibration week none of it applies.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { generateMesocycle } from '../src/lib/exercise-plan'
import { calibrationAnchorsFor, planCalibrationAnchors, calibrationAnchorMessage } from '../src/lib/calibration-anchor'
import { getExerciseEntry, getExerciseId } from '../src/lib/exercise-db'
import { isExternallyLoaded, loadingMode, roundToPlate, plateStepKg, DELOAD_LOAD_FRACTION } from '../src/lib/load-prescription'
import type { UserProfile, ExerciseSetLog } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
/** Comments stripped before any order or absence check — a note explaining a rule must not satisfy it. */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let failures = 0
function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

// ---------------------------------------------------------------------------
// A plan to run the engine against: intermediate, full gym, no known lifts,
// so week 1 is a calibration week with a halved estimate on every loaded lift.
// ---------------------------------------------------------------------------
const profile = {
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'build_muscle', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  equipment_access: 'full_gym', injuries: [], training_style: 'bodybuilding',
  training_experience: 'intermediate', session_duration_preference: '60',
  workout_split_preference: 'ai_recommendation',
  training_days: [
    { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
    { day: 'Wednesday', available: false }, { day: 'Thursday', available: true },
    { day: 'Friday', available: true }, { day: 'Saturday', available: false }, { day: 'Sunday', available: false },
  ],
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive',
  recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
} as unknown as UserProfile

const quiet = console.log
console.log = () => {}
const meso = generateMesocycle(profile)
console.log = quiet

const week1 = meso[0]
const day = week1.days[0]
const exIndex = day.exercises.findIndex(e => e.suggested_load_kg != null && isExternallyLoaded(getExerciseEntry(e.name)!))
const ex = day.exercises[exIndex]
const entry = getExerciseEntry(ex.name)!
const mode = loadingMode(entry)
const plannedKg = ex.suggested_load_kg!
const block1 = meso.filter(w => w.block_number === week1.block_number)
const laterLoading = block1.filter(w => (w.week_in_block ?? 1) > 1 && !w.is_deload)
const deloadWeek = block1.find(w => w.is_deload)
const kgIn = (w: typeof week1) => w.days.find(d => d.day === day.day)!.exercises[exIndex].suggested_load_kg

const log = (setNumber: number, kg: number, extra: Partial<ExerciseSetLog> = {}, name = ex.name): ExerciseSetLog => ({
  user_id: 'u', date: '2026-09-07', exercise_name: name, exercise_id: getExerciseId(name),
  set_number: setNumber, weight_kg: kg, reps_completed: 10, is_bodyweight: false, ...extra,
})

// ---------------------------------------------------------------------------
console.log('\n0. The fixture is what the checks below assume')
// ---------------------------------------------------------------------------
check('week 1 is the calibration week', week1.isCalibrationWeek === true)
check('...with a loaded lift carrying a number to probe', exIndex >= 0 && plannedKg > 0, { name: ex.name, plannedKg })
check('...and the block has loading weeks after it and one deload', laterLoading.length >= 2 && !!deloadWeek,
  block1.map(w => ({ n: w.week_number, wib: w.week_in_block, deload: !!w.is_deload })))
check('...whose later weeks the calibration number can be beaten from', laterLoading.every(w => kgIn(w) != null))

// ---------------------------------------------------------------------------
console.log('\n1. The engine: a calibration session\'s heaviest set becomes the block\'s number')
// ---------------------------------------------------------------------------
const heavier = roundToPlate(plannedKg * 1.6, mode)
const anchors = calibrationAnchorsFor(week1, day, [log(1, plannedKg), log(2, heavier), log(3, heavier - 5)])
check('a heaviest set above the guess earns exactly one anchor, for that lift', anchors.length === 1 && anchors[0].exIndex === exIndex, anchors)
check('...at the HEAVIEST set, not the last one', anchors[0]?.liftedKg === heavier, anchors)
check('a session AT the guess earns nothing', calibrationAnchorsFor(week1, day, [log(1, plannedKg), log(2, plannedKg), log(3, plannedKg)]).length === 0)
check('...and one below it earns nothing', calibrationAnchorsFor(week1, day, [log(1, plannedKg - 2.5), log(2, plannedKg - 2.5)]).length === 0)
check('a heavier WARM-UP is not evidence', calibrationAnchorsFor(week1, day, [log(0, heavier, { is_warmup: true }), log(1, plannedKg)]).length === 0)
check('a bodyweight row is not evidence', calibrationAnchorsFor(week1, day, [log(1, heavier, { is_bodyweight: true }), log(2, plannedKg)]).length === 0)
check('a heavier set on a DIFFERENT lift does not anchor this one',
  calibrationAnchorsFor(week1, day, [log(1, heavier, {}, 'Some Other Lift'), log(1, plannedKg)]).every(a => a.exIndex !== exIndex))

const plan = planCalibrationAnchors(meso, profile, week1.week_number, day.day, [log(1, plannedKg), log(2, heavier), log(3, heavier - 5)])
check('planning from the calibration week applies that anchor', plan.applied.length === 1 && plan.applied[0].liftedKg === heavier, plan.applied)
check('...and points at the week after it', plan.nextWeekNumber === week1.week_number + 1, plan.nextWeekNumber)
check('every later loading week of the block now carries the lifted number',
  laterLoading.every(w => kgIn(plan.next.find(n => n.week_number === w.week_number)!) === heavier),
  laterLoading.map(w => ({ n: w.week_number, before: kgIn(w), after: kgIn(plan.next.find(n => n.week_number === w.week_number)!) })))
check('the calibration week itself is untouched — it is the record of what was printed',
  plan.next[0] === meso[0] && kgIn(plan.next[0]) === plannedKg)
const deloadAfter = deloadWeek ? plan.next.find(n => n.week_number === deloadWeek.week_number)! : null
check('the block\'s deload backs off from the NEW number, so it stays a deload',
  !!deloadAfter && kgIn(deloadAfter) === roundToPlate(heavier * DELOAD_LOAD_FRACTION, mode) && kgIn(deloadAfter)! < heavier,
  { before: deloadWeek && kgIn(deloadWeek), after: deloadAfter && kgIn(deloadAfter), expected: roundToPlate(heavier * DELOAD_LOAD_FRACTION, mode) })
check('the NEXT block is untouched', meso.filter(w => w.block_number !== week1.block_number).every(w => plan.next.find(n => n.week_number === w.week_number) === w))
check('other lifts on that day are untouched',
  laterLoading.every(w => {
    const before = w.days.find(d => d.day === day.day)!.exercises
    const after = plan.next.find(n => n.week_number === w.week_number)!.days.find(d => d.day === day.day)!.exercises
    return before.every((e, i) => i === exIndex || after[i] === e)
  }))
check('other days are untouched',
  laterLoading.every(w => {
    const after = plan.next.find(n => n.week_number === w.week_number)!
    return w.days.every((d, i) => d.day === day.day || after.days[i] === d)
  }))
check('the changed weeks are exactly the ones the shell must save',
  plan.changedWeeks.map(w => w.week_number).sort().join() === block1.filter(w => (w.week_in_block ?? 1) > 1).map(w => w.week_number).sort().join(),
  plan.changedWeeks.map(w => w.week_number))
check('the printed row says where the number came from', laterLoading.every(w => {
  const e = plan.next.find(n => n.week_number === w.week_number)!.days.find(d => d.day === day.day)!.exercises[exIndex]
  return e.suggested_load_kg === heavier && typeof e.suggested_load === 'string' && e.suggested_load.includes(String(heavier))
}))

// NEVER DOWNWARD. A later week the block already ramps above the lifted number keeps its own.
const w2 = laterLoading[0]; const w3 = laterLoading[1]
check('the block ramps up before any re-anchor (precondition for the next check)', kgIn(w2)! < kgIn(w3)!, { w2: kgIn(w2), w3: kgIn(w3) })
const modest = planCalibrationAnchors(meso, profile, week1.week_number, day.day, [log(1, plannedKg), log(2, kgIn(w3)!)])
check('a lifted number a later week already meets leaves that week alone',
  modest.next.find(n => n.week_number === w3.week_number) === w3)
check('...while the week below it still rises to meet the lift', kgIn(modest.next.find(n => n.week_number === w2.week_number)!) === kgIn(w3))

const msg = calibrationAnchorMessage(2, plan.applied)
check('the sentence names the lift, the set and the week', msg.includes(ex.name) && msg.includes(`${heavier}kg`) && /Week 2/.test(msg), msg)

// ---------------------------------------------------------------------------
console.log('\n2. The grid: sets 2+ have no default, the tick refuses, the chips climb off the last logged set')
// ---------------------------------------------------------------------------
const grid = strip(read('src/components/exercise/SetGrid.tsx'))
const defaultFn = grid.slice(grid.indexOf('const defaultWeightFor = '), grid.indexOf('const weightPlaceholderFor'))
const calibrationBranch = defaultFn.search(/if \(calibrationProbe && setNumber > 1\) return ''/)
check('in a calibration week, sets after the first have NO default weight', calibrationBranch >= 0)
check('...decided before the prescription is even looked up', calibrationBranch >= 0 && calibrationBranch < defaultFn.indexOf('perSetLoadKg?.[setNumber - 1]'))
check('...and set 1 keeps its pre-fill — the probe is one tap when the guess is right', !/setNumber >= 1\) return ''/.test(defaultFn) && /setNumber > 1\) return ''/.test(defaultFn))

const save = grid.slice(grid.indexOf('const handleSaveSet = '), grid.indexOf('const weight = input.isBodyweight'))
check('the confirm path refuses an empty box in a calibration week instead of writing the guess',
  /if \(calibrationProbe && setNumber > 1 && [^\n]*!input\.weight\.trim\(\)[^\n]*\) \{\s*\n\s*setRowErrors\([^\n]*\)\s*\n\s*return\s*\n\s*\}/.test(save))
check('...before the weight is derived, so the fallback never runs', save.length > 0 && /!input\.weight\.trim\(\)/.test(save))
check('...and the refusal names the probe, so it reads as the design', /set 1 was the probe/.test(save))
check('the empty box asks to be typed into', /const d = defaultWeightFor\(setNumber\)\s*\n\s*return d === '' \? 'type it' : d/.test(grid))

const cascade = grid.slice(grid.indexOf('{calibrationProbe && setNumber > 1 && !isSaved && (() => {'), grid.indexOf('{rowErrors[setNumber] && ('))
check('the next-weight chips exist, in a calibration week, on an unlogged set', cascade.includes('data-testid="calibration-cascade"'))
check('...computed off the previous LOGGED set', /existingLogs\.find\(l => l\.set_number === setNumber - 1\)/.test(cascade))
check('...never off the prescription', !/suggestedLoadKg|perSetLoadKg|defaultWeightFor/.test(cascade))
check('...snapped to the implement\'s real plate step', /roundToPlate\(target, mode\)/.test(cascade) && /plateStepKg\(mode\)/.test(cascade))
check('...and a tap FILLS the box; it does not log the set', /updateInput\(setNumber, 'weight', String\(o\.kg\)\)/.test(cascade) && !/handleSaveSet/.test(cascade))

// THE RUNGS MUST BE THREE DIFFERENT WEIGHTS. Measured in the browser at
// 27.5kg on a barbell (10 Sep 2026): 5% and 10% of it both snap to 30kg, so
// a ladder built straight off the percentages offered ONE step up wearing two
// labels — and the chip reading "+5%" named a weight that was really +9%.
// The executable half proves the collision is real, so the source check
// below is guarding something rather than describing a preference.
check('at a light barbell weight the two percentage targets DO collide',
  roundToPlate(27.5 * 1.05, 'barbell') === roundToPlate(27.5 * 1.10, 'barbell'),
  { five: roundToPlate(27.5 * 1.05, 'barbell'), ten: roundToPlate(27.5 * 1.10, 'barbell') })
check('...so each rung is floored one real step above the one before it',
  /const floor = \(rungs\[rungs\.length - 1\] \?\? base\) \+ step/.test(cascade)
  && /Math\.max\(roundToPlate\(target, mode\), floor\)/.test(cascade))
check('...and the chip says the kilos it adds, which is true at every weight',
  /label: kg === base \? 'same' : `\+\$\{Number\(\(kg - base\)\.toFixed\(2\)\)\}`/.test(cascade)
  && !/\+5%|\+10%/.test(cascade))
check('the plate step is a real one for every implement',
  (['barbell', 'ez_bar', 'stack', 'dumbbell', 'single_implement'] as const).every(m => {
    const step = plateStepKg(m)
    return step > 0 && roundToPlate(100 + step, m) - roundToPlate(100, m) === step
  }))

// ---------------------------------------------------------------------------
console.log('\n3. The screen: ramp first, START HERE, one probe line')
// ---------------------------------------------------------------------------
const chip = strip(read('src/components/exercise/LoadChip.tsx'))
check('the three identical per-set chips are hidden in a calibration week', /ex\.per_set_load\.length > 0 && !calibration \?/.test(chip))
check('...and one probe line takes their place', /Set 1 · probe at \$\{ex\.suggested_load\}/.test(chip))
check('...under a label that names the action', /source === 'estimate' && calibration\) return 'start here'/.test(chip))
const row = strip(read('src/components/exercise/ExerciseRow.tsx'))
check('the ramp is drawn BEFORE the start number', row.indexOf('<RampStrip') > 0 && row.indexOf('<RampStrip') < row.indexOf('ds-num-lg'))
check('...and the week reaches both the chip and the grid', (row.match(/calibration=\{isCalibrationWeek\}/g) || []).length >= 2)
const ramp = strip(read('src/components/exercise/RampStrip.tsx'))
check('the ramp says it comes first, on screen and not in a tooltip', /Ramp up first/.test(ramp) && /→ then set 1/.test(ramp) && !/title=[^\n]*then set 1/.test(ramp))

// ---------------------------------------------------------------------------
console.log('\n4. The hook: a finished session reaches the planner, after the nothing-logged exit')
// ---------------------------------------------------------------------------
const today = strip(read('src/components/exercise/TodayPanel.tsx'))
const finish = today.slice(today.indexOf('const handleFinish = async () => {'), today.indexOf('setSummaryData({ summary, prs, progressions })'))
const exitAt = finish.indexOf('if (result.nothingLogged) {')
const callAt = finish.search(/onCalibrationSessionFinished\?\.\(\{ date: today, dayName: workout\.day \}\)/)
check('finishing a session tells the app which day just closed', callAt >= 0)
check('...only after the "nothing logged" exit — an empty session anchors nothing', exitAt >= 0 && callAt > exitAt)
check('the tab threads it through', /onCalibrationSessionFinished=\{onCalibrationSessionFinished\}/.test(strip(read('src/components/exercise/ExerciseTab.tsx'))))
const app = strip(read('src/App.tsx'))
const handler = app.slice(app.indexOf('const handleCalibrationSessionFinished = '), app.indexOf('const handleBanExercise = '))
check('the app plans the anchor from that day', /applyCalibrationAnchors\(\{/.test(handler))
check('...adopts the rewritten program', /setMesocycle\(r\.next\)/.test(handler))
check('...and says so in the coach\'s voice', /calibrationAnchorMessage\(/.test(handler))
check('...wired to the exercise tab', /onCalibrationSessionFinished=\{handleCalibrationSessionFinished\}/.test(app))

// ---------------------------------------------------------------------------
console.log('\n5. Outside a calibration week, none of it applies')
// ---------------------------------------------------------------------------
const week2 = laterLoading[0]
const day2 = week2.days.find(d => d.day === day.day)!
check('a heavier set in a non-calibration week earns no anchor', calibrationAnchorsFor(week2, day2, [log(1, heavier * 2)]).length === 0)
const fromWeek2 = planCalibrationAnchors(meso, profile, week2.week_number, day.day, [log(1, heavier * 2)])
check('...and planning from it changes nothing', fromWeek2.applied.length === 0 && fromWeek2.next === meso && fromWeek2.changedWeeks.length === 0)
check('the grid\'s calibration behaviour is off unless the week turns it on', /calibration = false,/.test(grid))

// A BODYWEIGHT ROW IS NOT PART OF THE SEARCH. Found in the browser, 10 Sep
// 2026: Scapular Push-Ups sat above the bench press with "type it" in its
// weight box, and its tick would have been refused for want of a weight
// nobody lifts. The three rules must key on a lift that HAS a guess to
// replace — the same test the plan re-anchor uses for evidence.
check('the search is gated on there being a weight to search for',
  /const calibrationProbe = calibration && suggestedLoadKg != null && !!catalogEntry && isExternallyLoaded\(catalogEntry\)/.test(grid))
check('...and all three rules read that same flag, not the week alone',
  (grid.match(/calibrationProbe && setNumber > 1/g) || []).length === 3
  && !/[^a-zA-Z]calibration && setNumber > 1/.test(grid), (grid.match(/calibration(Probe)? && setNumber > 1/g) || []))

console.log(failures === 0 ? '\nAll calibration-search checks passed.' : `\n${failures} calibration-search check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
