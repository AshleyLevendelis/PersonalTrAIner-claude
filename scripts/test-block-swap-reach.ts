/**
 * test:block-swap-reach — a "Whole block" swap writes only the weeks that still hold the lift being swapped, and the
 * weeks it writes climb like the plan's own (QA walk, 10 Nov 2026).
 *
 * Found on the training screens: swapping Machine Shrug for Shrugs "for the whole block" in week 2 also rewrote week 3
 * and 4, where a hypertrophy plan had already rotated that slot to its next exercise, so the plan's own lift dropped
 * from 26 to 12 kg a hand, and the swap sheet promised a date it never reached. And every week the swap did write sat
 * at the calibration price (half the estimate for an intermediate), where the plan's own untested lifts climb one step
 * a loading week. Both fixed in the one function every swap route ends in (the screen, the coach's card and its
 * confirm), and the sheet's "until" line reads the same weeks the write does.
 */
import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { swapExerciseInMesocycle, getReplacementCandidates, swapStepsLoad } from '../src/lib/mesocycle-edit'
import { blockSwapWeeks, blockSwapEnd } from '../src/lib/block-swap-until'
import { blockSwapLine } from '../src/lib/coach-voice'
import { DELOAD_LOAD_FRACTION, unverifiedRampStepKg, isExternallyLoaded } from '../src/lib/load-prescription'
import type { ExerciseEntry } from '../src/lib/exercise-db'
import type { MesocycleWeek, UserProfile } from '../src/lib/types'

let ran = 0, failures = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — got ${JSON.stringify(extra).slice(0, 500)}` : ''}`) }
}
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => { const w = console.warn, l = console.log; console.warn = () => {}; try { return await fn() } finally { console.warn = w; console.log = l } }

const days = (names: string[]) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => ({ day, available: names.includes(day) }))
const profile = (over: Record<string, unknown>) => ({
  id: undefined, age: 34, gender: 'male', height_cm: 180, weight_kg: 82, activity_level: 'moderate', preferred_time: 'evening',
  bmr: 1800, tdee: 2600, workout_split_preference: 'ai_recommendation', weekly_schedule: {}, dietary_preferences: [],
  concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive', recovery_capacity: 'moderate',
  conditioning_preference: 'tolerate', created_at: '2026-09-07T08:00:00.000Z', fitness_goal: 'hypertrophy', equipment_access: 'full_gym',
  injuries: [], training_style: 'bodybuilding', session_duration_preference: '45-60', training_days: days(['Monday', 'Wednesday', 'Friday']),
  ...over,
}) as unknown as UserProfile
function build(p: UserProfile, seed: string): MesocycleWeek[] {
  setRandomSource(seededRngFromKey(seed))
  try { return generateMesocycle(p, generateExercisePlan(p, []).plan) } finally { resetRandomSource() }
}
const slotOf = (m: MesocycleWeek[], week: number, day: string, i: number) => m.find(w => w.week_number === week)?.days.find(d => d.day === day)?.exercises[i]
const J = (x: unknown) => JSON.stringify(x)

// ---------------------------------------------------------------------------
console.log('1. Reach: a slot the plan rotates at week 3 is swapped in weeks 1-2 only')
const INTER = profile({ training_experience: 'intermediate' })
const inter = build(INTER, 'block-swap-reach|intermediate')
check('fixture: the plan has a calibration week and block 1 is weeks 1-4', inter.some(w => w.isCalibrationWeek) && [1, 2, 3, 4].every(n => inter.find(w => w.week_number === n)?.block_number === 1))
// The first loaded accessory slot whose exercise changes between week 2 and week 3: the rotation, found, not assumed.
let found: { day: string; i: number } | null = null
for (const d of inter.find(w => w.week_number === 2)!.days) {
  d.exercises.forEach((e, i) => {
    const w3 = slotOf(inter, 3, d.day, i)
    if (!found && w3 && w3.name !== e.name && typeof e.suggested_load_kg === 'number' && e.suggested_load_kg > 0) found = { day: d.day, i }
  })
}
check('fixture: a loaded slot that rotates to a different exercise at week 3 exists', found != null)
const R = found ?? { day: 'Monday', i: 0 }
const outgoing = slotOf(inter, 2, R.day, R.i)!
const pick = (await quiet(async () => getReplacementCandidates(outgoing.name, INTER, [])))
  .find(c => c.exercise.name !== outgoing.name && c.exercise.name !== slotOf(inter, 3, R.day, R.i)?.name)
