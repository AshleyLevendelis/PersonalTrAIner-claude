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
import { getPools, setMealPick } from '@/lib/meal-store'
import { persistResizedPools, type PoolOption } from '@/lib/meal-generation'
import { checkMealRefit } from '@/lib/meal-refit'
import { computeMealMacros } from '@/lib/food-db'
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
import { setDevClockOverride } from '@/lib/dev-clock'
import { formatRampSets } from '@/lib/session-derive'
import { getActiveMesocycleWeek } from '@/lib/calculations'
import { getExerciseId, EXERCISE_DATABASE, contraindicatedJoints, isIndicatedFor } from '@/lib/exercise-db'
import { ANCHOR_ISO, anchorDate, anchorNowMs, iso as isoOf, nearestAnchorDate } from './anchor.mjs'
import '@/index.css'

const PROFILE_ID = '00000000-0000-4000-8000-00000000t0ur'.replace('t0ur', '0001')

// PINNED BEFORE ANYTHING RENDERS — 14 Sep 2026. This is what makes a run
// repeatable: every `getAppNow` in the app reads this override, so "today" is
// the anchor rather than the machine's calendar. Proven necessary by running
// one driver under two timezones a day apart and getting 0 failures in one and
// 2 in the other, on identical code. Doing it HERE rather than in each driver
// means all 37 inherit it and none can forget.
//
// ?today=YYYY-MM-DD — THE ONE SANCTIONED WAY A DRIVER MOVES "TODAY", added
// 14 Sep 2026. Some screens only exist on a day that holds a particular kind
// of session: the warm-up ramp renders on TODAY'S card and only a loaded main
// lift has one, so a driver checking the ramp has to stand on such a day. It
// used to do that by writing the dev-clock key itself before navigation — which
// this file then silently overwrote the moment it ran, leaving three drivers
// pinning a day the app never adopted.
//
// The value a driver passes comes from `nearestAnchorDate` off a day this file
// PUBLISHED (see __rampTarget below), so it is still derived from the anchor and
// never from the machine's calendar — test:harness-clock §4 pins that.
//
// NOTE WHAT THIS DOES NOT MOVE: the plan's shape. `todayIdx` below stays on the
// anchor, so which weekdays train and what is on them is identical in every run.
// The parameter changes which of those days you are standing on, nothing else —
// otherwise pinning a day would reshape the week and move the day you were
// aiming at.
const TODAY_ISO = new URLSearchParams(location.search).get('today') ?? ANCHOR_ISO
setDevClockOverride(PROFILE_ID, TODAY_ISO)
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// TODAY MUST BE A TRAINING DAY or the tour legitimately drops its set stop
// (setStepSkipped) and the run proves nothing about the gated step. The four
// available days are relative to the weekday rather than hard-coded Mon-Thu,
// so the gate is still exercised wherever "today" falls. Still a realistic
// 4-day split, not "every day available".
//
// RELATIVE TO THE ANCHOR, NOT THE REAL WEEKDAY (14 Sep 2026). The intent above
// is unchanged and still holds — today is always a training day. What changed
// is that it is always the SAME training day, so the plan every driver reads
// stops being reshaped once a night.
const todayIdx = anchorDate().getDay()
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
// ?finisher=1 — A POST-SESSION FINISHER ON A TRAINING DAY, for verify:finisher.
//
// The default profile's conditioning lands on REST days, where TodayPanel
// shows the recovery card and FinisherRow is never rendered at all — so the
// row Ashley reported truncated (14 Sep 2026) could not appear here. Measured
// across four goal/preference pairs before picking this one: fat_loss with
// conditioning_preference 'enjoy' is where the generator actually puts a
// finisher after a session, rather than hand-seeding a row, which would have
// proved only that a string written here renders. Same reasoning as ?legcurl.
const FINISHER = new URLSearchParams(location.search).get('finisher') === '1'
// ?walker=1 — THE BEGINNER'S WALKING PLAN, the only plan the app generates
// whose days hold a prescribed ACTIVITY instead of exercises.
//
// This is the fixture the empty-card defect needed and never had: for weeks
// the generator filled in a walk — twenty minutes, an effort target, a reason
// — and every screen decided "is this a session?" by counting exercises, so
// the card fell through to a blank "log a walk or other activity" form. No
// driver could see it, because no harness profile produced a walking plan.
//
// The six fields below are exactly what isStartingOut reads (starting-out.ts)
// — a real profile the app would route this way, not a hand-seeded day.
const WALKER = new URLSearchParams(location.search).get('walker') === '1'

