// ---------------------------------------------------------------------------
// test:set-row — WHAT A BLANK WEIGHT BOX LOGS (runs 3-4, H25, 10 Oct 2026).
//
// The tester's Romanian deadlifts: "24 kg per hand · start here", and a blank
// tick logged 30 (last session) twice, the second time straight after a typed
// 24. Decided as a CSCS coach: the set just done, then today's plan, then last
// session only when the plan has no number. The grey figure and the saved
// figure are one value, so the screen never shows one number and logs another.
//
// The decision is a pure function (src/lib/set-row.ts), so it is ASKED here.
// The grid half (that the save, the placeholder and the plate calculator all
// ask it, and that last session never drives half a row) is read off the
// source with comments stripped.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import { carriedWeightFor, blankWeightFor } from '../src/lib/set-row'
import { sameAsSet } from '../src/lib/coach-voice'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

console.log('\n1. The tester\'s Romanian deadlifts, replayed')
{
  const plan = 24
  const lastTime = 30
  // Set 1, nothing logged today yet: today's plan, not last session.
  const s1 = blankWeightFor({ carry: carriedWeightFor(1, [], undefined), planKg: plan, lastTimeKg: lastTime, fallback: '' })
  check('set 1 blank logs the plan\'s 24, not last session\'s 30', s1.text === '24' && s1.source === 'plan', s1)
  // Set 2 after a typed 24: the set just done.
  const logged = [{ set_number: 1, weight_kg: 24 }]
  const s2 = blankWeightFor({ carry: carriedWeightFor(2, logged, undefined), planKg: plan, lastTimeKg: lastTime, fallback: '' })
  check('set 2 after a typed 24 logs 24', s2.text === '24' && s2.source === 'carried' && s2.fromSet === 1, s2)
  // She went heavier than the plan on set 1: that carries, not the plan.
  const heavier = blankWeightFor({ carry: carriedWeightFor(2, [{ set_number: 1, weight_kg: 26 }], undefined), planKg: plan, lastTimeKg: lastTime, fallback: '' })
  check('...and a set 1 above the plan carries into set 2', heavier.text === '26', heavier)
  // The nearest set ABOVE, not the first or the heaviest.
  const three = carriedWeightFor(3, [{ set_number: 1, weight_kg: 20 }, { set_number: 2, weight_kg: 22 }, { set_number: 4, weight_kg: 40 }], undefined)
  check('the carry comes from the nearest logged set above, never one below', three?.kg === 22 && three?.fromSet === 2, three)
}

console.log('\n2. The order, one rung at a time')
{
  check('no plan number: last session fills the box',
    blankWeightFor({ carry: null, planKg: null, lastTimeKg: 30, fallback: '' }).source === 'last_time')
  check('no plan, no history: the fallback ("type it" on a loaded lift)',
    blankWeightFor({ carry: null, planKg: null, lastTimeKg: null, fallback: '' }).text === '')
  check('...and 0 on a lift that carries no load',
    blankWeightFor({ carry: null, planKg: null, lastTimeKg: null, fallback: '0' }).text === '0')
  const same = blankWeightFor({ carry: null, planKg: 27.5, lastTimeKg: 27.5, fallback: '' })
  check('the plan\'s weight equal to last session\'s: the row is last session\'s (reps and all)', same.text === '27.5' && same.source === 'last_time', same)
  const bwSame = blankWeightFor({ carry: null, planKg: 0, lastTimeKg: 0, fallback: '0' })
  check('...which is every bodyweight row with history', bwSame.text === '0' && bwSame.source === 'last_time', bwSame)
  check('a plan of 0 is still a plan (never replaced by last session)',
    blankWeightFor({ carry: null, planKg: 0, lastTimeKg: 30, fallback: '' }).text === '0')
  check('noCarry (calibration sets 2+) skips the set just done',
    blankWeightFor({ carry: { kg: 40, isBodyweight: false, fromSet: 1 }, noCarry: true, planKg: null, lastTimeKg: null, fallback: '' }).text === '')
  const bw = carriedWeightFor(2, [{ set_number: 1, weight_kg: 0, is_bodyweight: true }], undefined)
  check('a bodyweight set carries as bodyweight', bw?.isBodyweight === true && blankWeightFor({ carry: bw, planKg: 24, lastTimeKg: null, fallback: '' }).text === '0', bw)
}

