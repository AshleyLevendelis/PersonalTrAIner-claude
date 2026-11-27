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
import { carriedWeightFor, blankWeightFor, carriedRepsFor } from '../src/lib/set-row'
import { sameAsSet, setReading } from '../src/lib/coach-voice'

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
  // RE-ANCHORED 2 Nov 2026: the call also passes the bar for this lift (an EZ bar is 10 kg). The weight is the property.
  check('the plate calculator opens on that same value', /onOpenPlateCalc\(parseFloat\(input\.weight \|\| defaultWeightFor\(ref\)\) \|\| 0(, plateBarKg\(catalogEntry\))?\)/.test(grid))
  // ONE read of last session's weight in the whole grid: the blank decision's
  // own input. Any second read is a second route into a box or a save.
  const ghostWeightReads = grid.match(/ghost(?:For\([^)]*\))?!?\??\.weight_kg/g) ?? []
  check('nothing reads last session\'s weight straight into a box or a save',
    ghostWeightReads.length === 1 && /lastTimeKg: ghost \? Number\(ghost\.weight_kg\)/.test(fn), ghostWeightReads)
  check('last session drives a row only when the blank box says so, and as a whole',
    /return g && workingBlankFor\(ref\)\.source === 'last_time' \? g : undefined/.test(grid)
    && (grid.match(/const ghost = drivingGhostFor\(ref\)/g) ?? []).length === 3)
  check('the "weight from set N" line is said only when the carry differs from the plan',
    /blank\.source !== 'carried'/.test(grid) && /String\(plan\) === blank\.text/.test(grid) && /sameAsSet\(blank\.fromSet\)/.test(grid))
  check('...and never for a bodyweight carry, where it would say "0 · weight from set 1"', /!\(Number\(blank\.text\) > 0\)\) return null/.test(grid))
  check('...in words that name the set', sameAsSet(2) === 'weight from set 2')
}

