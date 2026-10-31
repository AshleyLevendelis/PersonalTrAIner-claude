// ---------------------------------------------------------------------------
// test:one-state — every ingredient is counted, shown and shopped in one state, raw or dry
// (runs 7-10, H36 / M64, 18 Oct 2026). docs/plans/one-state-raw-dry.md.
//
// Sam's Bolognese read 456 kcal at dinner and 818 as the next day's leftover lunch, and his list bought "pasta
// cooked", "white rice cooked", "potato boiled" and "sweet potato baked 190g". Her fix: "every ingredient is
// counted, shown and shopped in the same state (raw/dry)", and her ruling on a line: "Dry, plus cooked hint". Holds:
//   1. a cooked line becomes its raw or dry twin at the weight carrying the same energy; anything else is untouched;
//   2. the twins: potatoes have a raw one, every pair goes both ways, a bare potato is boiled;
//   3. the card's hint ("about 200g cooked") is worked out from the same figures and is never part of the line;
//   4. a stored meal reads back raw and dry (the one read), at the same energy;
//   5. a new dish is verified raw and dry;
//   6. the leftover lunch is costed by the dinner's own rule (the 456 / 818 case);
//   7. the list buys raw and dry under plain names;
//   8. the meal writer is told to weigh as bought.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

// --- A stub of the one query readPools makes ----------------------------------
type StoredRow = { slot: string; pool_index: number; name: string; ingredients: unknown; macros: { kcal: number; protein: number; carbs: number; fat: number }; tags: string[] }
let rows: StoredRow[] = []
const stub = { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) }) }) }
const { setSupabaseClient } = await import('../src/lib/supabase')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
setSupabaseClient(stub as any)

