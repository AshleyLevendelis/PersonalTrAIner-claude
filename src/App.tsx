import { useState, useEffect, useRef } from 'react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { ProfileMenu } from '@/components/ProfileMenu'
import { ProfileScreen } from '@/components/ProfileScreen'
import { BottomTabBar } from '@/components/BottomTabBar'
import { ConversationalOnboarding } from '@/components/onboarding/ConversationalOnboarding'
import { loadOnboardingDraft, clearOnboardingDraft } from '@/lib/onboarding-draft-store'
import { NutritionDisplay } from '@/components/NutritionDisplay'
import { ExerciseTab } from '@/components/exercise/ExerciseTab'
import { SLOT_LABEL as MEAL_SLOT_LABEL } from '@/components/MealPlan'
import { Dashboard } from '@/components/Dashboard'
import { ToolsTab } from '@/components/ToolsTab'
import { ChatAssistant } from '@/components/ChatAssistant'
import { DevTestPage } from '@/components/DevTestPage'
import { OfflineStatusIndicator } from '@/components/OfflineStatusIndicator'
import { BottomDock } from '@/components/BottomDock'
import { ActiveSessionProvider } from '@/hooks/useActiveSession'
import { TimersProvider } from '@/hooks/useTimers'
import { BottomDockHeightProvider } from '@/hooks/useBottomDockHeight'
import { AppTour, replayAppTour } from '@/components/AppTour'
import { isDevAccount, getSessionDateContext, getAppNow } from '@/lib/dev-clock'
import { useAppRoute, tabHash, isTab, isKnownTabHash, type Tab } from '@/lib/app-route'

import { calculateCalories, getActiveMesocycleWeek } from '@/lib/calculations'
import { computeBMR, computeStaticTDEE, resolveBodyMetrics } from '@/lib/macro-calculator'
import { computeTargets, getLatestWeightKg, getEffectiveTargetWeightKg, snapshotTargetsIfChanged } from '@/lib/nutrition-targets'
import { describeGoalProximity, isGoalProximityDismissed, dismissGoalProximity } from '@/lib/goal-proximity'
import { upsertDailyMetric } from '@/lib/daily-tracking'
import { generateExercisePlan, generateMesocycle } from '@/lib/exercise-plan'
import { getPools, swapPoolMeal, getMealPicksForDate, setMealPick, clearMealPick, clearAllMealPicksForDate, type MealSlotName } from '@/lib/meal-store'
import { generateMealPools, assembleDay, chosenToMealPlanDays, type PoolOption } from '@/lib/meal-generation'
import { supabase } from '@/lib/supabase'
import { saveMesocycle, saveMesocycleWeek, restoreMesocycle } from '@/lib/mesocycle-persistence'
import { swapExerciseInMesocycle, banExerciseFromMesocycle, type SwapScope } from '@/lib/mesocycle-edit'
import { sweepStaleForTarget } from '@/lib/pending-actions-store'
import { checkAndRevertExpiredAdaptations, getActiveAdaptations, type PlanAdaptationRow } from '@/lib/plan-adaptations-store'
import { reconcileToStatedCeilings } from '@/lib/ceiling-reconcile'
import { checkForBlockReview } from '@/lib/block-review'
import { checkForConsistencyHold } from '@/lib/block-consistency'
import { checkForLoadSuggestions, confirmLoadSuggestion, declineLoadSuggestion } from '@/lib/load-suggestions'
import { checkForWeightBasisOffer, confirmWeightBasisOffer, declineWeightBasisOffer, planHasAssumedBodyLoads } from '@/lib/weight-basis-offer'
import { getRevealSpeed, saveRevealSpeed, DEFAULT_REVEAL_SPEED, type RevealSpeed } from '@/lib/reveal-speed-store'
import { InsightBanner } from '@/components/ui/insight-banner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { getActiveFacts, getActiveGoals, getActiveContextFacts, createFact, createContextFact, createGoal, type UserFactRow, type UserGoalRow, type UserContextFactRow } from '@/lib/memory-store'
import { compileExerciseExclusions, compileFoodDislikes, compileTimingRules, compileSoftExercisePreferences, compileSoftFoodPreferences, compileTrainingDayOverrides, compileKnownLiftOverrides, resolveFoodTarget, resolveExerciseTarget } from '@/lib/fact-compiler'
import { getAllItems as getAllGroceryItems, flushPending as flushGroceryPending, type GroceryItemRow } from '@/lib/grocery-store'
import { flushPending as flushSetLogPending } from '@/lib/set-log-store'
import { flushPending as flushWaterPending } from '@/lib/water-store'
import { flushPending as flushCardioPending } from '@/lib/cardio-log-store'
import type { UserProfile, MacroTargets, WorkoutDay, PlanAction, SchedulePatchItem, MesocycleWeek } from '@/lib/types'
import type { ExerciseEntry } from '@/lib/exercise-db'

const STORAGE_KEY = 'fitplan_profile_id'
const LAST_TAB_KEY = 'fitplan_last_tab'

/**
 * The tabs that own a daily fact, and therefore carry a field (handoff v2 §1).
 * Tools is deliberately absent: "Tools owns nothing, so it has no field — the
 * absence is the point, and it makes the ownership rule visible."
 */
const TABS_WITH_FIELD = new Set(['dashboard', 'nutrition', 'exercise'])

