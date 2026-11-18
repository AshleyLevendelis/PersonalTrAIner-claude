// ---------------------------------------------------------------------------
// test:meal-facts — what the app does with the foods he tells it (18 Nov 2026, the Fable pass on meals).
//
// Found by putting ordinary lines through the real builders:
//   - "200g chicken, 250g rice, 60g chocolate brownie" came back as a 659 kcal card that LISTED the brownie and
//     counted none of it (the meal check allows a fifth of a dish's weight to be unknown). His 15 Oct rule for a
//     logged meal ("never show a total that quietly leaves it out") was not held for a meal he describes.
//   - "salt" was an unknown food, so "salt and pepper" was asked about in grams.
//   - "200g chicken breast" was shown back as "275g raw chicken breast" under "Your portions, untouched".
//   - crab sticks were plain crab, onion rings plain onion, soba plain buckwheat, cornflakes and Worcestershire sauce
//     passed gluten-free, hoisin passed sesame-free, Thai curry paste passed shellfish-free and vegan.
// This holds each one.
// ---------------------------------------------------------------------------
import type { MacroTargets } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

async function main() {
  const { buildCustomMealProposal } = await import('../src/lib/custom-meal')
  const { validateMealAgainstDiet } = await import('../src/lib/diet-rules')
  const { lookupIngredient, computeMealMacros, isToTaste } = await import('../src/lib/food-db')
  const { parseIngredientLines } = await import('../src/lib/portion-scaler')
  const { MEAL_LIBRARY } = await import('../src/lib/meal-library-data')
  const { verifyProposal, computeSlotBudgets } = await import('../src/lib/meal-generation')
  const { fitDishToBudget } = await import('../src/lib/meal-library')

  const targets: MacroTargets = { calories: 2400, protein: 160, carbs: 270, fat: 75 }
  const build = (food_lines: string[], diet: string[] = []) => buildCustomMealProposal({
    rawArgs: { meal_slot: 'dinner', food_lines }, profileId: 'p', todayDate: '2026-11-18', targets, mealsPerDay: 3,
    includeSnacks: true, skipBreakfast: false, dietaryPreferences: diet,
  })
  const cardText = (r: ReturnType<typeof build>) => r.ok ? r.diff.implications.map(i => i.text).join(' | ') : ''
  const kcalOf = (r: ReturnType<typeof build>) => r.ok ? Math.round(r.payload.option.macros.calories) : null

  console.log('\n1. A food the app cannot count is asked about, never left out of the total')
  const brownie = build(['200g chicken breast', '250g cooked white rice', '60g chocolate brownie'])
  check('a meal with a food the table does not know gets no card', brownie.ok === false, brownie)
  check('...the question names the food', !brownie.ok && /chocolate brownie/.test(brownie.reason), brownie)
  check('...says nothing was added, and how to go on', !brownie.ok && /haven't added this yet/.test(brownie.reason) && /leave it out/.test(brownie.reason), brownie)
  const two = build(['150g salmon', '50g hollandaise', '2 tbsp chimichurri'])
  check('two unknown foods are both named', !two.ok && /hollandaise and chimichurri/.test(two.reason), two)
  const known = build(['200g chicken breast', '250g cooked white rice', '1 tbsp olive oil'])
  check('the same meal with only known foods gets its card', known.ok === true, known)

  console.log('\n2. Seasonings need no amount; anything with energy still does')
  const plain = build(['2 eggs', '2 slices toast', '1 tsp butter'])
  const seasoned = build(['2 eggs', '2 slices toast', '1 tsp butter', 'salt and pepper'])
  check('"salt and pepper" with no amount is not asked about', seasoned.ok === true, seasoned)
  check('...and adds nothing to the total', seasoned.ok && plain.ok && kcalOf(seasoned) === kcalOf(plain), [kcalOf(seasoned), kcalOf(plain)])
  check('...and is written as a pinch, never the reader\'s placeholder gram', /1 pinch salt and pepper/.test(cardText(seasoned)) && !/1g /.test(cardText(seasoned)), cardText(seasoned))
  const more = build(['200g chicken breast', 'pinch of salt', 'black pepper to taste', 'fresh basil', 'squeeze of lemon', 'juice of 1 lemon'])
  check('a pinch of salt, pepper to taste, fresh basil and a squeeze of lemon all pass', more.ok === true, more)
  const oil = build(['200g chicken breast', 'a drizzle of olive oil'])
  check('a drizzle of olive oil is still asked about (oil is not a seasoning)', oil.ok === false && /olive oil/.test(oil.ok ? '' : oil.reason), oil)
  const butter = build(['2 slices toast', 'butter'])
  check('...and so is butter with no amount', butter.ok === false, butter)
  check('salt is a food the table knows, with no energy', lookupIngredient('salt')?.per100g.kcal === 0 && isToTaste(lookupIngredient('salt')))
  const spoon = computeMealMacros(parseIngredientLines(['2 tbsp paprika']))
  check('a seasoning WITH an amount is costed as written (2 tbsp paprika is not nothing)', spoon.kcal > 20 && spoon.amountsUnderstood, spoon.kcal)
  check('olive oil, butter, cheese and honey are not seasonings', ['olive oil', 'butter', 'cheddar', 'honey', 'mayonnaise'].every(n => !isToTaste(lookupIngredient(n))))

  console.log('\n3. The card says how it weighed his food')
  check('a raw line carries its cooked weight ("275g raw chicken breast (about 200g cooked)")', /275g raw chicken breast \(about 200g cooked\)/.test(cardText(known)), cardText(known))
  check('...and the line no longer says "untouched" beside a number he did not type', /as the app weighs them/.test(cardText(known)) && !/untouched/.test(cardText(known)), cardText(known))

  console.log('\n4. A product is not its main ingredient')
  const v = (food: string, pref: string) => validateMealAgainstDiet([{ name: food, quantity: 100, unit: 'g' }], [pref])
  const contains = (food: string, pref: string) => { const r = v(food, pref); return !r.ok && r.violations.every(x => !x.unidentified) }
  check('crab sticks are refused for fish-free, egg-free and gluten-free, as "contains"', contains('crab sticks', 'fish-free') && contains('crab sticks', 'egg-free') && contains('crab sticks', 'gluten-free'))
  check('...and seafood sticks are the same food', lookupIngredient('seafood sticks')?.name === 'crab sticks')
  check('onion rings are refused for gluten-free', contains('onion rings', 'gluten-free'))
  check('mozzarella sticks are refused for gluten-free and egg-free', contains('mozzarella sticks', 'gluten-free') && contains('mozzarella sticks', 'egg-free'))
  check('soba noodles are refused for gluten-free (they were plain buckwheat)', contains('soba noodles', 'gluten-free') && lookupIngredient('buckwheat')?.name === 'buckwheat cooked' && v('buckwheat', 'gluten-free').ok)
  check('a cut of the same food is still that food: carrot sticks, pepper rings, celery sticks', lookupIngredient('carrot sticks')?.name === lookupIngredient('carrot')?.name && lookupIngredient('pepper rings') != null && lookupIngredient('celery sticks')?.name === 'celery')
  check('"fried chicken breast" is still chicken breast, not a breaded product', lookupIngredient('fried chicken breast')?.name === 'chicken breast' && lookupIngredient('pan fried chicken breast')?.name === 'chicken breast')
  check('...while breaded chicken and chicken goujons are refused for gluten-free', contains('breaded chicken', 'gluten-free') && contains('chicken goujons', 'gluten-free'))

  console.log('\n5. Tags that were missing')
  check('cornflakes are refused for gluten-free (barley malt)', contains('cornflakes', 'gluten-free'))
  check('Worcestershire sauce is refused for gluten-free as well as fish-free', contains('worcestershire sauce', 'gluten-free') && contains('worcestershire sauce', 'fish-free'))
  check('hoisin sauce is refused for sesame-free', contains('hoisin sauce', 'sesame-free'))
  check('pork sausage is refused for sulphite-free', contains('pork sausage', 'sulphite-free'))
  check('Thai curry paste is refused for shellfish-free, fish-free, vegetarian and vegan', ['shellfish-free', 'fish-free', 'vegetarian', 'vegan'].every(p => contains('thai curry paste', p)) && contains('red curry paste', 'shellfish-free') && contains('green curry paste', 'vegan'))
  check('...an Indian curry paste is not (no shrimp paste in it)', v('curry paste', 'shellfish-free').ok && v('tikka paste', 'vegan').ok)
  check('...and a vegan Thai paste passes vegan', v('vegan thai curry paste', 'vegan').ok && v('vegan thai curry paste', 'shellfish-free').ok)

  console.log('\n6. The library says which paste')
  const budgets = computeSlotBudgets(targets, 3, true)
  const accepted = (name: string, diet: string[]) => {
    const dish = MEAL_LIBRARY.find(d => d.name === name)
    if (!dish) return null
    return verifyProposal(fitDishToBudget(dish, budgets[dish.slot]!).dish, dish.slot, budgets[dish.slot]!, diet, [], []) != null
  }
  check('the Thai green chicken curry is no longer served to someone shellfish-free', accepted('Thai green chicken curry', []) === true && accepted('Thai green chicken curry', ['shellfish-free']) === false, [accepted('Thai green chicken curry', []), accepted('Thai green chicken curry', ['shellfish-free'])])
  check('the Thai red curry with tofu is still served to a vegan (it names the vegan paste)', accepted('Thai red curry with tofu and green beans', ['vegan']) === true, accepted('Thai red curry with tofu and green beans', ['vegan']))
  check('an Indian chicken curry is still served to someone shellfish-free', accepted('Chicken curry with rice', ['shellfish-free']) === true, accepted('Chicken curry with rice', ['shellfish-free']))
  const thai = MEAL_LIBRARY.filter(d => d.tags?.[0] === 'Thai' || /thai|laksa|massaman/i.test(d.name)).filter(d => d.ingredients.some(i => /curry paste/.test(i)))
  check('every Thai dish with a curry paste names a Thai paste, never the bare one', thai.length >= 6 && thai.every(d => d.ingredients.filter(i => /curry paste/.test(i)).every(i => /thai curry paste/.test(i))), thai.filter(d => !d.ingredients.filter(i => /curry paste/.test(i)).every(i => /thai curry paste/.test(i))).map(d => d.name))

  console.log('\n7. Foods a log is full of')
  const kcal = (line: string) => { const c = computeMealMacros(parseIngredientLines([line])); return c.amountsUnderstood && c.unmatched.length === 0 ? c.kcal : null }
  const near = (got: number | null, want: number, tol: number) => got != null && Math.abs(got - want) <= tol
  check('a slice of pizza is about 275 kcal', near(kcal('1 slice pizza'), 275, 15), kcal('1 slice pizza'))
  check('a pint of beer is about 233 kcal', near(kcal('1 pint beer'), 233, 15), kcal('1 pint beer'))
  check('a glass of wine is about 149 kcal', near(kcal('1 glass red wine'), 149, 12), kcal('1 glass red wine'))
  check('3 fish fingers are about 168 kcal', near(kcal('3 fish fingers'), 168, 12), kcal('3 fish fingers'))
  check('a tablespoon of tomato puree and a red chilli are known foods', kcal('1 tbsp tomato puree') != null && kcal('1 red chilli') != null, [kcal('1 tbsp tomato puree'), kcal('1 red chilli')])
  check('beer is refused for gluten-free and halal, wine for halal', contains('beer', 'gluten-free') && contains('beer', 'halal') && contains('red wine', 'halal'))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exitCode = 1; return }
  console.log('His foods are counted or asked about; seasonings need no grams; products carry what they are made of.')
}
main().catch(e => { console.error(e); process.exit(1) })