async function main() {
  const { asWeighed, asWeighedLines, cookedHint } = await import('../src/lib/as-weighed')
  const { FOOD_DB, lookupIngredient, computeMealMacros, weighedTwinOf, cookedTwinOf, stateOf } = await import('../src/lib/food-db')
  const { readPools } = await import('../src/lib/meal-store')
  const { verifyProposal } = await import('../src/lib/meal-generation')
  const { leftoverLunchFrom } = await import('../src/lib/meal-rotation')
  const { resolveGroceryTarget } = await import('../src/lib/grocery-store')

  const g = (name: string, quantity: number, unit = 'g') => ({ name, quantity, unit })
  const kcalOf = (l: { name: string; quantity: number; unit: string }) => computeMealMacros([l]).kcal
  const weighedState = (l: { name: string }) => { const e = lookupIngredient(l.name); return e ? stateOf(e) : undefined }

  console.log('\n1. A cooked line becomes its raw or dry twin, holding the same protein or starch')
  const cases: [ReturnType<typeof g>, string, number][] = [
    [g('white rice', 200), 'white rice dry', 70],
    [g('cooked spaghetti', 150), 'pasta dry', 60],
    [g('chicken breast', 150), 'chicken breast raw', 205],
    [g('potato boiled', 250), 'potato raw', 285],
    [g('sweet potato baked', 190), 'sweet potato raw', 200],
    [g('cod', 150), 'cod raw', 195],
  ]
  for (const [line, twin, grams] of cases) {
    const w = asWeighed(line)
    check(`"${line.quantity}g ${line.name}" is weighed as ${grams}g of ${twin} ("${w.quantity}${w.unit} ${w.name}")`, w.quantity === grams && w.unit === 'g' && lookupIngredient(w.name)?.name === twin, w)
  }
  const lines = cases.map(c => c[0])
  // COOKING MOVES WATER, NOT PROTEIN OR STARCH: the nutrient a food holds most of is carried over, and energy follows
  // within a few percent wherever the two foods' own figures agree. Over every pair in the table, one gram each.
  const mainOf = (e: { per100g: { protein: number; carbs: number } }) => (e.per100g.protein >= e.per100g.carbs ? 'protein' : 'carbs') as 'protein' | 'carbs'
  const macroOf = (l: { name: string; quantity: number; unit: string }, k: 'protein' | 'carbs' | 'kcal') => (computeMealMacros([l]) as unknown as Record<string, number>)[k]
  const pairs = FOOD_DB.filter(e => weighedTwinOf(e)).map(e => ({ e, l: g(e.name, 300) }))
  // To within half a kitchen step (2.5 g of the twin): the converted weight is rounded the way every amount is.
  const halfStep = (e: typeof FOOD_DB[number]) => 2.5 * (weighedTwinOf(e)!.per100g as unknown as Record<string, number>)[mainOf(e)] / 100 + 0.1
  const mainDrift = pairs.filter(({ e, l }) => Math.abs(macroOf(asWeighed(l), mainOf(e)) - macroOf(l, mainOf(e))) > halfStep(e))
  check('the nutrient each food holds most of is carried over (protein for meat and fish, carbs for grains, potatoes, lentils)', pairs.length >= 20 && mainDrift.length === 0, mainDrift.map(({ e, l }) => [e.name, macroOf(l, mainOf(e)), macroOf(asWeighed(l), mainOf(e))]))
  const energyDrift = pairs.filter(({ e, l }) => e.name !== 'chicken thigh' && Math.abs(kcalOf(asWeighed(l)) / kcalOf(l) - 1) > 0.07).map(({ e, l }) => [e.name, kcalOf(l), kcalOf(asWeighed(l))])
  check('...and energy follows within 7% for every pair whose figures agree (all but chicken thigh)', energyDrift.length === 0, energyDrift)
  const thigh = g('chicken thigh', 150)
  check('chicken thigh, whose USDA cooked and raw figures disagree, keeps its protein and loses energy (named, not hidden)', Math.abs(macroOf(asWeighed(thigh), 'protein') - macroOf(thigh, 'protein')) < 1 && kcalOf(asWeighed(thigh)) < kcalOf(thigh) * 0.85, [kcalOf(thigh), kcalOf(asWeighed(thigh))])
  check('her own words are kept, with the state in front ("cooked spaghetti" -> "dry spaghetti", "grilled chicken breast" -> "raw chicken breast")',
    asWeighed(g('cooked spaghetti', 150)).name === 'dry spaghetti' && asWeighed(g('grilled chicken breast', 150)).name === 'raw chicken breast' && asWeighed(g('boiled potatoes', 250)).name === 'raw potatoes',
    [asWeighed(g('cooked spaghetti', 150)).name, asWeighed(g('grilled chicken breast', 150)).name, asWeighed(g('boiled potatoes', 250)).name])
  check('the table\'s own words read as the twin\'s own name ("lentils red" -> "dry red lentils")', asWeighed(g('lentils red', 100)).name === 'dry red lentils', asWeighed(g('lentils red', 100)))
  check('when her own words would reach a different food, the twin\'s own name is used ("wholemeal pasta" is wholewheat, never plain pasta; "cooked basmati")',
    lookupIngredient(asWeighed(g('wholemeal pasta', 150)).name)?.name === 'wholewheat pasta dry' && lookupIngredient(asWeighed(g('cooked basmati', 180)).name)?.name === 'basmati rice dry',
    [asWeighed(g('wholemeal pasta', 150)).name, asWeighed(g('cooked basmati', 180)).name])
  check('a counted amount is weighed first ("1 medium potato" -> grams of raw potato)', (() => { const w = asWeighed(g('potato', 1, 'medium')); return w.unit === 'g' && w.quantity > 100 && lookupIngredient(w.name)?.name === 'potato raw' })(), asWeighed(g('potato', 1, 'medium')))
  const untouched = [g('chickpeas', 100), g('beef mince 5%', 153), g('salmon', 120), g('blueberries', 100), g('olive oil', 1, 'tbsp'), g('dry white rice', 70), g('raw chicken breast', 177)]
  check('a food with no twin, or already raw or dry, is left exactly as written', untouched.every(l => JSON.stringify(asWeighed(l)) === JSON.stringify(l)), untouched.filter(l => JSON.stringify(asWeighed(l)) !== JSON.stringify(l)).map(l => [l, asWeighed(l)]))
  const unmeasurable = FOOD_DB.filter(e => weighedTwinOf(e)).map(e => asWeighed(g(e.name, 173))).filter(w => w.quantity >= 20 && w.quantity % 5 !== 0)
  check('every converted weight is in the app\'s kitchen steps (the nearest 5 g from 20 g up)', unmeasurable.length === 0, unmeasurable)
  check('converting twice is converting once', lines.every(l => JSON.stringify(asWeighed(asWeighed(l))) === JSON.stringify(asWeighed(l))))
  check('an unread line is never converted, even one whose amount looks like grams', JSON.stringify(asWeighed({ ...g('white rice', 200), unread: true })) === JSON.stringify({ ...g('white rice', 200), unread: true }), asWeighed({ ...g('white rice', 200), unread: true }))
  const everyTwin = FOOD_DB.filter(e => weighedTwinOf(e))
  const notReached = everyTwin.filter(e => { const w = asWeighed(g(e.name, 100)); return lookupIngredient(w.name)?.name !== weighedTwinOf(e)!.name })
  check('every cooked food with a twin, written in the table\'s own name, reaches that twin', everyTwin.length >= 20 && notReached.length === 0, notReached.map(e => [e.name, asWeighed(g(e.name, 100)).name]))

  console.log('\n2. The twins')
  const potatoRaw = FOOD_DB.find(f => f.name === 'potato raw')
  check('a raw potato exists, with raw figures (USDA 11352: 77 kcal, 17.5 g carbs per 100 g)', !!potatoRaw && potatoRaw.per100g.kcal === 77 && potatoRaw.per100g.carbs === 17.5 && stateOf(potatoRaw) === 'raw', potatoRaw)
  check('boiled and baked potato are weighed raw, baked sweet potato as raw sweet potato', ['potato boiled', 'potato baked'].every(n => weighedTwinOf(FOOD_DB.find(f => f.name === n)!)?.name === 'potato raw') && weighedTwinOf(FOOD_DB.find(f => f.name === 'sweet potato baked')!)?.name === 'sweet potato raw')
  check('a raw potato\'s cooked twin is boiled (a bare "potato" is boiled)', !!potatoRaw && cookedTwinOf(potatoRaw)?.name === 'potato boiled' && lookupIngredient('potato')?.name === 'potato boiled')
  check('"raw sweet potato" is raw sweet potato (it used to cost as baked)', lookupIngredient('raw sweet potato')?.name === 'sweet potato raw', lookupIngredient('raw sweet potato')?.name)
  const oneWay = everyTwin.filter(e => { const t = weighedTwinOf(e)!; const back = cookedTwinOf(t); return !back || weighedTwinOf(back)?.name !== t.name || !['raw', 'dry'].includes(stateOf(t) ?? '') })
  check('every pair goes both ways, and every twin is raw or dry', oneWay.length === 0, oneWay.map(e => e.name))
  const tagDrift = everyTwin.filter(e => { const t = weighedTwinOf(e)!; return JSON.stringify(Object.keys(e.tags).filter(k => (e.tags as Record<string, boolean>)[k]).sort()) !== JSON.stringify(Object.keys(t.tags).filter(k => (t.tags as Record<string, boolean>)[k]).sort()) })
  check('a twin carries the same diet tags as its cooked food (a state is never a different food for an allergy)', tagDrift.length === 0, tagDrift.map(e => [e.name, e.tags, weighedTwinOf(e)!.tags]))

  console.log('\n3. The card\'s hint')
  check('"70g dry white rice" shows "about 200g cooked"', cookedHint(g('dry white rice', 70)) === 'about 200g cooked', cookedHint(g('dry white rice', 70)))
  check('"177g raw chicken breast" shows "about 130g cooked"', cookedHint(g('raw chicken breast', 177)) === 'about 130g cooked', cookedHint(g('raw chicken breast', 177)))
  check('the hint and the conversion agree: a converted line hints at the weight it was written as, to 10 g', cases.every(([l]) => Math.abs(parseInt((cookedHint(asWeighed(l)) ?? '').replace(/\D+/g, ''), 10) - l.quantity) <= 10), cases.map(([l]) => [l.quantity, cookedHint(asWeighed(l))]))
  check('no hint on a food with no cooked twin, or still written cooked', [g('olive oil', 10), g('blueberries', 100), g('white rice', 200), g('beef mince 5%', 153)].every(l => cookedHint(l) === null))
  const card = strip(readFileSync('src/components/MealPlan.tsx', 'utf8'))
  // RE-ANCHORED 31 Oct 2026 (design 3b): one shared ingredient span in the recipe sheet, so one hint; the property
  // is that EVERY hint sits right after the display line, and none anywhere else.
  check('the card draws the hint beside the line, never in the line handed to the edit builders', (card.match(/\{displayIngredient\(ing\)\}<CookedHint ing=\{ing\} \/>/g) ?? []).length >= 1 && (card.match(/\{displayIngredient\(ing\)\}<CookedHint ing=\{ing\} \/>/g) ?? []).length === (card.match(/<CookedHint ing=\{ing\} \/>/g) ?? []).length &&!/function formatIngredient[^}]*cookedHint/.test(card) && /data-ingredient-row=\{line\}/.test(card))

  console.log('\n4. A stored meal reads back raw and dry, at the same energy')
  const cookedLines = [g('chicken breast', 150), g('white rice cooked', 200), g('broccoli', 100), g('olive oil', 10)]
  const was = computeMealMacros(cookedLines)
  rows = [{ slot: 'dinner', pool_index: 0, name: 'Chicken and rice', ingredients: cookedLines, macros: { kcal: was.kcal, protein: was.protein, carbs: was.carbs, fat: was.fat }, tags: [] }]
  const read = (await readPools('p')).pools.dinner?.[0]
  check('its lines read raw and dry', !!read && read.ingredients.every(l => weighedState(l) !== 'cooked') && read.ingredients.some(l => weighedState(l) === 'raw') && read.ingredients.some(l => weighedState(l) === 'dry'), read?.ingredients)
  check('...at nearly the same energy (within 2%)', !!read && Math.abs(read.macros.calories - was.kcal) <= was.kcal * 0.02, [read?.macros.calories, was.kcal])
  check('...and its numbers are its own raw and dry lines\' numbers', !!read && JSON.stringify(read.macros) === JSON.stringify((() => { const c = computeMealMacros(asWeighedLines(cookedLines)); return { calories: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat } })()), read?.macros)
  check('the stored row itself is not rewritten (worked out again on every read)', JSON.stringify(rows[0].ingredients) === JSON.stringify(cookedLines))

  console.log('\n5. A new dish is verified raw and dry')
  const budget = { calories: 700, protein: 45, carbs: 70, fat: 25 }
  const proposal = { slot: 'dinner', name: 'Chicken, potatoes and greens', cuisine: 'British / Classic', prep: 'Boil the potatoes. Roast the chicken.', ingredients: ['150g chicken breast', '250g potato boiled', '100g green beans', '1 tbsp olive oil'] }
  const log: string[] = []
  const opt = verifyProposal(proposal, 'dinner', budget, [], log)
  check('it is accepted', !!opt, log)
  check('...with every line that has a twin weighed raw (no line left cooked)', !!opt && !opt.ingredients.some(l => { const e = lookupIngredient(l.name); return !!e && !!weighedTwinOf(e) }) && opt.ingredients.some(l => lookupIngredient(l.name)?.name === 'potato raw') && opt.ingredients.some(l => lookupIngredient(l.name)?.name === 'chicken breast raw'), opt?.ingredients)
  check('...and its numbers are those lines\' own', !!opt && Math.abs(opt.macros.calories - computeMealMacros(opt.ingredients).kcal) <= 1, [opt?.macros, opt && computeMealMacros(opt.ingredients).kcal])

  console.log('\n6. The leftover lunch is costed by the dinner\'s own rule (the 456 / 818 case)')
  // A Bolognese whose lines today's table cannot cost well (a sauce it does not know): the dinner keeps its stored
  // numbers whole, so its leftover must too, scaled, never its half-costed lines.
  const bolo = [g('beef mince 5%', 153), g('dry spaghetti', 64), g('house bolognese sauce', 250)]
  // Stored as it was costed when the spaghetti was read as cooked (about a third of its energy): far below what its
  // lines now cost, which is what made 456 at dinner and 818 as lunch.
  const boloStored = { calories: 300, protein: 35, carbs: 30, fat: 8 }
  const boloCost = computeMealMacros(bolo)
  check('the fixture is under pressure: the dinner\'s lines cost under the floor a new meal must meet, and well above its stored numbers', boloCost.coverage < 0.8 && boloCost.kcal > boloStored.calories * 1.3, [boloCost.coverage, boloCost.kcal])
  const lunchBudget = { calories: 420, protein: 38, carbs: 45, fat: 9 }
  const dinner = { slot: 'dinner', name: 'Spaghetti bolognese', ingredients: bolo, macros: boloStored, tags: [] } as never
  const lunch = leftoverLunchFrom(dinner, lunchBudget)
  const perKcalDinner = boloStored.calories / boloStored.protein
  check('the lunch is made', !!lunch)
  check('...in the dinner\'s own proportions: kcal per gram of protein as the dinner reads (never re-costed from half its lines)', !!lunch && Math.abs(lunch.macros.calories / lunch.macros.protein - perKcalDinner) < 0.5, { lunch: lunch?.macros, dinner: boloStored })
  check('...and the size its budget asked for (the dinner\'s numbers, scaled), never the half-costed lines scaled', !!lunch && Math.abs(lunch.macros.calories - lunchBudget.calories) <= lunchBudget.calories * 0.05, [lunch?.macros.calories, lunchBudget.calories])
  const good = [g('beef mince 5%', 153), g('dry spaghetti', 64), g('tomato passata', 200)]
  const goodCost = computeMealMacros(good)
  const lunch2 = leftoverLunchFrom({ slot: 'dinner', name: 'Spaghetti bolognese', ingredients: good, macros: { calories: goodCost.kcal, protein: goodCost.protein, carbs: goodCost.carbs, fat: goodCost.fat }, tags: [] } as never, { calories: Math.round(goodCost.kcal * 0.7), protein: Math.floor(goodCost.protein * 0.7), carbs: Math.round(goodCost.carbs * 0.7), fat: Math.round(goodCost.fat * 0.7) })
  check('a dinner whose lines cost well gives a lunch costed from its own scaled lines', !!lunch2 && Math.abs(lunch2.macros.calories - computeMealMacros(lunch2.ingredients).kcal) <= 1, [lunch2?.macros, lunch2 && computeMealMacros(lunch2.ingredients).kcal])

  console.log('\n7. The list buys raw and dry, under plain names')
  const potatoRow = resolveGroceryTarget('potato boiled'), bakedRow = resolveGroceryTarget('baked potato'), rawRow = resolveGroceryTarget('raw potato')
  check('boiled, baked and raw potato are one "potatoes" row, bought raw', [potatoRow, bakedRow, rawRow].every(r => r.displayName === 'potatoes' && r.canonicalKey === potatoRow.canonicalKey) && rawRow.asBoughtPerRecipeGram === 1 && potatoRow.asBoughtPerRecipeGram > 1, [potatoRow, bakedRow, rawRow].map(r => [r.displayName, r.canonicalKey, r.asBoughtPerRecipeGram]))
  check('"190g sweet potato baked" is about 199 g of "sweet potato" to buy', resolveGroceryTarget('sweet potato baked').displayName === 'sweet potato' && Math.round(190 * resolveGroceryTarget('sweet potato baked').asBoughtPerRecipeGram) === 200, resolveGroceryTarget('sweet potato baked'))
  check('cooked chicken is bought raw: 150 g cooked is 207 g raw, the card\'s 205 g to within its kitchen step', Math.round(150 * resolveGroceryTarget('chicken breast').asBoughtPerRecipeGram) === 207 && asWeighed(g('chicken breast', 150)).quantity === 205, resolveGroceryTarget('chicken breast').asBoughtPerRecipeGram)
  const listOff = FOOD_DB.filter(e => weighedTwinOf(e)).filter(e => Math.abs(Math.round(300 * resolveGroceryTarget(e.name).asBoughtPerRecipeGram) - asWeighed(g(e.name, 300)).quantity) > 3).map(e => [e.name, Math.round(300 * resolveGroceryTarget(e.name).asBoughtPerRecipeGram), asWeighed(g(e.name, 300)).quantity])
  check('for every food with a twin, the list buys what the card says to weigh (300 g cooked, within the card\'s 5 g kitchen step)', listOff.length === 0, listOff)
  const COOKING = /\b(cooked|boiled|baked|roasted|steamed)\b/i
  const cookedNamed = FOOD_DB.filter(e => stateOf(e) === 'cooked').map(e => resolveGroceryTarget(e.name).displayName).filter(n => COOKING.test(n))
  check('no food weighed cooked is shopped under a cooking word (boiled, baked, roasted, steamed, cooked)', FOOD_DB.filter(e => stateOf(e) === 'cooked').length >= 30 && cookedNamed.length === 0, cookedNamed)

  const { MEAL_LIBRARY } = await import('../src/lib/meal-library-data')
  const { parseIngredientLine } = await import('../src/lib/portion-scaler')
  const libCooked = MEAL_LIBRARY.flatMap(d => d.ingredients.filter(t => { const p = parseIngredientLine(t); return asWeighed(p) !== p }).map(t => `${d.name}: ${t}`))
  check('our own library is written as bought: no line in its 290 dishes is a cooked weight with a raw or dry twin', MEAL_LIBRARY.length >= 290 && libCooked.length === 0, libCooked.slice(0, 5))

  console.log('\n8. The meal writer is told to weigh as bought')
  const writer = readFileSync('supabase/functions/generate-meals/index.ts', 'utf8')
  check('it asks for grains and lentils dry, potatoes, meat and fish raw', /Weigh as it is bought: pasta, rice, noodles, couscous, quinoa and lentils DRY, potatoes, meat and fish RAW/.test(writer))
  check('...and no longer says a weight is the cooked weight unless it says otherwise', !/COOKED weight unless/.test(writer) && !/"200g cooked basmati rice"/.test(writer))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exit(1) }
  console.log('Every line is counted, shown and shopped raw or dry.')
}
main().catch(e => { console.error(e); process.exit(1) })
