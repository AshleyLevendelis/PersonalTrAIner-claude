// ---------------------------------------------------------------------------
// test:session-count — "DONE, WITH THE COUNT" (runs 3-4, M39).
//
// The tester finished a session at 5 of 18 sets and the strip and Home said
// "Done", the same as a full session. Ashley, 10 Oct 2026, from three options:
// Done, with the count ("5 of 18 sets") beside it. One count for the screen
// and the coach, so the two cannot say different fractions about one day.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import { sessionSetCount, shortOfPlan } from '../src/lib/session-count'
import { summariseTodayWork, todayWorkTotals } from '../src/lib/chat-plan-context'
import { dayLabel } from '../src/lib/week-glyphs'
import type { ExerciseSetLog, WorkoutDay } from '../src/lib/types'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`) }
}
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const session = {
  day: 'Monday', focus: 'Upper',
  exercises: [
    { id: 'bench', name: 'Bench Press', sets: 4, reps: '6-8', rest: 120 },
    { id: 'row', name: 'Dumbbell Row', sets: 3, reps: '8-10', rest: 90 },
    { id: 'curl', name: 'Biceps Curl', sets: 3, reps: '10-12', rest: 60 },
  ],
} as unknown as WorkoutDay
let n = 0
const log = (exercise_id: string | null, exercise_name: string, extra: Partial<ExerciseSetLog> = {}): ExerciseSetLog => ({
  id: `l${++n}`, exercise_id, exercise_name, set_number: n, weight_kg: 20, reps_completed: 8, is_warmup: false, drop_index: 0, ...extra,
} as unknown as ExerciseSetLog)
// 2 bench, a bench warm-up, a bench drop, 5 rows (two more than planned), and an off-plan lift.
const logs = [
  log('bench', 'Bench Press'), log('bench', 'Bench Press'),
  log('bench', 'Bench Press', { is_warmup: true }), log('bench', 'Bench Press', { drop_index: 1 }),
  ...Array.from({ length: 5 }, () => log('row', 'Dumbbell Row')),
  log(null, 'Face Pull'),
]

console.log('\n1. The count')
{
  const c = sessionSetCount(session, logs)
  check('planned is every planned working set: 4 + 3 + 3', c?.planned === 10, c)
  check('logged leaves out the warm-up and the drop, caps the rows at their 3, and ignores the off-plan lift: 2 + 3 + 0', c?.logged === 5, c)
  check('a name match counts a set logged without an id (through the chat)', sessionSetCount(session, [log(null, 'Biceps Curl')])?.logged === 1)
  check('nothing planned is no count, never "0 of 0"', sessionSetCount({ ...session, exercises: [] } as WorkoutDay, logs) === null && sessionSetCount(null, logs) === null)
  check('the same count the coach reads for today (one rule)', (() => { const t = todayWorkTotals(summariseTodayWork({ session, logs })!); return t.logged === c?.logged && t.planned === c?.planned })())
}

console.log('\n2. Said only when short')
{
  check('short: "5 of 10 sets"', shortOfPlan({ logged: 5, planned: 10 }) === '5 of 10 sets')
  check('all done: nothing extra to say', shortOfPlan({ logged: 10, planned: 10 }) === null)
  check('no count: nothing', shortOfPlan(null) === null)
  const day = { dayName: 'Monday', state: 'done' as const, swappedLine: null, session, workingLogs: logs }
  check('the strip says it aloud: "Monday: done, 5 of 10 sets"', dayLabel(day) === 'Monday: done, 5 of 10 sets', dayLabel(day))
  const full = Array.from({ length: 10 }, (_, i) => log(['bench', 'row', 'curl'][i < 4 ? 0 : i < 7 ? 1 : 2], ''))
  check('...and a full session is plain "done"', dayLabel({ ...day, workingLogs: full }) === 'Monday: done', dayLabel({ ...day, workingLogs: full }))
  check('a partly-done day that was never closed keeps its own word', dayLabel({ ...day, state: 'partial' }) === 'Monday: partly done')
}

console.log('\n3. Every place that says "Done" says the count')
{
  const home = code('src/components/Dashboard.tsx')
  check('Home: "Done · N of M sets" when short, "Done" when not',
    /data\.session\.setsPlanned > 0 && data\.session\.setsLogged < data\.session\.setsPlanned \? `Done · \$\{data\.session\.setsLogged\} of \$\{data\.session\.setsPlanned\} sets` : 'Done'/.test(home))
  const panel = code('src/components/exercise/TodayPanel.tsx')
  check('Exercise\'s finished bar uses the shared count for today', /const finishedShort = shortOfPlan\(sessionSetCount\(todayCell\?\.session, todayCell\?\.workingLogs\)\)/.test(panel) && /finishedShort \? `Done · \$\{finishedShort\}`/.test(panel))
  for (const f of ['src/components/HomeWeekStrip.tsx', 'src/components/exercise/WeekContextRow.tsx']) {
    check(`${f.split('/').pop()} speaks each cell through dayLabel(d), which carries the count`, /aria-label=\{dayLabel\(d\)\}/.test(code(f)))
  }
  const coach = code('src/lib/chat-plan-context.ts')
  check('the coach\'s "CLOSED at N of M" is the same count', /const t = sessionSetCount\(r\.session, r\.workingLogs\)/.test(coach))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} session-count check(s) FAILED`); process.exit(1) }
console.log('All session-count checks passed.')
