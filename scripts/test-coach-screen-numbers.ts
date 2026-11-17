// ONE PICTURE FOR THE SCREENS AND THE COACH: stage 3 of docs/plans/coach-reaches-everything.md (his "start step 2 then
// 3 then 4", 17 Nov 2026). The coach must never say a number the screen does not show ("the coach said 1,983 kcal left
// while the screen said 1,950"). A survey of every figure the coach is given (17 Nov 2026) found most already share the
// screens' readers; four did not. Each is held here by BEHAVIOUR (same inputs, same answer), and the wiring by source.
//   1. today's "N of M sets": the coach's header used its own copy of the screens' count, on a different session row;
//   2. calories left: the coach was given eaten and target and did the subtraction itself;
//   3. the week turning over: the coach's "SPEAK UP, new week" used millisecond arithmetic from the creation instant,
//      the screens use whole local days (6 Oct 2026 ruling);
//   4. what was eaten on past days: a second copy of which meal events count as eaten.
import { readFileSync } from 'node:fs'
import { sessionSetCount } from '../src/lib/session-count'
import { summariseTodayWork, todayWorkTotals, buildCoachPhaseBrief } from '../src/lib/chat-plan-context'
import { coachTodayCalories, todayScreenCell } from '../src/lib/coach-screen-numbers'
import { kcalPillText } from '../src/lib/chat-context-strip'
import { isEatenEvent } from '../src/lib/meal-store'
import type { WorkoutDay, ExerciseSetLog } from '../src/lib/types'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('1. Today\'s "N of M sets": the coach and the screens give one answer')
const ex = (id: string, name: string, sets: number, extra: Record<string, unknown> = {}) => ({ id, name, sets, reps: '8', ...extra })
const session = {
  day: 'Tuesday', focus: 'Legs',
  exercises: [
    ex('p', 'Hip Circles', 2, { tier: 'tier_0_primer' }),
    ex('a', 'Barbell Back Squat', 3),
    ex('b', 'Romanian Deadlift', 3),
    ex('c', 'Leg Curl', 2),
  ],
} as unknown as WorkoutDay
const log = (exercise_id: string, exercise_name: string, set_number: number, extra: Record<string, unknown> = {}) =>
  ({ exercise_id, exercise_name, set_number, reps: 8, weight_kg: 60, ...extra }) as unknown as ExerciseSetLog
const logSets: ExerciseSetLog[][] = [
  [],
  [log('a', 'Barbell Back Squat', 1), log('a', 'Barbell Back Squat', 2)],
  // An extra fourth squat, a warm-up row and a prep row: none of them may change the count.
  [log('a', 'Barbell Back Squat', 1), log('a', 'Barbell Back Squat', 2), log('a', 'Barbell Back Squat', 3), log('a', 'Barbell Back Squat', 4),
    log('a', 'Barbell Back Squat', 0, { is_warmup: true }), log('p', 'Hip Circles', 1), log('b', 'Romanian Deadlift', 1)],
  [log('a', 'Barbell Back Squat', 1), log('a', 'Barbell Back Squat', 2), log('a', 'Barbell Back Squat', 3),
    log('b', 'Romanian Deadlift', 1), log('b', 'Romanian Deadlift', 2), log('b', 'Romanian Deadlift', 3), log('c', 'Leg Curl', 1), log('c', 'Leg Curl', 2)],
]
for (const [i, logs] of logSets.entries()) {
  const screen = sessionSetCount(session, logs)
  const work = summariseTodayWork({ session, logs })
  const coach = work ? todayWorkTotals(work) : null
  check(`case ${i + 1}: the coach's count equals the screens' (${screen?.logged} of ${screen?.planned})`,
    !!screen && !!coach && coach.logged === screen.logged && coach.planned === screen.planned, { screen, coach })
}
const days = [{ date: '2026-11-17', session, workingLogs: logSets[1] }, { date: '2026-11-18', session: null, workingLogs: [] }]
check('todayScreenCell finds the dated cell the strip draws', todayScreenCell(days as never, '2026-11-17')?.workingLogs?.length === 2)
check('...and nothing for a date the week does not hold', todayScreenCell(days as never, '2026-12-01') === null)

