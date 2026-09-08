// ---------------------------------------------------------------------------
// "IT'S A REST DAY" IS A CLAIM, AND A CLAIM NEEDS THE PLAN.
//
// Ashley, 7 Sep 2026: "i opened the chat and I see a message telling me its a
// rest day but today is not a rest day". The fix that day taught coach-opener.ts
// the difference between "nothing scheduled" and "we don't know yet" — and
// stopped there. Two other places kept making the same claim from the same
// empty array, and one of them was the first screen of the app.
//
// MEASURED 8 SEP, in a browser, with the plan arriving 1.2s after mount
// (.tour-harness/opener-race.mjs, verify:rest-day-race):
//
//   chat  t=0.3s  "Hey — it's a rest day on your plan. How's the recovery going?"
//   chat  t=6.8s  ...the same sentence. Never replaced.
//   home  t=0.3s  "TODAY'S SESSION / Rest day"        (no Start button)
//   home  t=6.8s  ...still "Rest day", beside its own week strip showing four
//                 sessions. The screen disagreed with itself.
//
// The chat one is the sharper bug of the two. The finalize effect recognised
// its own untouched opener by REBUILDING the greeting and comparing — against
// a string that moves the instant the plan lands. So the arrival it was
// waiting for is exactly what made it bail, and the only runs that recovered
// were the ones where the plan was slow enough to miss the 2.5s deadline.
//
// This gate holds all three paths to one rule: with no plan in hand, nothing
// on screen may say what today is.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { pickOpener, PLAN_UNKNOWN_TEXT, type OpenerInput } from '../src/lib/coach-opener'
import type { UserProfile, WorkoutDay, MesocycleWeek } from '../src/lib/types'

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

