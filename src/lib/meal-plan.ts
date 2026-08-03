import type {
  UserProfile,
  WeeklyMealSlot,
  WeeklyMealPlan,
  DayName,
  WorkoutDay,
} from './types'
import { DAY_NAMES } from './types'
import { calculateDailyMacros } from './macro-calculator'

// ---------------------------------------------------------------------------
// M0 RETIREMENT NOTE: this module used to be an Edamam Meal-Planner client
// (health-label mapping, recipe scaling, a 20s-timeout fetch to the
// `edamam-recipes` edge function). The meal-stack discovery round found that
// path had never once worked in production — the edge function was never
// deployed and the EDAMAM_* credentials were never provisioned on the live
// project — so every user has only ever seen the placeholder plan below.
// The Edamam path, `meal-plan-legacy.ts` (which was 100% stubs), and the
// `edamam-recipes`/`nutrition-analysis` edge functions are deleted. The
// placeholder generator remains the interim plan source until M1 replaces
// it with the deterministic pool model (meal_plan_slots + generate-meals as
// a variety engine behind a code-enforced scaler).
// ---------------------------------------------------------------------------

export const SLOT_RATIOS: Record<string, number> = {
  Breakfast: 0.25,
  Lunch: 0.35,
  Dinner: 0.30,
  Snack: 0.10,
}

const MEAL_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

function getMonday(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

/**
 * Interim plan source (until M1): one placeholder slot per meal per day,
 * with macros sliced from the day's computed targets by SLOT_RATIOS. These
 * numbers are honest — they are deterministic fractions of the target, not
 * food-derived claims — which is why is_verified is never set true for them.
 */
export function generateWeeklyMealPlan(
  profile: UserProfile,
  exercisePlan: WorkoutDay[],
  statusCallback?: (msg: string) => void
): WeeklyMealPlan {
  statusCallback?.('Building your meal structure...')
  const weeklyPlan: WeeklyMealPlan = {}

  for (const dayName of DAY_NAMES) {
    const dailyMacros = calculateDailyMacros(profile, dayName, exercisePlan)
    weeklyPlan[dayName] = MEAL_SLOTS.map(slot => {
      const ratio = SLOT_RATIOS[slot]
      return {
        day_of_week: dayName,
        meal_slot: slot,
        recipe: {
          name: `${slot} - ${dayName}`,
          image: '',
          source_url: '',
          yield: 1,
          total_calories: Math.round(dailyMacros.calories * ratio),
          total_protein: Math.round(dailyMacros.protein * ratio),
          total_carbs: Math.round(dailyMacros.carbs * ratio),
          total_fat: Math.round(dailyMacros.fat * ratio),
          total_weight: 300,
          ingredients: [],
          ingredient_lines: ['Recipe not available - use any meal matching your macros'],
        },
        scaled_calories: Math.round(dailyMacros.calories * ratio),
        scaled_protein: Math.round(dailyMacros.protein * ratio),
        scaled_carbs: Math.round(dailyMacros.carbs * ratio),
        scaled_fat: Math.round(dailyMacros.fat * ratio),
        scale_factor: 1,
        ingredient_lines: ['Recipe not available - use any meal matching your macros'],
      }
    })
  }

  return weeklyPlan
}

/**
 * @deprecated The Edamam-backed swap this implemented never worked in
 * production (see the retirement note above); it now always resolves null,
 * which callers already handled as "swap unavailable". M1's pool model
 * (meal-store.swapPoolMeal) replaces it.
 */
export async function swapMealSlot(
  _profile: UserProfile,
  _dayName: DayName,
  _mealSlot: string,
  _exercisePlan: WorkoutDay[],
  _currentRecipeName?: string
): Promise<WeeklyMealSlot | null> {
  return null
}

export function getWeekStartDate(): string {
  return getMonday(new Date())
}
