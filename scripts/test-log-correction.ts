/**
 * Gate: correcting a logged set REPLACES it, and no number is ever invented.
 *
 * Root incident, found by Ashley on her phone in one exchange. The plan
 * prescribed 3x8 deadlifts. Asked "how many sets and reps?", she answered
 * "3". Four things then went wrong:
 *
 *   1. The app logged 3x8 — filling the rep count from what it had
 *      PRESCRIBED. She never said 8.
 *   2. She said "No 3x10 deadlifts" — exercise, sets and reps, all stated —
 *      and the coach discarded all three and asked for a weight instead.
 *   3. It then asked "What weight did you use for Deadlifts?" three times
 *      running, taking "100kg" each time.
 *   4. The correction was APPENDED. Her log read "3 working sets · 6 logged":
 *      3x8 and 3x10 side by side, and every future weight for that lift would
 *      have built on six sets she never did.
 *
 * SECOND INCIDENT, same exchange, found months later (§6). The coach replied
 * "I don't actually have your past weights on hand to look up what was
 * prescribed" — and it was telling the truth. The client's plan summary sent
 * the day, the focus, the exercise, sets, reps and rest, and no weight at
 * all, while the Exercise tab one tap away read "Deadlifts 72.5 kg
 * SUGGESTED". So the coach asked for a number the app already had, twice.
 * That is (3) with a supply-side cause, and no prompt rule can fix it: you
 * cannot instruct a model out of missing data.
 *
 * (4) is the one this file mostly defends, because it is the one that
 * silently corrupts data. The behavioural half is tested for real against the
 * executor; the model-facing half can only be asserted as prompt text, for the
 * reason test-chat-app-reality.ts gives.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { executeLogWorkout, type LogWorkoutContext } from '../src/lib/nl-logging-executor'
import type { ParsedSetGroup } from '../src/lib/set-parse'
import { buildCoachExerciseSummary, loadClauseForCoach } from '../src/lib/chat-plan-context'
import type { Exercise, WorkoutDay } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const fnSrc = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
let failures = 0
const check = (l: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${l}`)
  else { failures++; console.error(`  FAIL: ${l}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`) }
}

/** A tiny in-memory set store, standing in for the live session. */
function makeCtx(over: Partial<LogWorkoutContext> = {}) {
  const store: { exerciseId: string; set_number: number; reps: number }[] = []
  const ctx: LogWorkoutContext = {
    profileId: 'p1', date: '2026-08-27', weekNumber: 1, dayName: 'Thursday',
    setsFor: (id) => store.filter(r => r.exerciseId === id) as never,
    logSet: (input) => {
      store.push({ exerciseId: input.exerciseId, set_number: input.setNumber, reps: input.repsCompleted })
      return {} as never
    },
    declareOffPlan: () => {},
    todaysPlanSetCounts: new Map([['Deadlifts', 3]]),
    todaysPlanLoads: new Map([['Deadlifts', 100]]),
    deleteSet: ({ exerciseId, setNumber }) => {
      const i = store.findIndex(r => r.exerciseId === exerciseId && r.set_number === setNumber)
      if (i >= 0) store.splice(i, 1)
    },
    ...over,
  }
  return { ctx, store }
}
const group = (reps: number, sets: number): ParsedSetGroup => ({
  exerciseId: 'deadlifts', exerciseName: 'Deadlifts', resolution: 'exact',
  sets: Array.from({ length: sets }, () => ({ reps, weightKg: 100, isBodyweight: false })),
} as unknown as ParsedSetGroup)

console.log('\n1. THE BUG: a correction used to sit alongside the mistake')
{
  const { ctx, store } = makeCtx()
  executeLogWorkout([group(8, 3)], ctx)
  check('the first log writes 3 sets', store.length === 3, store.length)

  // Appending is CORRECT for genuinely extra work, and must stay the default.
  const added = executeLogWorkout([group(10, 3)], ctx)
  check('without the flag it still appends — "I did 3 more" must keep working', store.length === 6, store.length)
  check('...and reports nothing replaced', added.replacedSets === 0)
  check('...which is exactly what produced "3 working sets · 6 logged"',
    store.filter(r => r.reps === 8).length === 3 && store.filter(r => r.reps === 10).length === 3)
}

