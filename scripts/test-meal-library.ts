/**
 * test:meal-library — more meals, from our own library, and never a weaker route in.
 *
 * Ashley, 30 Sep 2026, asked for hundreds more meals and chose "write our own,
 * and check them" (docs/plans/meal-library.md). The library carries ingredient
 * lines and a method, no macros; every dish it offers goes through the same
 * verifyProposal a generated dish does, for the person asking.
 *
 *   1. THE DATA: every line readable and costable, every method free of
 *      amounts, every dish fits its meal, names unique, cuisines the app's
 *      own, enough of every meal and of every diet, and each dish servable.
 *   2. THE CHOOSER: pure and deterministic; what she has is never offered
 *      again; her cuisines and likes first; a spread of cuisines; one exotic
 *      per meal; a rotation that changes the order between asks.
 *   3. THE WIRING: the library goes first when she asks for more, the writer
 *      only for the shortfall, nothing new for a fresh plan, and no dish is
 *      accepted by a route that skips a check.
 *   4. THE REAL LIBRARY, end to end, for real targets and real diets, with the
 *      meal writer switched off: it alone can fill a pool.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
import { chooseFromLibrary, fitDishToBudget } from '../src/lib/meal-library'
import { verifyProposal, computeSlotBudgets, methodSafeToShow, checkSlotAppropriate, EXOTIC_CUISINES, type RawProposal } from '../src/lib/meal-generation'
import { newFromDate } from '../src/lib/meal-new-from'
import { parseIngredientLine } from '../src/lib/portion-scaler'
import { computeMealMacros } from '../src/lib/food-db'
import { validateMealAgainstDiet } from '../src/lib/diet-rules'
import { strictLineProblems, servability, TARGET_GRID } from './measure-meal-library'
import type { MealSlotName } from '../src/lib/meal-store'

process.env.VITE_SUPABASE_URL = 'http://fake.local'
process.env.VITE_SUPABASE_ANON_KEY = 'anon'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (f: string) => strip(readFileSync(join(ROOT, f), 'utf8'))

let ran = 0
let failed = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failed++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
const inSlot = (s: MealSlotName) => MEAL_LIBRARY.filter(d => d.slot === s)
const FAMILIAR = ['British / Classic', 'Italian', 'American / Diner Classic', 'Mexican', 'Mediterranean (Greek, Lebanese, Turkish)']
const APP_CUISINES = new Set([...FAMILIAR, ...EXOTIC_CUISINES])

async function main() {
  // -------------------------------------------------------------------------
  console.log('\n1. The data')
  const bad: string[] = []
  for (const d of MEAL_LIBRARY) for (const line of d.ingredients) {
    const p = strictLineProblems(line)
    if (p.length) bad.push(`${d.name}: "${line}" — ${p.join('; ')}`)
  }
  check('every ingredient line is grams or a plain count, and a food the app can cost', bad.length === 0, bad.slice(0, 4))
  const uncovered = MEAL_LIBRARY.filter(d => computeMealMacros(d.ingredients.map(parseIngredientLine)).coverage < 1).map(d => d.name)
  check('...and every dish is costed in full (coverage 100%)', uncovered.length === 0, uncovered.slice(0, 4))
  const amountMethods = MEAL_LIBRARY.filter(d => d.prep.trim().length === 0 || methodSafeToShow(d.prep) !== d.prep.trim()).map(d => d.name)
  check('every dish has a method, and none names an amount the app would rescale', amountMethods.length === 0, amountMethods.slice(0, 4))
  const misfit = MEAL_LIBRARY.filter(d => checkSlotAppropriate(d.name, d.prep, d.slot as MealSlotName, d.ingredients.length) !== null).map(d => d.name)
  check('every dish reads as the meal it is filed under', misfit.length === 0, misfit.slice(0, 4))
  const names = MEAL_LIBRARY.map(d => d.name.trim().toLowerCase())
  const dupes = names.filter((n, i) => names.indexOf(n) !== i)
  check('names are unique across the whole library', dupes.length === 0, dupes.slice(0, 4))
  check('every dish carries one of the app\'s own cuisines', MEAL_LIBRARY.every(d => APP_CUISINES.has(d.cuisine)), [...new Set(MEAL_LIBRARY.filter(d => !APP_CUISINES.has(d.cuisine)).map(d => d.cuisine))])
  check('every slot is one of the four', MEAL_LIBRARY.every(d => (SLOTS as string[]).includes(d.slot)))
  check('there are enough dishes: 150 in all, and per meal 30 / 40 / 45 / 20', MEAL_LIBRARY.length >= 150 && inSlot('breakfast').length >= 30 && inSlot('lunch').length >= 40 && inSlot('dinner').length >= 45 && inSlot('snack').length >= 20,
    SLOTS.map(s => [s, inSlot(s).length]))
  check('snacks stay simple: five ingredients at most', inSlot('snack').every(d => d.ingredients.length <= 5), inSlot('snack').filter(d => d.ingredients.length > 5).map(d => d.name))
  const cuisines = new Map<string, number>()
  for (const d of MEAL_LIBRARY) cuisines.set(d.cuisine, (cuisines.get(d.cuisine) ?? 0) + 1)
  check('at least 15 cuisines are represented', cuisines.size >= 15, cuisines.size)
  check('no cuisine is more than 30% of any meal',
    SLOTS.every(s => { const c = new Map<string, number>(); for (const d of inSlot(s)) c.set(d.cuisine, (c.get(d.cuisine) ?? 0) + 1); return Math.max(...c.values()) <= Math.ceil(inSlot(s).length * 0.3) }),
    SLOTS.map(s => { const c = new Map<string, number>(); for (const d of inSlot(s)) c.set(d.cuisine, (c.get(d.cuisine) ?? 0) + 1); return [s, Math.max(...c.values()), inSlot(s).length] }))

  // DIETS are derived from the ingredients by the app's own check, never stored.
  const DIETS = ['vegetarian', 'vegan', 'pescatarian', 'dairy-free', 'gluten-free', 'nut-free', 'egg-free']
  const dietCounts = DIETS.map(diet => SLOTS.map(s => inSlot(s).filter(d => validateMealAgainstDiet(d.ingredients.map(parseIngredientLine), [diet]).ok).length))
  check('every diet has at least four dishes in every meal', dietCounts.every(row => row.every(n => n >= 4)), DIETS.map((d, i) => [d, dietCounts[i]]))
  check('vegetarians have at least eight dishes in each of breakfast, lunch and dinner', dietCounts[0].slice(0, 3).every(n => n >= 8), dietCounts[0])

  // The line check must be able to FAIL: ounces, pounds, kilos, tins and pinches read as a count of something and cost a few grams.
  const badLines = ['8 oz chicken breast', '1 lb beef mince', '1 kg potatoes', '1 tin tuna', '2 cans chickpeas', '1 pinch salt', '150g chicken breast', '2 egg', '1 tbsp olive oil']
  check('the line reader refuses the units the app misreads, and accepts the plain ones it was built for', badLines.slice(0, 6).every(l => strictLineProblems(l).length > 0) && badLines.slice(6).every(l => strictLineProblems(l).length === 0), badLines.map(l => [l, strictLineProblems(l).length]))

  const served = MEAL_LIBRARY.map(d => ({ d, ...servability(d) }))
  const never = served.filter(x => x.pass === 0).map(x => x.d.name)
  const weak = served.filter(x => x.pass / Math.max(1, x.of) < 0.5).map(x => `${x.d.name} ${x.pass}/${x.of}`)
  check('no dish is one nobody can be served (across six real targets and two meal shapes)', never.length === 0, never)
  check('...and none is served to fewer than half of them', weak.length === 0, weak)
  check('the library is servable on average: 85% or better in every meal', SLOTS.every(s => {
    const r = served.filter(x => x.d.slot === s)
    return r.reduce((a, x) => a + x.pass / Math.max(1, x.of), 0) / r.length >= 0.85
  }))
  check('the grid the servability is read on is wide: six targets from 1,700 to 3,100 kcal', TARGET_GRID.length === 6 && TARGET_GRID[0].targets.calories <= 1700 && Math.max(...TARGET_GRID.map(g => g.targets.calories)) >= 3100)

  // -------------------------------------------------------------------------
  console.log('\n2. The chooser')
  const mk = (slot: string, name: string, cuisine: string, prep = 'Cook it.', ingredients = ['180g chicken breast', '200g white rice cooked', '100g broccoli']): RawProposal => ({ slot, name, cuisine, prep, ingredients })
  const lib: RawProposal[] = [
    mk('lunch', 'Thai one', 'Thai'), mk('lunch', 'Thai two', 'Thai'), mk('lunch', 'Italian one', 'Italian'),
    mk('lunch', 'Italian two', 'Italian'), mk('lunch', 'Mexican one', 'Mexican'), mk('lunch', 'British one', 'British / Classic'),
    mk('lunch', 'Korean one', 'Korean'), mk('dinner', 'Dinner only', 'Italian'), mk('lunch', 'Quick bowl', 'Mexican', 'Ready in 10 minutes.'),
    mk('lunch', 'Salmon bowl', 'Japanese', 'Bake it.', ['170g salmon', '100g white rice cooked']),
  ]
  const ask = (w: Partial<Parameters<typeof chooseFromLibrary>[1]> = {}) =>
    chooseFromLibrary(lib, { slot: 'lunch', haveNames: [], haveCuisines: [], exoticCuisines: EXOTIC_CUISINES, ...w })
  const first = ask()
  check('only the asked-for meal is offered', first.length > 0 && first.every(d => d.slot === 'lunch') && !first.some(d => d.name === 'Dinner only'), first.map(d => d.name))
  check('the same ask gives the same answer', JSON.stringify(ask({ rotation: 3 })) === JSON.stringify(ask({ rotation: 3 })))
  const orders = new Set([0, 1, 2, 3, 4, 5, 6, 7].map(r => ask({ rotation: r }).map(d => d.name).join('|')))
  check('a different rotation changes the order, so each ask shows different dishes', orders.size > 1, orders.size)
  const without = ask({ haveNames: ['Thai one', '  ITALIAN ONE '] })
  check('a dish she already has is never offered again, whatever its case or spacing', !without.some(d => d.name === 'Thai one' || d.name === 'Italian one') && without.some(d => d.name === 'Thai two'), without.map(d => d.name))
  check('the limit is respected', ask({ limit: 3 }).length === 3)
  check('a cuisine she named comes first', ask({ favoriteCuisines: ['Korean'] })[0].name === 'Korean one' && ask({ favoriteCuisines: ['italian'] })[0].cuisine === 'Italian', ask({ favoriteCuisines: ['Korean'] }).map(d => d.name))
  check('a food she likes lifts a dish above an equal one', ask({ likedFoods: ['salmon'] })[0].name === 'Salmon bowl', ask({ likedFoods: ['salmon'] }).map(d => d.name))
  check('quick first when she has said she is short of time', ask({ cookingTime: 'quick' })[0].name === 'Quick bowl', ask({ cookingTime: 'quick' }).map(d => d.name))
  const spread = ask({ limit: 4 }).map(d => d.cuisine)
  check('four picks are four different cuisines when four exist', new Set(spread).size === 4, spread)
  const haveItalian = ask({ haveCuisines: ['Italian'], limit: 3 }).map(d => d.cuisine)
  check('a cuisine she already has in this meal is put behind the ones she does not', !haveItalian.includes('Italian'), haveItalian)
  const exoticPicks = ask({ limit: 6 }).filter(d => EXOTIC_CUISINES.has(d.cuisine))
  check('at most one exotic cuisine among the first picks once one is chosen: the rest sink behind the familiar', ask({ limit: 5 }).slice(0, 4).filter(d => EXOTIC_CUISINES.has(d.cuisine)).length <= 1 && exoticPicks.length >= 1, ask({ limit: 6 }).map(d => d.cuisine))
  const haveExotic = ask({ haveCuisines: ['Thai'], limit: 4 }).map(d => d.cuisine)
  check('...and when she already has one, the next picks are familiar', haveExotic.every(c => !EXOTIC_CUISINES.has(c)), haveExotic)
  // A FIXTURE WHERE THE VARIETY BONUS BINDS: twelve dishes, three cuisines, four of each, so ties broken by name alone would repeat a cuisine at most rotations.
  const crowd: RawProposal[] = ['Italian', 'Mexican', 'British / Classic'].flatMap(c => ['a', 'b', 'c', 'd'].map(n => mk('lunch', `${c} ${n}`, c)))
  const crowdAsk = (w: Partial<Parameters<typeof chooseFromLibrary>[1]> = {}) => Array.from({ length: 12 }, (_, r) => chooseFromLibrary(crowd, { slot: 'lunch', haveNames: [], haveCuisines: [], exoticCuisines: EXOTIC_CUISINES, rotation: r, ...w }))
  check('three picks from three cuisines are three different cuisines, at every rotation', crowdAsk().every(r => new Set(r.slice(0, 3).map(d => d.cuisine)).size === 3), crowdAsk().map(r => r.slice(0, 3).map(d => d.cuisine[0]).join('')))
  check('...and once she has one of them, the first two picks are the other two, at every rotation', crowdAsk({ haveCuisines: ['Italian'] }).every(r => r.slice(0, 2).every(d => d.cuisine !== 'Italian') && new Set(r.slice(0, 2).map(d => d.cuisine)).size === 2))
  const loveMix: RawProposal[] = [mk('lunch', 'Slow roast', 'Italian', 'Roast slowly.'), mk('lunch', 'Slow stew', 'Italian', 'Simmer gently.'), mk('lunch', 'Slow bake', 'Italian', 'Bake it.'), mk('lunch', 'Slow braise', 'Italian', 'Braise it.'), mk('lunch', 'Quick wrap', 'Italian', 'Roll it. Ready in 10 minutes.')]
  const firstFor = (cookingTime: 'quick' | 'loves_cooking' | undefined) => Array.from({ length: 16 }, (_, r) => chooseFromLibrary(loveMix, { slot: 'lunch', haveNames: [], haveCuisines: [], rotation: r, cookingTime })[0].name)
  check('someone who loves cooking is never led with the ten-minute dish', firstFor('loves_cooking').every(n => n !== 'Quick wrap'), firstFor('loves_cooking'))
  check('...which is a choice, not an accident of the names: with no preference it leads at some rotation', firstFor(undefined).some(n => n === 'Quick wrap'), firstFor(undefined))
  const real = chooseFromLibrary(MEAL_LIBRARY, { slot: 'dinner', haveNames: [], haveCuisines: [], exoticCuisines: EXOTIC_CUISINES, limit: 8, rotation: 1 })
  check('on the real library eight dinners span at least five cuisines', new Set(real.map(d => d.cuisine)).size >= 5, real.map(d => d.cuisine))
  check('asking again with the first eight taken gives eight different dinners', (() => {
    const again = chooseFromLibrary(MEAL_LIBRARY, { slot: 'dinner', haveNames: real.map(d => d.name), haveCuisines: real.map(d => d.cuisine), exoticCuisines: EXOTIC_CUISINES, limit: 8, rotation: 9 })
    return again.length === 8 && again.every(d => !real.some(r => r.name === d.name))
  })())

  // -------------------------------------------------------------------------
  console.log('\n2b. Fitting a dish to her meal (measured 30 Sep 2026: raw dishes carried 1.2-2.1x a meal\'s protein)')
  const GRID4 = TARGET_GRID.filter(g => g.targets.calories <= 2700)
  const leading = (t: string) => t.replace(/^\s*\d+(?:\.\d+)?/, '')
  const roleOf = (line: string): 'P' | 'C' | 'F' => {
    const l = computeMealMacros([parseIngredientLine(line)]).lines[0]
    const unit = l.input.unit.toLowerCase()
    if (!l.entry || !l.macros || (unit !== 'g' && unit !== 'ml')) return 'F'
    if (l.entry.category === 'protein' || (l.entry.category === 'dairy' && l.entry.per100g.protein >= 8)) return 'P'
    return l.entry.category === 'carb' ? 'C' : 'F'
  }
  let shapeBroken: string[] = [], fixedMoved: string[] = [], outOfRange: string[] = [], finiteButRefused: string[] = [], noInfinite = 0, impure: string[] = []
  let fitted = 0, fitCases = 0
  for (const g of TARGET_GRID) {
    for (const shape of [{ n: 3, sn: true }, { n: 3, sn: false }]) {
      const budgets = computeSlotBudgets(g.targets, shape.n, shape.sn)
      for (const d of MEAL_LIBRARY) {
        const b = budgets[d.slot as MealSlotName]
        if (!b) continue
        fitCases++
        const before = JSON.stringify(d)
        const f = fitDishToBudget(d, b)
        if (JSON.stringify(d) !== before) impure.push(d.name)
        if (JSON.stringify(fitDishToBudget(d, b)) !== JSON.stringify(f)) impure.push(d.name + ' (not repeatable)')
        if (f.loss === Infinity) { noInfinite++; if (f.dish !== d) shapeBroken.push(d.name + ' (failed fit must hand the dish back as written)') }
        if (f.dish.ingredients.length !== d.ingredients.length || f.dish.ingredients.some((t, i) => leading(t) !== leading(d.ingredients[i]))) shapeBroken.push(d.name)
        d.ingredients.forEach((t, i) => {
          const role = roleOf(t)
          const was = parseIngredientLine(t).quantity
          const now = parseIngredientLine(f.dish.ingredients[i]).quantity
          if (role === 'F' && now !== was) fixedMoved.push(`${d.name}: ${t} -> ${f.dish.ingredients[i]}`)
          const lo = role === 'P' ? 0.55 : 0.5, hi = role === 'P' ? 1.35 : 2.0
          if (role !== 'F' && (now < was * lo - 5 || now > was * hi + 5)) outOfRange.push(`${d.name}: ${t} -> ${f.dish.ingredients[i]}`)
        })
        if (f.loss !== Infinity) {
          fitted++
          if (!verifyProposal(f.dish, d.slot as MealSlotName, b, [], [])) finiteButRefused.push(`${d.name} @ ${g.label}`)
        }
      }
    }
  }
  check('a fit only ever changes the amount on a line: same lines, same foods, same order', shapeBroken.length === 0, shapeBroken.slice(0, 5))
  check('...and only protein foods and carb foods move: vegetables, fats, sauces and counted items stay as written', fixedMoved.length === 0, fixedMoved.slice(0, 5))
  check('...by at most the range a cook would call the same dish (protein 0.55-1.35x, carbs 0.5-2x)', outOfRange.length === 0, outOfRange.slice(0, 5))
  check('a fit never mutates the library and gives the same answer twice', impure.length === 0, impure.slice(0, 5))
  check('a dish the fit says it fitted is ALWAYS accepted by verifyProposal: it proved itself through the scaler', fitted > 1000 && finiteButRefused.length === 0, { fitted, refused: finiteButRefused.slice(0, 5) })
  check('the fit is not vacuous: most dishes at most targets are fitted (under one case in ten cannot be)', noInfinite / fitCases < 0.1 && fitted / fitCases > 0.9, { noInfinite, fitCases })

  const median = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : NaN }
  const shapeAt = (slot: MealSlotName, g: typeof TARGET_GRID[number], fit: boolean) => {
    const b = computeSlotBudgets(g.targets, 3, true)[slot]!
    const out: { p: number; c: number; f: number }[] = []
    for (const d of inSlot(slot)) {
      const o = verifyProposal(fit ? fitDishToBudget(d, b).dish : d, slot, b, [], [])
      if (o) out.push({ p: o.macros.protein / b.protein, c: o.macros.carbs / Math.max(1, b.carbs), f: o.macros.fat / Math.max(1, b.fat) })
    }
    return out
  }
  const good = (x: { p: number; c: number; f: number }) => x.p <= 1.2 && Math.abs(x.c - 1) <= 0.3 && Math.abs(x.f - 1) <= 0.3
  const mainstream = TARGET_GRID.find(g => g.label === '2300kcal/160g')!
  const medians = (['lunch', 'dinner'] as MealSlotName[]).map(sl => ({ sl, raw: median(shapeAt(sl, mainstream, false).map(x => x.p)), fit: median(shapeAt(sl, mainstream, true).map(x => x.p)) }))
  check('at a mainstream target the typical lunch and dinner carry under 1.2x the meal\'s protein once fitted, and more than 1.25x as written', medians.every(m => m.fit <= 1.2 && m.raw >= 1.25), medians)
  const goodCounts = GRID4.map(g => ({ t: g.label, bre: shapeAt('breakfast', g, true).filter(good).length, lun: shapeAt('lunch', g, true).filter(good).length, din: shapeAt('dinner', g, true).filter(good).length, sna: shapeAt('snack', g, true).filter(good).length }))
  check('across the four mainstream targets every meal keeps dishes that FIT it (protein within 1.2x, carbs and fat within 30%): 5 breakfasts, 15 lunches, 15 dinners, 3 snacks', goodCounts.every(c => c.bre >= 5 && c.lun >= 15 && c.din >= 15 && c.sna >= 3), goodCounts)

  // DAIRY THAT IS MOSTLY PROTEIN MOVES WITH THE PROTEIN: a quark bowl at a small breakfast is not 400 g of quark.
  const smallBreakfast = computeSlotBudgets(TARGET_GRID[0].targets, 3, true).breakfast!
  const quarkBowl = mk('breakfast', 'Fit quark bowl', 'British / Classic', 'Spoon into a bowl.', ['400g quark', '100g mixed berries', '30g granola'])
  const quarkFit = fitDishToBudget(quarkBowl, smallBreakfast)
  check('a quark bowl fitted to a small breakfast gets less quark, and the berries and granola stay as written', quarkFit.loss !== Infinity && parseIngredientLine(quarkFit.dish.ingredients[0]).quantity < 400 && quarkFit.dish.ingredients[1] === quarkBowl.ingredients[1], quarkFit.dish.ingredients)
  // A LINE NEVER FITS DOWN TO NOTHING: the smallest protein or carb line it writes is 5 g.
  const tinyLine = mk('lunch', 'Fit tuna plate', 'Italian', 'Grill it.', ['230g chicken breast', '120g white rice cooked', '6g canned tuna', '100g broccoli', '1 tbsp olive oil'])
  const tinyFit = fitDishToBudget(tinyLine, computeSlotBudgets(mainstream.targets, 3, true).lunch!)
  const fitChicken = parseIngredientLine(tinyFit.dish.ingredients[0]).quantity
  check('...and the fixture binds: the chicken is brought right down, so a 6 g line would fall under 5 g at that factor', tinyFit.loss !== Infinity && fitChicken <= 230 * 0.7, tinyFit.dish.ingredients)
  check('...yet no line it writes is under 5 g', tinyFit.dish.ingredients.every(t => parseIngredientLine(t).quantity >= 1) && parseIngredientLine(tinyFit.dish.ingredients[2]).quantity >= 5, tinyFit.dish.ingredients)
  const sums = { bre: 0, lun: 0, din: 0, sna: 0 }
  goodCounts.forEach(c => { sums.bre += c.bre; sums.lun += c.lun; sums.din += c.din; sums.sna += c.sna })
  check('taken together the four mainstream targets keep the shape the fit reaches: measured 33 breakfasts, 97 lunches, 111 dinners, 21 snacks fit; at least 28, 90, 100 and 18 must', sums.bre >= 28 && sums.lun >= 90 && sums.din >= 100 && sums.sna >= 18, sums)

  // THE CHOOSER USES IT: a dish near her meal's shape rises above one far from it, and what it hands back is the fitted dish.
  const neatDish = mk('lunch', 'Fit neat', 'Italian', 'Grill it.', ['170g chicken breast', '220g white rice cooked', '100g broccoli', '1 tbsp olive oil'])
  const skewDish = mk('lunch', 'Fit skew', 'Italian', 'Grill it.', ['60g chicken breast', '100g broccoli', '120ml olive oil'])
  const lunchB = computeSlotBudgets(mainstream.targets, 3, true).lunch!
  const both = [skewDish, neatDish]
  const ranked = [0, 1, 2, 3, 4, 5, 6, 7].map(r => chooseFromLibrary(both, { slot: 'lunch', haveNames: [], haveCuisines: [], rotation: r, budget: lunchB }).map(d => d.name))
  check('with her meal\'s budget the dish that can be fitted outranks the one that cannot, at every rotation', ranked.every(r => r[0] === 'Fit neat'), ranked)
  const asked = chooseFromLibrary(both, { slot: 'lunch', haveNames: [], haveCuisines: [], budget: lunchB })
  const plain = chooseFromLibrary(both, { slot: 'lunch', haveNames: [], haveCuisines: [] })
  check('...what comes back is the FITTED dish (amounts moved) when a budget is given, and the library\'s own dish when none is', asked.find(d => d.name === 'Fit neat')!.ingredients.join() !== neatDish.ingredients.join() && plain.every(d => d === neatDish || d === skewDish))
  check('...and a dish the fit cannot rescue is still returned, last: verifyProposal, not the chooser, decides', asked.length === 2 && asked[1].name === 'Fit skew')

  // -------------------------------------------------------------------------
  console.log('\n3. The wiring: the library first, the writer only for the shortfall')
  type Row = Record<string, unknown>
  const db: Record<string, Row[]> = { meal_plan_slots: [] }
  const fakeFrom = (table: string) => {
    const filters: ((r: Row) => boolean)[] = []
    let op: 'select' | 'insert' | 'delete' | 'update' = 'select'
    let payload: Row | Row[] | null = null
    const exec = () => {
      db[table] ??= []
      if (op === 'insert') { for (const r of Array.isArray(payload) ? payload : [payload]) db[table].push({ id: crypto.randomUUID(), ...r }); return { data: null, error: null } }
      if (op === 'update') { for (const r of db[table]) if (filters.every(f => f(r))) Object.assign(r, payload); return { data: null, error: null } }
      if (op === 'delete') { db[table] = db[table].filter(r => !filters.every(f => f(r))); return { data: null, error: null } }
      return { data: db[table].filter(r => filters.every(f => f(r))).map(r => ({ ...r })), error: null }
    }
    const api: Record<string, unknown> = {
      select: () => api, insert: (r: Row | Row[]) => { op = 'insert'; payload = r; return api },
      update: (r: Row) => { op = 'update'; payload = r; return api }, delete: () => { op = 'delete'; return api },
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return api }, in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return api },
      order: () => api, maybeSingle: () => api, single: () => api,
      then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve(exec()).then(res, rej),
    }
    return api
  }
  let requests = 0
  let lastAsk: { slot: string; count: number }[] = []
  let modelOn = true
  let n = 0
  ;(globalThis as { fetch: unknown }).fetch = async (_u: string, init?: { body?: string }) => {
    requests++
    if (!modelOn) throw new Error('the meal writer is switched off')
    const body = JSON.parse(init?.body ?? '{}') as { slots: { slot: string; count: number }[] }
    lastAsk = body.slots
    const meals = body.slots.flatMap(({ slot, count }) => Array.from({ length: count }, () => ({
      slot, name: `Writer ${slot} bowl ${++n}`, cuisine: 'British / Classic', prep: 'Grill, steam, serve.',
      ingredients: ['200g chicken breast', '220g white rice cooked', '1 tbsp olive oil', '100g broccoli'],
    })))
    return { ok: true, status: 200, json: async () => ({ meals }) }
  }
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: fakeFrom } as any)
  const { generateMealPools } = await import('../src/lib/meal-generation')
  const { getPools } = await import('../src/lib/meal-store')
  const targets = { calories: 2200, protein: 150, carbs: 240, fat: 70 }
  const base = { targets, dietaryPreferences: [] as string[], mealsPerDay: 3, includeSnacks: false, onlySlots: ['lunch' as MealSlotName] }
  const fixture = [
    mk('lunch', 'Fixture lunch A', 'Italian', 'Grill it. Ready in 10 minutes.', ['190g chicken breast', '200g white rice cooked', '100g broccoli', '1 tbsp olive oil']),
    mk('lunch', 'Fixture lunch B', 'Mexican', 'Grill it.', ['200g chicken breast', '180g white rice cooked', '100g sweetcorn', '1 tbsp olive oil']),
    mk('lunch', 'Fixture lunch C', 'Korean', 'Grill it.', ['210g chicken breast', '200g white rice cooked', '100g bok choy', '1 tbsp olive oil']),
  ]

  requests = 0
  const r1 = await generateMealPools({ ...base, profileId: 'w1', poolSize: 2, appendToExisting: true, servedFrom: '2026-10-01', library: fixture })
  check('asking for more takes library dishes, and the meal writer is never asked when they fill it', r1.accepted.lunch?.length === 2 && requests === 0 && r1.accepted.lunch.every(o => o.name.startsWith('Fixture lunch')), { got: r1.accepted.lunch?.map(o => o.name), requests })
  check('...each stamped with the first day it may be served, like any added dish', r1.accepted.lunch!.every(o => newFromDate(o) === '2026-10-01'), r1.accepted.lunch?.map(o => o.tags))
  check('...and written to her pool', ((await getPools('w1')).lunch ?? []).length === 2)
  check('...with the macros the APP worked out, not numbers from the library',
    r1.accepted.lunch!.every(o => { const m = computeMealMacros(o.ingredients); return Math.abs(m.kcal - o.macros.calories) <= 1 }) && r1.accepted.lunch!.every(o => Math.abs(o.macros.calories - computeSlotBudgets(targets, 3, false).lunch!.calories) / computeSlotBudgets(targets, 3, false).lunch!.calories <= 0.07))

  requests = 0
  const r2 = await generateMealPools({ ...base, profileId: 'w2', poolSize: 3, appendToExisting: true, library: [fixture[0]] })
  const writerAsked = lastAsk.find(s => s.slot === 'lunch')?.count
  check('when the library cannot fill it, the writer is asked, and only for the shortfall (two more, and two spare)', requests === 1 && writerAsked === 4, { requests, writerAsked })
  check('...and what comes back is the library dish plus the writer\'s', r2.accepted.lunch?.length === 3 && r2.accepted.lunch[0].name === 'Fixture lunch A' && r2.accepted.lunch.filter(o => o.name.startsWith('Writer')).length === 2, r2.accepted.lunch?.map(o => o.name))

  requests = 0
  const r3 = await generateMealPools({ ...base, profileId: 'w3', poolSize: 2, appendToExisting: true, library: false })
  check('library: false asks only the meal writer', requests >= 1 && r3.accepted.lunch?.length === 2 && r3.accepted.lunch.every(o => o.name.startsWith('Writer')), { requests, got: r3.accepted.lunch?.map(o => o.name) })

  requests = 0
  const r4 = await generateMealPools({ ...base, profileId: 'w4', poolSize: 2, library: fixture })
  check('a fresh plan (not "more") never draws from the library, even when one is offered', requests >= 1 && r4.accepted.lunch?.every(o => o.name.startsWith('Writer')), r4.accepted.lunch?.map(o => o.name))

  // A DISH SHE ALREADY HAS IS NOT OFFERED AGAIN.
  await generateMealPools({ ...base, profileId: 'w5', poolSize: 1, appendToExisting: true, library: [fixture[0]] })
  requests = 0
  const r5 = await generateMealPools({ ...base, profileId: 'w5', poolSize: 2, appendToExisting: true, library: [fixture[0], fixture[1]] })
  check('a dish already in her pool is not offered again', !r5.accepted.lunch?.some(o => o.name === 'Fixture lunch A') && r5.accepted.lunch?.some(o => o.name === 'Fixture lunch B'), r5.accepted.lunch?.map(o => o.name))

  // EVERY RULE STILL APPLIES TO A LIBRARY DISH.
  requests = 0
  const r6 = await generateMealPools({ ...base, dietaryPreferences: ['vegan'], profileId: 'w6', poolSize: 2, appendToExisting: true, library: fixture })
  check('a vegan is never offered the chicken dishes: the diet check decides, and the writer is then asked', !(r6.accepted.lunch ?? []).some(o => o.name.startsWith('Fixture')) && requests >= 1, { got: r6.accepted.lunch?.map(o => o.name), requests })
  requests = 0
  const r7 = await generateMealPools({ ...base, dislikedFoods: ['chicken'], profileId: 'w7', poolSize: 2, appendToExisting: true, library: fixture })
  check('a food she avoids keeps every dish with it out', !(r7.accepted.lunch ?? []).some(o => o.name.startsWith('Fixture')) && requests >= 1, r7.accepted.lunch?.map(o => o.name))
  // A DISH TOO BIG FOR HER MEAL IS RE-PORTIONED FIRST; ONE NO RE-PORTIONING CAN RESCUE IS REFUSED BY THE SCALING RULE.
  const lunchBudget = computeSlotBudgets(targets, 3, false).lunch!
  const hugeKcal = mk('lunch', 'Fixture feast', 'Italian', 'Cook.', ['900g chicken breast', '900g white rice cooked'])
  const r8 = await generateMealPools({ ...base, profileId: 'w8', poolSize: 1, appendToExisting: true, library: [hugeKcal], })
  const feast = (r8.accepted.lunch ?? []).find(o => o.name === 'Fixture feast')
  check('a dish far too big for her meal is brought down to it, not refused: the protein and carb foods are re-portioned', !!feast && Math.abs(feast.macros.calories - lunchBudget.calories) / lunchBudget.calories <= 0.07 && feast.macros.protein >= lunchBudget.protein, feast ? { kcal: feast.macros.calories, protein: feast.macros.protein, budget: lunchBudget } : r8.accepted.lunch?.map(o => o.name))
  const oilFeast = mk('lunch', 'Fixture oil feast', 'Italian', 'Cook.', ['300g olive oil', '200g broccoli'])
  const tinySalad = mk('lunch', 'Fixture leaf salad', 'Italian', 'Toss.', ['150g lettuce', '100g cucumber'])
  const r8b = await generateMealPools({ ...base, profileId: 'w8b', poolSize: 2, appendToExisting: true, library: [oilFeast, tinySalad] })
  check('a dish re-portioning cannot rescue (all fixed foods, far too big or far too small) is refused by the same scaling rule', !(r8b.accepted.lunch ?? []).some(o => o.name.startsWith('Fixture')), r8b.accepted.lunch?.map(o => o.name))
  const fitFail = fitDishToBudget(oilFeast, lunchBudget)
  check('...and the fit itself says so: loss is infinite and the dish comes back as written', fitFail.loss === Infinity && fitFail.dish === oilFeast)

  // A LIBRARY THAT CANNOT BE READ COSTS HER NOTHING: the meal writer is asked for everything, as before.
  requests = 0
  const brokenLibrary = { filter() { throw new Error('the library could not be read') } } as unknown as RawProposal[]
  let r8d: Awaited<ReturnType<typeof generateMealPools>> | null = null
  let r8dError = ''
  try { r8d = await generateMealPools({ ...base, profileId: 'w8d', poolSize: 2, appendToExisting: true, library: brokenLibrary }) } catch (e) { r8dError = e instanceof Error ? e.message : String(e) }
  check('an unreadable library is contained: the writer fills the meal and the reason is logged', !!r8d && requests >= 1 && r8d.accepted.lunch?.length === 2 && r8d.accepted.lunch.every(o => o.name.startsWith('Writer')) && r8d.rejectionLog.some(l => l.includes('[library] could not be read')), { requests, threw: r8dError, got: r8d?.accepted.lunch?.map(o => o.name) })
  // WHAT SHE ALREADY HAS IN THE MEAL STEERS THE NEXT PICK: a sixth Italian lunch is not the answer when she has one.
  await generateMealPools({ ...base, profileId: 'w10', poolSize: 1, appendToExisting: true, library: [fixture[0]] })
  const italians = ['a', 'b', 'c', 'd', 'e', 'f'].map(n => mk('lunch', `Fixture Italian ${n}`, 'Italian'))
  const r10 = await generateMealPools({ ...base, profileId: 'w10', poolSize: 1, appendToExisting: true, library: [...italians, mk('lunch', 'Fixture Mexican', 'Mexican')] })
  check('her pool\'s cuisine is behind the ones she does not have: she has Italian, so the one added is the Mexican', r10.accepted.lunch?.length === 1 && r10.accepted.lunch[0].name === 'Fixture Mexican', r10.accepted.lunch?.map(o => o.name))

  // THE LIBRARY DISH IS FITTED TO HER MEAL BEFORE IT IS OFFERED, NOT ONLY SCALED.
  const heavy = mk('lunch', 'Fixture protein plate', 'Italian', 'Grill it.', ['230g chicken breast', '120g white rice cooked', '100g broccoli', '1 tbsp olive oil'])
  const r8c = await generateMealPools({ ...base, profileId: 'w8c', poolSize: 1, appendToExisting: true, library: [heavy] })
  const plate = (r8c.accepted.lunch ?? []).find(o => o.name === 'Fixture protein plate')
  const heavyAsWritten = verifyProposal(heavy, 'lunch', lunchBudget, [], [])
  check('...(the fixture binds: as written and scaled to her meal it would carry over 1.4x its protein)', !!heavyAsWritten && heavyAsWritten.macros.protein >= lunchBudget.protein * 1.4, heavyAsWritten?.macros.protein)
  check('a protein-heavy library dish reaches her at her meal\'s shape (protein under 1.2x the meal\'s), not scaled up with its protein still double', !!plate && plate.macros.protein <= lunchBudget.protein * 1.2 && plate.macros.protein >= lunchBudget.protein, plate ? { protein: plate.macros.protein, budget: lunchBudget.protein } : r8c.accepted.lunch?.map(o => o.name))

  modelOn = false
  const r9 = await generateMealPools({ ...base, profileId: 'w9', poolSize: 2, appendToExisting: true, library: fixture })
  check('with the meal writer unreachable, the library still supplies the dishes', r9.accepted.lunch?.length === 2, r9.accepted.lunch?.length)
  modelOn = true

  // -------------------------------------------------------------------------
  console.log('\n4. The real library, with the meal writer switched off')
  modelOn = false
  const PROFILES: { label: string; targets: typeof targets }[] = TARGET_GRID.filter((_, i) => [0, 2, 5].includes(i)).map(g => ({ label: g.label, targets: g.targets }))
  const DIET_SETS: string[][] = [[], ['vegetarian'], ['vegan'], ['gluten-free'], ['dairy-free'], ['nut-free'], ['pescatarian']]
  let served4 = 0
  const shortfalls: string[] = []
  const breaches: string[] = []
  for (const p of PROFILES) for (const diet of DIET_SETS) {
    const id = `real-${p.label}-${diet.join('+') || 'none'}`
    requests = 0
    const res = await generateMealPools({ profileId: id, targets: p.targets, dietaryPreferences: diet, mealsPerDay: 3, includeSnacks: true, poolSize: 4, appendToExisting: true })
    const budgets = computeSlotBudgets(p.targets, 3, true)
    for (const slot of SLOTS) {
      const got = res.accepted[slot] ?? []
      served4 += got.length
      if (got.length < 4) shortfalls.push(`${id} ${slot} ${got.length}/4`)
      for (const o of got) {
        const b = budgets[slot]!
        const m = computeMealMacros(o.ingredients)
        const diets = validateMealAgainstDiet(o.ingredients, diet)
        if (!diets.ok) breaches.push(`${id} ${slot} "${o.name}" breaks ${diet.join(',')}`)
        if (Math.abs(m.kcal - b.calories) / b.calories > 0.0701 || m.protein < b.protein) breaches.push(`${id} ${slot} "${o.name}" ${m.kcal}kcal/${m.protein}g vs ${b.calories}/${b.protein}`)
      }
    }
    if (requests !== 0) shortfalls.push(`${id} asked the writer ${requests} times`)
  }
  check('for three real targets and seven diets, the library alone fills four dishes in every meal', shortfalls.length === 0 && served4 === PROFILES.length * DIET_SETS.length * 16, shortfalls.slice(0, 6))
  check('every dish offered meets the person\'s diet, stays within seven percent of the meal\'s calories and reaches its protein', breaches.length === 0, breaches.slice(0, 4))
  modelOn = true

  // -------------------------------------------------------------------------
  console.log('\n5. What the source must keep true')
  const gen = read('src/lib/meal-generation.ts')
  const fn = gen.slice(gen.indexOf('export async function generateMealPools'))
  const loopAt = fn.indexOf('for (let round = 0; round < MAX_GENERATION_ROUNDS')
  const libAt = fn.indexOf('chooseFromLibrary(')
  check('the library round comes before the rounds that ask the writer', libAt > 0 && loopAt > 0 && libAt < loopAt, [libAt, loopAt])
  const libBlock = fn.slice(Math.max(0, fn.lastIndexOf('if (params.appendToExisting', libAt)), libAt)
  check('...and only when she is asking for more, and only when not switched off', /params\.appendToExisting\s*&&\s*params\.library\s*!==\s*false/.test(libBlock), libBlock.slice(0, 120))
  check('...and each slot is asked for with that slot\'s own budget, so the dishes are fitted to the meal they are offered for', /budget:\s*budgets\[slot\]/.test(fn.slice(libAt, libAt + 900)), fn.slice(libAt, libAt + 900))
  const askBlock = fn.slice(libAt, libAt + 900)
  check('...and is told what she already has and the exotic cap; considerProposal enforces both as well, so only the order would show a slip, and order is all this pins', /haveNames:\s*existing\.map\(o\s*=>\s*o\.name\)/.test(askBlock) && /exoticCuisines:\s*EXOTIC_CUISINES/.test(askBlock), askBlock)
  check('...every library dish goes through the one function every proposal goes through', /for \(const dish of candidates\) considerProposal\(dish\)/.test(fn) && /for \(const proposal of proposals\) considerProposal\(proposal\)/.test(fn))
  check('...and that function is the only place a proposal is verified', (fn.match(/verifyProposal\(/g) ?? []).length === 1, (fn.match(/verifyProposal\(/g) ?? []).length)
  const chooser = read('src/lib/meal-library.ts')
  check('the chooser is deterministic: no Math.random', !/Math\.random/.test(chooser))
  check('...and does no verifying or writing of its own', !/verifyProposal|\.insert\(|\.upsert\(|supabase/.test(chooser))
  const data = read('src/lib/meal-library-data.ts')
  check('the library carries no macros: nothing in it names calories, protein or a macros field', !/\bmacros\b|\bcalories\b|\bkcal\b|protein\s*:/i.test(data.replace(/whey protein powder|vegan protein powder/g, '')), data.match(/\bmacros\b|\bcalories\b|\bkcal\b/i))
  const staticImports: string[] = []
  for (const f of ['src/lib/meal-generation.ts', 'src/lib/meal-library.ts', 'src/App.tsx', 'src/lib/meal-top-up.ts']) {
    if (/from\s+['"]\.\/meal-library-data['"]|from\s+['"]@\/lib\/meal-library-data['"]/.test(read(f))) staticImports.push(f)
  }
  check('the data is loaded on demand only: nothing imports it statically from the app', staticImports.length === 0, staticImports)
  check('...by one dynamic import', /import\(\s*['"]\.\/meal-library-data['"]\s*\)/.test(chooser))

  console.log(`\n${ran} checks ran`)
  if (failed > 0) {
    console.error(`\n${failed} meal-library check(s) failed`)
    process.exit(1)
  }
  console.log('\nAll meal-library checks passed.')
}

main().catch(e => { console.error(e); process.exit(1) })
