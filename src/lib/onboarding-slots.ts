import { DIETARY_PREFERENCES, type DietaryPreference } from '@/lib/diet-rules'
import type {
  UserProfile,
  FitnessGoal,
  SessionDuration,
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
// THE definition of what an onboarding needs, read by the conversational
// flow (ConversationalOnboarding.tsx) and by ProfileScreen for later edits.
// It was built as a shared source for two intake surfaces; the step-by-step
// questionnaire has since been removed, and the structure was kept because
// the value is the same either way — one place where a field's meaning,
// allowed values and bounds are declared. Three layers live here:
//
//   1. The option arrays (moved out of OnboardingFlow.tsx, where they were
//      exported ad hoc for ProfileScreen) — the closed sets themselves.
//   2. ONBOARDING_SLOTS — per-answer semantics: control type, required-ness,
//      allowed values, numeric bounds, and where the value ultimately lands.
//      This is what lets a chat surface validate a mapped answer instead of
//      trusting free text ("fail loud, never store silently").
//   3. assembleProfile() — the ONE place slot values become a UserProfile,
//      including the never-asked constants and defaults, so both paths
//      produce identical rows by construction rather than by parallel
//      maintenance.
//
// Two destination subtleties encoded here rather than left as tribal
// knowledge: dislikedFoods does NOT go to a profile column (its real
// destination is user_facts — see the deprecation note on
// UserProfile.disliked_foods in types.ts), and 'derived' currently has no
// members — the time-of-day question that used it was removed once measured
// to change nothing about the plan.
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
/*
 * ICONS ARE PRESENTATION; `value` IS THE CONTRACT. Nothing below changes a
 * value, so no filter, tag or rebuild is affected by this list's appearance.
 *
 * Two icons changed after `npm run render:screens` put the real question on
 * screen and a duplicate check confirmed what it showed:
 *   - Shoulders and Elbows BOTH rendered 💪. Two different joints, one icon,
 *     on the question that drives injury filtering — precisely where a
 *     mis-tap costs the most. 💪 is a flexed bicep, which reads as the upper
 *     arm, so Elbows was the one out of place.
 *   - Lower Back was 🔙, the "BACK" arrow — a pun on the English word, not a
 *     body part, and it means "go back" everywhere else a user has seen it.
 *
 * Kept associative rather than anatomical, because this list already is
 * (a scarf for the neck). 🦾 was rejected for Elbows: a prosthetic arm beside
 * an injury checkbox reads as something it does not mean.
 */
export const INJURY_OPTIONS: { value: string; icon: string; label: string }[] = [
  { value: 'lower_back', icon: '🧍', label: 'Lower Back' },
  { value: 'knees', icon: '🦵', label: 'Knees' },
  { value: 'shoulders', icon: '💪', label: 'Shoulders' },
  { value: 'neck', icon: '🧣', label: 'Neck' },
  { value: 'wrists', icon: '✋', label: 'Wrists' },
  { value: 'hips', icon: '🦴', label: 'Hips' },
  { value: 'ankles', icon: '🦶', label: 'Ankles' },
  { value: 'elbows', icon: '🤜', label: 'Elbows' },
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
  // 🍣, not 🐟 — Fish-Free below owns the plain fish. Sharing it meant one
  // icon stood for BOTH "I eat fish" and "I cannot eat fish", opposite
  // meanings on the allergen path. Every other exclusion here wears the food
  // it excludes (🥛 dairy-free, 🥜 nut-free, 🥚 egg-free, 🦐 shellfish-free),
  // so the convention was consistent and Pescatarian was the row breaking it.
  pescatarian: { icon: '🍣', label: 'Pescatarian' },
  keto: { icon: '🥑', label: 'Keto' },
  'low-carb': { icon: '🥩', label: 'Low-Carb' },
  halal: { icon: '☪️', label: 'Halal' },
  kosher: { icon: '✡️', label: 'Kosher' },
  paleo: { icon: '🦴', label: 'Paleo' },
  // Wearing the food they exclude, the convention the comment above defends.
  // No celery emoji exists, so the herb stands in; sesame wears the bagel it
  // is most recognisably on, and sulphites wear the wine they are declared on.
  'celery-free': { icon: '🌿', label: 'Celery-Free' },
  'sesame-free': { icon: '🥯', label: 'Sesame-Free' },
  'mustard-free': { icon: '🌭', label: 'Mustard-Free' },
  'lupin-free': { icon: '🫛', label: 'Lupin-Free' },
  'sulphite-free': { icon: '🍷', label: 'Sulphite-Free' },
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

// Only these seven "-free" tags are structurally enforced — FORBIDDEN_TAGS
// in diet-rules.ts is what generate-meals actually filters against. A
// disclosed allergy needs to land in dietaryPreferences to be kept out of
// meals; being remembered as a fact (record_context_fact) is NOT enough —
// meal generation never reads that table. Confirmed missing live: a "severe
// peanut allergy" disclosed in an onboarding transcript got a reassuring
// reply and a memory note, but the generated plan's filter never saw it.
// "gives me a reaction" and "I react to X" are ordinary ways people disclose
// an allergy and neither fired: "reaction to" only matches the noun form, so
// "sulphites give me a reaction" scanned clean. Broadened deliberately — this
// governs ALL twelve allergens, not just the five added with it, and the
// failure it prevents (a missed disclosure) is worse than the one it risks
// (a tagged food someone could have eaten). Both new forms are unambiguous
// food-allergy phrasings rather than a loosening of the word "reaction".
const ALLERGEN_SIGNAL = /allerg|intoleran|anaphyla|can'?t (eat|have)|cannot (eat|have)|reaction to|gives? me a reaction|\breacts? to\b|brings? me out in|sensitive to|makes? me (sick|ill)|gets? me sick/i

const ALLERGEN_FOOD_PATTERNS: Partial<Record<DietaryPreference, RegExp>> = {
  'nut-free': /\b(peanuts?|tree nuts?|almonds?|cashews?|walnuts?|pistachios?|hazelnuts?|pecans?|macadamia|nuts?)\b/i,
  'dairy-free': /\b(dairy|milk|lactose|cheese)\b/i,
  'gluten-free': /\b(gluten|wheat|celiac|coeliac)\b/i,
  'egg-free': /\beggs?\b/i,
  'soy-free': /\b(soy|soya|soybeans?)\b/i,
  'shellfish-free': /\b(shellfish|shrimp|prawns?|crab|lobster|crustaceans?|mollus[ck]s?|clams?|mussels?|oysters?|scallops?)\b/i,
  'fish-free': /\bfish\b/i,
  // The five that used to have no tag to become. Same conservative shape as
  // the seven above: naming the food is not enough on its own — ALLERGEN_SIGNAL
  // must also fire — so "I love sesame prawn toast" never tags anything.
  'celery-free': /\b(celery|celeriac)\b/i,
  'sesame-free': /\b(sesame|tahini|hummus|houmous)\b/i,
  'mustard-free': /\bmustard\b/i,
  'lupin-free': /\blupins?\b/i,
  'sulphite-free': /\b(sulphites?|sulfites?|sulphur dioxide|sulfur dioxide)\b/i,
}

/**
 * Deterministic safety backstop, independent of the model: free text that
 * BOTH names one of the seven tagged allergen categories AND signals an
 * actual allergy (not just a food mention) returns the matching "-free"
 * tag(s). The signal requirement is what keeps this conservative — "I love
 * shellfish" never matches, only "I'm allergic to shellfish" does — so the
 * failure mode this leaves is a missed unusually-phrased disclosure (the
 * model prompt is the second layer for that), never an over-eager false tag.
 */
export function detectAllergenTags(text: string): DietaryPreference[] {
  if (!ALLERGEN_SIGNAL.test(text)) return []
  const hits: DietaryPreference[] = []
  for (const [tag, pattern] of Object.entries(ALLERGEN_FOOD_PATTERNS) as [DietaryPreference, RegExp][]) {
    if (pattern.test(text)) hits.push(tag)
  }
  return hits
}

/**
 * "I don't know" — the one moment a coach WOULD reach for a list.
 *
 * Ashley's ruling on the questionnaire feel was chips only when you're
 * stuck, and this is the deterministic half of that. The model is told the
 * same thing (present_slot's description, and the three cases in SLOT
 * MECHANICS), but a prompt-only rule is exactly what failed in fa683fc — a
 * loosened instruction changed behaviour nobody predicted and had to be
 * reverted. So the app detects this itself and does not depend on the model
 * noticing.
 *
 * Deliberately narrow: it must be the WHOLE message. "I don't know" alone is
 * someone asking for help; "I don't know, maybe three days a week?" is an
 * answer with a hedge in front of it, and burying that under a chip grid
 * would throw away the answer they just gave.
 */
const STUCK_SIGNAL =
  /^(i )?(really )?(don'?t|do not) know$|^no idea$|^not sure$|^unsure$|^dunno$|^\?+$|^(what|which) (are|were) (my |the )?options\??$|^what are the choices\??$|^(what|which) can i (pick|choose)( from)?\??$|^(give me|show me|what are) (my |the )?options\??$|^help\??$/i

export function isStuckMessage(text: string): boolean {
  return STUCK_SIGNAL.test(text.trim())
}

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
// Slot values — the working state intake accumulates. Identical
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
  dislikedExercises: string
  breakfastStyle: BreakfastStyle | null
}

/**
 * gender starts null here — an explicit answer is required by the slot
 * definition. The retired questionnaire kept a historical 'male' pre-selection in
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
    dislikedExercises: '',
    breakfastStyle: null,
  }
}

// ---------------------------------------------------------------------------
// Slot definitions
// ---------------------------------------------------------------------------

export type SlotKey = keyof OnboardingSlotValues

export interface SlotDef {
  key: SlotKey
  /**
   * Composer placeholder while this slot is the one being waited on, per the
   * v2 design's "contextual placeholder per slot question".
   *
   * With no buttons on screen, the placeholder is the only standing hint at
   * what KIND of answer fits — so it names the shape of the reply ("Gym, home,
   * or a mix?"), never the slot. Optional: a slot without one falls back to
   * "Say anything…", which is the honest default for a question the coach
   * asked in its own words.
   */
  inputHint?: string
  /** Coach-voice question — used as the chip card title in chat and mirrors the form's step title. */
  question: string
  /**
   * Two-or-three-word noun for this answer, e.g. "Goal", "Training days".
   * Used wherever a recorded value is echoed back — the confirmation line in
   * chat, the review card — because repeating the full question there is what
   * made the conversation read like a form being filled in.
   */
  shortLabel: string
  control: 'single' | 'multi' | 'text' | 'numeric' | 'boolean'
  /**
   * required=true means the value must be non-empty/valid before completion.
   * required=false slots still must be explicitly ASKED (confirmed, possibly
   * as an explicit skip) unless listed in NEVER_BLOCKING below — mirroring
   * the form, where skippable steps still render and need a deliberate tap.
   *
   * When requiredIf is also present, THAT decides — see below. Keep
   * required=true on conditionally-required slots so the intent reads
   * correctly at a glance ("this is a required question, for the formats it
   * applies to").
   */
  required: boolean
  /**
   * Conditional applicability. When present, a slot applies only if this
   * returns true for the current answers.
   *
   * A slot whose requiredIf returns false is fully NOT APPLICABLE: it neither
   * blocks completion nor needs an explicit skip, so the coach never asks a
   * question that has no meaning for this person — nobody who just said they
   * don't know their working lifts is then asked for their squat number.
   *
   * Kept as a general mechanism rather than special-cased per slot so a new
   * conditional question is one predicate, not a new branch in every caller.
   */
  requiredIf?: (values: OnboardingSlotValues) => boolean
  options?: readonly SlotOption[]
  /** Numeric bounds (inclusive) — ProfileScreen's established edit bounds, now applied at intake too. */
  min?: number
  max?: number
  /**
   * 'column'     → a fitness_profiles column via assembleProfile.
   * 'user_facts' → NOT a profile column (dislikedFoods → user_facts rows).
   * 'derived'    → feeds a transform, stored only in collapsed form.
   *                No slot uses this today (the time-of-day question did,
   *                until it was removed for changing nothing).
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

/** The three known-lift numbers only apply once someone says they know them. */
function knowsTheirLifts(values: OnboardingSlotValues): boolean {
  return values.knowsWorkingLifts === true
}

/**
 * Does this person's OWN ANSWERS say they aren't exercising yet?
 *
 * The values-based twin of isStartingOut() in starting-out.ts (which takes a
 * full UserProfile, not slot values — the two shapes don't share a type, so
 * this can't just call that function directly). Both read the exact same two
 * questions the same way; kept in step by a check in
 * scripts/test-onboarding-slots.ts that compares this against isStartingOut's
 * real output for representative profiles — if one definition moves without
 * the other, the gate fails rather than the two silently drifting apart.
 *
 * null in either field means "we don't know yet", never "assume yes" — both
 * callers below (the lifts-question gate, the doctor-note gate) depend on
 * that: neither should fire on a guess.
 */
export function isStartingFromNothing(values: OnboardingSlotValues): boolean {
  return values.trainingExperience === 'beginner' && values.activityLevel === 'sedentary'
}

/**
 * Will this person's plan actually contain barbell lifts?
 *
 * Asking "do you know your working weights for squat, bench and deadlift?"
 * before knowing that is a question about equipment they may not have, for
 * lifts they may never be prescribed — someone training bodyweight-only, or
 * someone starting from nothing whose first block is walks, was being asked
 * it regardless. Ashley's call: only ask people who will be lifting barbells.
 *
 * Two conditions, and BOTH answers must be in before the question can apply:
 *   1. They have barbell access at all.
 *   2. They aren't starting from nothing (isStartingFromNothing above).
 */
function willBeLiftingBarbells(values: OnboardingSlotValues): boolean {
  if (values.equipment !== 'full_gym' && values.equipment !== 'home_gym') return false
  if (values.trainingExperience === null || values.activityLevel === null) return false
  return !isStartingFromNothing(values)
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

/**
 * Order matters here, not just as reading convenience: missingRequiredSlots
 * and unconfirmedOptionalSlots both filter over this array preserving
 * declaration order, and that order becomes the model's "STILL UNKNOWN" list
 * and the client's dead-air/stuck-slot fallbacks — so this is the de facto
 * conversation order, whatever the prompt says about it being "just data".
 *
 * Reordered from the original questionnaire-derived sequence after a live
 * audit found the old order structurally broken: activityLevel sat LAST
 * (position 27) despite gating BOTH willBeLiftingBarbells above and the
 * engine's own isStartingFromNothing check, so knowsWorkingLifts — declared
 * 4th — could not actually be asked until the very last question was
 * answered. An experienced lifter who volunteered their numbers early had
 * them silently discarded (nothing in the catalog would accept them yet),
 * then got the barbell questions sprung on them as a surprise appendix after
 * everything else was done.
 *
 * The fix is structural, not cosmetic: routing facts (experience, daily
 * activity, equipment) move to the front so both gates resolve by question 5,
 * and knowsWorkingLifts becomes reachable exactly where it was always meant
 * to sit. From there: the life logistics block (days, session length), then
 * the rest as described in the second reorder below.
 *
 * SECOND REORDER — body metrics move up, and the order is now GATED
 * (scripts/test-onboarding-order.ts).
 *
 * age, heightCm, weightKg and gender used to sit LAST, at #22-25, behind nine
 * consecutive nutrition questions. Those four values drive every prescribed
 * weight in the app — they are why it was once caught fabricating a 50kg
 * woman's loads for everybody — so the single most load-bearing block in
 * onboarding was being collected when attention was lowest and abandonment
 * most likely, and someone who downloaded a TRAINING app was seven questions
 * deep into breakfast before seeing a workout. They now sit at #12-15, and
 * the rule the gate enforces is: everything the training half needs comes
 * before anything the food half needs.
 *
 * Sex moved up with the other three on Ashley's call, overriding the earlier
 * "keep the sensitive question last" placement — the four read as one block
 * ("the bits for the maths") and splitting them made the tail feel like an
 * unannounced appendix, which is the same complaint the first reorder fixed.
 *
 * NEARLY BROKEN AGAIN WHILE FIXING IT: the first draft of this new sequence
 * dropped activityLevel from before the barbell chain, recreating the exact
 * defect the paragraph above describes. The gate caught it — keep
 * activityLevel above knowsWorkingLifts.
 */
export const ONBOARDING_SLOTS: SlotDef[] = [
  { key: 'displayName', question: 'What should I call you?', inputHint: 'Your name…', shortLabel: 'Name', control: 'text', required: false, destination: 'column', validate: v => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 30 },
  { key: 'fitnessGoal', question: "What's your main goal?", inputHint: 'Tell me your goal…', shortLabel: 'Goal', control: 'single', required: true, options: GOAL_OPTIONS, destination: 'column', validate: isOneOf(GOAL_OPTIONS) },
  { key: 'trainingExperience', question: 'How much training have you done?', inputHint: 'Where are you at?', shortLabel: 'Experience', control: 'single', required: true, options: EXPERIENCE_OPTIONS, destination: 'column', validate: isOneOf(EXPERIENCE_OPTIONS) },
  { key: 'activityLevel', question: 'How active is your day-to-day, outside training?', inputHint: 'How active is your day?', shortLabel: 'Daily activity', control: 'single', required: true, options: ACTIVITY_OPTIONS, destination: 'column', validate: isOneOf(ACTIVITY_OPTIONS) },
  { key: 'equipment', question: 'What equipment do you have access to?', inputHint: 'Gym, home, or a mix?', shortLabel: 'Equipment', control: 'single', required: true, options: EQUIPMENT_OPTIONS, destination: 'column', validate: isOneOf(EQUIPMENT_OPTIONS) },
  // MOVED FROM 16th TO 5th (Ashley's ruling). It is the only question whose
  // absence can hurt someone: every other unanswered slot costs accuracy,
  // this one costs safety. At 16th it sat behind the age/height/weight/sex
  // block — the four people most often abandon — so someone who answered the
  // first eleven and stopped received a complete plan with no injury
  // filtering at all.
  //
  // Above the barbell chain deliberately, not incidentally: asking a trainee
  // to type a deadlift number BEFORE they have had a chance to mention their
  // back is the wrong order to ask those two questions in.
  { key: 'injuries', question: 'Anything that bothers you when you train — something you avoid or work around?', inputHint: 'Anything that bothers you?', shortLabel: 'Niggles', control: 'multi', required: false, options: INJURY_OPTIONS, destination: 'column', validate: isSubsetOf(INJURY_OPTIONS) },
  { key: 'knowsWorkingLifts', question: 'Do you know your working lifts (squat, bench, deadlift)?', inputHint: 'Do you know your numbers?', shortLabel: 'Working lifts', control: 'single', required: true, requiredIf: willBeLiftingBarbells, options: KNOWS_LIFTS_OPTIONS, destination: 'column', validate: v => v === true || v === false || v === 'true' || v === 'false' },
  // Only meaningful once someone has said they DO know their numbers.
  { key: 'knownSquatKg', question: 'Squat working weight (kg)?', shortLabel: 'Squat', control: 'numeric', required: false, requiredIf: knowsTheirLifts, min: 1, max: 500, destination: 'column', validate: isNumberIn(1, 500) },
  { key: 'knownBenchKg', question: 'Bench working weight (kg)?', shortLabel: 'Bench', control: 'numeric', required: false, requiredIf: knowsTheirLifts, min: 1, max: 400, destination: 'column', validate: isNumberIn(1, 400) },
  { key: 'knownDeadliftKg', question: 'Deadlift working weight (kg)?', shortLabel: 'Deadlift', control: 'numeric', required: false, requiredIf: knowsTheirLifts, min: 1, max: 500, destination: 'column', validate: isNumberIn(1, 500) },
  { key: 'trainingDays', question: 'Which days can you actually train?', inputHint: 'Which days?', shortLabel: 'Training days', control: 'multi', required: true, options: DAY_OPTIONS, destination: 'column', validate: v => isSubsetOf(DAY_OPTIONS)(v) && Array.isArray(v) && v.length > 0 },
  { key: 'sessionDuration', question: 'How long can your sessions usually run?', inputHint: 'How long have you got?', shortLabel: 'Session length', control: 'single', required: true, options: DURATION_OPTIONS, destination: 'column', validate: isOneOf(DURATION_OPTIONS) },
  { key: 'age', question: 'How old are you?', inputHint: 'Your age…', shortLabel: 'Age', control: 'numeric', required: false, min: 13, max: 100, destination: 'column', validate: isNumberIn(13, 100) },
  { key: 'heightCm', question: 'How tall are you (cm)?', inputHint: 'Height in cm…', shortLabel: 'Height', control: 'numeric', required: false, min: 100, max: 250, destination: 'column', validate: isNumberIn(100, 250) },
  { key: 'weightKg', question: 'What do you weigh right now (kg)?', inputHint: 'Weight in kg…', shortLabel: 'Weight', control: 'numeric', required: false, min: 25, max: 350, destination: 'column', validate: isNumberIn(25, 350) },
  { key: 'gender', question: 'Which should I use for your calorie and starting-weight maths?', inputHint: 'Whichever fits…', shortLabel: 'Sex', control: 'single', required: false, options: GENDER_OPTIONS, destination: 'column', validate: isOneOf(GENDER_OPTIONS) },
  { key: 'trainingStyle', question: "What's your training style?", inputHint: 'How do you like to train?', shortLabel: 'Style', control: 'single', required: true, options: STYLE_OPTIONS, destination: 'column', validate: isOneOf(STYLE_OPTIONS) },
  { key: 'conditioningPreference', question: 'How do you feel about cardio?', inputHint: 'How do you feel about cardio?', shortLabel: 'Cardio', control: 'single', required: true, options: CONDITIONING_PREF_OPTIONS, destination: 'column', validate: isOneOf(CONDITIONING_PREF_OPTIONS) },
  // REQUIRED, and the comment that used to sit here argued the opposite.
  //
  // It read: "measured to have zero effect anywhere in the generated plan
  // (every option produces a byte-identical plan and mesocycle) — its only
  // real consumer is a chat-greeting default." That was true when written and
  // stopped being true when RECOVERY_SET_MULTIPLIER (goal-policies.ts) landed.
  // Re-measured, full_gym / intermediate / hypertrophy / 4 days / 45-60:
  //
  //   base week (generateExercisePlan)       81 sets for all three — still true
  //   16 weeks (generateMesocycle)           low 912 / moderate 1125 / high 1125
  //
  // So "low" removes 213 sets — 19% of the block. The old comment read as an
  // argument for demoting this to optional, which would have handed the most
  // tired trainees the most work. Left required.
  //
  // FLAGGED, NOT FIXED: moderate and high produce a BYTE-IDENTICAL mesocycle
  // despite distinct multipliers (0.9 vs 1.0) — the difference is absorbed by
  // set-count rounding at this profile, so the question has three answers and
  // two outcomes. Whether "high recovery" should earn more volume than
  // "moderate" is a training call, not a bug; it is in BACKLOG for Ashley.
  // Run `npm run report:slot-impact` to see this alongside every other slot.
  { key: 'recoveryCapacity', question: "How's your recovery capacity — sleep, stress, physical job?", inputHint: 'How’s your sleep and stress?', shortLabel: 'Recovery', control: 'single', required: true, options: RECOVERY_OPTIONS, destination: 'column', validate: isOneOf(RECOVERY_OPTIONS) },
  { key: 'dietaryPreferences', question: 'Any dietary preferences or restrictions?', inputHint: 'Anything you avoid?', shortLabel: 'Diet', control: 'multi', required: false, options: DIETARY_OPTIONS, destination: 'column', validate: isSubsetOf(DIETARY_OPTIONS) },
  { key: 'dislikedFoods', question: 'Any foods you just won\'t eat?', inputHint: 'Foods you won’t eat…', shortLabel: 'Foods to avoid', control: 'text', required: false, destination: 'user_facts', validate: v => typeof v === 'string' },
  { key: 'mealsPerDay', question: 'How many meals a day suits you?', inputHint: 'How many meals?', shortLabel: 'Meals a day', control: 'single', required: true, options: MEALS_PER_DAY_OPTIONS, destination: 'column', validate: isOneOf(MEALS_PER_DAY_OPTIONS) },
  { key: 'cookingTime', question: 'How much time do you want to spend cooking?', inputHint: 'How long do you want to cook?', shortLabel: 'Cooking time', control: 'single', required: false, options: COOKING_TIME_OPTIONS, destination: 'column', validate: isOneOf(COOKING_TIME_OPTIONS) },
  { key: 'includeSnacks', question: 'Snacks too, or meals only?', shortLabel: 'Snacks', control: 'single', required: false, options: SNACKS_OPTIONS, destination: 'column', validate: v => v === true || v === false || v === 'true' || v === 'false' },
  // Last, and NEVER PROACTIVELY ASKED — both are in NEVER_BLOCKING_SLOTS, so
  // trackedSlots filters them out of the questioning list entirely. They stay
  // in this array so the model still has them in its catalogue and can record
  // a cuisine or a breakfast habit the moment someone volunteers one.
  //
  // A ROUND OF THIS PLAN PROPOSED DELETING THEM and was wrong: the plan
  // argued they should "move out of onboarding and be asked at first use",
  // not having checked that they were already demoted and already not being
  // asked. Deleting them removed the recording path this file's own comment
  // (below, on NEVER_BLOCKING_SLOTS) warns about, and the slot gate caught it.
  { key: 'favoriteCuisines', question: 'Any favourite cuisines?', shortLabel: 'Cuisines', control: 'multi', required: false, options: FAVORITE_CUISINE_OPTIONS, destination: 'column', validate: isSubsetOf(FAVORITE_CUISINE_OPTIONS) },
  { key: 'breakfastStyle', question: "What's breakfast usually like for you?", shortLabel: 'Breakfast', control: 'single', required: false, options: BREAKFAST_STYLE_OPTIONS, destination: 'column', validate: isOneOf(BREAKFAST_STYLE_OPTIONS) },
  // THE MIRROR OF dislikedFoods, and it was missing. "I won't eat mushrooms"
  // in onboarding lands in user_facts and is kept out of every meal; "never
  // give me burpees", said in the same breath, had nowhere to go at all —
  // exercise exclusions compile from user_facts rows tagged
  // 'exercise_preference', and the only writers were the coach chat and the
  // swap button. Onboarding never wrote one. So a person could rule out a
  // food and an exercise together and have only the food honoured.
  //
  // NEVER PROACTIVELY ASKED (it is in NEVER_BLOCKING_SLOTS) — deliberately
  // unlike dislikedFoods, which is asked. Onboarding was just made
  // conversational precisely so it would stop marching through questions,
  // and adding a new one to fix a capture gap would take back what that
  // bought. In the catalogue, though, the model can record it the moment
  // someone volunteers it, which is exactly the case this exists for.
  { key: 'dislikedExercises', question: "Any exercises you'd rather never see?", shortLabel: 'Exercises to avoid', control: 'text', required: false, destination: 'user_facts', validate: v => typeof v === 'string' },
]

export function getSlotDef(key: string): SlotDef | undefined {
  return ONBOARDING_SLOTS.find(s => s.key === key)
}

/**
 * Whether a slot is required GIVEN the current answers. The single place
 * requiredIf is interpreted — every caller should ask this rather than
 * reading `def.required` directly, or conditional slots silently become
 * unconditional again.
 */
export function isSlotRequired(def: SlotDef, values: OnboardingSlotValues): boolean {
  if (!def.required) return false
  return def.requiredIf ? def.requiredIf(values) : true
}

/**
 * Whether a slot applies at all right now. A conditionally-required slot
 * whose condition is false is NOT APPLICABLE — it shouldn't be asked, shown,
 * or counted as an unanswered optional. (An unconditionally-optional slot
 * like favouriteCuisines still applies; it just doesn't block.)
 */
export function isSlotApplicable(def: SlotDef, values: OnboardingSlotValues): boolean {
  return def.requiredIf ? def.requiredIf(values) : true
}

/**
 * The options a slot should OFFER right now.
 *
 * Nothing is filtered today. Kept as the single choke point so that if a
 * value ever needs hiding until the engine can honour it (VISION.md's "Only
 * offer what's built"), it happens in one place rather than at each render
 * site.
 */
export function offeredOptionsFor(def: SlotDef): readonly SlotOption[] | undefined {
  return def.options
}

/**
 * Slots that never gate completion, even on the "explicitly asked" bar:
 * includeSnacks carries a real default, and the three known-lift numbers are
 * optional-within-a-question (the form treats them the same).
 */
/**
 * Can the user refuse this question outright and still finish onboarding?
 *
 * THE TRAP THIS FIXES: age, height, weight and sex are all `required: false`,
 * but "optional" only ever meant "the plan can be built without it" — the
 * conversation still held them, because `unconfirmedOptionalSlots` keeps a
 * slot until it is CONFIRMED, and `confirmed` was only ever set by a value
 * that passed `validate`. `isNumberIn` rejects '', and GENDER_OPTIONS offers
 * no third answer, so someone who would not give a weight could answer every
 * other question and never reach Generate. That is the same refusal trap the
 * absence work removed from the calculation layer (a declined metric yields
 * `undefined`, targets go null, and the app says so) — it simply never
 * reached the gate that decides when onboarding is done.
 *
 * The rule is exactly "not currently required": anything the plan genuinely
 * needs (goal, days, equipment, and injuries/diet on the safety path) stays
 * unskippable, and everything else can be declined. Declining records the
 * slot as answered WITHOUT storing a value, so the null flows into
 * `assembleProfile`'s existing `numericOrUndefined` / `?? undefined` handling
 * — no new "unknown" sentinel, nothing downstream to teach.
 */
export function canDeclineSlot(def: SlotDef, values: OnboardingSlotValues): boolean {
  return !isSlotRequired(def, values)
}

export const NEVER_BLOCKING_SLOTS: SlotKey[] = [
  'knownSquatKg', 'knownBenchKg', 'knownDeadliftKg', 'includeSnacks',
  // Added when the ask set was trimmed to what shapes the first plan. Each
  // of these was measured to steer ONE sentence of a meal prompt or a chat
  // greeting — real, but not worth holding someone at the door for. They are
  // still asked whenever the conversation goes there, and all four are
  // editable afterwards in the Profile screen; they simply stop being able
  // to block a plan.
  'displayName', 'cookingTime', 'favoriteCuisines', 'breakfastStyle',
  // Never asked at all, only ever volunteered — see its slot def above.
  'dislikedExercises',
]

/** Required slots whose VALUE must validate before completion, per the current answers (requiredIf-aware). */
export function missingRequiredSlots(values: OnboardingSlotValues): SlotKey[] {
  return ONBOARDING_SLOTS
    .filter(s => isSlotRequired(s, values))
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
export function unconfirmedOptionalSlots(
  confirmed: ReadonlySet<string>,
  values: OnboardingSlotValues = initialSlotValues(),
): SlotKey[] {
  return ONBOARDING_SLOTS
    .filter(s => !isSlotRequired(s, values) && !NEVER_BLOCKING_SLOTS.includes(s.key))
    // A slot whose requiredIf condition is false is NOT APPLICABLE, not "an
    // optional we still owe the user" — nobody is asked for a squat number
    // after saying they don't know their lifts, even as a skip.
    .filter(s => isSlotApplicable(s, values))
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

/**
 * A body metric the user actually gave, or undefined. Deliberately strict:
 * empty string, whitespace, null, and anything non-finite all mean "not
 * given". Zero is rejected too — no real age, height or bodyweight is 0, so
 * a 0 arriving here is a bug or a coerced blank, and passing it through is
 * exactly the failure this whole change exists to remove.
 */
function numericOrUndefined(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined
  if (typeof raw === 'string' && raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function assembleProfile(data: OnboardingSlotValues): UserProfile {
  // ALWAYS a 7-entry array, both formats. Several readers call .filter/.some
  // on training_days without a null guard (exercise-plan.ts's availableDays,
  // macro-calculator's training-day lookup) — the guards added alongside this
  // are a backstop, this is the contract.
  const trainingDaysFull = DAYS_FULL.map(day => ({
    day,
    available: data.trainingDays.includes(day.slice(0, 3)),
  }))

  return {
    // Body metrics: absent stays ABSENT. `Number('')` is 0, not NaN, so the
    // old `Number(data.age)` turned "declined to say" into a confident zero
    // that every downstream reader treated as a real measurement — a zero
    // bodyweight is what produced the 1502 kcal / 0g protein target. And
    // `gender ?? 'male'` was worse than a computed default: it wrote a
    // fabricated ANSWER into the profile, indistinguishable downstream from
    // one the user actually gave, which also defeated "the slot stays open".
    age: numericOrUndefined(data.age),
    gender: data.gender ?? undefined,
    height_cm: numericOrUndefined(data.heightCm),
    weight_kg: numericOrUndefined(data.weightKg),
    activity_level: data.activityLevel ?? 'moderate',
    meals_per_day: data.mealsPerDay ?? 3,
    include_snacks: data.includeSnacks,
    cooking_time_preference: data.cookingTime ?? 'moderate',
    favorite_cuisines: data.favoriteCuisines,
    disliked_foods: data.dislikedFoods.split(',').map(f => f.trim()).filter(Boolean),
    disliked_exercises: data.dislikedExercises.split(',').map(f => f.trim()).filter(Boolean),
    breakfast_style: data.breakfastStyle ?? undefined,
    fitness_goal: data.fitnessGoal!,
    training_days: trainingDaysFull,
    // No longer asked. It was measured to produce byte-identical plans and
    // mesocycles for every answer, and its only consumer is a chat greeting
    // — which already falls back to 'morning' on its own
    // (ChatAssistant's `profile.preferred_time || 'morning'`). The column is
    // non-optional, so it is written to that same default rather than left
    // to drift. Nothing reads it to decide when a session happens.
    preferred_time: 'morning',
    dietary_preferences: data.dietaryPreferences,
    session_duration_preference: data.sessionDuration!,
    equipment_access: data.equipment!,
    training_style: data.trainingStyle!,
    training_experience: data.trainingExperience!,
    conditioning_preference: data.conditioningPreference!,
    skip_calibration_week: data.knowsWorkingLifts === true,
    known_squat_kg: data.knowsWorkingLifts === true && data.knownSquatKg ? Number(data.knownSquatKg) : undefined,
    known_bench_kg: data.knowsWorkingLifts === true && data.knownBenchKg ? Number(data.knownBenchKg) : undefined,
    known_deadlift_kg: data.knowsWorkingLifts === true && data.knownDeadliftKg ? Number(data.knownDeadliftKg) : undefined,
    recovery_capacity: data.recoveryCapacity!,
    injuries: data.injuries,
    display_name: data.displayName.trim(),
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

/**
 * Serialized for the model. Takes the current answers so the catalog reflects
 * THIS profile's reality: gym-only slots disappear entirely once an activity
 * format is chosen (rather than being sent with a required flag the model
 * would dutifully chase).
 */
/**
 * Numeric answers that are naturally given in one breath, and so are asked and
 * captured in one card rather than one at a time. "How old are you, and what
 * are your height and weight?" is a single question to a human; splitting it
 * into three turns is the form-feel we removed everywhere else.
 *
 * A key with no group answers for itself alone.
 */
const NUMERIC_GROUPS: SlotKey[][] = [
  ['age', 'heightCm', 'weightKg'],
  ['knownSquatKg', 'knownBenchKg', 'knownDeadliftKg'],
]

export function numericGroupFor(key: SlotKey): SlotKey[] {
  return NUMERIC_GROUPS.find(g => g.includes(key)) ?? [key]
}

export function buildSlotCatalog(values: OnboardingSlotValues = initialSlotValues()): SlotCatalogEntry[] {
  return ONBOARDING_SLOTS
    .filter(s => isSlotApplicable(s, values))
    .map(s => ({
      key: s.key,
      question: s.question,
      control: s.control,
      required: isSlotRequired(s, values),
      values: offeredOptionsFor(s)?.map(o => ({ value: String(o.value), label: o.label })),
      min: s.min,
      max: s.max,
    }))
}
