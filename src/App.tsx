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
import { generateWeeklyMealPlan, getWeekStartDate, deriveDailyMealView } from '@/lib/meal-plan'
import { swapPoolMeal } from '@/lib/meal-store'
import { supabase } from '@/lib/supabase'
import { saveMesocycle, saveMesocycleWeek, restoreMesocycle } from '@/lib/mesocycle-persistence'
import { swapExerciseInMesocycle, banExerciseFromMesocycle, type SwapScope } from '@/lib/mesocycle-edit'
import type { UserProfile, MacroTargets, WorkoutDay, MealPlanDay, PlanAction, WeeklyMealPlan, DayName, SchedulePatchItem, MesocycleWeek } from '@/lib/types'
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
  const [weeklyMealPlan, setWeeklyMealPlan] = useState<WeeklyMealPlan | null>(null)
  // The legacy per-slot view is now a PURE DERIVATION of the weekly plan
  // (M0 Part 6) — the old standalone mealPlan state was the dead object chat
  // swaps mutated while nothing rendered it. Derived fresh each render so
  // the chat's meal context and the Meals tab can never disagree.
  const todayDayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })
  const mealPlan: MealPlanDay[] = deriveDailyMealView(weeklyMealPlan, todayDayName)
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
      injuries: profileRow.exercise_exclusions || [],
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

    const [{ data: mealRows }, { data: exerciseRows }, fullMesocycle] = await Promise.all([
      supabase.from('meal_plans').select('*').eq('profile_id', storedId),
      supabase.from('exercise_plans').select('*').eq('profile_id', storedId),
      restoreMesocycle(storedId),
    ])

    // The legacy no-day_of_week branch (grouped restoredMeals) is gone with
    // the standalone mealPlan state (M0 Part 6) — the per-day view derives
    // from the weekly plan now.
    const restoredWeekly: WeeklyMealPlan = {}
    if (mealRows) {
      const hasWeeklyData = mealRows.some(r => r.day_of_week)
      if (hasWeeklyData) {
        for (const row of mealRows) {
          const day = row.day_of_week || 'Monday'
          if (!restoredWeekly[day]) restoredWeekly[day] = []
          restoredWeekly[day].push({
            id: row.id,
            day_of_week: day,
            meal_slot: row.meal_slot,
            recipe: {
              name: row.name,
              image: '',
              source_url: '',
              yield: 1,
              total_calories: row.calories,
              total_protein: row.protein,
              total_carbs: row.carbs,
              total_fat: row.fat,
              total_weight: 300,
              ingredients: (row.ingredients || []).map((i: string) => ({ text: i, weight: 0, food: i })),
              ingredient_lines: row.ingredients || [],
            },
            scaled_calories: row.calories,
            scaled_protein: row.protein,
            scaled_carbs: row.carbs,
            scaled_fat: row.fat,
            scale_factor: 1,
            ingredient_lines: row.ingredients || [],
          })
        }
      }
    }

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
    if (Object.keys(restoredWeekly).length > 0) setWeeklyMealPlan(restoredWeekly)
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

    setGeneratingStatus('Building your meal structure...')
    const weeklyPlan = generateWeeklyMealPlan(enrichedProfile, workout, setGeneratingStatus)

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
        exercise_exclusions: enrichedProfile.injuries || [],
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

    if (data) {
      enrichedProfile.id = data.id
      localStorage.setItem(STORAGE_KEY, data.id)
      try {
        await persistWeeklyPlan(data.id, weeklyPlan, workout)
      } catch (err) {
        // A failure to persist the plan must not block showing it.
        console.error('Persisting weekly plan failed:', err)
      }
      try {
        // Full-fidelity save — every week, with loads/phase/warmup intact.
        // Passing mesocycleData directly (not the `mesocycle` state) matters:
        // setMesocycle() below hasn't run yet, so the state is still empty.
        await saveMesocycle(data.id, mesocycleData)
      } catch (err) {
        console.error('Persisting mesocycle failed:', err)
      }
    }

    setProfile(enrichedProfile)
    setMacros(calculatedMacros)
    setExercisePlan(workout)
    setMesocycle(mesocycleData)
    setMesocycleCreatedAt(new Date().toISOString())
    setWeeklyMealPlan(weeklyPlan)
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

  const persistWeeklyPlan = async (profileId: string, weeklyPlan: WeeklyMealPlan, workout: WorkoutDay[]) => {
    const weekStart = getWeekStartDate()
    const mealRows = Object.values(weeklyPlan).flat().map(slot => ({
      profile_id: profileId,
      meal_slot: slot.meal_slot,
      day_of_week: slot.day_of_week,
      week_start_date: weekStart,
      name: slot.recipe.name,
      calories: slot.scaled_calories,
      protein: slot.scaled_protein,
      carbs: slot.scaled_carbs,
      fat: slot.scaled_fat,
      portion_size: slot.ingredient_lines.join(', '),
      prep: '',
      substitution: '',
      ingredients: slot.ingredient_lines,
      // Never claimed true anymore (M0): the verified badge used to mean
      // "Edamam-checked", and nothing in the system can verify a number.
      is_verified: false,
    }))

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

    await Promise.all([
      supabase.from('meal_plans').insert(mealRows),
      supabase.from('exercise_plans').insert(exerciseRows),
    ])
  }

  const handlePlanUpdate = async (action: PlanAction) => {
    // The old replace_food branch is gone (M0 Part 6): it mutated the dead
    // standalone mealPlan state that nothing rendered — the exact disjoint
    // write path the discovery round flagged. Chat meal swaps now route
    // through meal-store.swapPoolMeal inside ChatAssistant's action handler
    // (an honest no-op until M1 fills the pools), same layer as the UI.
    if (action.type === 'replace_exercise') {
      if (action.permanent === false) {
        // Session-only swap: nothing to persist — the swap only affects what
        // the user does today, and actual performance gets logged through
        // set-log-store when they log sets. (The pre-C0 code here inserted a
        // workout_logs row whose columns didn't match the table — it had been
        // silently failing with a 400 since it was written.)
      } else {
        // Permanent swap: update the plan template and mesocycle
        setExercisePlan(prev =>
          prev.map(day => {
            if (day.day.toLowerCase() !== action.day.toLowerCase()) return day
            return {
              ...day,
              exercises: day.exercises.map(ex => {
                const nameLower = ex.name.toLowerCase()
                const oldLower = action.old_item.toLowerCase()
                if (nameLower !== oldLower && !nameLower.includes(oldLower)) return ex
                return {
                  ...ex,
                  name: action.new_item,
                  sets: action.sets,
                  reps: action.reps,
                  rest: action.rest,
                }
              }),
            }
          })
        )
        setMesocycle(prev =>
          prev.map(week => ({
            ...week,
            days: week.days.map(day => {
              if (day.day.toLowerCase() !== action.day.toLowerCase()) return day
              return {
                ...day,
                exercises: day.exercises.map(ex => {
                  const nameLower = ex.name.toLowerCase()
                  const oldLower = action.old_item.toLowerCase()
                  if (nameLower !== oldLower && !nameLower.includes(oldLower)) return ex
                  return {
                    ...ex,
                    name: action.new_item,
                    sets: action.sets,
                    reps: action.reps,
                    rest: action.rest,
                  }
                }),
              }
            }),
          }))
        )
      }
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

  // ONE meal-mutation layer (M0 Part 6): the UI swap goes through
  // meal-store.swapPoolMeal — the same call the chat's replace_food handler
  // makes. Its old body called the retired Edamam path and wrote meal_plans
  // columns the live schema doesn't have; both were dead. swapPoolMeal is an
  // honest M0 stub (always null) until M1 fills the pools, so the swap
  // button currently no-ops exactly as it always effectively did.
  const handleSwapMeal = async (dayName: DayName, mealSlot: string) => {
    if (!profile?.id) return
    const currentSlots = weeklyMealPlan?.[dayName]
    const currentMeal = currentSlots?.find(s => s.meal_slot === mealSlot)

    const poolMeal = await swapPoolMeal(
      profile.id,
      mealSlot.toLowerCase() as import('@/lib/meal-store').MealSlotName,
      currentMeal?.recipe.name,
    )
    if (!poolMeal || !weeklyMealPlan) return

    const updatedDaySlots = (weeklyMealPlan[dayName] || []).map(s =>
      s.meal_slot === mealSlot
        ? {
            ...s,
            recipe: { ...s.recipe, name: poolMeal.name, ingredient_lines: poolMeal.ingredients },
            scaled_calories: poolMeal.macros.kcal,
            scaled_protein: poolMeal.macros.protein,
            scaled_carbs: poolMeal.macros.carbs,
            scaled_fat: poolMeal.macros.fat,
            ingredient_lines: poolMeal.ingredients,
          }
        : s
    )
    setWeeklyMealPlan({ ...weeklyMealPlan, [dayName]: updatedDaySlots })
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
    setWeeklyMealPlan(null)
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
              weeklyPlan={weeklyMealPlan}
              legacyPlan={mealPlan}
              profile={profile}
              exercisePlan={exercisePlan}
              macros={macros}
              onSwapMeal={handleSwapMeal}
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
