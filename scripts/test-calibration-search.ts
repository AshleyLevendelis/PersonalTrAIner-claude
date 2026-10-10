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
import { generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { calibrationAnchorsFor, planCalibrationAnchors, calibrationAnchorMessage } from '../src/lib/calibration-anchor'
import { patchBlockFromLiftedKg } from '../src/lib/beat-target-offer'
import { getExerciseEntry, getExerciseId } from '../src/lib/exercise-db'
import { isExternallyLoaded, loadingMode, roundToPlate, plateStepKg, DELOAD_LOAD_FRACTION, nextSetRungsKg } from '../src/lib/load-prescription'
import type { UserProfile, ExerciseSetLog } from '../src/lib/types'
import { blankWeightFor } from '../src/lib/set-row'
import { perSetChipsWorthShowing } from '../src/components/exercise/LoadChip'

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
check('the sentence names the lift, the set and the week', !!msg && msg.includes(ex.name) && msg.includes(`${heavier}kg`) && /Week 2/.test(msg), msg)

// ---------------------------------------------------------------------------
console.log('\n2. The grid: sets 2+ have no default, the tick refuses, the chips climb off the last logged set')
// ---------------------------------------------------------------------------
const grid = strip(read('src/components/exercise/SetGrid.tsx'))
// RE-ANCHORED 10 Oct 2026 (H25): a working set's blank box is now one decision,
// blankWeightFor, so the property is ASKED of it rather than read off a line.
// The grid's half is that it names a probe set the same way for all three
// inputs (no carry, no plan number, no fallback).
const blankFn = grid.slice(grid.indexOf('const workingBlankFor = '), grid.indexOf('const offersNoWeight'))
const probeDecl = /const probeSet = calibrationProbe && setNumber > 1/.test(blankFn)
check('in a calibration week, sets after the first have NO default weight',
  probeDecl && /noCarry: probeSet/.test(blankFn) && /planKg: probeSet \? null/.test(blankFn) && /fallback: probeSet \|\|/.test(blankFn)
  && blankWeightFor({ carry: { kg: 40, isBodyweight: false, fromSet: 1 }, noCarry: true, planKg: null, lastTimeKg: null, fallback: '' }).text === '')
check('...not even the set just done: a probe set is never filled from set 1',
  blankWeightFor({ carry: { kg: 40, isBodyweight: false, fromSet: 1 }, noCarry: true, planKg: null, lastTimeKg: null, fallback: '' }).source !== 'carried')
check('...and set 1 keeps its pre-fill — the probe is one tap when the guess is right',
  probeDecl && blankWeightFor({ carry: null, noCarry: false, planKg: 30, lastTimeKg: null, fallback: '' }).text === '30')

const save = grid.slice(grid.indexOf('const handleSaveSet = '), grid.indexOf('const weight = input.isBodyweight'))
// RE-ANCHORED 17 Sep 2026: the condition gained a term (`!warm`) when the
// build-up became real rows, and a check naming the exact conjunction failed
// on a correct change. The property is the shape — probe, past set 1, blank
// box, error and return — not the list of terms.
check('the confirm path refuses an empty box in a calibration week instead of writing the guess',
  /if \(calibrationProbe && [^\n]*setNumber > 1 && [^\n]*!input\.weight\.trim\(\)[^\n]*\) \{\s*\n\s*setRowErrors\([^\n]*\)\s*\n\s*return\s*\n\s*\}/.test(save))
// AND NEVER ON A BUILD-UP ROW. Its number comes from the prescription, so a
// blank box there is not a missing probe — refusing it would block the warm-up
// of every calibration-week lift.
// RE-ANCHORED 19 Sep 2026, and widened at the same time. This pinned the
// guard's exact text and went red when it gained a third exemption (drop
// rows), which is the same shape as the delete-call pin two gates over. The
// PROPERTY is "the probe refusal applies to working sets only", so both
// exemptions are now named and the condition's spelling is not.
check('...and a build-up row is exempt: its weight was never the guess being replaced',
  /if \(calibrationProbe &&[^)]*!warm[^)]*setNumber > 1/.test(save))
// AND A DROP ROW TOO, for a different reason worth having written down: a
// drop's box is filled from the set ABOVE IT, which is a weight actually
// lifted rather than the week's guess. Refusing it would block the one row
// whose default was never a guess at all.
check('...and so is a drop, whose weight comes from a set that really happened',
  /if \(calibrationProbe &&[^)]*!drop[^)]*setNumber > 1/.test(save))
