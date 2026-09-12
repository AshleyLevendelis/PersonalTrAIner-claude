// ---------------------------------------------------------------------------
// THE REAL ChatAssistant, IN THE REAL CONTAINER App.tsx PUTS IT IN.
//
// WHY THIS EXISTS. The onboarding composer was measured dropping the phone
// keyboard on every send and scrolling an element that could not scroll. The
// same two defects were fixed in ChatAssistant BY PARITY — identical
// constructs, read directly — and could not be measured, because real.tsx's
// chat tab is a stub div reading "Chat — the tour's last stop points at the
// tab, not at content inside it." A fix nobody drove is a fix nobody has seen.
//
// THE WRAPPER IS COPIED VERBATIM AND THAT IS THE POINT. ChatAssistant's Card
// is `h-[600px] max-h-[80dvh]` while its composer is `position: fixed` to the
// VIEWPORT. Whether those two collide depends entirely on where the Card sits
// on screen, which is decided by App.tsx's `<main>` padding — so measuring
// this inside real.tsx's `max-w-md px-4 pb-40 pt-14` main (which differs from
// App.tsx's `max-w-6xl px-4 pt-12 pb-28`) would answer a question about the
// harness. That is the mistake this repo has already made twice today: a
// harness with no viewport meta reporting a composer at top: 2029px, and
// real.tsx measuring a goals panel it never passed a handler to.
//
// If App.tsx's wrapper changes, this diverges silently. `test:chat-shell`
// is what holds the two together.
// ---------------------------------------------------------------------------
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { setSupabaseClient } from '@/lib/supabase'
import { makeFakeSupabase, type Db } from './fake-supabase'
import { generateMesocycle, setRandomSource, resetRandomSource } from '@/lib/exercise-plan'
import { seededRngFromKey } from '@/lib/seeded-random'
import { computeTargets } from '@/lib/nutrition-targets'
import type { UserProfile, MacroTargets } from '@/lib/types'

import { ChatAssistant } from '@/components/ChatAssistant'
import { BottomTabBar } from '@/components/BottomTabBar'
import { AppearanceProvider } from '@/hooks/useAppearance'
import { ActiveSessionProvider } from '@/hooks/useActiveSession'
import { TimersProvider } from '@/hooks/useTimers'
import { BottomDockHeightProvider } from '@/hooks/useBottomDockHeight'
import '@/index.css'

window.addEventListener('error', e => { (window as never as Record<string, unknown>).__err = String(e.message) })

const PROFILE_ID = '00000000-0000-4000-8000-000000000001'
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const todayIdx = new Date().getDay()

// ?movedin=1 — HER SITUATION, 9 Sep 2026: yesterday's session was moved onto
// today, and today is not a training day of its own. That second half is why
// the existing ?moved=1 fixture in real.tsx never caught this — it puts the
// move's ORIGIN on today, which is the case that always worked. So the
// training days shift by one: the day it came FROM trains, the day it landed
// on does not.
const MOVED_IN = new URLSearchParams(location.search).get('movedin') === '1'
// ?movedaway=1 — THE OTHER END, and Ashley's 12 Sep case: TODAY is a training
// day and its session has been moved to tomorrow. The point of the fixture is
// what the coach is TOLD, not what is drawn: the payload used to carry a
// (TODAY) row with the full session on it while the header said the session
// had left.
const MOVED_AWAY = new URLSearchParams(location.search).get('movedaway') === '1'
const availableIdx = new Set(MOVED_IN
  ? [(todayIdx + 6) % 7, (todayIdx + 2) % 7, (todayIdx + 4) % 7, (todayIdx + 5) % 7]
  : [todayIdx, (todayIdx + 2) % 7, (todayIdx + 4) % 7, (todayIdx + 5) % 7])
const iso = (offsetDays: number) => {
  const d = new Date(); d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
  created_at: new Date(Date.now() - 9 * 86400000).toISOString(),
} as UserProfile

setRandomSource(seededRngFromKey('chat-shell'))
const mesocycle = generateMesocycle(profile)
resetRandomSource()
const macros: MacroTargets | null = computeTargets(profile)

