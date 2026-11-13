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

  // [3]-[5] RETIRED 13 Nov 2026 with the streak (his ruling: weekly consistency in place of it). What they held for
  // the streak, the week's own count holds: a moved session counts where it ran and a logged swap counts as done
  // (useTrainingWeek's dayCountsTowardWeek / dayCountsAsDone, test:workout-scenarios), and weeks on plan read those
  // weeks (test:coach-rhythm).
  console.log('\n[3] the streak is retired; history still lists only sessions')
  const { dayCountsAsDone } = await import('../src/hooks/useTrainingWeek')
  check('his 8 Nov "Count it as a session" survives in the week count: a logged swap is done, an empty one is not',
    dayCountsAsDone({ state: 'swapped', swapLogged: true } as never) && !dayCountsAsDone({ state: 'swapped', swapLogged: false } as never))

  console.log(`\n${ran} checks ran. ${failures === 0 ? 'All passed.' : `${failures} FAILED.`}`)
  if (failures > 0) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
