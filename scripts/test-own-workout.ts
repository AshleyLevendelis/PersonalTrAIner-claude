import { readFileSync } from 'fs'
// ---------------------------------------------------------------------------
// YOUR OWN WORKOUT (his request 25 Nov 2026). The rules under the screen, which verify:own-workout drives:
//   1. a set's number runs on after every set already on that date for that lift, so it can never write over the
//      plan's set or an earlier workout's (the database keys a set by date, lift and number);
//   2. another set is filled with the last one's numbers; a new lift starts with one empty set;
//   3. what can be saved: reps he typed, a weight that reads (blank is bodyweight); cardio needs all three answers;
//   4. the day's line counts what was SAVED, never what was typed;
//   5. his rest steps from 30 s to 5 min and holds at both ends;
//   6. the phone keeps the list, replaces by id, and drops nothing it was not asked to.
// ---------------------------------------------------------------------------

import {
  nextOwnSetNumber, newOwnLift, withAnotherSet, setIsSavable, cardioIsSavable, newOwnCardio, ownWorkoutSummary,
  stepOwnRest, restWords, readWeight, readReps, newOwnWorkout, saveOwnWorkout, loadOwnWorkouts, ownWorkoutsOn,
  removeOwnWorkout, hasAnythingSaved, OWN_DEFAULT_REST, type OwnWorkout,
} from '../src/lib/own-workout'
import {
  mergePlans, workoutFromPlan, planProblem, stepPlanSets, planSummary, newOwnPlan, newPlanLift, newPlanCardio, saveOwnPlan,
  ownPlans, ownPlansOn, setPlanOnDate, deleteOwnPlan, type OwnPlan,
} from '../src/lib/own-workout-plans'
import { setSupabaseClient } from '../src/lib/supabase'

