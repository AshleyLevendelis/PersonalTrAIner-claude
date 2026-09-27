// ---------------------------------------------------------------------------
// DOES THE NUTRITION TAB SHOW A DIFFERENT DAY TOMORROW?
//
// WHAT WENT WRONG, because the gate is shaped by it. On 19 Sep 2026 the app's
// day assembly took a "what did you eat recently" argument, the Nutrition tab
// passed it `{}`, and I reported that as the defect and the fix as one line.
// Measured over 500 profiles, threading that argument in exactly as the
// shopping list already did: 1.11 distinct days in a seven-day week, and 89.4%
// of profiles eating the identical day every day. The argument was not the
// problem. The preference behind it was a 0.01 penalty added to a macro
// distance score, against a median gap of 0.033 — it could only ever win an
// almost exact tie. An argument that is not passed and an argument that does
// nothing look identical from the call site.
//
// So this gate holds BOTH halves, and neither alone would have caught it:
//   - the mechanism (variety is a sort key inside tolerance, not a penalty),
//   - and the wiring (both surfaces walk one rotation, keyed on the date).
//
// `npm run measure:meal-variety` is the population number. This is the
// property.
// ---------------------------------------------------------------------------

// SET BEFORE ANY DATE IS CONSTRUCTED. §1's detector needs a timezone where the
// naive day-number arithmetic actually misbehaves, and Europe/London is one:
// measured, 29 -> 30 March steps by 0 and 25 -> 26 October steps by 2. Running
// the whole gate under it also proves epochDay is immune in the one timezone
// that breaks the obvious implementation, rather than only in this machine's.
process.env.TZ = 'Europe/London'

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  assembleDay,
  OFF_TARGET_VARIETY_MARGIN,
  QUIET_RESIZE_MIN,
  QUIET_RESIZE_MAX,
  DAY_CALORIE_TOLERANCE,
  DAY_PROTEIN_LOWER_RATIO,
  DAY_PROTEIN_UPPER_RATIO,
  DAY_CARB_TOLERANCE,
  DAY_FAT_TOLERANCE,
  macroDistanceScore,
  type PoolOption,
} from '../src/lib/meal-generation'
import { computeMealMacros, type MealIngredientLine } from '../src/lib/food-db'
import {
  buildRotation,
  assembleRotationDay,
  epochDay,
  rotationIndexFor,
  ROTATION_DAYS,
  RECENT_WINDOW,
} from '../src/lib/meal-rotation'
import type { MacroTargets } from '../src/lib/types'
import type { MealSlotName } from '../src/lib/meal-store'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
/** Comments blanked before any ABSENCE check: a note explaining why something was removed would otherwise satisfy the check that it was removed. */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

const opt = (slot: MealSlotName, name: string, m: MacroTargets): PoolOption =>
  ({ slot, name, ingredients: [{ name: 'chicken breast', quantity: 100, unit: 'g' }], macros: m, tags: [] })

/**
 * A dish whose stored macros ARE its ingredients' macros, the way every real
 * pool option is stored. `opt` above is not, and that is fine for everything
 * before §3d — but a resize recomputes a dish from its ingredients, so a check
 * about resizing built from `opt` would be measuring chicken breast.
 */
const dish = (slot: MealSlotName, name: string, ingredients: MealIngredientLine[]): PoolOption => {
  const c = computeMealMacros(ingredients)
  return { slot, name, ingredients, tags: [], macros: { calories: Math.round(c.kcal), protein: Math.round(c.protein), carbs: Math.round(c.carbs), fat: Math.round(c.fat) } }
}
/** The day's bands, read off the exported constants so a retune moves this too. */
const inBands = (t: MacroTargets, target: MacroTargets) =>
  Math.abs(t.calories - target.calories) / target.calories <= DAY_CALORIE_TOLERANCE
  && t.protein >= target.protein * DAY_PROTEIN_LOWER_RATIO && t.protein <= target.protein * DAY_PROTEIN_UPPER_RATIO
  && Math.abs(t.carbs - target.carbs) / target.carbs <= DAY_CARB_TOLERANCE
  && Math.abs(t.fat - target.fat) / target.fat <= DAY_FAT_TOLERANCE
const plus = (a: MacroTargets, b: MacroTargets): MacroTargets =>
  ({ calories: a.calories + b.calories, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat })

