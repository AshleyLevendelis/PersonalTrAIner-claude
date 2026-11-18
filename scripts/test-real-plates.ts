// ---------------------------------------------------------------------------
// test:real-plates — a plate somebody would eat, made of food he eats (18 Nov 2026, the Fable pass on meals).
//
// Found by serving four weeks of meals to six people and reading the plates:
//   - bread, wraps and bagels are written in grams so a dish can be fitted to anybody, and nothing asked whether the
//     result was food: 13 g of pitta in a "pitta pocket", 240 g of bagel at breakfast, a 1.8 kg lunch;
//   - dishes are ranked by how well they fit the meal's numbers, and for a muscle-gain target the plant dishes fit
//     best, so 55 of an omnivore's 112 meals were built on tofu, tempeh, vegan sausages or soy yoghurt.
// This holds:
//   1. a food eaten in pieces is served in half or whole pieces, and the card says so
//   2. no more pieces than anybody plates, and no plate over the limit (as it sits on the plate)
//   3. the meal check applies both, and never to portions he typed himself
//   4. a dish built on a stand-in for a food he eats anyway sinks behind every other; not for someone who does not eat
//      that food, and not when he says he likes it
//   5. the real plan builder stops taking them once a meal has enough dishes
// Every check runs every time.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import type { MealSlotName } from '../src/lib/meal-store'
import type { MacroTargets } from '../src/lib/types'

process.env.VITE_SUPABASE_URL = 'http://fake.local'
process.env.VITE_SUPABASE_ANON_KEY = 'anon'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// A fake database and a fake meal writer, so the REAL plan builder can run (the shape test:meal-fresh-fit uses).
type Row = Record<string, unknown>
const db: Record<string, Row[]> = { meal_plan_slots: [] }
function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row | Row[] | null = null
  const exec = () => {
    db[table] ??= []
    if (op === 'insert') { for (const r of Array.isArray(payload) ? payload : [payload]) db[table].push({ id: crypto.randomUUID(), created_at: new Date(0).toISOString(), ...r }); return { data: null, error: null } }
    if (op === 'update') { for (const r of db[table]) if (filters.every(f => f(r))) Object.assign(r, payload); return { data: null, error: null } }
    if (op === 'delete') { db[table] = db[table].filter(r => !filters.every(f => f(r))); return { data: null, error: null } }
    return { data: db[table].filter(r => filters.every(f => f(r))).map(r => ({ ...r })), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    insert: (r: Row | Row[]) => { op = 'insert'; payload = r; return api },
    update: (r: Row) => { op = 'update'; payload = r; return api },
    delete: () => { op = 'delete'; return api },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api },
    in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
    order: () => api,
    maybeSingle: () => api,
    single: () => api,
    then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve(exec()).then(res, rej),
  }
  return api
}
// The writer delivers nothing: the plan is then seeded from the library alone, which is the path under test.
;(globalThis as { fetch: unknown }).fetch = async () => ({ ok: true, status: 200, json: async () => ({ meals: [] }) })