check('...before the weight is derived, so the fallback never runs', save.length > 0 && /!input\.weight\.trim\(\)/.test(save))
check('...and the refusal names the probe, so it reads as the design', /set 1 was the probe/.test(save))
check('the empty box asks to be typed into', /const d = defaultWeightFor\(\w+\)\s*\n\s*return d === '' \? 'type it' : d/.test(grid))

// ANCHORED ON THE BLOCK'S OWN TESTID, not on the condition that renders it.
// The old anchor was the full condition text and broke the moment that
// condition gained `!drop` — and because indexOf returns -1 rather than
// failing, the slice below would have silently become the whole component.
const cascadeMarker = grid.indexOf('data-testid="calibration-cascade"')
const cascadeStart = cascadeMarker < 0 ? -1 : grid.lastIndexOf('{calibrationProbe', cascadeMarker)
const cascadeEnd = grid.indexOf('{rowErrors[k] && (')
// A SLICE THAT MISSED ITS END STILL SLICES. indexOf returning -1 quietly cuts
// one character off the file instead of failing, so the checks below would have
// read the whole component and passed on text from anywhere in it.
check('the chip block was found where it is expected to be', cascadeStart > 0 && cascadeEnd > cascadeStart)
const cascade = grid.slice(cascadeStart, cascadeEnd)
check('the next-weight chips exist, in a calibration week, on an unlogged set', cascade.includes('data-testid="calibration-cascade"'))
check('...computed off the previous LOGGED set', /existingLogs\.find\(l => l\.set_number === setNumber - 1\)/.test(cascade))
check('...never off the prescription', !/suggestedLoadKg|perSetLoadKg|defaultWeightFor/.test(cascade))
// RE-ANCHORED 9 Oct 2026. The ladder's arithmetic moved out of the component
// into nextSetRungsKg (load-prescription.ts) so it could stop at a stated
// dumbbell limit, and three checks that pinned its exact lines in SetGrid went
// red on a correct change. They now hold the same properties by RUNNING the
// ladder, plus one source check that the grid really uses it.
check('...built by the shared ladder, from that logged weight and nothing else', /nextSetRungsKg\(base, catalogEntry, profile\)/.test(cascade) && /const base = Number\(prev\.weight_kg\)/.test(cascade))
const barbellLift = getExerciseEntry('Barbell Bench Press')!
const pairLift = getExerciseEntry('Romanian Deadlifts')!
check('...snapped to the implement\'s real plate step', nextSetRungsKg(40, barbellLift, null).every(kg => (kg * 2) % 5 === 0) && nextSetRungsKg(20, pairLift, null).every(kg => kg % 2 === 0), { bar: nextSetRungsKg(40, barbellLift, null), pair: nextSetRungsKg(20, pairLift, null) })
check('...and a tap FILLS the box; it does not log the set', /updateInput\(\w+, 'weight', String\(o\.kg\)\)/.test(cascade) && !/handleSaveSet/.test(cascade))
// The same re-anchoring as the refusal above, and it wants both exclusions:
// a build-up's number comes from the prescription, and a DROP's comes from the
// set above it, so on neither row is there a guess for a ladder to climb off.
check('...and the chips are never offered on a build-up row',
  /calibrationProbe &&[^)]*!warm[^)]*setNumber > 1 && !isSaved/.test(grid))
check('...nor on a drop, whose weight is read off the set above it',
  /calibrationProbe &&[^)]*!drop[^)]*setNumber > 1 && !isSaved/.test(grid))

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
  JSON.stringify(nextSetRungsKg(27.5, barbellLift, null)) === '[30,32.5]', nextSetRungsKg(27.5, barbellLift, null))

