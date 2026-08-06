import { useState, useEffect, useRef } from 'react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { ProfileMenu } from '@/components/ProfileMenu'
import { ProfileScreen } from '@/components/ProfileScreen'
import { BottomTabBar } from '@/components/BottomTabBar'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'
import { NutritionDisplay } from '@/components/NutritionDisplay'
import { ExerciseTab } from '@/components/exercise/ExerciseTab'
import { MealPlan } from '@/components/MealPlan'
import { Dashboard } from '@/components/Dashboard'
import { GroceryList } from '@/components/GroceryList'
import { ChatAssistant } from '@/components/ChatAssistant'
import { DevTestPage } from '@/components/DevTestPage'
import { OfflineStatusIndicator } from '@/components/OfflineStatusIndicator'
import { BottomDock } from '@/components/BottomDock'
import { ActiveSessionProvider } from '@/hooks/useActiveSession'
import { TimersProvider } from '@/hooks/useTimers'
import { isDevAccount, getSessionDateContext } from '@/lib/dev-clock'
import { useAppRoute, tabHash, isTab, isKnownTabHash, type Tab } from '@/lib/app-route'

import { calculateCalories } from '@/lib/calculations'
import { computeBMR, computeStaticTDEE } from '@/lib/macro-calculator'
import { computeTargets, getLatestWeightKg, snapshotTargetsIfChanged } from '@/lib/nutrition-targets'
import { generateExercisePlan, generateMesocycle } from '@/lib/exercise-plan'
import { getPools, swapPoolMeal, type MealSlotName } from '@/lib/meal-store'
import { generateMealPools, assembleDay, chosenToMealPlanDays, type PoolOption } from '@/lib/meal-generation'
import { supabase } from '@/lib/supabase'
import { saveMesocycle, saveMesocycleWeek, restoreMesocycle } from '@/lib/mesocycle-persistence'
import { swapExerciseInMesocycle, banExerciseFromMesocycle, type SwapScope } from '@/lib/mesocycle-edit'
import { sweepStaleForTarget } from '@/lib/pending-actions-store'
import { getActiveFacts, getActiveGoals, getActiveContextFacts, createFact, type UserFactRow, type UserGoalRow, type UserContextFactRow } from '@/lib/memory-store'
import { compileExerciseExclusions, compileFoodDislikes, compileTimingRules, resolveFoodTarget } from '@/lib/fact-compiler'
import { getAllItems as getAllGroceryItems, type GroceryItemRow } from '@/lib/grocery-store'
import type { UserProfile, MacroTargets, WorkoutDay, PlanAction, SchedulePatchItem, MesocycleWeek } from '@/lib/types'
import type { ExerciseEntry } from '@/lib/exercise-db'

const STORAGE_KEY = 'fitplan_profile_id'
const LAST_TAB_KEY = 'fitplan_last_tab'