console.log('\n5. A box with no number ("enter", never "type it") never saves a guess (Ashley\'s question, 10 Oct 2026)')
{
  const grid = stripComments(readFileSync(join(ROOT, 'src/components/exercise/SetGrid.tsx'), 'utf8'))
  // "type it" is shown exactly when the blank value is '' ...
  check('"enter" is shown only when the blank box has no number', /const d = defaultWeightFor\(ref\)\s*\n\s*if \(d !== ''\) return d/.test(grid) && /return 'enter'/.test(grid) && !/'type it'/.test(grid))
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

console.log('\n6. A timed set is said in seconds and claims no lifting record (runs 3-4, M42)')
{
  check('a 33-second hold reads "33 s"', setReading({ count: 33, unit: 'seconds', isBodyweight: true, weightKg: 0 }) === '33 s · Bodyweight')
  check('one rep reads "1 rep", never "1 reps"', setReading({ count: 1, unit: 'reps', isBodyweight: false, weightKg: 25 }) === '1 rep @ 25kg')
  check('...and eight read "8 reps"', setReading({ count: 8, unit: 'reps', isBodyweight: false, weightKg: 25 }) === '8 reps @ 25kg')
  // A tester, 18 Nov 2026: chin-ups with 5 kg on a belt read "8 reps · Bodyweight". The belt is said, with its unit.
  check('weight added to bodyweight is said, not lost', setReading({ count: 8, unit: 'reps', isBodyweight: true, weightKg: 0, addedLoadKg: 5 }) === '8 reps · Bodyweight +5kg', setReading({ count: 8, unit: 'reps', isBodyweight: true, weightKg: 0, addedLoadKg: 5 }))
  check('...and a plain bodyweight set still reads "Bodyweight", with nothing added', setReading({ count: 8, unit: 'reps', isBodyweight: true, weightKg: 0, addedLoadKg: 0 }) === '8 reps · Bodyweight' && setReading({ count: 8, unit: 'reps', isBodyweight: true, weightKg: 0 }) === '8 reps · Bodyweight')
  check('...the set row hands the added weight to that reading', /addedLoadKg: logged\.added_load_kg \?\? null/.test(readFileSync('src/components/exercise/SetGrid.tsx', 'utf8')))
  // A BAND MOVE SAYS "Band" (the Exercise walk, 18 Nov 2026, E9), the word its own card wears.
  check('a band move logged with no weight reads "Band", as its card does', setReading({ count: 10, unit: 'reps', isBodyweight: true, weightKg: 0, unloadedWord: 'Band' }) === '10 reps · Band')
  check('...and a move with no word of its own still reads "Bodyweight"', setReading({ count: 10, unit: 'reps', isBodyweight: true, weightKg: 0, unloadedWord: null }) === '10 reps · Bodyweight')
  {
    const { unloadedLoadLabel } = await import('../src/lib/load-prescription')
    const { getExerciseEntry } = await import('../src/lib/exercise-db')
    check('the word is the catalogue\'s: Band Face Pulls is a band move, Chin-Ups is bodyweight', unloadedLoadLabel(getExerciseEntry('Band Face Pulls')!) === 'Band' && unloadedLoadLabel(getExerciseEntry('Chin-Ups')!) === 'Bodyweight', [unloadedLoadLabel(getExerciseEntry('Band Face Pulls')!), unloadedLoadLabel(getExerciseEntry('Chin-Ups')!)])
    const grid = readFileSync('src/components/exercise/SetGrid.tsx', 'utf8')
    check('the set grid hands the card\'s word to the line', /unloadedWord: catalogEntry \? unloadedLoadLabel\(catalogEntry\) : null/.test(grid))
  }
  check('a carry reads metres', setReading({ count: 40, unit: 'meters', isBodyweight: false, weightKg: 16 }) === '40 m @ 16kg')
  const grid = stripComments(readFileSync(join(ROOT, 'src/components/exercise/SetGrid.tsx'), 'utf8'))
  check('a set not counted in reps never reaches the record check',
    /const countedInReps = \(prescriptionType \?\? 'reps'\) === 'reps'/.test(grid)
    && /const pr = warm \|\| drop \|\| !countedInReps \? null : checkForPR\(/.test(grid)
    && /const topPR = warm \|\| drop \|\| !countedInReps \? null : getTopPRSet\(/.test(grid))
}

console.log('\nTHE NEXT SET COPIES THE LAST (his ruling 27 Nov 2026, "Copy the last set")')
{
  const done = [{ set_number: 1, weight_kg: 35, reps_completed: 11 }]
  const carried = blankWeightFor({ carry: carriedWeightFor(2, done), planKg: 35, lastTimeKg: null, fallback: '' })
  check('T-Bar Row 9-11, set 1 logged 35 x 11: set 2 offers 11, not 9', carriedRepsFor({ blank: carried, nudged: false, loggedWorkingSets: done, prescribedReps: '9-11' }) === '11')
  check('...capped at the top of the range: 14 on 9-11 offers 11',
    carriedRepsFor({ blank: carried, nudged: false, loggedWorkingSets: [{ set_number: 1, weight_kg: 35, reps_completed: 14 }], prescribedReps: '9-11' }) === '11')
  check('...a short set is copied as done (7 on 9-11 offers 7: never more than he did)',
    carriedRepsFor({ blank: carried, nudged: false, loggedWorkingSets: [{ set_number: 1, weight_kg: 35, reps_completed: 7 }], prescribedReps: '9-11' }) === '7')
  check('...never when the set nudge moved the weight', carriedRepsFor({ blank: carried, nudged: true, loggedWorkingSets: done, prescribedReps: '9-11' }) === null)
  check('...never when the row is not the set just done (the plan or last session drives it)',
    carriedRepsFor({ blank: blankWeightFor({ carry: null, planKg: 35, lastTimeKg: null, fallback: '' }), nudged: false, loggedWorkingSets: done, prescribedReps: '9-11' }) === null)
  const bwDone = [{ set_number: 1, weight_kg: 0, is_bodyweight: true, reps_completed: 8 }]
  check('bodyweight Chin-Ups 7-9, set 1 logged 8: set 2 offers 8, not 7',
    carriedRepsFor({ blank: blankWeightFor({ carry: carriedWeightFor(2, bwDone), planKg: null, lastTimeKg: 0, fallback: '0' }), nudged: false, loggedWorkingSets: bwDone, prescribedReps: '7-9' }) === '8')
  const grid = stripComments(readFileSync(join(ROOT, 'src/components/exercise/SetGrid.tsx'), 'utf8'))
  check('the grid reads its reps through this one rule (box, tick and save)',
    /carriedRepsFor\(\{ blank, nudged: blank\.source === 'carried' && !!nudgeFor\(ref\)/.test(grid)
    && (grid.match(/input\.reps \|\| blankRepsFor\(ref\)/g) ?? []).length === 2 && /placeholder=\{blankRepsFor\(ref\)\}/.test(grid))
}

console.log(`\nset-row: ${ran} checks ran`)
console.log(failures === 0 ? 'All set-row checks passed.\n' : `${failures} set-row check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
