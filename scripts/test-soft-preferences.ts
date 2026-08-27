/**
 * Gate: a soft preference is a LEAN, and something actually reads it.
 *
 * Found by tracing where onboarding/chat answers end up: "I prefer chicken to
 * fish", "not a fan of burpees but I'll do them" were recorded, compiled by
 * compileSoftExercisePreferences / compileSoftFoodPreferences — and read by
 * NOTHING. Zero call sites outside the file defining them. Worse, the comment
 * above the exercise one said "scoped to swap-candidate ranking only
 * (mesocycle-edit.getReplacementCandidates)", describing a consumer that did
 * not exist. A truthful-looking comment over dead code is how the next person
 * gets misled.
 *
 * VISION-ARCHITECTURE.md §1.2 had already decided the behaviour — soft
 * exercise preferences rank `getReplacementCandidates` and leave rotation
 * alone — so wiring it executes an existing decision rather than inventing
 * one.
 *
 * The invariant that matters: it REORDERS, it never REMOVES. A lean is not a
 * ban; someone who asks for a swap may still pick the thing they said they
 * were lukewarm about.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getReplacementCandidates } from '../src/lib/mesocycle-edit'
import { compileSoftExercisePreferences } from '../src/lib/fact-compiler'
import type { UserProfile } from '../src/lib/types'
import type { UserFactRow } from '../src/lib/memory-store'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
let failures = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}
const profile = {
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '60-90',
  workout_split_preference: 'upper_lower',
  training_days: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day, i) => ({ day, available: i < 4 })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
} as unknown as UserProfile

console.log('\n1. The compiler has a real consumer now')
{
  const meso = readFileSync(join(ROOT, 'src/lib/mesocycle-edit.ts'), 'utf8')
  check('getReplacementCandidates accepts soft preferences', /soft\?: \{ liked: string\[\]; disliked: string\[\] \}/.test(meso))
  // The point of the fix: it must be READ, not merely accepted.
  const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8')
  check('App compiles them from memory', /compileSoftExercisePreferences\(memoryFacts\)/.test(app))
  check('...and passes them down', /softExercisePreferences=\{compiledSoftExercisePreferences\}/.test(app))
  for (const rel of ['src/components/exercise/ExerciseTab.tsx', 'src/components/ExercisePlan.tsx', 'src/components/exercise/SwapDialog.tsx']) {
    check(`${rel.split('/').pop()} carries them through`, /softExercisePreferences/.test(readFileSync(join(ROOT, rel), 'utf8')))
  }
  check('the swap list is actually asked with them',
    /getReplacementCandidates\([^)]*softExercisePreferences\)/.test(readFileSync(join(ROOT, 'src/components/ExercisePlan.tsx'), 'utf8')))
}

console.log('\n2. It REORDERS and never REMOVES')
{
  const baseline = getReplacementCandidates('Barbell Bench Press', profile, [])
  check('there are candidates to rank', baseline.length > 2, baseline.length)
  const names = baseline.map(c => c.exercise.name)
  const last = names[names.length - 1]
  const first = names[0]

  const liked = getReplacementCandidates('Barbell Bench Press', profile, [], { liked: [last], disliked: [] })
  check('a liked movement moves to the front', liked[0].exercise.name === last, liked.slice(0, 2).map(c => c.exercise.name))
  check('...and nothing is lost', liked.length === baseline.length, [liked.length, baseline.length])

  const disliked = getReplacementCandidates('Barbell Bench Press', profile, [], { liked: [], disliked: [first] })
  check('a disliked movement sinks', disliked[disliked.length - 1].exercise.name === first)
  // THE line between soft and hard. A ban belongs in exclusions; a lean must
  // still leave the option on the table.
  check('...but is STILL OFFERED — a lean is not a ban',
    disliked.some(c => c.exercise.name === first) && disliked.length === baseline.length)

  const empty = getReplacementCandidates('Barbell Bench Press', profile, [], { liked: [], disliked: [] })
  check('no preferences changes nothing', JSON.stringify(empty.map(c => c.exercise.name)) === JSON.stringify(names))
  const omitted = getReplacementCandidates('Barbell Bench Press', profile, [])
  check('omitting the argument changes nothing', JSON.stringify(omitted.map(c => c.exercise.name)) === JSON.stringify(names))
}

console.log('\n3. Only SOFT facts reach it — hard ones are a different channel')
{
  const facts = [
    { kind: 'exercise_preference', polarity: 'dislike', hardness: 'hard', resolved_refs: ['Burpees'], retired_at: null },
    { kind: 'exercise_preference', polarity: 'dislike', hardness: 'soft', resolved_refs: ['Lunges'], retired_at: null },
    { kind: 'exercise_preference', polarity: 'like', hardness: 'soft', resolved_refs: ['Pull-Ups'], retired_at: null },
  ] as unknown as UserFactRow[]
  const soft = compileSoftExercisePreferences(facts)
  check('a soft dislike is picked up', soft.disliked.includes('Lunges'))
  check('a soft like is picked up', soft.liked.includes('Pull-Ups'))
  // A hard dislike must never arrive here — it is an EXCLUSION, and ranking it
  // down instead of removing it would leave a banned movement on offer.
  check('a HARD dislike does not leak into ranking', !soft.disliked.includes('Burpees'), soft.disliked)
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll soft-preference checks passed.\n')
