/**
 * M15, M30, M16 (streak half), M31, 9 Oct 2026 — "history and the streak tell
 * the truth".
 *
 * The tester, after two workouts: Session history read "5 sessions", among
 * them "swapped · 0m · 0kg · 0 sets" and "moved · 2026-10-10" (a date that had
 * not happened); Friday's session was titled "training" where Thursday's said
 * "Thursday"; and the streak said "2 days" half an hour after sign-up and
 * still "2" after a second day's training.
 *
 * TWO CAUSES.
 *   1. A day note — rest, moved, missed, swapped — is stored as a row in the
 *      sessions table, and history listed every row.
 *   2. The streak asked "is this WEEKDAY a training day in the plan?" and
 *      nothing else. So a session moved to Friday scored nothing on Friday (not
 *      one of his weekdays) and cost the week's make-up token on Monday,
 *      against the move card's own "won't count as missed"; and football
 *      back-dated to the Tuesday before the plan existed scored a day.
 *
 * DECIDED AS A CSCS (basis in the backlog entry): the unit of consistency is
 * the PLANNED SESSION, on the date it actually ran. The tracer replayed the
 * real function for the four rows in [3]; they are the fixtures here.
 */

// --- Environment shims (before importing any lib modules) -------------------
const storeMap = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => storeMap.get(k) ?? null,
    setItem: (k: string, v: string) => { storeMap.set(k, String(v)) },
    removeItem: (k: string) => { storeMap.delete(k) },
    clear: () => { storeMap.clear() },
  },
  configurable: true,
})
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
;(globalThis as unknown as { window: unknown }).window = globalThis
for (const m of ['addEventListener', 'removeEventListener'] as const) {
  if (typeof (globalThis as Record<string, unknown>)[m] !== 'function') (globalThis as Record<string, unknown>)[m] = () => {}
}

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const SAM = 'u-sam'
// Sam's plan: Monday, Tuesday, Thursday, Saturday — made on Thursday 8 October.
const PLAN_START = '2026-10-08'
const MON5 = '2026-10-05', TUE6 = '2026-10-06', THU8 = '2026-10-08', FRI9 = '2026-10-09', SAT10 = '2026-10-10', SUN11 = '2026-10-11'

