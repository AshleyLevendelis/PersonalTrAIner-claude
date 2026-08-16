import { DIETARY_PREFERENCES, type DietaryPreference } from '@/lib/diet-rules'
import type {
  UserProfile,
  FitnessGoal,
  SessionDuration,
  TrainingTime,
  WorkoutSplit,
  EquipmentAccess,
  TrainingStyle,
  TrainingExperience,
  CoachingPersona,
  MacroCalculationMode,
  RecoveryCapacity,
  ConditioningPreference,
  ActivityLevel,
  CookingTimePreference,
  BreakfastStyle,
} from '@/lib/types'

// ---------------------------------------------------------------------------
// THE shared definition of what an onboarding needs — read by both intake
// surfaces (the fixed questionnaire in OnboardingFlow.tsx and the
// conversational flow in ConversationalOnboarding.tsx) so a future field is
// added exactly once. Three layers live here:
//
//   1. The option arrays (moved out of OnboardingFlow.tsx, where they were
//      exported ad hoc for ProfileScreen) — the closed sets themselves.
//   2. ONBOARDING_SLOTS — per-answer semantics: control type, required-ness,
//      allowed values, numeric bounds, and where the value ultimately lands.
//      This is what lets a chat surface validate a mapped answer instead of
//      trusting free text ("fail loud, never store silently").
//   3. assembleProfile() — the ONE place slot values become a UserProfile,
//      including the lossy trainingTime→preferred_time collapse and the
//      never-asked constants, so both paths produce identical rows by
//      construction rather than by parallel maintenance.
//
// Two destination subtleties encoded here rather than left as tribal
// knowledge: dislikedFoods does NOT go to a profile column (its real
// destination is user_facts — see the deprecation note on
// UserProfile.disliked_foods in types.ts), and trainingTime's 5-way answer
// is deliberately collapsed to the 2-way preferred_time column.
// ---------------------------------------------------------------------------

export interface SlotOption {
  value: string | number
  icon: string
  label: string
  description?: string
}

export const EXPERIENCE_OPTIONS: { value: TrainingExperience; icon: string; label: string; description: string }[] = [
  { value: 'beginner', icon: '🌱', label: 'Beginner', description: 'New to this, or coming back after a long break' },
  { value: 'novice', icon: '📈', label: 'Novice', description: '6+ months training fairly consistently' },
  { value: 'intermediate', icon: '🎯', label: 'Intermediate', description: '2+ years, comfortable with the main lifts' },
  { value: 'advanced', icon: '🏅', label: 'Advanced', description: 'Years of training, progress comes slowly now' },
]

export const GOAL_OPTIONS: { value: FitnessGoal; icon: string; label: string; description: string }[] = [
  { value: 'fat_loss', icon: '🔥', label: 'Fat Loss', description: 'Shred body fat, get lean' },
  { value: 'hypertrophy', icon: '💪', label: 'Muscle Growth', description: 'Build size & strength' },
  { value: 'functional', icon: '⚡', label: 'Functional Strength', description: 'Move better, lift heavier' },
  { value: 'conditioning', icon: '❤️', label: 'Conditioning', description: 'Cardio & endurance' },
]

export const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

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

export const TIME_OPTIONS: { value: TrainingTime; icon: string; label: string; description: string }[] = [
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

/**
 * All 8 codes are live somewhere: 5 (lower_back/knees/shoulders/neck/wrists)
 * drive exercise-selection joint filtering (INJURED_JOINTS, exercise-plan.ts),
 * and warmup.ts's mobility-drill contraindications additionally consume
 * hips/ankles/elbows. A conversational capture must resolve into THESE exact
 * codes or re-ask — an unrecognized string is silently inert in every filter.
 */
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
  'fish-free': { icon: '🐟', label: 'Fish-Free' },
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
// The value strings are load-bearing; do not rename them.
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

/**
 * The one multi-select toggle, previously hand-duplicated four times inline
 * in OnboardingFlow's switch cases (trainingDays/injuries/dietary/cuisines).
 */
export function toggleValue<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter(x => x !== value) : [...arr, value]
}

// ---------------------------------------------------------------------------
// Slot values — the working state both intake surfaces accumulate. Identical
// to OnboardingFlow's historical local OnboardingData shape (numerics stay
// strings until assembleProfile converts, matching the form's input fields).
// ---------------------------------------------------------------------------

