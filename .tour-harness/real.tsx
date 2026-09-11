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
import { saveActiveSessionRecord } from '@/lib/active-session-store'
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

// ?absurd=1 — the weight-plausibility check, on the screen it argues on.
//
// Two things it needs that the default harness does not have: a STATED
// dumbbell ceiling, so the warning takes its "you told me" branch rather
// than quoting the app's own table, and a row whose implement is known and
// small. The row is seeded as Additional Work below, which is the weakest
// link in the wiring (it reaches SetGrid through a different parent from
// the plan rows) and, unlike the plan, is the same exercise on every
// weekday. Off by default, so every existing run of this harness is
// unchanged.
const ABSURD = new URLSearchParams(location.search).get('absurd') === '1'
const LEG_CURL = new URLSearchParams(location.search).get('legcurl') === '1'

// ?planDelay=N — App.tsx holds exercisePlan/mesocycle at [] until its read
// resolves (App.tsx:111,138). Every other run of this harness hands them over
// before first paint, so the window in which Home has no plan has never been
// on screen here. 0 (the default) keeps that behaviour exactly.
const PLAN_DELAY_MS = Number(new URLSearchParams(location.search).get('planDelay') ?? '0')
export const STATED_DUMBBELL_KG = 24

const profile: UserProfile = {
  id: PROFILE_ID,
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  // ?legcurl=1 — THE ONE-DUMBBELL LIFT, ON A REAL GENERATED PLAN.
  //
  // Dumbbell Leg Curl is not reachable at full_gym on an upper/lower split:
  // a machine leg curl wins the slot. A home-gym push/pull/legs profile is
  // where the generator actually chooses it — measured across three tiers,
  // three splits and three seeds before picking this one, rather than
  // hand-seeding a plan row, which would have proved only that a string I
  // wrote myself renders.
  equipment_access: LEG_CURL ? 'home_gym' : 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '45-60',
  workout_split_preference: LEG_CURL ? 'push_pull_legs' : 'upper_lower',
  training_days: DAYS.map((day, i) => ({ day, available: availableIdx.has(i) })),
  weekly_schedule: {}, dietary_preferences: new URLSearchParams(location.search).get('ate') === '1' ? ['nut-free'] : [], concurrent_activities: [],
  exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: 'tolerate',
  // NINE DAYS OLD, not today: a plan created today has no elapsed
  // scheduled days, so the consistency score correctly shows nothing and the
  // harness could never see it render.
  created_at: new Date(Date.now() - 9 * 86400000).toISOString(),
  ...(ABSURD ? { max_dumbbell_kg: STATED_DUMBBELL_KG } : {}),
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
  water_logs: [],
  // Two logged sessions inside the current plan week, so consistency has
  // something real to count.
  // Column names matter: getRecentLogs filters on user_id / is_warmup and
  // orders by completed_at, not the names I reached for first.
  // 2 days back: the plan started 9 days ago so that date is inside the
  // CURRENT plan week, and it falls on one of the four available weekdays.
  // (1 and 3 days back are neither, which is why the first fixture read 0/1.)
  exercise_set_logs: [1].map((back, i) => ({
    id: `l${i}`, user_id: PROFILE_ID, exercise_name: 'Barbell Squats', set_number: 1,
    weight_kg: 60, reps_completed: 8, is_bodyweight: false, is_warmup: false,
    completed_at: new Date(Date.now() - (back + 1) * 86400000).toISOString(),
    date: new Date(Date.now() - (back + 1) * 86400000).toISOString().slice(0, 10),
  })),
  // ?swapped=1 — the day Ashley told the coach she had done Muay Thai instead.
  // Off by default so every existing run of this harness is unchanged. On, it
  // supplies the one row the panel reads through useTrainingWeek, which is the
  // only way to see on screen what a source check cannot show: whether the
  // session card still offers a workout she has already replaced.
  // ?moved=1 — "I'll do it tomorrow". Same shape as ?swapped=1 above and for
  // the same reason: one row is the only way to see on screen what a source
  // check cannot show. Today IS a training day in this fixture and tomorrow
  // is not (availableIdx), so this is the ordinary case — the session moves
  // to the next free day, which is the one she asked for.
  workout_sessions: new URLSearchParams(location.search).get('swapped') === '1'
    ? [{ id: 'ws-swap', profile_id: PROFILE_ID, date: today, is_completed: false, swapped_for_activity: 'Muay Thai' }]
    : new URLSearchParams(location.search).get('moved') === '1'
    ? [{
        id: 'ws-move', profile_id: PROFILE_ID, date: today, is_completed: false,
        split_type: 'moved', duration_minutes: 0,
        moved_to_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      }]
    : [],
  cardio_logs: [],
  // A logged step count so the new ring renders — without one the row is
  // still the input, which is a different state.
  daily_steps: [{ id: 's1', profile_id: PROFILE_ID, date: today, steps: 7400 }],
  meal_events: new URLSearchParams(location.search).get('ate') === '1'
    ? [
        // Eaten under the name the slot still shows — the quiet-note case.
        { id: 'me1', profile_id: PROFILE_ID, date: today, slot: 'breakfast', event_type: 'confirmed',
          meal_name: 'Porridge with almond butter', macros: { kcal: 480, protein: 18, carbs: 60, fat: 18 },
          source: 'manual', client_id: 'seed-breakfast', created_at: new Date().toISOString() },
        // Eaten under a name the plan has since moved away from — the
        // name-preservation case. 610, deliberately not the pick's 720.
        { id: 'me2', profile_id: PROFILE_ID, date: today, slot: 'lunch', event_type: 'confirmed',
          meal_name: 'Leftover chilli and rice', macros: { kcal: 610, protein: 40, carbs: 70, fat: 15 },
          source: 'manual', client_id: 'seed-lunch', created_at: new Date().toISOString() },
      ]
    : [],
  meal_plan_picks: [], meal_plan_slots: [],
  favorite_meals: [], grocery_items: [], load_suggestions: [], pending_actions: [],
  plan_adaptations: [], user_facts: [], user_context_facts: [], user_goals: [],
  chat_messages: [], exercise_plans: [], mesocycle_weeks: [],
  daily_nutrition_targets: [], workout_exercises: [], weight_basis_offers: [],
}
setSupabaseClient(makeFakeSupabase(db) as never)

