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

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
console.log('Your own workout: numbered after the day, filled from the last set, saved only when it reads.')
