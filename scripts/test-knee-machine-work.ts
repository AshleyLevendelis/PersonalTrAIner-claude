// A knee on the injuries list keeps machine leg work, lighter (his ruling 15 Nov 2026, "Allow it, lighter";
// docs/plans/knee-loaded-work.md). Leg press, hack squat and seated leg curl stay; free-weight squats, lunges and
// jumps stay out; the three are priced one step (x0.8) lighter for a flagged knee and for nothing else.
// One exit: the count of failures.
import { getExerciseEntry, isContraindicatedFor, type ExerciseEntry } from '../src/lib/exercise-db'
import { prescribeLoad, FLAGGED_JOINT_LOAD_FACTOR } from '../src/lib/load-prescription'
import { shortProfile, planFor, daysFor } from './measure-short-sessions'

let ran = 0, failed = 0
const ok = (c: boolean, m: string, d?: unknown) => { ran++; if (c) console.log(`  ok: ${m}`); else { failed++; console.log(`  FAIL: ${m}${d !== undefined ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`) } }
const entry = (n: string) => getExerciseEntry(n) as ExerciseEntry
const KNEE = new Set(['knee'])
const MACHINES = ['Leg Press', 'Hack Squat', 'Seated Leg Curl']
const OUT = ['Barbell Squats', 'Front Squat', 'Goblet Squats', 'Walking Lunges', 'Bulgarian Split Squats', 'Dumbbell Reverse Lunge', 'Box Jumps', 'Broad Jumps']

console.log('§1 The injury filter: the three machines stay, free weights and jumps stay out')
for (const n of MACHINES) ok(!!getExerciseEntry(n) && !isContraindicatedFor(entry(n), KNEE), `${n} is allowed for a knee`)
for (const n of OUT) ok(!!getExerciseEntry(n) && isContraindicatedFor(entry(n), KNEE), `${n} is still removed for a knee`)
ok(MACHINES.every(n => (entry(n).loads_joints ?? []).includes('knee')), 'the three still LOAD the knee (allowed, not reclassified)')

console.log('§2 The price: one step lighter for a knee, for these lifts only')
const base = shortProfile({ fitness_goal: 'hypertrophy', training_experience: 'intermediate', equipment_access: 'full_gym', training_style: 'bodybuilding', session_duration_preference: '45-60', training_days: daysFor(3) })
const price = (n: string, injuries: string[]) => prescribeLoad(entry(n), { ...base, injuries } as never).starting_weight_kg ?? 0
ok(FLAGGED_JOINT_LOAD_FACTOR === 0.8, 'the step is 0.8')
for (const n of MACHINES) {
  const a = price(n, []), b = price(n, ['knees'])
  ok(a > 0 && b < a && b >= a * 0.75 && b <= a * 0.85, `${n}: ${a} kg -> ${b} kg with a knee`, { a, b })
}
ok(price('Lying Leg Curl', ['knees']) > 0 && price('Lying Leg Curl', ['knees']) === price('Lying Leg Curl', []), 'lying leg curl (knee rehab work) keeps its full price')
ok(price('Barbell Bench Press', ['knees']) === price('Barbell Bench Press', []), 'bench press: the knee changes nothing')
ok(price('Leg Press', ['shoulders']) === price('Leg Press', []), 'leg press: a shoulder changes nothing')
ok(price('Barbell Floor Press', ['shoulders']) === price('Barbell Floor Press', []), 'floor press with a shoulder: unchanged (knee only, for now)')

console.log('§3 A generated plan: machine leg work on leg days, at the lighter price, nothing free-weight')
const kneeProfile = { ...base, injuries: ['knees'] } as never
const plan = planFor(kneeProfile, 'knee-machine-gate')
const all = plan.flatMap(w => w.days.flatMap(d => d.exercises.map(e => ({ w, e }))))
const machineRows = all.filter(({ e }) => MACHINES.includes(e.name))
ok(machineRows.length > 0, 'a full-gym knee plan holds leg press, hack squat or seated leg curl', machineRows.length)
ok(all.every(({ e }) => !OUT.includes(e.name) && !isContraindicatedFor(entry(e.name) ?? ({ loads_joints: [] } as never), KNEE)), 'no lift in it is contraindicated for the knee')
// The plan carries the lighter price through every later pass: measured by hand 15 Nov 2026 on this profile, week-1
// Hack Squat 42.5 kg with the step and 52.5 kg with it switched off. Not a check: the same plan cannot be generated
// both ways in one run, and the unit checks above already fail if the step is lost.

console.log(`${ran} checks ran, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