/** Comments are not code. An absence check that reads them is checking prose. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ---------------------------------------------------------------------------
console.log('\n[1] One sentence for "the plan is not here", not two')
// ---------------------------------------------------------------------------
const base: OpenerInput = {
  hour: 9, cutoffHour: 18, awaitingFeel: null, missedYesterday: null,
  planKnown: false, todaySession: null, todayLogged: false, tomorrowSession: null,
}
const unknown = pickOpener(base)
check('pickOpener returns the shared constant, not its own copy of the words',
  unknown.text === PLAN_UNKNOWN_TEXT, { text: unknown.text, constant: PLAN_UNKNOWN_TEXT })
check('and the kind says so', unknown.kind === 'plan_unknown', unknown.kind)
check('the shared sentence claims nothing about today',
  !/rest day|today|recovery|session/i.test(PLAN_UNKNOWN_TEXT), PLAN_UNKNOWN_TEXT)
check('it is not empty — silence is not an opener', PLAN_UNKNOWN_TEXT.trim().length > 0)
check('a loaded plan with nothing on today is still a rest day',
  pickOpener({ ...base, planKnown: true }).kind === 'rest_day')

// ---------------------------------------------------------------------------
console.log('\n[2] The synchronous greeting — the bubble she actually saw')
// ---------------------------------------------------------------------------
const chatUi = readFileSync('src/components/ChatAssistant.tsx', 'utf8')
const chatCode = stripComments(chatUi)

const detailFn = chatCode.match(/const initialGreetingDetail = \(\): string => \{[\s\S]*?\n  \}/)?.[0] ?? ''
check('initialGreetingDetail is still findable', detailFn.length > 0)
check('it returns the shared plan-unknown sentence on an empty plan',
  /if \(exercisePlan\.length === 0\) return PLAN_UNKNOWN_TEXT/.test(detailFn), detailFn.slice(0, 200))
// ORDER IS THE WHOLE POINT: the guard has to come before the `find`, or the
// rest-day fallback below it is reached exactly as before.
const guardAt = detailFn.indexOf('PLAN_UNKNOWN_TEXT')
const findAt = detailFn.indexOf('exercisePlan.find')
const restAt = detailFn.indexOf('rest day on your plan')
check('the guard is reached BEFORE the plan is searched',
  guardAt >= 0 && findAt >= 0 && guardAt < findAt, { guardAt, findAt })
check('...and before the rest-day fallback it protects',
  guardAt >= 0 && restAt >= 0 && guardAt < restAt, { guardAt, restAt })
check('the constant comes from coach-opener, so the two bubbles cannot drift',
  /import \{[^}]*PLAN_UNKNOWN_TEXT[^}]*\} from '@\/lib\/coach-opener'/.test(chatCode))

// ---------------------------------------------------------------------------
console.log('\n[3] The opener recognises itself by what was seeded, not by a rebuild')
// ---------------------------------------------------------------------------
check('the seeded sentence is remembered in a ref',
  /const seededGreetingRef = useRef<string \| null>\(null\)/.test(chatCode))
check('...filled once, lazily, rather than recomputed every render',
  /if \(seededGreetingRef\.current === null\) seededGreetingRef\.current = buildInitialGreeting\(\)/.test(chatCode))
check('...and it is what the first message is seeded WITH',
  /content: seededGreetingRef\.current as string/.test(chatCode))

const finalizeEffect = chatCode.match(/const openerFinalizedRef[\s\S]*?openerDeadlineRef\.current - Date\.now\(\)\)\)/)?.[0] ?? ''
check('the finalize effect is still findable', finalizeEffect.length > 0)
check('its guard compares against the remembered seed',
  /messages\[0\]\.content !== seededGreetingRef\.current/.test(finalizeEffect), finalizeEffect.slice(0, 300))
check('and NOWHERE in that effect is the greeting rebuilt to compare with',
  !/messages\[0\]\.content !== buildInitialGreeting\(\)/.test(chatCode))
// Clearing the chat re-seeds the same bubble, so the ref and the one-shot gate
// have to follow it or Clear chat leaves the raw greeting sitting there.
const clearFn = chatCode.match(/const greeting = buildInitialGreeting\(\)[\s\S]{0,400}/)?.[0] ?? ''
check('Clear chat re-seeds the ref', /seededGreetingRef\.current = greeting/.test(clearFn))
check('...and re-arms the one-shot finalize gate', /openerFinalizedRef\.current = false/.test(clearFn))
check('...and the message it sets is that same greeting',
  /setMessages\(\[\{ role: 'assistant', content: greeting, status: 'complete' \}\]\)/.test(clearFn))

// ---------------------------------------------------------------------------
console.log('\n[4] Home, from the aggregator itself — not from a regex')
// ---------------------------------------------------------------------------
// A chainable that answers every store with nothing. loadDashboardData reads
// meals, water, weigh-ins, goals, PRs and logs; none of them decide what today
// IS, which is the only thing under test here.
function fakeFrom(_table: string) {
  const api: Record<string, unknown> = {
    select: () => api, eq: () => api, gte: () => api, lte: () => api, lt: () => api,
    gt: () => api, in: () => api, order: () => api, limit: () => api, not: () => api,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    then: (resolve: (v: unknown) => void) => Promise.resolve().then(() => resolve({ data: [], error: null })),
  }
  return api
}
const { setSupabaseClient } = await import('../src/lib/supabase')
setSupabaseClient({ from: fakeFrom } as never)
const { loadDashboardData } = await import('../src/lib/dashboard-data')

const NOW = new Date('2026-09-08T09:00:00')           // a Tuesday
const profile = {
  id: '00000000-0000-4000-8000-000000000001',
  age: 30, gender: 'male', height_cm: 178, weight_kg: 80, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', preferred_time: 'morning', bmr: 1800, tdee: 2500,
  equipment_access: 'full_gym', injuries: [], training_style: 'hybrid',
  training_experience: 'intermediate', session_duration_preference: '45-60',
  training_days: [], weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  macro_calculation_mode: 'STANDARD_STATIC', recovery_capacity: 'moderate',
  created_at: '2026-09-01T00:00:00.000Z',
} as unknown as UserProfile

const tuesdaySession: WorkoutDay = {
  day: 'Tuesday', focus: 'Push & Press',
  exercises: [
    { name: 'Barbell Bench Press', sets: 3, reps: '6-8', rest: '180s', substitution: 'Dumbbell Bench Press', tier: 'tier_1_primary' },
    { name: 'Lateral Raises', sets: 3, reps: '12-15', rest: '60s', substitution: 'Cable Lateral Raises', tier: 'tier_3_accessory' },
  ],
} as unknown as WorkoutDay
const tuesdayRest: WorkoutDay = { day: 'Tuesday', focus: 'Rest', exercises: [] } as unknown as WorkoutDay

const load = (exercisePlan: WorkoutDay[], mesocycle: MesocycleWeek[]) => loadDashboardData({
  profile, macros: null, exercisePlan, mesocycle, planCreatedAt: profile.created_at,
  todayLogs: [], liveWeek: 1, dayName: 'Tuesday', todayStr: '2026-09-08', now: NOW,
})

const noPlan = await load([], [])
check('an absent plan is "unknown", never "rest"', noPlan.session.status === 'unknown', noPlan.session.status)
check('...and it names no focus', noPlan.session.focus === null, noPlan.session.focus)
check('...and offers no sets to do', noPlan.session.setsPlanned === 0 && noPlan.session.exerciseCount === 0, noPlan.session)
check('...and makes no claim about tomorrow either', noPlan.tomorrowLabel === null, noPlan.tomorrowLabel)

const restPlan = await load([tuesdayRest], [])
check('a LOADED plan with nothing on today is still a rest day',
  restPlan.session.status === 'rest', restPlan.session.status)
check('...and that day does get a tomorrow line',
  typeof restPlan.tomorrowLabel === 'string', restPlan.tomorrowLabel)

const trainPlan = await load([tuesdaySession], [])
check('a loaded training day is not started, with its focus',
  trainPlan.session.status === 'not_started' && trainPlan.session.focus === 'Push & Press', trainPlan.session)
check('...and its planned sets are counted', trainPlan.session.setsPlanned === 6, trainPlan.session.setsPlanned)

// The mesocycle alone is enough — App fills both, but either one arriving
// means the plan is known.
const mesoOnly = await load([], [{ week_number: 1, days: [tuesdaySession] } as unknown as MesocycleWeek])
check('a mesocycle with no flat plan still counts as known',
  mesoOnly.session.status === 'not_started', mesoOnly.session.status)

// ---------------------------------------------------------------------------
console.log('\n[5] Home draws the wait, and never remembers it')
// ---------------------------------------------------------------------------
const homeUi = readFileSync('src/components/Dashboard.tsx', 'utf8')
const homeCode = stripComments(homeUi)

check('the unknown state has its own branch, ahead of the rest-day one',
  homeCode.indexOf("data.session.status === 'unknown' ?") >= 0
  && homeCode.indexOf("data.session.status === 'unknown' ?") < homeCode.indexOf("data.session.status === 'rest' ?"))
check('...and it says what Ashley chose on 8 Sep', /Checking your plan…/.test(homeCode))
check('...with no Start button under it — there is nothing to start yet',
  !/Checking your plan…[\s\S]{0,400}Start session/.test(homeCode))
check('the estimate chip is withheld too', /status !== 'rest' && data\.session\.status !== 'unknown'/.test(homeCode))
check('the Tomorrow row is dropped rather than guessed',
  /data\.tomorrowLabel != null && \(/.test(homeCode))
check('an unknown day is never written to the cache the next cold open reads',
  /if \(fresh\.session\.status !== 'unknown'\) saveDashboardCache/.test(homeCode))

const deps = homeCode.match(/\}, \[activeSession\.ready[^\]]*\]\)/)?.[0] ?? ''
check('the aggregate re-runs when the plan arrives — exercisePlan is a dependency',
  /exercisePlan/.test(deps), deps)
check('...and so is the mesocycle', /mesocycle/.test(deps), deps)

// ---------------------------------------------------------------------------
console.log(failures === 0 ? `\nAll plan-unknown checks passed.\n` : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
