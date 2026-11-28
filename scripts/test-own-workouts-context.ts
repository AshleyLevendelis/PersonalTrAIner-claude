// THEIR OWN WORKOUTS, FOR THE COACH (28 Nov 2026, docs/audits/coach-awareness-2026-11-28.md (a) 2). The coach was told
// nothing about a workout started, planned or saved on Exercise. Held by behaviour: what the block says of each is the
// screen's own summary, a workout with nothing saved is not claimed as done, and only the window's days are named.
import { buildCoachOwnWorkouts, OWN_PAST_DAYS, OWN_AHEAD_DAYS } from '../src/lib/own-workouts-context'
import { ownWorkoutSummary, type OwnWorkout } from '../src/lib/own-workout'
import { planSummary, type OwnPlan } from '../src/lib/own-workout-plans'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}
const TODAY = '2026-11-28' // a Saturday
const lift = (name: string, done: number, total = 3) => ({
  kind: 'lift' as const, key: name, name, exerciseId: name.toLowerCase(), restSeconds: 90,
  sets: Array.from({ length: total }, (_, i) => ({ setNumber: i + 1, weight: '20', reps: '10', done: i < done })),
})
const workout = (extra: Partial<OwnWorkout>): OwnWorkout => ({
  id: 'w', date: TODAY, name: 'Arms', mode: 'live', startedAtIso: `${TODAY}T18:00:00Z`, finishedAtIso: null,
  items: [lift('Curl', 3), lift('Pushdown', 2)], ...extra,
})
const plan = (extra: Partial<OwnPlan>): OwnPlan => ({
  id: 'p', name: 'Push day', updatedAt: '2026-11-20T10:00:00Z', onDates: [],
  items: [{ kind: 'lift', key: 'a', name: 'Bench', exerciseId: 'bench', sets: 4, reps: '8', weight: '', restSeconds: 90 }], ...extra,
})

console.log('1. A workout running today, in the screen\'s words')
{
  const w = workout({})
  const t = buildCoachOwnWorkouts({ workouts: [w], plans: [], today: TODAY })
  check('named as today and in progress', /Today \(2026-11-28\): "Arms", in progress now/.test(t), t)
  check('the count is ownWorkoutSummary\'s', t.includes(ownWorkoutSummary(w)), t)
  check('the lifts with a saved set are named', /\(Curl, Pushdown\)/.test(t), t)
  const fin = buildCoachOwnWorkouts({ workouts: [workout({ finishedAtIso: `${TODAY}T19:00:00Z` })], plans: [], today: TODAY })
  check('a finished one today is done, not in progress', /"Arms", done/.test(fin) && !/in progress/.test(fin), fin)
  const after = buildCoachOwnWorkouts({ workouts: [workout({ mode: 'after' })], plans: [], today: TODAY })
  check('one told after the fact is done', /"Arms", done/.test(after), after)
}

console.log('2. Nothing saved is never claimed as done; the window is kept')
{
  const empty = workout({ date: '2026-11-26', items: [lift('Curl', 0)] })
  check('an old workout with no saved set is not named', buildCoachOwnWorkouts({ workouts: [empty], plans: [], today: TODAY }) === '')
  const startedEmpty = buildCoachOwnWorkouts({ workouts: [workout({ items: [lift('Curl', 0)] })], plans: [], today: TODAY })
  check('one just started today with nothing ticked is named as in progress, "Nothing logged yet"', /in progress now: Nothing logged yet/.test(startedEmpty), startedEmpty)
  const unlogged = workout({ items: [lift('Curl', 1), lift('Dips', 0)] })
  check('a lift with no saved set is not listed as done', !/Dips/.test(buildCoachOwnWorkouts({ workouts: [unlogged], plans: [], today: TODAY })))
  const old = workout({ date: '2026-11-20', finishedAtIso: 'x' })
  const edge = workout({ date: '2026-11-21', finishedAtIso: 'x', name: 'Edge' })
  const t = buildCoachOwnWorkouts({ workouts: [old, edge], plans: [], today: TODAY })
  check(`older than ${OWN_PAST_DAYS} days is left out, the ${OWN_PAST_DAYS}th day kept`, !/2026-11-20/.test(t) && /Saturday \(2026-11-21\): "Edge"/.test(t), t)
  const future = workout({ date: '2026-11-29' })
  check('a workout dated after today is not "done"', buildCoachOwnWorkouts({ workouts: [future], plans: [], today: TODAY }) === '')
  const y = buildCoachOwnWorkouts({ workouts: [workout({ date: '2026-11-27', finishedAtIso: 'x' })], plans: [], today: TODAY })
  check('yesterday is said as yesterday', /Yesterday \(2026-11-27\)/.test(y), y)
}

console.log('3. Planned days ahead, and the saved list')
{
  const p = plan({ onDates: ['2026-11-29', '2026-12-04', '2026-12-05', '2026-11-25'] })
  const t = buildCoachOwnWorkouts({ workouts: [], plans: [p], today: TODAY })
  check('tomorrow\'s plan is named with planSummary\'s count', /Planned for Tomorrow \(2026-11-29\): "Push day", /.test(t) && t.includes(planSummary(p)), t)
  check(`the ${OWN_AHEAD_DAYS}th day ahead is kept, the next is not, nor a past date`, /2026-12-04/.test(t) && !/2026-12-05/.test(t) && !/2026-11-25/.test(t), t)
  check('the saved list names it', /Saved workouts: Push day/.test(t), t)
  const gone = buildCoachOwnWorkouts({ workouts: [], plans: [plan({ deleted: true, onDates: ['2026-11-29'] })], today: TODAY })
  check('a deleted plan says nothing', gone === '', gone)
  const startedFrom = buildCoachOwnWorkouts({ workouts: [workout({ planId: 'p' })], plans: [plan({ onDates: [TODAY] })], today: TODAY })
  check('today\'s plan already started is not ALSO listed as still planned', !/Planned for Today/.test(startedFrom) && /in progress now/.test(startedFrom), startedFrom)
  const notStarted = buildCoachOwnWorkouts({ workouts: [], plans: [plan({ onDates: [TODAY] })], today: TODAY })
  check('today\'s plan not started yet is listed', /Planned for Today \(2026-11-28\)/.test(notStarted), notStarted)
  const many = Array.from({ length: 11 }, (_, i) => plan({ id: `p${i}`, name: `W${i}` }))
  check('a long saved list is cut, with the rest counted', /and 3 more/.test(buildCoachOwnWorkouts({ workouts: [], plans: many, today: TODAY })))
}

console.log('4. His ruling, "Comment, kindly", travels with the block')
check('the block tells the coach to comment kindly, never a telling-off', /Comment on one kindly.*never as a telling-off/.test(buildCoachOwnWorkouts({ workouts: [workout({})], plans: [], today: TODAY })))

console.log(`${ran} checks ran`)
if (failures > 0) { console.log(`${failures} failed`); process.exit(1) }
console.log('PASS')
