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
 * the plan was created. `totalWeeks` must reflect the ACTUAL mesocycle length
 * (block count × 4) — hard-coding 4 here wrapped the active week back to 1-4
 * forever, even once `generateMesocycle` started producing 16 weeks across 4
 * blocks, so nobody would ever be shown live week 5+.
 */
export function getActiveMesocycleWeek(planCreatedAt: string | undefined, now?: Date, totalWeeks: number = 4): number {
  if (!planCreatedAt) return 1
  const start = new Date(planCreatedAt)
  const current = now ?? new Date()
  const elapsedMs = current.getTime() - start.getTime()
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24))
  const weeks = Math.max(1, totalWeeks)
  const weekIndex = Math.floor(elapsedDays / 7) % weeks
  return weekIndex + 1
}