export interface OnboardingSlotValues {
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
  gender: 'male' | 'female' | null
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

/**
 * gender starts null here — an explicit answer is required by the slot
 * definition. The questionnaire keeps its historical 'male' pre-selection in
 * its own local state (unchanged behavior for the form path); the
 * conversational path never defaults it.
 */
export function initialSlotValues(): OnboardingSlotValues {
  return {
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
    gender: null,
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
  }
}

// ---------------------------------------------------------------------------
// Slot definitions
// ---------------------------------------------------------------------------

export type SlotKey = keyof OnboardingSlotValues

export interface SlotDef {
  key: SlotKey
  /** Coach-voice question — used as the chip card title in chat and mirrors the form's step title. */
  question: string
  control: 'single' | 'multi' | 'text' | 'numeric' | 'boolean'
  /**
   * required=true means the value must be non-empty/valid before completion.
   * required=false slots still must be explicitly ASKED (confirmed, possibly
   * as an explicit skip) unless listed in NEVER_BLOCKING below — mirroring
   * the form, where skippable steps still render and need a deliberate tap.
   */
  required: boolean
  options?: readonly SlotOption[]
  /** Numeric bounds (inclusive) — ProfileScreen's established edit bounds, now applied at intake too. */
  min?: number
  max?: number
  /**
   * 'column'     → a fitness_profiles column via assembleProfile.
   * 'user_facts' → NOT a profile column (dislikedFoods → user_facts rows).
   * 'derived'    → feeds a transform, stored only in collapsed form
   *                (trainingTime → preferred_time).
   */
  destination: 'column' | 'user_facts' | 'derived'
  validate: (value: unknown) => boolean
}

const isOneOf = (options: readonly SlotOption[]) => (value: unknown) =>
  options.some(o => String(o.value) === String(value))

const isSubsetOf = (options: readonly SlotOption[]) => (value: unknown) =>
  Array.isArray(value) && value.every(v => options.some(o => String(o.value) === String(v)))

const isNumberIn = (min: number, max: number) => (value: unknown) => {
  const n = Number(value)
  return value !== '' && value !== null && !Number.isNaN(n) && n >= min && n <= max
}

const DAY_OPTIONS: SlotOption[] = DAYS_OF_WEEK.map(d => ({ value: d, icon: '📅', label: d }))
const GENDER_OPTIONS: SlotOption[] = [
  { value: 'male', icon: '♂️', label: 'Male' },
  { value: 'female', icon: '♀️', label: 'Female' },
]
const KNOWS_LIFTS_OPTIONS: SlotOption[] = [
  { value: 'false', icon: '🌱', label: "I'm new / not sure", description: 'Start with a calibration week to find my numbers' },
  { value: 'true', icon: '🎯', label: 'I know my numbers', description: 'Enter my current working weights' },
]
const SNACKS_OPTIONS: SlotOption[] = [
  { value: 'true', icon: '🍎', label: 'Snacks too', description: 'Include a snack slot' },
  { value: 'false', icon: '🚫', label: 'No snacks', description: 'Meals only' },
]

export const ONBOARDING_SLOTS: SlotDef[] = [
  { key: 'displayName', question: 'What should I call you?', control: 'text', required: true, destination: 'column', validate: v => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 30 },
  { key: 'fitnessGoal', question: "What's your main goal?", control: 'single', required: true, options: GOAL_OPTIONS, destination: 'column', validate: isOneOf(GOAL_OPTIONS) },
  { key: 'trainingExperience', question: 'How much training have you done?', control: 'single', required: true, options: EXPERIENCE_OPTIONS, destination: 'column', validate: isOneOf(EXPERIENCE_OPTIONS) },
  { key: 'knowsWorkingLifts', question: 'Do you know your working lifts (squat, bench, deadlift)?', control: 'single', required: true, options: KNOWS_LIFTS_OPTIONS, destination: 'column', validate: v => v === true || v === false || v === 'true' || v === 'false' },
  { key: 'knownSquatKg', question: 'Squat working weight (kg)?', control: 'numeric', required: false, min: 1, max: 500, destination: 'column', validate: isNumberIn(1, 500) },
  { key: 'knownBenchKg', question: 'Bench working weight (kg)?', control: 'numeric', required: false, min: 1, max: 400, destination: 'column', validate: isNumberIn(1, 400) },
  { key: 'knownDeadliftKg', question: 'Deadlift working weight (kg)?', control: 'numeric', required: false, min: 1, max: 500, destination: 'column', validate: isNumberIn(1, 500) },
  { key: 'trainingDays', question: 'Which days can you actually train?', control: 'multi', required: true, options: DAY_OPTIONS, destination: 'column', validate: v => isSubsetOf(DAY_OPTIONS)(v) && Array.isArray(v) && v.length > 0 },
  { key: 'recoveryCapacity', question: "How's your recovery capacity — sleep, stress, physical job?", control: 'single', required: true, options: RECOVERY_OPTIONS, destination: 'column', validate: isOneOf(RECOVERY_OPTIONS) },
  { key: 'conditioningPreference', question: 'How do you feel about cardio?', control: 'single', required: true, options: CONDITIONING_PREF_OPTIONS, destination: 'column', validate: isOneOf(CONDITIONING_PREF_OPTIONS) },
  { key: 'sessionDuration', question: 'How long can your sessions usually run?', control: 'single', required: true, options: DURATION_OPTIONS, destination: 'column', validate: isOneOf(DURATION_OPTIONS) },
  { key: 'trainingTime', question: 'When do you usually train?', control: 'single', required: true, options: TIME_OPTIONS, destination: 'derived', validate: isOneOf(TIME_OPTIONS) },
  { key: 'equipment', question: 'What equipment do you have access to?', control: 'single', required: true, options: EQUIPMENT_OPTIONS, destination: 'column', validate: isOneOf(EQUIPMENT_OPTIONS) },
  { key: 'trainingStyle', question: "What's your training style?", control: 'single', required: true, options: STYLE_OPTIONS, destination: 'column', validate: isOneOf(STYLE_OPTIONS) },
  { key: 'injuries', question: 'Anything that bothers you when you train — something you avoid or work around?', control: 'multi', required: false, options: INJURY_OPTIONS, destination: 'column', validate: isSubsetOf(INJURY_OPTIONS) },
  { key: 'dietaryPreferences', question: 'Any dietary preferences or restrictions?', control: 'multi', required: false, options: DIETARY_OPTIONS, destination: 'column', validate: isSubsetOf(DIETARY_OPTIONS) },
  { key: 'mealsPerDay', question: 'How many meals a day suits you?', control: 'single', required: true, options: MEALS_PER_DAY_OPTIONS, destination: 'column', validate: isOneOf(MEALS_PER_DAY_OPTIONS) },
  { key: 'includeSnacks', question: 'Snacks too, or meals only?', control: 'single', required: false, options: SNACKS_OPTIONS, destination: 'column', validate: v => v === true || v === false || v === 'true' || v === 'false' },
  { key: 'cookingTime', question: 'How much time do you want to spend cooking?', control: 'single', required: true, options: COOKING_TIME_OPTIONS, destination: 'column', validate: isOneOf(COOKING_TIME_OPTIONS) },
  { key: 'favoriteCuisines', question: 'Any favourite cuisines?', control: 'multi', required: false, options: FAVORITE_CUISINE_OPTIONS, destination: 'column', validate: isSubsetOf(FAVORITE_CUISINE_OPTIONS) },
  { key: 'dislikedFoods', question: 'Any foods you just won\'t eat?', control: 'text', required: false, destination: 'user_facts', validate: v => typeof v === 'string' },
  { key: 'breakfastStyle', question: "What's breakfast usually like for you?", control: 'single', required: false, options: BREAKFAST_STYLE_OPTIONS, destination: 'column', validate: isOneOf(BREAKFAST_STYLE_OPTIONS) },
  { key: 'age', question: 'How old are you?', control: 'numeric', required: true, min: 13, max: 100, destination: 'column', validate: isNumberIn(13, 100) },
  { key: 'gender', question: 'Sex (for calorie math)?', control: 'single', required: true, options: GENDER_OPTIONS, destination: 'column', validate: isOneOf(GENDER_OPTIONS) },
  { key: 'heightCm', question: 'How tall are you (cm)?', control: 'numeric', required: true, min: 100, max: 250, destination: 'column', validate: isNumberIn(100, 250) },
  { key: 'weightKg', question: 'What do you weigh right now (kg)?', control: 'numeric', required: true, min: 25, max: 350, destination: 'column', validate: isNumberIn(25, 350) },
  { key: 'activityLevel', question: 'How active is your day-to-day, outside training?', control: 'single', required: true, options: ACTIVITY_OPTIONS, destination: 'column', validate: isOneOf(ACTIVITY_OPTIONS) },
]

export function getSlotDef(key: string): SlotDef | undefined {
  return ONBOARDING_SLOTS.find(s => s.key === key)
}

/**
 * Slots that never gate completion, even on the "explicitly asked" bar: the
 * three known-lift numbers are optional-within-a-question (the form treats
 * them the same), and includeSnacks carries a real default.
 */
export const NEVER_BLOCKING_SLOTS: SlotKey[] = ['knownSquatKg', 'knownBenchKg', 'knownDeadliftKg', 'includeSnacks']

/** Required slots whose VALUE must validate before completion. */
export function missingRequiredSlots(values: OnboardingSlotValues): SlotKey[] {
  return ONBOARDING_SLOTS
    .filter(s => s.required)
    .filter(s => {
      const v = values[s.key]
      if (v === null || v === undefined) return true
      return !s.validate(v as unknown)
    })
    .map(s => s.key)
}

/**
 * Optional slots that must still have been explicitly asked/skipped before
 * completion — the conversational tracker passes its confirmed-set here.
 * Injuries is the load-bearing member: the safety filter must never be left
 * simply un-asked because the model skipped ahead.
 */
export function unconfirmedOptionalSlots(confirmed: ReadonlySet<string>): SlotKey[] {
  return ONBOARDING_SLOTS
    .filter(s => !s.required && !NEVER_BLOCKING_SLOTS.includes(s.key))
    .filter(s => !confirmed.has(s.key))
    .map(s => s.key)
}

// ---------------------------------------------------------------------------
// Profile assembly — the single transform from slot values to UserProfile.
// ---------------------------------------------------------------------------

/**
 * Fields never asked but written on every profile, kept identical across both
 * intake paths. coaching_persona: the coach-persona onboarding step is
 * retired (a single unnamed voice now, defined in the chat system prompt) —
 * the column and its values are kept as the seed for a later multi-coach
 * system, so every profile still gets a value, just never asked for.
 */
export const PROFILE_CONSTANTS = {
  workout_split_preference: 'ai_recommendation' as WorkoutSplit,
  macro_calculation_mode: 'STANDARD_STATIC' as MacroCalculationMode,
  coaching_persona: 'supportive' as CoachingPersona,
} as const

export function assembleProfile(data: OnboardingSlotValues): UserProfile {
  const mappedTime: 'morning' | 'evening' =
    data.trainingTime === 'morning' || data.trainingTime === 'midday' ? 'morning' : 'evening'

  const trainingDaysFull = DAYS_FULL.map(day => ({
    day,
    available: data.trainingDays.includes(day.slice(0, 3)),
  }))

  return {
    age: Number(data.age),
    gender: data.gender ?? 'male',
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
    equipment_access: data.equipment!,
    training_style: data.trainingStyle!,
    training_experience: data.trainingExperience!,
    recovery_capacity: data.recoveryCapacity!,
    conditioning_preference: data.conditioningPreference!,
    injuries: data.injuries,
    display_name: data.displayName.trim(),
    skip_calibration_week: data.knowsWorkingLifts === true,
    known_squat_kg: data.knowsWorkingLifts === true && data.knownSquatKg ? Number(data.knownSquatKg) : undefined,
    known_bench_kg: data.knowsWorkingLifts === true && data.knownBenchKg ? Number(data.knownBenchKg) : undefined,
    known_deadlift_kg: data.knowsWorkingLifts === true && data.knownDeadliftKg ? Number(data.knownDeadliftKg) : undefined,
    ...PROFILE_CONSTANTS,
  }
}

// ---------------------------------------------------------------------------
// Serialization for the onboarding-chat edge function — the slot vocabulary
// travels IN THE REQUEST, so the Deno side never grows its own copy of the
// closed sets (edge functions can't import across the src/lib boundary; every
// hand-duplicated list over there needs a sync gate — this needs none).
// ---------------------------------------------------------------------------

export interface SlotCatalogEntry {
  key: string
  question: string
  control: SlotDef['control']
  required: boolean
  values?: { value: string; label: string }[]
  min?: number
  max?: number
}

export function buildSlotCatalog(): SlotCatalogEntry[] {
  return ONBOARDING_SLOTS.map(s => ({
    key: s.key,
    question: s.question,
    control: s.control,
    required: s.required,
    values: s.options?.map(o => ({ value: String(o.value), label: o.label })),
    min: s.min,
    max: s.max,
  }))
}
