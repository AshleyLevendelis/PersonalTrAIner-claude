// ---------------------------------------------------------------------------
// Gate: A BUILD-UP SET IS NOT A WORKING SET.
//
// Ashley, 17 Sep 2026: "Only the ramp up sets input fields were visible until
// I clicked add set." She logged 20x10, 50x5, 70x3 into the three boxes her
// deadlift card gave her, then pressed Add Set four times for her real work:
// 90x8, 95x8, 95x8, 95x6.
//
// THE DAMAGE WAS NOT THE MISSING BOXES. `is_warmup` exists, is filtered by
// twelve readers, and NOTHING IN THE APP HAS EVER BEEN ABLE TO SET IT — so her
// build-up is stored as working sets. `getDoubleProgressionRecommendation`
// then asks `every(reps >= 8)`, sees a 5-rep row, and holds the weight. Her
// card reads "Held at 95kg — didn't hit 8 reps on every set last time" and
// would have read that every week for ever: three perfect top sets can never
// clear it. Her dumbbell rows were frozen at 20kg the same way.
//
// AND A HARM WORSE THAN THE FREEZE, one step away: had she not pressed Add
// Set, the heaviest row would have been 70kg, TodayPanel stores the
// recommendation whether or not it progressed, and the card would print 70kg
// as the working weight — from which the next ramp is scaled. Contamination
// walks the prescription DOWN.
//
// WHY THIS IS READ-TIME. It repairs every already-logged session on deploy,
// with no migration and no rewrite of her diary, and it holds whatever the set
// grid ends up looking like.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { workingSetsOf } from '../src/lib/progression-engine'
import type { ExerciseSetLog } from '../src/lib/types'

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

/** kg x reps, in the order she logged them. */
const session = (rows: [number, number][]): ExerciseSetLog[] =>
  rows.map(([weight_kg, reps_completed], i) => ({
    set_number: i + 1, weight_kg, reps_completed, is_warmup: false,
  }) as unknown as ExerciseSetLog)

const shape = (sets: ExerciseSetLog[]) => sets.map(s => `${s.weight_kg}x${s.reps_completed}`)

console.log('\n[1] Her deadlift, the session she reported')
{
  // MEASURED FROM HER SCREENSHOTS, not invented: the card's own summary line
  // read "20kg x 10 · 50kg x 5 · 70kg x 3 · 90kg x 8 · 95kg x 8, 8, 6", and
  // the header said 95kg with a target of 8.
  const logged = session([[20, 10], [50, 5], [70, 3], [90, 8], [95, 8], [95, 8], [95, 6]])
  const working = workingSetsOf(logged, { repRangeLow: 6 })
  check('the build-up rows are not working sets', shape(working).join() === ['90x8', '95x8', '95x8', '95x6'].join(), shape(working))
  check('...so the heaviest WORKING set is 95kg, not dragged down', Math.max(...working.map(s => s.weight_kg)) === 95)

  // The freeze itself, reproduced: the old rule ran `every` over every row.
  check('the OLD rule froze her — a 5-rep build-up fails "8 reps on every set"',
    logged.every(s => s.reps_completed >= 8) === false)
  check('...and the new one judges only what she actually worked at',
    working.every(s => s.reps_completed >= 6) === true)

  // AND THE WORSE HARM. Had she stopped after the build-up, the card would
  // have printed the heaviest row — 70kg — as her working weight, and the next
  // session's ramp is scaled from that number.
  //
  // MEASURED HERE, and it is why filtering alone is not enough. A day that was
  // only warmed up does NOT collapse to nothing — it collapses to its heaviest
  // BUILD-UP row, because that row is the session's own top set. Filtering
  // would hand the card 70kg as a working weight and the next ramp would be
  // scaled from it. So the engine must also refuse to judge a session that
  // does not contain a full set of working sets; §5 pins that guard.
  const stoppedEarly = session([[20, 10], [50, 5], [70, 3]])
  const stillWorking = workingSetsOf(stoppedEarly, { repRangeLow: 6 })
  check('an abandoned warm-up collapses to its heaviest build-up row, not to nothing',
    shape(stillWorking).join() === ['70x3'].join(), shape(stillWorking))
  check('...which is FEWER than the three sets the session asked for, so it is not judgeable',
    stillWorking.length < 3, stillWorking.length)
}

