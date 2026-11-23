/**
 * test:simple-meals — a plan is simple food unless someone has said they love cooking (docs/plans/simple-meals.md).
 *
 * Ashley, 23 Nov 2026: "The meals are too complicated. Users are required to become gourmet chefs." Measured that day:
 * 53% of the meals a new plan served were simple and 20% of its snacks were one or two foods.
 *
 *   1. What "simple" means (meal-effort.ts): five main foods or fewer, a snack two; seasonings and oil are not foods;
 *      read off the FOOD, so "bell pepper" counts and "black pepper" does not; a step that makes it a recipe.
 *   2. The library holds enough simple dishes, snacks above all.
 *   3. The chooser puts every simple dish ahead of every recipe, unless she loves cooking.
 *   4. The share rule (mayAddComplicated), at the values where it binds.
 *   5. A NEW plan made through the app's own generateMealPools holds what the rule says, per cooking answer.
 *   6. The meal writer is asked for simple food with plain names; the choices say what they mean.
 */
import { readFileSync } from 'node:fs'
import { isSimpleDish, mainFoodCount, namesOfLines, mayAddComplicated, THIN_MEAL } from '../src/lib/meal-effort'
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
import { chooseFromLibrary } from '../src/lib/meal-library'
import { COOKING_TIME_OPTIONS } from '../src/lib/onboarding-slots'
import type { MealSlotName } from '../src/lib/meal-store'
import type { PoolOption, RawProposal } from '../src/lib/meal-generation'
import type { CookingTimePreference } from '../src/lib/types'

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`) }
}
const simple = (d: RawProposal) => isSimpleDish(d.slot, namesOfLines(d.ingredients), d.prep)
const mk = (slot: string, name: string, ingredients: string[], prep = 'Cook and serve.', cuisine = 'British / Classic'): RawProposal => ({ slot, name, ingredients, prep, cuisine })

async function main() {
  console.log('1. What a simple dish is')
  const five = mk('dinner', 'Five', ['150g raw chicken breast', '60g dry white rice', '100g broccoli', '80g bell pepper', '1 tbsp soy sauce', '1 tsp olive oil', '1 tsp paprika', '1 pinch salt'])
  check('five main foods with oil, paprika and salt beside them is simple (seasonings and oil are not foods)', mainFoodCount(namesOfLines(five.ingredients)) === 5 && simple(five), mainFoodCount(namesOfLines(five.ingredients)))
  const six = mk('dinner', 'Six', [...five.ingredients, '60g onion'])
  check('...and a sixth food makes it a recipe', !simple(six), mainFoodCount(namesOfLines(six.ingredients)))
  const bell = mk('dinner', 'Bell', ['150g raw chicken breast', '60g dry white rice', '100g broccoli', '80g bell pepper', '60g onion', '1 tsp black pepper'])
  check('"bell pepper" is a food and "black pepper" is not: read off the food, never the word', mainFoodCount(namesOfLines(bell.ingredients)) === 5, mainFoodCount(namesOfLines(bell.ingredients)))
  check('a snack of two foods is simple', simple(mk('snack', 'S2', ['200g greek yoghurt 0%', '100g mixed berries'])))
  check('...and of three is not', !simple(mk('snack', 'S3', ['200g greek yoghurt 0%', '100g mixed berries', '20g granola'])))
  check('...while three foods make a simple LUNCH (the limit is the meal\'s)', simple(mk('lunch', 'L3', ['200g greek yoghurt 0%', '100g mixed berries', '20g granola'])))
  const shaped = mk('dinner', 'Patties', ['150g turkey mince', '60g dry white rice', '100g broccoli'], 'Mix the turkey, shape into patties and grill.')
  check('a dish to shape is a recipe however few its foods', !simple(shaped))
  check('...and so is a batter, a dough and a ladle-at-a-time risotto', ['Whisk the eggs into a batter.', 'Knead the dough.', 'Add the stock a ladle at a time.'].every(p => !simple(mk('dinner', 'X', ['2 egg'], p))))
  check('...but grilling, roasting and boiling are not', ['Grill the chicken.', 'Roast on a tray for 20 minutes.', 'Boil the potatoes.'].every(p => simple(mk('dinner', 'X', ['150g raw chicken breast', '250g raw potato'], p))))

  console.log('\n2. The library holds enough simple food')
  const by = (slot: string) => MEAL_LIBRARY.filter(d => d.slot === slot)
  const counts = Object.fromEntries(['breakfast', 'lunch', 'dinner', 'snack'].map(s => [s, by(s).filter(simple).length]))
  check('at least 100 simple breakfasts, lunches and dinners, and 40 simple snacks (measured 127, 113, 116, 45)', counts.breakfast >= 100 && counts.lunch >= 100 && counts.dinner >= 100 && counts.snack >= 40, counts)
  const snack2 = by('snack').filter(d => mainFoodCount(namesOfLines(d.ingredients)) <= 2).length
  check('snacks of one or two foods: at least 40 (there were 7 of 143)', snack2 >= 40, snack2)

  console.log('\n3. The chooser: simple first, unless she loves cooking')
  const lib: RawProposal[] = [
    mk('lunch', 'Recipe Korean', ['150g raw chicken breast', '60g dry white rice', '100g broccoli', '80g bell pepper', '60g onion', '60g carrot'], 'Stir-fry.', 'Korean'),
    mk('lunch', 'Recipe Italian', ['150g turkey mince', '60g dry pasta', '200g tomato passata'], 'Shape into meatballs and simmer.', 'Italian'),
    mk('lunch', 'Plain one', ['150g raw chicken breast', '60g dry white rice', '100g broccoli'], 'Grill and boil.', 'British / Classic'),
    mk('lunch', 'Plain two', ['110g tuna canned in water', '250g raw potato'], 'Bake the potato.', 'British / Classic'),
  ]
  const order = (pref: CookingTimePreference | undefined, fav: string[] = ['Korean', 'Italian']) =>
    chooseFromLibrary(lib, { slot: 'lunch', haveNames: [], haveCuisines: [], favoriteCuisines: fav, cookingTime: pref }).map(d => d.name)
  check('the fixture binds: both recipes carry a cuisine she named (+4), so on score alone they lead', order('loves_cooking').slice(0, 2).every(n => n.startsWith('Recipe')), order('loves_cooking'))
  for (const pref of ['moderate', 'quick', undefined] as const) {
    check(`cooking answer ${pref ?? '(none)'}: both simple dishes come before either recipe`, order(pref).slice(0, 2).every(n => n.startsWith('Plain')), order(pref))
  }
  check('...and nothing is dropped: the chooser orders, the plan decides', order('quick').length === 4)

  console.log('\n4. The share rule, where it binds')
  check('a thin meal takes a recipe whatever the answer (a diet the simple dishes cannot feed keeps choices)', mayAddComplicated('quick', THIN_MEAL - 2, 1) && mayAddComplicated('moderate', 0, THIN_MEAL - 1))
  check('quick: never once the meal is not thin', !mayAddComplicated('quick', 40, 0) && !mayAddComplicated('quick', THIN_MEAL, 0))
  check('happy to cook: always', mayAddComplicated('loves_cooking', 10, 90))
  check('moderate: 30 simple and 9 recipes takes a 10th (10 of 40 is a quarter)', mayAddComplicated('moderate', 30, 9))
  check('...but 30 simple and 10 recipes takes no 11th (11 of 41 is more than a quarter)', !mayAddComplicated('moderate', 30, 10))
  check('...and with no answer saved, moderate is what applies (setup and Profile default to it)', mayAddComplicated(undefined, 30, 9) && !mayAddComplicated(undefined, 30, 10))

  console.log('\n5. A new plan made by the app, per cooking answer')
  type Row = Record<string, unknown>
  const db: Record<string, Row[]> = {}
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
      order: () => api, maybeSingle: () => api, single: () => api, upsert: (r: Row | Row[]) => { op = 'insert'; payload = r; return api },
      then: (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve(exec()).then(res, rej),
    }
    return api
  }
  const WRITER_POOL = MEAL_LIBRARY
  let writerTurn = 0
  ;(globalThis as { fetch: unknown }).fetch = async (_u: string, init?: { body?: string }) => {
    // THE WRITER STANDS IN WITH LIBRARY DISHES: a spread of real dishes per meal, taken in a fixed stride so each round
    // brings different ones. One fixed dish a meal was tried first and could not anchor a day on some targets, which
    // left whole meals empty and measured that instead (23 Nov 2026).
    const body = JSON.parse(init?.body ?? '{}') as { slots: { slot: string; count: number }[] }
    const meals = body.slots.flatMap(({ slot, count }) => {
      const pool = WRITER_POOL.filter(d => d.slot === slot)
      return Array.from({ length: count }, () => pool[(writerTurn += 37) % pool.length])
    })
    return { ok: true, status: 200, json: async () => ({ meals }) }
  }
  const { setSupabaseClient } = await import('../src/lib/supabase')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSupabaseClient({ from: fakeFrom } as any)
  const { generateMealPools } = await import('../src/lib/meal-generation')
  const { getPools } = await import('../src/lib/meal-store')
  const quiet = { log: console.log, warn: console.warn, error: console.error }
  const targets = { calories: 2300, protein: 160, carbs: 250, fat: 72 }
  const share: Record<string, { simple: number; complicated: number }> = {}
  for (const pref of ['quick', 'moderate', 'loves_cooking'] as const) {
    console.log = console.warn = console.error = () => {}
    try {
      await generateMealPools({ profileId: `simple-${pref}`, targets, dietaryPreferences: [], mealsPerDay: 3, includeSnacks: true, cookingTimePreference: pref })
    } finally { Object.assign(console, quiet) }
    const pools = (await getPools(`simple-${pref}`)) as Partial<Record<MealSlotName, PoolOption[]>>
    let s = 0, c = 0
    const perMeal: string[] = []
    for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as MealSlotName[]) {
      const opts = pools[slot] ?? []
      const ms = opts.filter(o => isSimpleDish(slot, o.ingredients.map(i => i.name), o.prep)).length
      s += ms; c += opts.length - ms
      perMeal.push(`${slot} ${ms}/${opts.length}`)
      if (pref === 'moderate') check(`moderate, ${slot}: recipes stay at a quarter of the meal or less (or the meal is thin)`, opts.length < THIN_MEAL || 4 * (opts.length - ms) <= opts.length + 3, `${ms} simple of ${opts.length}`)
      if (pref === 'quick') check(`quick, ${slot}: a recipe only while the meal was thin`, opts.length - ms <= THIN_MEAL, `${ms} simple of ${opts.length}`)
    }
    share[pref] = { simple: s, complicated: c }
    console.log(`  (${pref}: ${perMeal.join(', ')})`)
  }
  const frac = (p: string) => share[p].complicated / Math.max(1, share[p].simple + share[p].complicated)
  check('the rule binds: someone who loves cooking gets a larger share of recipes than moderate, and moderate more than quick', frac('loves_cooking') > frac('moderate') && frac('moderate') > frac('quick'), Object.fromEntries(Object.keys(share).map(k => [k, frac(k).toFixed(2)])))
  check('...and every plan is still full: at least 20 dishes a meal on average', Object.values(share).every(v => (v.simple + v.complicated) / 4 >= 20), share)

  console.log('\n6. The meal writer and the words on the choices')
  const fn = readFileSync('supabase/functions/generate-meals/index.ts', 'utf8')
  const guide = fn.slice(fn.indexOf('function cookingTimeGuidance'), fn.indexOf('function cookingTimeGuidance') + 1200)
  check('the writer is told five main foods or fewer for quick AND for moderate, and what does not count as a food', (guide.match(/five main foods or fewer/g) ?? []).length === 2 && /oil, salt, pepper/.test(guide))
  check('...and moderate allows at most one recipe in four', /At most one dish in four may be a proper recipe/.test(guide))
  check('the writer is asked for plain names, and the restaurant-menu example is gone', /plain name, the way a person would say it/.test(fn) && !/Sichuan Mapo Tofu/.test(fn))
  check('...is not told it is a chef, nor that dinner is where the involved dishes belong', !/You are a chef/.test(fn) && !/more involved dishes belong/.test(fn))
  check('...and a snack is one or two foods', /One or two foods, no cooking/.test(fn))
  const desc = Object.fromEntries(COOKING_TIME_OPTIONS.map(o => [o.value, o.description]))
  check('the choices say what they mean: quick and moderate both say "simple"', /simple/i.test(desc.quick) && /simple/i.test(desc.moderate) && !/simple/i.test(desc.loves_cooking), desc)

  console.log(`\n${ran} checks ran`)
  if (failures > 0) { console.error(`${failures} simple-meals check(s) failed`); process.exit(1) }
}

main().catch(err => { console.error(err); process.exit(1) })