check('fixture: a replacement to swap in', !!pick, outgoing.name)
check('the swap writes week 2 only: the slot holds something else from week 3', J(blockSwapWeeks(inter, 2, R.day, R.i)) === J([2]), blockSwapWeeks(inter, 2, R.day, R.i))
const swapped = await quiet(() => swapExerciseInMesocycle({ mesocycle: inter, profile: INTER, currentWeekNumber: 2, dayName: R.day, exIndex: R.i, newExercise: pick!.exercise, scope: 'permanent' }))
check('week 2 holds the lift she chose', slotOf(swapped, 2, R.day, R.i)?.name === pick?.exercise.name, slotOf(swapped, 2, R.day, R.i)?.name)
check('weeks 3 and 4 keep the plan\'s own exercise at the plan\'s own weight, untouched',
  [3, 4].every(n => J(slotOf(swapped, n, R.day, R.i)) === J(slotOf(inter, n, R.day, R.i))),
  [3, 4].map(n => [slotOf(swapped, n, R.day, R.i)?.name, slotOf(swapped, n, R.day, R.i)?.suggested_load_kg, slotOf(inter, n, R.day, R.i)?.suggested_load_kg]))
check('...and nothing in weeks 3-4 is stamped as her swap', [3, 4].every(n => !slotOf(swapped, n, R.day, R.i)?.swapped_for))
const end = blockSwapEnd(inter, 2, INTER.created_at, R.day, R.i)
check('the sheet\'s line names the day week 3 starts, and why: the plan moves the slot on', end?.date === '2026-09-21' && end.why === 'rotation', end)
check('...in words', blockSwapLine('Mon 21 Sep', 'rotation') === 'Swaps it until Mon 21 Sep, when your plan moves this slot on to its next exercise.')
// A slot that does NOT rotate (the main lift) still reaches the end of the block, and its line still says so.
const mainDay = inter.find(w => w.week_number === 2)!.days.find(d => d.exercises.some(e => e.tier === 'tier_1_primary'))!
const mainI = mainDay.exercises.findIndex(e => e.tier === 'tier_1_primary')
check('a slot that holds its exercise all block is swapped to the end of the block', J(blockSwapWeeks(inter, 2, mainDay.day, mainI)) === J([2, 3, 4]), blockSwapWeeks(inter, 2, mainDay.day, mainI))
check('...and its line names the next block', blockSwapEnd(inter, 2, INTER.created_at, mainDay.day, mainI)?.why === 'block' && blockSwapEnd(inter, 2, INTER.created_at, mainDay.day, mainI)?.date === '2026-10-05', blockSwapEnd(inter, 2, INTER.created_at, mainDay.day, mainI))
// A swap of a swap: the slot already carries her first swap in every week, so the lineage keeps it whole.
const again = slotOf(swapped, 2, R.day, R.i)!
check('a swap of a swap reads the same weeks (the lineage, not only the name)', J(blockSwapWeeks(swapped, 2, R.day, R.i)) === J([2]) && again.swapped_for === outgoing.name)
// THE LINEAGE BINDS HERE: swapped "just today" in week 2, the slot holds another name in week 2 than in weeks 3-4, and
// a whole-block swap made over it must still reach the weeks that hold the lift she first moved away from.
const todayFirst = await quiet(() => swapExerciseInMesocycle({ mesocycle: inter, profile: INTER, currentWeekNumber: 2, dayName: mainDay.day, exIndex: mainI, newExercise: pick!.exercise, scope: 'today' }))
check('after a "just today" swap, a whole-block swap still reaches the rest of the block (by the lift she first swapped)', J(blockSwapWeeks(todayFirst, 2, mainDay.day, mainI)) === J([2, 3, 4]), blockSwapWeeks(todayFirst, 2, mainDay.day, mainI))
check('"today" stays today', J((await quiet(() => swapExerciseInMesocycle({ mesocycle: inter, profile: INTER, currentWeekNumber: 2, dayName: mainDay.day, exIndex: mainI, newExercise: pick!.exercise, scope: 'today' }))).map(w => w.week_number === 2 ? null : w)) === J(inter.map(w => w.week_number === 2 ? null : w)))

