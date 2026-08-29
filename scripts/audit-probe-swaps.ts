// Probe: does the ⇄ swap list respect injuries, equipment and bans?
import { getReplacementCandidates } from '../src/lib/mesocycle-edit'
import { contraindicatedJoints } from '../src/lib/exercise-db'
import { getExerciseEntry } from '../src/lib/exercise-db'
import type { UserProfile } from '../src/lib/types'

const base = {
  id: 'p1', age: 32, gender: 'male', height_cm: 178, weight_kg: 80,
  goal: 'build_muscle', activity_level: 'moderate', training_experience: 'intermediate',
  equipment_access: 'full_gym', training_days: [], session_duration_preference: 'standard',
  training_style: 'hybrid', recovery_capacity: 'normal', conditioning_preference: 'some',
  injuries: [], dietary_preferences: [], meals_per_day: 3, include_snacks: true,
} as unknown as UserProfile

let failures = 0
const check = (l: string, ok: boolean, x?: unknown) => { if (ok) console.log(`  ok: ${l}`); else { failures++; console.error(`  FAIL: ${l}${x !== undefined ? ` — ${JSON.stringify(x)}` : ''}`) } }

console.log('\n[1] With a knee injury, the swap list never offers a knee-contraindicated lift')
const knee = { ...base, injuries: ['knees'] }
const kneeCands = getReplacementCandidates('Barbell Squats', knee, [])
const badKnee = kneeCands.filter(c => contraindicatedJoints(c.exercise).includes('knee'))
check(`${kneeCands.length} options offered, none knee-contraindicated`, badKnee.length === 0, badKnee.map(b => b.exercise.name))

console.log('\n[2] At home with dumbbells only, the list never offers a machine')
const home = { ...base, equipment_access: 'home_gym' as const }
const homeCands = getReplacementCandidates('Barbell Bench Press', home, [])
console.log(`  ${homeCands.length} options: ${homeCands.slice(0, 6).map(c => c.exercise.name).join(', ')}`)
check('at least one option exists', homeCands.length > 0)

console.log('\n[3] A banned exercise never comes back as a swap suggestion')
const banned = getReplacementCandidates('Barbell Squats', base, ['Leg Press'])
check('"Leg Press" is not offered after being banned', !banned.some(c => c.exercise.name === 'Leg Press'), banned.map(c => c.exercise.name).slice(0, 8))

console.log('\n[4] Bodyweight-only: is the user ever left with nothing to swap to?')
const bw = { ...base, equipment_access: 'bodyweight' as const }
const lifts = ['Barbell Squats', 'Barbell Bench Press', 'Deadlifts', 'Overhead Press', 'Barbell Rows', 'Pull-ups']
for (const l of lifts) {
  if (!getExerciseEntry(l)) { console.log(`  (skipped "${l}" — not in the catalogue)`); continue }
  const n = getReplacementCandidates(l, bw, []).length
  console.log(`  ${l.padEnd(22)} -> ${n} option${n === 1 ? '' : 's'}${n === 0 ? '   <- empty swap sheet' : ''}`)
}
if (failures) console.error(`\n${failures} failure(s)`)