// The Additional Work row for ?absurd=1. Declared through the same record
// the app itself writes, so the section renders exactly as it does for a
// trainee who typed "I also did..." — and picked as the first dumbbell
// movement NOT already in today's session, because a declared exercise that
// IS in the plan is correctly filtered out of Additional Work and the row
// would silently never appear.
if (ABSURD) {
  const planned = new Set((exercisePlan.find(d => d.day === DAYS[todayIdx])?.exercises ?? []).map(e => e.name))
  const name = ['Lateral Raises', 'Hammer Curls', 'Dumbbell Curls', 'Dumbbell Flyes'].find(n => !planned.has(n))!
  ;(window as unknown as { __absurdExercise: string }).__absurdExercise = name
  saveActiveSessionRecord({
    profileId: PROFILE_ID, date: today, dayName: DAYS[todayIdx], liveWeek: 1,
    status: 'running', startedAtIso: new Date().toISOString(), lastActivityIso: new Date().toISOString(),
    declaredOffPlan: [name],
  })
}

// Real meals, shaped like generate-meals' output, so the `meals` stop has
// something with real height under it rather than an empty-state card.
const meal = (slot: string, name: string, kcal: number) => ({
  slot, name,
  ingredients: [{ name: 'chicken breast', quantity: 180, unit: 'g' }, { name: 'basmati rice', quantity: 120, unit: 'g' }],
  macros: { calories: kcal, protein: 45, carbs: 60, fat: 12 },
  tags: [],
})
// ?ate=1 — ROADMAP ITEM 9. Two things a preference change must not do to a
// meal already eaten. Breakfast contains almond butter and the profile below
// turns on nut-free, so the re-check trips on a meal that is ALREADY LOGGED
// under the same name: it must get the quiet note, not the red "swap it"
// warning. Lunch is logged under a DIFFERENT name from today's pick, which is
// what happens after a swap or an added food: the heading must stay the name
// that was eaten, over the calories that were eaten.
const ATE = new URLSearchParams(location.search).get('ate') === '1'
const nuttyBreakfast = {
  slot: 'breakfast', name: 'Porridge with almond butter',
  ingredients: [{ name: 'rolled oats', quantity: 60, unit: 'g' }, { name: 'almond butter', quantity: 20, unit: 'g' }],
  macros: { calories: 480, protein: 18, carbs: 60, fat: 18 },
  tags: [],
}
const chosen = {
  breakfast: ATE ? nuttyBreakfast : meal('breakfast', 'Greek yoghurt, berries and honey', 480),
  lunch: meal('lunch', 'Chicken, rice and roasted peppers', 720),
  dinner: meal('dinner', 'Salmon, new potatoes and green beans', 780),
} as never
const pools = {
  breakfast: [chosen.breakfast], lunch: [chosen.lunch], dinner: [chosen.dinner],
} as never
const mealTotals = { calories: 1980, protein: 150, carbs: 190, fat: 60 }

