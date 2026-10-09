/**
 * Gate: a resized dish is written in amounts somebody can measure.
 *
 * 9 Oct 2026, the test log's L18: "1.3 tsp", "0.8 tsp", "119g liquid egg
 * whites", "239g raw king prawns". Run against the scaler as it was, the first
 * case below returned exactly those four numbers.
 *
 * WHAT IS HELD: one rounding rule (kitchenRound) — grams and ml to the nearest
 * 5 from 20 up and to the nearest 1 below, spoons to quarters, counts whole —
 * used by EVERY path that resizes a dish (the scaler behind generation, the
 * day search and the refit; the slot move; the library's re-portion), and the
 * macros on the result are the macros of the rounded lines.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  kitchenRound, formatKitchenQuantity, scaleIngredients, scaleToTarget, parseIngredientLine,
  KITCHEN_GRAM_STEP, KITCHEN_FINE_BELOW_G, KITCHEN_SPOON_STEP,
} from '../src/lib/portion-scaler'
import { computeMealMacros, type MealIngredientLine } from '../src/lib/food-db'
import { resizeMealTo } from '../src/lib/meal-move'
import { fitDishToBudget } from '../src/lib/meal-library'
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
import { verifyProposal, computeSlotBudgets } from '../src/lib/meal-generation'
import { TARGET_GRID } from './measure-meal-library'
import type { MealSlotName } from '../src/lib/meal-store'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

/** Is this amount one a person can measure? Written out here in literals, NOT from the scaler's constants, so the check cannot move with the code. */
const measurable = (q: number, unit: string): boolean => {
  const u = unit.toLowerCase()
  if (u === 'g' || u === 'ml') return q < 20 ? Number.isInteger(q) : q % 5 === 0
  if (u === 'tbsp' || u === 'tsp') return q >= 0.25 && Number.isInteger(q * 4)
  return Number.isInteger(q) && q >= 1
}
const odd = (lines: MealIngredientLine[]) => lines.filter(l => !measurable(l.quantity, l.unit)).map(l => `${l.quantity}${l.unit} ${l.name}`)

// ---------------------------------------------------------------------------
console.log('\n1. The test log\'s four numbers')
// ---------------------------------------------------------------------------
{
  const dish: MealIngredientLine[] = [
    { name: 'liquid egg whites', quantity: 150, unit: 'g' },
    { name: 'raw king prawns', quantity: 300, unit: 'g' },
    { name: 'sesame oil', quantity: 1, unit: 'tsp' },
    { name: 'soy sauce', quantity: 1.6, unit: 'tsp' },
    { name: 'egg', quantity: 2, unit: 'whole' },
  ]
  const out = scaleIngredients(dish, 0.795)
  const q = out.map(l => l.quantity)
  check('150g x 0.795 is 120g, not 119g', q[0] === 120, q[0])
  check('300g x 0.795 is 240g, not 239g', q[1] === 240, q[1])
  check('1 tsp x 0.795 is ¾ tsp, not 0.8', q[2] === 0.75, q[2])
  check('1.6 tsp x 0.795 is 1¼ tsp, not 1.3', q[3] === 1.25, q[3])
  check('2 eggs stay 2 eggs', q[4] === 2, q[4])
  check('...and nothing else about a line changed', out.every((l, i) => l.name === dish[i].name && l.unit === dish[i].unit))
}

