// ---------------------------------------------------------------------------
// RESIZING A DAY'S MEALS WHEN THE TARGET HAS MOVED AWAY FROM THEM
//
// EVERY BOUNDARY IN THIS FILE WAS MEASURED BEFORE IT WAS ASSERTED, and the
// measurement corrected the brief twice. The original framing was "meals never
// follow a moving calorie target". They partly do: assembleDay is pure, runs on
// every render, re-searches the pool against the CURRENT targets and
// repair-scales its largest unpinned slot. Run against a real four-slot day
// built from real food-db entries, that machinery absorbs a drift from about
// 0.8x to 1.4x of the day's own size without saying a word — which is correct,
// and is the anti-nag half of Ashley's ruling working.
//
// SO THE WEIGH-IN CASE BARELY EXISTS. Measured: a 5kg move of the weight anchor
// at 80kg/moderate is ~78 kcal, 3.5% of a 2,242 kcal target — comfortably
// inside the absorbed band. A GOAL CHANGE is 35.6% (fat loss 2,242 -> muscle
// growth 3,040 on the same body), which is not. That is where this bites, and
// it is also where the app currently reaches for the destructive full
// regenerate. The numbers are printed by this gate rather than trusted.
//
// ASHLEY'S RULINGS, 17 Sep 2026: tell her and offer rather than refit silently;
// and stay quiet until the drift is real, resizing rather than swapping, so the
// shopping list stays valid and saying yes costs nothing.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { checkMealRefit, refitNeeded } from '../src/lib/meal-refit'
import { assembleDay, type PoolOption } from '../src/lib/meal-generation'
import { computeMealMacros } from '../src/lib/food-db'
import { computeTargets } from '../src/lib/nutrition-targets'
import { MIN_SCALE_FACTOR, MAX_SCALE_FACTOR } from '../src/lib/portion-scaler'
import type { MacroTargets, UserProfile } from '../src/lib/types'
import type { MealSlotName } from '../src/lib/meal-store'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

// A REAL DAY, NOT A HAND-WRITTEN ONE. Every ingredient resolves against the
// food database at 100% coverage (checked below), so the macros are the app's
// own arithmetic rather than numbers invented for the fixture. If a food is
// ever renamed out of the DB, §0 fails loudly instead of the rest quietly
// measuring nothing.
const opt = (slot: MealSlotName, name: string, ing: { name: string; quantity: number; unit: string }[]): PoolOption => {
  const c = computeMealMacros(ing)
  return {
    slot, name, ingredients: ing, tags: [],
    macros: { calories: Math.round(c.kcal), protein: Math.round(c.protein), carbs: Math.round(c.carbs), fat: Math.round(c.fat) },
  }
}
const makePools = () => ({
  breakfast: [opt('breakfast', 'Porridge', [{ name: 'oats', quantity: 80, unit: 'g' }, { name: 'milk', quantity: 200, unit: 'ml' }])],
  lunch: [opt('lunch', 'Chicken and rice', [{ name: 'chicken breast', quantity: 150, unit: 'g' }, { name: 'white rice', quantity: 120, unit: 'g' }])],
  dinner: [opt('dinner', 'Salmon and potatoes', [{ name: 'salmon', quantity: 150, unit: 'g' }, { name: 'potato', quantity: 200, unit: 'g' }])],
  snack: [opt('snack', 'Yoghurt and banana', [{ name: 'greek yoghurt', quantity: 170, unit: 'g' }, { name: 'banana', quantity: 120, unit: 'g' }])],
})
const OPTS = { mealsPerDay: 3, includeSnacks: true }
const scaleTargets = (t: MacroTargets, k: number): MacroTargets => ({
  calories: Math.round(t.calories * k), protein: Math.round(t.protein * k),
  carbs: Math.round(t.carbs * k), fat: Math.round(t.fat * k),
})

console.log('\n0. The fixture is real food, resolved by the app itself')
const pools = makePools()
{
  for (const [slot, list] of Object.entries(pools)) {
    const c = computeMealMacros(list[0].ingredients)
    check(`${slot} resolves fully against the food database`, c.coverage === 1 && c.unmatched.length === 0,
      { slot, coverage: c.coverage, unmatched: c.unmatched })
  }
}