// ?planDelay=N — App.tsx holds exercisePlan/mesocycle at [] until its read
// resolves (App.tsx:111,138). Every other run of this harness hands them over
// before first paint, so the window in which Home has no plan has never been
// on screen here. 0 (the default) keeps that behaviour exactly.
const PLAN_DELAY_MS = Number(new URLSearchParams(location.search).get('planDelay') ?? '0')
export const STATED_DUMBBELL_KG = 24

const profile: UserProfile = {
  id: PROFILE_ID,
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80,
  activity_level: WALKER ? 'sedentary' : 'moderate',
  // A COHERENT MEAL SPLIT, added 17 Sep 2026 because its absence was visible.
  // Both were undefined, so computeSlotBudgets gave the snack slot no share of
  // the day — and the refit card listed three meals while the fourth kept its
  // old size. The app now SAYS so (meal-refit's residue line), and the harness
  // stops describing a profile that eats a snack it does not budget for.
  meals_per_day: 3, include_snacks: true,
  fitness_goal: FINISHER || WALKER ? 'fat_loss' : 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  ...(WALKER ? { start_preference: 'move_more' as const } : {}),
  // ?legcurl=1 — THE ONE-DUMBBELL LIFT, ON A REAL GENERATED PLAN.
  //
  // Dumbbell Leg Curl is not reachable at full_gym on an upper/lower split:
  // a machine leg curl wins the slot. A home-gym push/pull/legs profile is
  // where the generator actually chooses it — measured across three tiers,
  // three splits and three seeds before picking this one, rather than
  // hand-seeding a plan row, which would have proved only that a string I
  // wrote myself renders.
  equipment_access: WALKER ? 'bodyweight' : LEG_CURL ? 'home_gym' : 'full_gym', injuries: [],
  training_style: WALKER ? 'functional' : 'hybrid',
  training_experience: WALKER ? 'beginner' : 'intermediate', session_duration_preference: '45-60',
  workout_split_preference: LEG_CURL ? 'push_pull_legs' : 'upper_lower',
  training_days: DAYS.map((day, i) => ({ day, available: availableIdx.has(i) })),
  weekly_schedule: {}, dietary_preferences: new URLSearchParams(location.search).get('ate') === '1' ? ['nut-free'] : [], concurrent_activities: [],
  exercise_exclusions: [] as unknown as never, macro_calculation_mode: 'STANDARD_STATIC',
  coaching_persona: 'supportive', recovery_capacity: 'moderate', conditioning_preference: FINISHER ? 'enjoy' : 'tolerate',
  // NINE DAYS OLD, not today: a plan created today has no elapsed
  // scheduled days, so the consistency score correctly shows nothing and the
  // harness could never see it render.
  created_at: new Date(anchorNowMs() - 9 * 86400000).toISOString(),
  ...(ABSURD ? { max_dumbbell_kg: STATED_DUMBBELL_KG } : {}),
} as UserProfile

// ALWAYS FROM THE MESOCYCLE, never generateExercisePlan directly —
// render-screens.tsx records why: the base week has `tier` undefined, so a
// panel fed one shows a state no user can reach (a squat under an ACCESSORY
// label, no MAIN LIFT anywhere). Seeded so a re-run is comparable.
setRandomSource(seededRngFromKey('tour-real-screens'))
const generated = generateMesocycle(profile)
resetRandomSource()

// ?tilt=lopsided — A DELIBERATELY UNBALANCED WEEK, for one driver only.
//
// The sentences an edit shows before the tap ("that leaves your week
// push-heavy", "I'll also add a set of rows on Thursday to keep your week
// balanced") only appear when there is something to say, and a healthy
// generated plan never has anything to say. Without a way to tilt the
// fixture, the only honest browser check would be "the paragraph is absent",
// which is what it would also say if the feature were deleted.
//
// So: triple every set on the days OTHER than the first training day, which
// is what test:edit-keeps-the-bar §5 found actually forces the week-level
// balance pass to change a day the person did not edit. Off by default and
// reachable only from the query string, so no other driver sees it.
const tilt = new URLSearchParams(location.search).get('tilt')
const firstTrainingDay = generated[0].days.find(d => d.exercises.length > 0)?.day
const mesocycle = tilt !== 'lopsided' ? generated : generated.map(w => ({
  ...w,
  days: w.days.map(d => d.day === firstTrainingDay ? d
    : { ...d, exercises: d.exercises.map(e => ({ ...e, sets: e.sets * 3 })) }),
}))
const exercisePlan = mesocycle[0].days