// ---------------------------------------------------------------------------
console.log('\n2. The rule')
// ---------------------------------------------------------------------------
{
  const g = (v: number) => kitchenRound(v, 'g')
  check('grams from 20 up go to the nearest 5', g(22.4) === 20 && g(22.6) === 25 && g(47) === 45 && g(52) === 50 && g(238.5) === 240 && g(1003) === 1005, [g(22.4), g(22.6), g(47), g(52), g(238.5), g(1003)])
  check('grams below 20 keep whole grams', g(12.3) === 12 && g(7.6) === 8 && g(19.4) === 19, [g(12.3), g(7.6), g(19.4)])
  check('19.6g rounds to 20, on the line between the two', g(19.6) === 20, g(19.6))
  check('ml follow grams', kitchenRound(238.5, 'ml') === 240 && kitchenRound(12.3, 'ml') === 12)
  check('a unit written in capitals or with spaces is still its unit', kitchenRound(238.5, ' G ') === 240 && kitchenRound(1.3, 'TBSP') === 1.25)
  const sp = (v: number) => kitchenRound(v, 'tsp')
  check('spoons go to the nearest quarter', sp(1.3) === 1.25 && sp(0.8) === 0.75 && sp(0.6) === 0.5 && sp(2.1) === 2 && sp(1.9) === 2, [sp(1.3), sp(0.8), sp(0.6), sp(2.1), sp(1.9)])
  check('...and never below a quarter (the smallest spoon)', sp(0.04) === 0.25 && kitchenRound(0.1, 'tbsp') === 0.25, [sp(0.04)])
  check('counted things are whole, and never fewer than one', kitchenRound(1.6, 'whole') === 2 && kitchenRound(0.3, 'medium') === 1 && kitchenRound(2.4, 'slice') === 2)
  check('rounding a rounded amount changes nothing', [120, 240, 15, 7].every(v => g(v) === v) && [0.25, 0.75, 1.25, 2].every(v => sp(v) === v))
  check('the constants are the ones written above', KITCHEN_GRAM_STEP === 5 && KITCHEN_FINE_BELOW_G === 20 && KITCHEN_SPOON_STEP === 0.25)
  check('a scale within 3% leaves the dish exactly as written', (() => {
    const d = [{ name: 'oats', quantity: 83, unit: 'g' }]
    return scaleIngredients(d, 1.02) === d
  })())
}

