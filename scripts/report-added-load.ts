// ---------------------------------------------------------------------------
// The four lifts that CAN take weight and are never given any.
//
// Ashley's correction, and the reason tempo skips them: a chin-up or a dip
// takes a belt or a loaded backpack, so "there is no weight to add" is false
// for them. Showing no weight there is a gap in this app, not a fact about
// the movement.
//
// This measures the gap. For Pull-Ups, Chin-Ups, Chest Dips and Tricep Dips
// (accepts_added_load in exercise-db.ts), across a whole sixteen-week plan:
// how many slots do they hold, how many carry a weight, and what actually
// happens to them across a block — because "reps fall and nothing else
// changes" is the defect, and the numbers have to show it rather than be
// asserted.
// ---------------------------------------------------------------------------

import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, EquipmentAccess, FitnessGoal, TrainingExperience } from '../src/lib/types'

function buildProfile(o: Partial<UserProfile>): UserProfile {
  return {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
    fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
    equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
    training_experience: 'intermediate', session_duration_preference: '45-60',
    workout_split_preference: 'upper_lower',
    training_days: [
      { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
      { day: 'Wednesday', available: true }, { day: 'Thursday', available: true },
      { day: 'Friday', available: false }, { day: 'Saturday', available: false },
      { day: 'Sunday', available: false },
    ],
    weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
    exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...o,
  } as UserProfile
}

const EQUIP: EquipmentAccess[] = ['full_gym', 'home_gym', 'minimalist', 'bodyweight']
const GOALS: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'conditioning', 'functional']
const EXP: TrainingExperience[] = ['beginner', 'novice', 'intermediate', 'advanced']
const SPLITS = ['upper_lower', 'full_body', 'push_pull_legs'] as const
const BODIES: Array<Partial<UserProfile>> = [
  { gender: 'male', weight_kg: 80 },
  { gender: 'female', weight_kg: 62 },
  { gender: 'male', weight_kg: 110 },
  // The declined-metrics case: whatever this ends up prescribing must never
  // exceed what a stated body of the same shape gets (item-2b invariant).
  { gender: undefined as unknown as UserProfile['gender'], weight_kg: undefined as unknown as number },
]

interface Row { slots: number; withAdded: number; addedValues: number[] }
const byExp = new Map<string, Row>()
const byName = new Map<string, Row>()
const mk = (): Row => ({ slots: 0, withAdded: 0, addedValues: [] })

// "What happens to this lift across a block" — the defect itself.
interface Trace { name: string; exp: string; weeks: string[] }
const traces: Trace[] = []

for (const equipment_access of EQUIP)
  for (const training_experience of EXP) {
    byExp.set(training_experience, byExp.get(training_experience) ?? mk())
    for (const fitness_goal of GOALS)
      for (const workout_split_preference of SPLITS)
        for (const body of BODIES) {
          const profile = buildProfile({ equipment_access, training_experience, fitness_goal, workout_split_preference, ...body } as Partial<UserProfile>)
          setRandomSource(seededRngFromKey(`al:${equipment_access}:${training_experience}:${fitness_goal}:${workout_split_preference}:${body.gender ?? 'none'}:${body.weight_kg ?? 'none'}`))
          const d = console.debug, w = console.warn
          console.debug = () => {}; console.warn = () => {}
          let weeks
          try { weeks = generateMesocycle(profile, generateExercisePlan(profile).plan) }
          finally { console.debug = d; console.warn = w; resetRandomSource() }

          const perLift = new Map<string, string[]>()
          for (const wk of weeks) for (const day of wk.days) for (const ex of day.exercises) {
            const entry = getExerciseEntry(ex.name)
            if (!entry?.accepts_added_load) continue
            const e = byExp.get(training_experience)!
            const n = byName.get(ex.name) ?? mk(); byName.set(ex.name, n)
            e.slots++; n.slots++
            const added = ex.suggested_added_load_kg ?? null
            if (added != null) {
              e.withAdded++; n.withAdded++
              e.addedValues.push(added); n.addedValues.push(added)
            }
            if (!wk.is_deload) {
              const arr = perLift.get(ex.name) ?? []
              arr.push(`w${wk.week_number}:${ex.reps}${added != null ? `@+${added}` : ''}`)
              perLift.set(ex.name, arr)
            }
          }
          if (traces.length < 3 && equipment_access === 'full_gym' && training_experience === 'advanced' && body.weight_kg === 80) {
            for (const [name, arr] of perLift) {
              if (arr.length >= 8 && traces.length < 3) traces.push({ name, exp: training_experience, weeks: arr.slice(0, 12) })
            }
          }
        }
  }

const pct = (n: number, d: number) => d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`
console.log('\nThe four lifts that accept added load — do they ever get any?\n')
console.log('  by experience:')
for (const e of EXP) {
  const r = byExp.get(e)
  if (!r || r.slots === 0) { console.log(`    ${e.padEnd(13)} never appears`); continue }
  console.log(`    ${e.padEnd(13)} ${String(r.slots).padStart(5)} slots   carrying a weight: ${r.withAdded} (${pct(r.withAdded, r.slots)})`)
}
console.log('\n  by exercise:')
for (const [n, r] of [...byName.entries()].sort((a, b) => b[1].slots - a[1].slots)) {
  console.log(`    ${n.padEnd(16)} ${String(r.slots).padStart(5)} slots   carrying a weight: ${r.withAdded} (${pct(r.withAdded, r.slots)})`)
}
console.log('\n  what a block actually does to them (full_gym / advanced / 80kg male, loading weeks only):')
for (const t of traces) console.log(`    ${t.name}\n       ${t.weeks.join('  ')}`)
console.log('')