// The date on which a given weekday falls inside PLAN WEEK 1 — the seven days
// from the plan's creation. getActiveMesocycleWeek floors elapsed days over 7,
// and getAppNow reads noon, so created_at's own date through +6 is week 1.
function planWeekOneDate(dayName: string): string {
  const start = new Date(profile.created_at as string)
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  for (let i = 0; i < 7; i++) {
    const d = new Date(startMidnight)
    d.setDate(d.getDate() + i)
    if (DAYS[d.getDay()] === dayName) return isoOf(d)
  }
  throw new Error(`planWeekOneDate: no ${dayName} in plan week 1`)
}

// WHICH DAY ACTUALLY HOLDS A RAMPED MAIN LIFT — read off the plan, published
// for the drivers, 14 Sep 2026.
//
// WHY. `ramp-ticks` and `calibration-search` each said, in a comment,
// "PIN TODAY TO A MONDAY … the bench press on Monday does" and then hunted for
// the literal string "Barbell Bench Press". That held only while the drivers'
// Monday and this file's training days were both derived from the same real
// weekday. Fixing the clock moved this file to the anchor and left the drivers
// computing a Monday, so they pinned a day the bench press had left — three
// drivers red for a reason that was never about the app.
//
// `formatRampSets` is the SCREEN'S OWN predicate (session-derive.ts:98) — the
// one ExerciseRow calls to decide whether to render the strip at all. Using it
// here means a driver cannot disagree with the screen about what "has a ramp"
// means; a day published here is a day the strip really renders on, or both
// are wrong together and the check fails honestly.
const rampTarget = (() => {
  const withRamp = exercisePlan
    .map(day => ({
      day: day.day,
      // kind === 'kg', not merely "has a ramp": both drivers read real weights
      // off the strip and the log grid beside it, so a bodyweight ramp would
      // satisfy the predicate and fail the checks. Named rather than assumed —
      // it does mean a bodyweight ramp is not covered by these two drivers.
      exercise: day.exercises.find(e => formatRampSets(e)?.kind === 'kg')?.name,
      // A LOADLESS ROW ON THE SAME DAY. calibration-search §12-14 needs one to
      // prove the search's "type it" default does not leak onto a lift nobody
      // loads; it used to name "Scapular Push-Ups", the same mechanism-pin.
      bodyweight: day.exercises.find(e => e.suggested_load_kg == null)?.name ?? null,
    }))
    .filter((d): d is { day: string; exercise: string; bodyweight: string | null } => !!d.exercise)
    // TWO DATES FOR THE SAME DAY, because two drivers want different weeks of
    // the same session. `date` is the occurrence nearest the anchor — what a
    // driver wants when it only cares that the day trains. `calibrationDate` is
    // the occurrence inside PLAN WEEK 1, which is the calibration week: the
    // probe line, the START HERE label and the next-weight chips exist only
    // there, and the fixture's plan is nine days old, so the anchor sits in
    // week 2 and the nearest occurrence would show none of them.
    //
    // This is the second half of the same bug. verify:calibration-search used
    // to pin "the Monday of the current week", which landed in week 1 or week 2
    // depending on which weekday the machine woke up on — so it too was green
    // or red by calendar rather than by code.
    .map(d => ({ ...d, date: nearestAnchorDate(d.day), calibrationDate: planWeekOneDate(d.day) }))
  if (withRamp.length === 0) return null
  // Nearest the anchor, ties to the earlier day — so the pin stays within a
  // couple of days of the seeded history and does not depend on plan order.
  const anchorMs = anchorDate().getTime()
  return withRamp.reduce((best, d) => {
    const dist = (x: { date: string }) => Math.abs(new Date(`${x.date}T12:00:00`).getTime() - anchorMs)
    if (dist(d) < dist(best)) return d
    if (dist(d) > dist(best)) return best
    return d.date < best.date ? d : best
  })
})()
;(window as unknown as { __rampTarget: unknown }).__rampTarget = rampTarget