// The day's own size, taken from the assembler with targets it cannot miss, so
// the drift multipliers below are relative to something measured.
const asBuilt = assembleDay(pools, { calories: 99999, protein: 9999, carbs: 9999, fat: 9999 }, {}, [], {}).totals
console.log(`  (the day as built: ${asBuilt.calories} kcal, ${asBuilt.protein}g protein)`)

console.log('\n1. A day that already fits is left alone — the anti-nag half')
{
  const r = checkMealRefit(pools, { ...asBuilt }, OPTS)
  check('no offer when the target matches the meals', r.needed === false, r)
  check('...and nothing is reported as unfixable, because nothing is broken',
    r.couldNotFix === null, r.couldNotFix)
  check('...and the pools come back untouched', r.pools === pools || r.resized.length === 0, r.resized)

  // THE MEASURED ANTI-NAG BAND. A single weight-anchor step is ~3.5% (§5), and
  // these are the drifts either side of it. If a future change made the
  // assembler stop absorbing them, this fails and the app would start nagging.
  for (const k of [0.95, 1.05, 1.15, 1.25]) {
    const r2 = checkMealRefit(pools, scaleTargets(asBuilt, k), OPTS)
    check(`a ${Math.round((k - 1) * 100)}% drift is absorbed silently, with no offer`,
      r2.needed === false, { k, needed: r2.needed, before: r2.before })
  }
}

console.log('\n2. A real drift IS offered, and the resize actually closes it')
{
  // 1.6x and 0.6x sit outside the absorbed band — measured, not chosen for
  // roundness. Both directions, because shrinking hits a different rail
  // (MIN_SCALE_FACTOR) from growing (MAX_SCALE_FACTOR).
  for (const k of [1.6, 0.6]) {
    const target = scaleTargets(asBuilt, k)
    const r = checkMealRefit(pools, target, OPTS)
    check(`a ${Math.round((k - 1) * 100)}% drift is offered`, r.needed === true, { k, r: r.needed })
    check(`...because the day does not fit as it stands`, r.before.withinTolerance === false, r.before)
    check(`...and after resizing it does`, r.after.withinTolerance === true, r.after)
    // THE NUMBERS, PRINTED. Verification asked for this rather than a tick.
    console.log(`     x${k}: target ${target.calories} kcal — day ${r.before.totals.calories} -> ${r.after.totals.calories}`)
    check(`...landing closer to the target than before`,
      Math.abs(r.after.totals.calories - target.calories) < Math.abs(r.before.totals.calories - target.calories),
      { target: target.calories, before: r.before.totals.calories, after: r.after.totals.calories })
  }
}

console.log('\n3. It resizes the meals — it does not swap them')
{
  // THE WHOLE POINT OF ASHLEY'S SECOND RULING. Swapping would invalidate a
  // shopping list; resizing cannot, because the foods are the same words.
  const r = checkMealRefit(pools, scaleTargets(asBuilt, 1.6), OPTS)
  const namesBefore = Object.values(pools).map(p => p[0].name).sort()
  const namesAfter = Object.values(r.pools).map(p => p![0].name).sort()
  check('every meal keeps its name', JSON.stringify(namesBefore) === JSON.stringify(namesAfter), { namesBefore, namesAfter })

  const foodsOf = (p: typeof pools) => Object.values(p).flatMap(l => l![0].ingredients.map(i => i.name)).sort()
  check('...and every ingredient is the same food',
    JSON.stringify(foodsOf(pools)) === JSON.stringify(foodsOf(r.pools as typeof pools)),
    { before: foodsOf(pools), after: foodsOf(r.pools as typeof pools) })
  // ...and the quantities DID move, or this "resize" resized nothing.
  const qtyOf = (p: typeof pools) => Object.values(p).flatMap(l => l![0].ingredients.map(i => i.quantity))
  check('...while the amounts genuinely changed',
    JSON.stringify(qtyOf(pools)) !== JSON.stringify(qtyOf(r.pools as typeof pools)),
    { before: qtyOf(pools), after: qtyOf(r.pools as typeof pools) })
}

