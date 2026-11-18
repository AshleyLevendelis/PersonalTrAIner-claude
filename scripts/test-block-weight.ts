// A WEIGHT WRITTEN ACROSS A BLOCK KEEPS THE DELOAD A DELOAD (18 Nov 2026; docs/plans/weights-leftovers-2026-11-18.md).
// Run: npm run test:block-weight
import { readFileSync } from 'fs'
import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import { writeBlockWeight } from '../src/lib/block-weight'
import { DELOAD_LOAD_FRACTION, isExternallyLoaded } from '../src/lib/load-prescription'
import { getExerciseEntry } from '../src/lib/exercise-db'
import type { MesocycleWeek, UserProfile } from '../src/lib/types'

let ran = 0, failures = 0
function ok(label: string, cond: boolean, extra?: unknown) {
  ran++
  if (cond) console.log(`  ok: ${label}`)
  else { failures++; console.log(`  FAIL: ${label}`, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)) }
}
const days = (names: string[]) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => ({ day, available: names.includes(day) }))
const profile = {
  id: undefined, age: 34, gender: 'male', height_cm: 180, weight_kg: 82, activity_level: 'moderate', preferred_time: 'evening',
  bmr: 1800, tdee: 2600, workout_split_preference: 'ai_recommendation', weekly_schedule: {}, dietary_preferences: [],
  concurrent_activities: [], macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive', recovery_capacity: 'moderate',
  conditioning_preference: 'tolerate', created_at: '2026-09-07T08:00:00.000Z', fitness_goal: 'hypertrophy', equipment_access: 'full_gym',
  injuries: [], training_style: 'bodybuilding', session_duration_preference: '45-60', training_days: days(['Monday', 'Wednesday', 'Friday']),
  training_experience: 'intermediate',
} as unknown as UserProfile
setRandomSource(seededRngFromKey('block-weight|intermediate'))
let meso: MesocycleWeek[]
try { meso = generateMesocycle(profile, generateExercisePlan(profile, []).plan) } finally { resetRandomSource() }

// THE LIFT IS FOUND, never named: a barbell or machine lift that sits in the same slot through every week of block 2.
const block = 2
const weeks = meso.filter(w => w.block_number === block)
const deload = weeks.find(w => w.is_deload)
const loading = weeks.filter(w => !w.is_deload)
let target: { dayName: string; exIndex: number; name: string } | null = null
for (const d of weeks[0]?.days ?? []) for (let i = 0; i < d.exercises.length && !target; i++) {
  const e = d.exercises[i]
  const entry = getExerciseEntry(e.name)
  if (!entry || !isExternallyLoaded(entry) || !(e.suggested_load_kg && e.suggested_load_kg >= 30)) continue
  if (weeks.every(w => w.days.find(x => x.day === d.day)?.exercises[i]?.name === e.name)) target = { dayName: d.day, exIndex: i, name: e.name }
}
const at = (m: MesocycleWeek[], weekNo: number) => m.find(w => w.week_number === weekNo)?.days.find(d => d.day === target!.dayName)?.exercises[target!.exIndex]

console.log('[0] The fixture binds')
ok('block 2 has loading weeks and one deload', loading.length >= 2 && !!deload, weeks.map(w => [w.week_number, w.is_deload]))
ok('a loaded lift holds one slot through the whole block', !!target, target)
if (!target || !deload) { console.log(`\n${ran} checks ran`); process.exit(1) }
const printedDeload = at(meso, deload.week_number)!.suggested_load_kg!
const lastLoading = loading[loading.length - 1]
const HELD = Math.round((at(meso, loading[0].week_number)!.suggested_load_kg! + 10) / 2.5) * 2.5
console.log(`  ${target.name} on ${target.dayName}; writing ${HELD} kg across block ${block}`)