// THE CATALOGUE'S JOINT TAGS, for verify:hurts — so it can ask "does anything
// left in this day still load the sore shoulder?" against the app's own data
// rather than a list written in the driver, which would go stale the first
// time an exercise was retagged. A projection of three fields per entry, not
// five thousand whole objects.
;(window as unknown as { __jointTags: unknown }).__jointTags = EXERCISE_DATABASE.map(e => ({
  name: e.name,
  unsafeFor: contraindicatedJoints(e),
  // isIndicatedFor takes a SET of flagged joints, not one joint — passing a
  // string threw at module scope and took the whole page down silently, which
  // is the mistake __swapTarget's own comment in chat.tsx already records.
  indicatedFor: ['shoulder', 'knee', 'hip', 'lower_back_axial', 'neck', 'wrist', 'elbow', 'ankle']
    .filter(j => isIndicatedFor(e, new Set([j]))),
}))

// ?logged=1 — A REAL PRIOR SESSION ON TODAY'S LIFT, lighter than the plan.
//
// Ashley, 14 Sep 2026, from a gym floor: "the main header prominently displays
// 40kg, but the pre-filled numbers in the set input rows show 35kg." Today's
// card asks the progression engine what the last logged session earned, and
// used that answer for the chip's LABEL and the note underneath while the
// figure between them stayed the one generation printed weeks earlier.
//
// No source check could see it — the line the gate grepped for was present and
// flipping a label — so the proof has to be a real screen with a real log
// behind it. This seeds exactly the shape she hit: a session two days ago,
// BELOW the plan's number, with reps short of the top of the range, so double
// progression HOLDS at what was lifted rather than adding to it.
//
// The lift is read off the live week rather than named, for the same reason
// rampTarget is: naming one pins a weekday and a string, and both have moved
// before. Ramped by preference — the per-set chips are a third view of the
// same number and the place a flattened or unscaled ramp would show up.
// ?bwpr=1 — a bodyweight history and nothing else new. Off by default so
// every existing run of this harness is unchanged. It exists because the
// defect it covers is invisible to a source check AND to the data: the rows
// were always there, and six separate filters meant no pixel ever showed
// them. A person training at home saw an empty graph and no personal best.
const BWPR = new URLSearchParams(location.search).get('bwpr') === '1'
const LOGGED = new URLSearchParams(location.search).get('logged') === '1'
const loggedTarget = (() => {
  if (!LOGGED) return null
  const liveWeekNo = getActiveMesocycleWeek(profile.created_at as string, anchorDate(), mesocycle.length)
  const day = mesocycle.find(w => w.week_number === liveWeekNo)?.days.find(d => d.day === DAYS[todayIdx])
  if (!day) return null
  const loaded = day.exercises.filter(e => (e.suggested_load_kg ?? 0) > 10)
  const ex = loaded.find(e => formatRampSets(e)?.kind === 'kg') ?? loaded[0]
  if (!ex) return null
  // Clearly below the plan's figure and clearly loadable: two plate pairs
  // down, which no rounding can land back on the plan's number.
  const liftedKg = Math.max(5, (ex.suggested_load_kg as number) - 5)
  return { name: ex.name, planKg: ex.suggested_load_kg as number, liftedKg, sets: ex.sets }
})()
;(window as unknown as { __loggedTarget: unknown }).__loggedTarget = loggedTarget

// WHICH DAY CARRIES A FINISHER, and what the plan says it is — published for
// verify:finisher, 14 Sep 2026. Same rule as rampTarget above: the driver asks
// the page rather than naming a weekday and an activity string, both of which
// have moved before. The longest one on offer, because the defect it guards is
// a row that cut its own text off and the longest string is where that shows.
;(window as unknown as { __finisherTarget: unknown }).__finisherTarget = (() => {
  // TRAINING DAYS ONLY. FinisherRow renders inside TodayPanel's workout branch;
  // a rest day shows the recovery card instead, so publishing one from there
  // sends the driver to a screen that never had the row on it. Found by doing
  // exactly that on the first run.
  //
  // AND FROM THE LIVE WEEK, NOT WEEK 1. The fixture's plan is nine days old, so
  // the screen renders week 2 — where the duration has already progressed
  // (18m in week 1, 20m on screen). Publishing week 1's number made the driver
  // argue with the app about a figure both had right. Same trap
  // calibrationDate above exists for.
  const liveWeekForFinisher = getActiveMesocycleWeek(profile.created_at as string, anchorDate(), mesocycle.length)
  const liveDays = mesocycle.find(w => w.week_number === liveWeekForFinisher)?.days ?? exercisePlan
  const withFinisher = liveDays
    .filter(d => d.exercises.length > 0 && !!d.recommendedCardio)
    .map(d => ({ day: d.day, date: nearestAnchorDate(d.day), activity: d.recommendedCardio!.activity, duration: d.recommendedCardio!.duration, rpe: d.recommendedCardio!.targetRpe }))
  if (withFinisher.length === 0) return null
  return withFinisher.reduce((best, d) => (d.activity.length > best.activity.length ? d : best))
})()