console.log('\n[2] Her dumbbell rows, frozen at 20kg the same way')
{
  // Card: "Held at 20kg — didn't hit 13 reps on every set last time", target
  // 11-13, logged 14x9, 18x9, 20x9.
  const logged = session([[14, 9], [18, 9], [20, 9]])
  const working = workingSetsOf(logged, { repRangeLow: 11 })
  check('her ramp up to 20kg is dropped', shape(working).join() === ['20x9'].join(), shape(working))
  check('...and she is STILL held, correctly, because she did 9 of a target 13',
    working.every(s => s.reps_completed >= 13) === false)
}

console.log('\n[3] A ramped WORKING prescription never loses a set')
{
  // THE CRUX, and why a weight threshold alone cannot work. RAMP_SCHEMES
  // prescribes a BUILD-UP step at 85% of the top set; RAMP_PERCENT_TABLE
  // prescribes a ramped WORKING set at 85% of the top set. Same number,
  // opposite meaning. Only the reps separate them.
  const threeSet = session([[85, 6], [92, 6], [100, 6]])
  const kept3 = workingSetsOf(threeSet, { repRangeLow: 6, perSetLoadKg: [85, 92, 100] })
  check('a 3-set ramped prescription keeps all three', kept3.length === 3, shape(kept3))

  const fiveSet = session([[75, 6], [85, 6], [92, 6], [96, 6], [100, 6]])
  const kept5 = workingSetsOf(fiveSet, { repRangeLow: 6, perSetLoadKg: [75, 85, 92, 96, 100] })
  check('a 5-set ramped prescription keeps all five', kept5.length === 5, shape(kept5))

  // PLATE ROUNDING. buildPerSetLoads rounds every step to the plates actually
  // available, so a set prescribed AT the floor can land a kilo under it. A
  // floor with no tolerance would throw that set away.
  const rounded = session([[83.5, 6], [92.5, 6], [100, 6]])
  const keptRounded = workingSetsOf(rounded, { repRangeLow: 6, perSetLoadKg: [85, 92, 100] })
  check('...and a rounded-down first set survives the floor', keptRounded.length === 3, shape(keptRounded))

  // THE OTHER SIDE OF THE SAME NUMBER: an 85% BUILD-UP step is prescribed for
  // 2 reps, so the reps clause catches what the weight clause cannot.
  const withRampStep = session([[19, 10], [47.5, 5], [66.5, 3], [80.75, 2], [95, 8], [95, 8], [95, 8]])
  const keptWork = workingSetsOf(withRampStep, { repRangeLow: 6 })
  check('an 85% build-up step at 2 reps IS dropped, though its weight clears the floor',
    shape(keptWork).join() === ['95x8', '95x8', '95x8'].join(), shape(keptWork))
}

console.log('\n[4] The cases it must not touch')
{
  const bodyweight = session([[0, 12], [0, 10], [0, 8]])
  check('bodyweight is untouched — by construction, not by a guard',
    workingSetsOf(bodyweight, { repRangeLow: 8 }).length === 3)

  const lighterDay = session([[60, 8], [60, 8], [60, 8]])
  check('a deliberately lighter day loses nothing — the top set is per SESSION',
    workingSetsOf(lighterDay, { repRangeLow: 6 }).length === 3)

  const noContext = session([[20, 10], [50, 5], [70, 3], [95, 8]])
  check('with no rep range the weight floor still does its job',
    shape(workingSetsOf(noContext)).join() === ['95x8'].join(), shape(workingSetsOf(noContext)))

  check('an empty session stays empty', workingSetsOf([]).length === 0)

  // THE DETECTOR MUST NOT GO VACUOUS. If the rule were ever loosened to "keep
  // everything", every check above that asserts a KEEP would still pass.
  const mustDrop = workingSetsOf(session([[20, 10], [95, 8], [95, 8]]), { repRangeLow: 6 })
  check('proof it can still drop: a 20kg row against a 95kg top set goes', mustDrop.length === 2, shape(mustDrop))
}

