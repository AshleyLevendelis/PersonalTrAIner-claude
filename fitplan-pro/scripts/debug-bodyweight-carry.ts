import { EXERCISE_DATABASE } from '../src/lib/exercise-db'
import { generateExercisePlan } from '../src/lib/exercise-plan'
import type { UserProfile } from '../src/lib/types'

/**
 * Debug script to trace why bodyweight + combat isn't including carry exercises
 */

const testProfile: UserProfile = {
  id: 'debug-test',
  age: 30,
  gender: 'male',
  height_cm: 178,
  weight_kg: 80,
  activity_level: 'moderate',
  fitness_goal: 'hypertrophy',
  preferred_time: 'morning',
  bmr: 1800,
  tdee: 2500,
  equipment_access: 'bodyweight',
  injuries: [],
  training_style: 'combat',
  session_duration_preference: '45-60',
  workout_split_preference: 'ai_recommendation',
  training_days: [
    { day: 'Monday', available: true },
    { day: 'Tuesday', available: true },
    { day: 'Wednesday', available: false },
    { day: 'Thursday', available: true },
    { day: 'Friday', available: true },
    { day: 'Saturday', available: false },
    { day: 'Sunday', available: false },
  ],
  weekly_schedule: {},
  dietary_preferences: [],
  concurrent_activities: [],
  exercise_exclusions: [],
  training_time_preference: 'morning',
  macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive',
  created_at: new Date().toISOString(),
} as UserProfile

console.log('='.repeat(80))
console.log('DEBUG: Bodyweight + Combat Exercise Selection')
console.log('='.repeat(80))
console.log('')

// Check what bodyweight exercises are in the database
const bodyweightExercises = EXERCISE_DATABASE.filter(e => e.equipment.includes('bodyweight'))
console.log(`Total exercises with bodyweight equipment: ${bodyweightExercises.length}`)
console.log('')

// Check bodyweight carry exercises specifically
const bodyweightCarries = bodyweightExercises.filter(e => e.movement_pattern === 'carry')
console.log(`Bodyweight carry exercises: ${bodyweightCarries.length}`)
for (const ex of bodyweightCarries) {
  console.log(`  - ${ex.name} (tier: ${ex.mechanics_tier}, tags: ${ex.style_tags.join(', ')})`)
}
console.log('')

// Check style config
const STYLE_CONFIGS = {
  combat: {
    setRange: { tier1: 4, tier2: 3, tier3: 3 },
    repRange: { tier1: '3-5', tier2: '6-8', tier3: '12-15' },
    restSeconds: { tier1: 75, tier2: 60, tier3: 45 },
    conditioningRatio: 0.25,
    requiresPatterns: ['core', 'carry'],
  },
}
console.log(`Combat style requires patterns: ${STYLE_CONFIGS.combat.requiresPatterns.join(', ')}`)
console.log(`Bodyweight equipment + no injuries should relax 'carry' requirement`)
console.log('')

// Generate the plan
console.log('Generating exercise plan...')
const { plan, constraint_trace } = generateExercisePlan(testProfile)

console.log('')
console.log(`Generated plan with ${plan.length} training days`)
console.log('')

// Check if any exercises have 'carry' pattern
for (const day of plan) {
  const carries = day.exercises.filter(e => {
    const entry = EXERCISE_DATABASE.find(ex => ex.name === e.name)
    return entry?.movement_pattern === 'carry'
  })
  console.log(`${day.day} (${day.focus}): ${carries.length} carry exercises out of ${day.exercises.length}`)
  if (carries.length > 0) {
    for (const carry of carries) {
      console.log(`    - ${carry.name}`)
    }
  }
}

console.log('')
console.log('Constraint Trace:')
console.log(`  Equipment filtered: ${constraint_trace.equipment_filtered.length}`)
console.log(`  Injury filtered: ${constraint_trace.injury_filtered.length}`)
console.log(`  Style filtered: ${constraint_trace.style_filtered.length}`)
console.log(`  Time cap adjusted: ${constraint_trace.time_cap_adjusted.length}`)
console.log(`  Pool size by stage: ${JSON.stringify(constraint_trace.pool_size_after_each_stage)}`)

console.log('')
console.log('='.repeat(80))
