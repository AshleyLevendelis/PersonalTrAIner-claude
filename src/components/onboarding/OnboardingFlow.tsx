import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, Dumbbell } from 'lucide-react'
import { OptionCard } from './OptionCard'
import { DIETARY_PREFERENCES, type DietaryPreference } from '@/lib/diet-rules'
import type { UserProfile, FitnessGoal, SessionDuration, TrainingTime, WorkoutSplit, EquipmentAccess, TrainingStyle, TrainingExperience, CoachingPersona, MacroCalculationMode, RecoveryCapacity, ConditioningPreference, ActivityLevel, CookingTimePreference, BreakfastStyle } from '@/lib/types'

type WeightUnit = 'kg' | 'lbs'
type HeightUnit = 'cm' | 'ftin'

interface OnboardingData {
  displayName: string
  fitnessGoal: FitnessGoal | null
  trainingDays: string[]
  recoveryCapacity: RecoveryCapacity | null
  conditioningPreference: ConditioningPreference | null
  sessionDuration: SessionDuration | null
  trainingTime: TrainingTime | null
  equipment: EquipmentAccess | null
  trainingStyle: TrainingStyle | null
  trainingExperience: TrainingExperience | null
  injuries: string[]
  dietaryPreferences: string[]
  age: string
  gender: 'male' | 'female'
  heightCm: string
  weightKg: string
  /** null = unanswered; false = "I'm new / not sure" (calibration week); true = "I know my numbers" (known lifts below). */
  knowsWorkingLifts: boolean | null
  knownSquatKg: string
  knownBenchKg: string
  knownDeadliftKg: string
  activityLevel: ActivityLevel | null
  mealsPerDay: 2 | 3 | 4 | null
  includeSnacks: boolean
  cookingTime: CookingTimePreference | null
  favoriteCuisines: string[]
  dislikedFoods: string
  breakfastStyle: BreakfastStyle | null
}

const TOTAL_STEPS = 19

export const EXPERIENCE_OPTIONS: { value: TrainingExperience; icon: string; label: string; description: string }[] = [
  { value: 'beginner', icon: '🌱', label: 'Beginner', description: 'New to this, or coming back after a long break' },
  { value: 'novice', icon: '📈', label: 'Novice', description: '6+ months training fairly consistently' },
  { value: 'intermediate', icon: '🎯', label: 'Intermediate', description: '2+ years, comfortable with the main lifts' },
  { value: 'advanced', icon: '🏅', label: 'Advanced', description: 'Years of training, progress comes slowly now' },
]

const GOAL_OPTIONS: { value: FitnessGoal; icon: string; label: string; description: string }[] = [
  { value: 'fat_loss', icon: '🔥', label: 'Fat Loss', description: 'Shred body fat, get lean' },
  { value: 'hypertrophy', icon: '💪', label: 'Muscle Growth', description: 'Build size & strength' },
  { value: 'functional', icon: '⚡', label: 'Functional Strength', description: 'Move better, lift heavier' },
  { value: 'conditioning', icon: '❤️', label: 'Conditioning', description: 'Cardio & endurance' },
]

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const RECOVERY_OPTIONS: { value: RecoveryCapacity; icon: string; label: string; description: string }[] = [
  { value: 'low', icon: '🪫', label: 'Stretched Thin', description: 'Poor sleep, high stress, or a physically demanding job' },
  { value: 'moderate', icon: '🔋', label: 'Getting By', description: 'Decent sleep most nights, manageable stress' },
  { value: 'high', icon: '🔌', label: 'Well Rested', description: 'Good sleep, low stress, recovery is not a limiter' },
]

export const CONDITIONING_PREF_OPTIONS: { value: ConditioningPreference; icon: string; label: string; description: string }[] = [
  { value: 'love', icon: '🏃‍♂️', label: 'Love It', description: 'Give me plenty of cardio/conditioning' },
  { value: 'tolerate', icon: '🙂', label: "It's Fine", description: "I'll do what the program calls for" },
  { value: 'avoid', icon: '🙅', label: 'Not For Me', description: 'Keep it to the minimum the goal actually needs' },
]

export const DURATION_OPTIONS: { value: SessionDuration; icon: string; label: string; description: string }[] = [
  { value: '30-45', icon: '⚡', label: '30-45 min', description: 'Quick & efficient' },
  { value: '45-60', icon: '⏱️', label: '45-60 min', description: 'Standard session' },
  { value: '60-90', icon: '🏋️', label: '60-90 min', description: 'Extended volume' },
  { value: '90+', icon: '🔥', label: '90+ min', description: 'Maximum volume' },
]

const TIME_OPTIONS: { value: TrainingTime; icon: string; label: string; description: string }[] = [
  { value: 'morning', icon: '🌅', label: 'Morning', description: '5 AM - 10 AM' },
  { value: 'midday', icon: '☀️', label: 'Midday', description: '10 AM - 2 PM' },
  { value: 'evening', icon: '🌆', label: 'Evening', description: '4 PM - 8 PM' },
  { value: 'night', icon: '🌙', label: 'Night', description: '8 PM - 12 AM' },
  { value: 'varies', icon: '🔄', label: 'It Varies', description: 'No fixed time' },
]

