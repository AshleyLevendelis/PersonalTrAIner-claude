// Why does a full_gym novice's Lateral Raise go 12-17@6kg -> 13-18@4kg at
// week 9->10? Reproduces the exact combination the frozen-weeks gate names.
import { generateExercisePlan, generateMesocycle, setRandomSource, resetRandomSource } from '../src/lib/exercise-plan'
import { seededRngFromKey } from '../src/lib/seeded-random'
import type { UserProfile, MesocycleWeek } from '../src/lib/types'

const profile = {
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'novice', session_duration_preference: '45-60',
  workout_split_preference: 'push_pull_legs',
  training_days: [
    { day: 'Monday', available: true }, { day: 'Tuesday', available: true },
    { day: 'Wednesday', available: true }, { day: 'Thursday', available: true },
    { day: 'Friday', available: false }, { day: 'Saturday', available: false },
    { day: 'Sunday', available: false },
  ],
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  exercise_exclusions: [], macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
} as unknown as UserProfile

setRandomSource(seededRngFromKey('frozen:full_gym:push_pull_legs:novice'))
const d = console.debug, w = console.warn
console.debug = () => {}; console.warn = () => {}
let plan: MesocycleWeek[]
try { plan = generateMesocycle(profile, generateExercisePlan(profile).plan) }
finally { console.debug = d; console.warn = w; resetRandomSource() }

for (const wk of plan) {
  if (wk.week_number < 8 || wk.week_number > 11) continue
  for (const day of wk.days) {
    for (const ex of day.exercises) {
      if (!/Lateral Raises|Front Raises/.test(ex.name)) continue
      console.log(`wk${String(wk.week_number).padStart(2)} ${wk.is_deload ? 'DELOAD' : '      '} block${wk.block_number ?? '?'} ${day.day.padEnd(10)} ${ex.name.padEnd(16)} ${String(ex.sets)}x${String(ex.reps).padEnd(7)} ${String(ex.suggested_load ?? '').padEnd(12)} rpe=${ex.intensity ?? ''}`)
    }
  }
}