// IT STOPS AT WHAT THE PERSON HAS SAID THEY OWN (test log H18). 24kg dumbbells,
// 30kg just logged: the app offered "+2 · 32" and "+4 · 34".
{
  const owns = (kg: number) => ({ ...profile, max_dumbbell_kg: kg }) as unknown as UserProfile
  check('the fixture is a dumbbell pair with a real ladder when no limit is known', loadingMode(pairLift) === 'dumbbell' && JSON.stringify(nextSetRungsKg(30, pairLift, profile)) === '[32,34]', nextSetRungsKg(30, pairLift, profile))
  check('logged at or above a stated limit: no rung is offered above it', nextSetRungsKg(30, pairLift, owns(24)).length === 0 && nextSetRungsKg(24, pairLift, owns(24)).length === 0, [nextSetRungsKg(30, pairLift, owns(24)), nextSetRungsKg(24, pairLift, owns(24))])
  check('one step under the limit: the limit itself is offered, and nothing past it', JSON.stringify(nextSetRungsKg(22, pairLift, owns(24))) === '[24]', nextSetRungsKg(22, pairLift, owns(24)))
  check('well under the limit the ladder is untouched', JSON.stringify(nextSetRungsKg(16, pairLift, owns(24))) === '[18,20]', nextSetRungsKg(16, pairLift, owns(24)))
  check('a stated limit on a DIFFERENT implement changes nothing here', JSON.stringify(nextSetRungsKg(30, pairLift, { ...profile, max_single_implement_kg: 12, max_improvised_kg: 10 } as unknown as UserProfile)) === '[32,34]')
  check('...and a barbell lift is never cut short by a dumbbell limit', JSON.stringify(nextSetRungsKg(27.5, barbellLift, owns(24))) === '[30,32.5]', nextSetRungsKg(27.5, barbellLift, owns(24)))
  check('the "same" chip is still there — the grid always lists the logged weight first', /const opts = \[base, \.\.\.rungs\]/.test(cascade))
}
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
// CALLED, NOT GREPPED. This asserted a regex over LoadChip.tsx's JSX —
// `ex.per_set_load.length > 0 && !calibration ?` — and on 18 Sep 2026 Ashley's
// second rule was added beside the first ("a ladder that does not climb should
// not look like one"). The condition grew, the regex stopped matching, and
// this check went red at correct code while the behaviour it names still held.
// The decision now lives in a predicate the gate can call.
const uniform = [
  { set_number: 1, load_kg: 18 },
  { set_number: 2, load_kg: 18 },
  { set_number: 3, load_kg: 18 },
]
const climbing = [
  { set_number: 1, load_kg: 50 },
  { set_number: 2, load_kg: 52.5 },
  { set_number: 3, load_kg: 57.5 },
]
check('the three identical per-set chips are hidden in a calibration week',
  perSetChipsWorthShowing(uniform, true) === false)
check('...and a climbing ladder is hidden in a calibration week too — the probe is set one only',
  perSetChipsWorthShowing(climbing, true) === false)
check('three identical chips are hidden in an ordinary week as well — a ladder that does not climb should not look like one',
  perSetChipsWorthShowing(uniform, false) === false)
check('...while a ladder that DOES climb still shows, because nothing else on the row says so',
  perSetChipsWorthShowing(climbing, false) === true)
check('no ladder at all shows nothing, rather than throwing',
  perSetChipsWorthShowing(null, false) === false && perSetChipsWorthShowing([], false) === false)
