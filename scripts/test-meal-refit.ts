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
import { checkMealRefit, refitNeeded, isRefitDeclined, declineRefit } from '../src/lib/meal-refit'
import { assembleDay, type PoolOption } from '../src/lib/meal-generation'
import { computeMealMacros } from '../src/lib/food-db'
import { computeTargets } from '../src/lib/nutrition-targets'
import { MIN_SCALE_FACTOR, MAX_SCALE_FACTOR } from '../src/lib/portion-scaler'
import type { MacroTargets, UserProfile } from '../src/lib/types'
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

console.log('\n8b. A meal the split gives no share to is NAMED, not silently left')
{
  // FOUND ON A REAL SCREEN, not from the source. The harness profile had no
  // meals_per_day and no include_snacks, so computeSlotBudgets gave the snack
  // slot no budget — and the card listed three meals while the fourth kept its
  // old size and went on counting towards the day's total. Nothing said so.
  const target = scaleTargets(asBuilt, 1.6)
  const noSnackSplit = checkMealRefit(pools, target, { mealsPerDay: 3, includeSnacks: false })
  const snackResized = noSnackSplit.resized.some(r => r.slot === 'snack')
  check('a slot with no budget is not resized', snackResized === false, noSnackSplit.resized.map(r => r.slot))
  check('...and the card says which one, in plain words',
    !!noSnackSplit.couldNotFix && /snack/i.test(noSnackSplit.couldNotFix), noSnackSplit.couldNotFix)
  check('...naming the meal split as the reason, not a limit of portioning',
    /meal split/i.test(noSnackSplit.couldNotFix ?? ''), noSnackSplit.couldNotFix)
  // The contrast, so the check above cannot pass vacuously on a day where
  // nothing was resizable at all.
  const withSplit = checkMealRefit(pools, target, OPTS)
  check('...while a split that DOES include it resizes it', withSplit.resized.some(r => r.slot === 'snack'),
    withSplit.resized.map(r => r.slot))
}