// ===========================================================================
console.log('\n1. The day number is calendar arithmetic, not a division')
// ===========================================================================
{
  // The rotation index is epochDay % 7, so if two consecutive calendar dates
  // ever produce the same number the rotation repeats a day, and if they skip
  // one it skips a day. Twice a year, for everybody in that timezone.
  const runs: string[][] = [
    ['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31'], // clocks forward
    ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'], // clocks back
    ['2026-01-30', '2026-01-31', '2026-02-01'],                             // month end
    ['2024-02-28', '2024-02-29', '2024-03-01'],                             // leap day
    ['2025-12-30', '2025-12-31', '2026-01-01'],                             // year end
  ]
  let allConsecutive = true
  const bad: string[] = []
  for (const run of runs) {
    for (let i = 1; i < run.length; i++) {
      if (epochDay(run[i]) - epochDay(run[i - 1]) !== 1) { allConsecutive = false; bad.push(`${run[i - 1]}->${run[i]}`) }
    }
  }
  check('consecutive dates are consecutive day numbers, across DST both ways, a month end, a leap day and a year end',
    allConsecutive, bad)

  // THE DETECTOR, PROVEN. The obvious implementation — parse as local midnight
  // and divide by a fixed 86,400,000 — is wrong, and this asserts it is wrong
  // HERE, so a future "simplification" to that form cannot pass the check
  // above by accident and so this section can never go vacuous.
  const naive = (d: string) => Math.floor(new Date(`${d}T00:00:00`).getTime() / 86_400_000)
  check('...and the naive local-midnight division REPEATS a day at the spring change, so the check above is not free',
    naive('2026-03-30') - naive('2026-03-29') === 0, { naive: naive('2026-03-30') - naive('2026-03-29') })
  check('...and SKIPS one at the autumn change',
    naive('2026-10-26') - naive('2026-10-25') === 2, { naive: naive('2026-10-26') - naive('2026-10-25') })
  check('...while epochDay steps by exactly 1 at both, in that same timezone',
    epochDay('2026-03-30') - epochDay('2026-03-29') === 1 && epochDay('2026-10-26') - epochDay('2026-10-25') === 1)

  const indices = ['2026-09-19', '1969-12-28', '2026-03-30', '2400-01-01'].map(rotationIndexFor)
  check('the rotation index is always a real slot in range, including before the epoch',
    indices.every(i => Number.isInteger(i) && i >= 0 && i < ROTATION_DAYS), indices)
  check('a date the app could never produce lands on a day rather than on NaN',
    rotationIndexFor('not-a-date') === 0 && Number.isInteger(epochDay('')))
  const week = Array.from({ length: 14 }, (_, k) => rotationIndexFor(`2026-09-${String(k + 1).padStart(2, '0')}`))
  check('...and fourteen consecutive dates walk the rotation twice, in order',
    week.slice(0, 7).every((v, i) => i === 0 || v === (week[i - 1] + 1) % ROTATION_DAYS)
    && week[7] === week[0], week)
}

// ===========================================================================
console.log('\n2. Inside tolerance, variety decides — and it is not a tiebreak')
// ===========================================================================
{
  // CONSTRUCTED TO BE UNDER PRESSURE, and the pressure is asserted rather than
  // assumed. Two dinners, both landing the day inside every band; the repeated
  // one fits BETTER, by a margin deliberately wider than the old penalty could
  // ever have overcome. If that margin were small the section would pass
  // without proving anything.
  const targets: MacroTargets = { calories: 2000, protein: 150, carbs: 200, fat: 67 }
  const breakfast = [opt('breakfast', 'Porridge', { calories: 600, protein: 45, carbs: 60, fat: 20 })]
  const dinner = [
    opt('dinner', 'Yesterday Chicken', { calories: 1400, protein: 105, carbs: 140, fat: 47 }),
    opt('dinner', 'Something Else', { calories: 1355, protein: 103, carbs: 136, fat: 46 }),
  ]
  const pools = { breakfast, dinner }

  const withRepeat = macroDistanceScore(
    { calories: 2000, protein: 150, carbs: 200, fat: 67 }, targets)
  const withoutRepeat = macroDistanceScore(
    { calories: 1955, protein: 148, carbs: 196, fat: 66 }, targets)
  // 0.01 is the penalty variety used to be, written as a literal: the
  // constant is gone, and this is about what it could never overcome.
  check('the fixture really is under pressure: the repeated day fits better by more than the old penalty',
    withoutRepeat - withRepeat > 0.01, { gap: +(withoutRepeat - withRepeat).toFixed(4), oldPenalty: 0.01 })

  const fresh = assembleDay(pools, targets, {}, [])
  check('with no history the best-fitting day wins, exactly as before',
    fresh.chosen.dinner?.name === 'Yesterday Chicken', fresh.chosen.dinner?.name)
  check('...and that day is inside tolerance, so section 2 is testing the in-tolerance branch',
    fresh.withinTolerance)

  const repeated = assembleDay(pools, targets, { dinner: ['Yesterday Chicken'] }, [])
  check('having had it recently, the app serves the other one instead',
    repeated.chosen.dinner?.name === 'Something Else', repeated.chosen.dinner?.name)
  check('...and the day it serves is still inside every band — variety never buys an out-of-tolerance day',
    repeated.withinTolerance)

  // The whole pool used recently is a preference that cannot be satisfied, not
  // an error: the app still has to put dinner on the table.
  const exhausted = assembleDay(pools, targets, { dinner: ['Yesterday Chicken', 'Something Else'] }, [])
  check('when every option was had recently it still serves the best-fitting one rather than nothing',
    exhausted.chosen.dinner?.name === 'Yesterday Chicken', exhausted.chosen.dinner?.name)
}