// ---------------------------------------------------------------------------
console.log('\n3. Every path that resizes a dish gives measurable amounts, and costs what it shows')
// ---------------------------------------------------------------------------
{
  // (a) The library through the real fit and the real verifier, across the measurement's own grid.
  let served = 0, scaledDishes = 0
  const bad: string[] = []
  const miscosted: string[] = []
  for (const x of MEAL_LIBRARY) {
    for (const mealsShape of [true, false]) {
      for (const gr of TARGET_GRID) {
        const budget = computeSlotBudgets(gr.targets, 3, mealsShape)[x.slot as MealSlotName]
        if (!budget) continue
        const opt = verifyProposal(fitDishToBudget(x, budget).dish, x.slot as MealSlotName, budget, [], [])
        if (!opt) continue
        served++
        const asWritten = x.ingredients.map(parseIngredientLine)
        if (opt.ingredients.some((l, i) => l.quantity !== asWritten[i]?.quantity)) scaledDishes++
        const o = odd(opt.ingredients)
        if (o.length) bad.push(`${x.name} @${budget.calories}: ${o.join(', ')}`)
        const m = computeMealMacros(opt.ingredients)
        if (Math.round(m.kcal) !== opt.macros.calories || Math.abs(m.protein - opt.macros.protein) > 0.05) miscosted.push(`${x.name}: card ${opt.macros.calories}/${opt.macros.protein}, lines ${m.kcal}/${m.protein}`)
      }
    }
  }
  check(`the library fit: ${served} served dishes, most of them resized`, served > 1900 && scaledDishes > served * 0.8, { served, scaledDishes })
  check('...every amount in every one of them is measurable', bad.length === 0, { count: bad.length, first: bad.slice(0, 4) })
  check('...and the macros on the card are the macros of the lines shown', miscosted.length === 0, miscosted.slice(0, 3))

  // (b) The scaler, as generation, the day search and the refit call it.
  const dish = ['165g chicken breast', '185g white rice cooked', '90g broccoli', '1 tbsp olive oil', '12g honey', '2 medium egg'].map(parseIngredientLine)
  const before = computeMealMacros(dish)
  let oddScaled = 0, casesScaled = 0
  for (let kcal = Math.round(before.kcal * 0.45); kcal <= before.kcal * 2.4; kcal += 13) {
    const r = scaleToTarget(dish, { kcal: before.kcal, protein: before.protein, carbs: before.carbs, fat: before.fat }, { kcal, protein: 0, carbs: 0, fat: 0 })
    if (r.rejectedReason || r.ingredients === dish) continue
    casesScaled++
    if (odd(r.ingredients).length) oddScaled++
  }
  check(`scaleToTarget across ${casesScaled} sizes of one dish: no odd amount`, casesScaled > 50 && oddScaled === 0, { casesScaled, oddScaled })

  // (c) The slot move, which rewrites the TEXT of each line.
  const meal = { name: 'Chicken and rice', ingredients: ['165g chicken breast', '185g white rice cooked', '1.5 tbsp olive oil', '2 medium egg'], macros: { calories: 800, protein: 60, carbs: 60, fat: 30 } }
  const movedOdd: string[] = []
  let moved = 0
  for (const kcal of [340, 420, 515, 610, 733, 905, 1100, 1490]) {
    const r = resizeMealTo(meal as never, { calories: kcal, protein: 40, carbs: 40, fat: 20 } as never)
    if ('rejected' in r) continue
    moved++
    movedOdd.push(...odd(r.ingredients.map(parseIngredientLine)))
  }
  check(`the slot move across ${moved} sizes: no odd amount`, moved >= 6 && movedOdd.length === 0, movedOdd.slice(0, 5))

  // (d) There is one rounding rule, not three copies of it.
  for (const f of ['src/lib/meal-move.ts', 'src/lib/meal-library.ts', 'src/lib/meal-refit.ts', 'src/lib/meal-generation.ts', 'src/lib/meal-day-move.ts']) {
    const src = code(f)
    check(`${f}: no private rounding of a scaled quantity`, !/Math\.round\(\s*(scaled|q|parsed\[i\]\.quantity|line\.quantity|[a-z.]*quantity)\s*\*/.test(src) && !/Math\.round\(scaled/.test(src))
  }
  check('the slot move and the library fit call the scaler\'s rule', /kitchenRound\(/.test(code('src/lib/meal-move.ts')) && /kitchenRound\(/.test(code('src/lib/meal-library.ts')))
}

// ---------------------------------------------------------------------------
console.log('\n3b. Rounding is never what takes a dish under its protein floor')
// ---------------------------------------------------------------------------
{
  // Last night's dinner re-portioned as lunch (test:leftovers' own case): the
  // budget is the dish's own shape at 1.26x, so the exact resize lands ON the
  // protein floor and the way the chicken rounds decides it. 200g x 1.26 is
  // 252g: to the nearest 5 that is 250g, and 250g of chicken is under the floor.
  const dinner: MealIngredientLine[] = [{ name: 'chicken breast', quantity: 200, unit: 'g' }, { name: 'cooked basmati rice', quantity: 220, unit: 'g' }]
  const dm = computeMealMacros(dinner)
  const budget = { kcal: Math.round(dm.kcal) * 1.26, protein: Math.round(Math.round(dm.protein) * 1.26), carbs: 0, fat: 0 }
  const r = scaleToTarget(dinner, { kcal: dm.kcal, protein: dm.protein, carbs: dm.carbs, fat: dm.fat }, budget)
  const after = computeMealMacros(r.ingredients)
  const plain = scaleIngredients(dinner, r.scaleFactor)
  check('the fixture is on the line: plain rounding alone would miss the floor', computeMealMacros(plain).protein < budget.protein && plain[0].quantity === 250, { plain: plain.map(l => l.quantity), protein: computeMealMacros(plain).protein, floor: budget.protein })
  check('the resized dish reaches its protein floor', after.protein >= budget.protein, { protein: after.protein, floor: budget.protein })
  check('...by rounding the chicken UP one step instead of down (255g), and nothing else', r.ingredients[0].quantity === 255 && r.ingredients[1].quantity === plain[1].quantity, r.ingredients.map(l => l.quantity))
  check('...and every amount is still measurable', odd(r.ingredients).length === 0, odd(r.ingredients))
  // When the exact resize would not reach the floor either, rounding is not the reason: nothing is nudged.
  const far = scaleToTarget(dinner, { kcal: dm.kcal, protein: dm.protein, carbs: dm.carbs, fat: dm.fat }, { ...budget, protein: budget.protein + 20 })
  check('a dish that could not reach the floor anyway is rounded plainly, not pushed', far.ingredients.every((l, i) => l.quantity === plain[i].quantity), far.ingredients.map(l => l.quantity))
  // THE CASE THAT BINDS: a floor the exact resize misses by a whisker, which
  // one step up WOULD clear. Pushing it would be the scaler quietly accepting
  // dishes a plain calorie resize does not reach — not its job.
  const exactProtein = computeMealMacros(dinner.map(l => ({ ...l, quantity: l.quantity * r.scaleFactor }))).protein
  const near = scaleToTarget(dinner, { kcal: dm.kcal, protein: dm.protein, carbs: dm.carbs, fat: dm.fat }, { ...budget, protein: exactProtein + 0.3 })
  check('...even when one step up would have cleared it (the floor is 0.3g past what the exact resize gives)',
    near.ingredients.every((l, i) => l.quantity === plain[i].quantity) && computeMealMacros(dinner.map((l, i) => ({ ...l, quantity: i === 0 ? 255 : plain[1].quantity }))).protein >= exactProtein + 0.3,
    { got: near.ingredients.map(l => l.quantity), exactProtein })
  const noFloor = scaleToTarget(dinner, { kcal: dm.kcal, protein: dm.protein, carbs: dm.carbs, fat: dm.fat }, { ...budget, protein: 0 })
  check('with no protein asked for, plain rounding', noFloor.ingredients.every((l, i) => l.quantity === plain[i].quantity))
}

// ---------------------------------------------------------------------------
console.log('\n4. What she reads')
// ---------------------------------------------------------------------------
{
  const f = formatKitchenQuantity
  check('spoon quarters are ¼ ½ ¾', f(0.25, 'tsp') === '¼' && f(0.5, 'tbsp') === '½' && f(0.75, 'tsp') === '¾', [f(0.25, 'tsp'), f(0.5, 'tbsp'), f(0.75, 'tsp')])
  check('...with the whole number in front when there is one', f(1.25, 'tsp') === '1¼' && f(2.5, 'tbsp') === '2½' && f(3, 'tsp') === '3', [f(1.25, 'tsp'), f(2.5, 'tbsp'), f(3, 'tsp')])
  check('grams are never given a fraction sign', f(120, 'g') === '120' && f(0.5, 'g') === '0.5' && f(2, 'whole') === '2')
  check('a spoon amount that is not on a quarter is shown as it is, not bent to one', f(0.3, 'tsp') === '0.3' && f(1.3, 'tsp') === '1.3', [f(0.3, 'tsp'), f(1.3, 'tsp')])
  // The card: the visible words use the display form; the string handed to the builders stays a number the reader can parse.
  const meal = code('src/components/MealPlan.tsx')
  const dataForm = /function formatIngredient\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(meal)?.[1] ?? ''
  check('the line handed to the edit builders keeps two decimals (1.25, not 1.3)', /\* 100\) \/ 100/.test(dataForm) && !/formatKitchenQuantity/.test(dataForm), dataForm.slice(0, 200))
  check('...and that string reads back as the same amount', parseIngredientLine('1.25 tsp olive oil').quantity === 1.25 && parseIngredientLine('0.75 tbsp soy sauce').quantity === 0.75)
  const rows = meal.match(/<span className="tabular-mono text-xs[^>]*>\{([^}]*)\}<\/span>/g) ?? []
  check('both ingredient spans on the meal card show the display form', rows.length === 2 && rows.every(r => /displayIngredient\(ing\)/.test(r)), rows)
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} kitchen-amount check(s) FAILED.`); process.exit(1) }
console.log('Resized dishes are written in amounts somebody can measure.')
