// ---------------------------------------------------------------------------
// test:hold-around-pins — A SWAP KEEPS THE DAY'S OTHER DISHES (runs 3-4, M34).
//
// Swapping lunch changed the snack to a different recipe. Ashley, 10 Oct 2026,
// from three options: "Resize, else leave" — the other meals keep their
// dishes, re-sized together by about 25% either way, one line with an Undo;
// beyond that, left as planned and the gap said. Scope, the same day: "Plan's
// own dishes only" — a meal she asked for by name, built from the fridge or
// edited still re-plans the day (her 1 Sep "plan the rest of my meals").
//
// Real food costed by the app's own table, so every re-sized number is the
// table's (the pattern test:day-as-shown and test:meal-refit use).
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join } from 'path'
import { computeMealMacros } from '../src/lib/food-db'
import { holdAroundPins } from '../src/lib/hold-around-pins'
import { dayAsShown, AROUND_EATEN_MIN, AROUND_EATEN_MAX } from '../src/lib/day-as-shown'
import { heldAroundLine } from '../src/lib/coach-voice'
import { dayVerdict, computeSlotBudgets, type AssembledDay, type PoolOption } from '../src/lib/meal-generation'
import { buildRotation, assembleRotationDay, serveDates, rotationIndexFor, ROTATION_DAYS } from '../src/lib/meal-rotation'
import { mulberry32, makeDish } from './meal-fixture'
import type { MealSlotName } from '../src/lib/meal-store'
import type { MacroTargets } from '../src/lib/types'

