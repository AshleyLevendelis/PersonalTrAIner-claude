import type {
  MacroTargets,
  FitnessGoal,
  UserProfile,
  EdamamRecipe,
  WeeklyMealSlot,
  WeeklyMealPlan,
  DayName,
  WorkoutDay,
  MealPlanDay,
  Meal,
} from './types'
import { DAY_NAMES } from './types'
import { calculateDailyMacros } from './macro-calculator'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const SLOT_RATIOS: Record<string, number> = {
  Breakfast: 0.25,
  Lunch: 0.35,
  Dinner: 0.30,
  Snack: 0.10,
}

const MEAL_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

const DIETARY_PREF_TO_HEALTH_LABEL: Record<string, string> = {
  vegetarian: 'VEGETARIAN',
  vegan: 'VEGAN',
  'gluten-free': 'GLUTEN_FREE',
  'dairy-free': 'DAIRY_FREE',
  'nut-free': 'TREE_NUT_FREE',
  'shellfish-free': 'SHELLFISH_FREE',
  pescatarian: 'PESCATARIAN',
  paleo: 'PALEO',
  keto: 'KETO_FRIENDLY',
  kosher: 'KOSHER',
  halal: 'ALCOHOL_FREE',
}

function mapDietaryPrefsToHealthLabels(prefs: string[]): string[] {
  const labels: string[] = []
  for (const pref of prefs) {
    const label = DIETARY_PREF_TO_HEALTH_LABEL[pref.toLowerCase()]
    if (label) labels.push(label)
  }
  return labels
}

function getMonday(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

function isTrainingDay(profile: UserProfile, dayName: string): boolean {
  return profile.training_days.some(td => td.day === dayName && td.available)
}

function classifyDayIntensity(
  profile: UserProfile,
  dayName: string,
  exercisePlan: WorkoutDay[]
): 'rest' | 'moderate' | 'high' {
  if (!isTrainingDay(profile, dayName)) return 'rest'
  const workout = exercisePlan.find(wp => wp.day === dayName)
  if (!workout) return 'moderate'
  const focus = workout.focus.toLowerCase()
  if (focus.includes('power') || focus.includes('full body') || focus.includes('conditioning')) return 'high'
  return 'moderate'
}

function scaleRecipeToSlot(
  recipe: EdamamRecipe,
  targetCalories: number
): { scaleFactor: number; protein: number; carbs: number; fat: number; ingredientLines: string[] } {
  const perServingCals = recipe.total_calories / recipe.yield
  if (perServingCals <= 0) {
    return { scaleFactor: 1, protein: 0, carbs: 0, fat: 0, ingredientLines: recipe.ingredient_lines }
  }

  const scaleFactor = targetCalories / perServingCals
  const protein = Math.round((recipe.total_protein / recipe.yield) * scaleFactor)
  const carbs = Math.round((recipe.total_carbs / recipe.yield) * scaleFactor)
  const fat = Math.round((recipe.total_fat / recipe.yield) * scaleFactor)

  const ingredientLines = recipe.ingredients.map(ing => {
    const scaledWeight = Math.round((ing.weight / recipe.yield) * scaleFactor)
    return `${scaledWeight}g ${ing.food}`
  })

  return { scaleFactor, protein, carbs, fat, ingredientLines }
}

async function callMealPlannerEdgeFunction(body: any): Promise<any> {
  const url = `${SUPABASE_URL}/functions/v1/edamam-recipes`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => 'unreadable')
    console.error('Meal Planner API call failed:', response.status, errBody.slice(0, 300))
    return null
  }

  return response.json()
}