console.log('\n2. THE FIX: with the flag, the correction replaces')
{
  const { ctx, store } = makeCtx()
  executeLogWorkout([group(8, 3)], ctx)
  const out = executeLogWorkout([group(10, 3)], { ...ctx, replaceExisting: true })
  check('the log still has 3 sets, not 6', store.length === 3, store.length)
  check('...and they are the CORRECTED reps', store.every(r => r.reps === 10), store.map(r => r.reps))
  check('...none of the wrong reps survive', store.every(r => r.reps !== 8))
  check('it reports what it replaced', out.replacedSets === 3, out.replacedSets)
  // Refilling from set 1 matters: leaving 4,5,6 would show "3 logged" against
  // slots the Exercise tab renders as extra work.
  check('the sets refill from 1, not from 4', store.map(r => r.set_number).sort().join(',') === '1,2,3', store.map(r => r.set_number))
}

console.log('\n3. The flag cannot half-apply')
{
  // Without a deleteSet there is nothing to remove, and silently appending
  // while claiming to correct is worse than not offering the flag at all.
  const { ctx, store } = makeCtx({ deleteSet: undefined })
  executeLogWorkout([group(8, 3)], ctx)
  const out = executeLogWorkout([group(10, 3)], { ...ctx, deleteSet: undefined, replaceExisting: true })
  check('no deleteSet means it appends rather than pretending', store.length === 6)
  check('...and honestly reports nothing replaced', out.replacedSets === 0)
}

console.log('\n4. The model is told all four rules')
{
  const fn = fnSrc
  check('reps may never be invented', /NEVER INVENT REPS OR SETS EITHER/.test(fn))
  check('...with the case that proved it', /the plan said 3x8, she answered "3"/.test(fn))
  check('...and the schema says it too, on both tools',
    (fn.match(/NEVER fill this from (what the plan PRESCRIBED|the prescription)/g) ?? []).length === 2)
  check('a correction replaces', /A CORRECTION REPLACES; IT NEVER ADDS/.test(fn))
  check('...via a real tool flag', /corrects_previous/.test(fn))
  check('stated values are not thrown away', /DO NOT THROW AWAY WHAT THEY JUST TOLD YOU/.test(fn))
  check('the same question is not asked twice', /NEVER ASK THE SAME QUESTION TWICE IN A ROW/.test(fn))
}

console.log('\n5. The receipt says which it did')
{
  const ui = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
  // A correction and an addition write identical rows. If the receipt reads
  // the same for both, a mis-called correction is invisible until the numbers
  // are wrong weeks later.
  check('a replacement is titled differently', /Corrected · \$\{activeSession\.dayName\}/.test(ui))
  check('...and the count is shown', /replaced \$\{replacedSets\}/.test(ui))
  check('the flag reaches the executor', /replaceExisting: correctsPrevious/.test(ui))
}