const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
const usesCell = (chat.match(/todayScreenCell\(trainingWeek\.days, activeSession\.date\)/g) ?? []).length
check('the chat strip AND the coach\'s context take today\'s cell from the one function', usesCell >= 2, usesCell)
check('the coach\'s header is given the screens\' count', /screenCount: .*todayScreenCell\(trainingWeek\.days, activeSession\.date\).*sessionSetCount\(cell\.session, cell\.workingLogs\)/.test(chat))
const ctx = strip(readFileSync('src/lib/chat-plan-context.ts', 'utf8'))
check("...and the header prefers it over its own join", /today\.screenCount\?\.logged \?\?/.test(ctx) && /today\.screenCount\?\.planned \?\?/.test(ctx))

console.log('\n2. Calories left: the app says it, in the screen\'s words; the coach never subtracts')
const line = coachTodayCalories(2400, 990.6)
check('the coach is given the strip\'s own words', line.startsWith(kcalPillText(2400, 990.6)), line)
check('...with what was eaten and the target beside it', /eaten 991 of 2,400 kcal/.test(line), line)
check('...and over the target says over', /kcal over/.test(coachTodayCalories(2000, 2150)), coachTodayCalories(2000, 2150))
check('the coach\'s context sends it, from the strip\'s own eaten figure', /today_calories: .*coachTodayCalories\(/.test(chat) && /screenEatenKcal\(/.test(chat))
const server = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
check('the coach is told to quote it and never subtract', /context\.today_calories/.test(server) && /never (?:work it out|subtract)/i.test(server))

console.log('\n3. The week turning over: the screens\' whole local days, not milliseconds')
// A plan made on a Thursday at 22:00. Week 2 begins at local midnight on the next Thursday. He chatted on that
// Thursday at 10:00, already in week 2: the old arithmetic put the turnover at 22:00 and said "SPEAK UP" the next day.
const brief = (lastChatAt: string, now: string) => buildCoachPhaseBrief({
  activeWeek: 2, totalWeeks: 16, week: { week_number: 2, phase_label: 'Build' } as never,
  planCreatedAt: new Date(2026, 10, 5, 22, 0).toISOString(), now: new Date(now), lastChatAt,
})
check('a chat already in week 2 gets no "the week has turned over"',
  !/week has turned over/.test(brief(new Date(2026, 10, 12, 10, 0).toISOString(), new Date(2026, 10, 13, 9, 0).toISOString())))
check('...a chat in week 1 still does', /week has turned over/.test(brief(new Date(2026, 10, 11, 20, 0).toISOString(), new Date(2026, 10, 13, 9, 0).toISOString())))

console.log('\n4. What was eaten: one rule for which meal events count')
check('the three eaten kinds count', ['confirmed', 'swapped_in', 'extra'].every(t => isEatenEvent({ eventType: t })))
check('...and nothing else does', !['skipped', 'planned', 'removed', ''].some(t => isEatenEvent({ eventType: t })))
const store = strip(readFileSync('src/lib/meal-store.ts', 'utf8'))
const body = (name: string) => { const i = store.indexOf(name); return i < 0 ? '' : store.slice(i, store.indexOf('\n}\n', i)) }
check('the screens\' total (eatenFrom) uses it', /filter\(isEatenEvent\)/.test(body('function eatenFrom')))
check('the coach\'s past days (getEatenByDate) use it, with no copy of the list', /isEatenEvent\(/.test(body('export async function getEatenByDate')) && !/'swapped_in'/.test(body('export async function getEatenByDate')))

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} FAILED.`); process.exit(1) }
console.log('The coach and the screens read the same numbers.')