// ===========================================================================
console.log('\n3. Outside tolerance, fit still wins beyond the margin')
// ===========================================================================
{
  // A day the app cannot get right must spend everything on getting it close.
  // Novelty is worth the old 0.01 there and no more. Same shape as section 2
  // with the targets moved far out of reach of either combination.
  const targets: MacroTargets = { calories: 4000, protein: 400, carbs: 400, fat: 130 }
  const pools = {
    dinner: [
      opt('dinner', 'Yesterday Chicken', { calories: 2000, protein: 200, carbs: 200, fat: 65 }),
      opt('dinner', 'Something Else', { calories: 1200, protein: 120, carbs: 120, fat: 39 }),
    ],
  }
  const none = assembleDay(pools, targets, {}, [])
  check('the fixture really is out of tolerance, so this section tests the other branch',
    !none.withinTolerance)
  const gap3 = macroDistanceScore({ calories: 1200, protein: 120, carbs: 120, fat: 39 }, targets)
    - macroDistanceScore({ calories: 2000, protein: 200, carbs: 200, fat: 65 }, targets)
  check('...and the repeat fits better by MORE than the off-target margin, so the margin cannot decide it',
    gap3 > OFF_TARGET_VARIETY_MARGIN, { gap: +gap3.toFixed(4), margin: OFF_TARGET_VARIETY_MARGIN })
  const repeated = assembleDay(pools, targets, { dinner: ['Yesterday Chicken'] }, [])
  check('a much better-fitting repeat still wins when no combination is in tolerance',
    repeated.chosen.dinner?.name === 'Yesterday Chicken', repeated.chosen.dinner?.name)

  // ...but the old tiebreak is still doing its job down here, so this branch
  // is not simply "ignore the history".
  const near = {
    dinner: [
      opt('dinner', 'Yesterday Chicken', { calories: 2000, protein: 200, carbs: 200, fat: 65 }),
      opt('dinner', 'Something Else', { calories: 2000, protein: 200, carbs: 200, fat: 65 }),
    ],
  }
  const tied = assembleDay(near, targets, { dinner: ['Yesterday Chicken'] }, [])
  check('...and between two equally bad days it still avoids the one just eaten',
    tied.chosen.dinner?.name === 'Something Else', tied.chosen.dinner?.name)
}

// ===========================================================================
console.log('\n3b. Tolerance outranks variety, not the other way round')
// ===========================================================================
{
  // THE CASE THAT SEPARATES THE TWO KEYS, and without it the whole order is
  // untested: one dinner lands the day inside every band but was eaten
  // yesterday; the other is novel and misses badly. Serving the novel one
  // would be variety buying an out-of-tolerance day, which is the single
  // thing this design must never do.
  const targets: MacroTargets = { calories: 2000, protein: 150, carbs: 200, fat: 67 }
  const pools = {
    breakfast: [opt('breakfast', 'Porridge', { calories: 600, protein: 45, carbs: 60, fat: 20 })],
    dinner: [
      opt('dinner', 'Had It Yesterday', { calories: 1400, protein: 105, carbs: 140, fat: 47 }),
      opt('dinner', 'Novel But Wrong', { calories: 700, protein: 40, carbs: 70, fat: 25 }),
    ],
  }
  const onlyGood = assembleDay({ breakfast: pools.breakfast, dinner: [pools.dinner[0]] }, targets, {}, [])
  const onlyBad = assembleDay({ breakfast: pools.breakfast, dinner: [pools.dinner[1]] }, targets, {}, [])
  check('the fixture is under pressure: one dinner makes a correct day and the other does not',
    onlyGood.withinTolerance && !onlyBad.withinTolerance,
    { good: onlyGood.withinTolerance, bad: onlyBad.withinTolerance })

  const served = assembleDay(pools, targets, { dinner: ['Had It Yesterday'] }, [])
  check('a correct day just eaten beats a novel day that misses the targets',
    served.chosen.dinner?.name === 'Had It Yesterday', served.chosen.dinner?.name)
  check('...so the day served is still inside tolerance', served.withinTolerance)
}

