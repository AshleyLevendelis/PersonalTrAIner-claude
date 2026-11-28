// HOW A LIFT FELT, TOLD TO THE COACH: the shared planner (28 Nov 2026, coach-awareness audit (b) 2). Held by behaviour:
// the row written is the lift's last working set as logged, with the number the screen's tap stores; the lift comes from
// the day's log by his words (two that fit are asked about); nothing is guessed; the card never promises a weight change
// in a deload week.
import { planLiftEffort, readLiftEffort, LIFT_EFFORT_REFUSALS } from '../src/lib/coach-routes/lift-effort'
import { EFFORT_RPE, effortFromRpe } from '../src/lib/lift-effort'
import type { ExerciseSetLog } from '../src/lib/types'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}
const set = (exercise_name: string, set_number: number, weight_kg: number, extra: Partial<ExerciseSetLog> = {}) =>
  ({ date: '2026-11-28', exercise_name, exercise_id: exercise_name.toLowerCase(), set_number, weight_kg, reps_completed: 8, unit: 'kg', is_bodyweight: false, rpe: null, ...extra }) as ExerciseSetLog
const day = [
  set('Barbell Bench Press', 1, 60, { is_warmup: true }),
  set('Barbell Bench Press', 1, 80), set('Barbell Bench Press', 2, 80), set('Barbell Bench Press', 3, 80, { reps_completed: 7 }),
  set('Barbell Bench Press', 3, 60, { drop_index: 1 }),
  set('Dumbbell Row', 1, 30), set('Dumbbell Row', 2, 30),
  set('Incline Dumbbell Press', 1, 24),
]
const plan = (lift: string, said: string, extra: Partial<Parameters<typeof planLiftEffort>[0]> = {}) =>
  planLiftEffort({ logs: day, lift, said, dayWords: 'today', ...extra })

console.log('1. His words for how it felt: a closed list, nothing else guessed')
check('"easy", "too easy", "light" are too easy', ['easy', 'Too easy!', 'light'].every(w => readLiftEffort(w) === 'easy'))
check('"fine", "about right", "spot on" are about right', ['fine', 'About right', 'spot on'].every(w => readLiftEffort(w) === 'right'))
check('"hard", "heavy", "brutal" are too hard', ['hard', 'heavy', 'brutal'].every(w => readLiftEffort(w) === 'hard'))
check('anything else is asked about', readLiftEffort('meh') === null && readLiftEffort('easy-ish') === null)
check('an unknown word refuses with the question', (p => !p.ok && p.reason === LIFT_EFFORT_REFUSALS.word)(plan('bench', 'meh')))

console.log('2. The row: the last WORKING set as logged, with the tap\'s own number')
{
  const p = plan('bench', 'too easy')
  check('it plans', p.ok, p)
  if (p.ok) {
    check('the lift is found by his word', p.lift === 'Barbell Bench Press', p.lift)
    check('the last working set, not the warm-up or the drop', p.set.set_number === 3 && p.set.weight_kg === 80 && !p.set.is_warmup && !p.set.drop_index, p.set)
    check('its weight and reps are untouched', p.set.reps_completed === 7, p.set)
    check('the number is EFFORT_RPE\'s, read back as the same word', p.rpe === EFFORT_RPE.easy && effortFromRpe(p.rpe) === 'easy', p.rpe)
    check('the card asks, names the lift and the answer', /^Want me to put Barbell Bench Press down as too easy\?/.test(p.lead), p.lead)
    check('the card row shows before and after', p.row.before === 'not said' && p.row.after === 'too easy', p.row)
    check('outside a deload week it says the next weight takes it into account', /next weight for it takes that into account/.test(p.lead), p.lead)
  }
}

console.log('3. Finding the lift: words he used, two that fit are asked about, none is said')
{
  const both = plan('dumbbell press', 'hard')
  check('one lift with both words: found', both.ok && both.lift === 'Incline Dumbbell Press', both)
  const two = plan('dumbbell', 'hard')
  check('two that fit: asked which, with both offered', !two.ok && two.reason === LIFT_EFFORT_REFUSALS.which && two.choices?.length === 2, two)
  const none = plan('squat', 'hard')
  check('not logged that day: said, with the day\'s lifts offered', !none.ok && none.reason === LIFT_EFFORT_REFUSALS.noLift('today') && (none.choices ?? []).includes('Dumbbell Row'), none)
  const exact = plan('Dumbbell Row', 'fine')
  check('an exact name wins', exact.ok && exact.lift === 'Dumbbell Row', exact)
  const empty = planLiftEffort({ logs: [set('Barbell Bench Press', 1, 60, { is_warmup: true })], lift: 'bench', said: 'easy', dayWords: 'today' })
  check('only warm-ups logged: nothing to put it on', !empty.ok && empty.reason === LIFT_EFFORT_REFUSALS.none('today'), empty)
  const tiny = plan('in', 'easy')
  check('a fragment too short to be a word finds nothing', !tiny.ok, tiny)
  const dropFirst = planLiftEffort({ logs: [set('Squat', 3, 70, { drop_index: 1 }), set('Squat', 1, 100), set('Squat', 3, 100)], lift: 'squat', said: 'hard', dayWords: 'today' })
  check('a drop row read before its parent never stands in for the last working set', dropFirst.ok && dropFirst.set.weight_kg === 100 && !dropFirst.set.drop_index, dropFirst)
  const near = planLiftEffort({ logs: [set('Dumbbell Row', 1, 30), set('Dumbbell Row Single Arm', 1, 20)], lift: 'Dumbbell Row', said: 'fine', dayWords: 'today' })
  check('the exact name wins over a longer name holding the same words', near.ok && near.lift === 'Dumbbell Row', near)
}

console.log('4. Short lifts, repeats and deload weeks')
{
  const short = plan('row', 'too hard', { prescribedSets: n => (n === 'Dumbbell Row' ? 3 : null) })
  check('a lift stopped short is still allowed, and the card says how far it got', short.ok && short.short && /after 2 of 3 sets/.test(short.lead), short)
  const full = plan('bench', 'too hard', { prescribedSets: () => 3 })
  check('a full lift says nothing about being short', full.ok && !full.short && !/after \d of/.test(full.lead), full)
  const said = planLiftEffort({ logs: [set('Dumbbell Row', 1, 30, { rpe: EFFORT_RPE.easy })], lift: 'row', said: 'easy', dayWords: 'today' })
  check('the same answer again changes nothing and says so', !said.ok && /already down as too easy/.test(said.reason), said)
  const changed = planLiftEffort({ logs: [set('Dumbbell Row', 1, 30, { rpe: EFFORT_RPE.easy })], lift: 'row', said: 'hard', dayWords: 'today' })
  check('a different answer replaces it, before shown', changed.ok && changed.row.before === 'too easy' && changed.row.after === 'too hard', changed)
  const deload = plan('bench', 'easy', { deloadWeek: true })
  check('a deload week: kept, and no promise about the next weight', deload.ok && /deload week, so it's kept but the next weight goes by your plan/.test(deload.lead) && !/takes that into account/.test(deload.lead), deload)
}

console.log(`${ran} checks ran`)
if (failures > 0) { console.log(`${failures} failed`); process.exit(1) }
console.log('PASS')
