import type { MacroTargets, FitnessGoal, MealPlanDay } from './types'

export function generateMealPlan(
  _macros: MacroTargets,
  _goal: FitnessGoal,
  _dietary: string[]
): MealPlanDay[] {
  return []
}

export async function generateDynamicMealPlan(
  _macros: MacroTargets,
  _goal: FitnessGoal,
  _dietary: string[],
  _statusCb?: (msg: string) => void
): Promise<MealPlanDay[] | null> {
  return null
}

export function validateMealPlanDiet(meals: MealPlanDay[], _prefs: string[]): MealPlanDay[] {
  return meals
}

export function lookupDish(_name: string): { proteinRatio: number; carbRatio: number; fatRatio: number; ingredients: string[]; prep: string } | null {
  return null
}

export async function calibrateMealNutrition(
  _ingredients: string[],
  _target: MacroTargets,
  _name: string
): Promise<{ ingredients: string[]; protein: number; carbs: number; fat: number; is_verified: boolean } | null> {
  return null
}

export function getScaledTemplateIngredients(
  ingredients: string[],
  _estimatedCals: number,
  _targetCals: number
): string[] {
  return ingredients
}
