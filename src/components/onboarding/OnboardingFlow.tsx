import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, Dumbbell } from 'lucide-react'
import { OptionCard } from './OptionCard'
import {
  GOAL_OPTIONS,
  EXPERIENCE_OPTIONS,
  RECOVERY_OPTIONS,
  CONDITIONING_PREF_OPTIONS,
  DURATION_OPTIONS,
  TIME_OPTIONS,
  EQUIPMENT_OPTIONS,
  STYLE_OPTIONS,
  INJURY_OPTIONS,
  DIETARY_OPTIONS,
  ACTIVITY_OPTIONS,
  MEALS_PER_DAY_OPTIONS,
  COOKING_TIME_OPTIONS,
  FAVORITE_CUISINE_OPTIONS,
  BREAKFAST_STYLE_OPTIONS,
  DAYS_OF_WEEK,
  initialSlotValues,
  toggleValue,
  assembleProfile,
  type OnboardingSlotValues,
} from '@/lib/onboarding-slots'
import type { UserProfile } from '@/lib/types'

type WeightUnit = 'kg' | 'lbs'
type HeightUnit = 'cm' | 'ftin'

// The questionnaire's working state IS the shared slot-values shape — the
// option lists, per-slot validation, and the values→UserProfile transform all
// live in src/lib/onboarding-slots.ts, shared with the conversational intake
// path. This file owns only the step-by-step form presentation.
type OnboardingData = OnboardingSlotValues

const TOTAL_STEPS = 19

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

  // gender: 'male' preserves the form's historical pre-selection (the shared
  // initialSlotValues() starts it null — the conversational path requires an
  // explicit answer instead of shipping a silent default).
  const [data, setData] = useState<OnboardingData>({ ...initialSlotValues(), gender: 'male' })

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
    // The values→UserProfile transform (time-of-day collapse, day-name
    // expansion, never-asked constants) lives in onboarding-slots.ts so the
    // conversational path produces an identical profile by construction.
    onComplete(assembleProfile(data))
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
                  onClick={() => setData(d => ({ ...d, trainingDays: toggleValue(d.trainingDays, day) }))}
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
                  onClick={() => setData(d => ({ ...d, injuries: toggleValue(d.injuries, opt.value) }))}
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
                  onClick={() => setData(d => ({ ...d, dietaryPreferences: toggleValue(d.dietaryPreferences, opt.value) }))}
                />
              ))}
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground/70 text-center">
              These filters check ingredients we recognise. We can't check brands,
              preparation, or cross-contamination. If you have a food allergy,
              always check ingredients yourself.
            </p>
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
                      onClick={() => setData(d => ({ ...d, favoriteCuisines: toggleValue(d.favoriteCuisines, opt.value) }))}
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
                  <ToggleGroup type="single" variant="outline" value={data.gender ?? 'male'} onValueChange={v => { if (v) setData(d => ({ ...d, gender: v as 'male' | 'female' })) }} className="w-full">
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
