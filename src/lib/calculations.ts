import type { ActivityLevel, FitnessGoal } from './types'

export function calculateCalories(protein: number, carbs: number, fat: number): number {
  return (protein * 4) + (carbs * 4) + (fat * 9)
}

export function getActivityLabel(level: ActivityLevel): string {
  const labels: Record<ActivityLevel, string> = {
    sedentary: 'Sedentary (office job, little exercise)',
    light: 'Lightly Active (1-3 days/week)',
    moderate: 'Moderately Active (3-5 days/week)',
    active: 'Very Active (6-7 days/week)',
    very_active: 'Extra Active (athlete/physical job)',
  }
  return labels[level]
}

export function getGoalLabel(goal: FitnessGoal): string {
  const labels: Record<FitnessGoal, string> = {
    fat_loss: 'Fat Loss',
    functional: 'Functional Strength',
    hypertrophy: 'Muscle Growth',
    conditioning: 'Conditioning',
  }
  return labels[goal]
}

/**
 * Which week of the mesocycle is "live" today, based on elapsed time since
 * the PLAN was created (C0 Part 6: the anchor is the mesocycle's creation
 * time from mesocycle_weeks — falling back to profile creation only for
 * legacy profiles with no persisted mesocycle). `totalWeeks` must reflect the
 * ACTUAL mesocycle length (block count × 4).
 *
 * Past the final week the result CLAMPS at totalWeeks rather than wrapping
 * back to week 1 (landmine L5: the old modulo silently restarted the cycle —
 * week-1 calibration loads, "week 1 of N" labels — for a trainee who'd
 * finished it). Post-cycle regeneration is a Phase B / coach concern.
 */
export function getActiveMesocycleWeek(planCreatedAt: string | undefined, now?: Date, totalWeeks: number = 4): number {
  if (!planCreatedAt) return 1
  const start = new Date(planCreatedAt)
  const current = now ?? new Date()
  const elapsedMs = current.getTime() - start.getTime()
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24))
  const weeks = Math.max(1, totalWeeks)
  const weekIndex = Math.min(Math.max(0, Math.floor(elapsedDays / 7)), weeks - 1)
  return weekIndex + 1
}