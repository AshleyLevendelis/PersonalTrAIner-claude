export interface ConcurrentActivity {
  name: string
  intensity: number
  days: string[]
  movement_demands: string[]
}

export interface UserProfile {
  id?: string
  age: number
  gender: 'male' | 'female'
  height_cm: number
  weight_kg: number
  activity_level: ActivityLevel
  fitness_goal: FitnessGoal
  training_days: TrainingDay[]
  preferred_time: 'morning' | 'evening'
  dietary_preferences: string[]
  session_duration_preference: SessionDuration
  workout_split_preference: WorkoutSplit
  macro_calculation_mode: MacroCalculationMode
  equipment_access: EquipmentAccess
  training_style: TrainingStyle
  training_experience: TrainingExperience
  coaching_persona: CoachingPersona
  injuries: string[]
  display_name?: string
  concurrent_activities?: ConcurrentActivity[]
  weekly_schedule?: Record<string, string | null>
  created_at?: string
  bmr?: number
  tdee?: number
  calorie_target?: number
  protein_g?: number
  carbs_g?: number
  fat_g?: number
  /**
   * Working weights the trainee reported during onboarding ("I know my
   * numbers") — verified data, not a bodyweight-multiplier guess. Present
   * only when skip_calibration_week is true.
   */
  known_squat_kg?: number
  known_bench_kg?: number
  known_deadlift_kg?: number
  /**
   * True when onboarding collected known working lifts, so week 1 should
   * seed loads from them instead of running a calibration week. Absent or
   * false means the trainee didn't know their numbers and week 1 of the
   * mesocycle is a calibration week instead.
   */
  skip_calibration_week?: boolean
  /**
   * Self-reported recovery capacity (sleep, stress, physical job) — scales
   * weekly set volume (low x0.75, moderate x0.9, high x1.0) and, for low
   * capacity with 5+ training days selected, trims one day back to rest.
   */
  recovery_capacity: RecoveryCapacity
  /**
   * How the trainee feels about cardio — scales conditioning frequency in
   * GOAL_POLICIES (src/lib/goal-policies.ts). 'avoid' still gets a minimum
   * viable dose for fat_loss/conditioning goals (diet/engine-work still
   * needs it) but zero appended cardio for hypertrophy/functional.
   */
  conditioning_preference: ConditioningPreference
  /**
   * M0 nutrition inputs. weight_kg above is formally "onboarding weight,
   * immutable" — the live weight series lives in daily_metrics, and
   * nutrition-targets.ts prefers the latest weigh-in over this value.
   * meals_per_day (2|3|4) + include_snacks drive slot ratios from M1;
   * cooking_time_preference steers pool generation. All optional with
   * matching DB defaults so pre-M0 profiles keep working.
   */
  meals_per_day?: number
  include_snacks?: boolean
  cooking_time_preference?: CookingTimePreference
  /**
   * Meal-realism round: onboarding's optional (skippable) food-preference
   * questions. favorite_cuisines steers generate-meals's cuisine selection
   * toward these; disliked_foods is a hard filter — meal-generation.ts
   * rejects any proposal whose ingredient list matches one; breakfast_style
   * steers the breakfast slot's prompt guidance only (does not change
   * whether a breakfast slot exists — meals_per_day/include_snacks own
   * that). All default to empty/undefined ("no preference") for pre-round
   * profiles.
   */
  favorite_cuisines?: string[]
  disliked_foods?: string[]
  breakfast_style?: BreakfastStyle
}

export type CookingTimePreference = 'quick' | 'moderate' | 'loves_cooking'
export type BreakfastStyle = 'quick_cold' | 'cooked' | 'skip'

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
/** No separate 'endurance' or 'maintain' value (differentiation-audit schema note) — see goal-policies.ts's file-level "Mapping note" for why: 'conditioning' already covers the endurance outcome, and 'functional' covers general-health/maintenance. */
export type FitnessGoal = 'fat_loss' | 'hypertrophy' | 'functional' | 'conditioning'
export type EquipmentAccess = 'full_gym' | 'home_gym' | 'minimalist' | 'bodyweight'
/**
 * Deliberately has no 'conditioning' value, even though FitnessGoal does
 * (differentiation-audit schema note): training_style answers "what kind of
 * exercise selection/session structure do you want" (bodybuilding-style
 * isolation work vs. functional/athletic movement vs. combat-sport prep vs.
 * a hybrid), while fitness_goal answers "what outcome are you training
 * for" (including endurance/conditioning as an outcome) — see
 * goal-policies.ts's GOAL_POLICIES for how a conditioning GOAL already
 * reshapes rep ranges, rest, and accessory selection regardless of which
 * style is picked. Adding a redundant 'conditioning' style would let the
 * two axes fight over the same territory (a conditioning-style bodybuilder
 * vs. a conditioning-goal bodybuilder would mean two different things with
 * no clear precedence rule) rather than compose cleanly, so this is a
 * deliberate 3-real-values-plus-hybrid set, not an oversight.
 */
