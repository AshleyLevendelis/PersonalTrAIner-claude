// ---------------------------------------------------------------------------
// test:meal-library-depth: CAN OUR OWN DISHES GIVE EVERY DIET A DEEP POOL? (3 Nov 2026)
//
// Measured that day (measure:meal-library-depth): walking the real "Get more options" path for one person at a
// time, with the meal writer switched off, a meat-eater was handed ten dishes a meal that land her day, while a
// vegan got two to six lunches and dinners, a vegetarian four or five lunches, and a dairy-free eater one in three
// snacks: 32 of 192 meals under seven. The cause was CUISINE, not count: a pool takes one adventurous cuisine a
// meal, and most plant lunches and dinners were Thai, Indian, Japanese and so on. The fix added everyday-cuisine
// plant dishes and dairy-free snacks (the EVERYDAY block in meal-library-data.ts).
//
// This holds the property, not the dishes: every diet at every target can be handed at least seven dishes a meal
// that land her day. And it proves its own detector: the same walk WITHOUT the 3 Nov dishes still finds the thin
// meals, so a pass here cannot be a walk that can no longer see one.
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { libraryDepth } from './measure-meal-library-depth'
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
import { EXOTIC_CUISINES } from '../src/lib/meal-generation'
import { validateMealAgainstDiet } from '../src/lib/diet-rules'
import { parseIngredientLine } from '../src/lib/portion-scaler'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let ran = 0, failures = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.log(`  FAIL: ${label}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`) }
}

async function main() {
  // The 3 Nov dishes, read from their own block in the data file (they are not exported: nothing in the app needs
  // them apart from the rest).
  const src = readFileSync(join(ROOT, 'src/lib/meal-library-data.ts'), 'utf8')
  const start = src.indexOf('const EVERYDAY: RawProposal[] = [')
  const end = start < 0 ? -1 : src.indexOf('\n]\n', start)
  const block = start >= 0 && end > start ? src.slice(start, end) : ''
  const names = new Set([...block.matchAll(/d\('(?:breakfast|lunch|dinner|snack)', '((?:[^'\\]|\\.)*)'/g)].map(m => m[1].replace(/\\'/g, "'")))
  const added = MEAL_LIBRARY.filter(d => names.has(d.name))
  console.log('\n1. The 3 Nov dishes')
  check('the block is found and every name in it is a dish in the library (measured 59)', names.size >= 50 && added.length === names.size, { names: names.size, added: added.length })
  const exotic = added.filter(d => EXOTIC_CUISINES.has(d.cuisine)).map(d => d.name)
  check('...all in everyday cuisines: an adventurous one would hit the one-a-meal cap that made the pools thin', exotic.length === 0, exotic)
  const forNobody = added.filter(d => !['vegetarian', 'dairy-free'].some(diet => validateMealAgainstDiet(d.ingredients.map(parseIngredientLine), [diet]).ok)).map(d => d.name)
  check('...and each one serves a vegetarian or a dairy-free eater, the meals that were thin', forNobody.length === 0, forNobody)

  console.log('\n2. The whole library, one person at a time, eight diets by six targets')
  const rows = await libraryDepth()
  const meals = rows.flatMap(r => Object.entries(r.depth).map(([slot, n]) => ({ at: `${r.target} ${r.diet} ${slot}`, n })))
  check('the walk covered every diet, target and meal (192)', meals.length === 192, meals.length)
  const thin = meals.filter(m => m.n < 7)
  check('every diet at every target can be handed at least SEVEN dishes a meal that land her day (measured minimum 7)', thin.length === 0, thin)
  const full = meals.filter(m => m.n >= 10).length
  check('...and at least 180 of the 192 meals reach the full ten a pool may hold (measured 186)', full >= 180, full)

  console.log('\n3. The detector sees a thin meal: the same walk without the 3 Nov dishes')
  const before = await libraryDepth({ library: MEAL_LIBRARY.filter(d => !names.has(d.name)) })
  const thinBefore = before.flatMap(r => Object.entries(r.depth).filter(([, n]) => n < 7).map(([slot, n]) => `${r.target} ${r.diet} ${slot} ${n}`))
  check('without them at least 20 meals fall under seven (measured 32), so the pass above is the dishes, not a blind walk', thinBefore.length >= 20, thinBefore.length)
  check('...and the vegan lunch is among them at every target (measured 2-4)', ['1700kcal/135g', '2000kcal/150g', '2300kcal/160g', '2700kcal/170g', '3100kcal/180g', '3040kcal/160g'].every(t => thinBefore.some(x => x.startsWith(`${t} vegan lunch `))), thinBefore.filter(x => x.includes('vegan lunch')))
}

await main().catch(e => { failures++; console.log(`  FAIL: the gate threw — ${e instanceof Error ? e.message : e}`) })
console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`${failures} meal-library-depth check(s) failed`); process.exit(1) }
console.log('meal-library-depth: all checks passed')
