/**
 * Gate: an ingredient amount is UNDERSTOOD or it is marked unread. It is never guessed.
 *
 * Written 1 Oct 2026 (docs/plans/ingredient-units.md). Measured that day: 31 of
 * 53 ordinary recipe lines were costed with an amount over 25% wrong and all 31
 * still read as fully covered ("8 oz chicken breast" was 8 g, "1 cup oats" was
 * 910 kcal, "2 carrots" was 2 g). Coverage is weighted by mass and the mass was
 * the misread number, so no mass-weighted score could ever see it.
 *
 * WHAT THIS HOLDS
 *   1. A table of lines whose true weight is known independently of the code
 *      (the unit's definition, or the household measure), each costed within 10%,
 *      or marked unread where the answer is "ask".
 *   2. PROPERTIES that hold for every food and need no table: a unit word never
 *      stays in a food's name (the old failure), the exact conversions are exact,
 *      every unit a food names itself reads, the amount scales linearly.
 *   3. The meal-level rule: a meal with an unread line is refused by
 *      verifyProposal, in generation mode AND in the user's-own-portions mode,
 *      and the refusal quotes the line.
 *   4. The app's and the coach's copies of the reader and the food database are
 *      the SAME FILE, and give the same answer on every line.
 *   5. The allergen path did not get more permissive: for every food and diet,
 *      a line read through the reader is never allowed where the food alone is
 *      refused.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { FOOD_DB, computeMealMacros, resolveGrams, lookupIngredient } from '../src/lib/food-db'
import { parseIngredientLine, withQuantity } from '../src/lib/portion-scaler'
import { readIngredientText } from '../src/lib/ingredient-units'
import { verifyProposal } from '../src/lib/meal-generation'
import { validateMealAgainstDiet, DIETARY_PREFERENCES } from '../src/lib/diet-rules'
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
// The coach's own copies. Plain TypeScript with no imports, so tsx reads them directly.
// @ts-ignore a Deno-side file, not part of tsconfig
import * as serverFood from '../supabase/functions/_shared/food-db'
// @ts-ignore
import * as serverUnits from '../supabase/functions/_shared/ingredient-units'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const text = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

let ran = 0
let failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 500)}` : ''}`) }
}

const gramsOf = (line: string) => {
  const m = computeMealMacros([parseIngredientLine(line)])
  return { grams: m.lines[0].grams, understood: m.amountsUnderstood, matched: !!m.lines[0].entry }
}
const near = (got: number, want: number, rel = 0.1, abs = 0.6) => Math.abs(got - want) <= Math.max(abs, want * rel)

/** [line, true grams, note]. A true weight comes from the unit's definition or the household measure, never from running the code. */
const TABLE: [string, number, string][] = [
  // exact units
  ['8 oz chicken breast', 227, '8 oz is 227 g'], ['8 ounces chicken breast', 227, 'spelled out'], ['8oz chicken breast', 227, 'no space'],
  ['1 lb beef mince 5% fat', 454, ''], ['1 pound chicken breast', 454, ''], ['1/2 lb beef mince 5% fat', 227, 'a fraction'], ['1 1/2 lb potato boiled', 680, 'a mixed number'],
  ['0.5 kg potato boiled', 500, ''], ['1 kg potato boiled', 1000, ''], ['1kg potato boiled', 1000, 'no space'], ['1.5 kg chicken thigh', 1500, ''], ['½ kg potato boiled', 500, 'a unicode fraction'],
  ['200g chicken breast', 200, 'the form that always worked'], ['200 g chicken breast', 200, ''], ['200 grams chicken breast', 200, ''],
  ['250ml milk whole', 250, ''], ['500 ml milk whole', 500, ''], ['1 l milk whole', 1000, ''], ['1 litre milk whole', 1000, ''], ['2 fl oz milk whole', 59, ''],
  ['4 oz cheddar cheese', 113, ''], ['2 x 150g chicken breast', 300, 'a count of a size'], ['2 x 150 g chicken breast', 300, ''], ['100-150g chicken breast', 125, 'a range reads as its middle'],
  // spoons
  ['2 tbsp olive oil', 28, ''], ['1 tsp honey', 7, ''], ['1 tbsp peanut butter', 16, ''], ['2-3 tbsp olive oil', 35, 'a range of spoons'], ['1/2 tsp honey', 3.5, ''],
  // cups, by the food: never 240 g of everything
  ['1 cup oats', 85, 'was 240 g and 910 kcal'], ['1/2 cup oats', 42.5, ''], ['1 cup white rice cooked', 160, ''], ['1 1/2 cups white rice cooked', 240, ''],
  ['1 cup spinach', 30, 'was 240 g'], ['1 cup milk whole', 244, ''], ['1 cup quinoa cooked', 185, ''], ['1 cup blueberries', 148, ''], ['2 cups chickpeas', 328, ''],
  ['1 cup hummus', 246, ''], ['1 cup cheddar cheese', 113, 'shredded'], ['1 cup water', 237, ''],
  // tins and cans (drained weight where a tin is drained), and a stated size
  ['1 can chickpeas', 240, ''], ['1 tin kidney beans', 240, ''], ['2 cans chickpeas', 480, ''], ['1 can tuna canned in water', 120, ''], ['1 tin tuna', 120, 'did not resolve at all'],
  ['1 can chopped tomatoes', 400, ''], ['1 tin sweetcorn', 160, ''], ['1 (14 oz) can coconut milk canned', 397, 'a stated size is the weight'],
  ['1 can (400g) chopped tomatoes canned', 400, ''], ['2 tins (400g) chopped tomatoes canned', 800, ''],
  // loose amounts
  ['a pinch of black pepper', 0.4, ''], ['1 dash worcestershire sauce', 0.6, ''], ['1 splash olive oil', 5, ''],
  ['a handful of rocket', 20, ''], ['1 handful almonds', 28, ''], ['a handful of spinach', 30, ''],
  // counts: a piece, a size, a half
  ['2 large egg', 116, ''], ['3 egg', 150, 'the case that was 3 g'], ['3 eggs', 150, ''], ['1 medium banana', 118, ''], ['a banana', 118, 'was 1 g'], ['1 large banana', 136, 'was 1 g'],
  ['half an avocado', 75, ''], ['1 half avocado', 75, 'was 150 g: the add-food sheet writes this'], ['1 avocado', 150, ''],
  ['2 carrots', 122, 'was 2 g'], ['1 onion', 110, ''], ['1 chicken breast', 140, ''], ['4 chicken thighs', 440, ''], ['2 tomatoes', 246, ''], ['a lemon', 58, ''],
  ['2 slices wholemeal bread', 76, ''], ['1 slice white bread', 36, ''], ['3 cloves garlic', 9, ''], ['1 bunch spring onion', 90, ''], ['1 stick celery', 40, ''],
  ['1 head broccoli', 300, ''], ['2 heads cauliflower', 1200, ''], ['1 medium onion, finely diced', 110, 'a prep note after the name'], ['6 cherry tomatoes', 102, ''], ['1 scoop whey protein powder', 30, ''],
]

