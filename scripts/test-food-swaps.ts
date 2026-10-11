/**
 * Gate: a swap offered for a food does the same job on the plate.
 *
 * 9 Oct 2026, the test log's L19: taking the blueberries out of a pancake
 * breakfast offered "65g lime" and "80g avocado". Run against the rule as it
 * was (every food in the same database category, the person's own foods
 * first), section 2 below returned lime at the head of the list.
 *
 * WHAT IS HELD: every food in the database is in exactly one swap group or is
 * marked as having no swap; only foods in the removed food's own group are
 * ever offered; a seasoning is never offered for anything and nothing is
 * offered for one; the person's own foods still lead — inside the group.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { FOOD_DB, computeMealMacros, lookupIngredient } from '../src/lib/food-db'
import { SWAP_GROUPS, NO_SWAP, swapGroupOf } from '../src/lib/food-swap-groups'
import { buildMealFoodRemoveProposal, buildMealFoodReplaceProposal } from '../src/lib/meal-food-edit'
import { parseIngredientLines, parseIngredientLine } from '../src/lib/portion-scaler'
import type { MacroTargets } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const code = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 500)}` : ''}`) }
}

const macrosOf = (lines: string[]): MacroTargets => {
  const m = computeMealMacros(parseIngredientLines(lines))
  return { calories: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat } as MacroTargets
}
// THE PANTRY THAT CAUSED IT, and worse: every seasoning and odd food that a
// "same category, her own foods first" rule would put at the head of a list.
const HOSTILE_PANTRY = ['1 lime', '80g avocado', '2 cloves garlic', '1 lemon', '30g anchovies', '40g beef jerky', '1 tbsp soy sauce', '1 tsp cumin', '60g onion', '20g nutritional yeast', '15g capers', '50g chicken liver']
const input = (lines: string[], pantry: string[], over: Record<string, unknown> = {}) => ({
  currentMeal: { name: 'A meal', ingredients: lines, macros: macrosOf(lines) },
  profileId: 'p1', todayDate: '2026-09-12',
  targets: { calories: 2400, protein: 180, carbs: 240, fat: 70 } as MacroTargets,
  mealsPerDay: 3, includeSnacks: false,
  dietaryPreferences: [] as string[], dislikedFoods: [] as string[],
  pantryFoods: pantry,
  ...over,
})
/** The foods offered when `food` is taken out of `lines`, as database names. */
const offeredFor = (lines: string[], food: string, slot: string, pantry: string[] = HOSTILE_PANTRY, over: Record<string, unknown> = {}): string[] => {
  const r = buildMealFoodRemoveProposal({ ...input(lines, pantry, over), rawArgs: { meal_slot: slot, food } })
  if (!r.ok) return [`BUILD REFUSED: ${r.reason}`]
  return (r.diff.alternatives ?? []).map(a => lookupIngredient(parseIngredientLine(a.label).name)?.name ?? `UNKNOWN: ${a.label}`)
}

// ---------------------------------------------------------------------------
console.log('\n1. Every food has been given a job, once')
// ---------------------------------------------------------------------------
{
  const grouped = Object.values(SWAP_GROUPS).flat()
  const listed = [...grouped, ...NO_SWAP]
  const names = new Set(FOOD_DB.map(f => f.name))
  const missing = FOOD_DB.map(f => f.name).filter(n => !listed.includes(n))
  const unknown = listed.filter(n => !names.has(n))
  const twice = listed.filter((n, i) => listed.indexOf(n) !== i)
  check(`all ${FOOD_DB.length} foods in the database are in a swap group or marked as having none`, missing.length === 0, missing)
  check('nothing listed that the database does not have (a typo would silently group nothing)', unknown.length === 0, unknown)
  check('no food is in two places', twice.length === 0, twice)
  check('a group of one is not a group', Object.entries(SWAP_GROUPS).every(([, v]) => v.length >= 2), Object.entries(SWAP_GROUPS).filter(([, v]) => v.length < 2).map(([k]) => k))
  check('the lookup agrees with the table', swapGroupOf('blueberries') === 'berries' && swapGroupOf('lime') === null && swapGroupOf('not a food') === null)
  check('lime, lemon and avocado are not berries; lime and lemon are in no group at all',
    swapGroupOf('avocado') !== 'berries' && NO_SWAP.includes('lime') && NO_SWAP.includes('lemon'))
}

