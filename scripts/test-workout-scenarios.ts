/**
 * WORKOUT CHANGES IN COMBINATION — Ashley, 27 Oct 2026: "make sure that a user can just type a change, make an
 * edit to a workout, swap a day, miss a day, or change a workout. It needs to all work ... not make mistakes, and
 * not break." Every single change already has its own gate. This one chains them, the way a real week does, and
 * after every step asks the four things that read a day (the week strip, the week's count, Home and the streak)
 * whether they still agree with each other and with what she said.
 *
 * Real writers (the What-happened setters and the coach's confirm/undo executors) against the harness's fake
 * database, real readers (readTrainingWeeks, tallyWeek, loadDashboardData). Nothing here re-derives a day.
 *
 * Sections:
 *   1. a chosen rest day is not a miss, on the streak as on the strip
 *   2. sequences of day changes: move then miss, miss then train, swap then undo, two rests
 *   3. a part-trained day is not offered changes the strip would ignore; Home and the strip agree on it
 *   4. a prescribed walk can be missed, moved or rested like any session
 *   5. a coach Undo that does not save says so
 *   6. a coach change that does not save leaves the plan on screen as it was
 */

// --- Environment shims (before importing any lib modules) -------------------
const storeMap = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => storeMap.get(k) ?? null,
    setItem: (k: string, v: string) => { storeMap.set(k, String(v)) },
    removeItem: (k: string) => { storeMap.delete(k) },
    clear: () => { storeMap.clear() },
    key: (i: number) => [...storeMap.keys()][i] ?? null,
    get length() { return storeMap.size },
  },
  configurable: true,
})
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
;(globalThis as unknown as { window: unknown }).window = globalThis
for (const m of ['addEventListener', 'removeEventListener', 'dispatchEvent'] as const) {
  if (typeof (globalThis as Record<string, unknown>)[m] !== 'function') (globalThis as Record<string, unknown>)[m] = () => true
}

import type { WorkoutDay, MesocycleWeek } from '../src/lib/types'

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const PID = '00000000-0000-4000-8000-0000000000aa'
// Her plan: Monday, Tuesday, Thursday, Saturday. Begun on Monday 5 October, so plan weeks and strip weeks coincide
// and nothing below is about a week boundary (week-boundaries owns that).
const PLAN_CREATED = '2026-10-05T00:00:00'
const MON = '2026-10-12', TUE = '2026-10-13', WED = '2026-10-14', THU = '2026-10-15', FRI = '2026-10-16', SAT = '2026-10-17', SUN = '2026-10-18'
const LAST = { MON: '2026-10-05', TUE: '2026-10-06', THU: '2026-10-08', SAT: '2026-10-10' }

const ex = (name: string) => ({ name, sets: 3, reps: '8-10', rest: '90s' })
const lifting = (day: string, focus: string): WorkoutDay => ({ day, focus, exercises: [ex(`${focus} A`), ex(`${focus} B`), ex(`${focus} C`)] } as unknown as WorkoutDay)
const rest = (day: string): WorkoutDay => ({ day, focus: 'Rest', exercises: [] } as unknown as WorkoutDay)
const walk = (day: string): WorkoutDay => ({ day, focus: 'Walk', exercises: [], plannedActivity: { activity: 'Walk', duration: 20, targetRpe: 3 } } as unknown as WorkoutDay)
const PLAN: WorkoutDay[] = [
  lifting('Monday', 'Upper'), lifting('Tuesday', 'Lower'), rest('Wednesday'), lifting('Thursday', 'Push'),
  rest('Friday'), lifting('Saturday', 'Pull'), rest('Sunday'),
]
const WALK_PLAN: WorkoutDay[] = [
  walk('Monday'), rest('Tuesday'), walk('Wednesday'), rest('Thursday'), walk('Friday'), rest('Saturday'), rest('Sunday'),
]
const meso = (days: WorkoutDay[]): MesocycleWeek[] => [1, 2, 3, 4].map(n => ({ week_number: n, phase: 'hypertrophy', days } as unknown as MesocycleWeek))