export const EQUIPMENT_OPTIONS: { value: EquipmentAccess; icon: string; label: string; description: string }[] = [
  { value: 'full_gym', icon: '🏢', label: 'Full Gym', description: 'All machines & free weights' },
  { value: 'home_gym', icon: '🏠', label: 'Home Gym', description: 'Barbell, dumbbells, bench' },
  { value: 'minimalist', icon: '🎒', label: 'Minimalist', description: 'Bands & kettlebells' },
  { value: 'bodyweight', icon: '🤸', label: 'Bodyweight Only', description: 'No equipment needed' },
]

export const STYLE_OPTIONS: { value: TrainingStyle; icon: string; label: string; description: string }[] = [
  { value: 'functional', icon: '🏃', label: 'Functional / Athletic', description: 'Explosive & dynamic' },
  { value: 'bodybuilding', icon: '🏆', label: 'Bodybuilding', description: 'Aesthetics & symmetry' },
  { value: 'combat', icon: '🥊', label: 'Combat / Conditioning', description: 'Fight-ready fitness' },
  { value: 'hybrid', icon: '⚙️', label: 'Hybrid', description: 'Best of everything' },
]

export const INJURY_OPTIONS: { value: string; icon: string; label: string }[] = [
  { value: 'lower_back', icon: '🔙', label: 'Lower Back' },
  { value: 'knees', icon: '🦵', label: 'Knees' },
  { value: 'shoulders', icon: '💪', label: 'Shoulders' },
  { value: 'neck', icon: '🧣', label: 'Neck' },
  { value: 'wrists', icon: '✋', label: 'Wrists' },
  { value: 'hips', icon: '🦴', label: 'Hips' },
  { value: 'ankles', icon: '🦶', label: 'Ankles' },
  { value: 'elbows', icon: '💪', label: 'Elbows' },
]

// Dietary-safety audit fix — values come from diet-rules.ts's
// DIETARY_PREFERENCES (itself derived from FORBIDDEN_TAGS's keys), not
// hand-typed here. This is what makes it structurally impossible for the
// onboarding picker to offer a tag the enforcement code doesn't recognize,
// or vice versa: TypeScript's excess/missing-property checks on the
// Record<DietaryPreference, ...> below fail to compile if the two ever
// disagree. Only icon/label (presentation, not enforcement) stay hand-authored.
const DIETARY_META: Record<DietaryPreference, { icon: string; label: string }> = {
  vegetarian: { icon: '🥬', label: 'Vegetarian' },
  vegan: { icon: '🌱', label: 'Vegan' },
  pescatarian: { icon: '🐟', label: 'Pescatarian' },
  keto: { icon: '🥑', label: 'Keto' },
  'low-carb': { icon: '🥩', label: 'Low-Carb' },
  halal: { icon: '☪️', label: 'Halal' },
  kosher: { icon: '✡️', label: 'Kosher' },
  paleo: { icon: '🦴', label: 'Paleo' },
  mediterranean: { icon: '🫒', label: 'Mediterranean' },
  'dairy-free': { icon: '🥛', label: 'Dairy-Free' },
  'gluten-free': { icon: '🌾', label: 'Gluten-Free' },
  'nut-free': { icon: '🥜', label: 'Nut-Free' },
  'egg-free': { icon: '🥚', label: 'Egg-Free' },
  'soy-free': { icon: '🫘', label: 'Soy-Free' },
  'shellfish-free': { icon: '🦐', label: 'Shellfish-Free' },
  'low-fodmap': { icon: '🧬', label: 'Low-FODMAP' },
}

export const DIETARY_OPTIONS: { value: DietaryPreference; icon: string; label: string }[] =
  DIETARY_PREFERENCES.map(value => ({ value, ...DIETARY_META[value] }))

// Maps to the STATIC_PAL multipliers in macro-calculator.ts (1.2 / 1.375 /
// 1.55 / 1.725). Four options rather than five: 'very_active' (1.9,
// athlete-tier) stays reachable via the type but isn't offered — day-to-day
// self-reports at that level are nearly always overestimates.
export const ACTIVITY_OPTIONS: { value: ActivityLevel; icon: string; label: string; description: string }[] = [
  { value: 'sedentary', icon: '🪑', label: 'Sedentary', description: 'Desk job, little movement outside training' },
  { value: 'light', icon: '🚶', label: 'Lightly Active', description: 'On my feet some of the day, short walks' },
  { value: 'moderate', icon: '🏃', label: 'Moderately Active', description: 'Regular movement most days' },
  { value: 'active', icon: '⚡', label: 'Very Active', description: 'Physical job or on the move all day' },
]

export const MEALS_PER_DAY_OPTIONS: { value: 2 | 3 | 4; icon: string; label: string; description: string }[] = [
  { value: 2, icon: '🍽️', label: '2 meals', description: 'Bigger plates, longer gaps' },
  { value: 3, icon: '🍽️', label: '3 meals', description: 'Classic breakfast / lunch / dinner' },
  { value: 4, icon: '🍽️', label: '4 meals', description: 'Smaller, more frequent plates' },
]

