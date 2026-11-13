// The three running personas of his 13 Nov 2026 strategy, slice 6 (docs/plans/running.md, R4).
// Shared by measure:running-personas (prints the first eight weeks) and test:running-ladder.
import type { UserProfile } from '../src/lib/types'

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const days = (chosen: string[]) => ALL_DAYS.map(d => ({ day: d, available: chosen.includes(d) }))

function base(over: Partial<UserProfile>): UserProfile {
  return {
    age: 40, gender: 'male', height_cm: 178, weight_kg: 80,
    activity_level: 'lightly_active', fitness_goal: 'conditioning',
    training_days: days(['Monday', 'Wednesday', 'Friday', 'Saturday']),
    preferred_time: 'morning', dietary_preferences: [],
    session_duration_preference: '45-60', workout_split_preference: 'ai_recommendation',
    macro_calculation_mode: 'STANDARD_STATIC', equipment_access: 'full_gym',
    training_style: 'hybrid', training_experience: 'intermediate',
    coaching_persona: 'supportive', injuries: [],
    recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
    ...over,
  } as UserProfile
}

export const RUNNERS: { key: string; who: string; profile: UserProfile }[] = [
  { key: 'r45-half', who: '45, returning runner, aiming at a half, runs 30 minutes now, five days',
    profile: base({ age: 45, running_goal: 'half', running_base_minutes: 30,
      training_days: days(['Monday', 'Tuesday', 'Thursday', 'Saturday', 'Sunday']) }) },
  { key: 'r30-5k', who: '30, couch to 5 km, four days',
    profile: base({ age: 30, gender: 'female', weight_kg: 66, training_experience: 'beginner', fitness_goal: 'fat_loss',
      running_goal: '5k', training_days: days(['Monday', 'Tuesday', 'Thursday', 'Saturday']) }) },
  { key: 'r68-20', who: '68, starting out, to 20 minutes non-stop, three days',
    profile: base({ age: 68, gender: 'female', weight_kg: 70, training_experience: 'beginner', activity_level: 'sedentary',
      fitness_goal: 'fat_loss', start_preference: 'move_more', equipment_access: 'bodyweight', training_style: 'functional',
      session_duration_preference: '30-45', running_goal: 'run_20', training_days: days(['Monday', 'Wednesday', 'Friday']) }) },
]
