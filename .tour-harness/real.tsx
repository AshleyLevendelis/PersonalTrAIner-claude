// ---------------------------------------------------------------------------
// THE TOUR, AGAINST THE REAL SCREENS.
//
// `verify:tour` (drive.mjs / main.tsx) drives the tour against STUB targets:
// divs carrying the right `data-tour` keys. That proves the tour's behaviour
// — measuring, gating, blocking, persistence, resume — and its own README is
// explicit that it proves nothing about whether those keys are attached to
// the right things, or whether a spotlight sized to the real Dashboard hero
// actually lands on it.
//
// This closes that half. Real Dashboard, real NutritionDisplay, real MealPlan,
// real ExerciseTab, real ToolsTab, real BottomTabBar, a real generated
// mesocycle, and the real AppTour over the top.
//
// WHY NOT MOUNT App.tsx ITSELF, which would be more faithful still: the tour
// only runs when `tourArmed` is true, and that flag is component-local state
// set at exactly one call site — the moment onboarding SUCCEEDS. A restored
// session never arms it (deliberately: a month-old user must not be handed a
// tour of a plan they know). So booting App gives a tour that never starts,
// and the only ways past it are driving the model through onboarding, which
// is unreachable from here, or patching the flag, which is testing a
// different app.
//
// WHAT IS COPIED RATHER THAN REAL, stated so the result is not overread:
// App.tsx's own `<div data-tour="settings">` wrapper around <ProfileMenu>.
// It lives in App.tsx, not a component, so it is reproduced below verbatim
// — the same fixed positioning and the same child. `test:app-tour` is what
// holds the real one; if these two ever disagree, believe that gate.
// ---------------------------------------------------------------------------

import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { setSupabaseClient } from '@/lib/supabase'
import { makeFakeSupabase, type Db } from './fake-supabase'
import { generateMesocycle, setRandomSource, resetRandomSource } from '@/lib/exercise-plan'
import { seededRngFromKey } from '@/lib/seeded-random'
import { computeTargets } from '@/lib/nutrition-targets'
import { useAppRoute, tabHash, type Tab } from '@/lib/app-route'
import type { UserProfile, MacroTargets } from '@/lib/types'

import { Dashboard } from '@/components/Dashboard'
import { NutritionDisplay } from '@/components/NutritionDisplay'
import { ExerciseTab } from '@/components/exercise/ExerciseTab'
import { ToolsTab } from '@/components/ToolsTab'
import { BottomTabBar } from '@/components/BottomTabBar'
import { ProfileMenu } from '@/components/ProfileMenu'
import { AppTour } from '@/components/AppTour'
import { TOUR_STEPS } from '@/lib/app-tour-steps'
// The app's own provider tree. Not decoration: useActiveSession throws
// outside its provider, and the tour's exercise stops render inside
// components that call it. A harness missing a provider is a harness whose
// verdict is about the harness.
import { AppearanceProvider } from '@/hooks/useAppearance'
import { ActiveSessionProvider } from '@/hooks/useActiveSession'
import { TimersProvider } from '@/hooks/useTimers'
import { BottomDockHeightProvider } from '@/hooks/useBottomDockHeight'
import '@/index.css'

const PROFILE_ID = '00000000-0000-4000-8000-00000000t0ur'.replace('t0ur', '0001')
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// TODAY MUST BE A TRAINING DAY or the tour legitimately drops its set stop
// (setStepSkipped) and the run proves nothing about the gated step. The four
// available days are chosen relative to the real weekday rather than
// hard-coded Mon-Thu, so this does not quietly stop testing the gate on a
// Friday. Still a realistic 4-day split, not "every day available".
const todayIdx = new Date().getDay()
const availableIdx = new Set([todayIdx, (todayIdx + 2) % 7, (todayIdx + 4) % 7, (todayIdx + 5) % 7])