// A conversation long enough to overflow the card, seeded through the SAME
// cache the real chat restores from — an empty thread cannot show whether the
// newest message is reachable, which is the whole question.
const seeded = Array.from({ length: 14 }, (_, i) => ({
  role: i % 2 === 0 ? 'assistant' : 'user',
  content: i % 2 === 0
    ? `Coach line ${i / 2 + 1}. Long enough to wrap onto more than one line so the thread actually overflows the card the way a real conversation does.`
    : `User line ${(i + 1) / 2}.`,
}))
// KEY AND SHAPE BOTH MATTER, and my first attempt got both wrong: the real
// key is `chat_history_cache_<profileId>` (chat-cache.ts's CHAT_CACHE_PREFIX)
// and the value is a BARE ARRAY, not { messages, savedAt }. With the wrong
// key the chat restored nothing and the harness measured an EMPTY thread —
// which would have reported a scroller that "doesn't need to scroll" as if
// that were a finding about the app.
// ?seed=opener — THE FIRST BUBBLE, ON A COLD LOAD.
//
// The other two modes both hand ChatAssistant a conversation and a plan that
// are already there, which is exactly the situation the opener never runs in.
// This one starts with NO cached thread (so the synchronous greeting is what
// renders) and NO plan (so `exercisePlan`/`mesocycle` are the empty arrays
// App.tsx holds until its read resolves — App.tsx:111,138). ?planDelay=N then
// hands the plan over N ms later, which is the whole race in one knob.
const OPENER = new URLSearchParams(location.search).get('seed') === 'opener'
const PLAN_DELAY_MS = Number(new URLSearchParams(location.search).get('planDelay') ?? '0')
if (!OPENER) localStorage.setItem(`chat_history_cache_${PROFILE_ID}`, JSON.stringify(seeded))
else localStorage.removeItem(`chat_history_cache_${PROFILE_ID}`)

// ---------------------------------------------------------------------------
// ?seed=nudge — THE COACH SPEAKING FIRST INTO AN ONGOING THREAD.
//
// Off by default, so verify:chat-shell measures exactly what it measured
// before. On, it supplies the three facts coach-nudge.ts needs and that the
// default fixture deliberately lacks:
//
//   - chat_messages ROWS, not just the localStorage mirror. isFirstEverChat is
//     set from the row COUNT, and a nudge refuses to speak to someone who has
//     never had a conversation. An empty table reads as a brand-new account.
//   - a finished session with no `felt` — the event itself.
//   - the attention indicator wired to the tab bar, with the chat NOT on
//     screen, which is the situation the whole feature is for: she is
//     somewhere else in the app and the coach has something to say.
// ---------------------------------------------------------------------------
const SEED_NUDGE = new URLSearchParams(location.search).get('seed') === 'nudge'
const todayStr = new Date().toISOString().slice(0, 10)
const OPENER_ROWS = Number(new URLSearchParams(location.search).get('rows') ?? '0')
const seededRows = (SEED_NUDGE || (OPENER && OPENER_ROWS > 0))
  ? (SEED_NUDGE ? seeded : seeded.slice(0, OPENER_ROWS)).map((m, i) => ({
      id: `seed-${i}`,
      profile_id: PROFILE_ID,
      role: m.role,
      content: m.content,
      status: 'complete',
      created_at: new Date(Date.now() - (seeded.length - i) * 60_000).toISOString(),
    }))
  : []
// The one row that makes today a day a session ARRIVED on. Same shape as
// real.tsx's ?moved=1 row, pointed the other way: origin yesterday, target
// today. getSessionMovesInRange reads both ends, so a move whose origin sits
// outside the Mon-Sun window is still seen.
const movedInSession = MOVED_IN
  ? [{
      id: 'ws-movedin', profile_id: PROFILE_ID, date: iso(-1), is_completed: false,
      split_type: 'moved', duration_minutes: 0, moved_to_date: iso(0),
    }]
  : []
// Origin TODAY, target tomorrow — the mirror of the row above.
const movedAwaySession = MOVED_AWAY
  ? [{
      id: 'ws-movedaway', profile_id: PROFILE_ID, date: iso(0), is_completed: false,
      split_type: 'moved', duration_minutes: 0, moved_to_date: iso(1),
    }]
  : []
