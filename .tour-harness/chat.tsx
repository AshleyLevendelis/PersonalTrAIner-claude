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
import { StrictMode, useEffect, useState, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'

import { setSupabaseClient } from '@/lib/supabase'
import { makeFakeSupabase, type Db } from './fake-supabase'
import { generateMesocycle, setRandomSource, resetRandomSource } from '@/lib/exercise-plan'
import { seededRngFromKey } from '@/lib/seeded-random'
import { computeTargets } from '@/lib/nutrition-targets'
import { removeExerciseFromSession } from '@/lib/session-edit'
import { assessEdit } from '@/lib/edit-tradeoff'
import type { MacroTargets, Meal, MealPlanDay, UserProfile } from '@/lib/types'

import { BottomTabBar } from '@/components/BottomTabBar'
import { AppearanceProvider } from '@/hooks/useAppearance'
import { ActiveSessionProvider } from '@/hooks/useActiveSession'
import { TimersProvider } from '@/hooks/useTimers'
import { BottomDockHeightProvider } from '@/hooks/useBottomDockHeight'
import { setDevClockOverride } from '@/lib/dev-clock'
import { ANCHOR_ISO, anchorDate, anchorNowMs, iso as isoOf } from './anchor.mjs'
import '@/index.css'

window.addEventListener('error', e => { (window as never as Record<string, unknown>).__err = String(e.message) })

// LAZY, EXACTLY AS App.tsx LOADS IT — 14 Sep 2026. This file's whole premise
// is "the real ChatAssistant, in the real container App.tsx puts it in", and
// App.tsx now loads the coach as a separate chunk behind a Suspense boundary so
// it is off the first-paint path (Ashley's ruling; the first download was at
// its ceiling and the coach was the largest separable piece).
//
// Mirroring it here is not decoration: no harness page mounts App.tsx, so
// without this the lazy boundary would ship with NO browser coverage at all.
// With it, every chat driver — the opener, the shell, the swap, the race —
// exercises the coach arriving late, which is the only thing that could break.
const ChatAssistant = lazy(() =>
  import('@/components/ChatAssistant').then(m => ({ default: m.ChatAssistant })))

const PROFILE_ID = '00000000-0000-4000-8000-000000000001'

// PINNED BEFORE FIRST RENDER — see .tour-harness/anchor.mjs. One fixed
// "today" for every run, so a driver's day-name assertions stop depending on
// what day it is where the machine is.
setDevClockOverride(PROFILE_ID, ANCHOR_ISO)
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const todayIdx = anchorDate().getDay()

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
  const d = anchorDate(); d.setDate(d.getDate() + offsetDays)
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
  created_at: new Date(anchorNowMs() - 9 * 86400000).toISOString(),
} as UserProfile

setRandomSource(seededRngFromKey('chat-shell'))
const mesocycle = generateMesocycle(profile)
resetRandomSource()
const macros: MacroTargets | null = computeTargets(profile)

// A REAL DAY OF MEALS, for verify:meal-tradeoff (14 Sep 2026).
//
// The chat harness passed `mealPlan={[]}` since it was written, because no
// driver had ever needed one. With meals joining the trade-off step that stops
// being harmless: an empty day has zero protein, so EVERY meal change would
// look like it left somebody on nothing. The app guards that case (no day, no
// judgement) — which is exactly why the driver needs a real day to see
// anything at all.
//
// Built to land ON the profile's own targets, so a change AWAY from it is the
// only thing that moves the verdict, and the numbers are the app's own rather
// than three figures chosen to make a threshold fire.
const mealPlan: MealPlanDay[] = (() => {
  if (!macros) return []
  const share = [0.25, 0.35, 0.4]
  const names = ['Greek yoghurt and oats', 'Chicken and rice bowl', 'Salmon, potatoes and greens']
  // REAL INGREDIENT LINES, from the app's own food table. The food-edit
  // builders match a named food against these and then re-verify the whole
  // meal, so a meal with no ingredients can only ever produce "I can't find
  // that in your dinner" — a refusal, which is not the path under test.
  const lines = [
    ['greek yoghurt 0% 250g', 'oats 60g', 'blueberries 80g'],
    ['chicken breast 180g', 'white rice cooked 220g', 'broccoli 100g'],
    ['salmon 200g', 'potato boiled 250g', 'broccoli 120g'],
  ]
  return ['breakfast', 'lunch', 'dinner'].map((meal, i) => ({
    meal,
    items: [{
      name: names[i],
      calories: Math.round(macros.calories * share[i]),
      protein: Math.round(macros.protein * share[i]),
      carbs: Math.round(macros.carbs * share[i]),
      fat: Math.round(macros.fat * share[i]),
      ingredients: lines[i],
    } as unknown as Meal],
  }))
})()
;(window as unknown as { __mealDay: unknown }).__mealDay = { targets: macros, plan: mealPlan }

