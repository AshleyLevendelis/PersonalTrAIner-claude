/**
 * test:meal-share — runs 7-10, M60 (20 Oct 2026). No meal is RESIZED far from its share of the day.
 *
 * Sam's day showed an 818 kcal lunch beside a 222 kcal dinner. Traced: the lunch was pinned (a leftover, oversized by
 * the H36 costing bug, fixed on the branch), and the day's repair shrank the largest FREE dish, the dinner, to 0.48x
 * of its share to land the calories. On a day with a pinned meal, a resize now leaves a meal only inside
 * MEAL_SHARE_BAND of its slot budget (main 0.6-1.5x, snack 0.5-2x); one that would leave it is not made, and the day
 * is the honest miss, named. A day with nothing pinned resizes exactly as before (her refit ruling). Held here:
 *   §1 the band itself;
 *   §2 Sam's shape: a pinned big lunch no longer takes the dinner under its band; the day is an honest miss instead;
 *   §3 a pinned meal is never resized, whatever its share;
 *   §4 an ordinary day is untouched (measured: 0 of 5,600 modelled servings outside the band, before and after,
 *      measure:meal-week).
 */
import { assembleDay, computeSlotBudgets, withinMealShare, MEAL_SHARE_BAND, type PoolOption } from '../src/lib/meal-generation'
import { computeMealMacros } from '../src/lib/food-db'
import type { MealSlotName } from '../src/lib/meal-store'

let failures = 0
let ran = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}
const meal = (slot: MealSlotName, name: string, lines: [string, number][]): PoolOption => {
  const ingredients = lines.map(([n, q]) => ({ name: n, quantity: q, unit: 'g' }))
  const m = computeMealMacros(ingredients)
  return { slot, name, ingredients, tags: [], macros: { calories: Math.round(m.kcal), protein: Math.round(m.protein), carbs: Math.round(m.carbs), fat: Math.round(m.fat) } }
}
const kcal = (d: { chosen: Partial<Record<MealSlotName, PoolOption>> }) => Object.fromEntries(Object.entries(d.chosen).map(([k, o]) => [k, o!.macros.calories]))

// Sam: about 1,690 kcal, three meals and a snack.
const targets = { calories: 1689, protein: 162, carbs: 150, fat: 49 }
const budgets = computeSlotBudgets(targets, 3, true)
const pools: Partial<Record<MealSlotName, PoolOption[]>> = {
  breakfast: [meal('breakfast', 'Oats', [['rolled oats', 60], ['greek yoghurt', 200], ['whey protein', 25]])],
  snack: [meal('snack', 'Yoghurt', [['greek yoghurt', 170]])],
  dinner: [meal('dinner', 'Cod and potatoes', [['cod', 180], ['potato boiled', 300], ['olive oil', 8]])],
}
const bigLunch = meal('lunch', 'Bolognese', [['beef mince 5% fat', 240], ['pasta cooked', 330], ['olive oil', 10]])

console.log('\n§1 The band')
{
  check('a main meal at 0.6x and 1.5x of its share is inside; just past either is not',
    withinMealShare('dinner', budgets.dinner!.calories * 0.6, budgets) && withinMealShare('dinner', budgets.dinner!.calories * 1.5, budgets)
    && !withinMealShare('dinner', budgets.dinner!.calories * 0.59, budgets) && !withinMealShare('dinner', budgets.dinner!.calories * 1.51, budgets))
  check('a snack has the wider band', withinMealShare('snack', budgets.snack!.calories * 0.5, budgets) && !withinMealShare('snack', budgets.snack!.calories * 0.49, budgets) && withinMealShare('snack', budgets.snack!.calories * 2, budgets))
  check('the band is the one written down', JSON.stringify(MEAL_SHARE_BAND) === JSON.stringify({ main: [0.6, 1.5], snack: [0.5, 2] }), MEAL_SHARE_BAND)
  check('a slot with no budget is not judged', withinMealShare('lunch', 5000, { dinner: budgets.dinner }))
}