function App() {
  const { hash, route } = useAppRoute()
  // `program`/`train` are sub-routes of the exercise tab (LAYOUT-DESIGN.md
  // §5.3) — only an unrecognised/empty hash falls back to nutrition.
  const activeTab: Tab =
    route.kind === 'tab' ? route.tab : route.kind === 'program' || route.kind === 'train' ? 'exercise' : 'nutrition'
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [macros, setMacros] = useState<MacroTargets | null>(null)
  /** Latest daily_metrics weigh-in — overrides the (immutable) onboarding weight in every target computation. Null until the user first weighs in. */
  const [latestWeightKg, setLatestWeightKg] = useState<number | null>(null)
  const [exercisePlan, setExercisePlan] = useState<WorkoutDay[]>([])
  const [mesocycle, setMesocycle] = useState<MesocycleWeek[]>([])
  /** When the CURRENT mesocycle was generated — anchors live-week detection (falls back to profile.created_at for legacy profiles without persisted weeks). */
  const [mesocycleCreatedAt, setMesocycleCreatedAt] = useState<string | null>(null)
  // Meal pools (M1): every generated option per slot, keyed by slot — the
  // single source of truth for meals. Replaces the old day-of-week
  // WeeklyMealPlan entirely (pool options aren't day-specific; any option is
  // valid for its slot any day, per the M0 architecture decision).
  const [mealPools, setMealPools] = useState<Partial<Record<MealSlotName, PoolOption[]>>>({})
  const [isGeneratingMeals, setIsGeneratingMeals] = useState(false)
  /** Slot -> pool-option name the user explicitly picked this session, overriding assembleDay's automatic choice for that slot until the next regenerate. */
  const [manualMealPicks, setManualMealPicks] = useState<Partial<Record<MealSlotName, string>>>({})
  // assembleDay is pure — deriving today's picks from pools+targets on every
  // render (rather than storing them) means a pool refresh or a target
  // change (a new weigh-in) can never leave a stale assembled day on screen.
  const assembledMeals = macros ? assembleDay(mealPools, macros) : null
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
  const [generatingStatus, setGeneratingStatus] = useState('')
  const [exerciseExclusions, setExerciseExclusions] = useState<string[]>([])
  // Memory & goals (VISION-ARCHITECTURE.md §1) — active facts/goals for the
  // current profile, loaded once alongside it. fact-compiler.ts's pure
  // functions turn these into the exact arguments generateExercisePlan/
  // generateMealPools already accept; nothing here writes plan state.
  const [memoryFacts, setMemoryFacts] = useState<UserFactRow[]>([])
  const [memoryGoals, setMemoryGoals] = useState<UserGoalRow[]>([])
  const [memoryContextFacts, setMemoryContextFacts] = useState<UserContextFactRow[]>([])
  const [profileInfoOpen, setProfileInfoOpen] = useState(false)
  const [profileInfoSection, setProfileInfoSection] = useState<'goals' | 'facts' | 'context' | undefined>(undefined)
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
      age: profileRow.age,
      gender: profileRow.gender,
      height_cm: Number(profileRow.height_cm),
      weight_kg: Number(profileRow.weight_kg),
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
    const restoredWeight = await getLatestWeightKg(restoredProfile.id!).catch(() => null)
    const liveTargets = computeTargets(restoredProfile, {
      latestWeightKg: restoredWeight,
      exercisePlan: restoredExercises,
    })

    setProfile(restoredProfile)
    setLatestWeightKg(restoredWeight)
    setMacros(liveTargets)
    setMealPools(restoredPools)
    setExercisePlan(restoredExercises)
    setMesocycle(restoredMesocycle)
    setIsRestoring(false)
    if (restoredProfile.id) { void reloadMemory(restoredProfile.id); void reloadGrocery(restoredProfile.id) }

    // Version today's targets when they differ from the last snapshot —
    // fire-and-forget; the M3 trend loop reads this history.
    snapshotTargetsIfChanged(restoredProfile.id!, restoredProfile, liveTargets, restoredWeight)
  }

  const handleOnboardingComplete = async (userProfile: UserProfile) => {
    setIsGenerating(true)
    setSetupError(null)
    setGeneratingStatus('Calculating your macro targets...')

    // Everything below runs inside try/finally. Without it, a single failure
    // anywhere in this function skipped setIsGenerating(false) entirely and
    // left the user watching a spinner with no way forward and no error shown.
    try {

    const bmr = computeBMR(userProfile)
    const tdee = computeStaticTDEE(bmr, userProfile.activity_level)
    // No weigh-ins can exist yet at onboarding, so computeTargets here is
    // equivalent to the static calculation — but going through the one
    // shared entry point keeps every consumer on identical numbers.
    const calculatedMacros = computeTargets(userProfile)

    const enrichedProfile: UserProfile = {
      ...userProfile,
      bmr,
      tdee,
      calorie_target: calculatedMacros.calories,
      protein_g: calculatedMacros.protein,
      carbs_g: calculatedMacros.carbs,
      fat_g: calculatedMacros.fat,
    }

    const planResult = generateExercisePlan(enrichedProfile, exerciseExclusions)
    const workout = planResult.plan
    const mesocycleData = generateMesocycle(enrichedProfile, workout)

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
      setSetupError(
        `Your plan was generated but could not be saved: ${insertError.message}. ` +
        `You can keep using it now, but it will not persist if you reload.`
      )
    }

    let generatedPools: Partial<Record<MealSlotName, PoolOption[]>> = {}
    if (data) {
      enrichedProfile.id = data.id
      localStorage.setItem(STORAGE_KEY, data.id)
      // Fix — food/exercise preferences have two competing stores:
      // onboarding's disliked-foods answer is no longer written to the
      // `disliked_foods` column (see the insert above) — it's recorded as
      // user_facts rows instead, the same shape a later "I hate marmite"
      // chat turn would produce, so both paths land in exactly one place.
      // Meal-pool generation just below still reads enrichedProfile.disliked_foods
      // directly (the in-memory onboarding answer) since memoryFacts hasn't
      // been fetched yet at this point in a brand-new signup.
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
      try {
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
      } catch (err) {
        // Meal generation failing must not block the rest of the plan —
        // the Meals tab shows its own empty state with a manual retry.
        console.error('Meal pool generation failed:', err)
      }
    }

    setProfile(enrichedProfile)
    setMacros(calculatedMacros)
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
    setManualMealPicks(prev => ({ ...prev, [slot]: applied.name }))
    // §2.3 — same sweep as the exercise swap path, same scope_key prefix propose_meal_swap uses.
    await sweepStaleForTarget(profile.id, `${profile.id}:propose_meal_swap:${slot}`)
  }

  const handleRegenerateMealSlot = async (slot: MealSlotName) => {
    if (!profile?.id || !macros) return
    setIsGeneratingMeals(true)
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
      setMealPools(prev => ({ ...prev, ...result.accepted }))
      setManualMealPicks(prev => { const next = { ...prev }; delete next[slot]; return next })
    } finally {
      setIsGeneratingMeals(false)
    }
  }

  const handleRegenerateAllMeals = async () => {
    if (!profile?.id || !macros) return
    setIsGeneratingMeals(true)
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
      setMealPools(result.accepted)
      setManualMealPicks({})
    } finally {
      setIsGeneratingMeals(false)
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

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem('active_session_cache')
    localStorage.removeItem('offline_log_queue')
    localStorage.removeItem('exercise_plan_cache')
    localStorage.removeItem('user_profile_cache')
    localStorage.removeItem('mesocycle_cache')
    setProfile(null)
    setMacros(null)
    setExercisePlan([])
    setMesocycle([])
    setMealPools({})
    setManualMealPicks({})
    setExerciseExclusions([])
    setLogsVersion(0)
  }

  const handleMacroModeChange = async (mode: import('@/lib/types').MacroCalculationMode) => {
    if (!profile) return
    const updated = { ...profile, macro_calculation_mode: mode }
    setProfile(updated)
    // Living targets: mode is one of computeTargets' inputs, so the shared
    // macros state must recompute the moment it changes — the chat and the
    // Nutrition tab both read this state and must always agree.
    const targets = computeTargets(updated, { latestWeightKg, exercisePlan })
    setMacros(targets)
    if (profile.id) {
      snapshotTargetsIfChanged(profile.id, updated, targets, latestWeightKg)
      await supabase
        .from('fitness_profiles')
        .update({ macro_calculation_mode: mode })
        .eq('id', profile.id)
    }
  }

  /** Re-derives targets after a new weigh-in lands (Part 5's capture calls this). */
  const handleWeightLogged = async () => {
    if (!profile?.id) return
    const weight = await getLatestWeightKg(profile.id).catch(() => null)
    setLatestWeightKg(weight)
    const targets = computeTargets(profile, { latestWeightKg: weight, exercisePlan })
    setMacros(targets)
    snapshotTargetsIfChanged(profile.id, profile, targets, weight)
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

  if (!profile || !macros) {
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
    return <OnboardingFlow onComplete={handleOnboardingComplete} />
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
    <div className="min-h-screen bg-background">
      {/* The old full-width header duplicated what the bottom tab bar
          already communicates (which screen you're on). These two floating
          icons replace it — no shared bar, no vertical strip, each reachable
          in one tap. Positioned above <main> so they never depend on which
          tab is mounted. */}
      <div
        className="fixed right-3 z-40"
        style={{ top: 'calc(0.625rem + env(safe-area-inset-top))' }}
      >
        <ProfileMenu
          onOpenProfile={() => { setProfileInfoSection(undefined); setProfileInfoOpen(true) }}
          onNewPlan={handleReset}
        />
      </div>
      <div
        className="fixed left-3 right-14 z-40 flex justify-start"
        style={{ top: 'calc(0.625rem + env(safe-area-inset-top))' }}
      >
        <OfflineStatusIndicator />
      </div>

      <main className="max-w-6xl mx-auto px-4 pt-12 pb-28 space-y-6">
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
            />
          </TabsContent>

          <TabsContent value="exercise">
            <ExerciseTab
              plan={exercisePlan}
              mesocycle={mesocycle}
              exclusions={effectiveExclusions}
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

          <TabsContent value="meals">
            <MealPlan
              pools={mealPools}
              chosen={chosenMeals}
              totals={mealTotals}
              targets={macros}
              isGenerating={isGeneratingMeals}
              onSwapSlot={handleSwapMealSlot}
              onRegenerateSlot={handleRegenerateMealSlot}
              onRegenerateAll={handleRegenerateAllMeals}
            />
            <div className="mt-4">
              <GroceryList profileId={profile.id} mealPools={mealPools} targets={macros} />
            </div>
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
              onMealSwapApplied={(slot, chosenName) => setManualMealPicks(prev => ({ ...prev, [slot]: chosenName }))}
              memoryFacts={memoryFacts}
              memoryGoals={memoryGoals}
              memoryContextFacts={memoryContextFacts}
              onMemoryChanged={() => { if (profile?.id) return reloadMemory(profile.id) }}
              onOpenProfile={section => { setProfileInfoSection(section); setProfileInfoOpen(true) }}
              groceryItems={groceryItems}
              onGroceryChanged={() => { if (profile?.id) return reloadGrocery(profile.id) }}
              onOpenGrocery={() => { window.location.hash = tabHash('meals') }}
              onOpenDashboard={() => { window.location.hash = tabHash('dashboard') }}
            />
          </TabsContent>
        </Tabs>
      </main>
      <BottomDock />
      <BottomTabBar activeTab={activeTab} onTabChange={handleTabChange} />
      <ProfileScreen
        open={profileInfoOpen}
        onOpenChange={setProfileInfoOpen}
        profile={profile}
        latestWeightKg={latestWeightKg}
        onProfileChanged={patch => setProfile(prev => prev ? { ...prev, ...patch } : prev)}
        onMemoryChanged={() => { if (profile.id) return reloadMemory(profile.id) }}
        initialSection={profileInfoSection}
      />
    </div>
    </TimersProvider>
    </ActiveSessionProvider>
  )
}

export default App