// THE LIVE WEEK'S PRESCRIBED ACTIVITY — published for verify:planned-activity.
//
// Same rule as the two targets above: the driver asks the page what the plan
// says rather than naming a weekday and a number, both of which move. FROM THE
// LIVE WEEK for the reason recorded above — the fixture's plan is nine days old
// so week 2 is on screen, and the walk's minutes step per BLOCK, so a driver
// reading week 1 would argue with the app about a figure both had right.
// Null for every profile but ?walker=1, which is what makes the driver's own
// "the fixture really is a walking plan" check able to fail.
;(window as unknown as { __walkTarget: unknown }).__walkTarget = (() => {
  const liveWeekForWalk = getActiveMesocycleWeek(profile.created_at as string, anchorDate(), mesocycle.length)
  const liveDays = mesocycle.find(w => w.week_number === liveWeekForWalk)?.days ?? exercisePlan
  const today = liveDays.find(d => d.day === DAYS[anchorDate().getDay()])
  const anyDay = liveDays.find(d => d.plannedActivity)
  const pick = today?.plannedActivity ? today : anyDay
  if (!pick?.plannedActivity) return null
  return {
    day: pick.day,
    date: nearestAnchorDate(pick.day),
    isToday: pick.day === DAYS[anchorDate().getDay()],
    exercises: pick.exercises.length,
    ...pick.plannedActivity,
  }
})()

// A REST DAY IN THE LIVE WEEK — published for verify:cardio-session, 15 Sep
// 2026. The screen control that makes a day a cardio day lives on the rest-day
// card, so the driver needs a day that HAS one. Asked of the page rather than
// named, for the reason the two targets above record: weekday names move.
;(window as unknown as { __restDayTarget: unknown }).__restDayTarget = (() => {
  const liveWeekForRest = getActiveMesocycleWeek(profile.created_at as string, anchorDate(), mesocycle.length)
  const liveDays = mesocycle.find(w => w.week_number === liveWeekForRest)?.days ?? exercisePlan
  const rest = liveDays.find(d => d.exercises.length === 0 && !d.plannedActivity)
  if (!rest) return null
  return { day: rest.day, date: nearestAnchorDate(rest.day) }
})()

// TODAY'S FOCUS, from THIS page's plan — for verify:rest-day-race, 14 Sep 2026.
// Its last check compared the coach's first bubble with Home's session name,
// but read the coach off chat.html and Home off real.html: two harness pages,
// two separately generated plans, so the same weekday holds a different
// session and the comparison could only ever pass by coincidence. Each page
// now names its own, and the check asks each surface to agree with the plan it
// is actually rendering.
;(window as unknown as { __todayFocus: unknown }).__todayFocus =
  exercisePlan.find(d => d.day === DAYS[anchorDate().getDay()])?.focus ?? null
const macros: MacroTargets | null = computeTargets(profile)