export type TrainingStyle = 'functional' | 'bodybuilding' | 'combat' | 'hybrid'
export type TrainingExperience = 'beginner' | 'novice' | 'intermediate' | 'advanced'
export type CoachingPersona = 'drill_sergeant' | 'analytical' | 'supportive' | 'hype'
export type SessionDuration = '30-45' | '45-60' | '60-90' | '90+'
/** No longer stored on UserProfile (was a duplicate of preferred_time — see the recovery_capacity/conditioning_preference migration). Still used locally by OnboardingFlow's time-of-day question to derive preferred_time. */
export type TrainingTime = 'morning' | 'midday' | 'evening' | 'night' | 'varies'
export type RecoveryCapacity = 'low' | 'moderate' | 'high'
export type ConditioningPreference = 'love' | 'tolerate' | 'avoid'
export type WorkoutSplit = 'ppl' | 'upper_lower' | 'full_body' | 'bro_split' | 'ai_recommendation'
export type MacroCalculationMode = 'STANDARD_STATIC' | 'DYNAMIC_CSCS'

export interface TrainingDay {
  day: string
  available: boolean
}

export interface MacroTargets {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type ExerciseTier = 'tier_0_primer' | 'tier_1_primary' | 'tier_2_secondary' | 'tier_3_isolation' | 'tier_4_finisher'
export type FatigueCost = 'low' | 'moderate' | 'high'
export type MesocycleMovementPattern = 'push' | 'pull' | 'hinge' | 'squat' | 'carry' | 'rotation' | 'isolation'

export interface Exercise {
  id?: string
  name: string
  sets: number
  reps: string
  rest: string
  substitution: string
  superset_label?: string
  /** How `reps` should be read/rendered — 'reps' (a count), 'time' (a hold duration), 'distance_load' (a measured walk with an explicit kg load), 'intervals' (rounds of work:rest). See PrescriptionType in exercise-db.ts. */
  prescription_type?: import('./exercise-db').PrescriptionType
  movement_pattern?: MesocycleMovementPattern
  tier?: ExerciseTier
  fatigue_cost?: FatigueCost
  /** Target effort level for working sets, e.g. 'RPE 6-7'. */
  intensity?: string
  /** Plain-English guidance on picking a starting load. */
  load_guidance?: string
  /** Suggested starting weight, e.g. '~60kg' or 'Bodyweight'. */
  suggested_load?: string
  /** Numeric starting weight in kg; null for bodyweight movements. */
  suggested_load_kg?: number | null
  /**
   * Where suggested_load_kg came from: 'known_weight' when anchored to a
   * working weight the trainee reported during onboarding, 'estimate' when
   * it's a population standards-table guess (however it was subsequently
   * ramped/capped) — see LoadPrescription.load_source in load-prescription.ts.
   * undefined for bodyweight movements/primers, where no weight is shown.
   * The UI layers a third 'logged' state on top of this once real logged
   * history exists for the exercise (see getDoubleProgressionRecommendation)
   * — that state is never persisted here, only computed at render time.
   */
  load_source?: 'estimate' | 'known_weight'
  /**
   * Per-set load breakdown for externally-loaded work — the last entry is
   * always the top/working set (same value as suggested_load_kg). Ramps
   * progressively across sets for compounds in strength/power phases;
   * flat/straight (every entry equal) otherwise. null for bodyweight
   * movements or primers, where a single load doesn't apply.
   */
  per_set_load?: { set_number: number; load_kg: number; display: string }[] | null
  /**
   * Ramp-up-visibility fix: the day's warmup.ramp_ups (warmup.ts) already
   * computed a build-up scheme for every qualifying externally-loaded
   * compound, but it lived ONLY on WorkoutDay.warmup — a day-level block
   * with no code path back onto the Exercise it belongs to, and the UI
   * only ever rendered that block, collapsed by default, with no visual
   * tie to this exercise's row. This is the same RampBlock, copied onto
   * the specific Exercise it applies to (see exercise-plan.ts's day-build
   * loop) so the exercise row itself can render it — undefined for
   * anything that didn't qualify (bodyweight work, isolation, a light
   * tier2 accessory below the ramp threshold).
   */
  ramp_up?: import('./warmup').RampBlock
}

export interface MesocycleWeek {
  week_number: number
  label: string
  days: WorkoutDay[]
  /** Which periodization block this week belongs to (1-indexed). */
  block_number?: number
  week_in_block?: number
  phase_label?: string
  phase_focus?: string
  is_deload?: boolean
  coach_note?: string
  /** True for week 1 when the trainee didn't report known working weights — loads are deliberately capped so they can find their numbers. */
  isCalibrationWeek?: boolean
}

export interface RecommendedCardio {
  activity: string
  duration: number
  targetRpe: number
  timing: 'post_session' | 'independent_session' | 'rest_day'
  reason: string
  /**
   * True when this entry exists only to fill a day that ran short on time
   * (see applyDurationFiller in exercise-plan.ts) rather than counting
   * toward the goal's actual weekly conditioning-frequency target. Distinct
   * from the assignConditioningNotes-driven entries, which DO count toward
   * that target — conflating the two inflated the conditioning-day count for
   * any user whose conditioning_preference expected fewer (or zero) sessions.
   */
  is_filler?: boolean
}

export interface WorkoutDay {
  day: string
  focus: string
  exercises: Exercise[]
  warmup?: import('./warmup').WarmupBlock
  conditioning_note?: string
  recommendedCardio?: RecommendedCardio
}

export interface ConstraintTraceEntry {
  exercise: string
  stage: 'equipment' | 'injury' | 'style' | 'skill' | 'time_cap' | 'exclusion' | 'structure'
  reason: string
}

export interface ConstraintTrace {
  equipment_filtered: ConstraintTraceEntry[]
  injury_filtered: ConstraintTraceEntry[]
  style_filtered: ConstraintTraceEntry[]
  skill_filtered: ConstraintTraceEntry[]
  time_cap_adjusted: ConstraintTraceEntry[]
  exclusion_filtered: ConstraintTraceEntry[]
  /** Weekly-aggregate corrections (push:pull balance, squat/hinge/push/pull pattern coverage) that no single day's own selection can see — see balanceWeeklyStructure in exercise-plan.ts. */
  structure_adjusted: ConstraintTraceEntry[]
  pool_size_after_each_stage: { equipment: number; injury: number; style: number; skill: number; final: number }
}

export interface PlanResult {
  plan: WorkoutDay[]
  constraint_trace: ConstraintTrace
}

export interface Meal {
  id?: string
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  portion_size: string
  prep: string
  substitution: string
  ingredients?: string[]
  is_verified?: boolean
  sub_calories?: number
  sub_protein?: number
  sub_carbs?: number
  sub_fat?: number
  sub_portion_size?: string
  sub_prep?: string
  sub_ingredients?: string[]
}

export interface MealPlanDay {
  meal: string
  items: Meal[]
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export type DayName = typeof DAY_NAMES[number]

export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'failed'

/**
 * VISION-ARCHITECTURE.md §2/§3 — a turn that produced a plan-mutation
 * proposal, an append-only receipt, or a natural-language-logging
 * clarification renders ONE of these (D1: never the model's own prose on
 * that turn). Ephemeral/client-side only — not persisted to
 * chat_messages.action_data or restored across a reload; the underlying
 * pending_actions row is the durable record.
 */
export interface ChatPendingActionView {
  id: string
  kind: string
  status: import('./pending-actions-store').PendingActionStatus
  diff: import('./pending-actions-store').ProposalDiff
}

export interface ChatReceiptView {
  kind: 'log_workout' | 'propose_exercise_swap' | 'propose_meal_swap' | 'memory_fact_saved' | 'memory_goal_saved' | 'memory_context_fact_saved' | 'grocery_item_added'
  title: string
  rows: { label: string; detail: string; note?: string }[]
  summary?: string
  status: 'done' | 'partial' | 'failed'
  result?: import('./pending-actions-store').PendingActionReceipt
  /** Opaque undo handle: a set's natural-key tuple (JSON), a meal event's clientId, or a pending_actions id for a swap's pre_image restore. */
  undoToken?: string
  resolvedAt?: string
}

export interface ChatClarificationView {
  contextLines?: string[]
  prompt: string
  options: { label: string; value: string }[]
  /** Correlates the chosen answer back to the parse session awaiting it. */
  resolverId: string
}

export interface ChatMessage {
  id?: string
  profile_id?: string
  role: 'user' | 'assistant'
  content: string
  status?: MessageStatus
  action?: PlanAction
  pendingAction?: ChatPendingActionView
  receipt?: ChatReceiptView
  clarification?: ChatClarificationView
  quickReplies?: string[]
  created_at?: string
}

// ReplaceFoodAction/ReplaceExerciseAction are gone — categorically
// superseded by propose_meal_swap/propose_exercise_swap's pending-action
// rail (ChatPendingActionView/ChatReceiptView above), not merely disabled.

export interface AdjustVolumeAction {
  type: 'adjust_volume'
  day: string
  adjustment: 'reduce_light' | 'reduce_half' | 'reduce_heavy' | 'increase_moderate' | 'increase_heavy'
  reason: string
}

export interface BanExerciseAction {
  type: 'ban_exercise'
  exercise_name: string
  reason: string
}

export interface SchedulePatchItem {
  day: string
  action: 'ADD' | 'REMOVE' | 'MOVE'
  block_name: string
  exercises?: { name: string; sets: number; reps: string }[]
}

export interface UpdateScheduleAction {
  type: 'update_workout_schedule'
  schedule_patch: SchedulePatchItem[]
  recalibrated_days?: string[]
  adaptations?: string
}

export interface LogWorkoutSessionAction {
  type: 'log_workout_session'
  day: string
  logs: Array<{ exercise_name: string; sets_completed: number; reps_completed: number; weight_kg: number }>
}

export interface LogWeightAction {
  type: 'log_weight'
  weight_kg: number
}

export interface LogWorkoutSetAction {
  type: 'log_workout_set'
  exercise_name: string
  set_number: number
  reps: number
  weight_kg: number
  is_bodyweight?: boolean
  rpe?: number
}

export type PlanAction = AdjustVolumeAction | BanExerciseAction | UpdateScheduleAction | LogWorkoutSessionAction | LogWeightAction | LogWorkoutSetAction

// ============================================================================
// Daily Tracking Types (connects workout engine to nutrition/carb-cycling)
// ============================================================================

export interface DailyMetric {
  id?: string
  profile_id: string
  date: string
  weight_kg: number
  body_fat_percentage?: number
  created_at?: string
  updated_at?: string
}

export type WorkoutSplitType =
  | 'REST'
  | 'FULL_BODY_POWER'
  | 'PUSH'
  | 'PULL'
  | 'LEGS'
  | 'UPPER'
  | 'LOWER'
  | 'CHEST_TRICEPS'
  | 'BACK_BICEPS'
  | 'SHOULDERS_ABS'
  | 'CONDITIONING'

export interface DailyNutritionTarget {
  id?: string
  profile_id: string
  date: string
  workout_split: WorkoutSplitType
  target_calories: number
  target_protein_g: number
  target_carbs_g: number
  target_fats_g: number
  calculated_bmr?: number
  estimated_eee?: number
  calculated_tdee?: number
  created_at?: string
  updated_at?: string
}

export interface WorkoutSession {
  id?: string
  profile_id: string
  date: string
  split_type: string
  duration_minutes: number
  is_completed: boolean
  nutrition_target_id?: string
  created_at?: string
  updated_at?: string
}

export interface WorkoutExerciseRow {
  id?: string
  workout_session_id: string
  exercise_name: string
  tier: number
  execution_order: number
  sets: number
  reps_scheme: string
  rest_seconds: number
  rpe_target?: number
  is_superset: boolean
  superset_group_id?: string
  created_at?: string
  updated_at?: string
}

export interface ExerciseSetLog {
  id?: string
  user_id: string
  date: string
  exercise_name: string
  /** Stable slug identity (C0) — present on every row written through set-log-store; absent only on pre-C0 legacy shapes. */
  exercise_id?: string
  set_number: number
  weight_kg: number
  reps_completed: number
  is_bodyweight: boolean
  /** What reps_completed counts: reps, seconds (holds/intervals), or meters (carries). */
  unit?: 'reps' | 'seconds' | 'meters'
  rpe?: number | null
  is_warmup?: boolean
  completed_at?: string
}

export interface CardioLog {
  id?: string
  user_id: string
  date: string
  activity_name: string
  duration_minutes: number
  intensity_rpe: number
  avg_heart_rate?: number | null
  notes?: string | null
  completed_at?: string
}
