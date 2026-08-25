export interface ConcurrentActivity {
  name: string
  intensity: number
  days: string[]
  movement_demands: string[]
}

export interface UserProfile {
  id?: string
  /**
   * BODY METRICS — all four are OPTIONAL, and undefined means "the user has
   * not told us", never "assume something sensible".
   *
   * These exist for calorie and protein targets. They are NOT needed to hold
   * an account or to receive a training plan, and a user is allowed to
   * decline any of them and still use the app. That is the whole point: the
   * columns were NOT NULL until 2026-08-17, which is what made refusing a
   * weight trap someone in onboarding with nowhere to record the refusal.
   *
   * NEVER substitute a default when one of these is missing. A missing
   * weight previously became 0 (via `Number('')`) and produced a confident
   * 1502 kcal target alongside 0g of protein — protein is proteinPerKg x
   * bodyweight, so it collapsed honestly, while the calorie floor caught the
   * calories and made them look deliberate. Render an ABSENCE instead: say
   * targets need a weight and offer a way to add one.
   */
  age?: number
  gender?: 'male' | 'female'
  height_cm?: number
  weight_kg?: number
  activity_level: ActivityLevel
  fitness_goal: FitnessGoal
  /**
   * STAYS REQUIRED and array-typed for BOTH plan formats. Several readers
   * call .filter/.some on this without a null guard, so an activity profile
   * must still populate it — an empty array at minimum, never undefined.
   * (The guards were added defensively anyway; the contract is the primary
   * protection, the guards are the backstop.)
   */
  training_days: TrainingDay[]
  preferred_time: 'morning' | 'evening'
  dietary_preferences: string[]
  session_duration_preference: SessionDuration
  workout_split_preference: WorkoutSplit
  macro_calculation_mode: MacroCalculationMode
  /**
   * The three fields below are OPTIONAL because they have no honest value on
   * an activity-format profile: someone whose plan is "walk three times a
   * week" has no equipment tier, no lifting style, and no lifting-experience
   * tier. They remain required in practice for gym profiles (onboarding
   * gates them via SlotDef.requiredIf).
   *
   * Safe to make optional because every functional read site already carries
   * an explicit fallback — e.g. exercise-plan.ts's
   * `profile.equipment_access || 'full_gym'` and
   * `profile.training_experience || 'novice'`. Note the contrast with
   * training_days below, which is read UNGUARDED in several places and so
   * stays required.
   */
  equipment_access?: EquipmentAccess
  training_style?: TrainingStyle
  training_experience?: TrainingExperience
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
   * toward these; breakfast_style steers the breakfast slot's prompt
   * guidance only (does not change whether a breakfast slot exists —
   * meals_per_day/include_snacks own that). Both default to empty/undefined
   * ("no preference") for pre-round profiles.
   */
  favorite_cuisines?: string[]
  /**
   * @deprecated Fix — food/exercise preferences have two competing stores:
   * this column duplicated user_facts (kind='food_preference',
   * polarity='dislike', hardness='hard'), which alone now backs the hard
   * food-dislike filter (fact-compiler.ts's compileFoodDislikes) — the
   * chat never saw this column, only user_facts, so a dislike entered here
   * was invisible to it. Existing values were migrated into user_facts by
   * 20260807100000_backfill_profile_preferences_to_facts.sql. No code
   * reads or writes this column anymore; kept only so the column itself
   * (and any value still sitting in it) isn't silently lost.
   */
  disliked_foods?: string[]
  breakfast_style?: BreakfastStyle
  /**
   * Dashboard round: a plain user-editable daily hydration goal in
   * millilitres. 2000 is a neutral starting default (a round, commonly-
   * cited baseline) — deliberately NEVER computed from weight/activity/
   * goal, per VISION-ARCHITECTURE.md §5's "must never suggest or default
   * to a hydration target beyond a neutral starting value" rule.
   */
  water_target_ml?: number
  /**
   * Macro-accuracy round, Part 2: user-adjustable macro split. Governs the
   * STANDARD_STATIC, non-conditioning-goal target formula only (see
   * getProfileMacroSplit/computeMacroSplitTargets in macro-calculator.ts) —
   * DYNAMIC_CSCS and the conditioning goal keep their own established
   * formulas and ignore these fields. All three optional; undefined resolves
   * to the 'balanced' preset (2.0 g/kg protein, 25% fat), bit-identical to
   * the app's pre-existing hardcoded default.
   */
  macro_split_preset?: 'balanced' | 'higher_protein' | 'lower_carb' | 'higher_carb' | 'custom'
  /** Only meaningful when macro_split_preset is 'custom' — a named preset always resolves from its own fixed values. */
  macro_protein_per_kg?: number
  /** Only meaningful when macro_split_preset is 'custom'. Fraction (0.25 = 25%), not a percentage integer. */
  macro_fat_percent?: number
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
  /**
   * Prescribed lifting speed, canonical eccentric-pause-concentric notation
   * ('4-1-1'). Present only where tempo is the actual progression lever — a
   * rep-based lift with no weight to add — so absence means "no tempo
   * instruction", never "we forgot". Rendered in plain English via
   * describeTempo (periodization.ts); '4-1-1' means nothing to a trainee.
   */
  tempo?: string
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
   * it's a population standards-table guess built from body metrics they
   * gave us, 'assumed_body' when one or more of those metrics was never
   * given and had to be substituted (however each was subsequently
   * ramped/capped) — see LoadPrescription.load_source in load-prescription.ts.
   * undefined for bodyweight movements/primers, where no weight is shown.
   * The UI layers a fourth 'logged' state on top of this once real logged
   * history exists for the exercise (see getDoubleProgressionRecommendation)
   * — that state is never persisted here, only computed at render time.
   *
   * Written into mesocycle_weeks.days JSONB, so rows predating 'assumed_body'
   * are still out there carrying 'estimate'; isUnverifiedLoadSource() treats
   * both (and undefined) as "still a guess".
   */
  load_source?: 'estimate' | 'known_weight' | 'assumed_body'
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
  /**
   * Present only for an assistance-loaded exercise (ExerciseEntry.assistance
   * — today, only Pull-Ups (Assisted)); mutually exclusive with
   * suggested_load_kg, never both set. Unlike load, LOWER is progress here —
   * see load-prescription.ts's prescribeAssistance and AssistanceChip.tsx,
   * which render this with an inverted (down = good) cue instead of
   * LoadChip's up = good framing.
   */
  suggested_assistance_kg?: number | null
  /** True once suggested_assistance_kg has reached 0 — full bodyweight range on the assisted machine, the natural cue to try the real (unassisted) exercise next. */
  assistance_ready_to_graduate?: boolean
  /**
   * VISION.md Step 2 ("where a choice is non-obvious, say why"). Set only
   * when this exercise's win over its runner-up at generation time was
   * decided by one identifiable factor (see explainWinner in
   * exercise-plan.ts) — most exercises won't have one, by design. undefined
   * for the primer (its selection is a plain shuffle, out of scope) and for
   * anything chosen outside initial generation (manual swaps, substitutions).
   */
  selection_note?: string
  /**
   * VISION.md Step 4 ("logged sets... should feed the next block"). Set only
   * on week 1 of a block whose starting weight was held flat because the
   * PREVIOUS block showed no real progress (neither more weight nor more
   * reps) across at least two real logged-session comparisons — see
   * block-review.ts's didExerciseStallInBlock. Read by TodayPanel in
   * preference to the live single-session progression note for that one
   * week, then falls back to the normal live note from week 2 onward. This
   * is an automatic hold, not a proposal — the trainee can always log a
   * heavier weight than it suggests, same as any other suggested load.
   */
  block_hold_note?: string
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

/**
 * An activity-shaped day's ENTIRE prescription — a walk, a swim, a ride,
 * expressed as duration and effort rather than sets and reps.
 *
 * Deliberately a SIBLING of recommendedCardio, not a reuse of it: that field
 * means "an optional add-on attached to a gym day" (or a filler on a rest
 * day), and conflating the two would make "is this the whole session or an
 * extra?" unanswerable from the data. A WorkoutDay carrying this field has
 * exercises: [] and is the complete plan for that day.
 *
 * Type and shape only as of slice one — nothing generates these yet. The
 * generator (and its progression/ramp model) is deliberately NOT built here:
 * duration and frequency numbers for a true beginner are a coaching
 * decision, not something to guess at in a type definition.
 */
export interface PlannedActivity {
  /** Plain activity name as the user would say it — "Walk", "Swim". */
  activity: string
  /** Minutes for this single session. */
  duration: number
  /**
   * Perceived-effort target on the same 1-10 scale RecommendedCardio uses,
   * so both surfaces can render effort identically. Optional: a first
   * walking prescription may deliberately carry no effort target at all.
   */
  targetRpe?: number
  /** Coach-voice reason this session is what it is, same role as Exercise.selection_note. */
  reason?: string
}

export interface WorkoutDay {
  day: string
  focus: string
  exercises: Exercise[]
  warmup?: import('./warmup').WarmupBlock
  conditioning_note?: string
  recommendedCardio?: RecommendedCardio
  /**
   * Set when this day's whole prescription is an activity rather than a gym
   * session — see PlannedActivity. Mutually exclusive with a populated
   * exercises array in practice, though nothing enforces that structurally
   * yet (no generator produces these as of slice one).
   */
  plannedActivity?: PlannedActivity
  /**
   * Whether this day is a SCHEDULED training day, independent of whether it
   * carries gym exercises. Before this existed, "scheduled" was inferred
   * downstream as `exercises.length > 0` (dashboard-data.ts's streak input),
   * which silently means an activity day — walk, swim, no exercises array —
   * could never count as scheduled, so logging it would never build a
   * streak. Readers should prefer this field and fall back to the old
   * inference only when it's absent (pre-existing stored plans).
   */
  is_scheduled?: boolean
  /**
   * Plain-language note for the (rare) case a required movement pattern for
   * this day genuinely has nothing eligible under the trainee's equipment
   * and injury constraints, even after trying a nearest-pattern substitute
   * (see fillSlot's "(none)" case in exercise-plan.ts). Previously this only
   * reached an internal trace (constraint_trace.structure_adjusted) — never
   * the trainee. Set once on the base plan and carried through periodized
   * weeks unchanged (same convention as conditioning_note).
   */
  pattern_gap_note?: string
  /**
   * Plain-language note for the case a block's exercise structure had to
   * lose a whole exercise (not just sets) to fit that block's own real
   * rest cost — see sizeBlockToRestBudget in exercise-plan.ts. Set once per
   * block, only on days it actually applies to; never implies a defect,
   * just explains why this block looks lighter than an earlier one.
   */
  block_size_note?: string
}

export interface ConstraintTraceEntry {
  exercise: string
  stage: 'equipment' | 'injury' | 'style' | 'skill' | 'time_cap' | 'exclusion' | 'structure'
  reason: string
  /** Present only on time_cap rest-trim entries (trimWeekRestForBudget) — how many seconds this one cut removed, so a magnitude report can aggregate real numbers instead of parsing `reason` strings. */
  secondsCut?: number
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
  /**
   * Exercise names that filled a REQUIRED track slot somewhere in the base
   * plan (see selectExercisesForTrack's requiredNames, threaded here via
   * balanceWeeklyStructure's weeklyRequiredNames) — carried forward so any
   * later trimming pass (sizeBlockToRestBudget in exercise-plan.ts) can
   * extend the same "never silently drop a required slot" protection
   * stageTimeCap already applies at generation time.
   */
  requiredNames: string[]
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
  kind: 'log_workout' | 'propose_exercise_swap' | 'propose_meal_swap' | 'propose_injury_adaptation' | 'propose_injury_as_lasting' | 'propose_injury_recovered' | 'propose_equipment_adaptation' | 'memory_fact_saved' | 'memory_goal_saved' | 'memory_context_fact_saved' | 'display_name_saved' | 'grocery_item_added' | 'water_logged'
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
  /** The weight (kg) actually used to derive this snapshot's targets — the 7-day-average anchor from getEffectiveTargetWeightKg, not necessarily the latest single weigh-in. Null on rows written before this field existed. */
  calculated_weight_kg?: number | null
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
  /** Stamped by ensureSessionSynced on the first set saved that day. */
  started_at?: string
  /** Stamped by markSessionCompleted (explicit Finish, or the stale auto-close). */
  finished_at?: string
  week_number?: number | null
  day?: string | null
  notes?: string | null
  /**
   * Set when the trainee deliberately swapped this day's lifting for something
   * else ("I'm doing Muay Thai instead") — the activity's name, as they said
   * it. Absence means an ordinary session, so no existing row changes meaning.
   *
   * Exists because the coach used to reply "I'll make sure today is marked as
   * a rest day" and had no tool that could: classifyDay ends
   * `dateStr < todayStr ? 'missed' : 'due'` with nothing in between, so a day
   * announced in advance showed as MISSED the next morning. What they did
   * instead goes to cardio_logs, not here — one fact, one home.
   */
  swapped_for_activity?: string | null
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
  /**
   * Assistance used (kg), for an assistance-loaded exercise (today, only
   * Pull-Ups (Assisted)) — undefined/null for every ordinary set. Column
   * exists (migration 20260811100000); the write path (SetGrid.tsx logging
   * UI, set-log-store.ts save/sync) and the inverted progression read-back
   * are not wired yet — see this round's decision log.
   */
  assistance_kg?: number | null
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