function Harness() {
  const { route } = useAppRoute()
  // VERBATIM FROM App.tsx:103-104, minus the branches this harness has no
  // screens for. The program route is not a tab of its own — it renders
  // INSIDE the exercise tab — and mapping it to the dashboard here sent
  // "See the whole program" to Home, which is a fact about this harness and
  // not about the app.
  const activeTab: Tab =
    route.kind === 'tab' ? route.tab : route.kind === 'program' || route.kind === 'train' ? 'exercise' : 'dashboard'
  const [ready, setReady] = useState(false)
  useEffect(() => { setReady(true) }, [])
  const [planArrived, setPlanArrived] = useState(PLAN_DELAY_MS <= 0)
  useEffect(() => {
    // The driver reads this rather than trusting a wall-clock sample: whether
    // the plan had arrived when a sentence rendered is the actual question,
    // and bundle parse time moves first paint around by hundreds of ms.
    ;(window as unknown as Record<string, unknown>).__planArrived = planArrived
    if (planArrived) return
    const t = setTimeout(() => setPlanArrived(true), PLAN_DELAY_MS)
    return () => clearTimeout(t)
  }, [planArrived])
  // THE PLAN IS STATE HERE, AS IT IS IN App.tsx. It used to be the module
  // const, passed straight into ExerciseTab with no onMesocycleUpdated — so
  // every screen that EDITS the plan (take an exercise out, move one) wrote
  // to the database, called back, and had nowhere for the callback to land.
  // The app was wired correctly and the harness could not show it. App.tsx
  // owns this state and hands setMesocycle down (App.tsx:2547); so does this.
  const [editedMeso, setEditedMeso] = useState(mesocycle)
  const livePlan = planArrived ? exercisePlan : []
  const liveMeso = planArrived ? editedMeso : []

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
          <Dashboard profile={profile} macros={macros} exercisePlan={livePlan}
            mesocycle={liveMeso} planCreatedAt={profile.created_at}
/>
        )}
        {activeTab === 'nutrition' && (
          <NutritionDisplay profile={profile} macros={macros} exercisePlan={exercisePlan}
            latestWeightKg={80} profileId={PROFILE_ID} date={today}
            pools={pools} chosen={chosen} mealTotals={mealTotals}
            isGeneratingMeals={false} mealRegenerateError={null}
            onSwapMealSlot={noop} onRegenerateMealSlot={noop} onRegenerateAllMeals={noop} />
        )}
        {activeTab === 'exercise' && (
          <ExerciseTab plan={exercisePlan} mesocycle={editedMeso} exclusions={[]}
            profile={profile} profileId={PROFILE_ID} planCreatedAt={profile.created_at}
            onMesocycleUpdated={setEditedMeso}
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
