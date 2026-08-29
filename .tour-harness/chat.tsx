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
import { StrictMode, useState } from 'react'
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
localStorage.setItem(`chat_history_cache_${PROFILE_ID}`, JSON.stringify(seeded))

const db: Db = {
  fitness_profiles: [{ ...profile, id: PROFILE_ID }],
  daily_metrics: [], exercise_set_logs: [], workout_sessions: [], cardio_logs: [],
  daily_steps: [], meal_events: [], meal_plan_picks: [], meal_plan_slots: [],
  favorite_meals: [], grocery_items: [], load_suggestions: [], pending_actions: [],
  plan_adaptations: [], user_facts: [], user_context_facts: [], user_goals: [],
  chat_messages: [], exercise_plans: [], mesocycle_weeks: [],
  daily_nutrition_targets: [], workout_exercises: [], weight_basis_offers: [],
}
setSupabaseClient(makeFakeSupabase(db) as never)

const noop = () => {}

function Harness() {
  const [, setTick] = useState(0)
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
              exercisePlan={mesocycle[0].days}
              mesocycle={mesocycle}
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
            />
          </div>
        </main>
        <BottomTabBar activeTab="chat" onTabChange={noop} />
      </div>
    </BottomDockHeightProvider>
    </TimersProvider>
    </ActiveSessionProvider>
    </AppearanceProvider>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>)