export async function generateWeeklyMealPlan(
  profile: UserProfile,
  exercisePlan: WorkoutDay[],
  statusCallback?: (msg: string) => void
): Promise<WeeklyMealPlan> {
  const healthLabels = mapDietaryPrefsToHealthLabels(profile.dietary_preferences || [])
  const weeklyPlan: WeeklyMealPlan = {}

  // Calculate average daily calories for the plan-level constraint
  let totalCalories = 0
  for (const dayName of DAY_NAMES) {
    const dailyMacros = calculateDailyMacros(profile, dayName, exercisePlan)
    totalCalories += dailyMacros.calories
  }
  const avgCalories = Math.round(totalCalories / 7)

  // Build section calorie constraints based on ratios
  const sections: Record<string, { calories_min: number; calories_max: number }> = {}
  for (const slot of MEAL_SLOTS) {
    const ratio = SLOT_RATIOS[slot]
    sections[slot] = {
      calories_min: Math.round(avgCalories * ratio * 0.5),
      calories_max: Math.round(avgCalories * ratio * 2.0),
    }
  }

  statusCallback?.('Generating your meal plan...')

  const result = await callMealPlannerEdgeFunction({
    mode: 'full',
    size: 7,
    health_labels: healthLabels.length > 0 ? healthLabels : undefined,
    calories_min: Math.round(avgCalories * 0.7),
    calories_max: Math.round(avgCalories * 1.3),
    sections,
  })

  if (!result || result.error || !result.plan) {
    console.error('Meal Planner API failed, using placeholders', result?.error)
    // Generate placeholder plan
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

  // Map the plan result (day_0..day_6) to DAY_NAMES
  for (let dayIdx = 0; dayIdx < DAY_NAMES.length; dayIdx++) {
    const dayName = DAY_NAMES[dayIdx]
    const dayKey = `day_${dayIdx}`
    const dayData = result.plan[dayKey] || {}
    const dailyMacros = calculateDailyMacros(profile, dayName, exercisePlan)
    const daySlots: WeeklyMealSlot[] = []

    statusCallback?.(`Processing meals for ${dayName}...`)

    for (const slot of MEAL_SLOTS) {
      const ratio = SLOT_RATIOS[slot]
      const targetCalories = Math.round(dailyMacros.calories * ratio)
      const recipeData = dayData[slot] as EdamamRecipe | null

      if (recipeData && recipeData.name) {
        const scaled = scaleRecipeToSlot(recipeData, targetCalories)
        daySlots.push({
          day_of_week: dayName,
          meal_slot: slot,
          recipe: recipeData,
          scaled_calories: targetCalories,
          scaled_protein: scaled.protein,
          scaled_carbs: scaled.carbs,
          scaled_fat: scaled.fat,
          scale_factor: scaled.scaleFactor,
          ingredient_lines: scaled.ingredientLines,
        })
      } else {
        daySlots.push({
          day_of_week: dayName,
          meal_slot: slot,
          recipe: {
            name: `${slot} - ${dayName}`,
            image: '',
            source_url: '',
            yield: 1,
            total_calories: targetCalories,
            total_protein: Math.round(dailyMacros.protein * ratio),
            total_carbs: Math.round(dailyMacros.carbs * ratio),
            total_fat: Math.round(dailyMacros.fat * ratio),
            total_weight: 300,
            ingredients: [],
            ingredient_lines: ['Recipe not available - use any meal matching your macros'],
          },
          scaled_calories: targetCalories,
          scaled_protein: Math.round(dailyMacros.protein * ratio),
          scaled_carbs: Math.round(dailyMacros.carbs * ratio),
          scaled_fat: Math.round(dailyMacros.fat * ratio),
          scale_factor: 1,
          ingredient_lines: ['Recipe not available - use any meal matching your macros'],
        })
      }
    }

    weeklyPlan[dayName] = daySlots
  }

  return weeklyPlan
}

export async function swapMealSlot(
  profile: UserProfile,
  dayName: DayName,
  mealSlot: string,
  exercisePlan: WorkoutDay[],
  currentRecipeName?: string
): Promise<WeeklyMealSlot | null> {
  const healthLabels = mapDietaryPrefsToHealthLabels(profile.dietary_preferences || [])
  const dailyMacros = calculateDailyMacros(profile, dayName, exercisePlan)
  const ratio = SLOT_RATIOS[mealSlot] || 0.25
  const targetCalories = Math.round(dailyMacros.calories * ratio)

  const result = await callMealPlannerEdgeFunction({
    mode: 'single',
    slot: mealSlot,
    health_labels: healthLabels.length > 0 ? healthLabels : undefined,
    calories_min: Math.round(targetCalories * 0.5),
    calories_max: Math.round(targetCalories * 2.0),
    excluded: currentRecipeName ? [currentRecipeName] : undefined,
  })

  if (!result || result.error || !result.recipe) {
    console.error('Swap meal failed:', result?.error)
    return null
  }

  const recipe = result.recipe as EdamamRecipe
  const scaled = scaleRecipeToSlot(recipe, targetCalories)

  return {
    day_of_week: dayName,
    meal_slot: mealSlot,
    recipe,
    scaled_calories: targetCalories,
    scaled_protein: scaled.protein,
    scaled_carbs: scaled.carbs,
    scaled_fat: scaled.fat,
    scale_factor: scaled.scaleFactor,
    ingredient_lines: scaled.ingredientLines,
  }
}

export function getWeekStartDate(): string {
  return getMonday(new Date())
}

export function weeklyPlanToLegacyFormat(weeklyPlan: WeeklyMealPlan): MealPlanDay[] {
  const slotMap = new Map<string, Meal[]>()

  for (const daySlots of Object.values(weeklyPlan)) {
    for (const slot of daySlots) {
      const existing = slotMap.get(slot.meal_slot) || []
      existing.push({
        name: slot.recipe.name,
        calories: slot.scaled_calories,
        protein: slot.scaled_protein,
        carbs: slot.scaled_carbs,
        fat: slot.scaled_fat,
        portion_size: slot.ingredient_lines.join(', '),
        prep: '',
        substitution: '',
        ingredients: slot.ingredient_lines,
        is_verified: true,
      })
      slotMap.set(slot.meal_slot, existing)
    }
  }

  const result: MealPlanDay[] = []
  for (const [slot, items] of slotMap) {
    result.push({ meal: slot, items })
  }
  return result
}

export { generateMealPlan, generateDynamicMealPlan, validateMealPlanDiet, lookupDish, calibrateMealNutrition, getScaledTemplateIngredients } from './meal-plan-legacy'