console.log('\n9. The offer actually reaches a screen, and is gated on the verdict')
{
  // WRITTEN BECAUSE THE ENGINE SHIPPED WITH NO CALLER. The 50 checks above all
  // passed while nothing in the app imported this module at all — a feature
  // that was correct, measured and completely unreachable. These checks are
  // the difference between "it works" and "it is had", and they are source
  // checks for the honest reason: a `test:` gate cannot prove a branch RENDERS.
  // verify:meal-refit is what proves that, on a real screen.
  const app = strip(read('src/App.tsx'))
  const nut = strip(read('src/components/NutritionDisplay.tsx'))

  check('App asks whether the meals have drifted', /checkMealRefit\(/.test(app))
  // The gate, not the call: asking unconditionally would repeat the assembly
  // search on every render to learn what assembledMeals already knows.
  check('...only on a day the assembler already failed',
    /assembledMeals\s*&&\s*!assembledMeals\.withinTolerance/.test(app))
  check('...and only offers what the engine calls needed',
    /mealRefit\?\.needed\s*&&\s*!mealRefitDeclined/.test(app))
  check('...and hands it to the Nutrition tab', /mealRefit=\{mealRefitOffer\}/.test(app))

  check('the Nutrition tab renders the offer', /data-testid="meal-refit-offer"/.test(nut))
  check('...with both a resize and a leave-it action',
    /'Resize them'/.test(nut) && /'Leave them'/.test(nut))
  check('...naming every meal it would change, before and after',
    /mealRefit\.resized\.map\(/.test(nut) && /r\.before\.calories/.test(nut) && /r\.after\.calories/.test(nut))
  // THE HONEST HALF, pinned separately: a card that reports only successes is
  // the exact failure this whole module's describeResidue exists to prevent.
  check('...and showing what it could not fix when there is something',
    /mealRefit\.couldNotFix\s*&&/.test(nut))
  check('the lead comes from the phrasebook, not written here',
    /mealsDrifted\(/.test(nut) && !/Your meals add up to/.test(nut))
}

console.log('\n10. ONE verdict, read by both surfaces — parity by construction')
{
  // The strongest form of the parity promise available: the coach does not
  // recompute anything, so it cannot reach a different answer from the screen.
  // Pinned on the DIRECTION of the data as well as the fact of it — a chat
  // that called checkMealRefit itself would satisfy a bare-name check while
  // being exactly the second opinion this forbids.
  const app = strip(read('src/App.tsx'))
  const chat = strip(read('src/components/ChatAssistant.tsx'))
  check('the coach is handed the same verdict App gives the screen',
    (app.match(/mealRefit=\{mealRefitOffer\}/g) ?? []).length === 2,
    (app.match(/mealRefit=\{mealRefitOffer\}/g) ?? []).length)
  check('...and never computes its own', !/checkMealRefit\(/.test(chat))
  check('...and confirms through the screen\'s write path, not a second one',
    /onMealRefitConfirm\(\)/.test(chat) && !/persistResizedPools\(/.test(chat))
  check('App has exactly one place that writes a resize',
    (app.match(/persistResizedPools\(/g) ?? []).length === 1)

  check('the coach declares the tool', /"propose_meal_refit"/.test(strip(read('supabase/functions/chat-gemini/index.ts'))))
  check('...as a courier that decides nothing', (() => {
    const fn = strip(read('supabase/functions/chat-gemini/index.ts'))
    const i = fn.indexOf('if (name === "propose_meal_refit")')
    if (i < 0) return false
    const body = fn.slice(i, i + 900)
    // No macro arithmetic, no slot names, no portions: the whole point is that
    // the model is told nothing it could get wrong.
    return /kind: "propose_meal_refit"/.test(body) && !/kcal|calories|breakfast/.test(body)
  })())
  check('the client refuses to build a card when a resize would not help',
    /if \(!mealRefit \|\| !mealRefit\.needed/.test(chat))
  check('...and says why instead of going quiet',
    /wrong shape for your numbers/.test(chat) && /already add up to your targets/.test(chat))
}

console.log('\n11. The write re-portions what is stored, and removes nothing')
{
  const gen = strip(read('src/lib/meal-generation.ts'))
  const i = gen.indexOf('export async function persistResizedPools')
  const body = i < 0 ? '' : gen.slice(i, gen.indexOf('\n}', gen.indexOf('return { updated, failed }', i)))
  check('there is a resize writer at all', i >= 0)
  // THE PROPERTY, not the mechanism: "same meals, adjusted amounts" means the
  // write cannot be capable of removing or adding a meal, however it is
  // implemented. persistPools' delete-then-insert is the thing being avoided.
  check('it never deletes', !/\.delete\(/.test(body))
  check('...and never inserts', !/\.insert\(/.test(body))
  check('...it updates', /\.update\(/.test(body))
  // THE UPDATE PAYLOAD ITSELF, sliced out rather than searched for across the
  // whole function. My first version of this check asked whether the word
  // "name" appeared anywhere in the body and failed on the perfectly correct
  // line that MATCHES a stored row by name. The property is about what is
  // written, so the check has to read what is written.
  const update = body.slice(body.indexOf('.update({'), body.indexOf('})', body.indexOf('.update({')))
  check('it can find the update payload (sanity check on this check)', update.length > 20, update.length)
  check('...which moves amounts and their macros', /ingredients:/.test(update) && /macros:/.test(update))
  check('...and nothing else — not the name, not the tags, not the slot',
    !/\bname:/.test(update) && !/\btags:/.test(update) && !/\bslot:/.test(update), update)
}

console.log('\n12. Saying no is remembered against THESE numbers, and no others')
{
  // localStorage does not exist in node; the module is written to survive its
  // absence, so the stub proves the real behaviour rather than papering over it.
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
  }
  const a: MacroTargets = { calories: 2200, protein: 160, carbs: 220, fat: 70 }
  const b: MacroTargets = { calories: 2400, protein: 160, carbs: 220, fat: 70 }
  check('nothing is declined to begin with', isRefitDeclined('p1', a) === false)
  declineRefit('p1', a)
  check('a decline is remembered', isRefitDeclined('p1', a) === true)
  // THE WHOLE DESIGN, and the reason it is not a per-profile flag: "leave my
  // meals alone" was only ever true of the numbers she was looking at.
  check('...and covers only the targets it was given', isRefitDeclined('p1', b) === false)
  check('...and only that profile', isRefitDeclined('p2', a) === false)
  check('no targets means nothing to decline', isRefitDeclined('p1', null) === false)

  // FAILS OPEN, NEVER CLOSED. A storage that throws must let the offer appear
  // again — the opposite mistake would suppress it for ever, invisibly.
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
  }
  check('unreadable storage means ask again, not go silent', isRefitDeclined('p1', a) === false)
  declineRefit('p1', a)
  check('...and an unwritable decline throws nothing at the caller', true)
}

console.log('\n13. Regenerating some meals no longer destroys picks for the others')
{
  // NOT PART OF THE RESIZE, found while reading the path it sits beside, and
  // fixed here because it is the same promise: a meal the app kept on purpose
  // should not quietly stop being hers. The old code kept the prior pool for a
  // slot whose regeneration failed and then cleared EVERY pick anyway.
  const app = strip(read('src/App.tsx'))
  const i = app.indexOf('const handleRegenerateAllMeals')
  const body = app.slice(i, i + 4000)
  check('the regenerate path clears picks per slot', /clearMealPick\(/.test(body))
  check('...and not all of them at once', !/clearAllMealPicksForDate/.test(body))
  // DRIVEN BY THE DERIVED LIST, not merely accompanied by it. Found by
  // mutation: pointing the loop at an empty array left "regeneratedSlots" in
  // the file and every earlier version of this check green, while no pick was
  // cleared at all. The property is which collection the loop walks.
  check('...for exactly the slots that actually got new meals',
    /for \(const slot of regeneratedSlots\) await clearMealPick\(/.test(body))
  check('...and the on-screen picks are dropped from the same list',
    /for \(const slot of regeneratedSlots\) delete next\[slot\]/.test(body))
  check('...where that list is the slots whose pool came back non-empty',
    /regeneratedSlots =[\s\S]{0,220}options\.length > 0/.test(body))
  // The blanket helper is gone rather than left exported — an unreferenced
  // "delete every pick for this day" is a loaded gun for the next reader.
  check('the blanket helper no longer exists anywhere',
    !/clearAllMealPicksForDate/.test(strip(read('src/lib/meal-store.ts'))))
}

console.log(failures === 0 ? '\nAll meal-refit checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