// ===========================================================================
console.log('\n3c. Off target, a nearly-as-close different day beats the same day again')
// ===========================================================================
{
  // 27 Sep 2026. A pool with no correct day used to serve its closest day
  // every day, because variety down here was a 0.01 tiebreak. Among off-target
  // days within OFF_TARGET_VARIETY_MARGIN of the closest, variety now decides.
  // BOTH SIDES OF THE MARGIN, each with its gap asserted, so neither check can
  // pass by the fixture falling on the wrong side of it.
  const targets: MacroTargets = { calories: 4000, protein: 400, carbs: 400, fat: 130 }
  const eaten = opt('dinner', 'Yesterday Chicken', { calories: 2000, protein: 200, carbs: 200, fat: 65 })
  const near = opt('dinner', 'Nearly As Close', { calories: 1950, protein: 195, carbs: 195, fat: 63 })
  const far = opt('dinner', 'Much Further', { calories: 1800, protein: 180, carbs: 180, fat: 58 })
  const fitOf = (o: PoolOption) => macroDistanceScore(o.macros, targets)
  const nearGap = fitOf(near) - fitOf(eaten)
  const farGap = fitOf(far) - fitOf(eaten)
  check('the fixture straddles the margin: one alternative is inside it and one is outside',
    nearGap > 0 && nearGap < OFF_TARGET_VARIETY_MARGIN && farGap > OFF_TARGET_VARIETY_MARGIN,
    { nearGap: +nearGap.toFixed(4), farGap: +farGap.toFixed(4), margin: OFF_TARGET_VARIETY_MARGIN })
  // "Nearly As Close" is not better than the one just eaten — it is WORSE by
  // less than the margin, which is the whole point, and the check says so.
  const fresh = assembleDay({ dinner: [eaten, near] }, targets, {}, [])
  check('with no history the closest off-target day is served, exactly as before',
    fresh.chosen.dinner?.name === 'Yesterday Chicken' && !fresh.withinTolerance, fresh.chosen.dinner?.name)
  const withinMargin = assembleDay({ dinner: [eaten, near] }, targets, { dinner: ['Yesterday Chicken'] }, [])
  check('having eaten it, a different day within the margin is served instead',
    withinMargin.chosen.dinner?.name === 'Nearly As Close', withinMargin.chosen.dinner?.name)
  const beyondMargin = assembleDay({ dinner: [eaten, far] }, targets, { dinner: ['Yesterday Chicken'] }, [])
  check('...but not one beyond it: fit still decides there',
    beyondMargin.chosen.dinner?.name === 'Yesterday Chicken', beyondMargin.chosen.dinner?.name)
}