// ---------------------------------------------------------------------------
console.log('\n2. The test log\'s case: blueberries on pancakes, with lime and avocado on the week\'s plan')
// ---------------------------------------------------------------------------
{
  const pancakes = ['60g oats', '2 egg', '150g greek yoghurt 0%', '50g blueberries', '1 tsp honey']
  const got = offeredFor(pancakes, 'blueberries', 'breakfast')
  check('something is offered (an empty list would pass everything below)', got.length >= 2 && !got.some(g => /REFUSED|UNKNOWN/.test(g)), got)
  check('lime is not offered', !got.includes('lime'), got)
  check('avocado is not offered', !got.includes('avocado'), got)
  check('every swap is a berry', got.every(g => swapGroupOf(g) === 'berries'), got)
  // And with nothing on the plan at all, the same.
  const bare = offeredFor(pancakes, 'blueberries', 'breakfast', [])
  check('the same holds with no pantry to go by', bare.length >= 2 && bare.every(g => swapGroupOf(g) === 'berries'), bare)
}

// ---------------------------------------------------------------------------
console.log('\n3. Everyday foods: every swap offered is from the same group')
// ---------------------------------------------------------------------------
{
  const cases: [string, string[], string][] = [
    ['chicken breast', ['150g chicken breast', '180g white rice cooked', '100g broccoli', '1 tbsp olive oil'], 'lunch'],
    ['salmon', ['150g salmon', '200g potato boiled', '100g green beans'], 'dinner'],
    ['white rice cooked', ['150g chicken breast', '180g white rice cooked', '100g broccoli', '1 tbsp olive oil'], 'lunch'],
    ['pasta cooked', ['200g pasta cooked', '120g beef mince 5% fat', '150g tomato passata', '20g parmesan'], 'dinner'],
    ['broccoli', ['150g chicken breast', '180g white rice cooked', '150g broccoli', '1 tbsp olive oil'], 'lunch'],
    ['spinach', ['3 egg', '200g spinach', '60g feta cheese', '2 slice wholemeal bread'], 'breakfast'],
    ['banana', ['60g oats', '250ml milk semi skimmed', '120g banana', '30g whey protein powder'], 'breakfast'],
    ['olive oil', ['150g chicken breast', '180g white rice cooked', '100g broccoli', '1 tbsp olive oil'], 'lunch'],
    ['greek yoghurt 0%', ['250g greek yoghurt 0%', '40g granola', '80g strawberries', '30g whey protein powder'], 'breakfast'],
    ['potato boiled', ['150g salmon', '250g potato boiled', '100g green beans'], 'dinner'],
    ['cheddar cheese', ['3 egg', '50g cheddar cheese', '2 slice wholemeal bread', '80g ham'], 'breakfast'],
    ['almonds', ['200g greek yoghurt 0%', '30g almonds', '100g blueberries', '30g whey protein powder'], 'breakfast'],
    ['beef mince 5% fat', ['200g pasta cooked', '150g beef mince 5% fat', '150g tomato passata', '20g parmesan'], 'dinner'],
  ]
  let withOffers = 0
  for (const [food, lines, slot] of cases) {
    const got = offeredFor(lines, food, slot)
    const group = swapGroupOf(food)
    if (got.length > 0) withOffers++
    check(`${food}: every swap is from "${group}" (${got.join(', ') || 'nothing offered'})`,
      group !== null && !got.some(g => /REFUSED|UNKNOWN/.test(g)) && got.every(g => swapGroupOf(g) === group), got)
  }
  check(`most of these everyday foods do get an offer (${withOffers} of ${cases.length})`, withOffers >= 10, withOffers)
}

