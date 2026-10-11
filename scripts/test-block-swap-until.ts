// ---------------------------------------------------------------------------
// test:block-swap-until — "REST OF BLOCK" SAYS WHEN IT ENDS (runs 3-4, M40b).
//
// A swap made "for the rest of the block" was read as for good; at the next
// block the plan changed exercises, as it does on purpose, and the old one
// came back. Ashley, 10 Oct 2026, from three options: "Keep to the block, say
// it" — the end date on the swap, and "never give me this one" beside it.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import { blockSwapEndsOn } from '../src/lib/block-swap-until'
import { blockSwapLine } from '../src/lib/coach-voice'
import { shortDate } from '../src/lib/day-labels'
import type { MesocycleWeek } from '../src/lib/types'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`) }
}
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// Twelve weeks: blocks of 4, 5 and 3, so a fixed "four weeks a block" answer is wrong twice.
const blocks = [1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3]
const meso = blocks.map((b, i) => ({ week_number: i + 1, block_number: b, days: [] })) as unknown as MesocycleWeek[]
const START = '2026-09-07T09:30:00' // a Monday, local

console.log('\n1. The day the next block starts')
{
  check('week 2 of block 1: block 2 starts on week 5, 28 days in', blockSwapEndsOn(meso, 2, START) === '2026-10-05', blockSwapEndsOn(meso, 2, START))
  check('week 4, the last week of block 1: still the same day', blockSwapEndsOn(meso, 4, START) === '2026-10-05')
  check('week 6 of a FIVE-week block 2: block 3 starts on week 10, 63 days in', blockSwapEndsOn(meso, 6, START) === '2026-11-09', blockSwapEndsOn(meso, 6, START))
  check('the last block: no later block, so null', blockSwapEndsOn(meso, 11, START) === null)
  check('no plan start, or a week the plan does not hold: null, never a guess', blockSwapEndsOn(meso, 2, null) === null && blockSwapEndsOn(meso, 40, START) === null)
  check('a plan with no blocks marked: null', blockSwapEndsOn(meso.map(w => ({ ...w, block_number: undefined })), 2, START) === null)
}

console.log('\n2. What the swap says')
{
  check('with a date: the day it ends, and why', blockSwapLine(shortDate('2026-10-05', '2026-09-20')) === 'Swaps it until Mon 5 Oct, when your next block starts and your plan changes exercises.', blockSwapLine(shortDate('2026-10-05', '2026-09-20')))
  check('on the last block: for the rest of the plan', blockSwapLine(null) === 'Swaps it for the rest of your plan.')
}

console.log('\n3. The wiring')
{
  const dlg = code('src/components/exercise/SwapDialog.tsx')
  check('the "Rest of block" choice says it through blockSwapLine(', /data-testid="swap-block-until"[\s\S]{0,120}blockSwapLine\(blockEndsOn \? shortDate\(blockEndsOn, today\) : null\)/.test(dlg))
  check('...and "never give me this one" sits beside it, opening the ban for THIS exercise', /data-testid="swap-never-again"[\s\S]{0,200}onDislike\(name\)/.test(dlg) && /const name = target\.exerciseName; handleClose\(\); onDislike\(name\)/.test(dlg))
  const tab = code('src/components/exercise/ExerciseTab.tsx')
  check('the Exercise tab works the date out from the plan, for the week being swapped', /blockSwapEndsOn\(mesocycle \?\? \[\], swapTarget\?\.weekNumber \?\? liveWeek, planCreatedAt\)/.test(tab))
  check('...and hands it to BOTH places the swap dialog opens', (tab.match(/blockEndsOn=\{swapBlockEndsOn\}/g) ?? []).length === 2 && (tab.match(/<SwapDialog/g) ?? []).length === 2)
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} block-swap-until check(s) FAILED`); process.exit(1) }
console.log('All block-swap-until checks passed.')
