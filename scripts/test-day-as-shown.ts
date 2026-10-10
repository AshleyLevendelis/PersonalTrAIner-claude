// ---------------------------------------------------------------------------
// test:day-as-shown — TODAY'S MEALS, ONE CALCULATION (runs 3-4, H24 and M33,
// 10 Oct 2026, with Ashley's ruling A and its two conditions).
//
// The header said 1692 kcal over four meals that added up to 1,801; after a
// coach-logged meal it said 1,690 over 1,498. Now each slot is what was eaten
// if logged, else the plan's dish; the header is their sum. And the un-eaten
// meals fit around what was eaten, the same dishes within about 25% either
// way, said in one line with an Undo; beyond 25% the meals are left alone and
// the line says how far over or under the day is.
//
// The fixture is real food costed by the app itself (the pattern
// test:meal-refit uses), so a resized dish's numbers are the food table's.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import { computeMealMacros } from '../src/lib/food-db'
import { dayAsShown, AROUND_EATEN_MIN, AROUND_EATEN_MAX } from '../src/lib/day-as-shown'
import { aroundEatenLine, kcalLeftOrOver } from '../src/lib/coach-voice'
import { dayVerdict, type PoolOption } from '../src/lib/meal-generation'
import type { MealSlotName } from '../src/lib/meal-store'
import type { MacroTargets } from '../src/lib/types'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`) }
}
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const opt = (slot: MealSlotName, name: string, ing: { name: string; quantity: number; unit: string }[]): PoolOption => {
  const c = computeMealMacros(ing)
  return { slot, name, ingredients: ing, tags: [], macros: { calories: Math.round(c.kcal), protein: Math.round(c.protein), carbs: Math.round(c.carbs), fat: Math.round(c.fat) } }
}
const chosen: Partial<Record<MealSlotName, PoolOption>> = {
  breakfast: opt('breakfast', 'Porridge', [{ name: 'oats', quantity: 80, unit: 'g' }, { name: 'milk', quantity: 200, unit: 'ml' }]),
  lunch: opt('lunch', 'Chicken and rice', [{ name: 'chicken breast', quantity: 150, unit: 'g' }, { name: 'white rice', quantity: 120, unit: 'g' }]),
  dinner: opt('dinner', 'Salmon and potatoes', [{ name: 'salmon', quantity: 150, unit: 'g' }, { name: 'potato', quantity: 200, unit: 'g' }]),
  snack: opt('snack', 'Yoghurt and banana', [{ name: 'greek yoghurt', quantity: 170, unit: 'g' }, { name: 'banana', quantity: 120, unit: 'g' }]),
}
const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
const plan = SLOTS.reduce((a, s) => ({ calories: a.calories + chosen[s]!.macros.calories, protein: a.protein + chosen[s]!.macros.protein, carbs: a.carbs + chosen[s]!.macros.carbs, fat: a.fat + chosen[s]!.macros.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 } as MacroTargets)
// Targets the plan meets exactly, so any move comes from what was eaten.
const targets: MacroTargets = { ...plan }
const sumRows = (d: ReturnType<typeof dayAsShown>) => d.slots.reduce((s, r) => s + r.macros.calories, 0)

console.log('\n0. The fixture is real food')
for (const s of SLOTS) check(`${s} is fully costed by the app`, computeMealMacros(chosen[s]!.ingredients).coverage === 1)

console.log('\n1. The header is the sum of the rows, always')
{
  const none = dayAsShown({ slots: SLOTS, chosen, eatenBySlot: {}, targets })
  check('nothing logged: header = the four planned meals', none.totals.calories === plan.calories && sumRows(none) === plan.calories, { totals: none.totals, plan })
  check('...and nothing is said', none.aroundEaten.kind === 'none' && aroundEatenLine(none.aroundEaten) === null)
  // The coach-logged case: lunch eaten as something smaller than planned.
  const lighterLunch = { kcal: chosen.lunch!.macros.calories - 40, protein: 30, carbs: 50, fat: 8 }
  const small = dayAsShown({ slots: SLOTS, chosen, eatenBySlot: { lunch: lighterLunch }, targets })
  check('a logged meal counts as eaten in the header, not as planned', small.slots.find(r => r.slot === 'lunch')!.macros.calories === lighterLunch.kcal)
  check('...and the header equals the rows', small.totals.calories === sumRows(small), { totals: small.totals.calories, rows: sumRows(small) })
  // A slot not on screen is in neither.
  const three = dayAsShown({ slots: ['breakfast', 'lunch', 'dinner'], chosen, eatenBySlot: {}, targets })
  check('a meal that is not on screen is not in the header', three.totals.calories === plan.calories - chosen.snack!.macros.calories)
}

console.log('\n2. Her ruling A: the rest of the day fits around what was eaten')
{
  // Lunch came to 200 kcal more than planned: the other three shrink. (300
  // would need a 27% cut on this small day, past her 25%: section 3's case.)
  const bigLunch = { kcal: chosen.lunch!.macros.calories + 200, protein: chosen.lunch!.macros.protein, carbs: chosen.lunch!.macros.carbs + 60, fat: chosen.lunch!.macros.fat + 6 }
  const d = dayAsShown({ slots: SLOTS, chosen, eatenBySlot: { lunch: bigLunch }, targets })
  const a = d.aroundEaten
  check('the un-eaten meals are re-sized', a.kind === 'resized' && a.slots.length === 3 && !a.slots.includes('lunch'), a)
  check('...by one factor inside 25% either way', a.kind === 'resized' && a.factor >= AROUND_EATEN_MIN && a.factor <= AROUND_EATEN_MAX && a.factor < 1, a)
  check('...the SAME dishes, re-sized, never swapped',
    d.slots.every(r => r.option?.name === chosen[r.slot]!.name) && d.slots.filter(r => r.resizedBy != null).every(r => r.option!.ingredients.length === chosen[r.slot]!.ingredients.length))
  check('...costed again from their scaled ingredients (no invented number)',
    d.slots.filter(r => r.resizedBy != null).every(r => Math.abs(computeMealMacros(r.option!.ingredients).kcal - r.option!.macros.calories) <= 1))
  check('...the eaten meal stays exactly as eaten', d.slots.find(r => r.slot === 'lunch')!.macros.calories === bigLunch.kcal)
  check('...so the day lands back on the target', Math.abs(d.totals.calories - targets.calories) <= targets.calories * 0.05, { totals: d.totals.calories, target: targets.calories })
  check('...and the header still equals the rows', d.totals.calories === sumRows(d))
  const line = aroundEatenLine(a) ?? ''
  check('one line says so, naming the meal, the amount and the change',
    /^Lunch came to 200 kcal more than planned, so breakfast, dinner and snack are \d+% smaller today\.$/.test(line), line)
  // Undo: the plan's portions, and the day said as it is.
  const kept = dayAsShown({ slots: SLOTS, chosen, eatenBySlot: { lunch: bigLunch }, targets, keepAsPlanned: true })
  check('Undo puts the planned portions back', kept.aroundEaten.kind === 'kept' && kept.slots.every(r => r.resizedBy == null) && kept.totals.calories === plan.calories + 200)
  check('...and says how far over the day is', aroundEatenLine(kept.aroundEaten) === 'Your meals are as planned. Today is 200 kcal over your target.', aroundEatenLine(kept.aroundEaten))
  // Less eaten: the rest grows.
  const smallBreakfast = { kcal: chosen.breakfast!.macros.calories - 150, protein: 10, carbs: 40, fat: 4 }
  const up = dayAsShown({ slots: SLOTS, chosen, eatenBySlot: { breakfast: smallBreakfast }, targets })
  check('eating less makes the rest a little bigger', up.aroundEaten.kind === 'resized' && up.aroundEaten.factor > 1, up.aroundEaten)
}

console.log('\n3. Beyond about 25%: the meals are left alone and the gap is said')
{
  const huge = { kcal: chosen.lunch!.macros.calories + 900, protein: 60, carbs: 200, fat: 40 }
  const d = dayAsShown({ slots: SLOTS, chosen, eatenBySlot: { lunch: huge }, targets })
  check('no meal is re-sized', d.aroundEaten.kind === 'too_far' && d.slots.every(r => r.resizedBy == null), d.aroundEaten)
  check('...the header is the plain sum', d.totals.calories === plan.calories + 900)
  check('...and the line says how far over, plainly',
    aroundEatenLine(d.aroundEaten) === 'Today is 900 kcal over your target: too far to fix by changing portions, so your meals are as planned.', aroundEatenLine(d.aroundEaten))
  // The boundary is hers: just inside 25% resizes, just outside does not.
  const open = plan.calories - chosen.lunch!.macros.calories
  const inside = { kcal: chosen.lunch!.macros.calories + Math.floor(open * 0.24), protein: 40, carbs: 80, fat: 10 }
  const outside = { kcal: chosen.lunch!.macros.calories + Math.ceil(open * 0.26), protein: 40, carbs: 80, fat: 10 }
  check('24% resizes', dayAsShown({ slots: SLOTS, chosen, eatenBySlot: { lunch: inside }, targets }).aroundEaten.kind === 'resized')
  check('26% does not', dayAsShown({ slots: SLOTS, chosen, eatenBySlot: { lunch: outside }, targets }).aroundEaten.kind === 'too_far')
}

// AND THE OTHER WAY: a meal eaten much smaller than planned may grow the rest
// by up to 25%, never more (caught missing by mutation: only shrinking was held).
{
  const open = plan.calories - chosen.breakfast!.macros.calories
  const grow = (pct: number) => dayAsShown({ slots: SLOTS, chosen, eatenBySlot: { breakfast: { kcal: chosen.breakfast!.macros.calories - Math.round(open * pct), protein: 5, carbs: 20, fat: 2 } }, targets }).aroundEaten.kind
  check('the rest may grow by 24%', grow(0.24) === 'resized')
  check('...but not by 26%', grow(0.26) === 'too_far')
}
// A DISH THE APP CANNOT FULLY COST IS NEVER RE-SIZED, and then neither is the
// rest: a half-resized day would describe a fit it did not make.
{
  const mystery: PoolOption = { ...chosen.dinner!, name: 'House stew', ingredients: [...chosen.dinner!.ingredients, { name: 'zzqqx paste', quantity: 40, unit: 'g' }] }
  const bigLunch = { kcal: chosen.lunch!.macros.calories + 200, protein: 40, carbs: 90, fat: 12 }
  const d = dayAsShown({ slots: SLOTS, chosen: { ...chosen, dinner: mystery }, eatenBySlot: { lunch: bigLunch }, targets })
  check('an un-costable dish stops the re-size, and the gap is said instead', d.aroundEaten.kind === 'too_far' && d.slots.every(r => r.resizedBy == null), d.aroundEaten)
}

console.log('\n4. Quiet when the day is already right')
{
  const close = { kcal: chosen.lunch!.macros.calories + 20, protein: chosen.lunch!.macros.protein, carbs: chosen.lunch!.macros.carbs, fat: chosen.lunch!.macros.fat }
  const d = dayAsShown({ slots: SLOTS, chosen, eatenBySlot: { lunch: close }, targets })
  check('a day inside the app\'s own bands is left as planned, and nothing is said',
    dayVerdict(d.totals, targets).onTarget && d.aroundEaten.kind === 'none' && d.slots.every(r => r.resizedBy == null))
  const allEaten = dayAsShown({ slots: SLOTS, chosen, eatenBySlot: Object.fromEntries(SLOTS.map(s => [s, { kcal: 900, protein: 40, carbs: 90, fat: 30 }])), targets })
  check('nothing left to eat: nothing to re-size', allEaten.aroundEaten.kind === 'none')
}

console.log('\n5. Over is said as over (M33)')
check('112 over, never "0 left"', kcalLeftOrOver(-112) === '112 over' && kcalLeftOrOver(-0.4) === '0 left' && kcalLeftOrOver(250) === '250 left')

console.log('\n6. The screen asks this calculation')
{
  const mp = stripComments(readFileSync(join(ROOT, 'src/components/MealPlan.tsx'), 'utf8'))
  const nd = stripComments(readFileSync(join(ROOT, 'src/components/NutritionDisplay.tsx'), 'utf8'))
  check('the header is fed the shown totals', /<TotalsHero totals=\{shown\.totals\}/.test(mp) && !/<TotalsHero totals=\{totals\}/.test(mp))
  check('every row is fed the shown dish', /option=\{shownOption\(slot\)\}/.test(mp) && !/option=\{chosen\[slot\] \?\? null\}/.test(mp))
  check('...from the slots on screen, with what was eaten', /slots: SLOT_ORDER\.filter\(s => \(pools\[s\]\?\.length \?\? 0\) > 0\)/.test(mp) && /eatenBySlot: Object\.fromEntries\(Object\.entries\(loggedBySlot\)/.test(mp))
  check('the line and its Undo are drawn', /\{aroundLine\}/.test(mp) && /data-testid="around-eaten-undo" onClick=\{\(\) => setKept\(true\)\}/.test(mp))
  check('the ring says "over" past the target', /\{kcalLeftOrOver\(macros\.calories - eaten\.kcal\)\}/.test(nd) && !/Math\.max\(0, Math\.round\(macros\.calories - eaten\.kcal\)\)/.test(nd))
  check('no line promises a re-fit nothing checks', !/re-fitted around it/.test(mp))
}

console.log(`\nday-as-shown: ${ran} checks ran`)
console.log(failures === 0 ? 'All day-as-shown checks passed.\n' : `${failures} day-as-shown check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
