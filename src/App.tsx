import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Dumbbell, RotateCcw, Activity, UtensilsCrossed, MessageCircle, PieChart, Loader2 } from 'lucide-react'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'
import { NutritionDisplay } from '@/components/NutritionDisplay'
import { ExercisePlan } from '@/components/ExercisePlan'
import { CardioLogger } from '@/components/CardioLogger'
import { MealPlan } from '@/components/MealPlan'
import { ChatAssistant } from '@/components/ChatAssistant'
import { WeeklyPlannerCard } from '@/components/WeeklyPlannerCard'
import { DevTestPanel } from '@/components/DevTestPanel'
import { DevTestPage } from '@/components/DevTestPage'
import { isDevAccount } from '@/lib/dev-clock'

import { calculateCalories } from '@/lib/calculations'
import { computeBMR, computeStaticTDEE } from '@/lib/macro-calculator'
import { computeTargets, getLatestWeightKg, snapshotTargetsIfChanged } from '@/lib/nutrition-targets'
import { generateExercisePlan, generateMesocycle } from '@/lib/exercise-plan'
import { getPools, swapPoolMeal, type MealSlotName } from '@/lib/meal-store'
import { generateMealPools, assembleDay, chosenToMealPlanDays, type PoolOption } from '@/lib/meal-generation'
import { supabase } from '@/lib/supabase'
import { saveMesocycle, saveMesocycleWeek, restoreMesocycle } from '@/lib/mesocycle-persistence'
import { swapExerciseInMesocycle, banExerciseFromMesocycle, type SwapScope } from '@/lib/mesocycle-edit'
import type { UserProfile, MacroTargets, WorkoutDay, PlanAction, SchedulePatchItem, MesocycleWeek } from '@/lib/types'
import type { ExerciseEntry } from '@/lib/exercise-db'

const STORAGE_KEY = 'fitplan_profile_id'

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return hash
}

