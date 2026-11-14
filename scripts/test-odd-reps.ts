// ---------------------------------------------------------------------------
// A REP COUNT NOBODY DID: his ruling 14 Nov 2026, "Ask once, then save" (Priya saved 212 then 312 reps on a set of 12,
// with no check). The tick asks once; a confirmed one is saved and never reaches the top of the range (so never raises
// next week's weight) and never becomes a personal best. One exit, at the bottom.
// ---------------------------------------------------------------------------
import fs from 'fs'
import { repsLookImpossible, prescribedRepsHigh, MAX_PLAUSIBLE_LOADED_REPS } from '../src/lib/set-plausibility'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (p: string) => strip(fs.readFileSync(p, 'utf8'))

console.log('\n1. The rule')
check('312 reps on a set of 12: impossible', repsLookImpossible(312, 12))
check('212 on 8-12: impossible', repsLookImpossible(212, prescribedRepsHigh('8-12')))
check('36 on 12 (three times exactly): believed', !repsLookImpossible(36, 12))
check('37 on 12: asked', repsLookImpossible(37, 12))
check('a loaded set past 100 with no prescription: asked; a bodyweight 120 with none: believed', repsLookImpossible(MAX_PLAUSIBLE_LOADED_REPS + 1, null, true) && !repsLookImpossible(120, null, false))
check('the prescription top is read from "8-12" and "10", never from a time', prescribedRepsHigh('8-12') === 12 && prescribedRepsHigh('10') === 10 && prescribedRepsHigh('30s') === null && prescribedRepsHigh('AMRAP') === null)

console.log('\n2. Where it binds')
{
  const grid = read('src/components/exercise/SetGrid.tsx')
  check('the tick asks once before saving, and a second tap saves', /repsLookImpossible\(reps, prescribedRepsHigh\(prescribedReps\)/.test(grid) && /confirmRepsSet !== k\) \{/.test(grid) && /setConfirmRepsSet\(k\)/.test(grid))
  check('...asked BEFORE the save, never after', grid.indexOf('setConfirmRepsSet(k)') > 0 && grid.indexOf('setConfirmRepsSet(k)') < grid.indexOf('const addedLoadKg = takesAddedLoad'))
  check('...and a changed number asks again (the confirm is reset on edit)', (grid.match(/if \(confirmRepsSet === k\) setConfirmRepsSet\(null\)/g) ?? []).length === 2)
  const prog = read('src/lib/progression-engine.ts')
  check('an impossible count never reaches the top of the range, at all three places progression asks', (prog.match(/&& !repsLookImpossible\(s\.reps_completed, (topReps|prescribedRepRangeHigh)\)/g) ?? []).length === 3)
  const pr = read('src/lib/pr-engine.ts')
  check('...and is never a personal best, on both roads a best is built', /if \(repsLookImpossible\(row\.reps_completed, null,/.test(pr) && /\.filter\(l => l\.reps_completed > 0 && !repsLookImpossible\(l\.reps_completed, null,/.test(pr))
}

console.log(`\n${ran} checks ran, ${failures} failed.`)
if (failures > 0) { console.error('test:odd-reps FAILED'); process.exit(1) }
console.log('An impossible rep count is asked about, and never raises a weight or makes a best.')