// ---------------------------------------------------------------------------
console.log('\n2. Price: an untested swapped-in lift progresses the way the plan\'s own would, and its deload backs off the last week')
const NOVICE = profile({ training_experience: 'novice' })
const nov = build(NOVICE, 'block-swap-reach|novice')
type Case = { from: string; to: ExerciseEntry; kg: (number | null)[]; reps: string[]; deload: boolean[]; steps: boolean }
const cases: Case[] = []
for (const d of nov.find(w => w.week_number === 1)!.days) for (let i = 0; i < d.exercises.length; i++) {
  const e = d.exercises[i]
  if (e.tier === 'tier_1_primary' || !(typeof e.suggested_load_kg === 'number' && e.suggested_load_kg > 0) || J(blockSwapWeeks(nov, 1, d.day, i)) !== J([1, 2, 3, 4])) continue
  const onDay = new Set(d.exercises.map(x => x.name))
  for (const c of (await quiet(async () => getReplacementCandidates(e.name, NOVICE, []))).slice(0, 6)) {
    if (onDay.has(c.exercise.name) || !isExternallyLoaded(c.exercise)) continue
    const s2 = await quiet(() => swapExerciseInMesocycle({ mesocycle: nov, profile: NOVICE, currentWeekNumber: 1, dayName: d.day, exIndex: i, newExercise: c.exercise, scope: 'permanent' }))
    const rows = [1, 2, 3, 4].map(n => slotOf(s2, n, d.day, i)!)
    cases.push({ from: e.name, to: c.exercise, kg: rows.map(r => r.suggested_load_kg ?? null), reps: rows.map(r => r.reps), deload: [1, 2, 3, 4].map(n => !!s2.find(w => w.week_number === n)?.is_deload), steps: swapStepsLoad(c.exercise, NOVICE, nov.find(w => w.week_number === 2)!, rows[1].intensity) })
  }
}
const repHigh = (r: string) => Number(/(\d+)\s*$/.exec(r)?.[1] ?? NaN)
const stepping = cases.filter(c => c.steps)
const holding = cases.filter(c => !c.steps)
check('fixture: swaps of both kinds (a lift that climbs by weight, and one that holds its weight while reps climb)', stepping.length >= 2 && holding.length >= 2, { stepping: stepping.length, holding: holding.length })
check('fixture: weeks 1-3 load and week 4 is the deload, in every case', cases.every(c => J(c.deload) === J([false, false, false, true])))
const climbs = (c: Case) => c.kg[0] != null && c.kg[1] != null && c.kg[2] != null && c.kg[0]! <= c.kg[1]! && c.kg[1]! <= c.kg[2]! && c.kg[2]! > c.kg[0]!
check('a lift that climbs by weight CLIMBS across the loading weeks (it used to sit at the calibration price all block)', stepping.every(climbs), stepping.map(c => [c.to.name, c.kg]))
check('...one step a week at most, never a jump to the full estimate', stepping.every(c => c.kg[1]! - c.kg[0]! <= unverifiedRampStepKg(c.to) + 0.01 && c.kg[2]! - c.kg[1]! <= unverifiedRampStepKg(c.to) + 0.01), stepping.map(c => [c.to.name, c.kg, unverifiedRampStepKg(c.to)]))
check('a lift whose step is too big a jump HOLDS its weight across the loading weeks, as the plan\'s own does', holding.every(c => c.kg[0] != null && c.kg[0] === c.kg[1] && c.kg[1] === c.kg[2]), holding.map(c => [c.to.name, c.kg]))
check('...while its reps climb', holding.every(c => repHigh(c.reps[2]) > repHigh(c.reps[0])), holding.map(c => [c.to.name, c.reps]))
// The deload is 70% of the last loading week, rounded to what the kit holds, and never heavier than it; a lift whose
// 70% rounds under the lightest thing that exists stays at that floor (it can only be <=).
check('EVERY swapped-in lift progresses by one lever or the other: its weight or its reps climb across the loading weeks', cases.every(c => (c.kg[2] ?? 0) > (c.kg[0] ?? 0) || repHigh(c.reps[2]) > repHigh(c.reps[0])), cases.filter(c => !((c.kg[2] ?? 0) > (c.kg[0] ?? 0) || repHigh(c.reps[2]) > repHigh(c.reps[0]))).map(c => [c.to.name, c.kg, c.reps]))
check('the deload backs off week 3 (about 70%, never of the calibration price)', cases.every(c => c.kg[3] != null && c.kg[3]! <= c.kg[2]! && (c.kg[3]! === c.kg[2]! || Math.abs(c.kg[3]! - c.kg[2]! * DELOAD_LOAD_FRACTION) <= 2.5)), cases.map(c => [c.to.name, c.kg]))
check('...and for a lift that climbed, below week 3 and above 70% of week 1', stepping.every(c => c.kg[3]! < c.kg[2]! && c.kg[3]! > c.kg[0]! * DELOAD_LOAD_FRACTION - 0.01), stepping.map(c => [c.to.name, c.kg]))
console.log(`  (measured, ${cases.length} swaps: ${stepping.slice(0, 2).map(c => `${c.from} -> ${c.to.name} ${J(c.kg)}`).join('; ')}; ${holding.slice(0, 2).map(c => `${c.from} -> ${c.to.name} ${J(c.kg)} ${J(c.reps)}`).join('; ')})`)

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`${failures} block-swap-reach check(s) FAILED`); process.exit(1) }
console.log('block-swap-reach: all checks passed')
