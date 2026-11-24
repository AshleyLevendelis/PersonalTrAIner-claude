// ---------------------------------------------------------------------------
// test:warmup-rest — A SHORT REST AFTER THE LAST WARM-UP, NONE BETWEEN THE OTHERS (24 Nov 2026, his "build it").
// The sizing (src/lib/warmup-rest.ts) is called, not read; the wiring in the set grid is held by source checks, and
// what he sees by verify:warmup-rest.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import { restAfterWarmupSeconds } from '../src/lib/warmup-rest'

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}
const code = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const base = { isLastWarmup: true, workingSetsLogged: 0, workingRestSeconds: 180, isMainLift: true, repsHigh: 10 }
const r = (over: Partial<typeof base> = {}) => restAfterWarmupSeconds({ ...base, ...over })

console.log('\n1. Only the last warm-up, and only before the work starts')
check('no rest after a warm-up that is not the last', r({ isLastWarmup: false }) === 0)
check('no rest once a working set is logged (a warm-up logged late)', r({ workingSetsLogged: 1 }) === 0)
check('a rest after the last warm-up before Set 1', r() > 0)

console.log('\n2. Sized by the lift (CSCS)')
check('an ordinary lift: 60 s', r({ isMainLift: false }) === 60, r({ isMainLift: false }))
check('a main lift: 90 s', r({ repsHigh: 10 }) === 90, r())
check('a heavy main lift (6 reps or fewer): 120 s', r({ repsHigh: 6 }) === 120 && r({ repsHigh: 5 }) === 120, r({ repsHigh: 6 }))
check('7 reps is not heavy', r({ repsHigh: 7 }) === 90)
check('reps unreadable on a main lift: 90 s', r({ repsHigh: null }) === 90)
check('never longer than the working rest the plan prescribes', r({ repsHigh: 5, workingRestSeconds: 75 }) === 75 && r({ isMainLift: false, workingRestSeconds: 45 }) === 45)
check('working rest unknown: the size stands', r({ workingRestSeconds: 0 }) === 90)

console.log('\n3. The set grid uses it')
const grid = code('src/components/exercise/SetGrid.tsx')
check('a ticked warm-up reaches the sizing, only on the last warm-up row', /if \(warm && onSetCompleted && prescribedReps && lastWarmupRowIndex >= 0 && rowKey\(rowRefs\[lastWarmupRowIndex\]\) === k\)/.test(grid))
check('...with the working sets logged and the tier', /restAfterWarmupSeconds\(\{[\s\S]{0,200}workingSetsLogged: existingLogs\.length[\s\S]{0,200}isMainLift: tier === 'tier_1_primary'/.test(grid))
check('...and the rest is reported as before Set 1 (set 0)', /onSetCompleted\(exerciseName, 0, weight, reps, `\$\{seconds\}s`/.test(grid))
check('the rest is drawn under the last warm-up, or above Set 1 when the warm-ups have folded', /rowIndex === lastWarmupRowIndex && restBelongsToSet\(rest, exerciseName, 0\)/.test(grid) && /!showWarm && lastWarmupRowIndex >= 0 && rowIndex === lastWarmupRowIndex \+ 1 && restBelongsToSet\(rest, exerciseName, 0\)/.test(grid))

console.log(`\n${ran} checks ran, ${failures} failed`)
if (failures > 0) process.exit(1)
