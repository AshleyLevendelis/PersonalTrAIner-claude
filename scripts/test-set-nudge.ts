// ---------------------------------------------------------------------------
// THE NEXT SET NUDGED BY THE REPS JUST DONE — his ruling 23 Nov 2026, "1" (per lift, plus a tap-free nudge).
// Held here: the rule (set-nudge.ts) asked directly, and the set grid actually using it for the blank box and the
// line under the row (source checks; the screen is verify:set-nudge). A gate has exactly one exit, at the bottom.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { setNudgeFor, repRange } from '../src/lib/set-nudge'
import { getExerciseEntry } from '../src/lib/exercise-db'
import { setNudgeLine } from '../src/lib/coach-voice'
import type { UserProfile } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail === '' ? '' : ` — ${JSON.stringify(detail)}`}`) }
}

const BENCH = getExerciseEntry('Barbell Bench Press')
const DB = getExerciseEntry('Dumbbell Bench Press')
check('0. fixtures exist', !!BENCH && !!DB)
const set = (n: number, kg: number, reps: number) => ({ set_number: n, weight_kg: kg, reps_completed: reps })
const ask = (over: Partial<Parameters<typeof setNudgeFor>[0]>) => setNudgeFor({
  setNumber: 2, loggedWorkingSets: [set(1, 90, 9)], prescribedReps: '9-11', entry: BENCH, profile: null, enabled: true, ...over,
})

// 1. the bands, at their edges (one candidate each side, so the threshold binds)
check('1a. 9 in 9-11: no nudge', ask({}) === null)
check('1b. 13 (top+2): no nudge, fatigue noise', ask({ loggedWorkingSets: [set(1, 90, 13)] }) === null)
const up = ask({ loggedWorkingSets: [set(1, 90, 14)] })
check('1c. 14 (top+3): up one step, about 5%', up?.direction === 'up' && up.kg > 90 && up.kg <= 95 && up.fromSet === 1 && up.reps === 14, up)
check('1d. 8 (bottom-1): no nudge', ask({ loggedWorkingSets: [set(1, 90, 8)] }) === null)
const down = ask({ loggedWorkingSets: [set(1, 90, 7)] })
check('1e. 7 (bottom-2): down about 5%', down?.direction === 'down' && down.kg < 90 && down.kg >= 85, down)

// 2. reads the NEAREST set above, as logged (a nudged set 2 then carries)
const fromTwo = ask({ setNumber: 3, loggedWorkingSets: [set(1, 90, 14), set(2, 92.5, 10)] })
check('2a. set 3 reads set 2 (10 reps at 92.5): no further move', fromTwo === null, fromTwo)
const fromTwoUp = ask({ setNumber: 3, loggedWorkingSets: [set(1, 90, 10), set(2, 92.5, 15)] })
check('2b. set 3 reads set 2 (15 reps): up from 92.5, not from 90', fromTwoUp?.fromSet === 2 && (fromTwoUp?.kg ?? 0) > 92.5, fromTwoUp)

// 3. where it must stay silent
check('3a. switched off (testing week, deload, back from a break)', ask({ enabled: false, loggedWorkingSets: [set(1, 90, 14)] }) === null)
check('3b. a timed set', ask({ prescribedReps: '30-45s', loggedWorkingSets: [set(1, 90, 60)] }) === null)
check('3c. a pyramid: the plan steps the load', ask({ perSetLoadKg: [80, 90], loggedWorkingSets: [set(1, 80, 14)] }) === null)
check('3d. a bodyweight set above', ask({ loggedWorkingSets: [{ ...set(1, 0, 20), is_bodyweight: true }] }) === null)
check('3e. set 1 never moves', ask({ setNumber: 1, loggedWorkingSets: [] }) === null)
const capped = { dumbbell_max_kg: 20, max_dumbbell_kg: 20, equipment_access: 'home_basic' } as unknown as UserProfile
const dbUp = ask({ entry: DB, profile: capped, loggedWorkingSets: [set(1, 20, 15)] })
const dbUpFree = ask({ entry: DB, profile: null, loggedWorkingSets: [set(1, 20, 15)] })
check('3f. never past a stated kit limit (and the same set with no limit does go up)', (dbUp === null || dbUp.kg <= 20) && (dbUpFree?.kg ?? 0) > 20, { dbUp, dbUpFree })

// 4. the range reader
check('4. "9-11", "8", "30s", "40m", "AMRAP"', JSON.stringify([repRange('9-11'), repRange('8'), repRange('30s'), repRange('40m'), repRange('AMRAP')]) === JSON.stringify([[9, 11], [8, 8], null, null, null]))

// 5. the words name the reps, the set and the weight with its unit
check('5. line', setNudgeLine({ reps: 14, fromSet: 1, kg: 92.5, direction: 'up' }) === '14 reps on set 1, so up to 92.5 kg'
  && setNudgeLine({ reps: 7, fromSet: 1, kg: 85, direction: 'down' }) === '7 reps on set 1, so down to 85 kg')

// 6. the grid uses it: the blank box AND the line, under the effort question's gate
const grid = readFileSync(new URL('../src/components/exercise/SetGrid.tsx', import.meta.url), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')
check('6a. the blank box takes the nudged weight', /const nudge = blank\.source === 'carried' \? nudgeFor\(ref\) : null\s*return nudge \? \{ \.\.\.blank, text: String\(nudge\.kg\) \}/.test(grid))
check('6b. the line is rendered', /setNudgeLine\(nudge\)/.test(grid) && /data-testid="set-nudge"/.test(grid))
check('6c. gated like the effort question, and off after a break', /enabled: askEffort && !ignoreLastTime/.test(grid))

console.log(`\n${ran} checks ran, ${failures} failed`)
if (failures > 0) process.exit(1)