console.log('\n3. A plan that steps the load keeps its own numbers')
{
  const ramp = [20, 22.5, 25]
  const c = carriedWeightFor(2, [{ set_number: 1, weight_kg: 20 }], ramp)
  check('set 2 of a stepped plan is not set 1 carried', c === null, c)
  check('...so it logs the plan\'s 22.5', blankWeightFor({ carry: c, planKg: ramp[1], lastTimeKg: 30, fallback: '' }).text === '22.5')
  const flat = carriedWeightFor(2, [{ set_number: 1, weight_kg: 21 }], [24, 24, 24])
  check('a flat per-set plan still carries what she actually did', flat?.kg === 21, flat)
}

console.log('\n4. The grid asks the one decision everywhere')
{
  const grid = stripComments(readFileSync(join(ROOT, 'src/components/exercise/SetGrid.tsx'), 'utf8'))
  const fn = grid.slice(grid.indexOf('const workingBlankFor = '), grid.indexOf('const drivingGhostFor'))
  check('the working blank comes from blankWeightFor, fed by the set just done',
    /blankWeightFor\(\{/.test(fn) && /carry: carriedWeightFor\(setNumber, existingLogs, perSetLoadKg\)/.test(fn), fn.slice(0, 200))
  check('...with today\'s plan as the plan, and last session only as last time',
    /planKg: probeSet \? null : \(perSetLoadKg\?\.\[setNumber - 1\] \?\? suggestedLoadKg \?\? null\)/.test(fn) && /lastTimeKg: ghost \? Number\(ghost\.weight_kg\) : null/.test(fn))
  // Anchored on the save's own assignment: the plate calculator's line has
  // the same tail, and a first version matched it instead (caught by mutation).
  check('the save logs typed, else that same value',
    /const weight = input\.isBodyweight\s*\?\s*0\s*:\s*parseFloat\(input\.weight \|\| defaultWeightFor\(ref\)\) \|\| 0/.test(grid))
  check('the box shows that same value', /placeholder=\{isBW \? 'BW' : weightPlaceholderFor\(ref\)\}/.test(grid))
  check('the plate calculator opens on that same value', /onOpenPlateCalc\(parseFloat\(input\.weight \|\| defaultWeightFor\(ref\)\) \|\| 0\)/.test(grid))
  // ONE read of last session's weight in the whole grid: the blank decision's
  // own input. Any second read is a second route into a box or a save.
  const ghostWeightReads = grid.match(/ghost(?:For\([^)]*\))?!?\??\.weight_kg/g) ?? []
  check('nothing reads last session\'s weight straight into a box or a save',
    ghostWeightReads.length === 1 && /lastTimeKg: ghost \? Number\(ghost\.weight_kg\)/.test(fn), ghostWeightReads)
  check('last session drives a row only when the blank box says so, and as a whole',
    /return g && workingBlankFor\(ref\)\.source === 'last_time' \? g : undefined/.test(grid)
    && (grid.match(/const ghost = drivingGhostFor\(ref\)/g) ?? []).length === 2)
  check('the "weight from set N" line is said only when the carry differs from the plan',
    /blank\.source !== 'carried'/.test(grid) && /String\(plan\) === blank\.text/.test(grid) && /sameAsSet\(blank\.fromSet\)/.test(grid))
  check('...in words that name the set', sameAsSet(2) === 'weight from set 2')
}

console.log('\n5. A box that says "type it" never saves a guess (Ashley\'s question, 10 Oct 2026)')
{
  const grid = stripComments(readFileSync(join(ROOT, 'src/components/exercise/SetGrid.tsx'), 'utf8'))
  // "type it" is shown exactly when the blank value is '' ...
  check('"type it" is shown only when the blank box has no number', /const d = defaultWeightFor\(ref\)\s*\n\s*return d === '' \? 'type it' : d/.test(grid))
  // ... a '' blank saves as 0, and 0 is bodyweight only on a lift that is NOT
  // externally loaded; the only '' fallback is for one that IS. So the tick is
  // refused, never filed as bodyweight or as 0 kg.
  check('...the only "type it" fallback is a lift that needs a weight', /fallback: probeSet \|\| catalogEntryIsLoaded \? '' : '0'/.test(grid))
  check('...and such a lift can never be saved as bodyweight',
    /const isBodyweightCapable = catalogEntry \? !isExternallyLoaded\(catalogEntry\) : true/.test(grid)
    && /const catalogEntryIsLoaded = catalogEntry \? isExternallyLoaded\(catalogEntry\) : false/.test(grid))
  check('...so a blank tick there is refused with "Enter the weight you lifted"',
    /if \(weight === 0 && !isBodyweight\) \{\s*\n\s*setRowErrors\(prev => \(\{ \.\.\.prev, \[k\]: 'Enter the weight you lifted' \}\)\)/.test(grid))
}

console.log(`\nset-row: ${ran} checks ran`)
console.log(failures === 0 ? 'All set-row checks passed.\n' : `${failures} set-row check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