const PROFILE = {
  id: PID, age: 30, gender: 'female', height_cm: 168, weight_kg: 64, activity_level: 'moderate',
  fitness_goal: 'hypertrophy', primary_goal: 'hypertrophy', equipment_access: 'full_gym', injuries: [],
  training_style: 'hybrid', training_experience: 'intermediate', session_duration_preference: '45-60',
  training_days: [], weekly_schedule: {}, dietary_preferences: [], concurrent_activities: [],
  macro_calculation_mode: 'STANDARD_STATIC', recovery_capacity: 'moderate', created_at: PLAN_CREATED,
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dayName = (d: string) => WEEKDAY[new Date(`${d}T12:00:00`).getDay()]

async function main() {
  const { makeFakeSupabase } = await import('../.tour-harness/fake-supabase')
  const { setSupabaseClient } = await import('../src/lib/supabase')
  let db: Record<string, Record<string, unknown>[]> = {}
  const fresh = () => {
    db = { workout_sessions: [], exercise_set_logs: [], cardio_logs: [], workout_exercises: [], mesocycle_weeks: [], pending_actions: [] }
    storeMap.clear()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSupabaseClient(makeFakeSupabase(db) as any)
    ;(globalThis as Record<string, unknown>).__failWrite = undefined
    ;(globalThis as Record<string, unknown>).__netDown = undefined
  }
  const { readTrainingWeeks, tallyWeek } = await import('../src/hooks/useTrainingWeek')
  const { loadDashboardData } = await import('../src/lib/dashboard-data')
  const track = await import('../src/lib/daily-tracking')
  const { dayVerbs } = await import('../src/lib/day-verbs')
  const exec = await import('../src/lib/pending-action-executor')
  const { setDevClockOverride } = await import('../src/lib/dev-clock')

  let sid = 0
  /** A trained day: a completed session with every planned set logged. */
  const trained = (date: string, sets = 9, completed = true) => {
    // ONE ROW PER DAY, as the app keeps it: a day already noted (rest, missed) is trained on that same row.
    const existing = db.workout_sessions.find(r => r.date === date)
    const id = (existing?.id as string | undefined) ?? `s-${++sid}`
    if (existing) Object.assign(existing, { split_type: 'training', day: dayName(date), duration_minutes: 50, is_completed: completed })
    else db.workout_sessions.push({ id, profile_id: PID, date, split_type: 'training', day: dayName(date), duration_minutes: 50, is_completed: completed })
    const focus = PLAN.find(d => d.day === dayName(date))?.focus ?? 'Upper'
    for (let i = 0; i < sets; i++) {
      db.exercise_set_logs.push({
        id: `${id}-${i}`, session_id: id, user_id: PID, exercise_name: `${focus} ${'ABC'[Math.floor(i / 3) % 3]}`, exercise_id: null,
        set_number: (i % 3) + 1, weight_kg: 20, reps_completed: 10, is_bodyweight: false, is_warmup: false, drop_index: 0,
        completed_at: `${date}T18:00:00`,
      })
    }
    return id
  }
  const lastWeekAllTrained = () => { for (const d of Object.values(LAST)) trained(d) }

  /** Everything that reads a day, on `today`. */
  const look = async (today: string, plan: WorkoutDay[] = PLAN) => {
    setDevClockOverride(PID, today, '12:00')
    const weeks = await readTrainingWeeks(PID, today, plan, meso(plan), PLAN_CREATED)
    const states = Object.fromEntries(weeks.thisWeek.map(d => [d.date, d.state]))
    const tally = tallyWeek(weeks.thisWeek, today)
    // The moves Home is handed are the strip's own (Dashboard passes the week hook's), read the same way.
    const moves = await track.getSessionMovesInRange(PID, MON, SUN)
    const home = await loadDashboardData({
      profile: PROFILE as never, macros: null, exercisePlan: plan, mesocycle: meso(plan), moves,
      planCreatedAt: PLAN_CREATED, todayLogs: db.exercise_set_logs.filter(l => db.workout_sessions.find(s => s.id === l.session_id)?.date === today) as never,
      liveWeek: 2, dayName: dayName(today), todayStr: today, now: new Date(`${today}T12:00:00`),
    })
    return { weeks, states, tally, home, day: (d: string) => weeks.thisWeek.find(x => x.date === d)! }
  }

  // ---------------------------------------------------------------------------------------------------------------
  console.log('\n[1] A CHOSEN REST DAY IS NOT A MISS — on the streak as on the strip')
  // The rest card says "It won't count as a missed session, and it won't count against your week." The strip agrees
  // (rest_chosen is not tallied). The streak did not: a scheduled, unlogged day it was never told about is a miss.
  fresh()
  lastWeekAllTrained()
  trained(TUE)
  check('setup: Monday chosen as rest', await track.setDeliberateRest(PID, MON, true))
  let v = await look(WED)
  check('the strip calls Monday a chosen rest', v.states[MON] === 'rest_chosen', v.states)
  const streakBefore = v.home.streak
  check('setup: Thursday chosen as rest too (second in the week)', await track.setDeliberateRest(PID, THU, true))
  v = await look(FRI)
  check('the strip calls Thursday a chosen rest', v.states[THU] === 'rest_chosen', v.states)
  check('THE STREAK SURVIVES TWO CHOSEN RESTS IN ONE WEEK (it spent its make-up on one and broke on the other)',
    v.home.streak >= streakBefore && v.home.streak >= 5, { before: streakBefore, after: v.home.streak })
  // And the contrast that proves the case binds: two days SAID missed in one week do break it.
  fresh()
  lastWeekAllTrained()
  trained(TUE)
  await track.setMarkedMissed(PID, MON, true)
  await track.setMarkedMissed(PID, THU, true)
  v = await look(FRI)
  check('...while two days marked MISSED in one week still break it (the fixture binds)', v.home.streak <= 1, v.home.streak)
  // A chosen rest she then trained on counts as the session it became.
  fresh()
  lastWeekAllTrained()
  await track.setDeliberateRest(PID, MON, true)
  trained(MON)
  v = await look(TUE)
  check('a rest she trained on anyway is a session done', v.states[MON] === 'done', v.states)
  const streakTrainedRest = v.home.streak
  fresh()
  lastWeekAllTrained()
  trained(MON)
  v = await look(TUE)
  check('...and counts on the streak exactly as the same day trained without the note', streakTrainedRest === v.home.streak && v.home.streak >= 5, { withNote: streakTrainedRest, without: v.home.streak })

  // ---------------------------------------------------------------------------------------------------------------
  console.log('\n[2] SEQUENCES OF DAY CHANGES — each step read back by every reader')
  // Move Monday to Wednesday, then Wednesday is missed.
  fresh()
  lastWeekAllTrained()
  check('setup: Monday moved to Wednesday', await track.setSessionMove(PID, MON, WED))
  v = await look(WED)
  check('Monday reads moved, Wednesday holds the session', v.states[MON] === 'moved' && v.states[WED] === 'due', v.states)
  check('Home on Wednesday is the moved-in session', v.home.session.status === 'not_started' && v.home.session.focus === 'Upper', v.home.session)
  check('the week still owes four sessions', v.tally.sessionsPlanned === 4, v.tally)
  check('setup: Wednesday marked missed', await track.setMarkedMissed(PID, WED, true))
  v = await look(THU)
  check('Wednesday reads missed, Monday still moved', v.states[WED] === 'missed' && v.states[MON] === 'moved', v.states)
  check('...and the week still owes four, not five (the missed session is counted once)', v.tally.sessionsPlanned === 4, v.tally)

  // Marked missed, then logged as done somewhere else after all.
  fresh()
  lastWeekAllTrained()
  await track.setMarkedMissed(PID, MON, true)
  trained(MON)
  v = await look(TUE)
  check('a day marked missed and then trained reads done', v.states[MON] === 'done', v.states)
  const monDay = v.day(MON)
  check('...and the day menu offers nothing to explain on it',
    dayVerbs({ isDone: monDay.state === 'done', hasSession: true, movedAway: false, beforePlan: false, isPast: true, isToday: false, declared: { missed: monDay.markedMissed, rest: monDay.deliberateRest, swapped: !!monDay.swappedForActivity }, canShorten: false, canLighter: false, canRebuild: false }).length === 0)

  // Swapped for an activity, then the swap undone: the day is a session again, the activity stays logged.
  fresh()
  lastWeekAllTrained()
  check('setup: Monday swapped for a run (screen writer)', await track.setSwappedForActivity(PID, MON, 'Run'))
  db.cardio_logs.push({ id: 'c-run', user_id: PID, date: MON, activity_name: 'Run', duration_minutes: 30, intensity_rpe: 6, completed_at: `${MON}T07:00:00` })
  v = await look(MON)
  check('Monday reads swapped, and is not owed', v.states[MON] === 'swapped' && v.tally.sessionsPlanned === 3, { s: v.states[MON], t: v.tally })
  await exec.undoSwapForActivity(PID, { date: MON, dayName: 'Monday', activityName: 'Run' })
  v = await look(MON)
  check('after Undo, Monday is today\'s session again', v.states[MON] === 'due' && v.home.session.status === 'not_started' && v.home.session.focus === 'Upper', { s: v.states[MON], h: v.home.session.status })
  check('...and the run is still logged (undoing a plan never erases a fact)', db.cardio_logs.some(c => c.id === 'c-run'))

  // Moved, then the move undone by the coach's Undo.
  fresh()
  lastWeekAllTrained()
  const moved = await exec.executeSessionMove(PROFILE as never, { fromDate: MON, toDate: WED, fromDayName: 'Monday', toDayName: 'Wednesday', sessionFocus: 'Upper' })
  check('coach move lands', moved.receipt.failed.length === 0, moved.receipt)
  await exec.undoSessionMove(PID, { fromDate: MON, toDate: WED, fromDayName: 'Monday', toDayName: 'Wednesday' })
  v = await look(MON)
  check('after Undo, Monday holds its own session and Wednesday is a rest day again', v.states[MON] === 'due' && (v.states[WED] === 'rest' || v.states[WED] === 'recovery'), v.states)

  // ---------------------------------------------------------------------------------------------------------------
  console.log('\n[3] A PART-TRAINED DAY — not offered changes the strip would ignore, and Home agrees with the strip')
  fresh()
  lastWeekAllTrained()
  trained(MON, 2, false)
  v = await look(MON)
  check('the strip calls it part-done', v.states[MON] === 'partial', v.states)
  check('Home calls it in progress', v.home.session.status === 'in_progress', v.home.session.status)
  const part = v.day(MON)
  const verbs = dayVerbs({ isDone: part.state === 'done', hasSession: true, movedAway: false, beforePlan: false, isPast: false, isToday: true, declared: { missed: false, rest: false, swapped: false }, canShorten: true, canLighter: true, canRebuild: true, canKind: true, partlyLogged: part.workingLogs.length > 0 })
  check('A DAY WITH WORKING SETS ALREADY LOGGED IS NOT OFFERED "missed", "rest" OR "move" (each would be ignored by the strip, which ranks logged work first)',
    !verbs.includes('missed') && !verbs.includes('rest') && !verbs.includes('move'), verbs)
  check('...and still offers the changes that act on what is left (shorten, lighter)', verbs.includes('shorten') && verbs.includes('lighter'), verbs)
  check('...and never redraws a started session (no rebuild, no different kind)', !verbs.includes('rebuild') && !verbs.includes('kind'), verbs)
  // Home's "done" and the strip's "done" are one rule: every planned set, not the right NUMBER of sets on the wrong
  // exercises. Nine sets planned; nine logged, but all on the first exercise.
  fresh()
  lastWeekAllTrained()
  const lopsided = trained(MON, 0, false)
  for (let i = 0; i < 9; i++) db.exercise_set_logs.push({ id: `${lopsided}-x${i}`, session_id: lopsided, user_id: PID, exercise_name: 'Upper A', exercise_id: null, set_number: i + 1, weight_kg: 20, reps_completed: 10, is_bodyweight: false, is_warmup: false, drop_index: 0, completed_at: `${MON}T18:00:00` })
  v = await look(MON)
  check('NINE SETS OF ONE EXERCISE IS NOT A FINISHED THREE-EXERCISE SESSION: Home does not say done while the strip says part-done',
    !(v.home.session.status === 'done' && v.states[MON] !== 'done'), { home: v.home.session.status, strip: v.states[MON] })

  // ---------------------------------------------------------------------------------------------------------------
  console.log('\n[4] A PRESCRIBED WALK can be missed, moved or rested like any session')
  fresh()
  v = await look(TUE, WALK_PLAN)
  check('the strip counts Monday\'s walk as a session (missed, since nothing was logged)', v.states[MON] === 'missed', v.states)
  const walkDay = v.day(MON)
  const { dayHasSession } = await import('../src/lib/day-verbs')
  const walkVerbs = dayVerbs({ isDone: false, hasSession: dayHasSession(walkDay.session), movedAway: false, beforePlan: false, isPast: true, isToday: false, declared: { missed: false, rest: false, swapped: false }, canShorten: false, canLighter: false, canRebuild: false })
  check('THE DAY MENU OFFERS "missed", "move" AND "rest" ON A WALK DAY (it said "No session was planned")',
    walkVerbs.includes('missed') && walkVerbs.includes('move') && walkVerbs.includes('rest'), walkVerbs)
  check('setup: the walk marked missed', await track.setMarkedMissed(PID, MON, true))
  v = await look(TUE, WALK_PLAN)
  check('...and reads missed', v.states[MON] === 'missed', v.states)
  // The app's own answer to "where can this walk go?" — the resolver both the day menu and the coach ask.
  const { resolveMoveTarget } = await import('../src/lib/session-move')
  const where = resolveMoveTarget({ fromDate: WED, todayDate: WED, plan: WALK_PLAN, weekOf: () => 2, existing: [] })
  check('THE APP FINDS A DAY TO MOVE A WALK TO (it said "There\'s no session on Wednesday to move")', where.ok === true && (where as { date?: string }).date === THU, where)
  const onto = resolveMoveTarget({ fromDate: MON, requestedDate: WED, todayDate: MON, plan: WALK_PLAN, weekOf: () => 2, existing: [] })
  check('...and never moves one walk onto another walk\'s day', !(onto.ok && (onto as { date?: string }).date === WED), onto)
  check('setup: Wednesday\'s walk moved to Thursday', await track.setSessionMove(PID, WED, THU))
  v = await look(WED, WALK_PLAN)
  check('the walk moves like a session: Wednesday moved, Thursday holds the walk', v.states[WED] === 'moved' && v.states[THU] === 'due', v.states)

  // ---------------------------------------------------------------------------------------------------------------
  console.log('\n[5] A COACH UNDO THAT DOES NOT SAVE SAYS SO')
  const failUpdatesTo = (table: string) => { (globalThis as Record<string, unknown>).__failWrite = (t: string) => t === table }
  for (const [label, run, undo] of [
    ['rest day', () => exec.executeRestDay(PROFILE as never, { date: MON, dayName: 'Monday' }), () => exec.undoRestDay(PID, { date: MON, dayName: 'Monday' })],
    ['missed day', () => exec.executeMissedSession(PROFILE as never, { date: MON, dayName: 'Monday' }), () => exec.undoMissedSession(PID, { date: MON, dayName: 'Monday' })],
    ['moved session', () => exec.executeSessionMove(PROFILE as never, { fromDate: MON, toDate: WED, fromDayName: 'Monday', toDayName: 'Wednesday' }), () => exec.undoSessionMove(PID, { fromDate: MON, toDate: WED, fromDayName: 'Monday', toDayName: 'Wednesday' })],
    ['activity swap', () => exec.executeSwapForActivity(PROFILE as never, { date: MON, dayName: 'Monday', activityName: 'Run' }), () => exec.undoSwapForActivity(PID, { date: MON, dayName: 'Monday', activityName: 'Run' })],
  ] as const) {
    fresh()
    await run()
    failUpdatesTo('workout_sessions')
    const r = await undo()
    ;(globalThis as Record<string, unknown>).__failWrite = undefined
    check(`a ${label} Undo that could not save reports false, so the card cannot say "undone"`, r === false, r)
    fresh()
    await run()
    const ok = await undo()
    check(`...and one that saved reports true`, ok === true, ok)
  }

  // ---------------------------------------------------------------------------------------------------------------
  console.log('\n[6] A COACH CHANGE THAT DOES NOT SAVE LEAVES THE PLAN AS IT WAS')
  // The receipt said "didn't save" while the screen drew the change; a reload put it back, and the next edit of that
  // week could have saved it without anyone choosing it.
  fresh()
  // Real catalogue names: the swap looks the new exercise up.
  const realMon = { day: 'Monday', focus: 'Upper', exercises: [ex('Barbell Bench Press'), ex('Barbell Rows'), ex('Lat Pulldown')] } as unknown as WorkoutDay
  const weeks = meso(PLAN.map(d => d.day === 'Monday' ? realMon : d))
  ;(globalThis as Record<string, unknown>).__failWrite = (t: string) => t === 'mesocycle_weeks'
  const swap = await exec.executeExerciseSwap(PROFILE as never, weeks, {
    weekNumber: 2, dayName: 'Monday', exIndex: 0, oldExerciseName: 'Barbell Bench Press', newExerciseName: 'Dumbbell Bench Press', scope: 'today',
  })
  ;(globalThis as Record<string, unknown>).__failWrite = undefined
  check('the receipt says it failed', swap.receipt.failed.length > 0 && swap.receipt.landed.length === 0, swap.receipt)
  // What the chat hands the screen: planAsSaved, which every plan-writing confirm in ChatAssistant goes through.
  const drawn = await exec.planAsSaved(PID, swap, weeks)
  const monAfter = drawn.find(w => w.week_number === 2)?.days.find(d => d.day === 'Monday')
  check('THE PLAN DRAWN AFTER A FAILED SAVE IS THE ONE STILL SAVED (barbell, not dumbbell)',
    !!monAfter && monAfter.exercises[0]?.name === 'Barbell Bench Press', monAfter?.exercises.map(e => e.name))
  // A multi-week change that landed some weeks: the stored plan is read back, so the screen shows what is really saved.
  const { saveMesocycleWeek } = await import('../src/lib/mesocycle-persistence')
  const half = weeks.map(w => ({ ...w, days: w.days.map(d => d.day !== 'Monday' ? d : { ...d, exercises: [ex('Dumbbell Bench Press'), ...d.exercises.slice(1)] }) }))
  await saveMesocycleWeek(PID, half[1]) // week 2 landed
  const drawnHalf = await exec.planAsSaved(PID, { mesocycle: half, preImage: weeks, receipt: { failed: [{ op: 'save', error: 'x' }] } }, weeks)
  const first = (n: number) => drawnHalf.find(w => w.week_number === n)?.days.find(d => d.day === 'Monday')?.exercises[0]?.name
  check('...and when some weeks landed, it draws what is stored: week 2 changed, week 3 not',
    first(2) === 'Dumbbell Bench Press' && (first(3) === undefined || first(3) === 'Barbell Bench Press'), { w2: first(2), w3: first(3) })
  // No connection at all: the stored plan cannot be read, so the last plan known to be saved is drawn.
  ;(globalThis as Record<string, unknown>).__netDown = true
  const drawnDead = await exec.planAsSaved(PID, swap, weeks)
  ;(globalThis as Record<string, unknown>).__netDown = undefined
  check('...and with no connection it draws the plan from before the change',
    drawnDead.find(w => w.week_number === 2)?.days.find(d => d.day === 'Monday')?.exercises[0]?.name === 'Barbell Bench Press')
  // And the same swap with the save working does hand back the change (the fixture binds).
  fresh()
  const swapOk = await exec.executeExerciseSwap(PROFILE as never, weeks, {
    weekNumber: 2, dayName: 'Monday', exIndex: 0, oldExerciseName: 'Barbell Bench Press', newExerciseName: 'Dumbbell Bench Press', scope: 'today',
  })
  const drawnOk = await exec.planAsSaved(PID, swapOk, weeks)
  check('...while a swap that saved draws the dumbbell (the fixture binds)',
    swapOk.receipt.failed.length === 0 && drawnOk.find(w => w.week_number === 2)?.days.find(d => d.day === 'Monday')?.exercises[0]?.name === 'Dumbbell Bench Press', swapOk.receipt)

  // Every plan-writing confirm in the chat draws through planAsSaved: no bare onMesocycleUpdated(result.mesocycle)
  // is left unguarded (comments stripped, so a note about the old line cannot satisfy it).
  const { readFileSync } = await import('fs')
  const chat = readFileSync(new URL('../src/components/ChatAssistant.tsx', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const bare = chat.split('\n').filter(l => /onMesocycleUpdated\(result\.mesocycle\)/.test(l) && !/if \(ok\)/.test(l))
  check('NO CONFIRM IN THE CHAT DRAWS AN ATTEMPTED PLAN: every result goes through planAsSaved', bare.length === 0, bare.map(l => l.trim()))
  check('...and planAsSaved is called, not only imported', (chat.match(/planAsSaved\(profile\.id, result, mesocycle\)/g) ?? []).length >= 14)

  // ---------------------------------------------------------------------------------------------------------------
  console.log('\n[7] AN OFFER IS CHECKED AGAINST THE DAY AT THE TAP')
  const holds = await import('../src/lib/offer-still-holds')
  const ctx = (today: string) => ({ profileId: PID, today, planForDate: () => PLAN, weekOf: () => 2, mesocycle: meso(PLAN) })
  // Rest Thursday: offered, then Thursday's sets are logged on the screen.
  fresh()
  check('a rest-day offer for a session still to do holds', await holds.offerStillHolds('propose_rest_day', { date: THU }, ctx(MON)) === true)
  trained(THU, 2, false)
  check('...AND NOT ONCE SETS ARE LOGGED ON THAT DAY (it would have marked a trained day a rest)', await holds.offerStillHolds('propose_rest_day', { date: THU }, ctx(THU)) === false)
  // Missed Monday: offered, then Monday's session is moved to Wednesday on the screen.
  fresh()
  check('a missed-day offer holds while the session is there', await holds.offerStillHolds('propose_missed_session', { date: MON }, ctx(MON)) === true)
  await track.setSessionMove(PID, MON, WED)
  check('...AND NOT ONCE THE SESSION HAS BEEN MOVED AWAY', await holds.offerStillHolds('propose_missed_session', { date: MON }, ctx(MON)) === false)
  // An activity swap offered, then the day swapped for something else on the screen.
  fresh()
  check('an activity-swap offer holds on an ordinary day', await holds.offerStillHolds('propose_session_activity_swap', { date: MON, activityName: 'Run' }, ctx(MON)) === true)
  await track.setSwappedForActivity(PID, MON, 'Swim')
  check('...and not once the day was swapped for something else', await holds.offerStillHolds('propose_session_activity_swap', { date: MON, activityName: 'Run' }, ctx(MON)) === false)
  // Move Monday to Wednesday: offered, then Tuesday's session is moved onto Wednesday first.
  fresh()
  check('a move offer holds while the day it goes to is free', await holds.offerStillHolds('propose_session_move', { fromDate: MON, toDate: WED }, ctx(MON)) === true)
  await track.setSessionMove(PID, TUE, WED)
  check('...AND NOT ONCE ANOTHER SESSION HAS TAKEN THAT DAY', await holds.offerStillHolds('propose_session_move', { fromDate: MON, toDate: WED }, ctx(MON)) === false)
  // A re-move: Monday's session already sits on Wednesday; the card moves it on to Friday and records Monday.
  fresh()
  await track.setSessionMove(PID, MON, WED)
  check('a re-move offer (recorded from the session\'s first day) holds', await holds.offerStillHolds('propose_session_move', { fromDate: MON, toDate: FRI }, ctx(MON)) === true)
  // An exercise swap offered, then the same slot swapped on the screen.
  const realWeeks = meso(PLAN)
  const changed = realWeeks.map(w => w.week_number !== 2 ? w : { ...w, days: w.days.map(d => d.day !== 'Monday' ? d : { ...d, exercises: [ex('Upper Z'), ...d.exercises.slice(1)] }) })
  check('a swap offer holds while its slot still holds the exercise it names', await holds.offerStillHolds('propose_exercise_swap', { weekNumber: 2, dayName: 'Monday', exIndex: 0, oldExerciseName: 'Upper A' }, ctx(MON)) === true)
  check('...AND NOT ONCE THAT SLOT WAS CHANGED (it would have swapped whatever was there now)',
    await holds.offerStillHolds('propose_exercise_swap', { weekNumber: 2, dayName: 'Monday', exIndex: 0, oldExerciseName: 'Upper A' }, { ...ctx(MON), mesocycle: changed }) === false)
  check('...and the same for a removal', await holds.offerStillHolds('propose_exercise_remove', { weekNumber: 2, dayName: 'Monday', exIndex: 0, exerciseName: 'Upper A' }, { ...ctx(MON), mesocycle: changed }) === false)
  check('a card that touches no day always holds', await holds.offerStillHolds('propose_meal_swap', {}, ctx(MON)) === true)

  // ---------------------------------------------------------------------------------------------------------------
  console.log('\n[8] AN UNDO PUTS BACK ONLY WHAT IS STILL AS THE CARD LEFT IT')
  fresh()
  const { saveMesocycleWeek: saveWeek, restoreMesocycle } = await import('../src/lib/mesocycle-persistence')
  for (const w of realWeeks) await saveWeek(PID, w)
  const stored = await restoreMesocycle(PID)
  const after = holds.fingerprintWeeks(realWeeks)
  check('a plan read back from the store fingerprints the same as the one in memory (no false "changed since")',
    !!stored && JSON.stringify(holds.fingerprintWeeks(stored.weeks)) === JSON.stringify(after))
  // The real database stores a plan's fields in its OWN order (jsonb sorts keys), not the order the app wrote them.
  const reorder = (v: unknown): unknown => Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).reverse().map(([k, x]) => [k, reorder(x)])) : v
  check('...and so does one whose fields come back in another order, as the real database returns them',
    JSON.stringify(holds.fingerprintWeeks(realWeeks.map(w => ({ ...w, days: reorder(w.days) as WorkoutDay[] })))) === JSON.stringify(after))
  check('the plan as the card left it: Undo goes ahead', holds.undoStillFits(after, realWeeks, [2]) === true)
  check('A LATER CHANGE TO A WEEK THE UNDO WOULD WRITE: it does not', holds.undoStillFits(after, changed, [2]) === false)
  check('...while a change to a week it would NOT write is no reason to refuse', holds.undoStillFits(after, changed, [3]) === true)
  check('a card that recorded nothing is undone as before', holds.undoStillFits(undefined, changed, [2]) === true)
  check('a today-only swap writes back its one week', JSON.stringify(holds.weeksUndoWrites('propose_exercise_swap', { weekNumber: 2, scope: 'today' }, undefined, realWeeks)) === '[2]')
  check('...ONE APPLIED WITH "REST OF BLOCK" WRITES BACK EVERY WEEK (it put back one)', JSON.stringify(holds.weeksUndoWrites('propose_exercise_swap', { weekNumber: 2, scope: 'today' }, 'permanent', realWeeks)) === '[1,2,3,4]')
  check('a schedule change writes back its run of weeks', JSON.stringify(holds.weeksUndoWrites('propose_schedule_change', { fromWeek: 3 }, undefined, realWeeks)) === '[3,4]')
  // A moved session moved again: the first card's Undo must not clear the second move.
  fresh()
  await track.setSessionMove(PID, MON, WED)
  check('a move still as written can be undone', await holds.dayStillAsWritten('propose_session_move', { fromDate: MON, toDate: WED }, PID) === true)
  await track.setSessionMove(PID, MON, FRI)
  check('MOVED AGAIN SINCE: THE FIRST CARD\'S UNDO IS REFUSED (it cleared the second move too)', await holds.dayStillAsWritten('propose_session_move', { fromDate: MON, toDate: WED }, PID) === false)
  check('...while the second card\'s is not', await holds.dayStillAsWritten('propose_session_move', { fromDate: MON, toDate: FRI }, PID) === true)
  await track.setSwappedForActivity(PID, TUE, 'Swim')
  check('an activity swap changed since is not undone either', await holds.dayStillAsWritten('propose_session_activity_swap', { date: TUE, activityName: 'Run' }, PID) === false)

  // The chat asks all of it: the claim checks the offer, the undo checks the plan and the day (comments stripped).
  check('THE CHAT CHECKS AN OFFER AT THE TAP (it passed async () => true)', /claimPendingAction\([^)]*,\s*\(_pre, pending\) => offerStillHolds\(/.test(chat) && !/claimPendingAction\([^,]+, async \(\) => true\)/.test(chat))
  check('...and an Undo against the plan and the day', /undoStillFits\(row\.result\.planAfter/.test(chat) && /dayStillAsWritten\(row\.kind/.test(chat))
  check('...and records what each card left, with the scope it was applied with', /fingerprintWeeks\(stored\.weeks\)/.test(chat) && /scope: appliedScope/.test(chat))
  // SOURCE ONLY, and named so: the greeting is a placeholder the opener replaces within a second, so no driver can
  // read it reliably. What this holds is that it looks today up in the live week, never week 1's flat plan.
  check('the greeting names today from the week she is in, not week 1 (source check)',
    /const todaySession = greetDays\.find\(/.test(chat) && /greetDays = mesocycle\.find\(w => w\.week_number === greetWeek\)/.test(chat) && !/const todaySession = exercisePlan\.find/.test(chat))
  check('ADD AND REMOVE APPLY THE SCOPE SHE TAPPED ("Rest of block" applied today only)',
    /addPayload = \{[^}]*\.\.\.\(editedScope === 'permanent'/.test(chat) && /executeExerciseRemove\(profile, mesocycle, editPayload/.test(chat))
}

main()
  .catch(err => { failures++; console.error('  FAIL: the gate crashed —', err) })
  .finally(() => {
    console.log(`\n${ran} checks ran.`)
    if (failures > 0) { console.error(`${failures} check(s) FAILED.`); process.exit(1) }
    console.log('Workout changes in combination: every reader agrees.')
  })