export const COOKING_TIME_OPTIONS: { value: CookingTimePreference; icon: string; label: string; description: string }[] = [
  { value: 'quick', icon: '⏱️', label: 'Quick', description: 'Under 15 minutes — keep it simple' },
  { value: 'moderate', icon: '🍳', label: 'Moderate', description: 'Happy to spend up to ~30 minutes' },
  { value: 'loves_cooking', icon: '👨‍🍳', label: 'Happy to Cook', description: 'Real recipes, real prep — I enjoy it' },
]

// Short labels chosen to substring-match generate-meals's FAMILIAR_CUISINES/
// EXOTIC_CUISINES entries (e.g. "Indian" matches "Indian (North Indian,
// South Indian)") — see selectCuisines in supabase/functions/generate-meals.
export const FAVORITE_CUISINE_OPTIONS: { value: string; icon: string; label: string }[] = [
  { value: 'Italian', icon: '🍝', label: 'Italian' },
  { value: 'Mexican', icon: '🌮', label: 'Mexican' },
  { value: 'Indian', icon: '🍛', label: 'Indian' },
  { value: 'Thai', icon: '🍜', label: 'Thai' },
  { value: 'Mediterranean', icon: '🫒', label: 'Mediterranean' },
  { value: 'Japanese', icon: '🍱', label: 'Japanese' },
  { value: 'Korean', icon: '🥢', label: 'Korean' },
  { value: 'British / Classic', icon: '🇬🇧', label: 'British / Classic' },
  { value: 'American / Diner Classic', icon: '🍔', label: 'American' },
  { value: 'Caribbean', icon: '🌴', label: 'Caribbean' },
]

export const BREAKFAST_STYLE_OPTIONS: { value: BreakfastStyle; icon: string; label: string; description: string }[] = [
  { value: 'quick_cold', icon: '🥣', label: 'Quick & Cold', description: 'Cereal, yoghurt, smoothies — no cooking' },
  { value: 'cooked', icon: '🍳', label: 'Cooked', description: 'Eggs, pancakes, hot oats — happy to cook' },
  { value: 'skip', icon: '⏭️', label: 'Usually Skip', description: 'Keep it minimal if I eat anything at all' },
]

function roundTo(value: number, decimals: number): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals)
}
function lbsToKg(lbs: number): number { return roundTo(lbs / 2.20462, 1) }
function kgToLbs(kg: number): number { return roundTo(kg * 2.20462, 1) }
function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = cm / 2.54
  const feet = Math.floor(totalInches / 12)
  const inches = Math.round(totalInches - feet * 12)
  return { feet, inches: inches === 12 ? 0 : inches }
}
function ftInToCm(feet: number, inches: number): number {
  return roundTo(feet * 30.48 + inches * 2.54, 1)
}

interface OnboardingFlowProps {
  onComplete: (profile: UserProfile) => void
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [isAnimating, setIsAnimating] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [data, setData] = useState<OnboardingData>({
    displayName: '',
    fitnessGoal: null,
    trainingDays: [],
    recoveryCapacity: null,
    conditioningPreference: null,
    sessionDuration: null,
    trainingTime: null,
    equipment: null,
    trainingStyle: null,
    trainingExperience: null,
    injuries: [],
    dietaryPreferences: [],
    age: '',
    gender: 'male',
    heightCm: '',
    weightKg: '',
    knowsWorkingLifts: null,
    knownSquatKg: '',
    knownBenchKg: '',
    knownDeadliftKg: '',
    activityLevel: null,
    mealsPerDay: null,
    includeSnacks: true,
    cookingTime: null,
    favoriteCuisines: [],
    dislikedFoods: '',
    breakfastStyle: null,
  })

  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg')
  const [weightDisplay, setWeightDisplay] = useState('')
  const [heightUnit, setHeightUnit] = useState<HeightUnit>('cm')
  const [heightDisplay, setHeightDisplay] = useState('')
  const [heightFeet, setHeightFeet] = useState('')
  const [heightInches, setHeightInches] = useState('')

