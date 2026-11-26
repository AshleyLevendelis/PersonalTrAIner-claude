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
import './fake-health'
import './fake-strap'
import { makeFakeSupabase, type Db } from './fake-supabase'
import { setDevClockOverride } from '@/lib/dev-clock'
import { generateMesocycle, setRandomSource } from '@/lib/exercise-plan'
import { toRow } from '@/lib/mesocycle-shape'
import { seededRngFromKey } from '@/lib/seeded-random'
import { computeMealMacros } from '@/lib/food-db'
import { computeTargets } from '@/lib/nutrition-targets'
import { ANCHOR_ISO, anchorNowMs, iso as isoOf } from './anchor.mjs'
import type { UserProfile } from '@/lib/types'
import { getExerciseEntry, getExerciseId } from '@/lib/exercise-db'
import { isExternallyLoaded } from '@/lib/load-prescription'

const PROFILE_ID = '00000000-0000-4000-8000-00000000b007'
const USER_ID = '00000000-0000-4000-8000-0000000000a1'
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
// ?plan-today: the plan began TODAY (an INPUT: when he finished setup), his live test of 14 Nov 2026, so the days of this
// Monday-to-Sunday week before it are before the plan. verify:live-test-nov14.
const PLAN_TODAY = new URLSearchParams(location.search).has('plan-today')
// ?plan-sunday: the plan was made last SUNDAY evening and is saved (an INPUT: when he finished setup, and the saved rows
// a returning phone reads), his 16 Nov 2026 calendar. verify:live-test-nov14 section D.
const PLAN_SUNDAY = new URLSearchParams(location.search).has('plan-sunday')
const sundayBefore = (() => { const d = new Date(anchorNowMs()); d.setDate(d.getDate() - d.getDay()); d.setHours(20, 0, 0, 0); return d })()
const created = PLAN_SUNDAY ? sundayBefore.toISOString() : new Date(anchorNowMs() - (PLAN_TODAY ? 0 : 9) * 86400000).toISOString()
const TRAIN_TODAY = new URLSearchParams(location.search).has('session-day')
// ?cardio-day: he trains Sunday, Monday, Wednesday and Friday and asked for two cardio days a week (INPUTS: Profile's
// days and "Cardio days a week"); the generator then decides which days are cardio. verify:watch-workouts reads the
// plan beside a workout the watch recorded on such a day.
const CARDIO_DAY = new URLSearchParams(location.search).has('cardio-day')
// ?heart-history: six weeks of the same 30-minute easy jog at a falling heart rate, and resting heart rate at 58 for two
// weeks then 64, 65, 63 on the last three mornings (INPUTS: rows as the strap's fill and the watch's sync write them).
// verify:heart-uses reads Home's fitness line and the coach's recovery offer off them.
const HEART_HISTORY = new URLSearchParams(location.search).has('heart-history')
const heartDay = (ago: number) => isoOf(new Date(anchorNowMs() - ago * 86400000))
// The anchor's Wednesday is "Rest day · optional cardio" on this profile, a planned day with no lifting. ?no-cardio:
// she would rather avoid cardio (an INPUT), and the generator then leaves Wednesday a plain rest day with no plan
// entry (verify:home-day-named). ?weigh=79.55: yesterday's weigh-in (an INPUT), so a reading with two decimals
// reaches Home and Profile. Without them the page is unchanged.
const NO_CARDIO = new URLSearchParams(location.search).has('no-cardio')
const MEALS_A_DAY = Number(new URLSearchParams(location.search).get('meals')) || 3
// ?fresh: a phone that holds no plan (a first open, or after signing out), for verify:welcome. An INPUT: what the
// phone remembers, nothing about what the app shows.
const FRESH_PHONE = new URLSearchParams(location.search).has('fresh')
const NO_SNACKS = new URLSearchParams(location.search).has('no-snacks')
const WEIGH = Number(new URLSearchParams(location.search).get('weigh')) || 80
// ?setup-typo: he signed up TODAY and setup kept 187 kg (his live report, 14 Nov 2026). INPUTS only: the weight on the
// profile, the sign-up weigh-in, and the sign-up target row as the app writes it at sign-up (anchorTargetsAtSignUp:
// the targets computeTargets gives for the profile, anchored at its weight). verify:setup-weight-correction.
const WEIGH_HISTORY = new URLSearchParams(location.search).has('weigh-history')
/** Seeded by date, never random: the same rows every run. Skips every fifth day; day 40 back is the 9 kg-off reading. */
function weighHistory() {
  const rows: { id: string; profile_id: string; date: string; weight_kg: number }[] = []
  for (let back = 125; back >= 0; back--) {
    if (back % 5 === 3) continue
    const wobble = [0.3, -0.2, 0.1, -0.4, 0.2, 0, -0.1][back % 7]
    const kg = back === 40 ? 93 : Math.round((80 + back * 0.043 + wobble) * 10) / 10
    rows.push({ id: `w${back}`, profile_id: PROFILE_ID, date: isoOf(new Date(anchorNowMs() - back * 86400000)), weight_kg: kg })
  }
  return rows
}
const SETUP_TYPO = new URLSearchParams(location.search).has('setup-typo')