// The climbing case is not hypothetical: measured 19 Sep 2026 over a 96-plan
// spread of the generation grid, 1,352 of 17,293 per-set ladders climb. If
// that ever stops being true the chips are dead code and this section is
// measuring an unreachable branch, so the fact is recorded next to the check
// rather than left to be rediscovered.
check('the JSX asks the predicate rather than re-deriving the rule beside it',
  /perSetChipsWorthShowing\(ex\.per_set_load, calibration\)/.test(read('src/components/exercise/LoadChip.tsx'))
  && !/new Set\(ex\.per_set_load/.test(strip(read('src/components/exercise/LoadChip.tsx'))))
check('...and one probe line takes their place', /Set 1 · probe at \$\{ex\.suggested_load\}/.test(chip))
check('...under a label that names the action', /source === 'estimate' && calibration\) return 'start here'/.test(chip))
const row = strip(read('src/components/exercise/ExerciseRow.tsx'))
// REPLACED 17 Sep 2026, not re-anchored: this asked whether the tickable ramp
// STRIP was drawn above the start number on today's card. There is no strip on
// today's card any more — Ashley's ruling that day replaced it with a box for
// every build-up set, in the grid, above the working rows. The property she
// ruled on survives ("the build-up comes first, and you can see it"); the
// mechanism that carried it does not. The order on the real screen is read by
// verify:warmup-rows §3; here we hold the two halves a source can see.
check('today\'s card hands the build-up to the grid as rows, not as a strip',
  /rampSets=\{/.test(row) && !/<RampStrip/.test(row))
check('...and the build-up rows are built before the working ones', /const rowRefs: SetRef\[\] = \[\s*\n\s*\.\.\.warmupRowNumbers[\s\S]{0,160}?\.\.\.workingRowNumbers/.test(grid))
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
check('...only when there is something true to say — a null sentence is never shown', /const said = calibrationAnchorMessage\([^\n]*\)\s*\n\s*if \(said\) setAdaptationMessages\(/.test(handler), handler.match(/calibrationAnchorMessage[\s\S]{0,160}/)?.[0])
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
  (grid.match(/calibrationProbe && [^\n]*setNumber > 1/g) || []).length === 3
  && !/[^a-zA-Z]calibration && [^\n]*setNumber > 1/.test(grid), (grid.match(/calibration(Probe)? && [^\n]*setNumber > 1/g) || []))

// ---------------------------------------------------------------------------
console.log('\n6. The sentence and the plan agree, when the person has said what their heaviest dumbbell is')
// ---------------------------------------------------------------------------
// Test log H18, 9 Oct 2026. A tester whose heaviest dumbbells are 24kg logged
// Romanian Deadlifts at 30kg per hand in his calibration week. Home said
// "Week 2 now starts Romanian Deadlifts from your 30kg set"; week 2 printed
// 24kg per hand, because the plan is clamped to what he owns and the sentence
// was built from what he lifted. Two numbers for one fact, an hour apart.
{
  setRandomSource(seededRngFromKey('sam:2'))
  const sam = {
    ...profile, fitness_goal: 'fat_loss', equipment_access: 'minimalist', injuries: ['shoulders'],
    training_style: 'bodybuilding', session_duration_preference: '30-45', max_dumbbell_kg: 24, weight_kg: 82,
    training_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      .map(d => ({ day: d, available: ['Monday', 'Tuesday', 'Thursday', 'Saturday'].includes(d) })),
  } as unknown as UserProfile
  console.log = () => {}
  const samPlan = generateMesocycle(sam)
  console.log = quiet
  resetRandomSource()
  const thu = samPlan[0].days.find(d => d.day === 'Thursday')!
  const rdlIndex = thu.exercises.findIndex(e => e.name === 'Romanian Deadlifts')
  const rdlKg = (w: typeof week1) => w.days.find(d => d.day === 'Thursday')!.exercises[rdlIndex]?.suggested_load_kg
  check('the fixture has his Thursday Romanian Deadlifts, printed under 24kg in weeks 1 and 2', rdlIndex >= 0 && rdlKg(samPlan[0])! < 24 && rdlKg(samPlan[1])! < 24, { i: rdlIndex, w1: rdlIndex >= 0 && rdlKg(samPlan[0]), w2: rdlIndex >= 0 && rdlKg(samPlan[1]) })

  const over = planCalibrationAnchors(samPlan, sam, 1, 'Thursday', [log(1, 30, {}, 'Romanian Deadlifts'), log(2, 30, {}, 'Romanian Deadlifts')])
  const wk2 = over.next.find(w => w.week_number === 2)!
  check('week 2 is written at 24kg per hand — the plan respects what he owns', rdlKg(wk2) === 24, rdlKg(wk2))
  const said = calibrationAnchorMessage(2, over.applied)
  check('the sentence quotes the weight that was WRITTEN', !!said && /24kg/.test(said), said)
  check('...and does not announce the 30kg he lifted as where week 2 starts', !!said && !/from your 30kg set/.test(said) && !/starts[^.]*\b30kg/.test(said), said)
  check('...and says why it stopped there, in plain words', !!said && /heaviest/.test(said), said)
  check('no "undefined", "null" or "NaN" in it', !!said && !/undefined|null|NaN/.test(said), said)
  console.log(`     says: "${said}"`)
  check('the sentence, exactly', said === "Week 2 now starts Romanian Deadlifts at 24kg per hand, the heaviest you've told me you have — not the guess it was printed with.", said)
  // The deload backs off from what was WRITTEN (24), not from what was lifted
  // (30): 70% of 30 is 21, 70% of 24 is 16.8.
  const samDeload = over.next.find(w => w.block_number === samPlan[0].block_number && w.is_deload)!
  check('the block\'s deload is 70% of the 24kg that was written, not of the 30kg lifted', rdlKg(samDeload) === roundToPlate(24 * DELOAD_LOAD_FRACTION, 'dumbbell') && rdlKg(samDeload)! < 20, rdlKg(samDeload))
  const wk2Row = wk2.days.find(d => d.day === 'Thursday')!.exercises[rdlIndex]
  check('week 2\'s row records WHY it stops at 24 — his own limit — and says so beside the weight',
    wk2Row.load_hold === 'stated_limit' && /24kg dumbbells/.test(wk2Row.load_guidance ?? '') && !/Add \d/.test(wk2Row.load_guidance ?? ''),
    { hold: wk2Row.load_hold, guidance: wk2Row.load_guidance })
  check('the anchor carries what next week reads, so the sentence cannot drift from the plan', over.applied[0]?.nextWeek?.kg === 24 && over.applied[0]?.nextWeek?.moved === true && over.applied[0]?.nextWeek?.atStatedLimit === true, over.applied[0])

  // "ONLY CLAIM A CHANGE WHEN THE NUMBER MOVED". The same lift, for somebody
  // whose plan is ALREADY printed at his limit: lifting more than he owns
  // changes nothing on the plan, so nothing is announced and nothing is saved.
  const limit = rdlKg(samPlan[1])!
  const atLimit = { ...sam, max_dumbbell_kg: limit } as unknown as UserProfile
  setRandomSource(seededRngFromKey('sam:2'))
  console.log = () => {}
  const limitPlan = generateMesocycle(atLimit)
  console.log = quiet
  resetRandomSource()
  const lIndex = limitPlan[0].days.find(d => d.day === 'Thursday')!.exercises.findIndex(e => e.name === 'Romanian Deadlifts')
  const lKg = (w: typeof week1) => w.days.find(d => d.day === 'Thursday')!.exercises[lIndex]?.suggested_load_kg
  const block = limitPlan.filter(w => w.block_number === limitPlan[0].block_number && (w.week_in_block ?? 1) > 1 && !w.is_deload)
  check(`the second fixture's later loading weeks already sit at his ${limit}kg limit`, lIndex >= 0 && block.length >= 2 && block.every(w => lKg(w) === limit), block.map(w => lKg(w)))
  const none = planCalibrationAnchors(limitPlan, atLimit, 1, 'Thursday', [log(1, limit + 6, {}, 'Romanian Deadlifts')])
  const rdlApplied = none.applied.filter(a => a.exerciseName === 'Romanian Deadlifts')
  check('a lift that cannot move the plan is not reported as applied', rdlApplied.length === 0, none.applied)
  check('...no week is rewritten for it', none.changedWeeks.length === 0 && none.next === limitPlan, none.changedWeeks.map(w => w.week_number))
  check('...and there is no sentence at all', calibrationAnchorMessage(2, none.applied) === null, calibrationAnchorMessage(2, none.applied))

  // "PATCHED" MEANS THE NUMBER MOVED, where a clamp INSIDE the prescription
  // hands back what was already printed. His Tuesday Backpack Row sits at the
  // 20kg a bag is trusted with at his experience; a logged 26 cannot raise it
  // (that limit is about the bag, not about him), so nothing is rewritten and
  // nothing is announced.
  const tue = samPlan[0].days.find(d => d.day === 'Tuesday')!
  const bagIndex = tue.exercises.findIndex(e => e.name === 'Backpack Row')
  const bagKg = (w: typeof week1) => w.days.find(d => d.day === 'Tuesday')!.exercises[bagIndex]?.suggested_load_kg
  check('the fixture has a Backpack Row already at 20kg in weeks 1 to 3', bagIndex >= 0 && [0, 1, 2].every(i => bagKg(samPlan[i]) === 20), bagIndex >= 0 && [0, 1, 2].map(i => bagKg(samPlan[i])))
  const bag = planCalibrationAnchors(samPlan, sam, 1, 'Tuesday', [log(1, 26, {}, 'Backpack Row')])
  check('a logged 26kg on it rewrites no week and is not reported as applied', bag.applied.length === 0 && bag.changedWeeks.length === 0 && bag.next === samPlan, { applied: bag.applied, changed: bag.changedWeeks.map(w => w.week_number) })

  // ...and where ROUNDING hands it back. A deload's target is 70% of the
  // reachable weight (16.8kg for 24), which rounds to the 16kg dumbbell; a
  // plan whose deload is already 16 and whose loading weeks are already 24 has
  // nothing to move, and must not be reported as patched for being rewritten
  // with the same figures.
  const settled = over.next
  const again = patchBlockFromLiftedKg(settled, sam, { blockNumber: samPlan[0].block_number ?? 1, dayName: 'Thursday', exIndex: rdlIndex, exerciseName: 'Romanian Deadlifts', liftedKg: 30, fromWeekInBlock: 2 })
  // (The helper always returns a fresh array; an untouched WEEK keeps its identity.)
  const untouched = again.next.every((w, i) => w === settled[i])
  check('re-anchoring a block that is already there changes nothing and says so', again.patched === false && untouched, { patched: again.patched, untouched })

  // THE SENTENCE ITSELF, on anchors built by hand, so each branch is held on
  // its own rather than only through whatever a generated plan happens to do.
  const a = (over: Record<string, unknown>) => ({ exIndex: 0, exerciseName: 'Dumbbell Rows', plannedKg: 16, liftedKg: 30, ...over }) as never
  const movedTo = (kg: number, atStatedLimit: boolean, moved = true) => ({ nextWeek: { kg, label: `~${kg}kg per hand`, moved, atStatedLimit } })
  check('a lift whose next week did not move is not announced at all', calibrationAnchorMessage(2, [a(movedTo(24, true, false))]) === null)
  check('...and is left out of a list where another lift did move',
    calibrationAnchorMessage(2, [a(movedTo(24, true, false)), a({ exerciseName: 'Hammer Curls', liftedKg: 12, ...movedTo(12, false) })])
      === 'Week 2 now starts Hammer Curls from your 12kg set — not the guess it was printed with.',
    calibrationAnchorMessage(2, [a(movedTo(24, true, false)), a({ exerciseName: 'Hammer Curls', liftedKg: 12, ...movedTo(12, false) })]))
  // Stopped short by something that is NOT a limit the person gave: the
  // number is still the written one, and nothing is claimed about what they
  // told us.
  const short = calibrationAnchorMessage(2, [a(movedTo(26, false))])
  check('stopped short by something other than a stated limit: the written number, and no claim about what they told us', !!short && /at 26kg per hand/.test(short) && !/told me/.test(short) && !/30kg/.test(short), short)
  check('two lifts read as a sentence, one of each kind',
    calibrationAnchorMessage(2, [a(movedTo(24, true)), a({ exerciseName: 'Hammer Curls', liftedKg: 12, ...movedTo(12, false) })])
      === "Week 2 now starts Dumbbell Rows at 24kg per hand, the heaviest you've told me you have and Hammer Curls from your 12kg set — not the guesses it was printed with.",
    calibrationAnchorMessage(2, [a(movedTo(24, true)), a({ exerciseName: 'Hammer Curls', liftedKg: 12, ...movedTo(12, false) })]))
  // And the planner sets that flag only for a STATED limit. No limit given, a
  // set logged above the heaviest dumbbell the table allows (50kg per hand):
  // the plan stops at 50 and the sentence must not say he told us so.
  const noLimit = { ...sam, max_dumbbell_kg: undefined } as unknown as UserProfile
  const huge = planCalibrationAnchors(samPlan, noLimit, 1, 'Thursday', [log(1, 60, {}, 'Romanian Deadlifts')])
  const hugeSaid = calibrationAnchorMessage(2, huge.applied)
  check('with no limit stated, a table clamp is never described as something he told us',
    huge.applied[0]?.nextWeek?.kg === 50 && huge.applied[0]?.nextWeek?.atStatedLimit === false && !!hugeSaid && /at 50kg per hand/.test(hugeSaid) && !/told me/.test(hugeSaid),
    { anchor: huge.applied[0], hugeSaid })

  // And the ordinary case is untouched: no limit in the way, the lifted
  // number is the written number and the sentence still says so.
  check('with nothing in the way the sentence still reads "from your Nkg set"', !!msg && msg.includes(`from your ${heavier}kg set`), msg)
}

console.log(failures === 0 ? '\nAll calibration-search checks passed.' : `\n${failures} calibration-search check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
