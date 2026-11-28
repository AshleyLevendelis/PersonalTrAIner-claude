// HOW EACH LIFT FELT, FOR THE COACH (28 Nov 2026, docs/audits/coach-awareness-2026-11-28.md (a) 1). The coach's
// workout history dropped the Too easy / About right / Too hard he taps per lift. Held here by behaviour: the answer is
// read from the LAST working set through the same rule the weights use, warm-ups and drops never speak for the lift.
import { buildCoachLiftFeel, liftFeelAnswers, LIFT_FEEL_MAX_ANSWERS, LIFT_FEEL_MAX_LIFTS } from '../src/lib/lift-feel-context'
import { EFFORT_RPE, PROBE_RPE, effortFromRpe } from '../src/lib/lift-effort'
import type { ExerciseSetLog } from '../src/lib/types'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}
const set = (date: string, exercise_name: string, set_number: number, rpe: number | null, extra: Partial<ExerciseSetLog> = {}) =>
  ({ date, exercise_name, set_number, rpe, reps_completed: 8, weight_kg: 60, ...extra }) as ExerciseSetLog

console.log('1. The answer is the last working set\'s, read by the weights\' own rule')
{
  const logs = [
    set('2026-11-27', 'Bench Press', 1, null),
    set('2026-11-27', 'Bench Press', 2, null),
    set('2026-11-27', 'Bench Press', 3, EFFORT_RPE.easy),
  ]
  const a = liftFeelAnswers(logs)
  check('one answer for one lift on one day', a.length === 1, a)
  check('it is the tapped "too easy"', a[0]?.feel === 'easy', a)
  check('every stored answer reads back through effortFromRpe', (['easy', 'right', 'hard'] as const).every(k => effortFromRpe(EFFORT_RPE[k]) === k && effortFromRpe(PROBE_RPE[k]) === k))
  const text = buildCoachLiftFeel(logs)
  check('the block names the lift and his word and the date', /Bench Press: too easy \(2026-11-27\)/.test(text), text)
}

console.log('2. A warm-up row or a drop never speaks for the lift; an earlier set with an effort is not the answer')
{
  const logs = [
    set('2026-11-27', 'Squat', 1, 7),
    set('2026-11-27', 'Squat', 2, EFFORT_RPE.hard),
    set('2026-11-27', 'Squat', 3, EFFORT_RPE.easy, { is_warmup: true }),
    set('2026-11-27', 'Squat', 4, EFFORT_RPE.easy, { drop_index: 1 }),
  ]
  const a = liftFeelAnswers(logs)
  check('the warm-up and the drop are skipped: the working set 2 answers "too hard"', a.length === 1 && a[0].feel === 'hard', a)
  const only = liftFeelAnswers([set('2026-11-27', 'Squat', 1, EFFORT_RPE.easy), set('2026-11-27', 'Squat', 2, null)])
  check('a last working set with no effort means nothing was said, not set 1\'s number', only.length === 0, only)
}

console.log('3. Nothing said, nothing in the block')
check('no efforts gives an empty block', buildCoachLiftFeel([set('2026-11-27', 'Row', 1, null)]) === '')
check('no logs gives an empty block', buildCoachLiftFeel([]) === '')

console.log('4. Most recent first, a run of the same answer named, and the block stays short')
{
  const logs = [
    set('2026-11-20', 'Bench Press', 3, EFFORT_RPE.right),
    set('2026-11-24', 'Bench Press', 3, EFFORT_RPE.easy),
    set('2026-11-27', 'Bench Press', 3, EFFORT_RPE.easy),
  ]
  const text = buildCoachLiftFeel(logs)
  check('newest answer first', text.indexOf('2026-11-27') > -1 && text.indexOf('2026-11-27') < text.indexOf('2026-11-24'), text)
  check('"too easy" twice running is named', /too easy the last two times/.test(text), text)
  const right = buildCoachLiftFeel([set('2026-11-24', 'Row', 3, EFFORT_RPE.right), set('2026-11-27', 'Row', 3, EFFORT_RPE.right)])
  check('"about right" twice is not a run worth naming', !/last two times/.test(right), right)
  const mixed = buildCoachLiftFeel([set('2026-11-24', 'Row', 3, EFFORT_RPE.hard), set('2026-11-27', 'Row', 3, EFFORT_RPE.easy)])
  check('two different answers are not a run', !/last two times/.test(mixed), mixed)
  const many = Array.from({ length: 5 }, (_, i) => set(`2026-11-2${i}`, 'Deadlift', 3, EFFORT_RPE.right))
  const lines = buildCoachLiftFeel(many).split('\n').filter(l => l.startsWith('- '))
  check(`at most ${LIFT_FEEL_MAX_ANSWERS} answers a lift`, (lines[0]?.match(/\(2026-/g) ?? []).length === LIFT_FEEL_MAX_ANSWERS, lines)
  check('the ones kept are the newest', lines[0]?.includes('2026-11-24') && !lines[0]?.includes('2026-11-20'), lines)
  const lifts = Array.from({ length: 9 }, (_, i) => set('2026-11-27', `Lift ${i}`, 3, EFFORT_RPE.right))
  const n = buildCoachLiftFeel(lifts).split('\n').filter(l => l.startsWith('- ')).length
  check(`at most ${LIFT_FEEL_MAX_LIFTS} lifts`, n === LIFT_FEEL_MAX_LIFTS, n)
  check('the limits are small, not the whole history', LIFT_FEEL_MAX_LIFTS <= 8 && LIFT_FEEL_MAX_ANSWERS >= 2)
}

console.log(`${ran} checks ran`)
if (failures > 0) { console.log(`${failures} failed`); process.exit(1) }
console.log('PASS')