console.log('\n4. Pinned meals are facts, and the honest residue says so')
{
  const pinned = { dinner: pools.dinner[0] }
  const r = checkMealRefit(pools, scaleTargets(asBuilt, 1.25), { ...OPTS, pinned })
  check('a pin makes a drift bite sooner than it otherwise would', r.needed === true, r.needed)
  check('...and the pinned meal is reported as untouched',
    r.pinnedUntouched.includes('dinner'), r.pinnedUntouched)
  const dinnerBefore = pools.dinner[0].ingredients.map(i => i.quantity)
  const dinnerAfter = r.pools.dinner![0].ingredients.map(i => i.quantity)
  check('...and really is untouched, not merely labelled so',
    JSON.stringify(dinnerBefore) === JSON.stringify(dinnerAfter), { dinnerBefore, dinnerAfter })
  check('...while the unpinned slots did move', r.resized.length > 0, r.resized.map(x => x.slot))
}

console.log('\n5. What it cannot fix, it says — rather than claiming success')
{
  // 2x is past what portions alone can reach for this day. The card must not
  // pretend otherwise; this is the same honesty every edit path already owes.
  const r = checkMealRefit(pools, scaleTargets(asBuilt, 2.0), OPTS)
  // NOT OFFERED, and that is the corrected behaviour. A resize that cannot
  // land the day inside tolerance is not a fix, and putting a Confirm button
  // on it would be selling one.
  check('a drift portions cannot fix is NOT offered as a resize', r.needed === false, r.needed)
  check('...the day is admitted not to fit afterwards', r.after.withinTolerance === false, r.after)
  check('...and a sentence says so', typeof r.couldNotFix === 'string' && r.couldNotFix.length > 0, r.couldNotFix)
  check('...in plain words, naming no function or constant',
    !!r.couldNotFix && !/scaleFactor|tolerance|assembleDay|MIN_SCALE|MAX_SCALE/.test(r.couldNotFix), r.couldNotFix)

  const empty = checkMealRefit({}, { ...asBuilt }, OPTS)
  check('a day with no meals is not offered a resize', empty.needed === false, empty)
  check('...and says why rather than staying silent', !!empty.couldNotFix, empty.couldNotFix)
}