console.log('\n§2 Sam\'s shape: a pinned big lunch')
{
  const others = (['breakfast', 'snack'] as MealSlotName[]).reduce((a, s) => a + pools[s]![0].macros.calories, 0)
  const neededDinner = targets.calories - others - bigLunch.macros.calories
  check('the fixture is the case: landing the day on the dinner alone would take it under its band', neededDinner / budgets.dinner!.calories < MEAL_SHARE_BAND.main[0], { neededDinner, share: neededDinner / budgets.dinner!.calories })
  check('...and inside the scaler\'s own limits, so the old repair would have done it', neededDinner / pools.dinner![0].macros.calories >= 0.4, neededDinner / pools.dinner![0].macros.calories)
  const day = assembleDay({ ...pools, lunch: [bigLunch] }, targets, {}, [], { lunch: bigLunch })
  const served = kcal(day)
  check('no free meal is served outside its band', (['breakfast', 'dinner', 'snack'] as MealSlotName[]).every(s => withinMealShare(s, served[s], budgets)), served)
  check('the dinner is no longer shrunk to pay for the lunch: served at its own size', served.dinner === pools.dinner![0].macros.calories, { dinner: served.dinner, saved: pools.dinner![0].macros.calories })
  check('...and the day is an honest miss, not marked on target', day.withinTolerance === false && day.totals.calories > targets.calories * 1.05, day.totals)
}

console.log('\n§3 A pinned meal is never resized')
{
  const day = assembleDay({ ...pools, lunch: [bigLunch] }, targets, {}, [], { lunch: bigLunch })
  check('her pinned lunch is served exactly as pinned, though it is far over its share', day.chosen.lunch?.macros.calories === bigLunch.macros.calories && !withinMealShare('lunch', bigLunch.macros.calories, budgets), day.chosen.lunch?.macros)
  // Nothing in band can land it: the pinned meal takes almost the whole day. No meal is then shrunk to fit.
  const huge = meal('lunch', 'Huge', [['beef mince 5% fat', 300], ['pasta cooked', 420], ['olive oil', 12]])
  const over = assembleDay({ ...pools, lunch: [huge] }, targets, {}, [], { lunch: huge })
  check('when no resize in band can land the day, every free meal stays its own size (an honest miss)', (['breakfast', 'dinner', 'snack'] as MealSlotName[]).every(s => over.chosen[s]?.macros.calories === pools[s]![0].macros.calories) && !over.withinTolerance, kcal(over))
}

console.log('\n§3b A two-meal day is judged as one')
{
  // Two meals: breakfast 0.45 and dinner 0.55 of the day. Read as a three-meal day, a dinner at its own share would look
  // 1.8x too big and a small resize would be refused.
  const bf = meal('breakfast', 'Big oats', [['rolled oats', 110], ['greek yoghurt', 350], ['whey protein', 35]])
  const dn = meal('dinner', 'Chicken rice', [['chicken breast', 230], ['white rice cooked', 360], ['olive oil', 15]])
  // Targets made from the two dishes with the dinner at 1.12x, so one resize of the dinner lands the day exactly.
  const at = (k: 'calories' | 'protein' | 'carbs' | 'fat') => Math.round(bf.macros[k] + dn.macros[k] * 1.12)
  const t2 = { calories: at('calories'), protein: at('protein'), carbs: at('carbs'), fat: at('fat') }
  const b2 = computeSlotBudgets(t2, 2, false)
  const day = assembleDay({ breakfast: [bf], dinner: [dn] }, t2, {}, [], { breakfast: bf })
  check('the fixture is the case: the dinner needs a small resize, inside its two-meal share', Math.abs(t2.calories - bf.macros.calories - dn.macros.calories) > 0.05 * t2.calories && withinMealShare('dinner', t2.calories - bf.macros.calories, b2), { bf: bf.macros.calories, dn: dn.macros.calories, budget: b2.dinner?.calories })
  check('...and it is made', day.chosen.dinner!.macros.calories !== dn.macros.calories && Math.abs(day.totals.calories - t2.calories) / t2.calories <= 0.05, kcal(day))
}

console.log('\n§4 An ordinary day is untouched')
{
  const lunch = meal('lunch', 'Chicken rice', [['chicken breast', 180], ['white rice cooked', 220], ['olive oil', 8]])
  const plain = assembleDay({ ...pools, lunch: [lunch] }, targets, {}, [], {})
  check('every meal of an ordinary day is inside its band', (Object.entries(plain.chosen) as [MealSlotName, PoolOption][]).every(([s, o]) => withinMealShare(s, o.macros.calories, budgets)), kcal(plain))
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('meal share: all checks passed')