console.log('\n[1] The loading weeks take the weight, the deload takes its share')
const out = writeBlockWeight(meso, profile, { blockNumber: block, dayName: target.dayName, exIndex: target.exIndex, exerciseName: target.name, weightKg: HELD, holdNote: 'Held steady.' })
for (const w of loading) ok(`week ${w.week_number} (loading) is written at ${HELD} kg`, at(out, w.week_number)!.suggested_load_kg === HELD, at(out, w.week_number)!.suggested_load_kg)
const dKg = at(out, deload.week_number)!.suggested_load_kg!
ok(`the deload is lighter than the loading weeks (${dKg} against ${HELD})`, dKg < HELD, dKg)
ok('...at the deload share, to the nearest step of the implement', Math.abs(dKg - HELD * DELOAD_LOAD_FRACTION) <= 2.5, [dKg, HELD * DELOAD_LOAD_FRACTION])
ok('the deload is NOT as heavy as the block\'s last loading week (the defect)', dKg < at(out, lastLoading.week_number)!.suggested_load_kg!)
ok('the hold note is on the loading weeks and never on the deload', loading.every(w => at(out, w.week_number)!.block_hold_note === 'Held steady.') && at(out, deload.week_number)!.block_hold_note === undefined)

console.log('\n[2] Each week keeps its own sets and reps, and its own set ladder')
for (const w of weeks) {
  const before = at(meso, w.week_number)!, after = at(out, w.week_number)!
  ok(`week ${w.week_number}: sets and reps are untouched`, after.sets === before.sets && after.reps === before.reps)
  ok(`week ${w.week_number}: the per-set ladder, where there is one, has one entry per set of THAT week`, !after.per_set_load || after.per_set_load.length === after.sets, [after.per_set_load?.length, after.sets])
}
ok('the deload\'s ladder is not the loading week\'s ladder', JSON.stringify(at(out, deload.week_number)!.per_set_load ?? null) !== JSON.stringify(at(out, loading[0].week_number)!.per_set_load ?? 'x') || !at(out, deload.week_number)!.per_set_load)

console.log('\n[3] Nothing else moves')
// A REAL lift that is not the one in the slot, so the name guard (not the catalogue lookup) is what refuses.
const OTHER = ['Barbell Back Squat', 'Lat Pulldown', 'Leg Press'].find(n => n !== target!.name && !!getExerciseEntry(n))!
ok('the other lift used below is a real catalogue lift', !!OTHER && !!getExerciseEntry(OTHER))
ok('other blocks are untouched', meso.filter(w => w.block_number !== block).every(w => JSON.stringify(w) === JSON.stringify(out.find(x => x.week_number === w.week_number))))
ok('other lifts in the block are untouched', weeks.every(w => w.days.every(d => d.exercises.every((e, i) => (d.day === target!.dayName && i === target!.exIndex) || JSON.stringify(e) === JSON.stringify(out.find(x => x.week_number === w.week_number)!.days.find(x => x.day === d.day)!.exercises[i])))))
ok('a name that no longer matches the slot writes nothing', JSON.stringify(writeBlockWeight(meso, profile, { blockNumber: block, dayName: target.dayName, exIndex: target.exIndex, exerciseName: OTHER, weightKg: HELD })) === JSON.stringify(meso))
ok('a zero weight writes nothing', writeBlockWeight(meso, profile, { blockNumber: block, dayName: target.dayName, exIndex: target.exIndex, exerciseName: target.name, weightKg: 0 }) === meso)
ok(`(the plan's own deload was ${printedDeload} kg: the generator's deload is lighter too, so the rule is the plan's own)`, printedDeload < at(meso, lastLoading.week_number)!.suggested_load_kg!)

console.log('\n[4] Both writers go through it, and the sentence says what the trigger tests')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const review = strip(readFileSync('src/lib/block-review.ts', 'utf8'))
const sugg = strip(readFileSync('src/lib/load-suggestions.ts', 'utf8'))
ok('the block review writes through writeBlockWeight( and prices nothing itself', /writeBlockWeight\(workingMesocycle, profile,/.test(review) && !/prescribeLoad\(/.test(review))
ok('a confirmed suggestion writes through writeBlockWeight( and prices nothing itself', /writeBlockWeight\(mesocycle, profile,/.test(sugg) && !/prescribeLoad\(/.test(sugg))
ok('the suggestion makes no top-of-range claim', !/top of your range/i.test(sugg) && /You improved on \$\{exerciseName\} in most sessions last block/.test(sugg))

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`${failures} block-weight check(s) FAILED.`); process.exit(1) }
console.log('A weight written across a block keeps the deload a deload.')
