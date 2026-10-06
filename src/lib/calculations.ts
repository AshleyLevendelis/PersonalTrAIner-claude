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
 * Which week of the mesocycle is "live" today, counted from the DAY the plan began
 * (C0 Part 6: the anchor is the mesocycle's creation time from mesocycle_weeks —
 * falling back to profile creation only for legacy profiles with no persisted
 * mesocycle). `totalWeeks` must reflect the ACTUAL mesocycle length (block count × 4).
 *
 * A DATE BELONGS TO EXACTLY ONE WEEK, AND THE WEEK CHANGES AT LOCAL MIDNIGHT (Ashley's
 * ruling, 6 Oct 2026, from three options: "the day you started"). A plan begun on a
 * Thursday has weeks that run Thursday to Wednesday, and the new week is already running at
 * 00:00 on the Thursday, whatever time of day the plan was made.
 *
 * This used to count 24-hour blocks from the creation TIMESTAMP, so a plan made on
 * Thursday at 18:30 moved to week 2 the next Thursday at 18:30: that Thursday was week 1
 * at noon and week 2 at 23:30, and the callers that asked "now", "noon of the date" and
 * "the stamp taken this morning" got different answers about one date. A millisecond count
 * also drifts an hour across a clock change. Whole LOCAL calendar days cannot do either,
 * so the answer depends on the date asked about and nothing else.
 *
 * Past the final week the result CLAMPS at totalWeeks rather than wrapping
 * back to week 1 (landmine L5: the old modulo silently restarted the cycle —
 * week-1 calibration loads, "week 1 of N" labels — for a trainee who'd
 * finished it). Post-cycle regeneration is a Phase B / coach concern. A date before
 * the plan, a missing start and an unreadable one are all week 1.
 */
export function getActiveMesocycleWeek(planCreatedAt: string | undefined, now?: Date, totalWeeks: number = 4): number {
  if (!planCreatedAt) return 1
  const start = new Date(planCreatedAt)
  const current = now ?? new Date()
  if (Number.isNaN(start.getTime()) || Number.isNaN(current.getTime())) return 1
  // Each local date as a UTC midnight, so the difference is whole days however the clocks moved.
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const currentDay = Date.UTC(current.getFullYear(), current.getMonth(), current.getDate())
  const elapsedDays = Math.round((currentDay - startDay) / (1000 * 60 * 60 * 24))
  const weeks = Math.max(1, totalWeeks)
  const weekIndex = Math.min(Math.max(0, Math.floor(elapsedDays / 7)), weeks - 1)
  return weekIndex + 1
}