// ?clear-storage: a phone with nothing kept from an earlier visit, wiped HERE, before anything of the app's runs, so a
// page the driver just left cannot write into it afterwards.
if (new URLSearchParams(location.search).has('clear-storage')) { try { localStorage.clear() } catch { /* none */ } }
setDevClockOverride(PROFILE_ID, ANCHOR_ISO)
// ?chat-stale-offer: a LONGER conversation from yesterday (24 messages, more than the chat's first page of 20, so the
// phone's own copy is what shows) in which an offer of the coach's was left untapped (an INPUT: he tapped neither
// Apply nor Not now). The phone keeps that card as it last drew it, as every phone does.
const STALE_OFFER = new URLSearchParams(location.search).has('chat-stale-offer')
const staleChat = STALE_OFFER ? Array.from({ length: 24 }, (_, i) => {
  const at = new Date(anchorNowMs() - 26 * 3600000 + i * 60000).toISOString()
  const coach = i % 2 === 1
  return { id: `s${i}`, profile_id: '00000000-0000-4000-8000-00000000b007', role: coach ? 'assistant' : 'user', content: coach ? `Coach reply ${i}.` : `Question ${i}?`, status: 'complete', action_data: null, created_at: at }
}) : []
if (STALE_OFFER) {
  const yesterday = new Date(anchorNowMs() - 26 * 3600000 + 6 * 60000)
  const cached = staleChat.map(r => ({ id: r.id, role: r.role, content: r.content, status: r.status, created_at: r.created_at,
    ...(r.id === 's5' ? { pendingAction: { id: 'pa-stale', kind: 'swap_exercise', status: 'pending', diff: { rows: [], lead: 'Swap it for Leg Press?' }, expiresAt: new Date(yesterday.getTime() + 10 * 60000).toISOString() } } : {}) }))
  try { localStorage.setItem('chat_history_cache_00000000-0000-4000-8000-00000000b007', JSON.stringify(cached)) } catch { /* none */ }
}
try {
  // Returning, not new: this phone already knows whose profile it holds, and has seen the tour.
  if (!FRESH_PHONE) localStorage.setItem('fitplan_profile_id', PROFILE_ID)
  localStorage.setItem(`fitplan_tour_v1:${PROFILE_ID}`, 'done')
  localStorage.setItem('fitplan_last_tab', 'dashboard')
} catch { /* a page without storage boots as a new phone, which a driver will see */ }

