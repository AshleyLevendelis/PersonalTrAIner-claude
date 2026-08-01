import type { UserProfile } from './types'

export interface TestArchetype {
  id: string
  label: string
  description: string
  profile: UserProfile
}

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function makeDays(availableDays: string[]): UserProfile['training_days'] {
  return ALL_DAYS.map(day => ({ day, available: availableDays.includes(day) }))
}

export const MOCK_TEST_PROFILES: TestArchetype[] = [
  {
    id: 'powerlifter',
    label: 'The Powerlifter',
    description: 'Maximum strength, 90+ min sessions, Push/Pull/Legs split, heavy compound focus.',
    profile: {
      age: 28,
      gender: 'male',
      height_cm: 183,
      weight_kg: 95,
      activity_level: 'very_active',
      fitness_goal: 'hypertrophy',
      training_days: makeDays(['Monday', 'Tuesday', 'Wednesday', 'Friday', 'Saturday']),
      preferred_time: 'morning',
      dietary_preferences: [],
      session_duration_preference: '90+',
      workout_split_preference: 'ppl',
      macro_calculation_mode: 'DYNAMIC_CSCS',
      equipment_access: 'full_gym',
      training_style: 'bodybuilding',
      training_experience: 'intermediate',
      coaching_persona: 'drill_sergeant',
      recovery_capacity: 'high',
      conditioning_preference: 'tolerate',
      injuries: [],
    },
  },
  {
    id: 'busy_professional',
    label: 'The Busy Professional',
    description: 'Fat loss, 30-45 min sessions, Upper/Lower split, functional movements.',
    profile: {
      age: 35,
      gender: 'female',
      height_cm: 165,
      weight_kg: 68,
      activity_level: 'light',
      fitness_goal: 'fat_loss',
      training_days: makeDays(['Monday', 'Wednesday', 'Thursday', 'Saturday']),
      preferred_time: 'morning',
      dietary_preferences: ['high_protein', 'low_carb'],
      session_duration_preference: '30-45',
      workout_split_preference: 'upper_lower',
      macro_calculation_mode: 'DYNAMIC_CSCS',
      equipment_access: 'full_gym',
      training_style: 'functional',
      training_experience: 'beginner',
      coaching_persona: 'analytical',
      recovery_capacity: 'low',
      conditioning_preference: 'tolerate',
      injuries: [],
    },
  },
  {
    id: 'athlete',
    label: 'The High-Output Athlete',
    description: 'Endurance & stamina, 60 min sessions, AI-recommended split, metabolic conditioning.',
    profile: {
      age: 24,
      gender: 'male',
      height_cm: 178,
      weight_kg: 75,
      activity_level: 'active',
      fitness_goal: 'conditioning',
      training_days: makeDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']),
      preferred_time: 'evening',
      dietary_preferences: [],
      session_duration_preference: '45-60',
      workout_split_preference: 'ai_recommendation',
      macro_calculation_mode: 'DYNAMIC_CSCS',
      equipment_access: 'full_gym',
      training_style: 'combat',
      training_experience: 'advanced',
      coaching_persona: 'hype',
      recovery_capacity: 'high',
      conditioning_preference: 'love',
      injuries: [],
      concurrent_activities: [
        { name: 'Running', intensity: 7, days: ['Tuesday', 'Saturday'], movement_demands: ['knee_dominant', 'hip_hinge'] },
      ],
    },
  },
  {
    id: 'beginner',
    label: 'The General Fitness Beginner',
    description: 'Health & longevity, 45 min sessions, Full Body split, basic compounds + machines.',
    profile: {
      age: 42,
      gender: 'female',
      height_cm: 160,
      weight_kg: 72,
      activity_level: 'sedentary',
      fitness_goal: 'functional',
      training_days: makeDays(['Monday', 'Wednesday', 'Friday']),
      preferred_time: 'evening',
      dietary_preferences: ['balanced'],
      session_duration_preference: '45-60',
      workout_split_preference: 'full_body',
      macro_calculation_mode: 'STANDARD_STATIC',
      equipment_access: 'full_gym',
      training_style: 'hybrid',
      training_experience: 'novice',
      coaching_persona: 'supportive',
      recovery_capacity: 'moderate',
      conditioning_preference: 'tolerate',
      injuries: ['knees'],
    },
  },
]
