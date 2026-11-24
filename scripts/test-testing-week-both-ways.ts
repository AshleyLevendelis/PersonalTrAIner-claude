/**
 * test:testing-week-both-ways — the testing week sets next week's weight in BOTH directions (24 Nov 2026).
 *
 * Ashley, 24 Nov 2026, in week 2: "some prescribed sets are too light while others are too heavy". Traced: week 2 was
 * printed at the testing week's guess plus one step and only a HEAVIER logged set could move it, so a guess he found
 * too heavy (a set he called Hard, a set short of the range, a lighter weight chosen) still went UP a step; a heavy
 * triple was copied into a week of tens; the Hard answer was never saved; and the card pushed a Hard session up to the
 * printed number. docs/plans/testing-week-both-ways.md.
 *
 * Run on a real generated plan (the calibration-search fixture: intermediate, full gym, no known lifts), so the
 * numbers are the app's own guess, step, rounding and deload.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { generateMesocycle } from '../src/lib/exercise-plan'
import { planCalibrationAnchors, calibrationAnchorMessage, testingWeekEvidence } from '../src/lib/calibration-anchor'
import { cardLoadFor } from '../src/lib/progression-engine'
import { PROBE_RPE, effortFromRpe } from '../src/lib/lift-effort'
import { getExerciseEntry, getExerciseId } from '../src/lib/exercise-db'
import { isExternallyLoaded, DELOAD_LOAD_FRACTION } from '../src/lib/load-prescription'
import type { UserProfile, ExerciseSetLog, MesocycleWeek } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
let ran = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.log(`  FAIL: ${label}${extra !== undefined ? `\n        ${JSON.stringify(extra)}` : ''}`) }
}

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
const week2 = meso.find(w => w.week_number === week1.week_number + 1)!
// A loaded lift on the first day that week 2 prints ABOVE the guess (the case the report is about).
const day = week1.days[0]
const exIndex = day.exercises.findIndex((e, i) => e.suggested_load_kg != null && isExternallyLoaded(getExerciseEntry(e.name)!)
  && week2.days.find(d => d.day === day.day)?.exercises[i]?.name === e.name
  && (week2.days.find(d => d.day === day.day)!.exercises[i].suggested_load_kg ?? 0) > e.suggested_load_kg)
const ex = day.exercises[exIndex]
const G = ex.suggested_load_kg ?? 0
const kgIn = (w: MesocycleWeek | undefined) => w?.days.find(d => d.day === day.day)?.exercises[exIndex]?.suggested_load_kg ?? null
const W2 = kgIn(week2) ?? 0
const range = (ex.reps ?? '').match(/\d+/g)?.map(Number) ?? []
const low = Math.min(...range), top = Math.max(...range)
const block1 = meso.filter(w => w.block_number === week1.block_number && (w.week_in_block ?? 1) > 1)
const deload = block1.find(w => w.is_deload)
const later = (plan: MesocycleWeek[], n: number) => kgIn(plan.find(w => w.week_number === n))

const log = (setNumber: number, kg: number, reps: number, extra: Partial<ExerciseSetLog> = {}): ExerciseSetLog => ({
  user_id: 'u', date: '2026-11-16', exercise_name: ex.name, exercise_id: getExerciseId(ex.name),
  set_number: setNumber, weight_kg: kg, reps_completed: reps, is_bodyweight: false, ...extra,
})
const run = (sets: ExerciseSetLog[], plan = meso) => planCalibrationAnchors(plan, profile, week1.week_number, day.day, sets)

console.log('\n0. The fixture')
check('week 1 is the testing week, with a loaded lift week 2 prints above its guess', week1.isCalibrationWeek === true && exIndex >= 0 && W2 > G, { name: ex?.name, G, W2 })
check('...whose range has a bottom and a top', range.length >= 2 && low < top, ex?.reps)
check('...and a block with a deload after week 2', !!deload)

console.log('\n1. A set he called Hard at the guess: week 2 comes DOWN from guess + step (it went up before)')
{
  const r = run([log(1, G, top, { rpe: PROBE_RPE.hard }), log(2, G, top), log(3, G, low)])
  const w2 = later(r.next, week2.week_number)
  check('week 2 is lowered below its printed guess + step', w2 != null && w2 < W2, { W2, w2 })
  check('...and not below the guess he did the reps at', w2 != null && w2 >= G - 2.5 - 1e-9, { G, w2 })
  check('...the anchor says it was lowered', r.applied.length === 1 && r.applied[0].lowered === true, r.applied)
  check('every later week of the block is lowered too, never raised', block1.every(w => (later(r.next, w.week_number) ?? 0) <= (kgIn(w) ?? 0))
    && block1.filter(w => !w.is_deload).every(w => (later(r.next, w.week_number) ?? 0) < (kgIn(w) ?? 0)),
  block1.map(w => ({ n: w.week_number, before: kgIn(w), after: later(r.next, w.week_number) })))
  const lastLoading = block1.filter(w => !w.is_deload && deload && w.week_number < deload.week_number).pop()
  check('...the deload stays lighter than the week before it', !!deload && !!lastLoading && (later(r.next, deload.week_number) ?? 0) < (later(r.next, lastLoading.week_number) ?? 0),
    { deload: deload && later(r.next, deload.week_number), before: lastLoading && later(r.next, lastLoading.week_number) })
  check('...the block still climbs after week 2', block1.filter(w => !w.is_deload).every((w, i, a) => i === 0 || (later(r.next, w.week_number) ?? 0) >= (later(r.next, a[i - 1].week_number) ?? 0)))
  check('the testing week itself keeps its printed number', kgIn(r.next[0]) === G)
  check('the next block is untouched', meso.filter(w => w.block_number !== week1.block_number).every(w => r.next.find(n => n.week_number === w.week_number) === w))
  const said = calibrationAnchorMessage(r.nextWeekNumber ?? 2, r.applied) ?? ''
  check('the sentence names the lift and next week\'s number', said.includes(ex.name) && said.includes(String(w2)) && /from how your sets went/.test(said), said)
  // EVIDENCE USED ONCE, where rounding leaves next week ABOVE what the sets support: the plan read again must not
  // shrink it a second time. Constructed: week 2 put back a step above, the testing slot's stamp kept.
  const bumped = r.next.map(w => w.week_number !== week2.week_number ? w : { ...w, days: w.days.map(d => d.day !== day.day ? d : { ...d, exercises: d.exercises.map((e, i) => i !== exIndex ? e : { ...e, suggested_load_kg: (e.suggested_load_kg ?? 0) + 2.5 }) }) })
  const reread = run([log(1, G, top, { rpe: PROBE_RPE.hard }), log(2, G, top), log(3, G, low)], bumped)
  check('...and a week left above it by rounding is not lowered again on the next read', reread.applied.length === 0 && later(reread.next, week2.week_number) === (w2 ?? 0) + 2.5, reread.applied)
  const again = run([log(1, G, top, { rpe: PROBE_RPE.hard }), log(2, G, top), log(3, G, low)], r.next)
  check('the same sets read again change nothing more (evidence used once)', again.applied.length === 0
    && block1.every(w => later(again.next, w.week_number) === later(r.next, w.week_number)), again.applied)
}

console.log('\n2. Short of the range at the guess: lowered')
{
  const r = run([log(1, G, low - 2), log(2, G, low - 3)])
  const w2 = later(r.next, week2.week_number)
  check('week 2 is lowered below the guess itself', w2 != null && w2 < G, { G, w2 })
  check('...and the deload comes down with the block', !!deload && (later(r.next, deload.week_number) ?? 0) < (kgIn(deload) ?? 0),
    { before: deload && kgIn(deload), after: deload && later(r.next, deload.week_number) })
  // THE ANSWER IS READ: the same short sets, called Easy, are not read as his limit.
  const easy = run([log(1, G, low - 2, { rpe: PROBE_RPE.easy }), log(2, G, low - 3, { rpe: PROBE_RPE.easy })])
  check('the same short sets called Easy leave week 2 higher than unanswered ones', (later(easy.next, week2.week_number) ?? 0) > (w2 ?? 0),
    { unanswered: w2, easy: later(easy.next, week2.week_number) })
}

console.log('\n3. He chose a lighter weight and did the reps: week 2 follows it')
{
  const L = G - 5
  const r = run([log(1, L, top), log(2, L, top), log(3, L, top)])
  const w2 = later(r.next, week2.week_number)
  check('week 2 is lowered to about the weight he chose', w2 != null && w2 < W2 && w2 >= L - 2.5 && w2 <= G, { L, G, W2, w2 })
}

console.log('\n4. The guess done as written, no answers: nothing changes (the step stands)')
{
  const r = run([log(1, G, top), log(2, G, top), log(3, G, top)])
  check('week 2 keeps guess + step', later(r.next, week2.week_number) === W2 && r.applied.length === 0, { W2, after: later(r.next, week2.week_number), applied: r.applied })
  const r2 = run([log(1, G, low), log(2, G, low), log(3, G, low)])
  check('...also at the bottom of the range', later(r2.next, week2.week_number) === W2 && r2.applied.length === 0, r2.applied)
}

console.log('\n5. A heavy triple is not a weight for the whole range')
{
  const H = G * 1.6
  const r = run([log(1, G, top), log(2, H, 3)])
  const w2 = later(r.next, week2.week_number)
  check('week 2 rises, but under the triple\'s weight', w2 != null && w2 > G && w2 < H, { G, H, w2 })
  const capped = testingWeekEvidence([log(1, G, top + 4, { rpe: PROBE_RPE.easy })], ex.reps, ex.reps)
  check('what the sets support is never more than 10% over the heaviest weight lifted', !!capped && capped.supportedKg != null && capped.supportedKg <= G * 1.1 + 1e-9
    && G * (1 + (top + 4 + 10 - PROBE_RPE.easy) / 30) / (1 + top / 30) > G * 1.1, capped)
  const ev = testingWeekEvidence([log(1, H, 3)], ex.reps, ex.reps)
  check('...worked through the reps (Epley carried to the top of the range)', !!ev && ev.provenKg === 0 && ev.supportedKg != null
    && Math.abs(ev.supportedKg - Math.floor((H * (1 + 3 / 30) / (1 + top / 30)) * 2) / 2) < 1e-9, ev)
}

console.log('\n6. Easy, then Hard at the top, then back down: the Hard set is not copied into week 2')
{
  const H = G * 1.5
  const r = run([log(1, G, top, { rpe: PROBE_RPE.easy }), log(2, H, low, { rpe: PROBE_RPE.hard }), log(3, H - 5, top)])
  const w2 = later(r.next, week2.week_number)
  check('week 2 is under the weight he called Hard', w2 != null && w2 < H, { H, w2 })
  check('...and above the guess (the easy sets were real)', w2 != null && w2 > G, { G, w2 })
}

console.log('\n7. A heavier set done for the range, with no answers, still anchors as before (the 10 Sep ruling)')
{
  const H = G * 1.6
  const r = run([log(1, G, top), log(2, H, top), log(3, H - 5, top)])
  check('week 2 starts at the heavier set', later(r.next, week2.week_number) === r.applied[0]?.nextWeek?.kg && (later(r.next, week2.week_number) ?? 0) >= H - 2.5,
    { H, w2: later(r.next, week2.week_number) })
}

console.log('\n8. The answer reads back as its word, and the card follows a testing-week decision')
check('PROBE_RPE reads back as easy / right / hard', effortFromRpe(PROBE_RPE.easy) === 'easy' && effortFromRpe(PROBE_RPE.right) === 'right' && effortFromRpe(PROBE_RPE.hard) === 'hard')
{
  const rec = { weightKg: 50, lastWeightKg: 50, didProgress: false, note: 'hold', effort: null, fellShort: true } as Parameters<typeof cardLoadFor>[0]
  const decided = cardLoadFor(rec, { printedKg: 42.5, printedThenKg: 50, todayIsDeload: false, lastWasDeload: false, testingWeekDecided: true }, 'Barbell Back Squat')
  check('a lowered plan wins over the log\'s hold', decided.weightKg === 42.5, decided)
  const up = cardLoadFor({ ...rec, weightKg: 52.5, fellShort: false }, { printedKg: 55, printedThenKg: 50, todayIsDeload: false, lastWasDeload: false, testingWeekDecided: true }, 'Barbell Back Squat')
  check('...and a raised one', up.weightKg === 55, up)
  const hardPushed = cardLoadFor({ ...rec, fellShort: false, effort: 'hard' as const }, { printedKg: 55, printedThenKg: 50, todayIsDeload: false, lastWasDeload: false }, 'Barbell Back Squat')
  check('without a decision the old rule stands (a Hard session holds)', hardPushed.weightKg === 50, hardPushed)
  const deloadFirst = cardLoadFor(rec, { printedKg: 30, printedThenKg: 50, todayIsDeload: true, lastWasDeload: false, testingWeekDecided: true }, 'Barbell Back Squat')
  check('a deload today is still a deload', deloadFirst.weightKg <= 50 * DELOAD_LOAD_FRACTION + 2.5, deloadFirst)
}

console.log('\n9. The screen keeps the answer and passes the decision (source; verify:calibration-search drives it)')
{
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const grid = strip(readFileSync(join(ROOT, 'src/components/exercise/SetGrid.tsx'), 'utf8'))
  const probe = grid.slice(grid.indexOf('data-testid="probe-feel"'), grid.indexOf('data-testid="probe-feel"') + 4000)
  check('a probe answer logs the set above it with PROBE_RPE[the answer]', /logSet\(\{[\s\S]*setNumber: prev\.set_number[\s\S]*rpe: PROBE_RPE\[a\.feel\]/.test(probe))
  const panel = strip(readFileSync(join(ROOT, 'src/components/exercise/TodayPanel.tsx'), 'utf8'))
  check('the card is told when the plan was set from the testing week', /testingWeekDecided: !!thenWeek\?\.isCalibrationWeek && thenSlot\?\.calibration_anchored_kg != null/.test(panel))
}

console.log(`\n${ran} checks ran, ${failures} failed`)
if (failures > 0) process.exit(1)