// WHICH LIFT A LOOSE REQUEST SHOULD RESOLVE TO — read off today's session,
// published for verify:swap-request, 14 Sep 2026.
//
// WHY. That driver stubbed the model saying `old_item: 'squats'` and then
// asserted the card named Squats. Its own comment claimed the plan was "read
// from the page so the assertions are about THIS run's plan" — via
// `window.__todayExercises`, which no page has ever published, so the read
// always came back null and the hard-coded name was the only thing in play.
// Once "today" stopped moving with the calendar, today's session was Upper
// Pull & Core and there were no squats on it, so the resolver correctly failed
// and the check called that a defect.
//
// THE PROPERTY IS FUZZY MATCHING, NOT SQUATS: a lift named the way a person
// says it, with no day given, resolves to the catalogue entry on today's plan.
// So pick a lift that IS on today, and degrade its name the way a person would
// — last word, lowercased — choosing one whose last word belongs to only one
// exercise in the day, so the resolver has a single right answer and the check
// is not really testing tie-breaking.
const swapTarget = (() => {
  const todayName = DAYS[todayIdx]
  const names = (mesocycle[0].days.find(d => d.day === todayName)?.exercises ?? []).map(e => e.name)
  // Whitespace only, never hyphens: "Chin-Ups" is how a person says it, and
  // splitting it further gives "ups", which nobody types.
  const loosely = (n: string) => n.trim().split(/\s+/).pop()!.toLowerCase()
  const unique = names.filter(n => loosely(n) !== n.toLowerCase()
    && names.filter(m => loosely(m) === loosely(n)).length === 1)
  const full = unique[0] ?? null
  return full ? { full, loose: loosely(full) } : null
})()
;(window as unknown as { __swapTarget: unknown }).__swapTarget = swapTarget

// A REPLACEMENT FROM A DIFFERENT DAY'S FOCUS — for verify:swap-request's cost
// section, added 14 Sep 2026 when the coach's swap card started stating what a
// swap costs the week.
//
// WHY IT HAS TO COME FROM ELSEWHERE: the card's cost sentence is the week's
// push:pull and chest:back balance moving. Swapping a lift for another on the
// SAME day is usually like-for-like and costs nothing, which is the correct
// answer and proves nothing about whether the card can report a cost at all. A
// lift off a differently-focused day is the one that moves the balance — so the
// driver can propose both and show the card DIFFERS, which is the only way to
// tell a real trial from a printed constant.
const crossPatternSwap = (() => {
  const todayName = DAYS[todayIdx]
  const week = mesocycle[0]
  const today = week.days.find(d => d.day === todayName)
  if (!today || today.exercises.length === 0) return null
  const otherDay = week.days.find(d => d.day !== todayName && d.focus !== today.focus && d.exercises.length > 0)
  if (!otherDay) return null
  return {
    from: today.exercises[0].name,
    to: otherDay.exercises[0].name,
    fromFocus: today.focus,
    toFocus: otherDay.focus,
  }
})()
;(window as unknown as { __crossPatternSwap: unknown }).__crossPatternSwap = crossPatternSwap