const profileRow = {
  id: PROFILE_ID, owner_id: USER_ID, display_name: 'Sam',
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  // ?meals=2 and ?no-snacks are INPUTS (what Profile's "Meals a day" and "Snacks" hold), for verify:meal-shape-rows:
  // the stored dishes below still cover lunch and the snack, which is exactly the state after he changes either.
  fitness_goal: 'hypertrophy', preferred_time: 'morning', meals_per_day: MEALS_A_DAY, include_snacks: !NO_SNACKS,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid', training_experience: 'intermediate',
  session_duration_preference: '45-60', workout_split_preference: 'upper_lower',
  // ?session-day makes the anchor's Wednesday a training day (an INPUT: which days she trains), for a driver that
  // needs a session today on the whole app (verify:live-set-count). Without it the page is exactly as before.
  training_days: DAYS.map((day, i) => ({ day, available: (CARDIO_DAY ? [0, 1, 3, 5] : TRAIN_TODAY ? [1, 3, 4, 5] : [1, 2, 4, 5]).includes(i) })),
  ...(CARDIO_DAY ? { cardio_days_per_week: 2 } : {}),
  weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [], exercise_exclusions: [],
  macro_calculation_mode: 'STANDARD_STATIC', coaching_persona: 'supportive', recovery_capacity: 'moderate',
  conditioning_preference: NO_CARDIO ? 'avoid' : 'tolerate', created_at: created,
  bmr: 1800, tdee: 2500, calorie_target: 2700, protein_g: 160, carbs_g: 320, fat_g: 80,
  ...(SETUP_TYPO ? { weight_kg: 187 } : {}),
}

// The plan the app's own generator makes for this profile, seeded so a re-run is comparable.
setRandomSource(seededRngFromKey('app-boot'))
const weeks = generateMesocycle(profileRow as unknown as UserProfile)

// ?testing-day-unfinished: last week was the plan's testing week, and on its Thursday he lifted the day's first loaded
// lift 20 kg over the printed guess and never tapped Finish (INPUTS: the date, the lift by its place in that day, what
// he lifted; a session row left open, as the six-hour window leaves one). The app decides what next week then reads.
// &testing-day-used: those sets were already used once and the weight was brought down afterwards (an INPUT: the plan
// as an earlier anchor and a later correction left it, the stamp on week 1's slot and later weeks at the lower number).
const UNFINISHED_TESTING = new URLSearchParams(location.search).has('testing-day-unfinished')
const testingThursday = isoOf(new Date(new Date(created).getTime() + 3 * 86400000))
const testingLift = (() => {
  const d = weeks[0]?.days.find(x => x.day === 'Thursday')
  const i = d ? d.exercises.findIndex(e => e.suggested_load_kg != null && !!getExerciseEntry(e.name) && isExternallyLoaded(getExerciseEntry(e.name)!)) : -1
  // REPS FOR NEXT WEEK'S RANGE (24 Nov 2026): the testing week reads a set against the reps of the week it sets, so a
  // set that is to carry its weight across is done for the top of week 2's range (8 reps into a 10-12 week is worked
  // down through the reps, test:testing-week-both-ways). An INPUT: how many reps he did.
  const nextReps = weeks[1]?.days.find(x => x.day === 'Thursday')?.exercises[i]?.reps ?? d?.exercises[i]?.reps ?? ''
  const reps = Math.max(8, ...(String(nextReps).match(/\d+/g)?.map(Number) ?? []))
  return d && i >= 0 ? { index: i, name: d.exercises[i].name, printedKg: d.exercises[i].suggested_load_kg!, reps } : null
})()
;(window as unknown as Record<string, unknown>).__testingLift = testingLift
if (new URLSearchParams(location.search).has('testing-day-used') && testingLift) {
  const d = weeks[0].days.find(x => x.day === 'Thursday')!
  d.exercises[testingLift.index] = { ...d.exercises[testingLift.index], calibration_anchored_kg: testingLift.printedKg + 20 }
}
const testingSets = UNFINISHED_TESTING && testingLift ? [1, 2, 3].map(n => ({
  id: `tw${n}`, user_id: PROFILE_ID, session_id: 'ws-testing', exercise_id: getExerciseId(testingLift.name), exercise_name: testingLift.name,
  set_number: n, weight_kg: testingLift.printedKg + 20, reps_completed: testingLift.reps, is_bodyweight: false, is_warmup: false, drop_index: 0, unit: 'kg', rpe: null,
  completed_at: new Date(new Date(created).getTime() + 3 * 86400000 + 10 * 3600000 + n * 180000).toISOString(), date: testingThursday,
})) : []