function App() {
  const { hash, route } = useAppRoute()
  // `program`/`train` are sub-routes of the exercise tab (LAYOUT-DESIGN.md
  // §5.3) — only an unrecognised/empty hash falls back to nutrition.
  const activeTab: Tab =
    route.kind === 'tab' ? route.tab : route.kind === 'program' || route.kind === 'train' ? 'exercise' : 'nutrition'
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [macros, setMacros] = useState<MacroTargets | null>(null)
  /** Latest daily_metrics weigh-in — DISPLAY only ("your current weight is X"). Null until the user first weighs in. Target computation uses targetWeightAnchorKg instead (see its own doc comment) — the two intentionally diverge: this always shows the real latest reading, the anchor only moves once that reading's 7-day average has shifted enough to matter. */
  const [latestWeightKg, setLatestWeightKg] = useState<number | null>(null)
  /** The weight that actually drives computeTargets — a threshold-gated 7-day average (getEffectiveTargetWeightKg), not the raw latest reading. Kept separate from latestWeightKg so a noisy day-to-day swing never retunes calories on its own; only a real trend move does. Null until the first target computation resolves it. */
  const [targetWeightAnchorKg, setTargetWeightAnchorKg] = useState<number | null>(null)
  const [exercisePlan, setExercisePlan] = useState<WorkoutDay[]>([])
  const [mesocycle, setMesocycle] = useState<MesocycleWeek[]>([])
  // Client-authored dismissible notices — never model prose, same
  // convention as every other receipt in this app. Four sources feed this
  // one list: an auto-reverted injury/equipment adaptation
  // (checkAndRevertExpiredAdaptations), a living-target recalculation
  // (snapshotTargetsIfChanged's changedFromPrior), a goal-proximity ask
  // (goal-proximity.ts), and — Vision Step 6 — a pending load suggestion
  // (checkForLoadSuggestions), and a weight-basis rebuild offer
  // (checkForWeightBasisOffer). goalId is set only for the goal-proximity
  // case — its dismiss must also persist via dismissGoalProximity so it
  // doesn't reappear next load. loadSuggestionId and weightBasisOfferId mark
  // the two messages that are an ACTION rather than a fact, and change what
  // the banner renders: Confirm/Decline instead of a plain Dismiss. Neither
  // may be dismissed — a dismiss that didn't record an answer would silently
  // re-ask forever, or (worse, for the weight-basis offer) look answered
  // while nothing had been decided.
  const [adaptationMessages, setAdaptationMessages] = useState<{ text: string; goalId?: string; loadSuggestionId?: string; weightBasisOfferId?: string }[]>([])
  /** Which load_suggestions row a Confirm/Decline tap is currently in flight for — disables both buttons on that one banner only. */
  const [loadSuggestionBusy, setLoadSuggestionBusy] = useState<string | null>(null)
  /** When the CURRENT mesocycle was generated — anchors live-week detection (falls back to profile.created_at for legacy profiles without persisted weeks). */
  const [mesocycleCreatedAt, setMesocycleCreatedAt] = useState<string | null>(null)
  // Meal pools (M1): every generated option per slot, keyed by slot — the
  // single source of truth for meals. Replaces the old day-of-week
  // WeeklyMealPlan entirely (pool options aren't day-specific; any option is
  // valid for its slot any day, per the M0 architecture decision).
  const [mealPools, setMealPools] = useState<Partial<Record<MealSlotName, PoolOption[]>>>({})
  const [isGeneratingMeals, setIsGeneratingMeals] = useState(false)
  /** Set when a (re)generate call reaches the server but comes back with nothing for one or more slots — surfaced so a failed regenerate reads as a failure, not as "your plan is gone." */
  const [mealRegenerateError, setMealRegenerateError] = useState<string | null>(null)
  /**
   * Surfacing round — distinct from mealRegenerateError above: this is a
   * DATA problem (a value in dietary_preferences the app can't enforce), not
   * a generation failure, so it needs different UI — persistent rather than
   * dismiss-and-forget, and an action that actually fixes it (open Profile)
   * rather than a retry that will fail identically forever. Cleared whenever
   * a generate call comes back clean, so fixing the value in Profile and
   * regenerating makes the banner go away on its own.
   */
  const [unrecognisedDietaryRestrictions, setUnrecognisedDietaryRestrictions] = useState<string[] | null>(null)
  // Memory & goals (VISION-ARCHITECTURE.md §1) — active facts/goals for the
  // current profile, loaded once alongside it. fact-compiler.ts's pure
  // functions turn these into the exact arguments generateExercisePlan/
  // generateMealPools already accept; nothing here writes plan state.
  const [memoryFacts, setMemoryFacts] = useState<UserFactRow[]>([])
  const [memoryGoals, setMemoryGoals] = useState<UserGoalRow[]>([])
  const [memoryContextFacts, setMemoryContextFacts] = useState<UserContextFactRow[]>([])
  /** Slot -> pool-option name the user explicitly picked this session, overriding assembleDay's automatic choice for that slot until the next regenerate. */
  const [manualMealPicks, setManualMealPicks] = useState<Partial<Record<MealSlotName, string>>>({})
  // A LEAN, not a filter — "I love salmon" biases which combination of pool
  // options gets picked for the day, and only when two combinations fit the
  // macros about equally (SOFT_FOOD_MISS_PENALTY is a fifth of a 5% calorie
  // miss). Hard dislikes are a different channel entirely: those are filtered
  // out of the pool at generation time and never reach here.
  //
  // Declared above assembleDay rather than beside the other compilers further
  // down, because the assembled day is derived on this line and a const
  // declared later would be a use-before-define.
  const compiledSoftFoodPreferences = compileSoftFoodPreferences(memoryFacts)

  // THE TWO COMPILERS THAT WERE WRITTEN, DOCUMENTED, AND NEVER CALLED.
  //
  // Found by the 30 Aug 2026 audit, both proven by running them: they produce
  // the right answer in isolation and had ZERO production callers, so
  //   - "I can't train Mondays" was recorded, shown back in the profile, and
  //     the generated plan still scheduled Monday; and
  //   - a lift stated as a goal never reached load prescription, which left
  //     onboarding as the ONLY writer of known_squat/bench/deadlift_kg and
  //     therefore no way at all to correct a stated lift afterwards.
  // Both doc comments named their consumer by file and line. Neither consumer
  // existed. That is the third instance of this exact shape in this codebase.
  //
  // Corrected HERE, on the profile itself, rather than at each generation
  // call site: the two producers (App's own first-plan build and
  // plan-adaptations' rebuilds, reached via pending-action-executor and
  // weight-basis-offer) all take this profile, so fixing the object fixes
  // every path at once and cannot be missed by a new one.
  //
  // The equality guard is what stops this fighting itself — it writes into
  // the same state it derives from, so without it every render would set
  // state again.
  useEffect(() => {
    if (!profile) return
    const corrected: UserProfile = {
      ...profile,
      ...compileKnownLiftOverrides(memoryGoals),
      training_days: compileTrainingDayOverrides(memoryFacts, profile.training_days ?? []),
    }
    if (JSON.stringify(corrected) !== JSON.stringify(profile)) setProfile(corrected)
  }, [profile, memoryFacts, memoryGoals])
  // assembleDay is pure — deriving today's picks from pools+targets on every
  // render (rather than storing them) means a pool refresh or a target
  // change (a new weigh-in) can never leave a stale assembled day on screen.
  const assembledMeals = macros ? assembleDay(mealPools, macros, {}, compiledSoftFoodPreferences) : null
  const chosenMeals: Partial<Record<MealSlotName, PoolOption>> = { ...assembledMeals?.chosen }
  for (const [slot, name] of Object.entries(manualMealPicks) as [MealSlotName, string][]) {
    const override = mealPools[slot]?.find(o => o.name === name)
    if (override) chosenMeals[slot] = override
  }
  const mealTotals: MacroTargets = Object.values(chosenMeals).reduce(
    (acc, o) => ({
      calories: acc.calories + (o?.macros.calories ?? 0),
      protein: acc.protein + (o?.macros.protein ?? 0),
      carbs: acc.carbs + (o?.macros.carbs ?? 0),
      fat: acc.fat + (o?.macros.fat ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
  // Chat context + its offline canned-response fallback still consume the
  // legacy MealPlanDay[] shape — adapted fresh from today's picks so the
  // chat and the Meals tab can never disagree.
  const mealPlan = chosenToMealPlanDays(chosenMeals)
  const [isRestoring, setIsRestoring] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  /**
   * True only from the moment onboarding SUCCEEDS, for the rest of that
   * session. AppTour will not start without it.
   *
   * A component-local flag rather than something derived from the profile,
   * because "has a plan" is not the question — every returning user has one.
   * The question is "did this person just finish onboarding in front of me",
   * and only this call site knows that. Someone who has been using the app for
   * a month opens it with no stored tour state either, and must not be handed
   * a tour of a plan they already know.
   */
  const [tourArmed, setTourArmed] = useState(false)
  /**
   * The plan generated but the profile row did not save.
   *
   * Kept SEPARATE from setupError deliberately. setupError's screen lives
   * inside `if (!profile)`, which is right for a failure that leaves us with
   * no profile — but a failed INSERT still runs setProfile below, so that
   * screen could never render for it and the warning was invisible. The user
   * was dropped into a working app holding a plan that silently vanishes on
   * reload, which is the exact outcome the insert-error branch says it
   * exists to prevent. This one renders over the app instead.
   */
  const [unsavedProfileWarning, setUnsavedProfileWarning] = useState<string | null>(null)
  const [generatingStatus, setGeneratingStatus] = useState('')
  const [exerciseExclusions, setExerciseExclusions] = useState<string[]>([])
  const [profileInfoOpen, setProfileInfoOpen] = useState(false)
  const [profileInfoSection, setProfileInfoSection] = useState<'goals' | 'facts' | 'context' | 'dietary' | undefined>(undefined)
  const [newPlanConfirmOpen, setNewPlanConfirmOpen] = useState(false)
  const [newPlanResetting, setNewPlanResetting] = useState(false)
  /** Injury/equipment plan_adaptations still active when the New Plan dialog opens — New Plan creates a brand-new profile row (see handleReset), which orphans anything tied to the old profile_id, including these. Fetched fresh on open (Part 3, injury-persistence fix) so the loss is named and consented-to rather than silent. */
  const [activeAdaptationsForReset, setActiveAdaptationsForReset] = useState<PlanAdaptationRow[]>([])
  // Chat typewriter reveal-speed preference — per-profile (reveal-speed-store.ts),
  // read once the profile resolves and written back on every change from Settings.
  const [revealSpeed, setRevealSpeedState] = useState<RevealSpeed>(DEFAULT_REVEAL_SPEED)
  useEffect(() => { setRevealSpeedState(getRevealSpeed(profile?.id)) }, [profile?.id])
  const handleRevealSpeedChange = (speed: RevealSpeed) => {
    if (!profile?.id) return
    setRevealSpeedState(speed)
    saveRevealSpeed(profile.id, speed)
  }
  const reloadMemory = async (profileId: string) => {
    const [facts, goals, contextFacts] = await Promise.all([getActiveFacts(profileId), getActiveGoals(profileId), getActiveContextFacts(profileId)])
    setMemoryFacts(facts)
    setMemoryGoals(goals)
    setMemoryContextFacts(contextFacts)
  }
  // Grocery list (VISION-ARCHITECTURE.md §5.4) — a snapshot for the chat's
  // "what's on my list" context and chat-add merge decisions. Not the Meals
  // tab's source of truth (GroceryList.tsx owns its own live state) — this
  // is reloaded after any chat write, same "caller reloads after" shape as
  // memory.
  const [groceryItems, setGroceryItems] = useState<GroceryItemRow[]>([])
  const reloadGrocery = async (profileId: string) => {
    setGroceryItems(await getAllGroceryItems(profileId))
  }
  const compiledExerciseExclusions = compileExerciseExclusions(memoryFacts)
  // A LEAN, not a ban — "not a fan of burpees but I'll do them". Reorders the
  // swap list only (VISION-ARCHITECTURE.md §1.2 scopes soft exercise
  // preferences to getReplacementCandidates and leaves rotation alone), so
  // nothing is removed from the plan and nothing is removed from the offer.
  const compiledSoftExercisePreferences = compileSoftExercisePreferences(memoryFacts)
  const compiledFoodDislikes = compileFoodDislikes(memoryFacts)
  const compiledTimingRules = compileTimingRules(memoryFacts)
  // user_facts is now the ONLY source for hard exercise/food dislikes —
  // `fitness_profiles.exercise_exclusions`/`.disliked_foods` are frozen,
  // deprecated columns (kept for history, migrated into user_facts once by
  // 20260807100000_backfill_profile_preferences_to_facts.sql, no longer
  // written or read). See "Fix — food/exercise preferences have two
  // competing stores": these two were the only genuinely duplicated pair;
  // favorite_cuisines/dietary_preferences/injuries were never duplicated
  // and still read straight off the profile.
  const effectiveExclusions = compiledExerciseExclusions
  const effectiveDislikedFoods = compiledFoodDislikes
  const [devOverrideWeek, setDevOverrideWeek] = useState<number | null>(null)
  const [devOverrideDay, setDevOverrideDay] = useState<string | null>(null)
  const [devBypassLocks, setDevBypassLocks] = useState(false)
  const [logsVersion, setLogsVersion] = useState(0)

  useEffect(() => {
    restoreSession()
  }, [])

  // Initial route (VISION-ARCHITECTURE.md §5 — the dashboard is the settled
  // answer to vision doc Q1, no longer the interim training-day/last-tab
  // heuristic LAYOUT-DESIGN.md §5.3 used before the dashboard existed).
  // Runs once, only when the hash doesn't already encode a tab (a deep link
  // or a back-navigation must never be overridden) — lands every returning
  // profile (restored OR freshly onboarded) on Dashboard; it owns its own
  // honest empty states for a brand-new profile, so there's no separate
  // "first launch" branch to encode here.
  const initialTabAppliedRef = useRef(false)
  useEffect(() => {
    if (initialTabAppliedRef.current || isRestoring || !profile?.id) return
    initialTabAppliedRef.current = true
    if (isKnownTabHash(hash)) return
    window.location.hash = tabHash('dashboard')
  }, [isRestoring, profile?.id, hash])

  // Remember the last tab a user actually landed on, for the next cold start.
  useEffect(() => {
    if (route.kind !== 'tab') return
    try {
      localStorage.setItem(LAST_TAB_KEY, route.tab)
    } catch { /* ignore */ }
  }, [route])

  const restoreSession = async () => {
    const storedId = localStorage.getItem(STORAGE_KEY)
    if (!storedId) {
      setIsRestoring(false)
      return
    }

    const { data: profileRow } = await supabase
      .from('fitness_profiles')
      .select('*')
      .eq('id', storedId)
      .maybeSingle()

    if (!profileRow) {
      localStorage.removeItem(STORAGE_KEY)
      setIsRestoring(false)
      return
    }

    const restoredProfile: UserProfile = {
      id: profileRow.id,
      // Number(null) is 0, not undefined — that silently turned "never given"
      // back into a fabricated measurement right at the restore boundary,
      // undoing the whole absence fix for every returning user. age/gender
      // pass through as-is (already null | T from Postgres); height/weight
      // need the Number() cast for real values but must skip it for null.
      age: profileRow.age ?? undefined,
      gender: profileRow.gender ?? undefined,
      height_cm: profileRow.height_cm == null ? undefined : Number(profileRow.height_cm),
      weight_kg: profileRow.weight_kg == null ? undefined : Number(profileRow.weight_kg),
      activity_level: profileRow.activity_level,
      fitness_goal: profileRow.fitness_goal,
      training_days: profileRow.training_days,
      preferred_time: profileRow.preferred_time,
      dietary_preferences: profileRow.dietary_preferences || [],
      session_duration_preference: profileRow.session_duration_preference || '45-60',
      workout_split_preference: profileRow.workout_split_preference || 'ai_recommendation',
      macro_calculation_mode: profileRow.macro_calculation_mode || 'STANDARD_STATIC',
      equipment_access: profileRow.equipment_access || 'full_gym',
      training_style: profileRow.training_style || 'hybrid',
      training_experience: profileRow.training_experience || 'novice',
      coaching_persona: profileRow.coaching_persona || 'supportive',
      recovery_capacity: profileRow.recovery_capacity || 'moderate',
      conditioning_preference: profileRow.conditioning_preference || 'tolerate',
      meals_per_day: profileRow.meals_per_day ?? 3,
      include_snacks: profileRow.include_snacks ?? true,
      cooking_time_preference: profileRow.cooking_time_preference || 'moderate',
      // Meal-realism round, part 3: onboarding's optional food-preference
      // answers — see the field docs on UserProfile in types.ts.
      favorite_cuisines: profileRow.favorite_cuisines || [],
      disliked_foods: profileRow.disliked_foods || [],
      breakfast_style: profileRow.breakfast_style || undefined,
      // Vision-architecture patch round, fix 2: injuries (onboarding's
      // body-part codes: 'lower_back'/'knees'/...) and exercise_exclusions
      // (ban_exercise's exact exercise names) used to share this one
      // column — reading exercise_exclusions back as "injuries" meant a
      // ban silently corrupted the injury list with an exercise name that
      // never matches INJURED_JOINTS, and vice versa at onboarding. Now a
      // dedicated column.
      injuries: profileRow.injuries || [],
      // Vision-architecture patch round, fix 6: read the known-lift columns
      // back so a reload doesn't silently revert to "no known lifts,
      // calibration week 1" after onboarding collected real numbers.
      skip_calibration_week: profileRow.skip_calibration_week ?? false,
      known_squat_kg: profileRow.known_squat_kg != null ? Number(profileRow.known_squat_kg) : undefined,
      known_bench_kg: profileRow.known_bench_kg != null ? Number(profileRow.known_bench_kg) : undefined,
      known_deadlift_kg: profileRow.known_deadlift_kg != null ? Number(profileRow.known_deadlift_kg) : undefined,
      display_name: profileRow.display_name || '',
      // MAPPED HERE OR IT DOES NOT EXIST. restoreSession builds the profile
      // column by column, so anything missing from this list is silently
      // undefined for the whole session however faithfully the database
      // stores it. Absent stays absent (?? null, never 0) — a zero would be
      // a target of no steps rather than "never set one".
      daily_step_target: profileRow.daily_step_target ?? null,
      // THE EIGHT THAT WERE SAVED AND NEVER READ BACK. All written correctly
      // — water-store.ts, load-ceiling-prompt.ts, handleMacroSplitChange —
      // and all undefined for the whole session because this list did not
      // name them. Every one is `?? null`/`?? undefined`, never `?? 0` and
      // never Number(): this function's own top comment exists because
      // coercing a null to a number turned "never given" back into a
      // fabricated measurement at exactly this boundary. A 0 ceiling is a
      // trainee who can lift nothing; a 0 protein target is a diet.
      max_dumbbell_kg: profileRow.max_dumbbell_kg ?? null,
      max_single_implement_kg: profileRow.max_single_implement_kg ?? null,
      max_improvised_kg: profileRow.max_improvised_kg ?? null,
      load_ceilings_declined: profileRow.load_ceilings_declined ?? null,
      macro_split_preset: profileRow.macro_split_preset ?? undefined,
      macro_protein_per_kg: profileRow.macro_protein_per_kg ?? undefined,
      macro_fat_percent: profileRow.macro_fat_percent ?? undefined,
      water_target_ml: profileRow.water_target_ml ?? undefined,
      concurrent_activities: profileRow.concurrent_activities || [],
      weekly_schedule: profileRow.weekly_schedule || {},
      created_at: profileRow.created_at || new Date().toISOString(),
      bmr: Number(profileRow.bmr),
      tdee: Number(profileRow.tdee),
      calorie_target: Number(profileRow.calorie_target),
      protein_g: Number(profileRow.protein_g),
      carbs_g: Number(profileRow.carbs_g),
      fat_g: Number(profileRow.fat_g),
    }

    const restoredExclusions: string[] = profileRow.exercise_exclusions || []
    setExerciseExclusions(restoredExclusions)

    const [restoredPools, { data: exerciseRows }, fullMesocycle] = await Promise.all([
      getPools(storedId),
      supabase.from('exercise_plans').select('*').eq('profile_id', storedId),
      restoreMesocycle(storedId),
    ])

    let restoredExercises: WorkoutDay[] = []
    let restoredMesocycle: MesocycleWeek[] = []

    if (fullMesocycle && fullMesocycle.weeks.length > 0) {
      // Full-fidelity path: every week, load/RPE/phase/warmup data intact,
      // exactly as generated. Supersedes the exercise_plans reconstruction
      // below entirely when present.
      restoredMesocycle = fullMesocycle.weeks
      // Live-week detection anchors to the PLAN's creation, not the profile's
      // (C0 Part 6) — a profile created months before its current plan would
      // otherwise open weeks deep into (or past) a cycle it just started.
      setMesocycleCreatedAt(fullMesocycle.createdAt)
      const week1 = restoredMesocycle.find(w => w.week_number === 1)
      if (week1) restoredExercises = week1.days
    } else if (exerciseRows) {
      // Legacy fallback for profiles created before mesocycle_weeks existed —
      // reconstructs only the columns exercise_plans actually has (no loads,
      // no phase info, and in practice only ever week 1: persistWeeklyPlan
      // historically ran before the mesocycle state was set, so week_number
      // never got written past 1).
      const hasWeekData = exerciseRows.some(r => r.week_number && r.week_number > 0)
      if (hasWeekData) {
        const weekLabels = [
          'Week 1 — Anatomical Adaptation',
          'Week 2 — Hypertrophy Accumulation',
          'Week 3 — Intensification',
          'Week 4 — Deload / Active Recovery',
        ]
        const byWeek = new Map<number, Map<string, typeof exerciseRows>>()
        for (const row of exerciseRows) {
          const wk = row.week_number || 1
          if (!byWeek.has(wk)) byWeek.set(wk, new Map())
          const dayMap = byWeek.get(wk)!
          const existing = dayMap.get(row.day) || []
          existing.push(row)
          dayMap.set(row.day, existing)
        }
        for (const [wk, dayMap] of byWeek) {
          const days: WorkoutDay[] = []
          for (const [day, exercises] of dayMap) {
            days.push({
              day,
              focus: exercises[0].focus,
              exercises: exercises.map(r => ({
                id: r.id,
                name: r.name,
                sets: r.sets,
                reps: r.reps,
                rest: r.rest,
                substitution: r.substitution || '',
                movement_pattern: r.movement_pattern || undefined,
                tier: r.tier || undefined,
                fatigue_cost: r.fatigue_cost || undefined,
              })),
            })
          }
          restoredMesocycle.push({
            week_number: wk,
            label: weekLabels[wk - 1] || `Week ${wk}`,
            days,
          })
        }
        restoredMesocycle.sort((a, b) => a.week_number - b.week_number)
        const week1 = restoredMesocycle.find(w => w.week_number === 1)
        if (week1) restoredExercises.push(...week1.days)
      } else {
        const grouped = new Map<string, typeof exerciseRows>()
        for (const row of exerciseRows) {
          const existing = grouped.get(row.day) || []
          existing.push(row)
          grouped.set(row.day, existing)
        }
        for (const [day, exercises] of grouped) {
          restoredExercises.push({
            day,
            focus: exercises[0].focus,
            exercises: exercises.map(r => ({
              id: r.id,
              name: r.name,
              sets: r.sets,
              reps: r.reps,
              rest: r.rest,
              substitution: r.substitution || '',
              movement_pattern: r.movement_pattern || undefined,
              tier: r.tier || undefined,
              fatigue_cost: r.fatigue_cost || undefined,
            })),
          })
        }
      }
    }

    // Living targets (M0): computed on read from the profile + the latest
    // weigh-in, never from the frozen fitness_profiles macro columns (still
    // written at onboarding for back-compat; nothing reads them anymore).
    let restoredWeight = await getLatestWeightKg(restoredProfile.id!).catch(() => null)
    // Fix 1c (ux-sweep), existing-profile half: a profile from before the
    // onboarding-seed fix above still has zero daily_metrics rows. Lazy
    // check-on-load backfill (matches this app's existing convention, e.g.
    // checkAndRevertExpiredAdaptations) — one dated seed row, same pipeline,
    // so it never needs a standalone migration to reach in-flight accounts.
    if (restoredWeight == null && restoredProfile.weight_kg) {
      try {
        await upsertDailyMetric({
          profile_id: restoredProfile.id!,
          date: (restoredProfile.created_at ?? new Date().toISOString()).slice(0, 10),
          weight_kg: restoredProfile.weight_kg,
        })
        restoredWeight = restoredProfile.weight_kg
      } catch (err) {
        console.error('Backfilling onboarding weigh-in failed:', err)
      }
    }
    // targetWeightAnchorKg (not restoredWeight) drives the actual target
    // number — a threshold-gated 7-day average, so a single noisy reading
    // doesn't retune calories on its own. See getEffectiveTargetWeightKg's
    // doc comment.
    const effectiveTargetWeight = await getEffectiveTargetWeightKg(
      restoredProfile.id!,
      restoredWeight ?? restoredProfile.weight_kg,
    )
    const liveTargets = computeTargets(restoredProfile, {
      latestWeightKg: effectiveTargetWeight.weightKg,
      exercisePlan: restoredExercises,
    })

    setProfile(restoredProfile)
    setLatestWeightKg(restoredWeight)
    setTargetWeightAnchorKg(effectiveTargetWeight.weightKg ?? null)
    setMacros(liveTargets)
    setMealPools(restoredPools)
    setExercisePlan(restoredExercises)
    setMesocycle(restoredMesocycle)
    setIsRestoring(false)

    // Goal-proximity nudge (ask-first, never auto-changes anything — see
    // goal-proximity.ts's own doc comment): checked against the same
    // threshold-gated weight the targets themselves just used.
    if (restoredProfile.id) {
      getActiveGoals(restoredProfile.id).then(goals => {
        const weightGoal = goals.find(g => g.metric === 'body_weight_kg')
        if (!weightGoal) return
        const info = effectiveTargetWeight.weightKg == null ? null : describeGoalProximity(effectiveTargetWeight.weightKg, weightGoal)
        if (info && !isGoalProximityDismissed(info.goalId)) {
          setAdaptationMessages(prev => prev.some(m => m.goalId === info.goalId) ? prev : [...prev, { text: info.message, goalId: info.goalId }])
        }
      }).catch(console.error)
    }

    // Persisted per-date meal picks (UX-sweep fix) — a confirmed swap must
    // survive reload, not just live in manualMealPicks React state.
    if (restoredProfile.id) {
      const todayDate = getSessionDateContext(restoredProfile.id).date
      getMealPicksForDate(restoredProfile.id, todayDate).then(setManualMealPicks).catch(console.error)
    }

    // Lazy check-on-load sweep (no scheduled-job infra exists in this
    // codebase) — silently restores any injury/equipment adaptation whose
    // stated period has passed, surfacing only a client-authored message,
    // never a model-narrated one.
    if (restoredProfile.id) {
      checkAndRevertExpiredAdaptations(restoredProfile.id).then(result => {
        if (result.mesocycle) {
          setMesocycle(prev => {
            const byWeek = new Map(prev.map(w => [w.week_number, w]))
            for (const w of result.mesocycle!) byWeek.set(w.week_number, w)
            return [...byWeek.values()].sort((a, b) => a.week_number - b.week_number)
          })
        }
        if (result.messages.length > 0) setAdaptationMessages(prev => [...prev, ...result.messages.map(text => ({ text }))])
      }).catch(console.error)
    }

    // VISION.md Step 4 + Step 5 — same lazy check-on-load sweep pattern as
    // the adaptation-expiry check just above, run right after it. Both fire
    // on the exact same trigger (the live week just became week 1 of a new
    // block) and can both touch the same weeks — Step 4 holds a stalled
    // main lift's LOAD flat, Step 5 holds a low-attendance block's VOLUME
    // flat. Chained with .then(), not run independently: each check's saved
    // write (and the mesocycle array it hands to the next) already includes
    // whatever the previous check just changed. Two independent
    // fire-and-forget calls would each build their patch from the SAME
    // original snapshot and could silently clobber each other's save
    // (and the client state) if both trigger on the same visit — this
    // sequencing is what prevents that, not just the merge-by-week-number
    // pattern each check's own save already uses.
    if (restoredProfile.id && restoredMesocycle.length > 0) {
      const blockCheckPlanCreatedAt = fullMesocycle?.createdAt ?? restoredProfile.created_at ?? new Date().toISOString()
      const blockCheckNow = getAppNow(restoredProfile.id)
      // Hoisted so every stage of the chain can read/update "the mesocycle
      // as patched so far" — each `.then()` below is a separate callback,
      // not nested, so a `const` declared inside one isn't visible to the
      // next; this `let`, declared in the enclosing scope all three close
      // over, is what lets Step 6 see Step 4 and 5's patches without
      // threading them through each promise's resolved value.
      let workingMesocycle = restoredMesocycle
      checkForBlockReview(restoredProfile.id, restoredMesocycle, restoredProfile, blockCheckPlanCreatedAt, blockCheckNow)
        .then(blockReviewResult => {
          if (blockReviewResult.mesocycle) {
            workingMesocycle = blockReviewResult.mesocycle
            setMesocycle(prev => {
              const byWeek = new Map(prev.map(w => [w.week_number, w]))
              for (const w of blockReviewResult.mesocycle!) byWeek.set(w.week_number, w)
              return [...byWeek.values()].sort((a, b) => a.week_number - b.week_number)
            })
          }
          if (blockReviewResult.messages.length > 0) setAdaptationMessages(prev => [...prev, ...blockReviewResult.messages.map(text => ({ text }))])

          return checkForConsistencyHold(restoredProfile.id!, workingMesocycle, restoredProfile, blockCheckPlanCreatedAt, blockCheckNow)
        })
        .then(consistencyResult => {
          if (consistencyResult.mesocycle) {
            workingMesocycle = consistencyResult.mesocycle
            setMesocycle(prev => {
              const byWeek = new Map(prev.map(w => [w.week_number, w]))
              for (const w of consistencyResult.mesocycle!) byWeek.set(w.week_number, w)
              return [...byWeek.values()].sort((a, b) => a.week_number - b.week_number)
            })
          }
          if (consistencyResult.messages.length > 0) setAdaptationMessages(prev => [...prev, ...consistencyResult.messages.map(text => ({ text }))])

          // A plan can sit above a ceiling its own trainee already stated,
          // because this function did not read those columns back for a
          // while — so every plan generated after someone said "my dumbbells
          // go to 24kg" was built as though they never had. Mapping the
          // columns above fixes the NEXT plan; this fixes the one they are
          // already in, which was Ashley's call over waiting up to sixteen
          // weeks for it to age out.
          //
          // From the ACTIVE week forward only: rewriting a load someone has
          // already trained against would change what their own logs are
          // measured against. Idempotent — it looks for prescribed loads
          // above the ceiling, so after a rebuild there is nothing to find.
          return reconcileToStatedCeilings(
            restoredProfile.id!,
            workingMesocycle,
            restoredProfile,
            restoredExclusions,
            getActiveMesocycleWeek(blockCheckPlanCreatedAt, blockCheckNow, workingMesocycle.length),
          )
        })
        .then(ceilingResult => {
          if (ceilingResult.mesocycle) {
            workingMesocycle = ceilingResult.mesocycle
            setMesocycle(prev => {
              const byWeek = new Map(prev.map(w => [w.week_number, w]))
              for (const w of ceilingResult.mesocycle!) byWeek.set(w.week_number, w)
              return [...byWeek.values()].sort((a, b) => a.week_number - b.week_number)
            })
          }
          if (ceilingResult.messages.length > 0) setAdaptationMessages(prev => [...prev, ...ceilingResult.messages.map(text => ({ text }))])

          // Vision Step 6 — never patches the mesocycle itself (see
          // load-suggestions.ts's own header comment for why); only ever
          // surfaces a proposal, via the same dashboard banner, now with
          // real Confirm/Decline buttons instead of a plain Dismiss.
          return checkForLoadSuggestions(restoredProfile.id!, workingMesocycle, restoredProfile, blockCheckPlanCreatedAt, blockCheckNow)
        })
        .then(loadSuggestionResult => {
          if (loadSuggestionResult.suggestions.length > 0) {
            setAdaptationMessages(prev => [
              ...prev,
              ...loadSuggestionResult.suggestions.map(s => ({ text: s.text, loadSuggestionId: s.id })),
            ])
          }

          // Backlog 2b follow-on — offer to rebuild starting weights now that
          // we know what they actually weigh. Like Step 6 above it never
          // patches anything itself; it only ever surfaces an offer.
          //
          // The cheap gate runs HERE rather than inside the check so the
          // getActiveFacts read below only happens for a profile that could
          // actually be offered something — the vast majority of plans hold
          // no 'assumed_body' loads at all and should cost nothing.
          if (!planHasAssumedBodyLoads(workingMesocycle)) return null
          // Read the exclusions fresh rather than closing over
          // compiledExerciseExclusions: that memo is derived from memoryFacts,
          // which reloadMemory populates asynchronously AFTER this chain
          // starts, so the closed-over value here is empty on a cold load.
          // The preview would then be built against a different exercise pool
          // than the confirm, and could name a banned lift in the offer text.
          return getActiveFacts(restoredProfile.id!)
            .catch(() => [] as UserFactRow[])
            .then(facts => checkForWeightBasisOffer({
              profileId: restoredProfile.id!,
              profile: restoredProfile,
              mesocycle: workingMesocycle,
              basisWeightKg: effectiveTargetWeight.weightKg,
              exclusions: compileExerciseExclusions(facts),
              planCreatedAt: blockCheckPlanCreatedAt,
              now: blockCheckNow,
            }))
        })
        .then(weightBasisOffer => {
          if (weightBasisOffer) {
            setAdaptationMessages(prev => [...prev, { text: weightBasisOffer.text, weightBasisOfferId: weightBasisOffer.id }])
          }
        })
        .catch(console.error)
    }
    if (restoredProfile.id) { void reloadMemory(restoredProfile.id); void reloadGrocery(restoredProfile.id) }

    // Version today's targets when they differ from the last snapshot —
    // fire-and-forget; the M3 trend loop reads this history. changedFromPrior
    // (a real move from an EXISTING prior snapshot, not a profile's first
    // one ever) is the one-time "your target changed" notice trigger.
    snapshotTargetsIfChanged(restoredProfile.id!, restoredProfile, liveTargets, effectiveTargetWeight.weightKg)
      .then(result => {
        if (result.changedFromPrior) {
          setAdaptationMessages(prev => [...prev, { text: `Your calorie target updated to ${liveTargets!.calories} kcal, based on your recent weigh-ins.` }])
        }
      })
  }

  const handleOnboardingComplete = async (userProfile: UserProfile) => {
    setIsGenerating(true)
    setSetupError(null)
    setGeneratingStatus('Calculating your macro targets...')

    // Everything below runs inside try/finally. Without it, a single failure
    // anywhere in this function skipped setIsGenerating(false) entirely and
    // left the user watching a spinner with no way forward and no error shown.
    try {

    // Null when the user declined a body metric. bmr/tdee/targets then stay
    // undefined on the profile rather than being computed from a guessed
    // weight — the training plan below is generated either way, because it
    // does not need these numbers.
    const onboardingMetrics = resolveBodyMetrics(userProfile)
    const bmr = onboardingMetrics ? computeBMR(onboardingMetrics) : undefined
    const tdee = bmr != null ? computeStaticTDEE(bmr, userProfile.activity_level) : undefined
    // No weigh-ins can exist yet at onboarding, so computeTargets here is
    // equivalent to the static calculation — but going through the one
    // shared entry point keeps every consumer on identical numbers.
    const calculatedMacros = computeTargets(userProfile)

    const enrichedProfile: UserProfile = {
      ...userProfile,
      bmr,
      tdee,
      calorie_target: calculatedMacros?.calories,
      protein_g: calculatedMacros?.protein,
      carbs_g: calculatedMacros?.carbs,
      fat_g: calculatedMacros?.fat,
    }

    // "Never give me burpees" has to reach THIS call, not just the database.
    // The user_facts rows written after the insert below are what keeps the
    // exclusion alive for every later regenerate — but they are written after
    // the plan already exists, and exerciseExclusions is [] for a brand-new
    // signup, so relying on them alone would hand someone a first plan
    // containing the exact exercise they just said they never wanted to see.
    // That is the half-landed shape this whole change exists to fix, so the
    // in-memory answer is resolved and merged in here.
    //
    // resolveExerciseTarget returns 'unresolved' for a phrase that matches no
    // catalogue entry ("those jumpy squat things"). Those contribute nothing
    // to the exclusion list — there is no name to exclude — but they are
    // still recorded below, so the answer is never silently dropped and the
    // coach can pick it up in conversation.
    const onboardingExerciseDislikes = enrichedProfile.disliked_exercises ?? []
    const resolvedDislikeRefs = [...new Set(
      onboardingExerciseDislikes.flatMap(phrase => {
        const r = resolveExerciseTarget(phrase)
        return r.resolution === 'resolved' ? r.resolvedRefs : []
      }),
    )]
    const effectiveOnboardingExclusions = [...new Set([...exerciseExclusions, ...resolvedDislikeRefs])]

    const planResult = generateExercisePlan(enrichedProfile, effectiveOnboardingExclusions)
    const workout = planResult.plan
    const mesocycleData = generateMesocycle(enrichedProfile, workout, effectiveOnboardingExclusions)

    const { data, error: insertError } = await supabase
      .from('fitness_profiles')
      .insert({
        age: enrichedProfile.age,
        gender: enrichedProfile.gender,
        height_cm: enrichedProfile.height_cm,
        weight_kg: enrichedProfile.weight_kg,
        activity_level: enrichedProfile.activity_level,
        fitness_goal: enrichedProfile.fitness_goal,
        training_days: enrichedProfile.training_days,
        preferred_time: enrichedProfile.preferred_time,
        dietary_preferences: enrichedProfile.dietary_preferences,
        session_duration_preference: enrichedProfile.session_duration_preference,
        workout_split_preference: enrichedProfile.workout_split_preference,
        macro_calculation_mode: enrichedProfile.macro_calculation_mode,
        equipment_access: enrichedProfile.equipment_access,
        training_style: enrichedProfile.training_style,
        training_experience: enrichedProfile.training_experience,
        coaching_persona: enrichedProfile.coaching_persona,
        recovery_capacity: enrichedProfile.recovery_capacity,
        conditioning_preference: enrichedProfile.conditioning_preference,
        meals_per_day: enrichedProfile.meals_per_day ?? 3,
        include_snacks: enrichedProfile.include_snacks ?? true,
        cooking_time_preference: enrichedProfile.cooking_time_preference ?? 'moderate',
        // Vision-architecture patch round, fix 2: injuries (body-part codes
        // from onboarding) and exercise_exclusions (exact exercise names
        // banned later via ban_exercise) are separate columns now — see the
        // restore-path comment above for why sharing one broke both.
        injuries: enrichedProfile.injuries || [],
        exercise_exclusions: [],
        // Vision-architecture patch round, fix 6: these four already flowed
        // into generateMesocycle via enrichedProfile (see
        // OnboardingFlow.tsx), so the first mesocycle honored them — but
        // they were never written here, so a reload always restored a
        // profile with no known lifts and a calibration week 1.
        skip_calibration_week: enrichedProfile.skip_calibration_week ?? false,
        known_squat_kg: enrichedProfile.known_squat_kg ?? null,
        known_bench_kg: enrichedProfile.known_bench_kg ?? null,
        known_deadlift_kg: enrichedProfile.known_deadlift_kg ?? null,
        // Meal-realism round, part 3: onboarding's optional food-preference
        // answers — see the field docs on UserProfile in types.ts.
        favorite_cuisines: enrichedProfile.favorite_cuisines || [],
        // Fix — food/exercise preferences have two competing stores:
        // disliked_foods is now written to user_facts only (below, once
        // data.id exists), never this column — see the deprecation note on
        // UserProfile.disliked_foods in types.ts.
        disliked_foods: [],
        breakfast_style: enrichedProfile.breakfast_style || null,
        display_name: enrichedProfile.display_name || null,
        bmr: enrichedProfile.bmr,
        tdee: enrichedProfile.tdee,
        calorie_target: enrichedProfile.calorie_target,
        protein_g: enrichedProfile.protein_g,
        carbs_g: enrichedProfile.carbs_g,
        fat_g: enrichedProfile.fat_g,
      })
      .select('id')
      .maybeSingle()

    if (insertError) {
      // Surface this rather than swallowing it. The most likely cause after a
      // schema change is a column the database does not have yet — silently
      // continuing would leave the user with a plan that vanishes on reload.
      console.error('Saving profile failed:', insertError)
      setUnsavedProfileWarning(
        `Your plan was built, but we couldn't save it: ${insertError.message}. ` +
        `You can keep using it now, but it won't be here if you reload.`
      )
    }

    let generatedPools: Partial<Record<MealSlotName, PoolOption[]>> = {}
    if (data) {
      enrichedProfile.id = data.id
      localStorage.setItem(STORAGE_KEY, data.id)
      // Conversational-onboarding draft: context facts / goals volunteered
      // mid-conversation queue in the draft (user_context_facts/user_goals
      // need a profile_id that didn't exist until this insert). Flush them
      // ONLY for a draft the chat path stamped `completing` — a draft
      // abandoned for the questionnaire is discarded unflushed, so a
      // half-conversation's facts can never attach to a form-built profile.
      // Per-item try/catch: one failed write must not lose the rest, and on
      // any failure the draft is KEPT (it's inert once a profile exists)
      // rather than cleared into permanent silent data loss. Clearing on
      // success is also the no-duplicate-row guard: a cleared draft can
      // never re-run completion.
      try {
        const onboardingDraft = loadOnboardingDraft()
        if (onboardingDraft?.completing) {
          let allFlushed = true
          for (const fact of onboardingDraft.pendingContextFacts) {
            try {
              await createContextFact({
                profileId: data.id,
                source: 'chat',
                rawPhrase: fact.rawPhrase,
                displayText: fact.displayText,
              })
            } catch (err) {
              allFlushed = false
              console.error('Flushing onboarding context fact failed:', fact.displayText, err)
            }
          }
          for (const goal of onboardingDraft.pendingGoals) {
            try {
              await createGoal({
                profileId: data.id,
                metric: goal.metric,
                trackable: goal.metric === 'directional' ? 'directional' : 'measurable',
                baselineValue: goal.baselineValue,
                baselineSource: goal.baselineValue != null ? 'user_stated' : undefined,
                targetValue: goal.targetValue,
                targetDate: goal.targetDate,
                source: 'chat',
                rawPhrase: goal.rawPhrase,
                displayText: goal.displayText,
              })
            } catch (err) {
              allFlushed = false
              console.error('Flushing onboarding goal failed:', goal.displayText, err)
            }
          }
          if (onboardingDraft.pendingContextFacts.length > 0 || onboardingDraft.pendingGoals.length > 0) {
            try {
              await reloadMemory(data.id)
            } catch (err) {
              console.error('Reloading memory after draft flush failed:', err)
            }
          }
          if (allFlushed) {
            clearOnboardingDraft()
          } else {
            console.error('Onboarding draft kept: some queued facts/goals failed to save')
          }
        } else if (onboardingDraft) {
          clearOnboardingDraft()
        }
      } catch (err) {
        console.error('Flushing onboarding draft failed:', err)
      }
      // Fix — food/exercise preferences have two competing stores:
      // onboarding's disliked-foods answer is no longer written to the
      // `disliked_foods` column (see the insert above) — it's recorded as
      // user_facts rows instead, the same shape a later "I hate marmite"
      // chat turn would produce, so both paths land in exactly one place.
      // Meal-pool generation just below still reads enrichedProfile.disliked_foods
      // directly (the in-memory onboarding answer) since memoryFacts hasn't
      // been fetched yet at this point in a brand-new signup.
      // Fix 1c (ux-sweep) — onboarding weight only ever wrote to
      // fitness_profiles.weight_kg, which nothing outside computeTargets'
      // fallback reads. Dashboard's trend, ProfileScreen's "current weight",
      // goal progress and chat's own context payload all read exclusively
      // from daily_metrics, seeing zero rows and reporting the honest-but-
      // unhelpful "no weigh-ins yet" — while chat, holding the onboarding
      // weight in the very same context payload, contradicted itself by
      // asking the user for a number it already had. One dated seed row
      // (today, via the same upsertDailyMetric path a manual weigh-in
      // uses) fixes every one of those reads through the single existing
      // pipeline, and — since weight-trend.ts already has a tested
      // single-sample path (sampleCount===1: shows a level, no rate) —
      // this reports honestly rather than fabricating a trend from one point.
      // Only seed a weigh-in if there is a weight to seed. Writing one from a
      // missing value would put a fabricated number into the weight SERIES,
      // which then anchors every future target — the worst place for a guess
      // to land, because it looks like something the user measured.
      if (enrichedProfile.weight_kg != null) {
        try {
          await upsertDailyMetric({
            profile_id: data.id,
            date: getSessionDateContext(data.id).date,
            weight_kg: enrichedProfile.weight_kg,
          })
        } catch (err) {
          console.error('Seeding onboarding weigh-in failed:', err)
        }
      }
      // Same shape as the food block below, on purpose: one createFact per
      // phrase, source 'onboarding', hard dislike — identical to what a later
      // "never give me burpees" chat turn writes, so both paths land in
      // exactly one place and compileExerciseExclusions sees them the same
      // way. An unresolved phrase still gets a row (nothing is lost, and it
      // shows on the Profile screen) with no resolved_refs, so it excludes
      // nothing rather than excluding something wrong.
      if (onboardingExerciseDislikes.length > 0) {
        try {
          await Promise.all(onboardingExerciseDislikes.map(phrase => {
            const r = resolveExerciseTarget(phrase)
            return createFact({
              profileId: data.id,
              kind: 'exercise_preference',
              source: 'onboarding',
              rawPhrase: phrase,
              displayText: `won't eat/do ${phrase}`,
              polarity: 'dislike',
              hardness: 'hard',
              resolvedRefs: r.resolution === 'resolved' ? r.resolvedRefs : [],
            })
          }))
          await reloadMemory(data.id)
        } catch (err) {
          console.error('Recording onboarding exercise dislikes failed:', err)
        }
      }
      if (enrichedProfile.disliked_foods && enrichedProfile.disliked_foods.length > 0) {
        try {
          await Promise.all(enrichedProfile.disliked_foods.map(food => createFact({
            profileId: data.id,
            kind: 'food_preference',
            source: 'onboarding',
            rawPhrase: food,
            displayText: `won't eat/do ${food}`,
            polarity: 'dislike',
            hardness: 'hard',
            resolvedRefs: resolveFoodTarget(food),
          })))
          await reloadMemory(data.id)
        } catch (err) {
          console.error('Recording onboarding food dislikes failed:', err)
        }
      }
      try {
        await persistLegacyExercisePlan(data.id, workout)
      } catch (err) {
        // A failure to persist the plan must not block showing it.
        console.error('Persisting exercise plan failed:', err)
      }
      try {
        // Full-fidelity save — every week, with loads/phase/warmup intact.
        // Passing mesocycleData directly (not the `mesocycle` state) matters:
        // setMesocycle() below hasn't run yet, so the state is still empty.
        await saveMesocycle(data.id, mesocycleData)
      } catch (err) {
        console.error('Persisting mesocycle failed:', err)
      }
      // No targets means no macro budget for meals to hit. Generating a pool
      // against invented numbers would produce a plausible-looking day of
      // food built on nothing — skip it; the nutrition surface explains why
      // and the meals appear as soon as a weight is added.
      if (calculatedMacros) try {
        setGeneratingStatus('Building your meal pools...')
        const result = await generateMealPools({
          profileId: data.id,
          targets: calculatedMacros,
          dietaryPreferences: enrichedProfile.dietary_preferences,
          mealsPerDay: enrichedProfile.meals_per_day,
          includeSnacks: enrichedProfile.include_snacks,
          cookingTimePreference: enrichedProfile.cooking_time_preference,
          favoriteCuisines: enrichedProfile.favorite_cuisines,
          dislikedFoods: enrichedProfile.disliked_foods,
          breakfastStyle: enrichedProfile.breakfast_style,
        })
        generatedPools = result.accepted
        // Onboarding's dietary_preferences always comes from the picker, so
        // this branch is defensive rather than reachable today — but it
        // costs nothing to keep the one piece of state honest from first
        // load rather than only ever touched by the regenerate handlers.
        if (result.unrecognisedPreferences.length > 0) setUnrecognisedDietaryRestrictions(result.unrecognisedPreferences)
      } catch (err) {
        // Meal generation failing must not block the rest of the plan —
        // the Meals tab shows its own empty state with a manual retry.
        console.error('Meal pool generation failed:', err)
      }
    }

    setProfile(enrichedProfile)
    setMacros(calculatedMacros)
    // Arms the app tour. Deliberately here and not in the `finally` below:
    // this line is only reached when a plan was genuinely built, and a tour of
    // an app whose onboarding just failed would be the wrong thing to show
    // someone staring at an error.
    setTourArmed(true)
    // The onboarding weight IS the first weigh-in (it's written to
    // daily_metrics above) — seed the shared latestWeightKg from it so the
    // derivation/targets never render a previous profile's stale weight.
    setLatestWeightKg(enrichedProfile.weight_kg ?? null)
    setExercisePlan(workout)
    setMesocycle(mesocycleData)
    setMesocycleCreatedAt(new Date().toISOString())
    setMealPools(generatedPools)
    } catch (err) {
      console.error('Onboarding failed:', err)
      setSetupError(
        err instanceof Error ? err.message : 'Something went wrong while building your plan.'
      )
    } finally {
      // Always runs — the user is never left stranded on the loading screen.
      setIsGenerating(false)
    }
  }

  /** Legacy exercise_plans mirror — meal persistence now goes through generateMealPools -> meal_plan_slots (M1); this only handles the exercise-side legacy table. */
  const persistLegacyExercisePlan = async (profileId: string, workout: WorkoutDay[]) => {
    const exerciseRows = mesocycle.length > 0
      ? mesocycle.flatMap(week =>
          week.days.flatMap(day =>
            day.exercises.map(ex => ({
              profile_id: profileId,
              day: day.day,
              focus: day.focus,
              name: ex.name,
              sets: ex.sets,
              reps: ex.reps,
              rest: ex.rest,
              substitution: ex.substitution,
              week_number: week.week_number,
              movement_pattern: ex.movement_pattern || null,
              tier: ex.tier || null,
              fatigue_cost: ex.fatigue_cost || null,
            }))
          )
        )
      : workout.flatMap(day =>
          day.exercises.map(ex => ({
            profile_id: profileId,
            day: day.day,
            focus: day.focus,
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            rest: ex.rest,
            substitution: ex.substitution,
            week_number: 1,
            movement_pattern: ex.movement_pattern || null,
            tier: ex.tier || null,
            fatigue_cost: ex.fatigue_cost || null,
          }))
        )

    await supabase.from('exercise_plans').insert(exerciseRows)
  }

  const handlePlanUpdate = async (action: PlanAction) => {
    // replace_food/replace_exercise are gone from PlanAction entirely —
    // categorically superseded by propose_meal_swap/propose_exercise_swap's
    // pending-action rail, which writes through meal-store/mesocycle-edit
    // directly rather than forwarding through this handler.
    if (action.type === 'adjust_volume') {
      setExercisePlan(prev =>
        prev.map(day => {
          if (day.day.toLowerCase() !== action.day.toLowerCase()) return day
          return {
            ...day,
            exercises: day.exercises.map(ex => {
              switch (action.adjustment) {
                case 'reduce_light':
                  return { ...ex, sets: Math.max(1, ex.sets - 1) }
                case 'reduce_half':
                  return { ...ex, sets: Math.max(1, Math.round(ex.sets / 2)) }
                case 'reduce_heavy':
                  return { ...ex, sets: Math.max(1, ex.sets - 2) }
                case 'increase_moderate':
                  return { ...ex, sets: ex.sets + 1 }
                case 'increase_heavy':
                  return { ...ex, sets: ex.sets + 2 }
                default:
                  return ex
              }
            }),
          }
        })
      )
    } else if (action.type === 'ban_exercise') {
      handleBanExercise(action.exercise_name)
    } else if (action.type === 'update_workout_schedule') {
      await handleScheduleUpdate(action.schedule_patch)
    }
  }

  const handleScheduleUpdate = async (schedulePatch: SchedulePatchItem[]) => {
    if (!profile?.id) return

    // Build the new weekly_schedule from the patch operations
    const newSchedule = { ...(profile.weekly_schedule || {}) }
    for (const item of schedulePatch) {
      if (item.action === 'REMOVE') {
        newSchedule[item.day] = null
      } else {
        newSchedule[item.day] = item.block_name
      }
    }
    setProfile(prev => prev ? { ...prev, weekly_schedule: newSchedule } : prev)

    const normalizeBlock = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

    const currentDayMap = new Map<string, { focus: string; ids: string[] }>()
    for (const day of exercisePlan) {
      const ids = day.exercises.map(e => e.id).filter(Boolean) as string[]
      currentDayMap.set(day.day, { focus: day.focus, ids })
    }

    for (const item of schedulePatch) {
      const { day, action, block_name, exercises } = item

      if (action === 'REMOVE') {
        // Delete exercise rows for this day
        const info = currentDayMap.get(day)
        if (info && info.ids.length > 0) {
          await supabase.from('exercise_plans').delete().in('id', info.ids)
        }
      } else if (action === 'ADD') {
        // Insert new exercises for this day
        if (exercises && exercises.length > 0) {
          const rows = exercises.map(ex => ({
            profile_id: profile.id,
            day,
            focus: block_name,
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            rest: '60-90s',
          }))
          await supabase.from('exercise_plans').insert(rows)
        }
      } else if (action === 'MOVE') {
        // Clear existing exercises on the target day before moving
        const targetInfo = currentDayMap.get(day)
        if (targetInfo && targetInfo.ids.length > 0) {
          await supabase.from('exercise_plans').delete().in('id', targetInfo.ids)
        }

        // Relocate source day's exercise rows to the target day
        const normalizedBlock = normalizeBlock(block_name)
        for (const [currentDay, info] of currentDayMap) {
          if (normalizeBlock(info.focus) === normalizedBlock && currentDay !== day && info.ids.length > 0) {
            await supabase.from('exercise_plans')
              .update({ day, focus: block_name })
              .in('id', info.ids)

            // Mark the source day as rest unless another patch item fills it
            const sourceHandledByOtherPatch = schedulePatch.some(
              p => p.day === currentDay && p !== item && p.action !== 'REMOVE'
            )
            if (!sourceHandledByOtherPatch) {
              newSchedule[currentDay] = null
            }
            break
          }
        }
      }
    }

    // Refresh exercise plan from DB
    const { data: exerciseRows } = await supabase
      .from('exercise_plans')
      .select('*')
      .eq('profile_id', profile.id)

    if (exerciseRows) {
      const grouped = new Map<string, typeof exerciseRows>()
      for (const row of exerciseRows) {
        const existing = grouped.get(row.day) || []
        existing.push(row)
        grouped.set(row.day, existing)
      }
      const refreshed: WorkoutDay[] = []
      for (const [day, exercises] of grouped) {
        refreshed.push({
          day,
          focus: exercises[0].focus,
          exercises: exercises.map(r => ({
            id: r.id,
            name: r.name,
            sets: r.sets,
            reps: r.reps,
            rest: r.rest,
            substitution: r.substitution || '',
          })),
        })
      }
      setExercisePlan(refreshed)
    }
  }

  // ONE meal-mutation layer (M1): the UI swap goes through
  // meal-store.swapPoolMeal — the same call the chat's replace_food handler
  // makes (App.tsx handlePlanUpdate is unaffected; that path was already
  // wired to swapPoolMeal in M0). Picking a specific alternative just
  // records the choice as a session-local override (manualMealPicks) —
  // the pool itself doesn't change, only which option is "today's pick".
  const handleSwapMealSlot = async (slot: MealSlotName, chooseName: string) => {
    if (!profile?.id) return
    const applied = await swapPoolMeal(profile.id, slot, chosenMeals[slot]?.name, chooseName)
    if (!applied) return
    // Persist BEFORE updating the on-screen pick (UX-sweep fix) — this used
    // to update React state first, so a confirmed swap could look applied
    // on screen even when the write below never landed.
    const todayDate = getSessionDateContext(profile.id).date
    try {
      await setMealPick(profile.id, todayDate, slot, applied.name)
    } catch (err) {
      console.error('handleSwapMealSlot: setMealPick failed — not applying the swap on screen', err)
      return
    }
    setManualMealPicks(prev => ({ ...prev, [slot]: applied.name }))
    // §2.3 — same sweep as the exercise swap path, same scope_key prefix propose_meal_swap uses.
    await sweepStaleForTarget(profile.id, `${profile.id}:propose_meal_swap:${slot}`)
  }

  const handleRegenerateMealSlot = async (slot: MealSlotName) => {
    if (!profile?.id || !macros) return
    setIsGeneratingMeals(true)
    setMealRegenerateError(null)
    const hadExistingOptions = (mealPools[slot]?.length ?? 0) > 0
    try {
      const result = await generateMealPools({
        profileId: profile.id,
        targets: macros,
        dietaryPreferences: profile.dietary_preferences,
        mealsPerDay: profile.meals_per_day,
        includeSnacks: profile.include_snacks,
        cookingTimePreference: profile.cooking_time_preference,
        favoriteCuisines: profile.favorite_cuisines,
        dislikedFoods: effectiveDislikedFoods,
        timingRules: compiledTimingRules,
        breakfastStyle: profile.breakfast_style,
        onlySlots: [slot],
      })
      // Surfacing round — a dietary_preferences value the app can't enforce
      // fails every proposal identically, so this is checked before anything
      // else and short-circuits: there's nothing a per-slot message or a
      // retry can add once the actual cause is known.
      if (result.unrecognisedPreferences.length > 0) {
        setUnrecognisedDietaryRestrictions(result.unrecognisedPreferences)
        return
      }
      setUnrecognisedDietaryRestrictions(null)
      // A total failure comes back as an empty array for the slot — persistPools
      // already leaves that slot's DB rows untouched in that case, so mirror
      // that here: don't overwrite the on-screen pool or clear the manual pick
      // with nothing. Only apply/clear when generation actually produced
      // options for this slot.
      if ((result.accepted[slot]?.length ?? 0) === 0) {
        // Don't claim options were "kept" when this slot never had any —
        // that reads as a lie the first time generation fails on a fresh
        // plan, when the pool was already empty going in. generatorReached
        // distinguishes "the call worked, nothing fit" (deterministic — name
        // what'd help) from "the call itself failed" (transient — try again
        // is the honest advice there).
        setMealRegenerateError(
          result.generatorReached
            ? (hadExistingOptions
                ? `Couldn't fit a new ${MEAL_SLOT_LABEL[slot]} option — kept your existing one. Try loosening a restriction or widening your calorie range.`
                : `${MEAL_SLOT_LABEL[slot]} doesn't fit your current targets. Try loosening a restriction, widening your calorie range, or turning off this slot.`)
            : (hadExistingOptions
                ? `Couldn't refresh ${MEAL_SLOT_LABEL[slot]} — kept your existing options.`
                : `Couldn't generate ${MEAL_SLOT_LABEL[slot]} — try again in a moment.`)
        )
        return
      }
      setMealPools(prev => ({ ...prev, ...result.accepted }))
      setManualMealPicks(prev => { const next = { ...prev }; delete next[slot]; return next })
      const todayDate = getSessionDateContext(profile.id).date
      await clearMealPick(profile.id, todayDate, slot)
    } catch {
      setMealRegenerateError(
        hadExistingOptions
          ? `Couldn't refresh ${MEAL_SLOT_LABEL[slot]} — kept your existing options.`
          : `Couldn't generate ${MEAL_SLOT_LABEL[slot]} — try again in a moment.`
      )
    } finally {
      setIsGeneratingMeals(false)
    }
  }

  const handleRegenerateAllMeals = async () => {
    if (!profile?.id || !macros) return
    setIsGeneratingMeals(true)
    setMealRegenerateError(null)
    const priorPools = mealPools
    try {
      const result = await generateMealPools({
        profileId: profile.id,
        targets: macros,
        dietaryPreferences: profile.dietary_preferences,
        mealsPerDay: profile.meals_per_day,
        includeSnacks: profile.include_snacks,
        cookingTimePreference: profile.cooking_time_preference,
        favoriteCuisines: profile.favorite_cuisines,
        dislikedFoods: effectiveDislikedFoods,
        timingRules: compiledTimingRules,
        breakfastStyle: profile.breakfast_style,
      })
      // Surfacing round — checked first and short-circuits, same reasoning
      // as the single-slot handler above: an unrecognised restriction fails
      // every slot identically, so there's nothing the failure-count logic
      // below needs to run for.
      if (result.unrecognisedPreferences.length > 0) {
        setUnrecognisedDietaryRestrictions(result.unrecognisedPreferences)
        return
      }
      setUnrecognisedDietaryRestrictions(null)

      const requestedSlots = Object.keys(result.accepted) as MealSlotName[]
      const failedSlots = requestedSlots.filter(s => (result.accepted[s]?.length ?? 0) === 0)

      if (failedSlots.length === requestedSlots.length && requestedSlots.length > 0) {
        // Total failure — every requested slot came back empty. Leave the
        // existing plan and manual picks untouched entirely (persistPools
        // already left the DB untouched too) rather than replacing a real
        // plan with the cold-start empty state. generatorReached splits
        // "the call worked, nothing fit your targets" (deterministic — name
        // what'd help) from "the call itself failed" (transient — retrying
        // is genuinely the right advice there).
        setMealRegenerateError(
          result.generatorReached
            ? "Nothing fits your current targets right now. Try loosening a dietary restriction, widening your calorie range, or turning off a meal slot — then regenerate."
            : "Couldn't reach the meal generator — your existing plan is unchanged. Try again in a moment."
        )
        return
      }

      // Partial failure: keep the prior pool for any slot that came back
      // empty instead of blanking it, matching persistPools' own per-slot
      // skip-on-empty behavior at the DB layer.
      setMealPools(prev => {
        const next = { ...prev }
        for (const [s, options] of Object.entries(result.accepted) as [MealSlotName, PoolOption[]][]) {
          if (options.length > 0) next[s] = options
        }
        return next
      })
      setManualMealPicks({})
      const todayDate = getSessionDateContext(profile.id).date
      await clearAllMealPicksForDate(profile.id, todayDate)

      if (failedSlots.length > 0) {
        // Split by whether each failed slot actually had prior options to
        // "keep" — a fresh plan whose lunch pool has always been empty gets
        // an honest "couldn't generate" message, not a false "kept" claim.
        // Reaching this branch at all means at least one other slot DID
        // fill, which is positive proof the generator was reached this run
        // — so a failed slot here is provably the "nothing fit" case, not
        // "the call failed" (that's the total-failure branch above).
        const keptSlots = failedSlots.filter(s => (priorPools[s]?.length ?? 0) > 0)
        const neverFilledSlots = failedSlots.filter(s => (priorPools[s]?.length ?? 0) === 0)
        const parts: string[] = []
        if (keptSlots.length > 0) parts.push(`Couldn't fit new options for ${keptSlots.map(s => MEAL_SLOT_LABEL[s]).join(', ')} — kept what you had.`)
        if (neverFilledSlots.length > 0) parts.push(`${neverFilledSlots.map(s => MEAL_SLOT_LABEL[s]).join(', ')} don't fit your current targets. Try loosening a restriction, widening your calorie range, or turning off a slot.`)
        setMealRegenerateError(parts.join(' '))
      }
    } catch {
      setMealRegenerateError("Couldn't reach the meal generator — your existing plan is unchanged. Try again in a moment.")
    } finally {
      setIsGeneratingMeals(false)
    }
  }

  // Vision Step 6 — the one message in adaptationMessages that's an action
  // rather than a fact, so it needs real handlers instead of a plain
  // dismiss. Confirm patches the mesocycle (same forceStartingWeightKg
  // mechanism the load-hold already uses, just going up); decline is
  // permanent per exercise, enforced by checkForLoadSuggestions' own
  // declined-row check next time this runs, not by anything client-side.
  const handleLoadSuggestionConfirm = async (id: string) => {
    if (!profile?.id) return
    setLoadSuggestionBusy(id)
    try {
      const patched = await confirmLoadSuggestion(id, mesocycle, profile, profile.id)
      if (patched) {
        setMesocycle(prev => {
          const byWeek = new Map(prev.map(w => [w.week_number, w]))
          for (const w of patched) byWeek.set(w.week_number, w)
          return [...byWeek.values()].sort((a, b) => a.week_number - b.week_number)
        })
      }
      setAdaptationMessages(prev => prev.filter(m => m.loadSuggestionId !== id))
    } finally {
      setLoadSuggestionBusy(null)
    }
  }

  const handleLoadSuggestionDecline = async (id: string) => {
    setLoadSuggestionBusy(id)
    try {
      await declineLoadSuggestion(id)
      setAdaptationMessages(prev => prev.filter(m => m.loadSuggestionId !== id))
    } finally {
      setLoadSuggestionBusy(null)
    }
  }

  // The weight-basis offer's own pair. Same shape as the load-suggestion
  // handlers above and deliberately not merged with them: that one patches a
  // single exercise across one block via forceStartingWeightKg, this one
  // regenerates whole weeks. Sharing a handler would mean sharing a branch on
  // which kind of row it is, which is how the two would eventually drift.
  const handleWeightBasisConfirm = async (id: string) => {
    if (!profile?.id) return
    setLoadSuggestionBusy(id)
    try {
      const rebuilt = await confirmWeightBasisOffer({
        offerId: id,
        profileId: profile.id,
        profile,
        mesocycle,
        exclusions: compiledExerciseExclusions,
        planCreatedAt: mesocycleCreatedAt ?? profile.created_at ?? new Date().toISOString(),
        mesocycleCreatedAt: mesocycleCreatedAt ?? profile.created_at,
        now: getAppNow(profile.id),
      })
      if (!rebuilt) {
        // confirmWeightBasisOffer returns null when it did NOT rebuild — the
        // row was already answered elsewhere, or there were no future weeks
        // left to touch. An earlier cut posted the success receipt anyway,
        // which is the app claiming a write that never happened; a browser
        // run caught it. Leave the offer standing so the choice is still
        // theirs to make.
        setAdaptationMessages(prev => [
          ...prev,
          { text: "That offer had already been answered, so nothing changed. Your plan is as it was." },
        ])
        return
      }
      setMesocycle(rebuilt)
      setAdaptationMessages(prev => [
        ...prev.filter(m => m.weightBasisOfferId !== id),
        // A receipt, not a celebration — the same plain statement of what
        // changed that every other write in this app produces.
        { text: 'Done — the rest of your plan now uses your real weight. Log a set and it keeps tuning from there.' },
      ])
    } catch (err) {
      console.error('Weight-basis rebuild failed:', err)
      setAdaptationMessages(prev => [
        ...prev.filter(m => m.weightBasisOfferId !== id),
        { text: "Couldn't rebuild your plan just then — nothing was changed. Try again in a moment." },
      ])
    } finally {
      setLoadSuggestionBusy(null)
    }
  }

  const handleWeightBasisDecline = async (id: string) => {
    setLoadSuggestionBusy(id)
    try {
      await declineWeightBasisOffer(id)
      setAdaptationMessages(prev => prev.filter(m => m.weightBasisOfferId !== id))
    } finally {
      setLoadSuggestionBusy(null)
    }
  }

  const handleBanExercise = async (exerciseName: string) => {
    if (!profile?.id) return
    // Fix — food/exercise preferences have two competing stores: this used
    // to read-modify-write `fitness_profiles.exercise_exclusions` (with a
    // fresh-read-before-append dance specifically to avoid clobbering a
    // concurrent chat-side write to the SAME column, per fix 4's original
    // comment). Writing a user_facts row instead makes that whole race
    // structurally impossible — each ban is an independent INSERT, not a
    // read-modify-write of a shared array cell, so there's nothing left to
    // clobber and nothing to read fresh before appending to.
    if (compiledExerciseExclusions.includes(exerciseName)) return
    await createFact({
      profileId: profile.id,
      kind: 'exercise_preference',
      source: 'manual',
      rawPhrase: exerciseName,
      displayText: `won't eat/do ${exerciseName}`,
      polarity: 'dislike',
      hardness: 'hard',
      resolvedRefs: [exerciseName],
    })
    await reloadMemory(profile.id)
    const updated = [...new Set([...compiledExerciseExclusions, exerciseName])]

    // Single source of truth is the mesocycle — exercisePlan (the flat,
    // non-periodized base plan) is display-only fallback for when no
    // mesocycle exists yet and is never mutated by swap/ban directly.
    if (mesocycle.length === 0) return
    const updatedMesocycle = await banExerciseFromMesocycle({
      mesocycle,
      profile,
      bannedName: exerciseName,
      exclusions: updated,
    })
    setMesocycle(updatedMesocycle)
    if (profile.id) {
      try {
        // Preserve the plan's original creation time — this is an EDIT of the
        // live plan, not a new plan; without it the resave would rewind
        // live-week detection to week 1.
        await saveMesocycle(profile.id, updatedMesocycle, mesocycleCreatedAt ?? profile.created_at)
      } catch (err) {
        console.error('Persisting ban failed:', err)
      }
    }
  }

  const handleSwapExercise = async (
    weekNumber: number,
    dayName: string,
    exIndex: number,
    newExercise: ExerciseEntry,
    scope: SwapScope
  ) => {
    if (!profile || mesocycle.length === 0) return

    const updatedMesocycle = await swapExerciseInMesocycle({
      mesocycle,
      profile,
      currentWeekNumber: weekNumber,
      dayName,
      exIndex,
      newExercise,
      scope,
    })
    setMesocycle(updatedMesocycle)

    if (!profile.id) return
    try {
      if (scope === 'today') {
        const week = updatedMesocycle.find(w => w.week_number === weekNumber)
        if (week) await saveMesocycleWeek(profile.id, week)
      } else {
        // 'permanent' touches every remaining week of the current block —
        // still a handful of rows, cheap enough to upsert individually
        // rather than resaving the whole mesocycle.
        const touchedBlock = updatedMesocycle.find(w => w.week_number === weekNumber)?.block_number
        const touchedWeeks = updatedMesocycle.filter(
          w => w.block_number === touchedBlock && w.week_number >= weekNumber
        )
        await Promise.all(touchedWeeks.map(w => saveMesocycleWeek(profile.id!, w)))
      }
      // VISION-ARCHITECTURE.md §2.3 — "after any tap mutation, sweep pending
      // proposals on the same target and mark them stale immediately, so
      // the user never taps Confirm on a card invalidated by their own tap
      // a second earlier." Same scope_key prefix the chat swap proposal
      // uses (buildExerciseSwapProposal, ChatAssistant.tsx).
      await sweepStaleForTarget(profile.id, `${profile.id}:propose_exercise_swap:${dayName}:${exIndex}`)
    } catch (err) {
      console.error('Persisting swap failed:', err)
    }
  }

  const handleReset = async () => {
    setNewPlanResetting(true)
    try {
      // "New Plan" abandons the current profile — after this, its pending
      // local-first writes (logged sets/water/grocery/cardio) can never be
      // reached from the UI again to retry a failed sync. Give them one
      // last best-effort chance to land in the DB against the OLD profile
      // before it becomes unreachable, rather than leaving them stranded
      // in localStorage forever. Each queued item carries its own userId,
      // so this is safe to call regardless of which profile is "current."
      // Best-effort: a slow/offline flush must never block starting the
      // new plan (flushPending() itself already no-ops while offline).
      await Promise.race([
        Promise.allSettled([flushSetLogPending(), flushWaterPending(), flushGroceryPending(), flushCardioPending()]),
        new Promise(resolve => setTimeout(resolve, 4000)),
      ])
    } finally {
      // THE ONBOARDING DRAFT IS PART OF THE RESET. Reported live: "New Plan"
      // dropped straight onto the review card with every previous answer
      // filled in and Generate armed, instead of starting a fresh
      // conversation. The draft is a single GLOBAL key
      // (fitplan_onboarding_draft), not a per-profile one, so wiping the
      // profile left it behind for the next run to restore — every slot
      // confirmed, so readyToGenerate was true on mount and the review card
      // opened immediately.
      //
      // Completion already clears it (see handleOnboardingComplete); reset was
      // the one path that did not. An audit of every global localStorage key
      // in src/ says this was the only one missing: the appearance keys and
      // the offline set-log queues survive a reset deliberately (a theme is
      // not plan data, and queued sets carry their own profile id so they can
      // still sync). `test:reset-clears-draft` holds the whole list.
      clearOnboardingDraft()
      // Found by that same audit: the tab the OLD profile was last on would
      // otherwise greet the new one after onboarding.
      localStorage.removeItem(LAST_TAB_KEY)
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem('active_session_cache')
      localStorage.removeItem('offline_log_queue')
      localStorage.removeItem('exercise_plan_cache')
      localStorage.removeItem('user_profile_cache')
      localStorage.removeItem('mesocycle_cache')
      setProfile(null)
      setMacros(null)
      // Per-profile derived state — leaving this set leaked the previous
      // profile's last weigh-in into the NEXT profile's target derivation.
      setLatestWeightKg(null)
      setExercisePlan([])
      setMesocycle([])
      setMealPools({})
      setManualMealPicks({})
      setExerciseExclusions([])
      setLogsVersion(0)
      setNewPlanResetting(false)
      setNewPlanConfirmOpen(false)
    }
  }

  const handleMacroModeChange = async (mode: import('@/lib/types').MacroCalculationMode) => {
    if (!profile) return
    const updated = { ...profile, macro_calculation_mode: mode }
    setProfile(updated)
    // Living targets: mode is one of computeTargets' inputs, so the shared
    // macros state must recompute the moment it changes — the chat and the
    // Nutrition tab both read this state and must always agree. Reuses the
    // CURRENT targetWeightAnchorKg rather than recomputing a fresh average —
    // nothing about weight changed here, only the calculation method, so
    // there's nothing to re-anchor and no "your target changed" notice to
    // show (the user just deliberately changed it themselves).
    const targets = computeTargets(updated, { latestWeightKg: targetWeightAnchorKg, exercisePlan })
    setMacros(targets)
    if (profile.id) {
      snapshotTargetsIfChanged(profile.id, updated, targets, targetWeightAnchorKg)
      await supabase
        .from('fitness_profiles')
        .update({ macro_calculation_mode: mode })
        .eq('id', profile.id)
    }
  }

  /** Macro-accuracy round, Part 2 — same optimistic-apply + revert-on-failure shape as ProfileScreen's savePatch, plus the living-targets recompute handleMacroModeChange already does (the split is one of computeTargets' inputs too). */
  const handleMacroSplitChange = (patch: Partial<UserProfile>) => {
    if (!profile?.id) return
    const revertPatch = Object.fromEntries(
      Object.keys(patch).map(k => [k, profile[k as keyof UserProfile]])
    ) as Partial<UserProfile>
    const updated = { ...profile, ...patch }
    setProfile(updated)
    // Same reasoning as handleMacroModeChange above — reuse the current
    // anchor, no weight moved, no notice.
    const targets = computeTargets(updated, { latestWeightKg: targetWeightAnchorKg, exercisePlan })
    setMacros(targets)
    snapshotTargetsIfChanged(profile.id, updated, targets, targetWeightAnchorKg)
    supabase.from('fitness_profiles').update(patch).eq('id', profile.id).then(({ error }) => {
      if (error) {
        console.error('Macro split save failed — reverting', error)
        setProfile(prev => (prev ? { ...prev, ...revertPatch } : prev))
        const revertedTargets = computeTargets({ ...updated, ...revertPatch }, { latestWeightKg: targetWeightAnchorKg, exercisePlan })
        setMacros(revertedTargets)
      }
    })
  }

  /** Re-derives targets after a new weigh-in lands (Part 5's capture calls this). */
  const handleWeightLogged = async () => {
    if (!profile?.id) return
    const weight = await getLatestWeightKg(profile.id).catch(() => null)
    setLatestWeightKg(weight)
    // A fresh weigh-in is exactly the case the anchor threshold exists for —
    // recompute it (it may or may not actually move, see
    // getEffectiveTargetWeightKg's doc comment) rather than assuming this
    // new reading itself is the new anchor.
    const effectiveTargetWeight = await getEffectiveTargetWeightKg(profile.id, weight ?? profile.weight_kg)
    setTargetWeightAnchorKg(effectiveTargetWeight.weightKg ?? null)
    const targets = computeTargets(profile, { latestWeightKg: effectiveTargetWeight.weightKg, exercisePlan })
    setMacros(targets)
    snapshotTargetsIfChanged(profile.id, profile, targets, effectiveTargetWeight.weightKg).then(result => {
      if (result.changedFromPrior) {
        setAdaptationMessages(prev => [...prev, { text: `Your calorie target updated to ${targets!.calories} kcal, based on your recent weigh-ins.` }])
      }
    })

    // The training half of the same event. Food targets follow a weigh-in on
    // their own (above); prescribed loads never did — generateMesocycle runs
    // once, at onboarding, so someone who declined their weight stays on a
    // deliberately-light plan forever. Ashley's ruling was to ask rather than
    // rebuild silently, so this only ever surfaces an offer.
    if (mesocycle.length > 0 && planHasAssumedBodyLoads(mesocycle)) {
      checkForWeightBasisOffer({
        profileId: profile.id,
        profile,
        mesocycle,
        basisWeightKg: effectiveTargetWeight.weightKg,
        exclusions: compiledExerciseExclusions,
        planCreatedAt: mesocycleCreatedAt ?? profile.created_at ?? new Date().toISOString(),
        now: getAppNow(profile.id),
      })
        .then(offer => {
          // Never stacks: checkForWeightBasisOffer returns the SAME row while
          // one is outstanding, so a second weigh-in re-surfaces the existing
          // offer rather than adding a second banner.
          if (offer) {
            setAdaptationMessages(prev =>
              prev.some(m => m.weightBasisOfferId === offer.id)
                ? prev
                : [...prev, { text: offer.text, weightBasisOfferId: offer.id }])
          }
        })
        .catch(console.error)
    }

    // Goal-proximity nudge — same ask-first check as the initial load path.
    const goals = await getActiveGoals(profile.id).catch(() => [])
    const weightGoal = goals.find(g => g.metric === 'body_weight_kg')
    if (weightGoal) {
      const info = effectiveTargetWeight.weightKg == null ? null : describeGoalProximity(effectiveTargetWeight.weightKg, weightGoal)
      if (info && !isGoalProximityDismissed(info.goalId)) {
        setAdaptationMessages(prev => prev.some(m => m.goalId === info.goalId) ? prev : [...prev, { text: info.message, goalId: info.goalId }])
      }
    }
  }

  if (isRestoring) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading your plan...</span>
        </div>
      </div>
    )
  }

  // Dev-test route: accessible even before profile is loaded
  if (hash === '#/dev-test') {
    const canAccess = !profile || isDevAccount(profile)
    if (canAccess) {
      return (
        <DevTestPage
          profile={profile}
          exercisePlan={exercisePlan}
          mealPlan={mealPlan}
          onBack={() => { window.location.hash = '' }}
        />
      )
    }
  }

  // NOT `|| !macros` — that was the refusal trap's other half. macros is
  // null (not undefined-while-loading; isRestoring already returned above)
  // whenever computeTargets found a missing body metric, which is a
  // deliberate, valid state for an otherwise-complete profile. Gating whole-
  // app entry on it meant declining a weight bounced a fully onboarded user
  // straight back into onboarding, forever — the exact trap the absence
  // work exists to remove. Every consumer below already accepts
  // MacroTargets | null (macros has always been typed that way), so no
  // downstream change was needed once this line stopped requiring it.
  if (!profile) {
    if (isGenerating) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center px-4">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="font-medium">{generatingStatus || 'Building your plan...'}</p>
            <p className="text-sm text-muted-foreground">This may take a moment while we optimize your portions</p>
          </div>
        </div>
      )
    }

    // If setup failed we land here with no profile. Showing the reason and a
    // way to retry is the difference between a recoverable hiccup and a dead
    // end the user cannot get past.
    if (setupError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full space-y-4 text-center">
            <h2 className="text-lg font-semibold">We couldn't finish setting up your plan</h2>
            <p className="text-sm text-muted-foreground break-words">{setupError}</p>
            <Button className="w-full" onClick={() => setSetupError(null)}>
              Try again
            </Button>
          </div>
        </div>
      )
    }
    // One way in: the conversation. The step-by-step questionnaire and the
    // chooser that offered it were removed — see ConversationalOnboarding's
    // header note for what that means when the coach is unreachable.
    return <ConversationalOnboarding onComplete={handleOnboardingComplete} />
  }

  const totalWeeks = mesocycle.length > 0 ? mesocycle.length : 4
  const handleTabChange = (tab: string) => {
    if (isTab(tab)) window.location.hash = tabHash(tab)
  }

  return (
    <ActiveSessionProvider
      profileId={profile.id}
      planCreatedAt={mesocycleCreatedAt ?? profile.created_at}
      totalWeeks={totalWeeks}
      devOverrideWeek={devOverrideWeek}
      devOverrideDay={devOverrideDay}
      refreshToken={logsVersion}
    >
    <TimersProvider profileId={profile.id}>
    {/* Lets the chat composer sit above the rest-timer dock instead of
        underneath it — the dock measures itself into here. */}
    <BottomDockHeightProvider>
    <div className="min-h-screen bg-background">
      {/* The plan exists in memory but not in the database. Says so once, in
          plain terms, and stays dismissible — the user can carry on, but
          they are never left believing it was saved. */}
      {unsavedProfileWarning && (
        <div
          role="alert"
          className="fixed inset-x-0 z-50 px-3"
          style={{ top: 'calc(0.625rem + env(safe-area-inset-top))' }}
        >
          <div className="mx-auto max-w-md rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 backdrop-blur">
            <p className="text-xs text-foreground break-words">{unsavedProfileWarning}</p>
            <button
              className="mt-1 text-[11px] font-medium underline text-muted-foreground min-h-[32px]"
              onClick={() => setUnsavedProfileWarning(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {/* The old full-width header duplicated what the bottom tab bar
          already communicates (which screen you're on). These two floating
          icons replace it — no shared bar, no vertical strip, each reachable
          in one tap. Positioned above <main> so they never depend on which
          tab is mounted. */}
      <div
        data-tour="settings"
        className="fixed right-3 z-40"
        style={{
          top: 'calc(0.625rem + env(safe-area-inset-top))',
          // THE GEAR SITS ON THE FIELD NOW. Handoff v2 §1 makes the field
          // full-bleed to the top of the tab, and this control is fixed app
          // chrome rendered once for every tab — so on the three tabs that own
          // a daily fact it lands on a light accent band, where its normal
          // light-on-dark colour is unreadable. Field ink is the same value
          // every other mark on that band already uses.
          color: TABS_WITH_FIELD.has(activeTab) ? 'var(--field-ink)' : undefined,
        }}
      >
        <ProfileMenu
          onOpenProfile={() => { setProfileInfoSection(undefined); setProfileInfoOpen(true) }}
          onReplayTour={replayAppTour}
          onNewPlan={() => {
            setActiveAdaptationsForReset([])
            if (profile?.id) getActiveAdaptations(profile.id).then(setActiveAdaptationsForReset).catch(console.error)
            setNewPlanConfirmOpen(true)
          }}
        />
      </div>
      <div
        className="fixed left-3 right-14 z-40 flex justify-start"
        style={{ top: 'calc(0.625rem + env(safe-area-inset-top))' }}
      >
        <OfflineStatusIndicator />
      </div>

      {/* THE FIELD MEETS THE TOP — but only when there is nothing above it.
          A field tab drops the page's top padding so the band starts at the
          top of the scroll area (handoff v2 §1: "it meets the status bar").
          When an adaptation banner is showing, the padding stays: the banner
          is the first thing and the field follows it. Deciding this HERE
          rather than with a blind negative margin on the field is what stops
          the band being dragged over that banner. */}
      {/* Top padding is a STYLE, not a class, and <main className> stays one
          static string on one line — test:composer-focus copies that string
          into its browser harness verbatim, and a copy that drifts is worse
          than no copy. The bottom padding that gate actually measures against
          is untouched. */}
      <main className="max-w-6xl mx-auto px-4 pb-28 space-y-6" style={{ paddingTop: TABS_WITH_FIELD.has(activeTab) && adaptationMessages.length === 0 ? 0 : 48 }}>
        {adaptationMessages.length > 0 && (
          <div className="space-y-2">
            {adaptationMessages.map((msg, i) => (
              <InsightBanner key={i} tone="ai" className="items-start justify-between">
                <span>{msg.text}</span>
                {msg.loadSuggestionId ? (
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleLoadSuggestionConfirm(msg.loadSuggestionId!)}
                      disabled={loadSuggestionBusy === msg.loadSuggestionId}
                      className="text-xs font-semibold underline opacity-90 hover:opacity-100 disabled:opacity-50"
                    >
                      {loadSuggestionBusy === msg.loadSuggestionId ? 'Applying…' : 'Start heavier'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleLoadSuggestionDecline(msg.loadSuggestionId!)}
                      disabled={loadSuggestionBusy === msg.loadSuggestionId}
                      className="text-xs underline opacity-70 hover:opacity-100 disabled:opacity-50"
                    >
                      Keep as is
                    </button>
                  </div>
                ) : msg.weightBasisOfferId ? (
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleWeightBasisConfirm(msg.weightBasisOfferId!)}
                      disabled={loadSuggestionBusy === msg.weightBasisOfferId}
                      className="text-xs font-semibold underline opacity-90 hover:opacity-100 disabled:opacity-50"
                    >
                      {loadSuggestionBusy === msg.weightBasisOfferId ? 'Rebuilding…' : 'Yes, redo them'}
                    </button>
                    {/* "No thanks" and not "Dismiss": this records a permanent
                        answer, and the label has to say so. A dismiss-shaped
                        control on a decision that never comes back would be
                        the app deciding something on their behalf while
                        looking like it hadn't. */}
                    <button
                      type="button"
                      onClick={() => void handleWeightBasisDecline(msg.weightBasisOfferId!)}
                      disabled={loadSuggestionBusy === msg.weightBasisOfferId}
                      className="text-xs underline opacity-70 hover:opacity-100 disabled:opacity-50"
                    >
                      No thanks
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (msg.goalId) dismissGoalProximity(msg.goalId)
                      setAdaptationMessages(prev => prev.filter((_, idx) => idx !== i))
                    }}
                    className="shrink-0 text-xs underline opacity-70 hover:opacity-100"
                    aria-label="Dismiss"
                  >
                    Dismiss
                  </button>
                )}
              </InsightBanner>
            ))}
          </div>
        )}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsContent value="dashboard">
            <Dashboard
              profile={profile}
              macros={macros}
              exercisePlan={exercisePlan}
              mesocycle={mesocycle}
              planCreatedAt={mesocycleCreatedAt ?? profile.created_at}
              onWeightLogged={handleWeightLogged}
            />
          </TabsContent>

          <TabsContent value="nutrition" className="space-y-6">
            <NutritionDisplay
              profile={profile}
              macros={macros}
              exercisePlan={exercisePlan}
              latestWeightKg={latestWeightKg}
              onMacroModeChange={handleMacroModeChange}
              onMacroSplitChange={handleMacroSplitChange}
              profileId={profile.id}
              date={getSessionDateContext(profile.id).date}
              pools={mealPools}
              chosen={chosenMeals}
              mealTotals={mealTotals}
              isGeneratingMeals={isGeneratingMeals}
              mealRegenerateError={mealRegenerateError}
              onDismissRegenerateError={() => setMealRegenerateError(null)}
              unrecognisedDietaryRestrictions={unrecognisedDietaryRestrictions}
              onFixDietaryRestrictions={() => { setProfileInfoSection('dietary'); setProfileInfoOpen(true) }}
              onSwapMealSlot={handleSwapMealSlot}
              onRegenerateMealSlot={handleRegenerateMealSlot}
              onRegenerateAllMeals={handleRegenerateAllMeals}
            />
          </TabsContent>

          <TabsContent value="exercise">
            <ExerciseTab
              plan={exercisePlan}
              mesocycle={mesocycle}
              exclusions={effectiveExclusions}
              softExercisePreferences={compiledSoftExercisePreferences}
              profile={profile ?? undefined}
              profileId={profile?.id}
              planCreatedAt={mesocycleCreatedAt ?? profile?.created_at}
              devOverrideWeek={devOverrideWeek}
              devOverrideDay={devOverrideDay}
              devBypassLocks={devBypassLocks}
              onSwapExercise={handleSwapExercise}
              onBanExercise={handleBanExercise}
              onDevOverrideWeekChange={setDevOverrideWeek}
              onDevOverrideDayChange={setDevOverrideDay}
              onDevBypassLocksChange={setDevBypassLocks}
              onLogsSeeded={() => setLogsVersion(v => v + 1)}
            />
          </TabsContent>

          <TabsContent value="tools">
            <ToolsTab profileId={profile.id} mealPools={mealPools} targets={macros} softLikedFoods={compiledSoftFoodPreferences} />
          </TabsContent>

          <TabsContent value="chat" forceMount className="data-[state=inactive]:hidden">
            <ChatAssistant
              profile={profile}
              macros={macros}
              exercisePlan={exercisePlan}
              mesocycle={mesocycle}
              planCreatedAt={mesocycleCreatedAt ?? profile?.created_at}
              mealPlan={mealPlan}
              exerciseExclusions={effectiveExclusions}
              latestWeightKg={latestWeightKg}
              onPlanUpdate={handlePlanUpdate}
              onLogsUpdated={() => setLogsVersion(v => v + 1)}
              onWeightLogged={handleWeightLogged}
              onMesocycleUpdated={setMesocycle}
              onProfileChanged={patch => setProfile(prev => prev ? { ...prev, ...patch } : prev)}
              onMealSwapApplied={async (slot, chosenName) => {
                // Persist chat-confirmed swaps (and their undo, which calls
                // this with the restored previous name) BEFORE updating the
                // on-screen pick — awaited and checked by the caller, which
                // downgrades the receipt to "Couldn't apply" on failure
                // instead of claiming a swap that didn't actually land.
                if (!profile?.id) return true
                // An empty name means "no pick" — undoing a meal ADDITION,
                // where the slot goes back to whatever assembleDay chose
                // rather than to a named previous option. undoMealAddition
                // has already cleared the stored pick, so this only has to
                // drop the on-screen override; writing '' as a meal_name
                // here would persist a pick for a meal that doesn't exist.
                if (!chosenName) {
                  setManualMealPicks(prev => { const next = { ...prev }; delete next[slot]; return next })
                  return true
                }
                const todayDate = getSessionDateContext(profile.id).date
                try {
                  await setMealPick(profile.id, todayDate, slot, chosenName)
                } catch (err) {
                  console.error('onMealSwapApplied: setMealPick failed', err)
                  return false
                }
                setManualMealPicks(prev => ({ ...prev, [slot]: chosenName }))
                return true
              }}
              onFindMoreMealOptions={async slot => {
                // Ashley's ruling on running out of swaps: OFFER to find new
                // ones, never do it unasked. This only runs on a confirmed
                // card, and appendToExisting is what keeps the meals they
                // already have — a plain regenerate would delete the pool and
                // hand them five different meals instead of five more.
                if (!profile?.id || !macros) return { added: [], error: "I need your body details before I can fit new meals to your targets." }
                try {
                  const result = await generateMealPools({
                    profileId: profile.id,
                    targets: macros,
                    dietaryPreferences: profile.dietary_preferences,
                    mealsPerDay: profile.meals_per_day,
                    includeSnacks: profile.include_snacks,
                    cookingTimePreference: profile.cooking_time_preference,
                    favoriteCuisines: profile.favorite_cuisines,
                    dislikedFoods: effectiveDislikedFoods,
                    timingRules: compiledTimingRules,
                    breakfastStyle: profile.breakfast_style,
                    onlySlots: [slot],
                    appendToExisting: true,
                  })
                  if (result.unrecognisedPreferences.length > 0) {
                    setUnrecognisedDietaryRestrictions(result.unrecognisedPreferences)
                    return { added: [], error: `I can't check meals against "${result.unrecognisedPreferences.join('", "')}" — that needs fixing in Profile first.` }
                  }
                  const added = result.accepted[slot] ?? []
                  if (added.length === 0) {
                    // Same distinction handleRegenerateMealSlot draws: the
                    // generator running and finding nothing that fits is
                    // deterministic advice, not "try again".
                    return { added: [], error: result.generatorReached
                      ? `I couldn't find any new ${slot} options that fit your targets — loosening a restriction or widening your calorie range would give me more to work with.`
                      : `I couldn't reach the meal generator just then — try me again in a moment.` }
                  }
                  // Refresh the on-screen pool so the Meals tab shows them
                  // immediately; the DB write already happened inside
                  // generateMealPools.
                  const pools = await getPools(profile.id)
                  setMealPools(pools)
                  return { added: added.map(o => o.name) }
                } catch {
                  return { added: [], error: `I couldn't reach the meal generator just then — try me again in a moment.` }
                }
              }}
              memoryFacts={memoryFacts}
              memoryGoals={memoryGoals}
              memoryContextFacts={memoryContextFacts}
              onMemoryChanged={() => { if (profile?.id) return reloadMemory(profile.id) }}
              onOpenProfile={section => { setProfileInfoSection(section); setProfileInfoOpen(true) }}
              groceryItems={groceryItems}
              onGroceryChanged={() => { if (profile?.id) return reloadGrocery(profile.id) }}
              onOpenGrocery={() => { window.location.hash = tabHash('tools') }}
              onOpenDashboard={() => { window.location.hash = tabHash('dashboard') }}
              revealSpeed={revealSpeed}
              pendingLoadSuggestions={adaptationMessages.filter(m => m.loadSuggestionId).map(m => m.text)}
            />
          </TabsContent>
        </Tabs>
      </main>
      <BottomDock />
      <BottomTabBar activeTab={activeTab} onTabChange={handleTabChange} />
      {/* Sibling of <main>, like BottomDock, so it overlays every tab AND the
          tab bar — the tour's nav stops spotlight the real tab buttons, which
          it could not reach from inside a tab's own subtree. */}
      <AppTour profileId={profile.id} armed={tourArmed} />
      <ProfileScreen
        open={profileInfoOpen}
        onOpenChange={setProfileInfoOpen}
        profile={profile}
        latestWeightKg={latestWeightKg}
        onProfileChanged={patch => setProfile(prev => prev ? { ...prev, ...patch } : prev)}
        onMemoryChanged={() => { if (profile.id) return reloadMemory(profile.id) }}
        initialSection={profileInfoSection}
        revealSpeed={revealSpeed}
        onRevealSpeedChange={handleRevealSpeedChange}
      />
      <Dialog open={newPlanConfirmOpen} onOpenChange={open => { if (!newPlanResetting) setNewPlanConfirmOpen(open) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Start a new plan?</DialogTitle>
            <DialogDescription>
              This creates a brand-new profile and plan. Your current training plan, logged
              workout history, weigh-ins, PRs, goals, and saved facts will no longer be
              reachable in the app — they aren't deleted, but there's no way back to them
              from here.
            </DialogDescription>
          </DialogHeader>
          {activeAdaptationsForReset.length > 0 && (
            <div className="space-y-1.5 rounded-lg bg-[color:var(--role-warn-bg)] px-3 py-2.5 text-[13px] text-[color:var(--role-warn-text)]">
              {activeAdaptationsForReset.map(a => (
                <p key={a.id}>
                  You have an active {a.kind === 'injury' ? `${a.injury_code?.replace('_', ' ')} adaptation` : 'equipment adaptation'} running
                  until {new Date(a.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — starting a new plan won't carry this over.
                </p>
              ))}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setNewPlanConfirmOpen(false)} disabled={newPlanResetting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleReset()} disabled={newPlanResetting}>
              {newPlanResetting ? 'Starting…' : 'Start new plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </BottomDockHeightProvider>
    </TimersProvider>
    </ActiveSessionProvider>
  )
}

export default App
