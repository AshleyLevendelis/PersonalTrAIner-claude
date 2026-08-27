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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
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
  const fn = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
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

if (failures > 0) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log('\nAll log-correction checks passed.\n')