async function main() {
  const ps = await import('../src/lib/portion-scaler')
  const { snapPieces, pieceHint, unrealisticPlate, PLATE_MAX_G, scaleIngredients, kitchenLine } = ps
  const fd = await import('../src/lib/food-db')
  const lib = await import('../src/lib/meal-library')
  const { MEAL_LIBRARY } = await import('../src/lib/meal-library-data')
  const { verifyProposal, computeSlotBudgets } = await import('../src/lib/meal-generation')
  const { buildCustomMealProposal } = await import('../src/lib/custom-meal')
  const g = (name: string, quantity: number, unit = 'g') => ({ name, quantity, unit })

  console.log('\n1. A food eaten in pieces is served in pieces')
  const pitta = snapPieces([g('pitta bread', 13)])[0]
  check('13 g of pitta becomes half a pitta, never a sliver', pitta.quantity === 30 && pieceHint(pitta) === '½ pitta', [pitta, pieceHint(pitta)])
  const bagel = snapPieces([g('bagel', 240)])[0]
  check('240 g of bagel becomes whole and half bagels', Number.isInteger(bagel.quantity / 47.5) || Number.isInteger(bagel.quantity / 45) || /bagel/.test(pieceHint(bagel) ?? ''), [bagel, pieceHint(bagel)])
  check('...said as pieces ("2½ bagels")', /^\d?½? ?bagels?$/.test(pieceHint(bagel) ?? ''), pieceHint(bagel))
  const bread = snapPieces([g('wholemeal bread', 88)])[0]
  check('88 g of bread is a whole number of half slices, said as slices', /^(\d+|\d*½) slices?$/.test(pieceHint(bread) ?? '') && bread.quantity !== 88, [bread, pieceHint(bread)])
  const wrap = snapPieces([g('tortilla wrap', 61)])[0]
  check('a wrap is "1 wrap"', pieceHint(wrap) === '1 wrap', [wrap, pieceHint(wrap)])
  const rice = snapPieces([g('white rice dry', 73), g('chicken breast raw', 163)])
  check('a food not eaten in pieces is left exactly as it was', rice[0].quantity === 73 && rice[1].quantity === 163 && pieceHint(rice[0]) === null && pieceHint(rice[1]) === null, rice)
  check('a line already counted in slices is left alone and has no hint', snapPieces([g('wholemeal bread', 2, 'slice')])[0].quantity === 2 && pieceHint(g('wholemeal bread', 2, 'slice')) === null)
  const scaled = scaleIngredients([g('pitta bread', 60), g('hummus', 40)], 0.3)
  check('scaling a dish down never leaves a sliver of pitta (the scaler snaps too)', scaled[0].quantity >= 30, scaled)
  check('counted measures are said in the plural: "2 slices wholemeal bread", "1 slice", "2 tbsp"', kitchenLine(2, 'slice', 'wholemeal bread') === '2 slices wholemeal bread' && kitchenLine(1, 'slice', 'wholemeal bread') === '1 slice wholemeal bread' && kitchenLine(2, 'tbsp', 'olive oil') === '2 tbsp olive oil' && kitchenLine(1.5, 'slice', 'white bread') === '1½ slices white bread', [kitchenLine(2, 'slice', 'wholemeal bread'), kitchenLine(1.5, 'slice', 'white bread')])

  console.log('\n2. No plate nobody would eat')
  const slices = (n: number) => [g('wholemeal bread', n * 38), g('egg', 2, 'whole')] // a slice is 38 g in the food table
  check('four slices of bread is a plate; five is refused, in words', unrealisticPlate(slices(4), false) === null && /slices/.test(unrealisticPlate(slices(5), false) ?? ''), [unrealisticPlate(slices(4), false), unrealisticPlate(slices(5), false)])
  check('two bagels is a plate; three is not', unrealisticPlate([g('bagel', 190)], false) === null && unrealisticPlate([g('bagel', 285)], false) !== null, [unrealisticPlate([g('bagel', 190)], false), unrealisticPlate([g('bagel', 285)], false)])
  const big = [g('potato boiled', 840), g('chicken breast', 300), g('broccoli', 200)]
  check(`a ${840 + 300 + 200} g plate is over the ${PLATE_MAX_G} g limit`, PLATE_MAX_G === 1100 && /plate/.test(unrealisticPlate(big, false) ?? ''), unrealisticPlate(big, false))
  check('a 700 g plate is fine', unrealisticPlate([g('potato boiled', 350), g('chicken breast', 200), g('broccoli', 150)], false) === null)
  // Dry rice is weighed as it sits on the plate: 200 g dry is about 560 g cooked, so with 400 g of chicken and 300 g of
  // veg it is over; counted dry (200 + 400 + 300 = 900) it would pass.
  const dry = [g('white rice dry', 200), g('chicken breast', 400), g('broccoli', 300)]
  check('dry rice counts at its cooked weight (200 g dry is over half a kilo on the plate)', unrealisticPlate(dry, false) !== null, unrealisticPlate(dry, false))
  // A soup is mostly water: a liquid counts half. 900 ml of broth with 300 g of solids is 750, under the limit.
  const soup = [g('chicken broth', 900, 'ml'), g('chicken breast', 150), g('carrot', 150)]
  check('a liquid counts half (a 900 ml soup with 300 g in it is a bowl, not 1.2 kg of food)', unrealisticPlate(soup, false) === null, unrealisticPlate(soup, false))
  const snackPlate = [g('greek yoghurt 0%', 400), g('banana', 200)]
  check('a snack has half the room: 600 g is refused as a snack and fine as a meal', unrealisticPlate(snackPlate, true) !== null && unrealisticPlate(snackPlate, false) === null, [unrealisticPlate(snackPlate, true), unrealisticPlate(snackPlate, false)])

  console.log('\n3. The meal check applies both, and never to his own portions')
  const big3: MacroTargets = { calories: 3800, protein: 200, carbs: 520, fat: 100 }
  const budgets = computeSlotBudgets(big3, 3, true)
  const log: string[] = []
  const toastie = verifyProposal({ slot: 'lunch', name: 'Egg sandwiches', ingredients: ['132g wholemeal bread', '3 egg', '15g butter'], prep: 'Make it.', cuisine: 'British / Classic' }, 'lunch', budgets.lunch!, [], log)
  check('a sandwich that would need seven slices to reach a 1,370 kcal lunch is refused, never served as a loaf', toastie === null, log.slice(-2))
  const normal: MacroTargets = { calories: 2400, protein: 160, carbs: 270, fat: 75 }
  const nb = computeSlotBudgets(normal, 3, true)
  const bowl = verifyProposal({ slot: 'lunch', name: 'Chicken rice bowl', ingredients: ['210g raw chicken breast', '100g dry white rice', '100g broccoli', '1 tbsp olive oil'], prep: 'Cook it.', cuisine: 'British / Classic' }, 'lunch', nb.lunch!, [], [])
  check('an ordinary chicken and rice bowl at an ordinary lunch is accepted', bowl !== null)
  // A dish already at its meal's size is not scaled at all (the scaler leaves a dish within 3% alone), so only the meal
  // check's own plate step stands between "63g pitta bread" and the card. Measured: 241 kcal against a 240 kcal snack.
  const pittaDish = verifyProposal({ slot: 'snack', name: 'Yoghurt pitta', ingredients: ['63g pitta bread', '105g greek yoghurt 0%', '50g cucumber'], prep: 'Fill it.', cuisine: 'Mediterranean' }, 'snack', nb.snack!, [], [])
  const pittaLine = pittaDish?.ingredients.find(i => /pitta/.test(i.name))
  check('a dish that needs no scaling still serves its pitta whole (63 g becomes one 60 g pitta)', !!pittaDish && pittaLine?.quantity === 60, pittaLine)
  check('...and stays the size of the snack', !!pittaDish && Math.abs(pittaDish.macros.calories - 240) <= 240 * 0.07, pittaDish?.macros)
  // THE REST OF THE DISH MAKES UP WHAT THE PIECES MOVED. 47 g of pitta at exactly the snack's size used to be refused
  // (a whole pitta took it 15% over); now the yoghurt gives the calories back.
  const whole = ps.settlePieces([g('pitta bread', 47), g('greek yoghurt 0%', 150), g('cucumber', 60), g('hummus', 10)])
  const kcalOf = (lines: { name: string; quantity: number; unit: string }[]) => fd.computeMealMacros(lines).kcal
  const beforeKcal = kcalOf([g('pitta bread', 47), g('greek yoghurt 0%', 150), g('cucumber', 60), g('hummus', 10)])
  check('47 g of pitta becomes a whole one and the yoghurt comes down to keep the calories (within 5%)', whole[0].quantity === 60 && whole[1].quantity < 150 && Math.abs(kcalOf(whole) - beforeKcal) / beforeKcal < 0.05, [whole, Math.round(beforeKcal), Math.round(kcalOf(whole))])
  const capped = ps.settlePieces([g('wholemeal bread', 190), g('chicken breast', 150), g('cucumber', 60), g('mayonnaise light', 20)])
  const cappedBefore = kcalOf([g('wholemeal bread', 190), g('chicken breast', 150), g('cucumber', 60), g('mayonnaise light', 20)])
  check('five slices are capped at four and the filling grows to make up the calories', capped[0].quantity <= 152 && capped[1].quantity > 150 && Math.abs(kcalOf(capped) - cappedBefore) / cappedBefore < 0.06, [capped, Math.round(cappedBefore), Math.round(kcalOf(capped))])
  const tooFar = ps.settlePieces([g('wholemeal bread', 400), g('butter', 10)])
  check('...but never by bending the rest of the dish out of shape: ten slices with a knob of butter keeps its butter', tooFar[0].quantity <= 152 && tooFar[1].quantity === 10, tooFar)
  check('an untouched dish comes back as the same list (nothing to settle)', (l => ps.settlePieces(l) === l)([g('white rice dry', 70), g('chicken breast raw', 160)]))
  const own = buildCustomMealProposal({
    rawArgs: { meal_slot: 'breakfast', food_lines: ['250g wholemeal bread', '20g butter'] }, profileId: 'p', todayDate: '2026-11-18',
    targets: normal, mealsPerDay: 3, includeSnacks: true, skipBreakfast: false, dietaryPreferences: [],
  })
  check('250 g of bread he typed himself (six and a half slices) is his business: accepted, at 250 g', own.ok === true && own.payload.option.ingredients.some(i => /bread/.test(i.name) && i.quantity === 250 && i.unit === 'g'), own)

  console.log('\n4. Someone who eats meat is fed meat')
  const dishNamed = (re: RegExp, slot: string) => MEAL_LIBRARY.find(d => d.slot === slot && re.test(d.ingredients.join('|')))!
  const tofu = dishNamed(/\btofu\b/, 'dinner')
  const lentil = MEAL_LIBRARY.find(d => d.slot === 'dinner' && /lentil|chickpea/.test(d.ingredients.join('|')) && !/tofu|tempeh|quorn|seitan|vegan|soy/.test(d.ingredients.join('|')))!
  const soyYog = dishNamed(/soy yoghurt/, 'breakfast')
  check('the fixtures exist in the library', !!tofu && !!lentil && !!soyYog)
  check('a tofu dinner sinks for someone who eats meat', lib.sinksAsStandIn(tofu, { eatsMeat: true, eatsDairy: true }))
  check('...not for a vegetarian, a vegan or a pescatarian (eatsMeat false)', !lib.sinksAsStandIn(tofu, { eatsMeat: false, eatsDairy: true }))
  check('...and not when he has said he likes tofu', !lib.sinksAsStandIn(tofu, { eatsMeat: true, eatsDairy: true, likedFoods: ['tofu'] }))
  check('lentils and chickpeas are ordinary food, never a stand-in', !lib.sinksAsStandIn(lentil, { eatsMeat: true, eatsDairy: true }), lentil?.name)
  check('a soy-yoghurt breakfast sinks for someone who eats dairy, and not for someone dairy-free', lib.sinksAsStandIn(soyYog, { eatsMeat: true, eatsDairy: true }) && !lib.sinksAsStandIn(soyYog, { eatsMeat: true, eatsDairy: false }))
  const muscle: MacroTargets = { calories: 3008, protein: 150, carbs: 413, fat: 84 }
  const mb = computeSlotBudgets(muscle, 3, true)
  const order = (wants: Record<string, unknown>) => lib.chooseFromLibrary(MEAL_LIBRARY, { slot: 'dinner', haveNames: [], haveCuisines: [], rotation: 0, budget: mb.dinner!, ...wants })
  const omni = order({ eatsMeat: true, eatsDairy: true })
  const firstSink = omni.findIndex(d => lib.sinksAsStandIn(d, { eatsMeat: true, eatsDairy: true }))
  const lastReal = omni.map(d => lib.sinksAsStandIn(d, { eatsMeat: true, eatsDairy: true })).lastIndexOf(false)
  const sinkCount = omni.filter(d => lib.sinksAsStandIn(d, { eatsMeat: true, eatsDairy: true })).length
  check('for an omnivore every stand-in dinner comes after every other dinner (a sort key, not a nudge)', sinkCount > 20 && firstSink > lastReal, { sinkCount, firstSink, lastReal })
  const untold = order({})
  const untoldFirst = untold.findIndex(d => lib.sinksAsStandIn(d, { eatsMeat: true, eatsDairy: true }))
  check('...and with nothing said about what he eats, the order is as it was (stand-ins among the first 40)', untoldFirst >= 0 && untoldFirst < 40, untoldFirst)
  const likesTofu = order({ eatsMeat: true, eatsDairy: true, likedFoods: ['tofu'] })
  const tofuAt = likesTofu.findIndex(d => /\btofu\b/.test(d.ingredients.join('|')))
  check('a tofu dish he likes is back among the first dinners', tofuAt >= 0 && tofuAt < 40, tofuAt)

  console.log('\n5. The real plan builder')
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: fakeFrom } as any)
  const { generateMealPools } = await import('../src/lib/meal-generation')
  const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
  const standIns = (pools: Awaited<ReturnType<typeof generateMealPools>>['accepted'], slot: MealSlotName) =>
    (pools[slot] ?? []).filter(o => lib.sinksAsStandIn({ slot, name: o.name, ingredients: o.ingredients.map(i => `${i.quantity}${i.unit} ${i.name}`), prep: '', cuisine: '' }, { eatsMeat: true, eatsDairy: true })).length
  db.meal_plan_slots = []
  const omniPlan = await generateMealPools({ profileId: 'omni', targets: muscle, dietaryPreferences: [], mealsPerDay: 3, includeSnacks: true, skipBreakfast: false })
  const sizes = SLOTS.map(s => (omniPlan.accepted[s] ?? []).length)
  const sinks = SLOTS.map(s => standIns(omniPlan.accepted, s))
  check('an omnivore on a muscle-gain target gets a deep plan (30 or more dishes in every meal)', sizes.every(n => n >= lib.STAND_IN_FLOOR), sizes)
  check('...with no dish built on a meat or dairy stand-in in it', sinks.every(n => n === 0), { sizes, sinks })
  db.meal_plan_slots = []
  const vegPlan = await generateMealPools({ profileId: 'veg', targets: muscle, dietaryPreferences: ['vegetarian'], mealsPerDay: 3, includeSnacks: true, skipBreakfast: false })
  const vegSinks = SLOTS.map(s => standIns(vegPlan.accepted, s))
  check('a vegetarian on the same target still gets the tofu, tempeh and Quorn dishes (10 or more dinners)', vegSinks[2] >= 10, vegSinks)
  const gen = strip(readFileSync('src/lib/meal-generation.ts', 'utf8'))
  check('the builder says who eats meat and dairy from the diet, never a default', /eatsMeat: !params\.dietaryPreferences\.some\(p => p === 'vegetarian' \|\| p === 'vegan' \|\| p === 'pescatarian'\)/.test(gen) && /eatsDairy: !params\.dietaryPreferences\.some\(p => p === 'vegan' \|\| p === 'dairy-free' \|\| p === 'paleo'\)/.test(gen))

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.log(`${failures} FAILED`); process.exitCode = 1; return }
  console.log('A plate is pieces and a weight somebody eats, and a meat-eater is fed meat.')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