console.log('\n6. The trigger is the assembler\'s verdict, not a number written here')
{
  // Anchored on the property, because a threshold written into meal-refit.ts
  // would silently disagree with DAY_CALORIE_TOLERANCE the first time that
  // moved, and nothing would notice. Proven by construction: the module must
  // call assembleDay and must not carry a tolerance of its own.
  const src = readFileSync(join(ROOT, 'src/lib/meal-refit.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check('it asks the assembler', /assembleDay\(/.test(src))
  check('...and reads its verdict rather than re-deriving one', /withinTolerance/.test(src))
  check('...and declares no calorie threshold of its own',
    !/TOLERANCE\s*=|0\.0[0-9]\s*\*/.test(src), src.match(/TOLERANCE\s*=.*/g))
  check('...and reuses the shared scaler rather than multiplying quantities itself',
    /scaleToTarget\(/.test(src) && !/quantity\s*\*/.test(src))
  // A RESIZE MUST RE-READ THE FOOD DB. scaleIngredients rounds per unit, so
  // the achieved size is not the requested factor; multiplying the old macros
  // would print a number the food never delivers.
  check('...and recomputes macros from the resized amounts, never by multiplying',
    /computeMealMacros\(/.test(src))
}

console.log('\n7. The numbers that set this feature\'s scope, re-measured every run')
{
  // THE BRIEF WAS WRONG TWICE AND THESE ARE THE FACTS THAT CORRECTED IT. Kept
  // as live checks rather than a comment, so if the calculation ever changes
  // the conclusion is re-derived instead of inherited.
  const body: Partial<UserProfile> = {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80,
    activity_level: 'moderate', macro_calculation_mode: 'STANDARD_STATIC',
  }
  const fl = computeTargets({ ...body, fitness_goal: 'fat_loss' } as UserProfile)!
  const hy = computeTargets({ ...body, fitness_goal: 'hypertrophy' } as UserProfile)!
  const goalPct = (hy.calories / fl.calories - 1) * 100
  console.log(`     fat loss ${fl.calories} kcal -> muscle growth ${hy.calories} kcal = ${goalPct.toFixed(1)}%`)
  check('a goal change moves the target far enough to need a resize', goalPct > 25, goalPct)

  // A 5kg anchor move: 10 kcal/kg of BMR through the activity multiplier.
  const weighInPct = (10 * 1.55 * 5) / fl.calories * 100
  console.log(`     a 5kg weight drift = ~${Math.round(10 * 1.55 * 5)} kcal = ${weighInPct.toFixed(1)}%`)
  check('...while a weigh-in drift is small enough to be absorbed silently', weighInPct < 10, weighInPct)
  check('...and the assembler really does absorb one of that size',
    checkMealRefit(pools, scaleTargets(asBuilt, 1 + weighInPct / 100), OPTS).needed === false, weighInPct)

  check('the scale rails are the shared ones, not local copies',
    MIN_SCALE_FACTOR === 0.4 && MAX_SCALE_FACTOR === 2.5, { MIN_SCALE_FACTOR, MAX_SCALE_FACTOR })
}

console.log('\n7b. A GOAL change is the wrong shape, not the wrong size — and is refused')
{
  // THE MEASUREMENT THAT DECIDED WHERE THIS FEATURE BELONGS. A goal change
  // moves calories x1.36 while protein stays x1.00, so a proportional resize
  // that reaches the calorie target drags protein FURTHER outside its band
  // than it started. The goal change regenerates for exactly this reason; a
  // resize offered here would be offering harm with a Confirm on it.
  const body: Partial<UserProfile> = {
    age: 30, gender: 'male', height_cm: 178, weight_kg: 80,
    activity_level: 'moderate', macro_calculation_mode: 'STANDARD_STATIC',
  }
  const fl = computeTargets({ ...body, fitness_goal: 'fat_loss' } as UserProfile)!
  const hy = computeTargets({ ...body, fitness_goal: 'hypertrophy' } as UserProfile)!
  check('the goal change moves calories and protein by DIFFERENT factors',
    Math.abs((hy.calories / fl.calories) - (hy.protein / fl.protein)) > 0.2,
    { cal: +(hy.calories / fl.calories).toFixed(2), protein: +(hy.protein / fl.protein).toFixed(2) })

  // A day built to fit fat loss, then asked to fit muscle growth.
  const bigger = {
    breakfast: [opt('breakfast', 'Porridge', [{ name: 'oats', quantity: 120, unit: 'g' }, { name: 'milk', quantity: 300, unit: 'ml' }])],
    lunch: [opt('lunch', 'Chicken and rice', [{ name: 'chicken breast', quantity: 200, unit: 'g' }, { name: 'white rice', quantity: 200, unit: 'g' }])],
    dinner: [opt('dinner', 'Salmon and potatoes', [{ name: 'salmon', quantity: 180, unit: 'g' }, { name: 'potato', quantity: 300, unit: 'g' }])],
    snack: [opt('snack', 'Yoghurt and banana', [{ name: 'greek yoghurt', quantity: 200, unit: 'g' }, { name: 'banana', quantity: 150, unit: 'g' }])],
  }
  check('that day fits the fat-loss target it was built for',
    checkMealRefit(bigger, fl, OPTS).before.withinTolerance === true)
  const g = checkMealRefit(bigger, hy, OPTS)
  check('...does not fit the muscle-growth one', g.before.withinTolerance === false, g.before)
  check('...and no resize is offered, because portions cannot change a shape',
    g.needed === false, { needed: g.needed, after: g.after })
  console.log(`     resizing to hit ${hy.calories} kcal would put protein at ${Math.round(g.after.totals.protein)}g against a ${hy.protein}g target`)
  check('...which is exactly why: the resize would overshoot protein',
    g.after.totals.protein > hy.protein * 1.15, { after: g.after.totals.protein, target: hy.protein })
  check('...and the reason given names shape rather than size',
    !!g.couldNotFix && /shape/i.test(g.couldNotFix), g.couldNotFix)
}

console.log('\n8. The thin wrapper both surfaces call agrees with the full check')
{
  const profile = { meals_per_day: 3, include_snacks: true } as Pick<UserProfile, 'meals_per_day' | 'include_snacks'>
  check('no targets means no offer', refitNeeded(pools, null, profile) === false)
  check('a fitting day means no offer', refitNeeded(pools, { ...asBuilt }, profile) === false)
  check('a drifted day means an offer', refitNeeded(pools, scaleTargets(asBuilt, 1.6), profile) === true)
}

console.log(failures === 0 ? '\nAll meal-refit checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