  const goNext = useCallback(() => {
    if (isAnimating) return
    setDirection('forward')
    setIsAnimating(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setStep(s => Math.min(s + 1, TOTAL_STEPS - 1))
      setIsAnimating(false)
    }, 250)
  }, [isAnimating])

  const goBack = useCallback(() => {
    if (isAnimating || step === 0) return
    setDirection('back')
    setIsAnimating(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setStep(s => Math.max(s - 1, 0))
      setIsAnimating(false)
    }, 250)
  }, [isAnimating, step])

  const autoAdvance = useCallback((updater: () => void) => {
    updater()
    setTimeout(() => goNext(), 200)
  }, [goNext])

  const handleWeightUnitChange = (newUnit: string) => {
    if (!newUnit || newUnit === weightUnit) return
    const unit = newUnit as WeightUnit
    const currentKg = Number(data.weightKg)
    if (unit === 'lbs' && currentKg > 0) {
      setWeightDisplay(String(kgToLbs(currentKg)))
    } else if (unit === 'kg' && currentKg > 0) {
      setWeightDisplay(String(currentKg))
    } else {
      setWeightDisplay('')
    }
    setWeightUnit(unit)
  }

  const handleWeightInput = (value: string) => {
    setWeightDisplay(value)
    const num = Number(value)
    if (!value || isNaN(num)) {
      setData(d => ({ ...d, weightKg: '' }))
      return
    }
    const kg = weightUnit === 'kg' ? value : String(lbsToKg(num))
    setData(d => ({ ...d, weightKg: kg }))
  }

  const handleHeightUnitChange = (newUnit: string) => {
    if (!newUnit || newUnit === heightUnit) return
    const unit = newUnit as HeightUnit
    const currentCm = Number(data.heightCm)
    if (unit === 'ftin' && currentCm > 0) {
      const { feet, inches } = cmToFtIn(currentCm)
      setHeightFeet(String(feet))
      setHeightInches(String(inches))
    } else if (unit === 'cm' && currentCm > 0) {
      setHeightDisplay(String(currentCm))
    } else {
      setHeightDisplay('')
      setHeightFeet('')
      setHeightInches('')
    }
    setHeightUnit(unit)
  }

  const handleHeightCmInput = (value: string) => {
    setHeightDisplay(value)
    setData(d => ({ ...d, heightCm: value }))
  }

  const handleHeightFeetInput = (value: string) => {
    setHeightFeet(value)
    const cm = String(ftInToCm(Number(value) || 0, Number(heightInches) || 0))
    setData(d => ({ ...d, heightCm: cm }))
  }

  const handleHeightInchesInput = (value: string) => {
    setHeightInches(value)
    const cm = String(ftInToCm(Number(heightFeet) || 0, Number(value) || 0))
    setData(d => ({ ...d, heightCm: cm }))
  }

  const canProceed = (): boolean => {
    switch (step) {
      case 0: return data.displayName.trim().length > 0
      case 1: return !!data.fitnessGoal
      case 2: return !!data.trainingExperience
      case 3: return data.knowsWorkingLifts !== null
      case 4: return data.trainingDays.length > 0
      case 5: return !!data.recoveryCapacity
      case 6: return !!data.conditioningPreference
      case 7: return !!data.sessionDuration
      case 8: return !!data.trainingTime
      case 9: return !!data.equipment
      case 10: return !!data.trainingStyle
      case 11: return true
      case 12: return true
      case 13: return data.mealsPerDay !== null
      case 14: return !!data.cookingTime
      case 15: return true
      case 16: return !!data.age && !!data.heightCm && !!data.weightKg && Number(data.age) > 0 && Number(data.heightCm) > 0 && Number(data.weightKg) > 0
      case 17: return !!data.activityLevel
      case 18: return true
      default: return false
    }
  }

  const handleSubmit = () => {
    const mappedTime: 'morning' | 'evening' =
      data.trainingTime === 'morning' || data.trainingTime === 'midday' ? 'morning' : 'evening'

    const trainingDaysFull = DAYS_FULL.map(day => ({
      day,
      available: data.trainingDays.includes(day.slice(0, 3)),
    }))

    const profile: UserProfile = {
      age: Number(data.age),
      gender: data.gender,
      height_cm: Number(data.heightCm),
      weight_kg: Number(data.weightKg),
      activity_level: data.activityLevel ?? 'moderate',
      meals_per_day: data.mealsPerDay ?? 3,
      include_snacks: data.includeSnacks,
      cooking_time_preference: data.cookingTime ?? 'moderate',
      favorite_cuisines: data.favoriteCuisines,
      disliked_foods: data.dislikedFoods.split(',').map(f => f.trim()).filter(Boolean),
      breakfast_style: data.breakfastStyle ?? undefined,
      fitness_goal: data.fitnessGoal!,
      training_days: trainingDaysFull,
      preferred_time: mappedTime,
      dietary_preferences: data.dietaryPreferences,
      session_duration_preference: data.sessionDuration!,
      workout_split_preference: 'ai_recommendation' as WorkoutSplit,
      macro_calculation_mode: 'STANDARD_STATIC' as MacroCalculationMode,
      equipment_access: data.equipment!,
      training_style: data.trainingStyle!,
      training_experience: data.trainingExperience!,
      // The coach-persona onboarding step is retired (a single unnamed
      // voice now, defined in the chat system prompt) — this column and
      // its values are kept as the seed for a later multi-coach system,
      // so every profile still gets a value, just never asked for.
      coaching_persona: 'supportive' as CoachingPersona,
      recovery_capacity: data.recoveryCapacity!,
      conditioning_preference: data.conditioningPreference!,
      injuries: data.injuries,
      display_name: data.displayName.trim(),
      skip_calibration_week: data.knowsWorkingLifts === true,
      known_squat_kg: data.knowsWorkingLifts === true && data.knownSquatKg ? Number(data.knownSquatKg) : undefined,
      known_bench_kg: data.knowsWorkingLifts === true && data.knownBenchKg ? Number(data.knownBenchKg) : undefined,
      known_deadlift_kg: data.knowsWorkingLifts === true && data.knownDeadliftKg ? Number(data.knownDeadliftKg) : undefined,
    }
    onComplete(profile)
  }

  const getSlideClass = () => {
    if (!isAnimating) return 'translate-x-0 opacity-100'
    return direction === 'forward'
      ? '-translate-x-8 opacity-0'
      : 'translate-x-8 opacity-0'
  }

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <StepWrapper title="What should I call you?" subtitle="Your AI coach will use this name">
            <div className="space-y-4">
              <Input
                type="text"
                placeholder="Your name or nickname"
                value={data.displayName}
                onChange={e => setData(d => ({ ...d, displayName: e.target.value }))}
                className="h-12 text-center text-lg font-medium"
                autoFocus
                maxLength={30}
                onKeyDown={e => { if (e.key === 'Enter' && canProceed()) goNext() }}
              />
            </div>
            <ContinueButton disabled={!canProceed()} onClick={goNext} />
          </StepWrapper>
        )

      case 1:
        return (
          <StepWrapper title="What's your main goal?" subtitle="This shapes everything in your plan">
            <div className="grid grid-cols-2 gap-3">
              {GOAL_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.value}
                  icon={opt.icon}
                  label={opt.label}
                  description={opt.description}
                  selected={data.fitnessGoal === opt.value}
                  onClick={() => autoAdvance(() => setData(d => ({ ...d, fitnessGoal: opt.value })))}
                />
              ))}
            </div>
          </StepWrapper>
        )

      case 2:
        return (
          <StepWrapper title="How much training have you done?" subtitle="Be honest — this decides your exercises, volume, and how fast you progress">
            <div className="grid grid-cols-2 gap-3">
              {EXPERIENCE_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.value}
                  icon={opt.icon}
                  label={opt.label}
                  description={opt.description}
                  selected={data.trainingExperience === opt.value}
                  onClick={() => autoAdvance(() => setData(d => ({ ...d, trainingExperience: opt.value })))}
                />
              ))}
            </div>
          </StepWrapper>
        )

      case 3:
        return (
          <StepWrapper title="Do you know your working lifts?" subtitle="Squat, bench, deadlift — if you train these already, we can skip week 1's calibration">
            <div className="grid grid-cols-2 gap-3">
              <OptionCard
                icon="🌱"
                label="I'm new / not sure"
                description="Start with a calibration week to find my numbers"
                selected={data.knowsWorkingLifts === false}
                onClick={() => autoAdvance(() => setData(d => ({
                  ...d,
                  knowsWorkingLifts: false,
                  knownSquatKg: '',
                  knownBenchKg: '',
                  knownDeadliftKg: '',
                })))}
              />
              <OptionCard
                icon="🎯"
                label="I know my numbers"
                description="Enter my current working weights"
                selected={data.knowsWorkingLifts === true}
                onClick={() => setData(d => ({ ...d, knowsWorkingLifts: true }))}
              />
            </div>
            {data.knowsWorkingLifts === true && (
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-squat" className="text-xs font-medium">Squat (kg)</Label>
                    <Input
                      id="ob-squat"
                      type="number"
                      placeholder="Optional"
                      value={data.knownSquatKg}
                      onChange={e => setData(d => ({ ...d, knownSquatKg: e.target.value }))}
                      min={0}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-bench" className="text-xs font-medium">Bench (kg)</Label>
                    <Input
                      id="ob-bench"
                      type="number"
                      placeholder="Optional"
                      value={data.knownBenchKg}
                      onChange={e => setData(d => ({ ...d, knownBenchKg: e.target.value }))}
                      min={0}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-deadlift" className="text-xs font-medium">Deadlift (kg)</Label>
                    <Input
                      id="ob-deadlift"
                      type="number"
                      placeholder="Optional"
                      value={data.knownDeadliftKg}
                      onChange={e => setData(d => ({ ...d, knownDeadliftKg: e.target.value }))}
                      min={0}
                    />
                  </div>
                </div>
                <ContinueButton onClick={goNext} />
              </div>
            )}
          </StepWrapper>
        )

      case 4:
        return (
          <StepWrapper title="Which days can you train?" subtitle="Tap all that work for your schedule">
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {DAYS_OF_WEEK.map(day => (
                <OptionCard
                  key={day}
                  icon={data.trainingDays.includes(day) ? '✅' : '📅'}
                  label={day}
                  selected={data.trainingDays.includes(day)}
                  compact
                  onClick={() => setData(d => ({
                    ...d,
                    trainingDays: d.trainingDays.includes(day)
                      ? d.trainingDays.filter(x => x !== day)
                      : [...d.trainingDays, day],
                  }))}
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground text-center mt-3">
              {data.trainingDays.length} day{data.trainingDays.length !== 1 ? 's' : ''} selected
            </p>
            <ContinueButton disabled={!canProceed()} onClick={goNext} />
          </StepWrapper>
        )

      case 5:
        return (
          <StepWrapper title="How's your recovery capacity?" subtitle="Sleep, stress, and a physically demanding job all cut into how much training you can absorb">
            <div className="grid grid-cols-1 gap-3">
              {RECOVERY_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.value}
                  icon={opt.icon}
                  label={opt.label}
                  description={opt.description}
                  selected={data.recoveryCapacity === opt.value}
                  onClick={() => autoAdvance(() => setData(d => ({ ...d, recoveryCapacity: opt.value })))}
                />
              ))}
            </div>
          </StepWrapper>
        )

      case 6:
        return (
          <StepWrapper title="How do you feel about cardio?" subtitle="Shapes how much conditioning work shows up in your plan">
            <div className="grid grid-cols-1 gap-3">
              {CONDITIONING_PREF_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.value}
                  icon={opt.icon}
                  label={opt.label}
                  description={opt.description}
                  selected={data.conditioningPreference === opt.value}
                  onClick={() => autoAdvance(() => setData(d => ({ ...d, conditioningPreference: opt.value })))}
                />
              ))}
            </div>
          </StepWrapper>
        )

      case 7:
        return (
          <StepWrapper title="How long are your sessions?" subtitle="We'll scale exercises to fit">
            <div className="grid grid-cols-2 gap-3">
              {DURATION_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.value}
                  icon={opt.icon}
                  label={opt.label}
                  description={opt.description}
                  selected={data.sessionDuration === opt.value}
                  onClick={() => autoAdvance(() => setData(d => ({ ...d, sessionDuration: opt.value })))}
                />
              ))}
            </div>
          </StepWrapper>
        )

      case 8:
        return (
          <StepWrapper title="When do you usually train?" subtitle="Helps optimize your nutrition timing">
            <div className="grid grid-cols-2 gap-3">
              {TIME_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.value}
                  icon={opt.icon}
                  label={opt.label}
                  description={opt.description}
                  selected={data.trainingTime === opt.value}
                  onClick={() => autoAdvance(() => setData(d => ({ ...d, trainingTime: opt.value })))}
                />
              ))}
            </div>
          </StepWrapper>
        )

      case 9:
        return (
          <StepWrapper title="What equipment do you have?" subtitle="Your plan will only use what's available">
            <div className="grid grid-cols-2 gap-3">
              {EQUIPMENT_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.value}
                  icon={opt.icon}
                  label={opt.label}
                  description={opt.description}
                  selected={data.equipment === opt.value}
                  onClick={() => autoAdvance(() => setData(d => ({ ...d, equipment: opt.value })))}
                />
              ))}
            </div>
          </StepWrapper>
        )

      case 10:
        return (
          <StepWrapper title="What's your training style?" subtitle="How you prefer to move">
            <div className="grid grid-cols-2 gap-3">
              {STYLE_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.value}
                  icon={opt.icon}
                  label={opt.label}
                  description={opt.description}
                  selected={data.trainingStyle === opt.value}
                  onClick={() => autoAdvance(() => setData(d => ({ ...d, trainingStyle: opt.value })))}
                />
              ))}
            </div>
          </StepWrapper>
        )

      case 11:
        return (
          <StepWrapper title="Any injuries or problem areas?" subtitle="We'll avoid exercises that stress these">
            <div className="grid grid-cols-2 gap-3">
              {INJURY_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.value}
                  icon={opt.icon}
                  label={opt.label}
                  selected={data.injuries.includes(opt.value)}
                  compact
                  onClick={() => setData(d => ({
                    ...d,
                    injuries: d.injuries.includes(opt.value)
                      ? d.injuries.filter(x => x !== opt.value)
                      : [...d.injuries, opt.value],
                  }))}
                />
              ))}
            </div>
            <ContinueButton onClick={goNext} label={data.injuries.length === 0 ? 'None — Skip' : 'Continue'} />
          </StepWrapper>
        )

      case 12:
        return (
          <StepWrapper title="Dietary preferences?" subtitle="Your meal plan will respect these">
            <div className="grid grid-cols-3 gap-2">
              {DIETARY_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.value}
                  icon={opt.icon}
                  label={opt.label}
                  selected={data.dietaryPreferences.includes(opt.value)}
                  compact
                  onClick={() => setData(d => ({
                    ...d,
                    dietaryPreferences: d.dietaryPreferences.includes(opt.value)
                      ? d.dietaryPreferences.filter(x => x !== opt.value)
                      : [...d.dietaryPreferences, opt.value],
                  }))}
                />
              ))}
            </div>
            <ContinueButton onClick={goNext} label={data.dietaryPreferences.length === 0 ? 'No restrictions — Skip' : 'Continue'} />
          </StepWrapper>
        )

      case 13:
        return (
          <StepWrapper title="How many meals a day?" subtitle="Your meal structure — we'll size portions to fit">
            <div className="grid grid-cols-3 gap-3">
              {MEALS_PER_DAY_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.value}
                  icon={opt.icon}
                  label={opt.label}
                  description={opt.description}
                  selected={data.mealsPerDay === opt.value}
                  onClick={() => setData(d => ({ ...d, mealsPerDay: opt.value }))}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <OptionCard
                icon="🍎"
                label="Snacks too"
                description="Include a snack slot"
                selected={data.includeSnacks}
                compact
                onClick={() => setData(d => ({ ...d, includeSnacks: true }))}
              />
              <OptionCard
                icon="🚫"
                label="No snacks"
                description="Meals only"
                selected={!data.includeSnacks}
                compact
                onClick={() => setData(d => ({ ...d, includeSnacks: false }))}
              />
            </div>
            <ContinueButton disabled={!canProceed()} onClick={goNext} />
          </StepWrapper>
        )

      case 14:
        return (
          <StepWrapper title="How much time for cooking?" subtitle="Meals will match the effort you actually want to spend">
            <div className="grid grid-cols-1 gap-3">
              {COOKING_TIME_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.value}
                  icon={opt.icon}
                  label={opt.label}
                  description={opt.description}
                  selected={data.cookingTime === opt.value}
                  onClick={() => autoAdvance(() => setData(d => ({ ...d, cookingTime: opt.value })))}
                />
              ))}
            </div>
          </StepWrapper>
        )

      case 15:
        return (
          <StepWrapper title="Food preferences?" subtitle="Optional — helps your meal plan feel less random">
            <div className="space-y-5">
              <div>
                <Label className="text-xs font-medium mb-2 block">Favourite cuisines (pick any)</Label>
                <div className="grid grid-cols-3 gap-2">
                  {FAVORITE_CUISINE_OPTIONS.map(opt => (
                    <OptionCard
                      key={opt.value}
                      icon={opt.icon}
                      label={opt.label}
                      selected={data.favoriteCuisines.includes(opt.value)}
                      compact
                      onClick={() => setData(d => ({
                        ...d,
                        favoriteCuisines: d.favoriteCuisines.includes(opt.value)
                          ? d.favoriteCuisines.filter(x => x !== opt.value)
                          : [...d.favoriteCuisines, opt.value],
                      }))}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-disliked" className="text-xs font-medium">Foods you dislike (comma-separated)</Label>
                <Input
                  id="ob-disliked"
                  placeholder="e.g. mushrooms, olives, blue cheese"
                  value={data.dislikedFoods}
                  onChange={e => setData(d => ({ ...d, dislikedFoods: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs font-medium mb-2 block">Breakfast style</Label>
                <div className="grid grid-cols-1 gap-2">
                  {BREAKFAST_STYLE_OPTIONS.map(opt => (
                    <OptionCard
                      key={opt.value}
                      icon={opt.icon}
                      label={opt.label}
                      description={opt.description}
                      selected={data.breakfastStyle === opt.value}
                      compact
                      onClick={() => setData(d => ({ ...d, breakfastStyle: d.breakfastStyle === opt.value ? null : opt.value }))}
                    />
                  ))}
                </div>
              </div>
            </div>
            <ContinueButton onClick={goNext} label={data.favoriteCuisines.length === 0 && !data.dislikedFoods && !data.breakfastStyle ? 'No preference — Skip' : 'Continue'} />
          </StepWrapper>
        )

      case 16:
        return (
          <StepWrapper title="Your body metrics" subtitle="Used to calculate your targets">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ob-age" className="text-xs font-medium">Age</Label>
                  <Input id="ob-age" type="number" placeholder="25" value={data.age} onChange={e => setData(d => ({ ...d, age: e.target.value }))} min={14} max={100} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Sex</Label>
                  <ToggleGroup type="single" variant="outline" value={data.gender} onValueChange={v => { if (v) setData(d => ({ ...d, gender: v as 'male' | 'female' })) }} className="w-full">
                    <ToggleGroupItem value="male" className="flex-1">Male</ToggleGroupItem>
                    <ToggleGroupItem value="female" className="flex-1">Female</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Height</Label>
                <div className="flex items-center gap-2">
                  {heightUnit === 'cm' ? (
                    <Input type="number" placeholder="175" value={heightDisplay} onChange={e => handleHeightCmInput(e.target.value)} min={100} max={250} className="flex-1" />
                  ) : (
                    <div className="flex flex-1 items-center gap-2">
                      <div className="relative flex-1">
                        <Input type="number" placeholder="5" value={heightFeet} onChange={e => handleHeightFeetInput(e.target.value)} min={3} max={8} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ft</span>
                      </div>
                      <div className="relative flex-1">
                        <Input type="number" placeholder="10" value={heightInches} onChange={e => handleHeightInchesInput(e.target.value)} min={0} max={11} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">in</span>
                      </div>
                    </div>
                  )}
                  <ToggleGroup type="single" size="sm" variant="outline" value={heightUnit} onValueChange={handleHeightUnitChange}>
                    <ToggleGroupItem value="cm">cm</ToggleGroupItem>
                    <ToggleGroupItem value="ftin">ft/in</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Weight</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" placeholder={weightUnit === 'kg' ? '70' : '154'} value={weightDisplay} onChange={e => handleWeightInput(e.target.value)} min={weightUnit === 'kg' ? 30 : 66} max={weightUnit === 'kg' ? 300 : 660} step="0.1" className="flex-1" />
                  <ToggleGroup type="single" size="sm" variant="outline" value={weightUnit} onValueChange={handleWeightUnitChange}>
                    <ToggleGroupItem value="kg">kg</ToggleGroupItem>
                    <ToggleGroupItem value="lbs">lbs</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
            </div>
            <ContinueButton disabled={!canProceed()} onClick={goNext} />
          </StepWrapper>
        )

      case 17:
        return (
          <StepWrapper title="How active is your day-to-day?" subtitle="Outside of training — this sets your calorie burn baseline">
            <div className="grid grid-cols-2 gap-3">
              {ACTIVITY_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.value}
                  icon={opt.icon}
                  label={opt.label}
                  description={opt.description}
                  selected={data.activityLevel === opt.value}
                  onClick={() => autoAdvance(() => setData(d => ({ ...d, activityLevel: opt.value })))}
                />
              ))}
            </div>
          </StepWrapper>
        )

      case 18:
        return (
          <StepWrapper title={`Ready to go, ${data.displayName}!`} subtitle="Review your selections">
            <Card className="bg-muted/50 border-dashed">
              <CardContent className="pt-4 text-sm space-y-2">
                <ReviewRow label="Name" value={data.displayName} />
                <ReviewRow label="Goal" value={GOAL_OPTIONS.find(o => o.value === data.fitnessGoal)?.label} />
                <ReviewRow label="Training Days" value={`${data.trainingDays.join(', ')} (${data.trainingDays.length} days)`} />
                <ReviewRow label="Recovery Capacity" value={RECOVERY_OPTIONS.find(o => o.value === data.recoveryCapacity)?.label} />
                <ReviewRow label="Conditioning" value={CONDITIONING_PREF_OPTIONS.find(o => o.value === data.conditioningPreference)?.label} />
                <ReviewRow label="Session Length" value={DURATION_OPTIONS.find(o => o.value === data.sessionDuration)?.label} />
                <ReviewRow label="Time of Day" value={TIME_OPTIONS.find(o => o.value === data.trainingTime)?.label} />
                <ReviewRow label="Equipment" value={EQUIPMENT_OPTIONS.find(o => o.value === data.equipment)?.label} />
                <ReviewRow label="Style" value={STYLE_OPTIONS.find(o => o.value === data.trainingStyle)?.label} />
                <ReviewRow label="Experience" value={EXPERIENCE_OPTIONS.find(o => o.value === data.trainingExperience)?.label} />
                <ReviewRow label="Week 1" value={getCalibrationSummary(data)} />
                <ReviewRow label="Injuries" value={data.injuries.length > 0 ? data.injuries.map(i => INJURY_OPTIONS.find(o => o.value === i)?.label).join(', ') : 'None'} />
                <ReviewRow label="Diet" value={data.dietaryPreferences.length > 0 ? data.dietaryPreferences.map(p => DIETARY_OPTIONS.find(o => o.value === p)?.label).join(', ') : 'No restrictions'} />
                <ReviewRow label="Metrics" value={`${data.age}y, ${data.gender}, ${data.weightKg}kg, ${data.heightCm}cm`} />
                <ReviewRow label="Daily Activity" value={ACTIVITY_OPTIONS.find(o => o.value === data.activityLevel)?.label} />
                <ReviewRow label="Meals" value={`${data.mealsPerDay ?? 3} per day${data.includeSnacks ? ' + snacks' : ', no snacks'}`} />
                <ReviewRow label="Cooking Time" value={COOKING_TIME_OPTIONS.find(o => o.value === data.cookingTime)?.label} />
                <ReviewRow label="Favourite Cuisines" value={data.favoriteCuisines.length > 0 ? data.favoriteCuisines.join(', ') : 'No preference'} />
                <ReviewRow label="Disliked Foods" value={data.dislikedFoods || 'None'} />
                <ReviewRow label="Breakfast Style" value={BREAKFAST_STYLE_OPTIONS.find(o => o.value === data.breakfastStyle)?.label ?? 'No preference'} />
              </CardContent>
            </Card>
            <Button onClick={handleSubmit} className="w-full mt-4 h-12 text-base font-semibold">
              Generate My Plan
            </Button>
          </StepWrapper>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Dumbbell className="size-6 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Personal TrAIner</h1>
        </div>

        <Progress value={((step + 1) / TOTAL_STEPS) * 100} className="mb-6 h-1.5" />

        <div className="relative">
          {step > 0 && (
            <button
              onClick={goBack}
              className="absolute -top-10 left-0 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="size-4" />
              Back
            </button>
          )}

          <div className={`transition-all duration-250 ease-out ${getSlideClass()}`}>
            {renderStep()}
          </div>
        </div>
      </div>
    </div>
  )
}

function StepWrapper({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function ContinueButton({ disabled, onClick, label = 'Continue' }: { disabled?: boolean; onClick: () => void; label?: string }) {
  return (
    <Button onClick={onClick} disabled={disabled} className="w-full mt-4 h-11">
      {label}
    </Button>
  )
}

function getCalibrationSummary(data: OnboardingData): string {
  if (!data.knowsWorkingLifts) return "Calibration week — we'll find your numbers"
  const lifts = [
    data.knownSquatKg && `Squat ${data.knownSquatKg}kg`,
    data.knownBenchKg && `Bench ${data.knownBenchKg}kg`,
    data.knownDeadliftKg && `Deadlift ${data.knownDeadliftKg}kg`,
  ].filter(Boolean)
  return lifts.length > 0 ? `Seeded from your numbers (${lifts.join(', ')})` : 'Seeded from your numbers'
}

function ReviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <p>
      <span className="font-medium text-foreground">{label}:</span>{' '}
      <span className="text-muted-foreground">{value || '—'}</span>
    </p>
  )
}