// ===========================================================================
console.log('\n3d. A small resize can make a correct day, and then variety decides')
// ===========================================================================
{
  // 27 Sep 2026, Ashley: "every day is showing me the same meals". Every dish
  // is sized to the targets of the day its pool was made, so once the targets
  // move no dish lands the day on target AS STORED — and the search judged
  // only the stored numbers, then resized the one winner afterwards. The
  // winner was the same every day. Now a day the app would bring on target
  // with a resize of QUIET_RESIZE_MIN-MAX on its largest free dish counts as
  // the correct day it will be served as.
  //
  // Breakfast is PINNED, so the dinner is always the dish resized — without
  // that the "largest free dish" could be either, and the fixture would be
  // testing which one rather than whether.
  const porridge = dish('breakfast', 'Porridge', [{ name: 'oats', quantity: 80, unit: 'g' }, { name: 'milk', quantity: 200, unit: 'ml' }])
  const chicken = (name: string, k: number) => dish('dinner', name, [
    { name: 'chicken breast', quantity: Math.round(150 * k), unit: 'g' },
    { name: 'white rice', quantity: Math.round(120 * k), unit: 'g' },
    { name: 'olive oil', quantity: Math.round(10 * k), unit: 'g' },
  ])
  const usual = chicken('Chicken and rice', 1)
  // The targets the pool was NOT made for: exactly the day a 1.2x usual dinner makes.
  const bigger = chicken('(reference)', 1.2)
  const targets = plus(porridge.macros, bigger.macros)
  const bowl = dish('dinner', 'Chicken rice bowl', [
    { name: 'chicken breast', quantity: 140, unit: 'g' }, { name: 'white rice', quantity: 110, unit: 'g' }, { name: 'olive oil', quantity: 8, unit: 'g' },
  ])
  const tooSmall = chicken('Small chicken and rice', 0.7)
  const tooBig = chicken('Huge chicken and rice', 1.7)
  const pinned = { breakfast: porridge }
  const factorFor = (o: PoolOption) => (targets.calories - porridge.macros.calories) / o.macros.calories

  check('the fixture is under pressure: no dinner lands the day on target as stored',
    [usual, bowl, tooSmall, tooBig].every(o => !inBands(plus(porridge.macros, o.macros), targets)),
    [usual, bowl, tooSmall, tooBig].map(o => plus(porridge.macros, o.macros)))
  check('...the two usual dinners need a resize INSIDE the quiet range, the other two one OUTSIDE it, either side',
    [usual, bowl].every(o => factorFor(o) >= QUIET_RESIZE_MIN && factorFor(o) <= QUIET_RESIZE_MAX)
    && factorFor(tooSmall) > QUIET_RESIZE_MAX && factorFor(tooBig) < QUIET_RESIZE_MIN,
    { usual: +factorFor(usual).toFixed(2), bowl: +factorFor(bowl).toFixed(2), tooSmall: +factorFor(tooSmall).toFixed(2), tooBig: +factorFor(tooBig).toFixed(2), range: [QUIET_RESIZE_MIN, QUIET_RESIZE_MAX] })
  const rawGap = macroDistanceScore(plus(porridge.macros, bowl.macros), targets) - macroDistanceScore(plus(porridge.macros, usual.macros), targets)
  check('...and as stored the usual dinner fits better by more than the off-target margin, so the margin alone cannot hand the bowl a day',
    rawGap > OFF_TARGET_VARIETY_MARGIN, { rawGap: +rawGap.toFixed(4), margin: OFF_TARGET_VARIETY_MARGIN })

  const fresh = assembleDay({ breakfast: [porridge], dinner: [usual, bowl] }, targets, {}, [], pinned)
  check('with no history a correct day is served', fresh.withinTolerance, fresh.totals)
  check('...made by resizing the dinner, not by serving it as stored',
    fresh.chosen.dinner?.ingredients[0].quantity !== (fresh.chosen.dinner?.name === 'Chicken and rice' ? 150 : 140),
    fresh.chosen.dinner?.ingredients)
  check('...and the pinned breakfast is untouched', JSON.stringify(fresh.chosen.breakfast?.ingredients) === JSON.stringify(porridge.ingredients))

  const next = assembleDay({ breakfast: [porridge], dinner: [usual, bowl] }, targets, { dinner: [fresh.chosen.dinner!.name] }, [], pinned)
  check('having eaten that dinner, the other one is served — a different day',
    next.chosen.dinner?.name !== fresh.chosen.dinner?.name, { first: fresh.chosen.dinner?.name, next: next.chosen.dinner?.name })
  check('...and it is still a correct day', next.withinTolerance, next.totals)

  // THE RANGE, BOTH ENDS. A dinner the app could bring on target only by
  // resizing it past the quiet range is not a correct day for variety to buy:
  // the eaten dinner is served again, resized, rather than a dinner doubled
  // or halved to be different.
  const small = assembleDay({ breakfast: [porridge], dinner: [usual, tooSmall] }, targets, { dinner: ['Chicken and rice'] }, [], pinned)
  check('a dinner needing more than the quiet range upward does not buy a different day',
    small.chosen.dinner?.name === 'Chicken and rice' && small.withinTolerance, small.chosen.dinner?.name)
  const big = assembleDay({ breakfast: [porridge], dinner: [usual, tooBig] }, targets, { dinner: ['Chicken and rice'] }, [], pinned)
  check('...nor one needing more than it downward',
    big.chosen.dinner?.name === 'Chicken and rice' && big.withinTolerance, big.chosen.dinner?.name)

  // A RESIZE ONLY FIXES THE CALORIES. A dinner that needs a resize inside
  // the range but is the wrong SHAPE — here a cheese toastie, all fat and too
  // little protein — reaches the calorie target and misses the rest, and
  // that is not a correct day either.
  const toastie = dish('dinner', 'Cheese toastie', [
    { name: 'cheddar', quantity: 80, unit: 'g' }, { name: 'wholemeal bread', quantity: 2, unit: 'slice' },
  ])
  const scaledToastieDay = plus(porridge.macros, {
    calories: toastie.macros.calories * factorFor(toastie), protein: toastie.macros.protein * factorFor(toastie),
    carbs: toastie.macros.carbs * factorFor(toastie), fat: toastie.macros.fat * factorFor(toastie),
  })
  check('the fixture is under pressure: the toastie needs a resize inside the range, and resized it still misses the day',
    factorFor(toastie) >= QUIET_RESIZE_MIN && factorFor(toastie) <= QUIET_RESIZE_MAX && !inBands(scaledToastieDay, targets),
    { factor: +factorFor(toastie).toFixed(2), day: scaledToastieDay })
  const shape = assembleDay({ breakfast: [porridge], dinner: [usual, toastie] }, targets, { dinner: ['Chicken and rice'] }, [], pinned)
  check('...so it does not buy a different day: the eaten dinner is served again, on target',
    shape.chosen.dinner?.name === 'Chicken and rice' && shape.withinTolerance, { dinner: shape.chosen.dinner?.name, totals: shape.totals })

  // AND THE EXACT DAY IS WHAT IS JUDGED, NOT THE ESTIMATE. The search skips
  // the food lookups for a resize whose estimate is plainly off target, with
  // 5% of slack for rounding — so the toastie above never reaches the exact
  // judgement at all. This dinner does: resized, its day is short on protein
  // by less than the slack and more than the band.
  const light = dish('dinner', 'Chicken and rice, light on chicken', [
    { name: 'chicken breast', quantity: 130, unit: 'g' }, { name: 'white rice', quantity: 140, unit: 'g' }, { name: 'olive oil', quantity: 10, unit: 'g' },
  ])
  const lightProtein = (porridge.macros.protein + light.macros.protein * factorFor(light)) / targets.protein
  check('the fixture is under pressure: resized, this dinner\'s day is under the protein band by less than the estimate\'s 5% slack',
    factorFor(light) >= QUIET_RESIZE_MIN && factorFor(light) <= QUIET_RESIZE_MAX
    && lightProtein < DAY_PROTEIN_LOWER_RATIO && lightProtein > DAY_PROTEIN_LOWER_RATIO - 0.05,
    { factor: +factorFor(light).toFixed(2), proteinRatio: +lightProtein.toFixed(3) })
  const nearMiss = assembleDay({ breakfast: [porridge], dinner: [usual, light] }, targets, { dinner: ['Chicken and rice'] }, [], pinned)
  check('...and it does not buy a different day either',
    nearMiss.chosen.dinner?.name === 'Chicken and rice' && nearMiss.withinTolerance, { dinner: nearMiss.chosen.dinner?.name, totals: nearMiss.totals })

  // A RESIZE IS SPENT ONLY WHERE IT BUYS A DIFFERENT DAY. A dinner already
  // on target as stored beats a resized one that would fit closer, when
  // neither was eaten recently.
  const stored = chicken('Chicken and rice, as it comes', 1.17)
  const storedDay = plus(porridge.macros, stored.macros)
  const resizedFit = macroDistanceScore(fresh.totals, targets)
  check('the fixture is under pressure: one dinner is on target as stored, and the resized one would fit closer',
    inBands(storedDay, targets) && macroDistanceScore(storedDay, targets) > resizedFit,
    { stored: +macroDistanceScore(storedDay, targets).toFixed(4), resized: +resizedFit.toFixed(4) })
  const noResize = assembleDay({ breakfast: [porridge], dinner: [usual, stored] }, targets, {}, [], pinned)
  check('...and the stored one is served, exactly as stored',
    noResize.chosen.dinner?.name === stored.name
    && JSON.stringify(noResize.chosen.dinner?.ingredients) === JSON.stringify(stored.ingredients),
    noResize.chosen.dinner)
}