// ?refit=1&drift=N — A DAY WHOSE TARGET HAS MOVED AWAY FROM ITS MEALS.
//
// ITS OWN MEALS AND ITS OWN TARGET, and both halves of that are measured
// rather than chosen to look right.
//
// The three meals this harness has always carried cannot serve here, and
// finding out why is the useful part: their macros are hand-written
// (480/720/780 kcal) while their INGREDIENT LIST is the same 180g chicken and
// 120g rice, which food-db prices at 442 kcal. checkMealRefit scales the
// ingredients and then recomputes from the food database — deliberately, so a
// card never states a number the food will not deliver — so on that fixture
// the "after" bears no relation to the "before" and the day cannot be made to
// fit at ANY factor. Measured: at drift 1.0, 1.15, 1.35 and 0.8, needed=false
// every time. A driver written against it would have proved nothing and passed
// its no-offer checks vacuously.
//
// So the refit run gets four meals whose stated macros ARE their ingredients'
// macros, and a target derived from the day itself, so drift=1 fits exactly by
// construction. Measured across seven factors before these two were picked:
// 1.0 fits and offers nothing; 1.5 and above no longer fits and the resize
// lands it back inside tolerance. Everything between 1.0 and 1.35 is absorbed
// silently by assembleDay, which is Ashley's anti-nag ruling working and is
// the reason the drifted run uses 1.6.
const REFIT = new URLSearchParams(location.search).get('refit') === '1'
const DRIFT = Number(new URLSearchParams(location.search).get('drift') ?? '1')
const priced = (slot: string, name: string, ingredients: { name: string; quantity: number; unit: string }[]) => {
  const m = computeMealMacros(ingredients)
  return {
    slot, name, ingredients, tags: [] as string[],
    macros: { calories: Math.round(m.kcal), protein: Math.round(m.protein), carbs: Math.round(m.carbs), fat: Math.round(m.fat) },
  }
}
const refitChosen = {
  breakfast: priced('breakfast', 'Porridge with milk', [{ name: 'oats', quantity: 80, unit: 'g' }, { name: 'milk', quantity: 250, unit: 'ml' }]),
  lunch: priced('lunch', 'Chicken and rice', [{ name: 'chicken breast', quantity: 150, unit: 'g' }, { name: 'white rice', quantity: 150, unit: 'g' }]),
  dinner: priced('dinner', 'Salmon and potatoes', [{ name: 'salmon', quantity: 150, unit: 'g' }, { name: 'potato', quantity: 250, unit: 'g' }]),
  snack: priced('snack', 'Yoghurt and banana', [{ name: 'greek yoghurt', quantity: 170, unit: 'g' }, { name: 'banana', quantity: 120, unit: 'g' }]),
}
const refitBase = (['breakfast', 'lunch', 'dinner', 'snack'] as const).reduce(
  (a, sl) => ({
    calories: a.calories + refitChosen[sl].macros.calories, protein: a.protein + refitChosen[sl].macros.protein,
    carbs: a.carbs + refitChosen[sl].macros.carbs, fat: a.fat + refitChosen[sl].macros.fat,
  }),
  { calories: 0, protein: 0, carbs: 0, fat: 0 },
)
const driftedMacros: MacroTargets | null = REFIT
  ? {
    calories: Math.round(refitBase.calories * DRIFT),
    protein: Math.round(refitBase.protein * DRIFT),
    carbs: Math.round(refitBase.carbs * DRIFT),
    fat: Math.round(refitBase.fat * DRIFT),
  }
  : macros

