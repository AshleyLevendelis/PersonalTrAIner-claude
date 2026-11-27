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

console.log('\n1b. Movement prep is a warm-up, not a working set (whole-app QA walk, 7 Nov 2026)')
{
  // Program said "18 sets" and Today and Home "20 working sets" for one day: 2 sets of Arm Circles were counted on two
  // screens and not on the third. Both the plan's own tag and the catalogue's say a row is movement prep.
  const withPrep = { ...session, exercises: [
    { id: 'circles', name: 'Arm Circles', sets: 2, reps: '10', rest: '0s', tier: 'tier_0_primer' },
    // Rest as the plan writes it ("90s"): the day length reads the text.
    ...(session.exercises as { rest: number }[]).map(e => ({ ...e, rest: `${e.rest}s` })),
  ] } as unknown as WorkoutDay
  const prepLogs = [...logs, log('circles', 'Arm Circles'), log('circles', 'Arm Circles')]
  const c = sessionSetCount(withPrep, prepLogs)
  check('two sets of movement prep add nothing to planned (still 10)', c?.planned === 10, c)
  check('...nor to logged when they are ticked (still 5)', c?.logged === 5, c)
  const untagged = { ...withPrep, exercises: withPrep.exercises.map(e => e.name === 'Arm Circles' ? { ...e, tier: undefined } : e) } as WorkoutDay
  check('a primer the plan did not tag is still known by the catalogue', sessionSetCount(untagged, prepLogs)?.planned === 10, sessionSetCount(untagged, prepLogs))
  const { dayLengthParts } = await import('../src/lib/session-duration')
  check('the same number Program prints for the day', dayLengthParts(withPrep).workingSets === c?.planned, { program: dayLengthParts(withPrep).workingSets, count: c?.planned })
  const t = todayWorkTotals(summariseTodayWork({ session: withPrep, logs: prepLogs })!)
  check('...and the coach reads the same count for today', t.planned === c?.planned && t.logged === c?.logged, { coach: t, count: c })
  // THE SUMMARY: a ticked prep set is neither a planned set done nor "+1 extra" (cardio-shows: "0/15 planned sets +1
  // extra" after one tick of Arm Circles). TodayPanel hands the day's prep rows over; asked here through the function.
  const { computeSessionSummary } = await import('../src/lib/session-derive')
  const { isMovementPrepRow } = await import('../src/lib/session-duration')
  const work = withPrep.exercises.filter(e => !isMovementPrepRow(e)).map(e => ({ id: e.id, name: e.name, sets: e.sets }))
  const prep = withPrep.exercises.filter(e => isMovementPrepRow(e)).map(e => ({ id: e.id, name: e.name }))
  const at = '2026-11-07T10:00:00Z'
  const sum = computeSessionSummary(prepLogs, work, at, at, prep)
  const noPrepTicked = computeSessionSummary(logs, work, at, at, prep)
  check('the session summary counts no prep tick as extra work (two Arm Circles ticks change nothing)',
    sum.extraSets === noPrepTicked.extraSets && sum.setsCompleted === noPrepTicked.setsCompleted && sum.setsPrescribed === 10,
    { withTicks: sum.extraSets, without: noPrepTicked.extraSets, planned: sum.setsPrescribed })
  check('...where without the prep list the same ticks WOULD read as two extra (the check binds)',
    computeSessionSummary(prepLogs, work, at, at).extraSets === noPrepTicked.extraSets + 2)
  // A WARM-UP MOVE LEFT UNDONE IS NAMED (his report 27 Nov 2026: "I didn't log Prone Y-T Raises but the app said I
  // logged 14/14 sets"): the fraction still counts working sets only, and the card says which prep was not logged.
  const prepSized = withPrep.exercises.filter(e => isMovementPrepRow(e)).map(e => ({ id: e.id, name: e.name, sets: e.sets }))
  const undone = computeSessionSummary(logs, work, at, at, prepSized)
  check('a warm-up move with no sets is named as not logged, and the fraction is unchanged',
    JSON.stringify(undone.prepNotLogged) === JSON.stringify(prepSized.map(p => p.name)) && undone.setsPrescribed === 10, undone.prepNotLogged)
  check('...and once its sets are ticked it is not named', computeSessionSummary(prepLogs, work, at, at, prepSized).prepNotLogged?.length === 0)
  check('Today hands the summary each prep row\'s sets, and the card draws the line',
    /prep: workout\.exercises\.filter\(ex => isMovementPrepRow\(ex\)\)\.map\(ex => \(\{ id: ex\.id, name: ex\.name, sets: ex\.sets \}\)\)/.test(code('src/components/exercise/TodayPanel.tsx'))
    && /data-testid="summary-prep-not-logged"[\s\S]{0,120}Not logged: \{data\.summary\.prepNotLogged!\.join/.test(code('src/components/exercise/SessionSummaryDialog.tsx')))
  // RE-ANCHORED 19 Nov 2026: the rows now come from one helper (summaryRowsOf), because the summary is worked out in
  // two places (at Finish, and again as the sets stand after it). The property is unchanged: both are handed the
  // day's movement-prep rows, taken from the plan by the one prep test.
  const today = code('src/components/exercise/TodayPanel.tsx')
  const rowsOf = today.slice(today.indexOf('function summaryRowsOf('), today.indexOf('export function TodayPanel('))
  check('Today hands the summary the day\'s prep rows', /const \{ planned: plannedExercises, prep: prepRows \} = summaryRowsOf\(workout\)/.test(today)
    && /computeSessionSummary\(logs, plannedExercises, result\.startedAtIso, result\.finishedAtIso, prepRows\)/.test(today)
    && /prep: workout\.exercises\.filter\(ex => isMovementPrepRow\(ex\)\)/.test(rowsOf) && /planned: workout\.exercises\.filter\(ex => !isMovementPrepRow\(ex\)\)/.test(rowsOf))
  check('...and so does the summary as it stands after Finish', /const \{ planned, prep \} = summaryRowsOf\(workout\)\s*return \{ \.\.\.summaryData, summary: summaryAsItStands\(summaryData\.summary, logs, planned, prep\) \}/.test(today))
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
  // RE-ANCHORED 10 Oct 2026 (design handoff 2a): Home's Done panel prints
  // "{logged}/{planned} sets", and both now come from the SHARED count off the
  // week's own cell — the M39 "one count" rule, tighter than before.
  check('Home: the Done panel shows the shared count, "N/M" sets',
    /const shared = sessionSetCount\(todayCell\?\.session, todayCell\?\.workingLogs\)/.test(home)
    && /\{setsLogged\}\/\{setsPlanned\}/.test(home))
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