// ===========================================================================
console.log('\n4. A week of days, not one day seven times')
// ===========================================================================
{
  const targets: MacroTargets = { calories: 2000, protein: 150, carbs: 200, fat: 67 }
  const pools = {
    breakfast: [
      opt('breakfast', 'B1', { calories: 600, protein: 45, carbs: 60, fat: 20 }),
      opt('breakfast', 'B2', { calories: 610, protein: 46, carbs: 61, fat: 20 }),
      opt('breakfast', 'B3', { calories: 590, protein: 44, carbs: 59, fat: 20 }),
    ],
    dinner: [
      opt('dinner', 'D1', { calories: 1400, protein: 105, carbs: 140, fat: 47 }),
      opt('dinner', 'D2', { calories: 1390, protein: 104, carbs: 139, fat: 47 }),
      opt('dinner', 'D3', { calories: 1410, protein: 106, carbs: 141, fat: 47 }),
    ],
  }
  const rotation = buildRotation(pools, targets, [])
  check('the rotation is a whole week long', rotation.days.length === ROTATION_DAYS)
  const keys = rotation.days.map(d => `${d.chosen.breakfast?.name}|${d.chosen.dinner?.name}`)
  check('and it is not the same day seven times', new Set(keys).size > 1, keys)
  check('every day of it is still inside tolerance', rotation.days.every(d => d.withinTolerance), keys)
  check('the history handed to day 0 is empty and day 1 knows what day 0 ate',
    Object.keys(rotation.historyFor(0)).length === 0
    && rotation.historyFor(1).dinner?.[0] === rotation.days[0].chosen.dinner?.name)
  // BOUNDED ABOVE **AND** BELOW. The upper bound alone was satisfied by
  // shrinking RECENT_WINDOW to 1 — a check comparing behaviour against the
  // constant that drives it can only ever agree with itself. The literal 2 is
  // the property: the app remembers more than just yesterday, so a two-option
  // slot cannot ping-pong A, B, A, B.
  const deepHistory = Object.values(rotation.historyFor(ROTATION_DAYS - 1))
  check('it remembers more than just yesterday',
    deepHistory.length > 0 && deepHistory.every(v => (v ?? []).length >= 2), deepHistory)
  check(`...and never more than ${RECENT_WINDOW} days back`,
    deepHistory.every(v => (v ?? []).length <= RECENT_WINDOW), deepHistory)
  check('asking for a day outside the week wraps instead of returning nothing',
    JSON.stringify(rotation.historyFor(ROTATION_DAYS + 2)) === JSON.stringify(rotation.historyFor(2)))

  // Determinism: two builds from the same inputs must agree, or the tab and
  // the shopping list computing their own rotations would still diverge.
  const again = buildRotation(pools, targets, [])
  check('two builds from the same pools and targets produce the identical week',
    JSON.stringify(again.days.map(d => d.chosen)) === JSON.stringify(rotation.days.map(d => d.chosen)))

  // The date picks the day, and a different date picks a different one.
  const a = assembleRotationDay(rotation, '2026-09-19', pools, targets, [])
  const sameDay = assembleRotationDay(rotation, '2026-09-19', pools, targets, [])
  check('the same date always gives the same day', JSON.stringify(a.chosen) === JSON.stringify(sameDay.chosen))
  const laterDates = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']
    .map(d => assembleRotationDay(rotation, d, pools, targets, []))
  check('and at least one of the next four dates serves something different',
    laterDates.some(d => JSON.stringify(d.chosen) !== JSON.stringify(a.chosen)))

  // A pin is a fact about ONE date and must not bend the rest of the week.
  // THE PINNED MEAL IS CHOSEN TO BE ONE THE ROTATION WOULD NOT HAVE SERVED.
  // Pinning whatever today was already going to get passes whether or not the
  // pin is honoured at all — which is exactly what the first version of this
  // check did, and a mutation dropping `pinned` from the call sailed past it.
  const unpinnedToday = assembleRotationDay(rotation, '2026-09-19', pools, targets, [])
  const contrary = pools.dinner.find(o => o.name !== unpinnedToday.chosen.dinner?.name)!
  check('the pin fixture is under pressure: it names a dinner today would not otherwise serve',
    contrary.name !== unpinnedToday.chosen.dinner?.name, { today: unpinnedToday.chosen.dinner?.name, pinning: contrary.name })
  const pinned = assembleRotationDay(rotation, '2026-09-19', pools, targets, [], { dinner: contrary })
  check('a meal pinned for today is honoured', pinned.chosen.dinner?.name === contrary.name, pinned.chosen.dinner?.name)
  const unpinnedAfter = buildRotation(pools, targets, [])
  check('...and pinning it changes no other day of the rotation',
    JSON.stringify(unpinnedAfter.days.map(d => d.chosen)) === JSON.stringify(rotation.days.map(d => d.chosen)))
}