const profile: UserProfile = {
  id: PROFILE_ID,
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '45-60',
  workout_split_preference: 'upper_lower',
  training_days: DAYS.map((day, i) => ({ day, available: availableIdx.has(i) })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  created_at: new Date().toISOString(),
} as UserProfile

// ALWAYS FROM THE MESOCYCLE, never generateExercisePlan directly —
// render-screens.tsx records why: the base week has `tier` undefined, so a
// panel fed one shows a state no user can reach (a squat under an ACCESSORY
// label, no MAIN LIFT anywhere). Seeded so a re-run is comparable.
setRandomSource(seededRngFromKey('tour-real-screens'))
const mesocycle = generateMesocycle(profile)
resetRandomSource()
const exercisePlan = mesocycle[0].days
const macros: MacroTargets | null = computeTargets(profile)

const today = new Date().toISOString().slice(0, 10)
const db: Db = {
  fitness_profiles: [{ ...profile, id: PROFILE_ID }],
  // A weigh-in so the Dashboard's trend has something real to draw rather
  // than rendering its empty state, which is not what the tour spotlights.
  daily_metrics: [
    { id: 'm1', profile_id: PROFILE_ID, date: today, weight_kg: 80 },
    { id: 'm2', profile_id: PROFILE_ID, date: '2026-08-21', weight_kg: 80.6 },
  ],
  water_logs: [], exercise_set_logs: [], workout_sessions: [], cardio_logs: [],
  daily_steps: [], meal_events: [], meal_plan_picks: [], meal_plan_slots: [],
  favorite_meals: [], grocery_items: [], load_suggestions: [], pending_actions: [],
  plan_adaptations: [], user_facts: [], user_context_facts: [], user_goals: [],
  chat_messages: [], exercise_plans: [], mesocycle_weeks: [],
  daily_nutrition_targets: [], workout_exercises: [], weight_basis_offers: [],
}
setSupabaseClient(makeFakeSupabase(db) as never)

// Real meals, shaped like generate-meals' output, so the `meals` stop has
// something with real height under it rather than an empty-state card.
const meal = (slot: string, name: string, kcal: number) => ({
  slot, name,
  ingredients: [{ name: 'chicken breast', quantity: 180, unit: 'g' }, { name: 'basmati rice', quantity: 120, unit: 'g' }],
  macros: { calories: kcal, protein: 45, carbs: 60, fat: 12 },
  tags: [],
})
const chosen = {
  breakfast: meal('breakfast', 'Greek yoghurt, berries and honey', 480),
  lunch: meal('lunch', 'Chicken, rice and roasted peppers', 720),
  dinner: meal('dinner', 'Salmon, new potatoes and green beans', 780),
} as never
const pools = {
  breakfast: [chosen.breakfast], lunch: [chosen.lunch], dinner: [chosen.dinner],
} as never
const mealTotals = { calories: 1980, protein: 150, carbs: 190, fat: 60 }

function Harness() {
  const { route } = useAppRoute()
  const activeTab: Tab = route.kind === 'tab' ? route.tab : 'dashboard'
  const [ready, setReady] = useState(false)
  useEffect(() => { setReady(true) }, [])

  const noop = () => {}
  return (
    <AppearanceProvider>
    <ActiveSessionProvider
      profileId={PROFILE_ID}
      planCreatedAt={profile.created_at}
      totalWeeks={mesocycle.length}
      refreshToken={0}
    >
    <TimersProvider profileId={PROFILE_ID}>
    <BottomDockHeightProvider>
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* App.tsx's own settings wrapper, reproduced — see the header note. */}
      <div data-tour="settings" className="fixed right-3 z-40" style={{ top: 'calc(0.625rem + env(safe-area-inset-top))' }}>
        <ProfileMenu onOpenProfile={noop} onNewPlan={noop} />
      </div>

      <main className="mx-auto max-w-md px-4 pb-40 pt-14">
        {activeTab === 'dashboard' && (
          <Dashboard profile={profile} macros={macros} exercisePlan={exercisePlan}
            mesocycle={mesocycle} planCreatedAt={profile.created_at} />
        )}
        {activeTab === 'nutrition' && (
          <NutritionDisplay profile={profile} macros={macros} exercisePlan={exercisePlan}
            latestWeightKg={80} profileId={PROFILE_ID} date={today}
            pools={pools} chosen={chosen} mealTotals={mealTotals}
            isGeneratingMeals={false} mealRegenerateError={null}
            onSwapMealSlot={noop} onRegenerateMealSlot={noop} onRegenerateAllMeals={noop} />
        )}
        {activeTab === 'exercise' && (
          <ExerciseTab plan={exercisePlan} mesocycle={mesocycle} exclusions={[]}
            profile={profile} profileId={PROFILE_ID} planCreatedAt={profile.created_at}
            onSwapExercise={noop} onBanExercise={noop}
            onDevOverrideWeekChange={noop} onDevOverrideDayChange={noop}
            onDevBypassLocksChange={noop} onLogsSeeded={noop} />
        )}
        {activeTab === 'tools' && (
          <ToolsTab profileId={PROFILE_ID} mealPools={pools} targets={macros} softLikedFoods={[]} />
        )}
        {activeTab === 'chat' && (
          <div className="pt-10 text-center text-sm text-muted-foreground">
            Chat — the tour's last stop points at the tab, not at content inside it.
          </div>
        )}
      </main>

      <BottomTabBar activeTab={activeTab} onTabChange={t => { window.location.hash = tabHash(t as Tab) }} />
      {/* ?tour=off walks the screens on their own — the scrim covers most of
          the page, so a layout pass has to be able to take it away. */}
      {ready && new URLSearchParams(location.search).get('tour') !== 'off' && (
        <AppTour profileId={PROFILE_ID} armed />
      )}
    </div>
    </BottomDockHeightProvider>
    </TimersProvider>
    </ActiveSessionProvider>
    </AppearanceProvider>
  )
}

// THE DRIVER READS THE TOUR'S OWN STEP LIST FROM HERE rather than carrying a
// copy. Its first copy had the chat tab's nav key as 'navChat'; the real one
// is 'chatfab', and the driver reported a missing target that was never
// missing. A harness that restates what it is testing will eventually
// disagree with it, and the disagreement looks like a bug in the app.
;(window as unknown as { __TOUR_STEPS__: unknown }).__TOUR_STEPS__ = TOUR_STEPS

if (!window.location.hash) window.location.hash = tabHash('dashboard')
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>)