async function main() {
  const { makeFakeSupabase } = await import('../.tour-harness/fake-supabase')
  const { setSupabaseClient } = await import('../src/lib/supabase')
  const db: Record<string, Record<string, unknown>[]> = { workout_sessions: [], exercise_set_logs: [], cardio_logs: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient(makeFakeSupabase(db) as any)
  const history = await import('../src/lib/exercise-history')
  const streak = await import('../src/lib/streak')

  // -------------------------------------------------------------------------
  console.log('\n[1] SESSION HISTORY LISTS SESSIONS — the tester\'s five rows, and two more kinds')
  const session = (id: string, date: string, o: Record<string, unknown>) => ({
    id, profile_id: SAM, date, split_type: 'training', day: null, duration_minutes: 0, is_completed: false,
    moved_to_date: null, swapped_for_activity: null, deliberate_rest: false, marked_missed: false, ...o,
  })
  const set = (sessionId: string, n: number, o: Record<string, unknown> = {}) => ({
    id: `${sessionId}-${n}`, session_id: sessionId, user_id: SAM, exercise_name: 'Goblet Squats', exercise_id: 'goblet-squats',
    set_number: n, weight_kg: 16, reps_completed: 10, is_bodyweight: false, is_warmup: false, drop_index: 0,
    // Filled as the database fills it: the reader takes the day from it.
    completed_at: `${db.workout_sessions.find(w => w.id === sessionId)?.date}T18:0${n}:00`, ...o,
  })
  db.workout_sessions.push(
    session('thu', THU8, { day: 'Thursday', duration_minutes: 52, is_completed: true }),
    // Started with the button before the fix: the row was never told its day.
    session('fri', FRI9, { day: null, duration_minutes: 61, is_completed: true }),
    session('mon', MON5, { split_type: 'moved', moved_to_date: FRI9 }),
    session('tue', TUE6, { split_type: 'swapped', swapped_for_activity: 'Football' }),
    session('sat', SAT10, { split_type: 'moved', moved_to_date: SUN11 }),
    session('rest', '2026-10-04', { split_type: 'rest', deliberate_rest: true }),
    session('missed', '2026-10-03', { split_type: 'missed', marked_missed: true }),
    // Start workout pressed, nothing logged, never finished.
    session('looked', '2026-10-02', { day: 'Friday', duration_minutes: 45 }),
    // A day marked as rest and then trained after all: the sets make it a session.
    session('rested-then-trained', '2026-10-01', { split_type: 'rest', deliberate_rest: true, day: 'Thursday', duration_minutes: 30, is_completed: true }),
  )
  db.exercise_set_logs.push(
    set('thu', 1), set('thu', 2), set('thu', 3),
    set('fri', 1), set('fri', 2), set('fri', 1, { id: 'fri-w', is_warmup: true, weight_kg: 5 }),
    set('rested-then-trained', 1),
  )
  db.cardio_logs.push({ id: 'c1', user_id: SAM, date: TUE6, activity_name: 'Football', duration_minutes: 60, intensity_rpe: 8, completed_at: `${TUE6}T19:00:00` })

  const entries = await history.getSessionHistory(SAM, 100)
  const lifting = entries.filter(e => !e.cardioOnly)
  check('THREE SESSIONS ARE LISTED — the three days somebody trained (it listed all nine rows)', lifting.length === 3, entries.map(e => `${e.date}:${e.splitType}`))
  check('...Thursday, Friday, and the rest day that was trained after all', lifting.map(e => e.date).join() === `${FRI9},${THU8},2026-10-01`, lifting.map(e => e.date))
  check('NO "moved" ENTRY, and nothing dated in the future', !entries.some(e => e.splitType === 'moved') && !entries.some(e => e.date === SAT10 || e.date === MON5), entries.map(e => `${e.date}:${e.splitType}`))
  check('no "swapped · 0m · 0kg · 0 sets", no rest note, no missed note', !entries.some(e => !e.cardioOnly && ['swapped', 'missed'].includes(e.splitType)) && !entries.some(e => e.date === '2026-10-04' || e.date === '2026-10-03'))
  check('a session that was opened and never logged is not one', !entries.some(e => e.date === '2026-10-02'))
  const football = entries.find(e => e.date === TUE6)
  check('THE FOOTBALL IS THERE AS WHAT IT WAS: an activity, with its line', !!football && football.cardioOnly === true && football.cardio.join() === 'Football · 60 min · Hard', football)
  check('"N sessions" counts workouts: 3, not 9', history.countSessions(entries) === 3, history.countSessions(entries))
  check('a session\'s sets are counted without its build-up', lifting.find(e => e.date === FRI9)?.totalSets === 2, lifting.find(e => e.date === FRI9))

  console.log('\n[2] ...and titles them from the date, which every row has')
  const fri = lifting.find(e => e.date === FRI9)!
  const thu = lifting.find(e => e.date === THU8)!
  check('the session whose row was never told its day is still "Friday"', history.sessionTitle(fri) === `Friday · ${FRI9}`, history.sessionTitle(fri))
  check('...in the same form as the one that was', history.sessionTitle(thu) === `Thursday · ${THU8}`, history.sessionTitle(thu))
  check('an activity day is titled the same way', history.sessionTitle(football!) === `Tuesday · ${TUE6}`, football && history.sessionTitle(football))
  const dialog = strip(read('src/components/exercise/SessionHistoryDialog.tsx'))
  check('the dialog titles every row through that one function', (dialog.match(/sessionTitle\(entry\)/g) ?? []).length === 2 && !/entry\.day \?\? entry\.splitType/.test(dialog))
  check('"1 set", not "1 sets"', /totalSets === 1 \? '' : 's'/.test(dialog) && !/\{entry\.totalSets\} sets/.test(dialog))
  const tools = strip(read('src/components/ToolsTab.tsx'))
  check('Tools counts sessions with the same function', /countSessions\(rows\)/.test(tools))

  // -------------------------------------------------------------------------
  console.log('\n[3] THE STREAK — the tracer\'s replay, as fixtures')
  const day = (name: string, training: boolean) => ({ day: name, focus: training ? 'Session' : 'Rest', exercises: training ? [{ name: 'Goblet Squats', sets: 3, reps: '10' }] : [] })
  const plan = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    .map(n => day(n, ['Monday', 'Tuesday', 'Thursday', 'Saturday'].includes(n))) as never
  // Plan weeks run from the plan's own first day, as the app counts them — so
  // two days in one calendar week of the fixture really do share a make-up token.
  const weekFrom = (start: string) => (date: string) => Math.max(1, Math.floor((new Date(`${date}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / (7 * 86400000)) + 1)
  const count = (o: { today: string; sets?: string[]; cardio?: string[]; moves?: { fromDate: string; toDate: string }[]; swapped?: string[]; planStart?: string | null }) =>
    streak.computeStreak(streak.buildStreakDays({
      todayStr: o.today, plan, moves: o.moves ?? [], swappedDates: new Set(o.swapped ?? []),
      setDates: new Set(o.sets ?? []), cardioDates: new Set(o.cardio ?? []),
      planStartStr: o.planStart === undefined ? PLAN_START : o.planStart, planWeekOf: weekFrom(o.planStart ?? PLAN_START),
    })).currentStreak

  check('row 1 — the first workout only: 1', count({ today: THU8, sets: [THU8] }) === 1, count({ today: THU8, sets: [THU8] }))
  check('row 2 — PLUS FOOTBALL BACK-DATED TO THE TUESDAY BEFORE THE PLAN EXISTED: still 1 (it said 2)',
    count({ today: THU8, sets: [THU8], cardio: [TUE6], swapped: [TUE6] }) === 1, count({ today: THU8, sets: [THU8], cardio: [TUE6], swapped: [TUE6] }))
  const moves = [{ fromDate: MON5, toDate: FRI9 }, { fromDate: SAT10, toDate: SUN11 }]
  check('row 3 — PLUS FRIDAY\'S WORKOUT, Monday\'s session moved there: 2 (it stayed on the old number)',
    count({ today: FRI9, sets: [THU8, FRI9], cardio: [TUE6], swapped: [TUE6], moves }) === 2, count({ today: FRI9, sets: [THU8, FRI9], cardio: [TUE6], swapped: [TUE6], moves }))
  check('row 4 — Friday without the football entry: 2 (it said 1)', count({ today: FRI9, sets: [THU8, FRI9], moves }) === 2, count({ today: FRI9, sets: [THU8, FRI9], moves }))
  check('...and the same two days WITHOUT the move score 1: Friday is not a planned session unless one was moved onto it',
    count({ today: FRI9, sets: [THU8, FRI9] }) === 1, count({ today: FRI9, sets: [THU8, FRI9] }))

  console.log('\n[4] the rule, case by case')
  // Three full weeks in: Mon 19, Tue 20, Thu 22, Sat 24, Mon 26, Tue 27, Thu 29.
  const done = ['2026-10-19', '2026-10-20', '2026-10-22', '2026-10-24', '2026-10-26', '2026-10-27']
  const today = '2026-10-29'
  check('six planned sessions done in a row is 6', count({ today, sets: done, planStart: '2026-10-19' }) === 6, count({ today, sets: done, planStart: '2026-10-19' }))
  check('a rest day between them neither counts nor breaks', count({ today: '2026-10-28', sets: done, planStart: '2026-10-19' }) === 6)
  check('today\'s session, not done yet, is not a miss', count({ today, sets: done, planStart: '2026-10-19' }) === 6)
  check('...and counts once it is', count({ today, sets: [...done, today], planStart: '2026-10-19' }) === 7)
  // WHERE "not done yet" BINDS: Monday 26th was missed, so this week's token
  // is spent — were today a miss too, the streak would stop at Tuesday.
  const missedMonday = ['2026-10-19', '2026-10-20', '2026-10-22', '2026-10-24', '2026-10-27']
  check('...even in a week whose one make-up token is already spent', count({ today, sets: missedMonday, planStart: '2026-10-19' }) === 5, count({ today, sets: missedMonday, planStart: '2026-10-19' }))
  check('a second real miss in one week does stop it', count({ today: '2026-10-30', sets: missedMonday, planStart: '2026-10-19' }) === 1, count({ today: '2026-10-30', sets: missedMonday, planStart: '2026-10-19' }))
  // TWO MOVES IN ONE WEEK, BOTH DONE. Tue 20 → Wed 21, Sat 24 → Sun 25.
  const twoMoves = [{ fromDate: '2026-10-20', toDate: '2026-10-21' }, { fromDate: '2026-10-24', toDate: '2026-10-25' }]
  const movedDone = ['2026-10-19', '2026-10-21', '2026-10-22', '2026-10-25', '2026-10-26', '2026-10-27']
  check('TWO SESSIONS MOVED IN ONE WEEK, BOTH DONE ON THEIR NEW DAYS, KEEP THE STREAK: 6 (it broke: two "misses", one token)',
    count({ today, sets: movedDone, moves: twoMoves, planStart: '2026-10-19' }) === 6, count({ today, sets: movedDone, moves: twoMoves, planStart: '2026-10-19' }))
  check('...the same week WITHOUT the moves recorded is two misses and the streak stops at them',
    count({ today, sets: movedDone, planStart: '2026-10-19' }) < 6, count({ today, sets: movedDone, planStart: '2026-10-19' }))
  check('a session moved and then NOT done on its new day is a miss there',
    count({ today, sets: ['2026-10-19', '2026-10-22', '2026-10-24', '2026-10-26', '2026-10-27'], moves: [twoMoves[0]], planStart: '2026-10-19' }) === 5)
  // A swapped day: football instead of Thursday 22nd's session.
  const swappedWeek = ['2026-10-19', '2026-10-20', '2026-10-24', '2026-10-26', '2026-10-27']
  check('A DAY SWAPPED FOR FOOTBALL KEEPS THE STREAK — the five sessions either side of it still stand: 5',
    count({ today, sets: swappedWeek, cardio: ['2026-10-22'], swapped: ['2026-10-22'], planStart: '2026-10-19' }) === 5,
    count({ today, sets: swappedWeek, cardio: ['2026-10-22'], swapped: ['2026-10-22'], planStart: '2026-10-19' }))
  check('...without counting the football as a planned session done (that would be 6)',
    count({ today, sets: swappedWeek, cardio: ['2026-10-22'], swapped: ['2026-10-22'], planStart: '2026-10-19' }) !== 6)
  check('...and without spending the week\'s make-up token: a real miss the same week is still forgiven once',
    count({ today, sets: ['2026-10-19', '2026-10-24', '2026-10-26', '2026-10-27'], cardio: ['2026-10-22'], swapped: ['2026-10-22'], planStart: '2026-10-19' }) === 4)
  check('a swapped day she trained on anyway counts like any other', count({ today, sets: done, swapped: ['2026-10-22'], planStart: '2026-10-19' }) === 6)
  check('a planned WALK logged as cardio is that day\'s session, and counts', count({ today, sets: done.slice(1), cardio: ['2026-10-19'], planStart: '2026-10-19' }) === 6)
  check('nothing before the plan started counts, however much was logged', count({ today: '2026-10-20', sets: ['2026-10-12', '2026-10-13', '2026-10-15', '2026-10-17', '2026-10-19', '2026-10-20'], planStart: '2026-10-19' }) === 2)
  check('...and a plan with no known start date counts what it always did', count({ today: '2026-10-20', sets: ['2026-10-15', '2026-10-17', '2026-10-19', '2026-10-20'], planStart: null }) === 4)

  console.log('\n[5] and it is called what it counts')
  const { streakLabel } = await import('../src/lib/coach-voice')
  check('"2 sessions in a row"', streakLabel(2) === 'sessions in a row', streakLabel(2))
  check('"1 session in a row"', streakLabel(1) === 'session in a row', streakLabel(1))
  const home = strip(read('src/components/Dashboard.tsx'))
  check('Home prints the count with that label, and no longer says "days streak"', /streakLabel\(data\.streak\)/.test(home) && !/day\{data\.streak === 1 \? '' : 's'\} streak/.test(home))
  const data = strip(read('src/lib/dashboard-data.ts'))
  check('the streak is built from dated sessions, not from the weekday pattern', /buildStreakDays\(/.test(data) && !/scheduledWeekdays\.has\(weekdayName\)/.test(data))

  console.log(`\n${ran} checks ran. ${failures === 0 ? 'All passed.' : `${failures} FAILED.`}`)
  if (failures > 0) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