function App() {
  const hash = useHashRoute()
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
  const [devOverrideWeek, setDevOverrideWeek] = useState<number | null>(null)
  const [devOverrideDay, setDevOverrideDay] = useState<string | null>(null)
  const [devBypassLocks, setDevBypassLocks] = useState(false)
  const [logsVersion, setLogsVersion] = useState(0)

  useEffect(() => {
    restoreSession()
  }, [])

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
      // Vision-architecture patch round, fix 2: injuries (onboarding's
      // body-part codes: 'lower_back'/'knees'/...) and exercise_exclusions
      // (ban_exercise's exact exercise names) used to share this one
      // column — reading exercise_exclusions back as "injuries" meant a
      // ban silently corrupted the injury list with an exercise name that
      // never matches INJURED_JOINTS, and vice versa at onboarding. Now a
      // dedicated column.
      injuries: profileRow.injuries || [],
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
    // The old replace_food branch is gone (M0 Part 6): it mutated the dead
    // standalone mealPlan state that nothing rendered — the exact disjoint
    // write path the discovery round flagged. Chat meal swaps now route
    // through meal-store.swapPoolMeal inside ChatAssistant's action handler
    // (an honest no-op until M1 fills the pools), same layer as the UI.
    if (action.type === 'replace_exercise') {
      // Session-only swap: nothing to persist — the swap only affects what
      // the user does today, and actual performance gets logged through
      // set-log-store when they log sets. ChatAssistant now only forwards
      // this action when permanent === false (vision-architecture patch
      // round, fix 1) — the permanent branch that used to live here mutated
      // exercisePlan/mesocycle client state directly, with no saveMesocycle
      // call, so a "permanent" swap looked applied until the next refresh
      // and then silently reverted. Removed rather than left unreachable;
      // a real permanent swap arrives with Phase B's confirm-gated rebuild
      // through mesocycle-edit.
    } else if (action.type === 'adjust_volume') {
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
    const applied = await swapPoolMeal(profile.id, slot, chosenMeals[slot]?.name, chooseName, 'manual')
    if (!applied) return
    setManualMealPicks(prev => ({ ...prev, [slot]: applied.name }))
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
      })
      setMealPools(result.accepted)
      setManualMealPicks({})
    } finally {
      setIsGeneratingMeals(false)
    }
  }

  const handleBanExercise = async (exerciseName: string) => {
    if (!profile) return
    const updated = [...exerciseExclusions, exerciseName]
    setExerciseExclusions(updated)

    if (profile.id) {
      await supabase
        .from('fitness_profiles')
        .update({ exercise_exclusions: updated })
        .eq('id', profile.id)
    }

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell className="size-5 text-primary" />
            <h1 className="text-lg font-semibold tracking-tight">Personal TrAIner</h1>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="size-3.5" />
            New Plan
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {profile.id && (
          <WeeklyPlannerCard
            profileId={profile.id}
            profile={profile}
            trainingDays={profile.training_days}
            exercisePlan={exercisePlan}
            macros={macros}
          />
        )}

        <Tabs defaultValue="nutrition" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="nutrition">
              <PieChart className="size-4" />
              <span className="hidden sm:inline ml-1.5">Nutrition</span>
            </TabsTrigger>
            <TabsTrigger value="exercise">
              <Activity className="size-4" />
              <span className="hidden sm:inline ml-1.5">Exercise</span>
            </TabsTrigger>
            <TabsTrigger value="meals">
              <UtensilsCrossed className="size-4" />
              <span className="hidden sm:inline ml-1.5">Meals</span>
            </TabsTrigger>
            <TabsTrigger value="chat">
              <MessageCircle className="size-4" />
              <span className="hidden sm:inline ml-1.5">Chat</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="nutrition">
            <NutritionDisplay
              profile={profile}
              macros={macros}
              exercisePlan={exercisePlan}
              latestWeightKg={latestWeightKg}
              onMacroModeChange={handleMacroModeChange}
              onWeightLogged={handleWeightLogged}
            />
          </TabsContent>

          <TabsContent value="exercise">
            {isDevAccount(profile) && (
              <DevTestPanel
                profileId={profile?.id}
                mesocycle={mesocycle}
                exercisePlan={exercisePlan}
                overrideWeek={devOverrideWeek}
                overrideDay={devOverrideDay}
                devBypassLocks={devBypassLocks}
                onOverrideWeekChange={setDevOverrideWeek}
                onOverrideDayChange={setDevOverrideDay}
                onBypassLocksChange={setDevBypassLocks}
                onLogsSeeded={() => setLogsVersion(v => v + 1)}
              />
            )}
            <ExercisePlan
              plan={exercisePlan}
              mesocycle={mesocycle}
              exclusions={exerciseExclusions}
              profile={profile ?? undefined}
              profileId={profile?.id}
              planCreatedAt={mesocycleCreatedAt ?? profile?.created_at}
              logsVersion={logsVersion}
              devOverrideWeek={devOverrideWeek}
              devOverrideDay={devOverrideDay}
              devBypassLocks={devBypassLocks}
              onSwapExercise={handleSwapExercise}
              onBanExercise={handleBanExercise}
            />
            {profile?.id && <CardioLogger profileId={profile.id} />}
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
          </TabsContent>

          <TabsContent value="chat" forceMount className="data-[state=inactive]:hidden">
            <ChatAssistant
              profile={profile}
              macros={macros}
              exercisePlan={exercisePlan}
              mesocycle={mesocycle}
              planCreatedAt={mesocycleCreatedAt ?? profile?.created_at}
              mealPlan={mealPlan}
              exerciseExclusions={exerciseExclusions}
              latestWeightKg={latestWeightKg}
              onPlanUpdate={handlePlanUpdate}
              onLogsUpdated={() => setLogsVersion(v => v + 1)}
              onWeightLogged={handleWeightLogged}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

export default App