// A REMOVAL THAT COSTS A MUSCLE REAL WORK — for verify:tradeoff, 14 Sep 2026,
// when a change that works against the goal started being ASKED about rather
// than warned on.
//
// WHY IT IS COMPUTED HERE AND NOT NAMED IN THE DRIVER: the tier-2 rule is a
// lasting drop of 40% or more in one muscle group's weekly sets, and whether a
// given lift crosses that depends entirely on what else the generated week
// holds. A driver naming "Barbell Bench Press" would be asserting against a
// plan that may not contain it — the exact mistake __swapTarget's own comment
// records. So the page runs the real engine over the real week and publishes
// the lift that genuinely trips it, or null if none does, which is a finding
// the driver reports rather than a check it skips.
//
// TODAY FIRST, THEN ANY TRAINING DAY — and the second half is not a
// convenience. The first version searched today only and came back null every
// time, because the harness's fixed today (2026-09-16) is a WEDNESDAY and this
// profile trains Mon/Tue/Thu/Fri: it was looping over a rest day's empty
// exercise list. That is the same mistake __swapTarget's comment above
// records, made again three lines further down the same file.
const tradeoffRemoval = (() => {
  const todayName = DAYS[todayIdx]
  const week = mesocycle[0]
  const ordered = [
    ...week.days.filter(d => d.day === todayName),
    ...week.days.filter(d => d.day !== todayName),
  ].filter(d => d.exercises.length > 0)
  for (const day of ordered) {
    for (let i = 0; i < day.exercises.length; i++) {
      const name = day.exercises[i].name
      const trial = removeExerciseFromSession({
        mesocycle, profile, weekNumber: 1, dayName: day.day, exIndex: i, scope: 'permanent',
      })
      if (!trial.changed) continue
      const verdict = assessEdit({
        profile, before: mesocycle, after: trial.mesocycle, weekNumber: 1,
        dayName: day.day, kind: 'remove', scope: 'permanent', exerciseName: name,
      })
      if (verdict.tier === 2) return { name, day: day.day, reason: verdict.reason }
    }
  }
  return null
})()
;(window as unknown as { __tradeoffRemoval: unknown }).__tradeoffRemoval = tradeoffRemoval

// AND ONE THAT IS NOT GOAL-DAMAGING — for the reason ask, which is the whole
// of the rest of the change surface.
//
// Its sibling above finds a tier-2 removal, which asks its OWN question and
// therefore never reaches the reason ask (one question, not two). So a driver
// that only had that target could never see the reason chips at all — it would
// report green on a branch it had not entered, which is the exact failure the
// tradeoff driver exists to prevent for the tier-2 path.
//
// Same search, opposite test: the first removal the engine prices at tier 0 or
// 1. Published as null rather than falling back to anything, so a plan with no
// such removal is a finding the driver reports instead of a check it skips.
const cheapRemovals = (() => {
  const out: { name: string; day: string; tier: number }[] = []
  const todayName = DAYS[todayIdx]
  const week = mesocycle[0]
  const ordered = [
    ...week.days.filter(d => d.day === todayName),
    ...week.days.filter(d => d.day !== todayName),
  ].filter(d => d.exercises.length > 0)
  for (const day of ordered) {
    for (let i = 0; i < day.exercises.length; i++) {
      const name = day.exercises[i].name
      const trial = removeExerciseFromSession({
        mesocycle, profile, weekNumber: 1, dayName: day.day, exIndex: i, scope: 'permanent',
      })
      if (!trial.changed) continue
      const verdict = assessEdit({
        profile, before: mesocycle, after: trial.mesocycle, weekNumber: 1,
        dayName: day.day, kind: 'remove', scope: 'permanent', exerciseName: name,
      })
      if (verdict.tier !== 2) out.push({ name, day: day.day, tier: verdict.tier })
      if (out.length >= 2) return out
    }
  }
  return out
})()
;(window as unknown as { __cheapRemoval: unknown }).__cheapRemoval = cheapRemovals[0] ?? null
// TWO OF THEM, because the ask fires once per block per thing: proving that a
// request WITH a reason goes straight to a card needs a lift the first section
// has not already spent its one ask on.
;(window as unknown as { __cheapRemoval2: unknown }).__cheapRemoval2 = cheapRemovals[1] ?? null