const sent: Array<Record<string, unknown>> = []
setSupabaseClient({
  from: () => ({ upsert: (row: Record<string, unknown>) => { sent.push(row); return Promise.resolve({ error: null }) } }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any)

const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: k => store.get(k) ?? null,
  setItem: (k, v) => { store.set(k, v) },
  removeItem: k => { store.delete(k) },
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name} ${JSON.stringify(detail)}`) }
}

console.log('\n1. Set numbers run on after the day\'s')
check('nothing on the day: set 1', nextOwnSetNumber([], { sets: [] }) === 1)
check('the plan logged sets 1-3 of this lift today: his own starts at 4', nextOwnSetNumber([1, 2, 3], { sets: [] }) === 4)
check('a gap is never filled (sets 1 and 5 taken): 6', nextOwnSetNumber([1, 5], { sets: [] }) === 6, nextOwnSetNumber([1, 5], { sets: [] }))
check('his own sets count too: taken [2], his [3, 4]: 5', nextOwnSetNumber([2], { sets: [{ setNumber: 3, weight: '', reps: '', done: true }, { setNumber: 4, weight: '', reps: '', done: false }] }) === 5)
const fresh = newOwnLift('Barbell Bench Press', 'barbell-bench-press', [1, 2])
check('a new lift starts with ONE empty set, numbered after the day\'s', fresh.sets.length === 1 && fresh.sets[0].setNumber === 3 && fresh.sets[0].weight === '' && !fresh.sets[0].done, fresh.sets)
check('...and the default rest', fresh.restSeconds === OWN_DEFAULT_REST && OWN_DEFAULT_REST === 90)

console.log('\n2. Another set')
const typed = { ...fresh, sets: [{ ...fresh.sets[0], weight: '60', reps: '8', done: true }] }
const more = withAnotherSet(typed, [1, 2])
check('another set is the next number, filled with the last one\'s numbers, not done', more.sets.length === 2 && more.sets[1].setNumber === 4 && more.sets[1].weight === '60' && more.sets[1].reps === '8' && !more.sets[1].done, more.sets)
check('...and the one before it is untouched', more.sets[0].done && more.sets[0].setNumber === 3)

console.log('\n3. What can be saved')
check('60 x 8 saves', setIsSavable({ weight: '60', reps: '8' }))
check('blank weight is bodyweight (0) and saves', readWeight('') === 0 && setIsSavable({ weight: '', reps: '12' }))
check('"62,5" reads as 62.5', readWeight('62,5') === 62.5)
check('no reps: not saved', !setIsSavable({ weight: '60', reps: '' }))
check('0 reps, 2.5 reps and 500 reps: not saved', readReps('0') == null && readReps('2.5') == null && readReps('500') == null)
check('a weight that is not a number: not saved', !setIsSavable({ weight: 'heavy', reps: '5' }) && readWeight('-5') == null)
const c0 = newOwnCardio('Run', '30')
check('cardio with no effort chosen: not saved (the app never picks one for him)', !cardioIsSavable(c0))
check('cardio with all three: saved', cardioIsSavable({ ...c0, effort: 'steady' }))
check('cardio with no minutes, or no activity: not saved', !cardioIsSavable({ ...c0, minutes: '', effort: 'easy' }) && !cardioIsSavable({ ...c0, activity: ' ', effort: 'easy' }))

console.log('\n4. The day\'s line counts what was saved')
const w0 = newOwnWorkout('2026-11-25', 'live', '2026-11-25T08:00:00.000Z')
check('nothing in it: "Nothing logged yet"', ownWorkoutSummary(w0) === 'Nothing logged yet' && !hasAnythingSaved(w0))
const w1: OwnWorkout = { ...w0, items: [{ ...more }, { ...newOwnLift('Leg Press', 'leg-press', []), sets: [{ setNumber: 1, weight: '100', reps: '10', done: false }] }, { ...c0, effort: 'hard', done: true }] }
check('one lift with 1 saved set, one lift only typed, one cardio: "1 exercise · 1 set · 1 cardio"', ownWorkoutSummary(w1) === '1 exercise · 1 set · 1 cardio', ownWorkoutSummary(w1))
check('...and it has something saved', hasAnythingSaved(w1))
check('plural: two saved sets read "2 sets"', ownWorkoutSummary({ ...w0, items: [{ ...more, sets: more.sets.map(s => ({ ...s, done: true })) }] }) === '1 exercise · 2 sets')

console.log('\n5. His rest')
check('90 s up one is 2 min; down one is 75 s', stepOwnRest(90, 1) === 120 && stepOwnRest(90, -1) === 75)
check('held at 30 s and at 5 min', stepOwnRest(30, -1) === 30 && stepOwnRest(300, 1) === 300)
check('an odd length steps to the next on the list either way (100: up 120, down 90)', stepOwnRest(100, 1) === 120 && stepOwnRest(100, -1) === 90, [stepOwnRest(100, 1), stepOwnRest(100, -1)])
check('said as "45s", "1:30", "2 min"', restWords(45) === '45s' && restWords(90) === '1:30' && restWords(120) === '2 min')

console.log('\n6. Kept on the phone')
const a = { ...w0, id: 'a', date: '2026-11-25' }
const b = { ...w0, id: 'b', date: '2026-11-24', startedAtIso: '2026-11-24T08:00:00.000Z' }
check('saved', saveOwnWorkout('p1', a) && saveOwnWorkout('p1', b))
check('read back by date', ownWorkoutsOn('p1', '2026-11-25').map(w => w.id).join() === 'a' && loadOwnWorkouts('p1').length === 2)
saveOwnWorkout('p1', { ...a, name: 'Push day' })
check('saving the same id replaces it, never a second copy', loadOwnWorkouts('p1').length === 2 && ownWorkoutsOn('p1', '2026-11-25')[0].name === 'Push day')
check('another person\'s list is their own', loadOwnWorkouts('p2').length === 0)
removeOwnWorkout('p1', 'a')
check('removing one leaves the other', loadOwnWorkouts('p1').map(w => w.id).join() === 'b')
store.set('fitplan_own_workouts_v1:p3', '{not json')
check('a damaged copy reads as nothing, never a crash', loadOwnWorkouts('p3').length === 0)
store.set('fitplan_own_workouts_v1:p4', JSON.stringify({ not: 'a list' }))
store.set('fitplan_own_workouts_v1:p5', JSON.stringify([{ id: 'ok', date: '2026-11-25', items: [] }, { junk: true }, null]))
check('a copy that is not a list reads as nothing; a list keeps only real workouts', loadOwnWorkouts('p4').length === 0 && loadOwnWorkouts('p5').map(w => w.id).join() === 'ok')

console.log('\n7. My workouts: built ahead, kept, started')
const empty = newOwnPlan('2026-11-25T08:00:00.000Z')
check('a workout needs a name, then one thing in it; nothing else', planProblem(empty) === 'Give it a name.' && planProblem({ ...empty, name: 'Push' }) === 'Add an exercise or a cardio.' && planProblem({ ...empty, name: 'Push', items: [newPlanCardio('Run', '20')] }) === null)
check('a whitespace name is no name', planProblem({ ...empty, name: '   ', items: [newPlanCardio('Run', '20')] }) === 'Give it a name.')
const bench = newPlanLift('Barbell Bench Press')
check('an exercise goes in at 3 sets of 8-10, 90 s rest, its catalogue id', bench.sets === 3 && bench.reps === '8-10' && bench.restSeconds === 90 && bench.exerciseId === 'barbell-bench-press', bench)
check('sets step 1 to 10 and hold there', stepPlanSets(1, -1) === 1 && stepPlanSets(10, 1) === 10 && stepPlanSets(3, 1) === 4)
const push: OwnPlan = { ...empty, id: 'push', name: 'Push', items: [{ ...bench, sets: 4, reps: '6-8', weight: '60', restSeconds: 120 }, newPlanCardio('Run', '20')] }
check('"1 exercise · 4 sets · 1 cardio"', planSummary(push) === '1 exercise · 4 sets · 1 cardio', planSummary(push))
const started = workoutFromPlan(push, '2026-11-26', 'live', '2026-11-26T07:00:00.000Z', id => (id === 'barbell-bench-press' ? [1, 2] : []))
const sl = started.items[0]
check('started: named as saved, from the plan, live', started.name === 'Push' && started.planId === 'push' && started.mode === 'live' && started.date === '2026-11-26')
check('...4 sets with his weight and the FIRST number of his reps in the boxes, nothing done', sl.kind === 'lift' && sl.sets.length === 4 && sl.sets.every(x => x.weight === '60' && x.reps === '6' && !x.done), sl)
check('...numbered after the day\'s sets 1 and 2: 3, 4, 5, 6', sl.kind === 'lift' && sl.sets.map(x => x.setNumber).join() === '3,4,5,6', sl.kind === 'lift' ? sl.sets.map(x => x.setNumber) : null)
check('...his rest, and the cardio with its minutes and no effort chosen', sl.kind === 'lift' && sl.restSeconds === 120 && started.items[1].kind === 'cardio' && started.items[1].minutes === '20' && started.items[1].effort === null)
check('reps with no number ("AMRAP") leave the box empty', workoutFromPlan({ ...push, items: [{ ...bench, reps: 'AMRAP' }] }, '2026-11-26', 'live', '', () => []).items[0].kind === 'lift' && (workoutFromPlan({ ...push, items: [{ ...bench, reps: 'AMRAP' }] }, '2026-11-26', 'live', '', () => []).items[0] as { sets: { reps: string }[] }).sets[0].reps === '')

console.log('\n8. Two phones meet')
const L: OwnPlan = { ...push, updatedAt: '2026-11-25T10:00:00.000Z' }
const Rold: OwnPlan = { ...push, name: 'Old', updatedAt: '2026-11-25T09:00:00.000Z' }
const Rnew: OwnPlan = { ...push, name: 'Newer', updatedAt: '2026-11-25T11:00:00.000Z' }
const m1 = mergePlans([L], [Rold])
check('the phone\'s newer edit wins and is sent', m1.merged[0].name === 'Push' && m1.toSend.length === 1)
const m2 = mergePlans([L], [Rnew])
check('the table\'s newer edit wins and nothing is sent', m2.merged[0].name === 'Newer' && m2.toSend.length === 0)
const m3 = mergePlans([], [{ ...push, id: 'other' }])
check('one only on the table comes to the phone', m3.merged.length === 1 && m3.merged[0].id === 'other')
const m4 = mergePlans([{ ...L, deleted: true, updatedAt: '2026-11-25T12:00:00.000Z' }], [Rnew])
check('a removal made later wins over an older edit on another phone, and is sent', m4.merged[0].deleted === true && m4.toSend.length === 1)

console.log('\n9. Kept on the phone, sent on')
saveOwnPlan('p9', push, '2026-11-25T10:00:00.000Z')
check('saved: listed, and sent to the table', ownPlans('p9').length === 1 && sent.some(r => r.id === 'push' && r.user_id === 'p9' && r.name === 'Push'))
setPlanOnDate('p9', 'push', '2026-11-27', true, '2026-11-25T10:01:00.000Z')
setPlanOnDate('p9', 'push', '2026-11-27', true, '2026-11-25T10:02:00.000Z')
check('put on a day (twice is still once)', JSON.stringify(ownPlans('p9')[0].onDates) === '["2026-11-27"]' && ownPlansOn('p9', '2026-11-27').length === 1)
setPlanOnDate('p9', 'push', '2026-11-27', false, '2026-11-25T10:03:00.000Z')
check('taken off it, still saved', ownPlansOn('p9', '2026-11-27').length === 0 && ownPlans('p9').length === 1)
deleteOwnPlan('p9', 'push', '2026-11-25T10:04:00.000Z')
check('deleted: gone from the list, sent as removed', ownPlans('p9').length === 0 && sent[sent.length - 1]?.deleted === true)

console.log('\n8. The plan\'s hard stops hold on his own workout (his ruling 28 Nov 2026, "Same hard stop as the plan")')
{
  const { ownPlanHardStop } = await import('../src/lib/own-workout-plans')
  const { getExerciseEntry } = await import('../src/lib/exercise-db')
  const { effectiveLoadingCeilingKg, categorize } = await import('../src/lib/load-prescription')
  const me = { equipment_access: 'home_gym', injuries: [], health_conditions: [] } as never
  const db = newPlanLift('Dumbbell Bench Press')
  const ceiling = effectiveLoadingCeilingKg(getExerciseEntry('Dumbbell Bench Press')!, categorize(getExerciseEntry('Dumbbell Bench Press')!), me)
  const over = { ...empty, name: 'Push', items: [{ ...db, weight: String(ceiling + 5) }] }
  const at = { ...empty, name: 'Push', items: [{ ...db, weight: String(ceiling) }] }
  check('a weight over the plan\'s own ceiling for that lift is refused, with the reason and the most allowed', planProblem(over, me) === `Dumbbell Bench Press: ${ceiling + 5} kg is over ${ceiling} kg, the most your plan would ever give it with your kit, so it can't be saved. Lower it to ${ceiling} kg or less.`, planProblem(over, me))
  check('...the ceiling itself is fine, and so is no weight', planProblem(at, me) === null && planProblem({ ...at, items: [{ ...db, weight: '' }] }, me) === null)
  const pregnant = { ...(me as object), health_conditions: ['pregnancy'] } as never
  const heavy = { ...empty, name: 'Legs', items: [{ ...newPlanLift('Goblet Squat'), reps: '5' }] }
  check('while pregnant, reps under 8 are refused with the reason', planProblem(heavy, pregnant) === "Goblet Squat: while you're pregnant your plan keeps every set at 8 reps or more, so 5 can't be saved.", planProblem(heavy, pregnant))
  check('...8 and up are fine, and the floor is only for pregnancy', planProblem({ ...heavy, items: [{ ...heavy.items[0], reps: '8-10' }] }, pregnant) === null && planProblem(heavy, me) === null)
  check('the editor saves through the check with his profile', /planProblem\(p, profile\)/.test(readFileSync('src/components/exercise/OwnPlanEditor.tsx', 'utf8')))
  void ownPlanHardStop
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
console.log('Your own workout: numbered after the day, filled from the last set, saved only when it reads.')