// ---------------------------------------------------------------------------
console.log('\n4. A seasoning is never offered, and nothing is offered for one')
// ---------------------------------------------------------------------------
{
  // EVERY food in the database, taken out of a plain meal, with the hostile
  // pantry. Not ten foods: the whole table, because the rule is "never".
  const leaked: string[] = []
  const wrongGroup: string[] = []
  let offers = 0
  for (const f of FOOD_DB) {
    const amount = f.per100g.kcal > 400 ? 20 : f.per100g.kcal > 150 ? 100 : 150
    const lines = [`${amount}g ${f.name}`, '150g chicken breast', '150g white rice cooked']
    for (const g of offeredFor(lines, f.name, 'lunch')) {
      if (/REFUSED|UNKNOWN/.test(g)) continue
      offers++
      if (NO_SWAP.includes(g)) leaked.push(`${f.name} -> ${g}`)
      if (swapGroupOf(g) !== swapGroupOf(f.name)) wrongGroup.push(`${f.name} -> ${g}`)
    }
  }
  check(`across all ${FOOD_DB.length} foods (${offers} swaps offered): no seasoning or one-off is ever offered`, offers > 200 && leaked.length === 0, leaked.slice(0, 6))
  check('...and no swap crosses a group', wrongGroup.length === 0, wrongGroup.slice(0, 6))
  const lime = offeredFor(['150g chicken breast', '60g lime', '150g white rice cooked'], 'lime', 'lunch', ['1 lemon', '100g orange'])
  const onion = offeredFor(['150g chicken breast', '150g onion', '150g white rice cooked'], 'onion', 'lunch', ['2 cloves garlic', '100g leek'])
  check('taking out a lime offers nothing (not 60g of lemon)', lime.length === 0, lime)
  check('taking out an onion offers nothing', onion.length === 0, onion)
}

// ---------------------------------------------------------------------------
console.log('\n5. Her own foods still come first — inside the group')
// ---------------------------------------------------------------------------
{
  // A porridge with a banana in it. With nothing on her plan the list is the
  // three closest sweet fruits, and pear is not one of them; with pear on her
  // plan (and a lime, which must change nothing) pear leads.
  const porridge = ['60g oats', '250ml milk semi skimmed', '120g banana', '30g whey protein powder']
  const plain = offeredFor(porridge, 'banana', 'breakfast', [])
  const withPear = offeredFor(porridge, 'banana', 'breakfast', ['1 lime', '150g pear'])
  check('a fruit that was not on the list (pear) leads it once it is on her plan', plain.length === 3 && !plain.includes('pear') && withPear[0] === 'pear', { plain, withPear })
  check('...and the lime beside it on her plan changed nothing else', withPear.every(g => swapGroupOf(g) === 'sweet fruit'), withPear)
  // THE PORTION RULE STILL BITES INSIDE A GROUP. Seitan has 75 g of protein
  // per 100 g and silken tofu 5.5: the arithmetic says over 800 g of tofu.
  const seitan = offeredFor(['60g seitan', '150g white rice cooked', '100g broccoli'], 'seitan', 'lunch', ['150g tofu silken'])
  check('a same-group swap that needs a bucketful is still not offered', swapGroupOf('seitan') === swapGroupOf('tofu silken') && !seitan.includes('tofu silken'), seitan)
  // The filters still reach the offer.
  const vegan = offeredFor(['150g chicken breast', '180g white rice cooked', '100g broccoli'], 'chicken breast', 'lunch', HOSTILE_PANTRY, { dietaryPreferences: ['vegan'] })
  check('a vegan filter still leaves no meat on the offer', vegan.every(g => /REFUSED/.test(g)) || vegan.length === 0, vegan)
  // An offer is a promise the confirm will work.
  const lines = ['150g chicken breast', '180g white rice cooked', '100g broccoli', '1 tbsp olive oil']
  const r = buildMealFoodRemoveProposal({ ...input(lines, HOSTILE_PANTRY), rawArgs: { meal_slot: 'lunch', food: 'chicken breast' } })
  const alts = r.ok ? r.diff.alternatives ?? [] : []
  check('every swap offered can be confirmed', alts.length >= 2 && alts.every(a => buildMealFoodReplaceProposal({ ...input(lines, HOSTILE_PANTRY), rawArgs: { meal_slot: 'lunch', food: 'chicken breast', with_food: a.label } }).ok === true), alts)
}

// ---------------------------------------------------------------------------
console.log('\n6. The rule is the group, not the database category')
// ---------------------------------------------------------------------------
{
  const src = code('src/lib/meal-food-edit.ts')
  check('the candidate filter no longer asks for "the same category"', !/f\.category === entry\.category/.test(src))
  check('...it asks for the same swap group', /swapGroupOf\(f\.name\) === group/.test(src))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} food-swap check(s) FAILED.`); process.exit(1) }
console.log('A swap does the same job on the plate.')
