// The four personas of his 13 Nov 2026 strategy, slice 3 (docs/plans/pathway.md).
// Shared by measure:pathway-personas (prints the first four weeks) and test:pathway.
import type { UserProfile } from '../src/lib/types'

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const days = (chosen: string[]) => ALL_DAYS.map(d => ({ day: d, available: chosen.includes(d) }))

function base(over: Partial<UserProfile>): UserProfile {
  return {
    age: 40, gender: 'female', height_cm: 168, weight_kg: 75,
    activity_level: 'sedentary', fitness_goal: 'fat_loss', start_preference: 'move_more',
    training_days: days(['Monday', 'Wednesday', 'Friday']),
    preferred_time: 'morning', dietary_preferences: [],
    session_duration_preference: '30-45', workout_split_preference: 'ai_recommendation',
    macro_calculation_mode: 'STANDARD_STATIC', equipment_access: 'bodyweight',
    training_style: 'functional', training_experience: 'beginner',
    coaching_persona: 'supportive', injuries: [],
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...over,
  } as UserProfile
}

export const PERSONAS: { key: string; who: string; profile: UserProfile }[] = [
  { key: 'p62-knee', who: '62, never exercised, sore knee',
    profile: base({ age: 62, injuries: ['knees'], gender: 'female' }) },
  { key: 'p50-desk', who: '50, desk job',
    profile: base({ age: 50, gender: 'male', weight_kg: 88, equipment_access: 'full_gym' }) },
  { key: 'p45-runner', who: '45, returning runner',
    profile: base({ age: 45, gender: 'male', weight_kg: 78, training_experience: 'intermediate', activity_level: 'lightly_active',
      fitness_goal: 'conditioning', start_preference: undefined, equipment_access: 'full_gym', session_duration_preference: '45-60' }) },
  { key: 'p68-lifter', who: '68, lifting three times a week',
    profile: base({ age: 68, gender: 'male', weight_kg: 80, training_experience: 'intermediate', activity_level: 'moderately_active',
      fitness_goal: 'hypertrophy', start_preference: undefined, equipment_access: 'full_gym', training_style: 'hybrid',
      session_duration_preference: '45-60' }) },
]