const ROOT = join(import.meta.dirname, '..')
let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`) }
}
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const opt = (slot: MealSlotName, name: string, ing: { name: string; quantity: number; unit: string }[], tags: string[] = []): PoolOption => {
  const c = computeMealMacros(ing)
  return { slot, name, ingredients: ing, tags, macros: { calories: Math.round(c.kcal), protein: Math.round(c.protein), carbs: Math.round(c.carbs), fat: Math.round(c.fat) } }
}
const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
const sum = (c: Partial<Record<MealSlotName, PoolOption>>): MacroTargets => (Object.values(c) as PoolOption[]).reduce(
  (a, o) => ({ calories: a.calories + o.macros.calories, protein: a.protein + o.macros.protein, carbs: a.carbs + o.macros.carbs, fat: a.fat + o.macros.fat }),
  { calories: 0, protein: 0, carbs: 0, fat: 0 })

const porridge = opt('breakfast', 'Porridge', [{ name: 'oats', quantity: 80, unit: 'g' }, { name: 'milk', quantity: 200, unit: 'ml' }])
const chickenRice = opt('lunch', 'Chicken and rice', [{ name: 'chicken breast', quantity: 150, unit: 'g' }, { name: 'white rice', quantity: 120, unit: 'g' }])
const salmon = opt('dinner', 'Salmon and potatoes', [{ name: 'salmon', quantity: 150, unit: 'g' }, { name: 'potato', quantity: 200, unit: 'g' }])
const yoghurt = opt('snack', 'Yoghurt and banana', [{ name: 'greek yoghurt', quantity: 170, unit: 'g' }, { name: 'banana', quantity: 120, unit: 'g' }])
const planChosen = { breakfast: porridge, lunch: chickenRice, dinner: salmon, snack: yoghurt }
const targets: MacroTargets = sum(planChosen)
const planned: AssembledDay = {
  chosen: planChosen, totals: targets, withinTolerance: true, missingSlots: [],
  alternatives: { breakfast: [porridge], lunch: [chickenRice], dinner: [salmon], snack: [yoghurt] },
}
// The swapped-in lunches, one a little bigger and one much bigger than planned.
const tunaPasta = opt('lunch', 'Tuna pasta', [{ name: 'tuna', quantity: 140, unit: 'g' }, { name: 'pasta', quantity: 260, unit: 'g' }])
const hugeLunch = opt('lunch', 'Big burrito bowl', [{ name: 'chicken breast', quantity: 300, unit: 'g' }, { name: 'white rice', quantity: 450, unit: 'g' }, { name: 'olive oil', quantity: 30, unit: 'g' }])

console.log('\n0. The fixture is real food, and the swaps are what they say')
for (const o of [porridge, chickenRice, salmon, yoghurt, tunaPasta, hugeLunch]) check(`${o.name} is fully costed by the app`, computeMealMacros(o.ingredients).coverage === 1)
check('the plan meets its targets exactly, so any move comes from the swap', dayVerdict(sum(planChosen), targets).onTarget)
check('the big swap would need more than 25% off the others (sanity check on section 3)',
  (targets.calories - hugeLunch.macros.calories) / (targets.calories - chickenRice.macros.calories) < AROUND_EATEN_MIN, hugeLunch.macros.calories)

console.log('\n1. The other meals keep their dishes')
const swap = holdAroundPins({ planned, fixed: { lunch: tunaPasta }, targets })
{
  check('a swap is held (not handed back to the search)', !!swap)
  const names = swap ? SLOTS.map(s => swap.chosen[s]?.name) : []
  check('breakfast, dinner and snack are the same dishes as before; lunch is the swap',
    names.join('|') === ['Porridge', 'Tuna pasta', 'Salmon and potatoes', 'Yoghurt and banana'].join('|'), names)
  check('the swapped lunch is served exactly as chosen, not re-sized', swap?.chosen.lunch === tunaPasta)
}

console.log('\n2. Re-sized together, within about 25%, and the day lands')
{
  const h = swap?.heldAround
  check('it says it re-sized', h?.kind === 'resized', h)
  const f = h?.kind === 'resized' ? h.factor : NaN
  check(`by ONE factor inside ${AROUND_EATEN_MIN}-${AROUND_EATEN_MAX}`, f >= AROUND_EATEN_MIN && f <= AROUND_EATEN_MAX, f)
  check('every held dish carries that factor', ['breakfast', 'dinner', 'snack'].every(s => swap?.chosen[s as MealSlotName]?.heldBy === f))
  check('...and their numbers are the food table\'s for the scaled ingredients',
    ['breakfast', 'dinner', 'snack'].every(s => { const o = swap!.chosen[s as MealSlotName]!; return Math.abs(o.macros.calories - computeMealMacros(o.ingredients).kcal) <= 1 }))
  check('the day is on target after the re-size', !!swap?.withinTolerance && dayVerdict(swap.totals, targets).onTarget, swap?.totals)
  check('the totals are the sum of what is served', !!swap && Math.abs(swap.totals.calories - sum(swap.chosen).calories) < 1e-6)
  const line = h ? heldAroundLine(h) : null
  check('one line says so, naming the meals and the size', line === `To fit around your swap, your breakfast, dinner and snack are ${Math.round(Math.abs(f - 1) * 100)}% ${f < 1 ? 'smaller' : 'bigger'}. Same dishes.`, line)
}

console.log('\n3. Beyond 25%: left as planned, and the gap said')
{
  const far = holdAroundPins({ planned, fixed: { lunch: hugeLunch }, targets })
  check('the dishes and sizes are exactly the plan\'s', !!far && ['breakfast', 'dinner', 'snack'].every(s => far.chosen[s as MealSlotName] === planChosen[s as keyof typeof planChosen]))
  const h = far?.heldAround
  const gap = Math.round(sum(far!.chosen).calories - targets.calories)
  check('it says too far, with the real gap', h?.kind === 'too_far' && h.deltaKcal === gap, { h, gap })
  check('the line says how far over, plainly', heldAroundLine(h!) === `Kept your breakfast, dinner and snack as planned: fitting them around your swap would take more than a 25% change. The day is ${Math.abs(gap)} kcal over your target.`, heldAroundLine(h!))
  check('the day is honestly off target', far?.withinTolerance === false)
  // UPWARD TOO: a small swap that would need the others more than 25% BIGGER.
  // Scaling up is never refused by the portion scaler, so only the band stops it.
  const tinyLunch = opt('lunch', 'Rice cakes', [{ name: 'rice cakes', quantity: 20, unit: 'g' }])
  const up = holdAroundPins({ planned, fixed: { lunch: tinyLunch }, targets })
  check('the tiny swap needs more than +25% (sanity check on the next one)', (targets.calories - tinyLunch.macros.calories) / (targets.calories - chickenRice.macros.calories) > AROUND_EATEN_MAX, tinyLunch.macros.calories)
  check('...so the others are left as planned and the gap said, never grown past 25%',
    up?.heldAround?.kind === 'too_far' && ['breakfast', 'dinner', 'snack'].every(s => up.chosen[s as MealSlotName] === planChosen[s as keyof typeof planChosen]), up?.heldAround)
  // ALL OR NONE: a held dish the food table cannot cost is never half-sized.
  const mystery = { ...yoghurt, name: 'Mystery pot', ingredients: [...yoghurt.ingredients, { name: 'zorblax paste', quantity: 30, unit: 'g' }] }
  const half = holdAroundPins({ planned: { ...planned, chosen: { ...planChosen, snack: mystery }, alternatives: { ...planned.alternatives, snack: [mystery] } }, fixed: { lunch: tunaPasta }, targets })
  check('an un-costable held dish: nothing is re-sized, the gap is said',
    half?.heldAround?.kind === 'too_far' && half.chosen.breakfast === porridge && half.chosen.dinner === salmon && half.chosen.snack === mystery, half?.heldAround)
}

console.log('\n4. Undo keeps the planned sizes')
{
  const kept = holdAroundPins({ planned, fixed: { lunch: tunaPasta }, targets, keepSizes: true })
  check('every held dish is the plan\'s own, unsized', !!kept && ['breakfast', 'dinner', 'snack'].every(s => kept.chosen[s as MealSlotName] === planChosen[s as keyof typeof planChosen]))
  check('it says kept, with the gap', kept?.heldAround?.kind === 'kept' && kept.heldAround.deltaKcal === Math.round(sum(kept.chosen).calories - targets.calories), kept?.heldAround)
  check('...and the line offers the way back', /^Kept your breakfast, dinner and snack as planned after your swap\. The day is \d+ kcal (over|under) your target\.$/.test(heldAroundLine(kept!.heldAround!) ?? ''), heldAroundLine(kept!.heldAround!))
}

console.log('\n5. Nothing to say when the swap already fits')
{
  const same = holdAroundPins({ planned, fixed: { lunch: chickenRice }, targets })
  check('a swap that lands the day as it is changes no size', !!same && same.heldAround?.kind === 'none' && ['breakfast', 'dinner', 'snack'].every(s => same.chosen[s as MealSlotName] === planChosen[s as keyof typeof planChosen]))
  check('...and says nothing', heldAroundLine(same!.heldAround!) === null)
}

console.log('\n6. One dish, once a day')
{
  const salmonLunch = { ...salmon, slot: 'lunch' as MealSlotName }
  check('a swap to the dish another meal already holds is handed back to the search', holdAroundPins({ planned, fixed: { lunch: salmonLunch }, targets }) === null)
  check('a day with nothing left to hold is handed back too', holdAroundPins({ planned, fixed: { ...planChosen, lunch: tunaPasta }, targets }) === null)
}

console.log('\n7. In the app\'s own day: plan dishes hold, her own re-plans')
{
  // Seven real-food dishes a slot, the shape the tab serves, seeded.
  const rnd = mulberry32(4242)
  const t: MacroTargets = { calories: 2300, protein: 160, carbs: 250, fat: 75 }
  const pools: Partial<Record<MealSlotName, PoolOption[]>> = {}
  for (const [slot, b] of Object.entries(computeSlotBudgets(t, 3, true)) as [MealSlotName, MacroTargets][]) {
    pools[slot] = Array.from({ length: 7 }, (_, i) => makeDish(rnd, slot, i, b)).filter((o): o is PoolOption => o !== null)
  }
  const shape = { mealsPerDay: 3, includeSnacks: true, batchCooking: false }
  const rot = buildRotation(pools, t, [], shape)
  const dates = Array.from({ length: ROTATION_DAYS }, (_, i) => new Date(Date.UTC(2026, 9, 12 + i)).toISOString().slice(0, 10))
  let held = 0, kept = 0, replanned = 0, compared = 0
  const wrong: string[] = []
  for (const date of dates) {
    const before = assembleRotationDay(rot, date, pools, t, [], {})
    const other = (pools.lunch ?? []).find(o => o.name !== before.chosen.lunch?.name)!
    const after = assembleRotationDay(rot, date, pools, t, [], { lunch: other })
    compared++
    const others = SLOTS.filter(s => s !== 'lunch' && before.chosen[s])
    if (after.heldAround) held++
    if (after.heldAround && !others.every(s => after.chosen[s]?.name === before.chosen[s]?.name)) wrong.push(`${date}: ${others.map(s => `${before.chosen[s]?.name}->${after.chosen[s]?.name}`).join(', ')}`)
    if (others.every(s => after.chosen[s]?.name === before.chosen[s]?.name)) kept++
    // HER OWN meal, the same food: tagged as asked for by name.
    const mine = { ...other, name: `${other.name} (mine)`, tags: ['user-requested'] }
    const own = assembleRotationDay(rot, date, { ...pools, lunch: [...(pools.lunch ?? []), mine] }, t, [], { lunch: mine })
    if (!own.heldAround) replanned++
  }
  check(`all ${ROTATION_DAYS} days were tried`, compared === ROTATION_DAYS, compared)
  check('a swap to one of the plan\'s own dishes holds the day on every date', held === ROTATION_DAYS, held)
  check('...and every other meal keeps its dish, on every date', wrong.length === 0 && kept === ROTATION_DAYS, wrong)
  check('a meal of her own (asked for by name) re-plans the day instead, every time — her 1 Sep rule', replanned === ROTATION_DAYS, replanned)

  // UNDO REACHES EVERY SURFACE THAT SERVES A DAY: serveDates is the one
  // function the tab, its trials and the shopping list call.
  const date = dates[2]
  const before = assembleRotationDay(rot, date, pools, t, [], {})
  const other = (pools.lunch ?? []).find(o => o.name !== before.chosen.lunch?.name)!
  const pins = { [date]: { lunch: other } }
  const normal = serveDates({ dates, pools, targets: t, shape, pinsByDate: pins })
  const undone = serveDates({ dates, pools, targets: t, shape, pinsByDate: pins, keepHeldSizes: [date] })
  const d = (s: typeof normal) => s.find(x => x.date === date)!.day
  check('served with Undo for that date, the day is held at its planned sizes and says so',
    d(undone).heldAround?.kind === 'kept' || (d(normal).heldAround?.kind === 'none' && d(undone).heldAround?.kind === 'none'), [d(normal).heldAround, d(undone).heldAround])
  check('...the fixture is under pressure: without Undo this day was re-sized', d(normal).heldAround?.kind === 'resized', d(normal).heldAround)
  check('...and no other date moves', dates.filter(x => x !== date).every(x => JSON.stringify(normal.find(s => s.date === x)!.day.chosen) === JSON.stringify(undone.find(s => s.date === x)!.day.chosen)))
  check('the rotation index used is the one the tab uses (sanity)', rotationIndexFor(date) >= 0)

  // A LEFTOVER LUNCH IS LAST NIGHT'S DINNER: a swapped dinner leaves it be.
  const shapeOn = { mealsPerDay: 3, includeSnacks: true, batchCooking: true }
  const rotOn = buildRotation(pools, t, [], shapeOn)
  const withLeftover = dates.filter(x => rotOn.leftoverFor(rotationIndexFor(x)).lunch !== undefined)
  check('the sanity check: batch cooking plans a leftover lunch on some days', withLeftover.length > 0, withLeftover.length)
  let leftoverKept = 0
  for (const x of withLeftover) {
    const b = assembleRotationDay(rotOn, x, pools, t, [], {})
    if (b.chosen.lunch?.leftoverFrom !== 'dinner') continue
    const otherDinner = (pools.dinner ?? []).find(o => o.name !== b.chosen.dinner?.name && o.name !== b.chosen.lunch?.name)!
    const a = assembleRotationDay(rotOn, x, pools, t, [], { dinner: otherDinner })
    if (a.heldAround && a.chosen.lunch === b.chosen.lunch) leftoverKept++
  }
  check('a swapped dinner keeps last night\'s leftover as lunch, exactly, on every such day', leftoverKept > 0 && leftoverKept === withLeftover.filter(x => assembleRotationDay(rotOn, x, pools, t, [], {}).chosen.lunch?.leftoverFrom === 'dinner').length, leftoverKept)
}

console.log('\n8. Today\'s fit around what was eaten counts from the dish as planned')
{
  // A dish the swap already made 20% bigger can grow at most ~4% more today.
  const big = { ...salmon, heldBy: 1.2 }
  // Lunch eaten 50 kcal light: dinner must grow about 10%, so 1.2 x 1.1 is past 1.25.
  const shown = dayAsShown({ slots: ['lunch', 'dinner'], chosen: { lunch: chickenRice, dinner: big }, eatenBySlot: { lunch: { kcal: chickenRice.macros.calories - 50, protein: 20, carbs: 20, fat: 5 } }, targets: { calories: chickenRice.macros.calories + big.macros.calories, protein: 999, carbs: 999, fat: 999 } })
  check('a re-size that would take a held dish past 25% of its plan is refused', shown.aroundEaten.kind === 'too_far', shown.aroundEaten)
  const plain = dayAsShown({ slots: ['lunch', 'dinner'], chosen: { lunch: chickenRice, dinner: salmon }, eatenBySlot: { lunch: { kcal: chickenRice.macros.calories - 50, protein: 20, carbs: 20, fat: 5 } }, targets: { calories: chickenRice.macros.calories + salmon.macros.calories, protein: 999, carbs: 999, fat: 999 } })
  check('...while the same move on an unheld dish is allowed (sanity check on the one above)', plain.aroundEaten.kind !== 'too_far', plain.aroundEaten)
}

console.log('\n9. The wiring')
{
  const rotation = code('src/lib/meal-rotation.ts')
  check('the day function holds only when no pin is her own', /!live\.some\(\(\[, o\]\) => o\.tags\?\.includes\(USER_REQUESTED_TAG\)\)/.test(rotation) && /holdAroundPins\(\{ planned: plannedDay, fixed, targets, keepSizes: opts\.keepHeldSizes \}\)/.test(rotation))
  check('...and serveDates passes each date\'s Undo through', /keepHeldSizes: kept\.has\(date\)/.test(rotation))
  const grocery = code('src/lib/grocery-store.ts')
  check('the shopping list serves the same Undo dates as the screen', (grocery.match(/readKeptHeldSizes\(input\.profileId\)/g) ?? []).length === 3 && /serveDates\(\{[^}]*keepHeldSizes \}\)/.test(grocery))
  const hook = code('src/hooks/useMealDays.ts')
  check('the days hook serves its week with the Undo dates, and hands out the switch', /keepHeldSizes: keptHeldSizes \}\)/.test(hook) && /setKeptHeldSizes\(writeKeptHeldSize\(profileId, date, keep\)\)/.test(hook) && /\n\s+keepHeldSizes,\n/.test(hook))
  const mealPlan = code('src/components/MealPlan.tsx')
  check('the meal screen says the line and its Undo calls the switch for THIS date',
    /data-testid="held-around"/.test(mealPlan) && /data-testid="held-around-undo" onClick=\{\(\) => onKeepHeldSizes\(date, true\)\}/.test(mealPlan) && /data-testid="held-around-refit" onClick=\{\(\) => onKeepHeldSizes\(date, false\)\}/.test(mealPlan))
  const app = code('src/App.tsx')
  check('App hands today\'s held state and the switch to the screen', /heldAround=\{mealDays\.today\?\.day\.heldAround\}/.test(app) && /onKeepHeldSizes=\{mealDays\.keepHeldSizes\}/.test(app))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} hold-around-pins check(s) FAILED`); process.exit(1) }
console.log('All hold-around-pins checks passed.')