const meal = (slot: string, idx: number, name: string, ingredients: { name: string; quantity: number; unit: string }[]) => {
  const m = computeMealMacros(ingredients)
  return {
    id: `pool-${slot}-${idx}`, profile_id: PROFILE_ID, slot, pool_index: idx, name, ingredients, tags: [], prep: '',
    macros: { kcal: Math.round(m.kcal), protein: Math.round(m.protein), carbs: Math.round(m.carbs), fat: Math.round(m.fat) },
  }
}

const db: Db = {
  fitness_profiles: FRESH_PHONE ? [] : [profileRow],
  mesocycle_weeks: PLAN_SUNDAY ? weeks.map(w => ({ ...toRow(PROFILE_ID, w), created_at: created })) : [], exercise_plans: [],
  meal_plan_slots: [
    meal('breakfast', 0, 'Porridge with berries', [{ name: 'dry oats', quantity: 90, unit: 'g' }, { name: 'whole milk', quantity: 300, unit: 'ml' }, { name: 'blueberries', quantity: 100, unit: 'g' }]),
    meal('lunch', 0, 'Chicken and rice', [{ name: 'raw chicken breast', quantity: 205, unit: 'g' }, { name: 'dry white rice', quantity: 90, unit: 'g' }]),
    meal('dinner', 0, 'Salmon and potatoes', [{ name: 'salmon', quantity: 170, unit: 'g' }, { name: 'raw potato', quantity: 350, unit: 'g' }]),
    meal('snack', 0, 'Yoghurt and banana', [{ name: 'greek yoghurt 0%', quantity: 170, unit: 'g' }, { name: 'banana', quantity: 120, unit: 'g' }]),
  ],
  // ?weigh-history: about four months of weigh-ins, most days, falling about 0.3 kg a week with day-to-day wobble, plus
  // one reading 9 kg off that the targets set aside (an INPUT; verify:weight-history reads the graph and week list).
  daily_metrics: WEIGH_HISTORY ? weighHistory() : SETUP_TYPO ? [
    { id: 'm1', profile_id: PROFILE_ID, date: isoOf(new Date(anchorNowMs())), weight_kg: 187 },
  ] : [
    { id: 'm1', profile_id: PROFILE_ID, date: isoOf(new Date(anchorNowMs() - 86400000)), weight_kg: WEIGH },
    { id: 'm2', profile_id: PROFILE_ID, date: isoOf(new Date(anchorNowMs() - 5 * 86400000)), weight_kg: 80.4 },
  ],
  daily_steps: [], water_logs: [], exercise_set_logs: testingSets,
  workout_sessions: testingSets.length ? [{ id: 'ws-testing', profile_id: PROFILE_ID, date: testingThursday, is_completed: false, felt: null }] : [],
  cardio_logs: HEART_HISTORY ? ([[42, 153], [35, 151], [21, 147], [14, 144], [7, 142], [1, 140]] as const).map(([ago, hr], i) => ({
    id: `jog${i}`, user_id: PROFILE_ID, date: heartDay(ago), activity_name: 'Easy jog', duration_minutes: 30, intensity_rpe: 4,
    avg_heart_rate: hr, max_heart_rate: hr + 18, completed_at: new Date(anchorNowMs() - ago * 86400000 - 3 * 3600000).toISOString(),
  })) : [],
  daily_resting_heart_rate: HEART_HISTORY ? [
    ...Array.from({ length: 14 }, (_, i) => ({ id: `r${i}`, profile_id: PROFILE_ID, date: heartDay(i + 4), bpm: 58, source: 'health_connect' })),
    ...([[2, 64], [1, 65], [0, 63]] as const).map(([ago, bpm]) => ({ id: `rr${ago}`, profile_id: PROFILE_ID, date: heartDay(ago), bpm, source: 'health_connect' })),
  ] : [],
  meal_events: [], meal_plan_picks: [], favorite_meals: [],
  // ?list-stale: tomorrow is on the shopping list, built from a dinner the day no longer serves (an INPUT: a row as the
  // list writes it, his live test of 14 Nov 2026, a dinner since marked as eating out). verify:live-test-nov14.
  grocery_items: new URLSearchParams(location.search).has('list-stale') ? [
    { id: 'g1', profile_id: PROFILE_ID, canonical_key: 'chicken thigh', display_name: 'Chicken thigh', quantity: 200, unit: 'g', category: 'meat_fish', source: 'generated', meal_refs: [{ day: 1, slot: 'dinner', mealName: "Hunter's chicken with potato wedges", date: isoOf(new Date(anchorNowMs() + 86400000)) }], checked: false, needs_review: false, client_id: null, created_at: new Date(anchorNowMs() - 3600000).toISOString(), dismissed: false, user_edited: false },
  ] : [],
  load_suggestions: [], pending_actions: [],
  plan_adaptations: [], user_facts: [], user_context_facts: [], user_goals: [],
  // ?chat-yesterday: a RETURNING conversation (an INPUT), one exchange yesterday, as every account past its first day
  // has. The coach's daily hello is for exactly this account (verify:coach-hello mounts the chat alone; this boots it
  // through App.tsx's own start).
  chat_messages: STALE_OFFER ? staleChat : new URLSearchParams(location.search).has('chat-yesterday') ? [
    { id: 'c1', profile_id: PROFILE_ID, role: 'user', content: 'How much protein should I eat?', status: 'complete', action_data: null, created_at: new Date(anchorNowMs() - 26 * 3600000).toISOString() },
    { id: 'c2', profile_id: PROFILE_ID, role: 'assistant', content: 'About 160g a day for you.', status: 'complete', action_data: null, created_at: new Date(anchorNowMs() - 26 * 3600000 + 5000).toISOString() },
  ] : [],
  // ?targets-moved: an earlier target snapshot with other numbers (an INPUT: a row as the app writes it), so the start
  // says his targets moved (verify:new-plan-carryover needs a person with that line, to show the next person never gets it).
  daily_nutrition_targets: SETUP_TYPO ? (() => {
    const t = computeTargets(profileRow as unknown as UserProfile)!
    return [{ id: 't0', profile_id: PROFILE_ID, date: isoOf(new Date(anchorNowMs())), workout_split: 'REST', target_calories: t.calories, target_protein_g: t.protein, target_carbs_g: t.carbs, target_fats_g: t.fat, calculated_bmr: 2400, calculated_tdee: 4000, calculated_weight_kg: 187 }]
  })() : new URLSearchParams(location.search).has('targets-moved') ? [
    { id: 't0', profile_id: PROFILE_ID, date: isoOf(new Date(anchorNowMs() - 3 * 86400000)), workout_split: 'REST', target_calories: 1900, target_protein_g: 150, target_carbs_g: 180, target_fats_g: 60, calculated_bmr: 1700, calculated_tdee: 2400, calculated_weight_kg: 84 },
  ] : [],
  workout_exercises: [], weight_basis_offers: [],
  // ?ignored3: the same evening message went unanswered three days running (an INPUT: the moment log as the app keeps it,
  // his strategy slice 1), so the coach should turn itself down a level (slice 2).
  coach_moment_log: new URLSearchParams(location.search).has('ignored3') ? [1, 2, 3].map(d => ({
    id: `ml${d}`, user_id: '00000000-0000-4000-8000-00000000b007', moment: 'protein_short', surface: 'phone', chat_message_id: null,
    sent_at: new Date(anchorNowMs() - d * 86400000 + 3600000).toISOString(), answered_at: null, answer: null,
  })) : [],
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
