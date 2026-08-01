import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, Dumbbell } from 'lucide-react'
import { OptionCard } from './OptionCard'
import type { UserProfile, FitnessGoal, SessionDuration, TrainingTime, WorkoutSplit, EquipmentAccess, TrainingStyle, TrainingExperience, CoachingPersona, MacroCalculationMode } from '@/lib/types'

type WeightUnit = 'kg' | 'lbs'
type HeightUnit = 'cm' | 'ftin'

interface OnboardingData {
  displayName: string
  fitnessGoal: FitnessGoal | null
  trainingDays: string[]
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
  coachingPersona: CoachingPersona | null
  /** null = unanswered; false = "I'm new / not sure" (calibration week); true = "I know my numbers" (known lifts below). */
  knowsWorkingLifts: boolean | null
  knownSquatKg: string
  knownBenchKg: string
  knownDeadliftKg: string
}

const TOTAL_STEPS = 14

const EXPERIENCE_OPTIONS: { value: TrainingExperience; icon: string; label: string; description: string }[] = [
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

const DURATION_OPTIONS: { value: SessionDuration; icon: string; label: string; description: string }[] = [
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

const EQUIPMENT_OPTIONS: { value: EquipmentAccess; icon: string; label: string; description: string }[] = [
  { value: 'full_gym', icon: '🏢', label: 'Full Gym', description: 'All machines & free weights' },
  { value: 'home_gym', icon: '🏠', label: 'Home Gym', description: 'Barbell, dumbbells, bench' },
  { value: 'minimalist', icon: '🎒', label: 'Minimalist', description: 'Bands & kettlebells' },
  { value: 'bodyweight', icon: '🤸', label: 'Bodyweight Only', description: 'No equipment needed' },
]

const STYLE_OPTIONS: { value: TrainingStyle; icon: string; label: string; description: string }[] = [
  { value: 'functional', icon: '🏃', label: 'Functional / Athletic', description: 'Explosive & dynamic' },
  { value: 'bodybuilding', icon: '🏆', label: 'Bodybuilding', description: 'Aesthetics & symmetry' },
  { value: 'combat', icon: '🥊', label: 'Combat / Conditioning', description: 'Fight-ready fitness' },
  { value: 'hybrid', icon: '⚙️', label: 'Hybrid', description: 'Best of everything' },
]

const INJURY_OPTIONS: { value: string; icon: string; label: string }[] = [
  { value: 'lower_back', icon: '🔙', label: 'Lower Back' },
  { value: 'knees', icon: '🦵', label: 'Knees' },
  { value: 'shoulders', icon: '💪', label: 'Shoulders' },
  { value: 'neck', icon: '🧣', label: 'Neck' },
  { value: 'wrists', icon: '✋', label: 'Wrists' },
  { value: 'hips', icon: '🦴', label: 'Hips' },
  { value: 'ankles', icon: '🦶', label: 'Ankles' },
  { value: 'elbows', icon: '💪', label: 'Elbows' },
]

const DIETARY_OPTIONS: { value: string; icon: string; label: string }[] = [
  { value: 'vegetarian', icon: '🥬', label: 'Vegetarian' },
  { value: 'vegan', icon: '🌱', label: 'Vegan' },
  { value: 'pescatarian', icon: '🐟', label: 'Pescatarian' },
  { value: 'keto', icon: '🥑', label: 'Keto' },
  { value: 'low-carb', icon: '🥩', label: 'Low-Carb' },
  { value: 'halal', icon: '☪️', label: 'Halal' },
  { value: 'kosher', icon: '✡️', label: 'Kosher' },
  { value: 'paleo', icon: '🦴', label: 'Paleo' },
  { value: 'mediterranean', icon: '🫒', label: 'Mediterranean' },
  { value: 'dairy-free', icon: '🥛', label: 'Dairy-Free' },
  { value: 'gluten-free', icon: '🌾', label: 'Gluten-Free' },
  { value: 'nut-free', icon: '🥜', label: 'Nut-Free' },
  { value: 'egg-free', icon: '🥚', label: 'Egg-Free' },
  { value: 'soy-free', icon: '🫘', label: 'Soy-Free' },
  { value: 'shellfish-free', icon: '🦐', label: 'Shellfish-Free' },
  { value: 'low-fodmap', icon: '🧬', label: 'Low-FODMAP' },
]

const PERSONA_OPTIONS: { value: CoachingPersona; icon: string; label: string; description: string }[] = [
  { value: 'drill_sergeant', icon: '🎖️', label: 'Drill Sergeant', description: 'No excuses, push harder' },
  { value: 'analytical', icon: '🧠', label: 'Analytical', description: 'Data-driven, precise' },
  { value: 'supportive', icon: '🤝', label: 'Supportive', description: 'Encouraging & patient' },
  { value: 'hype', icon: '🔥', label: 'Hype Coach', description: 'Maximum energy & motivation' },
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
    coachingPersona: null,
    knowsWorkingLifts: null,
    knownSquatKg: '',
    knownBenchKg: '',
    knownDeadliftKg: '',
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
      case 5: return !!data.sessionDuration
      case 6: return !!data.trainingTime
      case 7: return !!data.equipment
      case 8: return !!data.trainingStyle
      case 9: return true
      case 10: return true
      case 11: return !!data.age && !!data.heightCm && !!data.weightKg && Number(data.age) > 0 && Number(data.heightCm) > 0 && Number(data.weightKg) > 0
      case 12: return !!data.coachingPersona
      case 13: return true
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
      activity_level: 'moderate',
      fitness_goal: data.fitnessGoal!,
      training_days: trainingDaysFull,
      preferred_time: mappedTime,
      dietary_preferences: data.dietaryPreferences,
      session_duration_preference: data.sessionDuration!,
      training_time_preference: data.trainingTime!,
      workout_split_preference: 'ai_recommendation' as WorkoutSplit,
      macro_calculation_mode: 'STANDARD_STATIC' as MacroCalculationMode,
      equipment_access: data.equipment!,
      training_style: data.trainingStyle!,
      training_experience: data.trainingExperience!,
      coaching_persona: data.coachingPersona!,
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

      case 6:
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

      case 7:
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

      case 8:
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

      case 9:
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

      case 10:
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

      case 11:
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

      case 12:
        return (
          <StepWrapper title="How should your AI coach talk?" subtitle="Sets the tone for chat & advice">
            <div className="grid grid-cols-2 gap-3">
              {PERSONA_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.value}
                  icon={opt.icon}
                  label={opt.label}
                  description={opt.description}
                  selected={data.coachingPersona === opt.value}
                  onClick={() => autoAdvance(() => setData(d => ({ ...d, coachingPersona: opt.value })))}
                />
              ))}
            </div>
          </StepWrapper>
        )

      case 13:
        return (
          <StepWrapper title={`Ready to go, ${data.displayName}!`} subtitle="Review your selections">
            <Card className="bg-muted/50 border-dashed">
              <CardContent className="pt-4 text-sm space-y-2">
                <ReviewRow label="Name" value={data.displayName} />
                <ReviewRow label="Goal" value={GOAL_OPTIONS.find(o => o.value === data.fitnessGoal)?.label} />
                <ReviewRow label="Training Days" value={`${data.trainingDays.join(', ')} (${data.trainingDays.length} days)`} />
                <ReviewRow label="Session Length" value={DURATION_OPTIONS.find(o => o.value === data.sessionDuration)?.label} />
                <ReviewRow label="Time of Day" value={TIME_OPTIONS.find(o => o.value === data.trainingTime)?.label} />
                <ReviewRow label="Equipment" value={EQUIPMENT_OPTIONS.find(o => o.value === data.equipment)?.label} />
                <ReviewRow label="Style" value={STYLE_OPTIONS.find(o => o.value === data.trainingStyle)?.label} />
                <ReviewRow label="Experience" value={EXPERIENCE_OPTIONS.find(o => o.value === data.trainingExperience)?.label} />
                <ReviewRow label="Week 1" value={getCalibrationSummary(data)} />
                <ReviewRow label="Injuries" value={data.injuries.length > 0 ? data.injuries.map(i => INJURY_OPTIONS.find(o => o.value === i)?.label).join(', ') : 'None'} />
                <ReviewRow label="Diet" value={data.dietaryPreferences.length > 0 ? data.dietaryPreferences.map(p => DIETARY_OPTIONS.find(o => o.value === p)?.label).join(', ') : 'No restrictions'} />
                <ReviewRow label="Metrics" value={`${data.age}y, ${data.gender}, ${data.weightKg}kg, ${data.heightCm}cm`} />
                <ReviewRow label="Coach Persona" value={PERSONA_OPTIONS.find(o => o.value === data.coachingPersona)?.label} />
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
