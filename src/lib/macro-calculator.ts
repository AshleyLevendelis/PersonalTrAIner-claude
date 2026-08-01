import type {
  UserProfile,
  MacroTargets,
  MacroCalculationMode,
  ActivityLevel,
  FitnessGoal,
  WorkoutDay,
} from './types'

export interface DailyMacroResult {
  calories: number
  protein: number
  carbs: number
  fat: number
  dayType: 'training' | 'rest'
  method: MacroCalculationMode
}

export interface WeeklyMacroSchedule {
  monday: DailyMacroResult
  tuesday: DailyMacroResult
  wednesday: DailyMacroResult
  thursday: DailyMacroResult
  friday: DailyMacroResult
  saturday: DailyMacroResult
  sunday: DailyMacroResult
}

const STATIC_PAL: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

const NEAT_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.15,
  light: 1.25,
  moderate: 1.35,
  active: 1.5,
  very_active: 1.6,
}

export function computeBMR(profile: UserProfile): number {
  if (profile.gender === 'male') {
    return Math.round(10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age + 5)
  }
  return Math.round(10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age - 161)
}

export function computeStaticTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * STATIC_PAL[activityLevel])
}

function getSessionDurationMinutes(profile: UserProfile): number {
  switch (profile.session_duration_preference) {
    case '30-45': return 37
    case '45-60': return 52
    case '60-90': return 75
    case '90+': return 100
    default: return 52
  }
}

function getTrainingMET(focus: string): number {
  const lower = focus.toLowerCase()
  if (lower.includes('power') || lower.includes('conditioning')) return 7.0
  if (lower.includes('squat') || lower.includes('leg')) return 6.0
  if (lower.includes('pull') || lower.includes('hinge') || lower.includes('back')) return 6.0
  if (lower.includes('push') || lower.includes('chest') || lower.includes('press')) return 5.0
  if (lower.includes('shoulder') || lower.includes('core') || lower.includes('abs')) return 4.5
  if (lower.includes('full body')) return 6.5
  return 5.0
}

function classifyTrainingIntensity(focus: string): 'rest' | 'moderate' | 'high' {
  const lower = focus.toLowerCase()
  if (lower.includes('power') || lower.includes('full body') || lower.includes('conditioning')) return 'high'
  return 'moderate'
}

function applyGoalAdjustment(tdee: number, goal: FitnessGoal): number {
  switch (goal) {
    case 'fat_loss':
      return Math.max(1200, tdee - 500)
    case 'hypertrophy':
      return tdee + 300
    default:
      return tdee
  }
}

function getCarbsPerKg(intensity: 'rest' | 'moderate' | 'high', goal: FitnessGoal): number {
  switch (intensity) {
    case 'rest':
      if (goal === 'fat_loss') return 1.5
      if (goal === 'hypertrophy') return 2.5
      if (goal === 'conditioning') return 2.5
      return 2.0
    case 'moderate':
      if (goal === 'fat_loss') return 3.0
      if (goal === 'hypertrophy') return 5.0
      if (goal === 'conditioning') return 5.0
      return 4.0
    case 'high':
      if (goal === 'fat_loss') return 5.0
      if (goal === 'hypertrophy') return 7.0
      if (goal === 'conditioning') return 7.0
      return 6.0
  }
}

function computeStaticMacros(profile: UserProfile): MacroTargets {
  const bmr = computeBMR(profile)
  const tdee = computeStaticTDEE(bmr, profile.activity_level)
  const calories = applyGoalAdjustment(tdee, profile.fitness_goal)

  if (profile.fitness_goal === 'conditioning') {
    const protein = Math.round((calories * 0.20) / 4)
    const fat = Math.round((calories * 0.25) / 9)
    const carbs = Math.round((calories * 0.55) / 4)
    return { calories, protein, carbs, fat }
  }

  const protein = Math.round(2.0 * profile.weight_kg)
  const fat = Math.round((calories * 0.25) / 9)
  const carbs = Math.round((calories - protein * 4 - fat * 9) / 4)

  return { calories, protein, carbs: Math.max(carbs, 50), fat }
}

function computeDynamicDay(
  profile: UserProfile,
  isTraining: boolean,
  workoutFocus: string | null,
): DailyMacroResult {
  const bmr = computeBMR(profile)
  const neatTDEE = bmr * NEAT_MULTIPLIER[profile.activity_level]
  const weight = profile.weight_kg

  let eee = 0
  let intensity: 'rest' | 'moderate' | 'high' = 'rest'

  if (isTraining && workoutFocus) {
    const met = getTrainingMET(workoutFocus)
    const durationHr = getSessionDurationMinutes(profile) / 60
    eee = met * weight * durationHr
    intensity = classifyTrainingIntensity(workoutFocus)
  }

  const dailyTDEE = Math.round(neatTDEE + eee)
  const calories = applyGoalAdjustment(dailyTDEE, profile.fitness_goal)

  const protein = Math.round(2.2 * weight)
  const carbsPerKg = getCarbsPerKg(intensity, profile.fitness_goal)
  let carbs = Math.round(carbsPerKg * weight)

  let fat = Math.round((calories - protein * 4 - carbs * 4) / 9)
  const fatFloor = Math.round(0.6 * weight)

  if (fat < fatFloor) {
    fat = fatFloor
    const remainingCals = calories - protein * 4 - fat * 9
    carbs = Math.max(50, Math.round(remainingCals / 4))
  }

  const actualCalories = protein * 4 + carbs * 4 + fat * 9

  return {
    calories: actualCalories,
    protein,
    carbs,
    fat,
    dayType: isTraining ? 'training' : 'rest',
    method: 'DYNAMIC_CSCS',
  }
}

export function calculateDailyMacros(
  profile: UserProfile,
  dayName: string,
  exercisePlan: WorkoutDay[],
): DailyMacroResult {
  const mode = profile.macro_calculation_mode || 'STANDARD_STATIC'

  if (mode === 'STANDARD_STATIC') {
    const macros = computeStaticMacros(profile)
    const isTraining = profile.training_days.some(
      td => td.day === dayName && td.available
    )
    return {
      ...macros,
      dayType: isTraining ? 'training' : 'rest',
      method: 'STANDARD_STATIC',
    }
  }

  const isTraining = profile.training_days.some(
    td => td.day === dayName && td.available
  )
  const workoutDay = exercisePlan.find(wp => wp.day === dayName)
  return computeDynamicDay(profile, isTraining, workoutDay?.focus ?? null)
}

export function calculateWeeklySchedule(
  profile: UserProfile,
  exercisePlan: WorkoutDay[],
): WeeklyMacroSchedule {
  return {
    monday: calculateDailyMacros(profile, 'Monday', exercisePlan),
    tuesday: calculateDailyMacros(profile, 'Tuesday', exercisePlan),
    wednesday: calculateDailyMacros(profile, 'Wednesday', exercisePlan),
    thursday: calculateDailyMacros(profile, 'Thursday', exercisePlan),
    friday: calculateDailyMacros(profile, 'Friday', exercisePlan),
    saturday: calculateDailyMacros(profile, 'Saturday', exercisePlan),
    sunday: calculateDailyMacros(profile, 'Sunday', exercisePlan),
  }
}

export function getStaticDailyMacros(profile: UserProfile): MacroTargets {
  return computeStaticMacros(profile)
}