const today = isoOf(anchorDate())
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
  exercise_set_logs: [
    ...[1].map((back, i) => ({
      id: `l${i}`, user_id: PROFILE_ID, exercise_name: 'Barbell Squats', set_number: 1,
      weight_kg: 60, reps_completed: 8, is_bodyweight: false, is_warmup: false,
      completed_at: new Date(anchorNowMs() - (back + 1) * 86400000).toISOString(),
      date: isoOf(new Date(anchorNowMs() - (back + 1) * 86400000)),
    })),
    // ?logged=1 (above). session_id and exercise_id are both required here and
    // are not on the row beside it: getLastSessionSets filters on exercise_id
    // and groups by session_id, while the consistency read that row serves
    // uses neither. A row missing them reads as "nothing logged" — which looks
    // exactly like the fixture working and the feature being absent.
    // PULL-UPS, not some other bodyweight movement, and the choice is the
    // point: this fixture's today session has Pull-Ups as its MAIN LIFT, so
    // the exercise detail — and the graph that was permanently empty — is
    // reachable by tapping a row a person would actually tap. A history
    // seeded against an exercise not in the plan leaves the graph verifiable
    // only in theory.
    // Getting better over three weeks, the newest inside the 7-day window
    // Home's "Recent PRs" filters on. Rising 8 -> 11 -> 14 so the best is
    // unambiguous and the graph has a direction to draw.
    // Plus one belt session on Dips, because "once a belt goes on, added
    // weight is the record" is a separate rendering (+kg, not reps) and a
    // check that only ever sees reps would pass with that branch deleted.
    ...(BWPR
      ? [
          ...[20, 13, 2].map((back, i) => ({
            id: `bw${i}`, user_id: PROFILE_ID, session_id: `bw-sess-${i}`,
            exercise_id: getExerciseId('Pull-Ups') ?? 'pull-ups', exercise_name: 'Pull-Ups',
            set_number: 1, weight_kg: 0, reps_completed: [8, 11, 14][i],
            is_bodyweight: true, is_warmup: false,
            completed_at: new Date(anchorNowMs() - back * 86400000).toISOString(),
            date: isoOf(new Date(anchorNowMs() - back * 86400000)),
          })),
          {
            id: 'bwbelt', user_id: PROFILE_ID, session_id: 'bw-sess-belt',
            exercise_id: getExerciseId('Dips') ?? 'dips', exercise_name: 'Dips',
            set_number: 1, weight_kg: 0, reps_completed: 5, added_load_kg: 12,
            is_bodyweight: true, is_warmup: false,
            completed_at: new Date(anchorNowMs() - 3 * 86400000).toISOString(),
            date: isoOf(new Date(anchorNowMs() - 3 * 86400000)),
          },
        ]
      : []),
    ...(loggedTarget
      ? Array.from({ length: Math.min(3, loggedTarget.sets) }, (_, i) => ({
          id: `lg${i}`, user_id: PROFILE_ID, session_id: 'sess-logged',
          exercise_id: getExerciseId(loggedTarget.name), exercise_name: loggedTarget.name,
          set_number: i + 1, weight_kg: loggedTarget.liftedKg,
          // ONE rep, so "hit the top of the range on every set" cannot be true
          // whatever the range is — the hold branch, deterministically.
          reps_completed: 1, is_bodyweight: false, is_warmup: false,
          completed_at: new Date(anchorNowMs() - 2 * 86400000).toISOString(),
          date: isoOf(new Date(anchorNowMs() - 2 * 86400000)),
        }))
      : []),
  ],
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
        moved_to_date: isoOf(new Date(anchorNowMs() + 86400000)),
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
          source: 'manual', client_id: 'seed-breakfast', created_at: anchorDate().toISOString() },
        // Eaten under a name the plan has since moved away from — the
        // name-preservation case. 610, deliberately not the pick's 720.
        { id: 'me2', profile_id: PROFILE_ID, date: today, slot: 'lunch', event_type: 'confirmed',
          meal_name: 'Leftover chilli and rice', macros: { kcal: 610, protein: 40, carbs: 70, fat: 15 },
          source: 'manual', client_id: 'seed-lunch', created_at: anchorDate().toISOString() },
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
    status: 'running', startedAtIso: anchorDate().toISOString(), lastActivityIso: anchorDate().toISOString(),
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
const chosen = (REFIT ? refitChosen : {
  breakfast: ATE ? nuttyBreakfast : meal('breakfast', 'Greek yoghurt, berries and honey', 480),
  lunch: meal('lunch', 'Chicken, rice and roasted peppers', 720),
  dinner: meal('dinner', 'Salmon, new potatoes and green beans', 780),
}) as never
const pools = (REFIT
  ? { breakfast: [refitChosen.breakfast], lunch: [refitChosen.lunch], dinner: [refitChosen.dinner], snack: [refitChosen.snack] }
  : { breakfast: [(chosen as never as Record<string, unknown>).breakfast], lunch: [(chosen as never as Record<string, unknown>).lunch], dinner: [(chosen as never as Record<string, unknown>).dinner] }) as never

/**
 * SEED THE FAKE POOL TABLE TOO, not just the props.
 *
 * The three meals above were passed straight into NutritionDisplay and never
 * existed as rows, which was fine while the screen only ever READ them. It
 * stopped being fine when an ingredient became editable: the edit inserts a
 * new option beside the ones already in the slot and then picks it, and both
 * halves go through meal-store against this database. A screen whose meals
 * live only in a prop cannot be edited by the code that ships.
 */
for (const [slot, option] of Object.entries(chosen as Record<string, { name: string; ingredients: { name: string; quantity: number; unit: string }[]; macros: { calories: number; protein: number; carbs: number; fat: number } }>)) {
  db.meal_plan_slots.push({
    profile_id: PROFILE_ID, slot, pool_index: 0, name: option.name,
    ingredients: option.ingredients,
    macros: { kcal: option.macros.calories, protein: option.macros.protein, carbs: option.macros.carbs, fat: option.macros.fat },
    tags: [],
  })
}