console.log('\n[5] The engine asks its questions of the working sets only')
{
  const src = readFileSync('src/lib/progression-engine.ts', 'utf8')
  // A FUNCTION, NOT A BARE NAME — an import is not a use.
  check('the double-progression rule filters first', /const working = workingSetsOf\(sessionSets, ctx\)/.test(src))
  check('...and asks BOTH its questions of the filtered list',
    /maxWorkingWeight\(working\)/.test(src) && /working\.every\(s => s\.reps_completed >= prescribedRepRangeHigh\)/.test(src))

  // ORDER IS THE PROPERTY, not the line. checkDoubleProgression takes the
  // first `prescribedSets` rows BY ORDER; Ashley's first three rows were her
  // build-up, so slicing before filtering hid her three real 95kg sets at
  // positions 4-6 and the same-session bump could never fire. A second,
  // independent freeze from the same cause.
  const filterAt = src.indexOf('const workingToday = workingSetsOf(todaySets')
  const sliceAt = src.indexOf('workingToday.slice(0, prescribedSets)')
  check('the same-session check filters BEFORE it slices', filterAt > -1 && sliceAt > -1 && filterAt < sliceAt, { filterAt, sliceAt })
  check('...and nothing slices the unfiltered list any more', !/todaySets\.slice\(0, prescribedSets\)/.test(src))

  // The added-load twin had its own version of the bug: `every` ran over rows
  // carrying no added weight at all.
  // THE GUARD THE MEASUREMENT IN §1 DEMANDS: a session with fewer working sets
  // than it prescribed cannot move the weight, in either direction.
  check('a session short of its prescribed working sets is not judged at all',
    /if \(ctx\.prescribedSets != null && working\.length < ctx\.prescribedSets\) return null/.test(src))
  check('...and the screen tells it how many were prescribed', /prescribedSets: ex\.sets/.test(readFileSync('src/components/exercise/TodayPanel.tsx', 'utf8')))
  check('the added-load rule judges only the sets that carried the belt',
    /const topAdded = withAdded\.filter\(/.test(src) && /topAdded\.every\(s => s\.reps_completed >= prescribedRepRangeHigh\)/.test(src))

  const panel = readFileSync('src/components/exercise/TodayPanel.tsx', 'utf8')
  // EVERY call site, not "somewhere in the file". MEASURED: a mutation that
  // stripped the context from ONE of the two calls ran green, because a bare
  // /workingCtx\(ex\)/ was still satisfied by the other one. Derived from the
  // calls themselves, so a third call site added later is covered too.
  const calls = [...panel.matchAll(/getDoubleProgressionRecommendation\(/g)].map(m => panel.slice(m.index ?? 0, (m.index ?? 0) + 170).split('\n')[0])
  check('there are calls to check, so this is not vacuous', calls.length >= 2, calls.length)
  check('EVERY call hands the engine the exercise\'s OWN prescription',
    calls.every(c => c.includes('workingCtx(ex)')), calls.filter(c => !c.includes('workingCtx(ex)')))
  check('...built from the rep range and the per-set weights, not a constant',
    /repRangeLow: parseRepsLow\(ex\.reps\), perSetLoadKg: ex\.per_set_load\?\.map\(/.test(panel))
}

if (failures > 0) { console.error(`\n${failures} check(s) FAILED.`); process.exit(1) }
console.log('\nA build-up set is not a working set.')