// A NAME THAT MEANS ONE THING ACROSS THE WHOLE PLAN — for verify:coach-ban.
//
// A swap is scoped to a day, so a loose name unique within that day is enough.
// A BAN IS THE WHOLE PLAN, and "row" is three different lifts across sixteen
// weeks — the app correctly asks "did you mean...?" rather than banning one of
// them. So the ban driver needs its own target: a lift whose loose name matches
// nothing else anywhere. Publishing both also lets that driver prove the
// ambiguous case asks rather than guesses, using the swap target as the
// deliberately ambiguous one.
const banTarget = (() => {
  const all = [...new Set(mesocycle.flatMap(w => w.days.flatMap(d => d.exercises.map(e => e.name))))]
  const loosely = (n: string) => n.trim().split(/\s+/).pop()!.toLowerCase()
  // WORD SETS, NOT A REGEXP BUILT FROM A NAME. The first version compiled
  // `new RegExp('\\b' + lastWord + '\\b')` per exercise, which throws the moment
  // a catalogue name contains a regex metacharacter — and a throw here is at
  // module scope, so it took the whole page down silently and the driver saw
  // only a null target.
  const words = (n: string) => new Set(n.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))
  const unique = all.filter(n => {
    const l = loosely(n)
    return l !== n.toLowerCase() && all.filter(m => words(m).has(l)).length === 1
  })
  // A UNIQUE LAST WORD IF THE PLAN HAS ONE, otherwise the full name — which is
  // unique by construction. A plan can legitimately hold three Rows and two
  // Presses and no lift with a one-word handle of its own, and the ban path
  // still has to be drivable on such a plan.
  const full = unique[0] ?? all[0] ?? null
  if (!full) return null
  return { full, loose: unique.includes(full) ? loosely(full) : full }
})()
;(window as unknown as { __banTarget: unknown }).__banTarget = banTarget

// A NAME THAT MEANS SEVERAL THINGS ACROSS THE WHOLE PLAN — for verify:coach-ban's
// "asks which one" case. That case used the SWAP target, on the stated
// assumption that a name unique within one DAY is ambiguous across the PLAN.
// Nothing made that true; it held by coincidence ("row") until 23 Sep 2026,
// when new catalogue entries reshuffled the seeded plan and the probe became
// "circles" — one lift plan-wide, which the coach correctly banned, and the
// driver reported as a guess. Chosen now by the rule the ban path itself
// applies (ChatAssistant: a word-bounded match against every name on the plan,
// more than one is a question), so it is ambiguous by construction.
const banAmbiguous = (() => {
  const all = [...new Set(mesocycle.flatMap(w => w.days.flatMap(d => d.exercises.map(e => e.name))))]
  const words = (n: string) => new Set(n.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))
  const lastWords = [...new Set(all.map(n => n.trim().split(/\s+/).pop()!.toLowerCase()))]
    .filter(l => /^[a-z0-9]+$/.test(l))
  const loose = lastWords.find(l => all.filter(m => words(m).has(l)).length >= 2) ?? null
  return loose ? { loose, matches: all.filter(m => words(m).has(loose)) } : null
})()
;(window as unknown as { __banAmbiguous: unknown }).__banAmbiguous = banAmbiguous

// ...and the same on this page, for the other half of that comparison.
;(window as unknown as { __todayFocus: unknown }).__todayFocus =
  mesocycle[0].days.find(d => d.day === DAYS[todayIdx])?.focus ?? null

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
const todayStr = isoOf(anchorDate())
const OPENER_ROWS = Number(new URLSearchParams(location.search).get('rows') ?? '0')
const seededRows = (SEED_NUDGE || (OPENER && OPENER_ROWS > 0))
  ? (SEED_NUDGE ? seeded : seeded.slice(0, OPENER_ROWS)).map((m, i) => ({
      id: `seed-${i}`,
      profile_id: PROFILE_ID,
      role: m.role,
      content: m.content,
      status: 'complete',
      created_at: new Date(anchorNowMs() - (seeded.length - i) * 60_000).toISOString(),
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
            <Suspense fallback={<div>Loading the coach…</div>}>
            <ChatAssistant
              profile={profile}
              macros={macros}
              exercisePlan={livePlan}
              mesocycle={liveMeso}
              planCreatedAt={profile.created_at}
              mealPlan={mealPlan}
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
            </Suspense>
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