console.log('\n6. The coach is GIVEN the prescribed weight, so it never has to ask for one the app already has')
{
  // The behavioural half. Not a regex over ChatAssistant: the summary builder
  // is a function now precisely so this can call it on a real week and read
  // what comes out. A regex would have passed against the broken version too,
  // because the broken version was a perfectly well-formed template literal.
  const ex = (o: Partial<Exercise>): Exercise => ({
    name: 'Deadlifts', sets: 3, reps: '8-10', rest: '180s', substitution: 'Rack Pulls', ...o,
  })
  const dayOf = (...exercises: Exercise[]): WorkoutDay => ({ day: 'Thursday', focus: 'Pull', exercises })

  const straight = buildCoachExerciseSummary({ days: [dayOf(
    ex({ suggested_load: '~72.5kg', suggested_load_kg: 72.5,
         per_set_load: [1, 2, 3].map(n => ({ set_number: n, load_kg: 72.5, display: '~72.5kg' })) }),
  )] })
  check('the prescribed weight reaches the coach at all — the whole incident',
    straight.includes('72.5kg'), straight)
  check('...attached to the exercise it belongs to, not floating',
    /Deadlifts \(3x8-10 @ ~72\.5kg, rest 180s\)/.test(straight), straight)
  check('...and a straight-across weight is NOT padded with a set-by-set list',
    !straight.includes('set by set'), straight)

  // The per-hand distinction, which is ~18% of every prescription in the
  // sweep and 47.8% of externally-loaded work. `suggested_load_kg` would send
  // a bare 14 the coach reads as a total; the formatted string is the only
  // form that survives the trip.
  const perHand = loadClauseForCoach(ex({ name: 'Dumbbell Rows', suggested_load: '~14kg per hand', suggested_load_kg: 14 }))
  check('a per-hand load keeps "per hand" all the way to the coach',
    perHand.includes('14kg per hand'), perHand)
  check('...and the raw kg number alone is never what gets sent',
    perHand !== ' @ 14', perHand)
  const singleSide = loadClauseForCoach(ex({ name: 'Overhead Carry', suggested_load: '~6kg (single side)', suggested_load_kg: 6 }))
  check('a single-side load keeps its qualifier too', singleSide.includes('(single side)'), singleSide)

  // A ramp is 60/65/72.5. "I did the prescribed weights" must not become
  // 72.5x3 — that is the same invented-number defect as filling reps from the
  // prescription, one field over.
  const ramp = loadClauseForCoach(ex({ name: 'Barbell Squats', suggested_load: '~42.5kg', suggested_load_kg: 42.5,
    per_set_load: [{ set_number: 1, load_kg: 35, display: '~35kg' },
                   { set_number: 2, load_kg: 40, display: '~40kg' },
                   { set_number: 3, load_kg: 42.5, display: '~42.5kg' }] }))
  check('a ramp sends every set, not the top set three times',
    ramp.includes('~35kg') && ramp.includes('~40kg') && ramp.includes('~42.5kg'), ramp)
  check('...and says which one is the top set', /top set/.test(ramp), ramp)

  // Weighted bodyweight work: the entire prescription is the "+17.5kg", and
  // suggested_load reads "Bodyweight". Sending only suggested_load loses it.
  const added = loadClauseForCoach(ex({ name: 'Weighted Pull-Ups', suggested_load: 'Bodyweight', suggested_added_load_kg: 17.5 }))
  check('added load on a bodyweight movement is sent', added.includes('17.5'), added)

  // '' has to mean "there is no number", never "there is one and we dropped
  // it". A primer with no load is the only legitimate empty clause.
  check('a genuinely unloaded movement sends no load clause',
    loadClauseForCoach(ex({ name: 'Arm Circles' })) === '', loadClauseForCoach(ex({ name: 'Arm Circles' })))

  // The two-halves defect this repo keeps hitting: builder correct, caller
  // still hand-rolling its own copy beside it.
  const client = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
  check('ChatAssistant builds exercise_summary from the shared builder',
    /const exerciseSummary = buildCoachExerciseSummary\(/.test(client))
  check('...and no longer hand-rolls a rest-clause template beside it',
    !/rest \$\{[a-z]\.rest\}/.test(client), client.match(/rest \$\{[a-z]\.rest\}/)?.[0])

  // The model-facing half. It cannot be told it has the weights by the data
  // alone — it said the sentence once, and a prompt that never mentions the
  // "@" clause leaves it free to say it again.
  check('the prompt names the "@" clause as the prescribed weight',
    /includes the PRESCRIBED WEIGHT for every movement/.test(fnSrc))
  check('...forbids the sentence that was actually said to a user',
    /NEVER tell the user you don't have their prescribed weights/.test(fnSrc))
  check('...teaches per-hand as each hand, not a total',
    /14kg in EACH hand/.test(fnSrc))
  check('...and does not let quoting a prescription become logging it',
    /never yours to log as done/.test(fnSrc))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll log-correction checks passed.\n')