/** Lines whose amount cannot be known from the line: they must be marked unread, never costed. */
const UNREAD: [string, string][] = [
  ['salt and pepper to taste', 'to taste'], ['juice of 1 lemon', 'juice'], ['1 pint milk whole', 'pint'], ['1 knob butter', 'knob'], ['1 sachet honey', 'sachet'],
  ['some rice', 'no amount'], ['', 'empty'], ['150g', 'no food'], ['1 cup chicken breast', 'a cup of a food with no cup weight'], ['1 can chicken breast', 'a can of a food with no can weight'],
  ['1 handful chicken breast', 'a handful of a food with no handful weight'],
]

async function main() {
  console.log('\n1. A table of lines with a known weight')
  const wrong: string[] = []
  const notUnderstood: string[] = []
  for (const [line, want, note] of TABLE) {
    const r = gramsOf(line)
    if (!r.understood) notUnderstood.push(line)
    else if (!near(r.grams, want)) wrong.push(`${line} -> ${Math.round(r.grams * 10) / 10} g, want ${want}${note ? ' (' + note + ')' : ''}`)
  }
  check(`${TABLE.length} ordinary lines are each costed within 10% of their true weight`, wrong.length === 0, wrong.slice(0, 6))
  check('...and every one of them is understood: none is sent off to be asked about', notUnderstood.length === 0, notUnderstood)
  const askedWrong = UNREAD.filter(([line]) => gramsOf(line).understood)
  check(`${UNREAD.length} lines that cannot be known are marked unread, not costed: "to taste", juice of a lemon, a pint, a knob, a cup or a can of a food with no such weight`, askedWrong.length === 0, askedWrong)
  check('an unread line says WHY and quotes the line as it was written, so the question can name it', UNREAD.filter(([line]) => line.trim().length > 0).every(([line]) => { const m = computeMealMacros([parseIngredientLine(line)]); const p = parseIngredientLine(line); return m.unreadAmounts.includes(p.source ?? `${p.quantity} ${p.unit} ${p.name}`) || m.unreadAmounts.length === 1 }) && !!readIngredientText('juice of 1 lemon').unread && readIngredientText('juice of 1 lemon').source === 'juice of 1 lemon')

  console.log('\n2. Properties that need no table')
  const UNIT_WORDS = ['oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'kg', 'g', 'gram', 'ml', 'l', 'litre', 'cup', 'cups', 'tbsp', 'tsp', 'can', 'cans', 'tin', 'tins', 'pinch', 'handful', 'dash', 'splash', 'bunch', 'head', 'stick']
  const stuck: string[] = []
  const foods = (FOOD_DB as { name: string }[]).map(f => f.name)
  for (const food of foods) for (const u of UNIT_WORDS) for (const q of ['1', '2', '1/2', '1 1/2']) {
    const p = parseIngredientLine(`${q} ${u} ${food}`)
    const first = p.name.split(/\s+/)[0].toLowerCase()
    if (UNIT_WORDS.includes(first) || p.quantity <= 0 || !Number.isFinite(p.quantity)) stuck.push(`${q} ${u} ${food} -> ${JSON.stringify(p)}`)
  }
  check(`a unit word is never left inside a food's name (the old failure: "oz chicken breast"): ${foods.length} foods x ${UNIT_WORDS.length} units x 4 amounts`, stuck.length === 0, stuck.slice(0, 5))
  const inexact: string[] = []
  for (const food of foods) {
    const hundred = gramsOf(`227 g ${food}`).grams
    for (const [a, b, label] of [['8 oz', '226.8 g', 'oz'], ['1 lb', '453.6 g', 'lb'], ['1 kg', '1000 g', 'kg'], ['1 l', '1000 ml', 'l']] as const) {
      const x = gramsOf(`${a} ${food}`).grams, y = gramsOf(`${b} ${food}`).grams
      if (Math.abs(x - y) > Math.max(1, y * 0.005)) inexact.push(`${a} ${food}: ${x} vs ${y}`)
    }
    void hundred
  }
  check('oz, lb, kg and litres are exact for every food: 8 oz is 226.8 g, a pound 453.6 g', inexact.length === 0, inexact.slice(0, 4))
  const ownUnits: string[] = []
  for (const f of FOOD_DB as { name: string; units?: Record<string, number> }[]) {
    for (const [u, w] of Object.entries(f.units ?? {})) {
      const r = gramsOf(`2 ${u} ${f.name}`)
      if (!r.understood || !near(r.grams, 2 * w, 0.001, 0.01)) ownUnits.push(`2 ${u} ${f.name} -> ${r.grams} (${r.understood ? '' : 'unread, '}want ${2 * w})`)
    }
  }
  check('every unit a food names for itself reads as that weight (the add-food sheet writes "1 half avocado"; it was 150 g, twice the avocado)', ownUnits.length === 0, ownUnits.slice(0, 5))
  const nonlinear: string[] = []
  for (const food of foods.slice(0, 80)) for (const u of ['g', 'oz', 'lb', 'kg', 'tbsp', 'cup', 'can', 'whole', 'handful']) {
    const one = gramsOf(`1 ${u} ${food}`), three = gramsOf(`3 ${u} ${food}`)
    // A converted weight is rounded to a whole gram above 10 (8 oz is 227), so allow a gram of rounding per unit.
    if (one.understood && three.understood && Math.abs(three.grams - 3 * one.grams) > Math.max(1.5, one.grams * 0.001)) nonlinear.push(`${u} ${food}`)
    if (one.understood !== three.understood) nonlinear.push(`${u} ${food} (understood differs)`)
  }
  check('the weight is linear in the amount, and an amount is understood or not whatever the number is', nonlinear.length === 0, nonlinear.slice(0, 5))
  const staleDefault = FOOD_DB.filter(f => lookupIngredient(f.name) === f && resolveGrams(f as never, 'cup', 1).understood && (f as never as { units: Record<string, number> }).units.cup === 240 && f.category === 'veg')
  check('a cup is not 240 g of everything: no vegetable carries the old water-density cup', staleDefault.length === 0, staleDefault.map(f => f.name))
  const reread = ['1 1/2 cups white rice cooked', '2 tbsp olive oil', '½ cup oats', '150g chicken breast']
  check('withQuantity changes a mixed fraction as a whole ("1 1/2 cups" set to 2 is "2 cups", not "2 1/2 cups")', withQuantity('1 1/2 cups oats', 2) === '2 cups oats' && withQuantity('1/2 tsp cumin', 3) === '3 tsp cumin' && withQuantity('150g chicken', 90) === '90g chicken' && reread.length === 4)
  const looksReal = ['3 slices wholemeal bread', '2 medium egg', '1 large egg', '2 cloves garlic', '1 scoop whey protein powder', '150g chicken breast', '2 tbsp olive oil', '250ml milk whole']
  const drift = looksReal.map(l => ({ l, p: parseIngredientLine(l) })).filter(({ p }) => p.unread || !['slice', 'medium', 'large', 'clove', 'scoop', 'g', 'tbsp', 'ml'].includes(p.unit))
  check('lines that always read correctly read exactly as before: same unit words, nothing marked unread', drift.length === 0, drift)

  console.log('\n3. A meal with an unread amount is refused, and says which line')
  const budget = { calories: 700, protein: 45, carbs: 70, fat: 25 }
  const good = { slot: 'dinner', name: 'Chicken and rice', cuisine: 'British / Classic', prep: 'Cook it.', ingredients: ['170g chicken breast', '200g white rice cooked', '100g broccoli', '1 tbsp olive oil'] }
  const withBad = { ...good, name: 'Chicken and rice, one line unreadable', ingredients: ['170g chicken breast', '200g white rice cooked', '100g broccoli', '1 knob butter'] }
  const log: string[] = []
  check('the control: the readable meal is accepted', !!verifyProposal(good, 'dinner', budget, [], []))
  const refused = verifyProposal(withBad, 'dinner', budget, [], log)
  check('a meal whose amount cannot be read is refused, even though every food was found (coverage alone cannot see it)', refused === null && computeMealMacros(withBad.ingredients.map(parseIngredientLine)).coverage >= 0.8, { refused, log })
  check('...and the refusal quotes the line as it was written', log.some(l => l.includes('1 knob butter')), log)
  const logOwn: string[] = []
  const ownRefused = verifyProposal(withBad, 'dinner', budget, [], logOwn, [], undefined, true)
  check('...also in the user\'s-own-portions mode, where the amounts are facts and nothing re-checks them', ownRefused === null && logOwn.some(l => l.includes('1 knob butter')), logOwn)
  const ownGood = verifyProposal({ ...good, ingredients: ['8 oz chicken breast', '1 cup white rice cooked', '2 carrots'] }, 'dinner', budget, [], [], [], undefined, true)
  check('...while her own meal in ounces, cups and counts is accepted and costed right: 227 g of chicken, 160 g of rice, two carrots', !!ownGood && ownGood.ingredients.map(i => `${i.quantity}${i.unit}`).join(' ') === '227g 1cup 2whole' && ownGood.macros.protein > 60, ownGood && { ing: ownGood.ingredients, macros: ownGood.macros })
  const demo = computeMealMacros(['150g basmati rice cooked', '8 oz chicken breast', '1 tin tuna', 'a pinch of black pepper', '100g broccoli', '1 tbsp olive oil'].map(parseIngredientLine))
  check('THE MEAL THAT SCORED COVERAGE 0.993 WITH 10 G OF PROTEIN (8 oz chicken, a tin of tuna): it now carries the chicken and the tuna, about 100 g, and every amount is understood', demo.protein > 80 && demo.amountsUnderstood, { protein: demo.protein, coverage: demo.coverage })
  const unmatchedOk = computeMealMacros(['2 sprigs thyme', '1 cup dragonfruit'].map(parseIngredientLine))
  check('a food the database does not know is NOT an unread amount: coverage and the diet check already handle it, and a sprig of thyme is not refused', unmatchedOk.amountsUnderstood && unmatchedOk.unmatched.length === 2, unmatchedOk.unreadAmounts)
  const libUnread = MEAL_LIBRARY.filter(d => !computeMealMacros(d.ingredients.map(parseIngredientLine)).amountsUnderstood).map(d => d.name)
  check('every dish in the meal library is fully understood: the library can never be refused by this rule', libUnread.length === 0, libUnread)

  console.log('\n4. The coach reads the same way: one file, one answer')
  const strip = (s: string) => s.replace(/^\/\/ SYNCED COPY[\s\S]*?\n(?=[^/])/m, '')
  check('ingredient-units.ts in the app and in the edge function are the same file, byte for byte', text('src/lib/ingredient-units.ts') === text('supabase/functions/_shared/ingredient-units.ts'))
  check('food-db.ts in the app and in the edge function are the same file, byte for byte (they had drifted: nine foods, piece weights and the whole-count rule were missing from the coach\'s copy)', text('src/lib/food-db.ts') === text('supabase/functions/_shared/food-db.ts'))
  void strip
  const every = [...TABLE.map(t => t[0]), ...UNREAD.map(u => u[0])]
  const disagree = every.filter(l => {
    const a = computeMealMacros([parseIngredientLine(l)])
    const b = serverFood.computeMealMacros([serverUnits.readIngredientText(l)])
    return a.kcal !== b.kcal || a.coverage !== b.coverage || a.amountsUnderstood !== b.amountsUnderstood || JSON.stringify(a.unmatched) !== JSON.stringify(b.unmatched)
  })
  check('the two copies give the same cost, coverage and verdict on every line above', disagree.length === 0, disagree)
  check('the coach\'s "3 eggs" is 233 kcal, as in the app (it was 5)', serverFood.computeMealMacros([{ name: 'egg', quantity: 3, unit: 'whole' }]).kcal === computeMealMacros([{ name: 'egg', quantity: 3, unit: 'whole' }]).kcal && computeMealMacros([{ name: 'egg', quantity: 3, unit: 'whole' }]).kcal > 200)

  console.log('\n5. The allergen path did not get more permissive')
  const diets = (DIETARY_PREFERENCES as string[]).slice()
  const permissive: string[] = []
  const sample = every.filter(l => l.trim().length > 0)
  for (const l of sample) {
    const parsed = parseIngredientLine(l)
    const entry = lookupIngredient(parsed.name)
    for (const d of diets) {
      const viaReader = validateMealAgainstDiet([parsed], [d])
      if (!viaReader.ok) continue
      // The reader let this line through. The FOOD it resolved to must pass on its own.
      if (!entry) { permissive.push(`${l} [${d}]: allowed with no food resolved`); continue }
      const alone = validateMealAgainstDiet([{ name: entry.name, quantity: 100, unit: 'g' }], [d])
      if (!alone.ok) permissive.push(`${l} [${d}]: allowed, but ${entry.name} is refused`)
    }
  }
  check(`for ${sample.length} lines and ${diets.length} diets, a line is never allowed where its own food is refused, and a line that resolves to no food is never allowed`, permissive.length === 0, permissive.slice(0, 5))
  const dietLines: [string, string, boolean][] = [['1 tin tuna', 'vegan', false], ['1 tin tuna', 'vegetarian', false], ['8 oz chicken breast', 'vegetarian', false], ['1 lb beef mince 5% fat', 'vegetarian', false], ['2 cans chickpeas', 'vegan', true], ['a pinch of salt', 'vegan', false]]
  const verdicts = dietLines.filter(([l, d, want]) => validateMealAgainstDiet([parseIngredientLine(l)], [d]).ok !== want)
  check('the measured verdicts hold: a tin of tuna and 8 oz of chicken are refused for a vegetarian, a pinch of an unknown food is refused for a vegan (fail-closed), chickpeas pass', verdicts.length === 0, verdicts)

  console.log(`\n${ran} checks ran`)
  if (failed > 0) { console.error(`\n${failed} ingredient-unit check(s) failed`); process.exit(1) }
  console.log('\nAll ingredient-unit checks passed.')
}

main().catch(e => { console.error(e); process.exit(1) })
