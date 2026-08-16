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

/**
 * Sex-differentiated minimum-calorie rail (M0): the old flat 1200 floor was
 * the standard FEMALE guideline applied to everyone; sustained sub-1500
 * intakes for males risk inadequate micronutrient coverage under the same
 * guidance the 1200 figure comes from.
 */
function calorieFloor(gender: 'male' | 'female'): number {
  return gender === 'male' ? 1500 : 1200
}

function applyGoalAdjustment(tdee: number, goal: FitnessGoal, gender: 'male' | 'female'): number {
  switch (goal) {
    case 'fat_loss':
      return Math.max(calorieFloor(gender), tdee - 500)
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

// ---------------------------------------------------------------------------
// USER-ADJUSTABLE MACRO SPLIT (macro-accuracy round, Part 2)
// ---------------------------------------------------------------------------
// The static (non-conditioning) formula below was always protein-per-kg +
// fat-percentage + carbs-as-remainder — this section makes those two numbers
// user-tunable instead of hardcoded, with the same two rails the hardcoded
// version silently already had one of (the 50g carb floor) plus a new
// matching fat floor. calorieTarget itself is NEVER touched by the split —
// it's derived from TDEE + goal alone; the split only reallocates within it.
// ---------------------------------------------------------------------------

export type MacroSplitPreset = 'balanced' | 'higher_protein' | 'lower_carb' | 'higher_carb' | 'custom'

export interface MacroSplitInput {
  proteinPerKg: number
  fatPercent: number
}

export interface MacroSplit extends MacroSplitInput {
  preset: MacroSplitPreset
}

export const MACRO_SPLIT_PRESET_VALUES: Record<Exclude<MacroSplitPreset, 'custom'>, MacroSplitInput & { label: string; description: string }> = {
  balanced:       { proteinPerKg: 2.0, fatPercent: 0.25, label: 'Balanced',       description: 'The default — even protein and fat, carbs fill the rest.' },
  higher_protein: { proteinPerKg: 2.4, fatPercent: 0.25, label: 'Higher protein', description: 'More protein at the same fat share, less room for carbs.' },
  lower_carb:     { proteinPerKg: 2.0, fatPercent: 0.35, label: 'Lower carb',     description: 'More calories from fat, fewer left for carbs.' },
  higher_carb:    { proteinPerKg: 1.8, fatPercent: 0.20, label: 'Higher carb',    description: 'Less protein and fat, more calories left for carbs.' },
}

export const DEFAULT_MACRO_SPLIT: MacroSplit = {
  preset: 'balanced',
  proteinPerKg: MACRO_SPLIT_PRESET_VALUES.balanced.proteinPerKg,
  fatPercent: MACRO_SPLIT_PRESET_VALUES.balanced.fatPercent,
}

/** Slider bounds for Custom mode — the range a "standard" split can express. Below/above this needs an inverted derivation (see the keto note on computeMacroSplitTargets). */
export const PROTEIN_PER_KG_RANGE = { min: 1.6, max: 2.4, step: 0.1 }
export const FAT_PERCENT_RANGE = { min: 0.20, max: 0.35, step: 0.01 }

export const CARB_FLOOR_G = 50
export const FAT_FLOOR_PER_KG = 0.6

/** Reads the profile's stored split, resolving a named preset to its values or falling back to the stored custom numbers. Profiles that predate this feature (all three fields undefined) resolve to DEFAULT_MACRO_SPLIT — bit-identical to the old hardcoded 2.0g/kg-protein/25%-fat formula, so nothing changes for anyone who hasn't touched the control. */
export function getProfileMacroSplit(profile: UserProfile): MacroSplit {
  const preset = (profile.macro_split_preset as MacroSplitPreset | undefined) ?? 'balanced'
  if (preset !== 'custom' && preset in MACRO_SPLIT_PRESET_VALUES) {
    const { proteinPerKg, fatPercent } = MACRO_SPLIT_PRESET_VALUES[preset as Exclude<MacroSplitPreset, 'custom'>]
    return { preset, proteinPerKg, fatPercent }
  }
  return {
    preset: 'custom',
    proteinPerKg: profile.macro_protein_per_kg ?? DEFAULT_MACRO_SPLIT.proteinPerKg,
    fatPercent: profile.macro_fat_percent ?? DEFAULT_MACRO_SPLIT.fatPercent,
  }
}

export interface MacroSplitResult extends MacroTargets {
  /** True when the fat floor (0.6g/kg) had to override the requested fat%. */
  clampedFatFloor: boolean
  /** True when the carb floor (50g) had to override what the split would otherwise leave for carbs. */
  clampedCarbFloor: boolean
}

/**
 * Applies protein-per-kg + fat% to a FIXED calorie target, carbs taking the
 * remainder, with two hard rails: fat never drops below FAT_FLOOR_PER_KG
 * g/kg, carbs never drop below CARB_FLOOR_G. calorieTarget itself never
 * moves — a rail engaging reallocates grams within it, it doesn't change it
 * (rounding can still shift the final summed calories by a few kcal either
 * way, same as the pre-split formula always did).
 *
 * NOT a keto/low-carb implementation: a real low-carb split needs the
 * opposite derivation order (carbs as a hard CAP, fat as the remainder, plus
 * a protein ceiling) and food-db coverage this app doesn't have yet. Forcing
 * that shape through this protein-first/fat-second/carbs-remainder pipeline
 * by cranking fatPercent to its max would clamp into something that reads as
 * "low carb" but isn't a genuine ketogenic ratio — the UI deliberately caps
 * FAT_PERCENT_RANGE below where that would happen and says so explicitly
 * rather than offering a mislabelled keto preset.
 */
export function computeMacroSplitTargets(weightKg: number, calorieTarget: number, split: MacroSplitInput): MacroSplitResult {
  const protein = Math.max(0, Math.round(split.proteinPerKg * weightKg))
  let fat = Math.round((calorieTarget * split.fatPercent) / 9)
  const fatFloor = Math.round(FAT_FLOOR_PER_KG * weightKg)
  let clampedFatFloor = false
  if (fat < fatFloor) { fat = fatFloor; clampedFatFloor = true }

  let carbs = Math.round((calorieTarget - protein * 4 - fat * 9) / 4)
  let clampedCarbFloor = false
  if (carbs < CARB_FLOOR_G) { carbs = CARB_FLOOR_G; clampedCarbFloor = true }

  return { calories: protein * 4 + carbs * 4 + fat * 9, protein, carbs, fat, clampedFatFloor, clampedCarbFloor }
}

function computeStaticMacros(profile: UserProfile): MacroTargets {
  const bmr = computeBMR(profile)
  const tdee = computeStaticTDEE(bmr, profile.activity_level)
  const calorieTarget = applyGoalAdjustment(tdee, profile.fitness_goal, profile.gender)

  // The calories field is always recomputed from the FINAL macros (M0),
  // matching what dynamic mode already did — the old code returned the
  // pre-allocation target, which silently disagreed with the macro sum by
  // a couple of kcal from rounding, and by 100+ kcal whenever the 50g carb
  // floor or the calorie rail engaged.
  //
  // Conditioning goal keeps its own fixed 20%-protein/25%-fat/55%-carb split
  // (an endurance-oriented ratio, not bodyweight-anchored) — the macro-split
  // control below doesn't apply to it; the UI disables the control and says
  // why rather than silently having no effect.
  if (profile.fitness_goal === 'conditioning') {
    const protein = Math.round((calorieTarget * 0.20) / 4)
    const fat = Math.round((calorieTarget * 0.25) / 9)
    const carbs = Math.round((calorieTarget * 0.55) / 4)
    return { calories: protein * 4 + carbs * 4 + fat * 9, protein, carbs, fat }
  }

  const split = getProfileMacroSplit(profile)
  const result = computeMacroSplitTargets(profile.weight_kg, calorieTarget, split)
  return { calories: result.calories, protein: result.protein, carbs: result.carbs, fat: result.fat }
}

// Deliberately does NOT read the user-adjustable macro split (see
// getProfileMacroSplit above) — this day-varying carb-cycling formula is its
// own periodization scheme (protein fixed at 2.2g/kg, carbs swinging by
// training intensity, fat as the remainder above a floor), not the flat
// "protein g/kg + fat%, carbs remainder" shape the split control edits.
// Retrofitting the split onto this chain would either do nothing useful
// (fat% has no lever here — fat is already remainder-with-floor) or fight
// the carb-cycling table. The Nutrition tab disables the split control while
// Dynamic CSCS is selected and says why, rather than silently ignoring it.
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
  const calories = applyGoalAdjustment(dailyTDEE, profile.fitness_goal, profile.gender)

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
    // `|| []` backstop — see the note in exercise-plan.ts's availableDays.
    const isTraining = (profile.training_days || []).some(
      td => td.day === dayName && td.available
    )
    return {
      ...macros,
      dayType: isTraining ? 'training' : 'rest',
      method: 'STANDARD_STATIC',
    }
  }

  const isTraining = (profile.training_days || []).some(
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

export interface MacroDerivation {
  bmr: number
  tdee: number
  /** tdee → target delta from the goal adjustment — negative for a deficit, positive for a surplus, 0 at maintenance. */
  surplusKcal: number
  /** Label for the surplus/deficit row — matches applyGoalAdjustment's own goal handling. */
  surplusLabel: string
  target: MacroTargets
  /** The split actually driving `target` — DEFAULT_MACRO_SPLIT when the goal is conditioning (split doesn't apply there). */
  split: MacroSplit
  /** False for the conditioning goal, whose fixed percentage split ignores the macro-split control entirely. */
  splitApplies: boolean
}

/**
 * The BMR → TDEE → surplus/deficit → target chain, as one caller-friendly
 * shape — for the Nutrition tab's derivation display (turn 10). Always
 * computed from the STATIC baseline (the same numbers `applyGoalAdjustment`
 * and `computeStaticMacros` already produce internally) regardless of the
 * active macro_calculation_mode, since the derivation explains "where the
 * numbers come from" independent of which method's weekly schedule is
 * currently selected below it.
 */
export function getMacroDerivation(profile: UserProfile): MacroDerivation {
  const bmr = computeBMR(profile)
  const tdee = computeStaticTDEE(bmr, profile.activity_level)
  const target = computeStaticMacros(profile)
  const surplusKcal = target.calories - tdee
  const surplusLabel =
    profile.fitness_goal === 'fat_loss' ? 'Fat-loss deficit'
    : profile.fitness_goal === 'hypertrophy' ? 'Hypertrophy surplus'
    : profile.fitness_goal === 'conditioning' ? 'Conditioning adjustment'
    : 'Maintenance adjustment'
  const splitApplies = profile.fitness_goal !== 'conditioning'
  const split = splitApplies ? getProfileMacroSplit(profile) : DEFAULT_MACRO_SPLIT
  return { bmr, tdee, surplusKcal, surplusLabel, target, split, splitApplies }
}