function Harness() {
  const { route } = useAppRoute()
  // WHAT THE SCREEN IS SHOWING RIGHT NOW, so an edit can move it. App.tsx
  // holds the same two pieces of state and updates them in the same order:
  // persist the pick, re-read the pool, then move what is on screen.
  const [liveChosen, setLiveChosen] = useState(chosen as Record<string, PoolOption>)
  const [livePools, setLivePools] = useState(pools as Record<string, PoolOption[]>)
  const handleMealPickApplied = async (slot: string, chosenName: string) => {
    try { await setMealPick(PROFILE_ID, today, slot as never, chosenName) } catch { return false }
    const fresh = await getPools(PROFILE_ID)
    const option = (fresh[slot as never] as PoolOption[] | undefined)?.find(o => o.name === chosenName)
    if (!option) return false
    setLivePools(prev => ({ ...prev, [slot]: (fresh[slot as never] as PoolOption[] | undefined) ?? prev[slot] }))
    setLiveChosen(prev => ({ ...prev, [slot]: option }))
    return true
  }
  // THE DRIFT OFFER, computed by the APP'S OWN ENGINE and not by this file.
  // The harness supplies the inputs App supplies (pools, targets, pins) and
  // renders the real NutritionDisplay with the real verdict; the confirm runs
  // the real persistResizedPools against the fake database and re-reads, in
  // App's own order. WHAT THIS CANNOT PROVE, written next to it so no reader
  // mistakes it: whether App.tsx's own gating decides to show the offer. No
  // harness page boots App.tsx. test:meal-refit §9 holds that half.
  const refit = driftedMacros
    ? checkMealRefit(livePools as never, driftedMacros, {
      mealsPerDay: profile.meals_per_day, includeSnacks: profile.include_snacks,
    })
    : null
  const [refitError, setRefitError] = useState<string | null>(null)
  const [refitDeclined, setRefitDeclined] = useState(false)
  const handleRefitConfirm = async () => {
    if (!refit) return null
    const result = await persistResizedPools(PROFILE_ID, refit.pools as never)
    const fresh = await getPools(PROFILE_ID)
    setLivePools(prev => ({ ...prev, ...(fresh as Record<string, PoolOption[]>) }))
    setLiveChosen(prev => {
      const next = { ...prev }
      for (const [slot, options] of Object.entries(fresh as Record<string, PoolOption[]>)) {
        const same = options.find(o => o.name === prev[slot]?.name)
        if (same) next[slot] = same
      }
      return next
    })
    if (result.updated === 0) setRefitError("I couldn't resize your meals. They're exactly as they were — try again in a moment.")
    return result
  }

  const liveTotals = (['breakfast', 'lunch', 'dinner', 'snack'] as const).reduce(
    (acc, sl) => {
      const m = liveChosen[sl]?.macros
      return m ? { calories: acc.calories + m.calories, protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fat: acc.fat + m.fat } : acc
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
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

  // THE LIVE SESSION'S TIERS, published for verify:exercise-add, 14 Sep 2026.
  //
  // WHY. Its check 4c said "it was not simply appended to the end", which is a
  // proxy: the real rule, named in that driver's own header, is that the add
  // lands IN TIER ORDER. An exercise whose tier genuinely belongs last — a core
  // or isolation lift — lands last correctly, and the proxy called that a
  // defect. Tier is not on the screen at the rank level (the row says
  // "Accessory", not tier_3_isolation), and the added lift is not in this
  // file's module-scope plan, so it has to come off the LIVE mesocycle.
  useEffect(() => {
    // THE WEEK THE SCREEN IS SHOWING, not week 1. The fixture's plan is nine
    // days old, so the live week is 2 — publishing week 1 gave a list the added
    // exercise was correctly absent from.
    const liveWeekNo = getActiveMesocycleWeek(profile.created_at as string, new Date(TODAY_ISO + 'T12:00:00'), editedMeso.length)
    const day = editedMeso.find(w => w.week_number === liveWeekNo)?.days.find(d => d.day === DAYS[new Date(TODAY_ISO + 'T12:00:00').getDay()])
    ;(window as unknown as { __liveToday: unknown }).__liveToday =
      (day?.exercises ?? []).map(e => ({ name: e.name, tier: e.tier ?? null, superset: e.superset_label ?? null }))
  }, [editedMeso])
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
          <NutritionDisplay profile={profile} macros={driftedMacros} exercisePlan={exercisePlan}
            latestWeightKg={80} profileId={PROFILE_ID} date={today}
            pools={livePools as never} chosen={liveChosen as never} mealTotals={liveTotals}
            isGeneratingMeals={false} mealRegenerateError={null}
            onMealPickApplied={handleMealPickApplied as never}
            mealRefit={refit?.needed && !refitDeclined ? refit : null}
            mealRefitError={refitError}
            onMealRefitConfirm={() => { void handleRefitConfirm() }}
            onMealRefitDecline={() => setRefitDeclined(true)}
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
