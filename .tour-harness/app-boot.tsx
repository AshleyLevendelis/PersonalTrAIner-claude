// ---------------------------------------------------------------------------
// THE WHOLE APP, FROM COLD — 31 Oct 2026, Ashley: "When I first open the app, it takes a few seconds to load ...
// make it load quicker, and not show that loading as soon as you open it."
//
// Every other harness page mounts ONE tab with its props handed in, so none of them has ever run App.tsx's own
// start: sign in, find the profile, read the plan, the meals and the weigh-ins, then Home's own reads. That start is
// exactly what she was looking at. This page boots the real <App/> (main.tsx's tree, minus the service worker)
// against the harness's fake database, and ?slow=N makes every database answer take N ms, the way a phone on 4G
// does. A driver can then time how long the loading screens stay up, and whether they show at all.
//
// THE FIXTURE CHOOSES INPUT ONLY: a profile row, the plan the app's own generator makes for it (stored through the
// app's own saveMesocycle), meal rows as the database holds them, and two weigh-ins. Nothing the app derives is
// written here.
//
// ?warm=1 — a RE-OPEN: the app has been opened on this phone before, so whatever it keeps on the phone between
// visits is there. Done by booting once with no delay, then reloading (the driver does the reload; this flag only
// says which visit the page is on, for the record).
// ---------------------------------------------------------------------------
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import App from '@/App'
import { AppearanceProvider } from '@/hooks/useAppearance'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'
import { setSupabaseClient } from '@/lib/supabase'
import { makeFakeSupabase, type Db } from './fake-supabase'
import { setDevClockOverride } from '@/lib/dev-clock'
import { generateMesocycle, setRandomSource } from '@/lib/exercise-plan'
import { seededRngFromKey } from '@/lib/seeded-random'
import { computeMealMacros } from '@/lib/food-db'
import { ANCHOR_ISO, anchorNowMs, iso as isoOf } from './anchor.mjs'
import type { UserProfile } from '@/lib/types'

const PROFILE_ID = '00000000-0000-4000-8000-00000000b007'
const USER_ID = '00000000-0000-4000-8000-0000000000a1'
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const created = new Date(anchorNowMs() - 9 * 86400000).toISOString()

setDevClockOverride(PROFILE_ID, ANCHOR_ISO)
try {
  // Returning, not new: this phone already knows whose profile it holds, and has seen the tour.
  localStorage.setItem('fitplan_profile_id', PROFILE_ID)
  localStorage.setItem(`fitplan_tour_v1:${PROFILE_ID}`, 'done')
  localStorage.setItem('fitplan_last_tab', 'dashboard')
} catch { /* a page without storage boots as a new phone, which a driver will see */ }

const profileRow = {
  id: PROFILE_ID, owner_id: USER_ID, display_name: 'Sam',
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', meals_per_day: 3, include_snacks: true,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid', training_experience: 'intermediate',
  session_duration_preference: '45-60', workout_split_preference: 'upper_lower',
  training_days: DAYS.map((day, i) => ({ day, available: [1, 2, 4, 5].includes(i) })),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive', recovery_capacity: 'moderate',
  conditioning_preference: 'tolerate', created_at: created,
  bmr: 1800, tdee: 2500, calorie_target: 2700, protein_g: 160, carbs_g: 320, fat_g: 80,
}

// The plan the app's own generator makes for this profile, seeded so a re-run is comparable.
setRandomSource(seededRngFromKey('app-boot'))
const weeks = generateMesocycle(profileRow as unknown as UserProfile)

const meal = (slot: string, idx: number, name: string, ingredients: { name: string; quantity: number; unit: string }[]) => {
  const m = computeMealMacros(ingredients)
  return {
    id: `pool-${slot}-${idx}`, profile_id: PROFILE_ID, slot, pool_index: idx, name, ingredients, tags: [], prep: '',
    macros: { kcal: Math.round(m.kcal), protein: Math.round(m.protein), carbs: Math.round(m.carbs), fat: Math.round(m.fat) },
  }
}

const db: Db = {
  fitness_profiles: [profileRow],
  mesocycle_weeks: [], exercise_plans: [],
  meal_plan_slots: [
    meal('breakfast', 0, 'Porridge with berries', [{ name: 'dry oats', quantity: 90, unit: 'g' }, { name: 'whole milk', quantity: 300, unit: 'ml' }, { name: 'blueberries', quantity: 100, unit: 'g' }]),
    meal('lunch', 0, 'Chicken and rice', [{ name: 'raw chicken breast', quantity: 205, unit: 'g' }, { name: 'dry white rice', quantity: 90, unit: 'g' }]),
    meal('dinner', 0, 'Salmon and potatoes', [{ name: 'salmon', quantity: 170, unit: 'g' }, { name: 'raw potato', quantity: 350, unit: 'g' }]),
    meal('snack', 0, 'Yoghurt and banana', [{ name: 'greek yoghurt', quantity: 170, unit: 'g' }, { name: 'banana', quantity: 120, unit: 'g' }]),
  ],
  daily_metrics: [
    { id: 'm1', profile_id: PROFILE_ID, date: isoOf(new Date(anchorNowMs() - 86400000)), weight_kg: 80 },
    { id: 'm2', profile_id: PROFILE_ID, date: isoOf(new Date(anchorNowMs() - 5 * 86400000)), weight_kg: 80.4 },
  ],
  daily_steps: [], water_logs: [], exercise_set_logs: [], workout_sessions: [], cardio_logs: [],
  meal_events: [], meal_plan_picks: [], favorite_meals: [], grocery_items: [], load_suggestions: [], pending_actions: [],
  plan_adaptations: [], user_facts: [], user_context_facts: [], user_goals: [], chat_messages: [],
  daily_nutrition_targets: [], workout_exercises: [], weight_basis_offers: [],
}

// The plan goes in through the app's own writer (so the rows are the shape the app stores), with no delay: the
// fixture is being laid down, not timed. ?slow is applied to the reads the app makes once it boots.
const fake = makeFakeSupabase(db, { session: { user: { id: USER_ID, email: null } } }) as never
setSupabaseClient(makeFakeSupabase(db, { session: { user: { id: USER_ID, email: null } }, slowMs: 0, alwaysUp: true }) as never)
void (async () => {
const { saveMesocycle } = await import('@/lib/mesocycle-persistence')
await saveMesocycle(PROFILE_ID, weeks, created)
setSupabaseClient(fake)
;(window as unknown as Record<string, unknown>).__fakeDb = db

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <AppearanceProvider>
        <App />
      </AppearanceProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
})()
