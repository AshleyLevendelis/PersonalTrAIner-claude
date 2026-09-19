// ---------------------------------------------------------------------------
// THE GRID — one definition, imported by every script that sweeps it.
// ---------------------------------------------------------------------------
// Lifted out of run-quality-score.ts on 18 Sep 2026, unchanged, when a second
// sweep (the weekly-volume measurement) needed the same 9,216 combinations.
//
// EXTRACTED RATHER THAN COPIED, because a copy is how two measurements of the
// same question end up with different denominators and disagree by an order of
// magnitude — which has already happened once here, with pattern coverage
// (9.03% against the scorer's own reading of nothing, the whole gap being one
// guard the new script did not have). A second enumeration would drift the
// moment either file gained a dimension, and nothing would say so.
//
// run-quality-score.ts keeps `--serial`, which re-runs the grid on one process
// and compares reports, so a change here that reordered or dropped a
// combination would surface there rather than silently.

import type {
  UserProfile, EquipmentAccess, TrainingStyle, SessionDuration, TrainingExperience,
  FitnessGoal, RecoveryCapacity, ConditioningPreference,
} from '../src/lib/types'
import {
  ALL_EQUIPMENT, ALL_DURATIONS, ALL_STYLES, ALL_EXPERIENCE, getInjuryCombinations,
} from '../src/lib/dev-constraint-audit'

export const ALL_GOALS: FitnessGoal[] = ['hypertrophy', 'fat_loss', 'conditioning', 'functional']
export const ALL_RECOVERY: RecoveryCapacity[] = ['low', 'moderate', 'high']
export const ALL_CONDITIONING_PREF: ConditioningPreference[] = ['love', 'tolerate', 'avoid']

export interface Combination {
  equipment: EquipmentAccess
  injuries: string[]
  duration: SessionDuration
  style: TrainingStyle
  experience: TrainingExperience
  goal: FitnessGoal
  recovery: RecoveryCapacity
  conditioningPref: ConditioningPreference
}

export function buildProfile(combo: Combination): UserProfile {
  return {
    age: 30,
    gender: 'male',
    height_cm: 178,
    weight_kg: 80,
    activity_level: 'moderate',
    fitness_goal: combo.goal,
    preferred_time: 'morning',
    bmr: 1800,
    tdee: 2500,
    equipment_access: combo.equipment,
    injuries: combo.injuries,
    training_style: combo.style,
    training_experience: combo.experience,
    session_duration_preference: combo.duration,
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
    macro_calculation_mode: 'STANDARD_STATIC',
    coaching_persona: 'supportive',
    recovery_capacity: combo.recovery,
    conditioning_preference: combo.conditioningPref,
    // No `id` — keeps any Supabase-dependent code path (logged-history
    // lookups) untouched during a plain-Node scoring run.
  }
}

export function comboKey(combo: Combination): string {
  return [
    combo.equipment, combo.injuries.join('+') || 'none', combo.duration, combo.style,
    combo.experience, combo.goal, combo.recovery, combo.conditioningPref,
  ].join('|')
}

export function comboLabel(combo: Combination): string {
  return `${combo.equipment} / ${combo.injuries.join('+') || 'none'} / ${combo.duration} / ${combo.style} / ${combo.experience} / ${combo.goal} / recovery=${combo.recovery} / cardio=${combo.conditioningPref}`
}

export function generateAllCombinations(): Combination[] {
  const injuryCombinations = getInjuryCombinations()
  const combos: Combination[] = []
  let rotationIndex = 0
  for (const equipment of ALL_EQUIPMENT) {
    for (const injuries of injuryCombinations) {
      for (const duration of ALL_DURATIONS) {
        for (const style of ALL_STYLES) {
          for (const experience of ALL_EXPERIENCE) {
            for (const goal of ALL_GOALS) {
              combos.push({
                equipment, injuries, duration, style, experience, goal,
                recovery: ALL_RECOVERY[rotationIndex % ALL_RECOVERY.length],
                conditioningPref: ALL_CONDITIONING_PREF[Math.floor(rotationIndex / ALL_RECOVERY.length) % ALL_CONDITIONING_PREF.length],
              })
              rotationIndex++
            }
          }
        }
      }
    }
  }
  return combos
}