// ===========================================================================
console.log('\n5. One rotation, both surfaces')
// ===========================================================================
{
  const app = read('src/App.tsx')
  const grocery = read('src/lib/grocery-store.ts')
  const refit = read('src/lib/meal-refit.ts')

  // The tab derives its day from the rotation rather than assembling a bare
  // best day. Anchored on the assembled-day declaration, not on the argument
  // list — the previous generation of these checks pinned the literal
  // arguments and went red at the fix.
  const assemblyDecl = (() => {
    const i = app.indexOf('const assembledMeals')
    const j = app.indexOf('const chosenMeals', i)
    return i < 0 ? '' : (j < 0 ? app.slice(i) : app.slice(i, j))
  })()
  check('the Nutrition tab builds its day from the rotation', /assembleRotationDay\(/.test(assemblyDecl), assemblyDecl.slice(0, 160))
  // READ OFF THE CALL'S OWN ARGUMENTS. Testing the whole declaration for the
  // name was satisfied by the memo's dependency array, so replacing the date
  // argument with a literal passed — an "it is mentioned" check standing in
  // for a "it is used" one.
  const rotationCall = (() => {
    const i = assemblyDecl.indexOf('assembleRotationDay(')
    return i < 0 ? '' : assemblyDecl.slice(i, assemblyDecl.indexOf(')', i) + 1)
  })()
  check('...keyed on the app\'s own date, not on a bare clock read or a fixed one',
    /\bmealRotationDate\b/.test(rotationCall) && /getSessionDateContext\([^)]*\)\.date/.test(app), rotationCall)
  check('...and the pinned meals are an argument to it, not overlaid afterwards',
    /\bpinnedMeals\b/.test(rotationCall), rotationCall)
  check('...and the tab no longer assembles a day without a history',
    !/assembleDay\(mealPools/.test(strip(app)))

  // PROPERTY, NOT THE CALL'S TEXT — and this check pinned the text and went
  // red within a day, when buildRotation gained the meal-shape argument. The
  // property is that the list gets its history from a rotation it BUILT, not
  // from one it started itself.
  // RE-ANCHORED 27 Sep 2026, and the property got STRONGER. These pinned the
  // list's private walk (historyFor, rotationIndexFor(startDate)), which went
  // red at the day strip's fix: that walk honoured swaps on today only, so the
  // list now builds every date with the tab's OWN day function instead. What
  // is held is that the list and the tab derive a day the same way, from the
  // date the caller is looking at — test:meal-days §3 compares all seven.
  check('the shopping list builds each day with the tab\'s own day function',
    /buildRotation\(/.test(grocery) && /assembleRotationDay\(rotation, date,/.test(grocery))
  check('...starting at the date the caller is actually looking at',
    /datesFrom\(input\.startDate, days\)/.test(grocery) && /startDate: string/.test(grocery))
  check('...and its caller passes the app\'s date rather than defaulting one',
    /startDate: getSessionDateContext\([^)]*\)\.date/.test(read('src/components/GroceryList.tsx')))

  // The resize offer judges the day the screen is showing. Without this it
  // trials the rotation's day 0 while the tab shows some other day.
  check('the resize trial is handed the same history as the screen',
    /recentNames\?: Partial<Record<MealSlotName, string\[\]>>/.test(refit)
    && /assembleDay\(pools, targets, recentNames,/.test(refit)
    && /assembleDay\(next, targets, recentNames,/.test(refit))
  check('...and the app actually passes it, from the rotation, for today\'s index',
    /recentNames: mealRotation\?\.historyFor\(rotationIndexFor\(mealRotationDate\)\)/.test(app))

  // The rotation must not learn to read the clock itself — that is what makes
  // a browser driver reproducible and a check give the same answer on a
  // Tuesday.
  check('the rotation module never reads the machine clock',
    !/new Date\(\)|Date\.now\(\)/.test(strip(read('src/lib/meal-rotation.ts'))))
}

console.log(failures === 0 ? '\nAll meal-variety checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
