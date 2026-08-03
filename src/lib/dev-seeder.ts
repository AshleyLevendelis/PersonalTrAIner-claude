import { supabase } from './supabase'
import { writeHistoricalSession, clearAllSetLogs } from './set-log-store'
import { getExerciseId } from './exercise-db'
import { getLocalDateString } from './dev-clock'
import type { UserProfile, WorkoutDay, MealPlanDay } from './types'

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1))
}

function generateRealisticWeight(exerciseName: string, weekNum: number): number {
  const name = exerciseName.toLowerCase()
  let base: number
  if (name.includes('deadlift') || name.includes('squat') || name.includes('trap bar')) base = 80 + randomInt(0, 30)
  else if (name.includes('bench') || name.includes('row')) base = 50 + randomInt(0, 20)
  else if (name.includes('press') && !name.includes('leg')) base = 30 + randomInt(0, 15)
  else if (name.includes('curl') || name.includes('lateral') || name.includes('fly')) base = 8 + randomInt(0, 8)
  else if (name.includes('carry') || name.includes('lunge') || name.includes('split')) base = 20 + randomInt(0, 15)
  else if (name.includes('plank') || name.includes('dead bug') || name.includes('push-up') || name.includes('pull-up') || name.includes('dip')) base = 0
  else base = 15 + randomInt(0, 15)

  // Progressive overload: ~2.5% per week
  return Math.round((base + (weekNum - 1) * base * 0.025) * 2) / 2
}

function parseReps(repsStr: string): number {
  const match = repsStr.match(/(\d+)/)
  return match ? parseInt(match[1]) : 10
}

export interface SeedProgress {
  total: number
  current: number
  phase: string
}

export interface SeedResult {
  success: boolean
  message: string
  workoutLogs: number
  mealLogs: number
}

export async function seedSyntheticData(
  profile: UserProfile,
  exercisePlan: WorkoutDay[],
  mealPlan: MealPlanDay[],
  weeksToSeed: number,
  onProgress?: (progress: SeedProgress) => void
): Promise<SeedResult> {
  if (!profile.id) return { success: false, message: 'No profile ID', workoutLogs: 0, mealLogs: 0 }

  const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  let workoutLogs = 0
  let mealLogs = 0
  const totalSteps = weeksToSeed * (exercisePlan.length + 7) // exercises per week + 7 meals/day
  let stepsDone = 0

  // --- Seed Workout Logs ---
  onProgress?.({ total: totalSteps, current: 0, phase: 'Generating workout history...' })
  const todayLocal = getLocalDateString(new Date())

  for (let wk = 1; wk <= weeksToSeed; wk++) {
    for (const day of exercisePlan) {
      if (!day.exercises || day.exercises.length === 0) continue

      const dayIndex = DAYS_OF_WEEK.indexOf(day.day)
      if (dayIndex === -1) continue
      const baseDate = new Date()
      baseDate.setDate(baseDate.getDate() - ((weeksToSeed - wk) * 7) - (((new Date().getDay()) - dayIndex + 7) % 7))
      // Local date, not UTC — and skipped outright if it lands on today so
      // seeding can never overwrite a real logged set in the live session
      // (writeHistoricalSession also hard-refuses this as a backstop).
      const dateStr = getLocalDateString(baseDate)
      if (dateStr >= todayLocal) {
        stepsDone++
        onProgress?.({ total: totalSteps, current: stepsDone, phase: `Week ${wk} workouts...` })
        continue
      }

      const sets: Parameters<typeof writeHistoricalSession>[0]['sets'] = []
      for (const exercise of day.exercises) {
        const weight = generateRealisticWeight(exercise.name, wk)
        const targetReps = parseReps(exercise.reps)

        for (let setNum = 1; setNum <= exercise.sets; setNum++) {
          // Simulate fatigue: later sets might have 1-2 fewer reps
          const fatigueDrop = setNum > 2 ? randomInt(0, 2) : 0
          const repsCompleted = Math.max(1, targetReps - fatigueDrop + randomInt(-1, 1))
          // Simulate RPE: increases with sets and weeks
          const baseRpe = 6 + (wk * 0.3) + (setNum * 0.3)
          const rpe = Math.min(10, Math.round(baseRpe * 10) / 10 + randomBetween(-0.5, 0.5))

          sets.push({
            exerciseId: exercise.id ?? getExerciseId(exercise.name),
            exerciseName: exercise.name,
            setNumber: setNum,
            weightKg: weight,
            repsCompleted,
            rpe: Math.round(rpe * 10) / 10,
            isBodyweight: weight === 0,
            completedAt: new Date(baseDate.getTime() + setNum * 120000).toISOString(),
          })
        }
      }

      if (sets.length > 0) {
        try {
          await writeHistoricalSession({ userId: profile.id, date: dateStr, weekNumber: wk, day: day.day, sets })
          workoutLogs += sets.length
        } catch {
          // Partial seed failures are tolerated, matching the legacy behavior.
        }
      }

      stepsDone++
      onProgress?.({ total: totalSteps, current: stepsDone, phase: `Week ${wk} workouts...` })
    }
  }

  // Meal-history seeding removed (M0): it wrote to `daily_food_logs`, a
  // table that exists in no migration and not on the live database — every
  // seed insert failed silently. M2 re-adds meal seeding against the real
  // meal_events ledger once the meal-store write path exists.

  return {
    success: true,
    message: `Seeded ${workoutLogs} workout logs and ${mealLogs} meal logs across ${weeksToSeed} weeks`,
    workoutLogs,
    mealLogs,
  }
}

export async function clearSyntheticData(profileId: string): Promise<{ success: boolean; message: string }> {
  const errors: string[] = []
  try {
    await clearAllSetLogs(profileId)
  } catch (err) {
    errors.push(`set logs: ${err instanceof Error ? err.message : 'unknown'}`)
  }
  // daily_food_logs cleanup removed (M0) — the table never existed; see the
  // seeding note above.

  if (errors.length > 0) {
    return { success: false, message: `Partial failure: ${errors.join('; ')}` }
  }
  return { success: true, message: 'All synthetic data cleared' }
}