const finishedSession = SEED_NUDGE
  ? [{
      id: 'ws-today', profile_id: PROFILE_ID, date: todayStr,
      day: mesocycle[0].days.find(d => d.day === DAYS[todayIdx])?.focus ?? 'Session',
      is_completed: true, felt: null,
    }]
  : []

const db: Db = {
  fitness_profiles: [{ ...profile, id: PROFILE_ID }],
  daily_metrics: [], exercise_set_logs: [], workout_sessions: [...finishedSession, ...movedInSession, ...movedAwaySession], cardio_logs: [],
  daily_steps: [], meal_events: [], meal_plan_picks: [], meal_plan_slots: [],
  favorite_meals: [], grocery_items: [], load_suggestions: [], pending_actions: [],
  plan_adaptations: [], user_facts: [], user_context_facts: [], user_goals: [],
  chat_messages: seededRows, exercise_plans: [], mesocycle_weeks: [],
  daily_nutrition_targets: [], workout_exercises: [], weight_basis_offers: [],
}
setSupabaseClient(makeFakeSupabase(db) as never)
// The driver reads rows back to prove the nudge REACHED the database rather
// than only React state — a message that exists in neither survives a reload
// nor lights the chat button.
;(window as never as Record<string, unknown>).__fakeDb = db

const noop = () => {}

function Harness() {
  const [, setTick] = useState(0)
  const [chatAttention, setChatAttention] = useState(false)
  // App.tsx holds [] for both of these until its plan read resolves. In every
  // mode but ?seed=opener the harness skips that window entirely, which is
  // why the opener has never been driven here.
  const [planArrived, setPlanArrived] = useState(!OPENER)
  useEffect(() => {
    // The driver reads this rather than trusting a wall-clock sample: whether
    // the plan had arrived when a sentence rendered is the actual question,
    // and bundle parse time moves first paint around by hundreds of ms.
    ;(window as unknown as Record<string, unknown>).__planArrived = planArrived
    if (planArrived) return
    const t = setTimeout(() => setPlanArrived(true), PLAN_DELAY_MS)
    return () => clearTimeout(t)
  }, [planArrived])
  const livePlan = planArrived ? mesocycle[0].days : []
  const liveMeso = planArrived ? mesocycle : []
  return (
    <AppearanceProvider>
    <ActiveSessionProvider profileId={PROFILE_ID} planCreatedAt={profile.created_at} totalWeeks={mesocycle.length} refreshToken={0}>
    <TimersProvider profileId={PROFILE_ID}>
    <BottomDockHeightProvider>
      {/* VERBATIM from App.tsx: the outer shell and <main>. */}
      <div className="min-h-screen bg-background">
        <main className="max-w-6xl mx-auto px-4 pt-12 pb-28 space-y-6">
          <div className="space-y-6">
            <ChatAssistant
              profile={profile}
              macros={macros}
              exercisePlan={livePlan}
              mesocycle={liveMeso}
              planCreatedAt={profile.created_at}
              mealPlan={[]}
              exerciseExclusions={[]}
              latestWeightKg={80}
              onPlanUpdate={noop}
              onLogsUpdated={() => setTick(t => t + 1)}
              onWeightLogged={noop}
              onMesocycleUpdated={noop}
              onProfileChanged={noop}
              onMealSwapApplied={async () => true}
              onFindMoreMealOptions={async () => ({ added: [] })}
              memoryFacts={[]}
              memoryGoals={[]}
              memoryContextFacts={[]}
              onMemoryChanged={noop}
              groceryItems={[]}
              onAttentionChange={setChatAttention}
              chatVisible={!SEED_NUDGE}
            />
          </div>
        </main>
        <BottomTabBar activeTab={SEED_NUDGE ? 'dashboard' : 'chat'} onTabChange={noop} chatAttention={chatAttention && SEED_NUDGE} />
      </div>
    </BottomDockHeightProvider>
    </TimersProvider>
    </ActiveSessionProvider>
    </AppearanceProvider>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>)
