import { generateExercisePlan } from './src/lib/exercise-plan'
import type { UserProfile } from './src/lib/types'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function makeDays(available: string[]) {
  return DAYS.map(day => ({ day, available: available.includes(day) }))
}

const profiles: { label: string; header: string; profile: UserProfile }[] = [
  {
    label: 'A',
    header: '5 Days | PPL | 30-45 Mins | Morning',
    profile: {
      age: 28, gender: 'male', height_cm: 178, weight_kg: 75,
      activity_level: 'active', fitness_goal: 'build_muscle',
      training_days: makeDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
      preferred_time: 'morning',
      session_duration_preference: '30-45',
      training_time_preference: 'morning',
      workout_split_preference: 'ppl',
    },
  },
  {
    label: 'B',
    header: '2 Days | Full Body | 90+ Mins | Evening',
    profile: {
      age: 40, gender: 'female', height_cm: 165, weight_kg: 62,
      activity_level: 'moderate', fitness_goal: 'maintain',
      training_days: makeDays(['Tuesday', 'Saturday']),
      preferred_time: 'evening',
      session_duration_preference: '90+',
      training_time_preference: 'evening',
      workout_split_preference: 'full_body',
    },
  },
  {
    label: 'C',
    header: '4 Days | Body Part Split | 45-60 Mins | Midday',
    profile: {
      age: 25, gender: 'male', height_cm: 183, weight_kg: 88,
      activity_level: 'active', fitness_goal: 'build_muscle',
      training_days: makeDays(['Monday', 'Tuesday', 'Thursday', 'Friday']),
      preferred_time: 'morning',
      session_duration_preference: '45-60',
      training_time_preference: 'midday',
      workout_split_preference: 'bro_split',
    },
  },
  {
    label: 'D',
    header: '3 Days | AI Choice | 60-90 Mins | Varies',
    profile: {
      age: 33, gender: 'female', height_cm: 170, weight_kg: 68,
      activity_level: 'moderate', fitness_goal: 'lose_weight',
      training_days: makeDays(['Monday', 'Wednesday', 'Friday']),
      preferred_time: 'evening',
      session_duration_preference: '60-90',
      training_time_preference: 'varies',
      workout_split_preference: 'ai_recommendation',
    },
  },
]

for (const { label, header, profile } of profiles) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  TEST PROFILE ${label}: ${header}`)
  console.log(`${'='.repeat(60)}`)

  const { plan } = generateExercisePlan(profile)

  const output = plan.map(day => ({
    day: day.day,
    focus: day.focus,
    exercise_count: day.exercises.length,
    exercises: day.exercises.map(ex => ({
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      rest: ex.rest,
      ...(ex.superset_label ? { superset: ex.superset_label } : {}),
      ...(ex.substitution ? { sub: ex.substitution } : {}),
    })),
  }))

  console.log(JSON.stringify(output, null, 2))
}
