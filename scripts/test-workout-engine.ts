import { generateExercisePlan } from '../src/lib/exercise-plan'
import type { UserProfile } from '../src/lib/types'

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function makeTrainingDays(availableDays: string[]): UserProfile['training_days'] {
  return DAYS_OF_WEEK.map(day => ({
    day,
    available: availableDays.includes(day),
  }))
}

const profiles: { label: string; name: string; constraints: string; profile: UserProfile }[] = [
  {
    label: 'A',
    name: 'Time-Crunched PPL',
    constraints: '5 Days | PPL | 30-45 Mins',
    profile: {
      age: 32,
      gender: 'male',
      height_cm: 178,
      weight_kg: 82,
      activity_level: 'active',
      fitness_goal: 'build_muscle',
      training_days: makeTrainingDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
      preferred_time: 'morning',
      dietary_preferences: [],
      session_duration_preference: '30-45',
      training_time_preference: 'morning',
      workout_split_preference: 'ppl',
    },
  },
  {
    label: 'B',
    name: 'Minimal Full Body',
    constraints: '2 Days | Full Body | 90+ Mins',
    profile: {
      age: 45,
      gender: 'female',
      height_cm: 165,
      weight_kg: 68,
      activity_level: 'moderate',
      fitness_goal: 'maintain',
      training_days: makeTrainingDays(['Tuesday', 'Thursday']),
      preferred_time: 'evening',
      dietary_preferences: [],
      session_duration_preference: '90+',
      training_time_preference: 'evening',
      workout_split_preference: 'full_body',
    },
  },
  {
    label: 'C',
    name: 'Hypertrophy Bro Split',
    constraints: '4 Days | Bro Split | 45-60 Mins',
    profile: {
      age: 27,
      gender: 'male',
      height_cm: 183,
      weight_kg: 90,
      activity_level: 'very_active',
      fitness_goal: 'build_muscle',
      training_days: makeTrainingDays(['Monday', 'Tuesday', 'Thursday', 'Friday']),
      preferred_time: 'evening',
      dietary_preferences: [],
      session_duration_preference: '45-60',
      training_time_preference: 'evening',
      workout_split_preference: 'bro_split',
    },
  },
  {
    label: 'D',
    name: 'AI Choice Weight Loss',
    constraints: '3 Days | AI Choice | 60-90 Mins',
    profile: {
      age: 38,
      gender: 'female',
      height_cm: 170,
      weight_kg: 72,
      activity_level: 'light',
      fitness_goal: 'lose_weight',
      training_days: makeTrainingDays(['Monday', 'Wednesday', 'Friday']),
      preferred_time: 'morning',
      dietary_preferences: [],
      session_duration_preference: '60-90',
      training_time_preference: 'morning',
      workout_split_preference: 'ai_recommendation',
    },
  },
]

const HEADER = '='.repeat(72)
const DIVIDER = '-'.repeat(72)

function formatPairing(ex: { superset_label?: string }, idx: number, total: number): string {
  if (ex.superset_label) return `SS-${ex.superset_label}`
  if (idx === 0 && total > 4) return 'Primer'
  if (idx === total - 1 && total > 4) return 'Finisher'
  return 'Straight'
}

console.log(`\n${HEADER}`)
console.log(`  WORKOUT ENGINE - COACH'S LEDGER`)
console.log(HEADER)

for (const { label, name, constraints, profile } of profiles) {
  const { plan } = generateExercisePlan(profile, [])
  const dayCount = profile.training_days.filter(d => d.available).length

  console.log(`\n${HEADER}`)
  console.log(`  PROFILE ${label}: ${name}`)
  console.log(`  ${constraints} | ${dayCount} active days/wk`)
  console.log(HEADER)

  for (const day of plan) {
    console.log(`\n  ${day.day.toUpperCase()} - ${day.focus}`)
    console.log(`  ${'#'.padEnd(4)}${'Exercise'.padEnd(32)}${'Sets'.padEnd(6)}${'Reps'.padEnd(10)}${'Rest'.padEnd(10)}${'Pairing'}`)
    console.log(`  ${DIVIDER.slice(0, 68)}`)

    day.exercises.forEach((ex, i) => {
      const num = `${i + 1}.`.padEnd(4)
      const exName = ex.name.slice(0, 30).padEnd(32)
      const sets = `${ex.sets}`.padEnd(6)
      const reps = ex.reps.padEnd(10)
      const rest = ex.rest.padEnd(10)
      const pairing = formatPairing(ex, i, day.exercises.length)
      console.log(`  ${num}${exName}${sets}${reps}${rest}${pairing}`)
    })
  }
}

console.log(`\n${HEADER}`)
console.log(`  LEDGER COMPLETE`)
console.log(`${HEADER}\n`)
