// ---------------------------------------------------------------------------
// "The app should ask how much of each food I'm having so it can calculate
// and then add that as my breakfast and plan for the rest of my meals."
// — Ashley, 1 Sep 2026. This gate holds every clause of that sentence.
//
// The promises, each with a check and a mutation that turns it red:
//   1. HER PORTIONS ARE FACTS — never rescaled, never "adjusted to fit".
//   2. Amounts are required — a food with no quantity is asked about, not
//      guessed at.
//   3. Safety is not traded for autonomy: the same coverage floor, dislike
//      filter and diet rules every generated meal passes still run.
//   4. The rest of the day re-fits around the pinned meal, and the repair
//      pass never edits the pinned meal itself.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildCustomMealProposal } from '../src/lib/custom-meal'
import { assembleDay, type PoolOption } from '../src/lib/meal-generation'
import type { MacroTargets } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (p: string) => strip(readFileSync(join(ROOT, p), 'utf8'))

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const targets: MacroTargets = { calories: 2000, protein: 150, carbs: 200, fat: 70 }
const base = {
  profileId: 'p1',
  todayDate: '2026-09-01',
  targets,
  mealsPerDay: 3,
  includeSnacks: false,
  dietaryPreferences: [] as string[],
}

console.log('\n1. Her portions are facts')
{
  const r = buildCustomMealProposal({ ...base, rawArgs: {
    meal_slot: 'breakfast',
    name: 'My usual breakfast',
    food_lines: ['3 eggs', '150g greek yoghurt', '100g blueberries'],
    origin_verbatim_quote: 'I usually have eggs and greek yoghurt and fruit for breakfast',
  } })
  check('the meal is accepted', r.ok, r.ok ? undefined : r.reason)
  if (r.ok) {
    const eggs = r.payload.option.ingredients.find(i => /egg/i.test(i.name))
    const yog = r.payload.option.ingredients.find(i => /yoghurt|yogurt/i.test(i.name))
    // 3 medium eggs = 150g in the food DB's unit table; 150g yoghurt stays 150g.
    check('3 eggs stay 3 eggs (150g), not a rescaled amount', eggs != null && Math.round(eggs.quantity * (eggs.unit === 'g' ? 1 : 50)) === 150, eggs)
    check('150g of yoghurt stays 150g', yog != null && Math.round(yog.quantity) === 150 && yog.unit === 'g', yog)
    // Measured directly earlier this session: 375 kcal / 35.2g protein for
    // exactly these amounts. A rescale to the ~600 kcal breakfast budget
    // would land far away from this.
    check('the macros are the stated amounts\' macros, not the budget\'s',
      Math.abs(r.payload.option.macros.calories - 375) < 15, r.payload.option.macros)
    check('the card says the portions were untouched',
      r.diff.implications.some(i => /untouched/i.test(i.text)), r.diff.implications.map(i => i.text))
    check('...and that the rest of the day re-fits',
      r.diff.implications.some(i => /re-?fits/i.test(i.text)))
  }
}

console.log('\n2. No amount, no guess')
{
  const r = buildCustomMealProposal({ ...base, rawArgs: {
    meal_slot: 'breakfast',
    food_lines: ['eggs', '150g greek yoghurt'],
    origin_verbatim_quote: 'eggs and yoghurt',
  } })
  check('a food with no amount is refused', !r.ok)
  check('...by asking how much, in words', !r.ok && /how much/i.test(r.reason), !r.ok ? r.reason : '')
  // "a banana" carries its amount in the article — natural speech must work.
  const ok = buildCustomMealProposal({ ...base, rawArgs: {
    meal_slot: 'breakfast', food_lines: ['a banana', '150g greek yoghurt'], origin_verbatim_quote: 'x',
  } })
  check('"a banana" counts as an amount', ok.ok, ok.ok ? undefined : ok.reason)
}

console.log('\n3. Safety is never traded for autonomy')
{
  const vegan = buildCustomMealProposal({ ...base, dietaryPreferences: ['vegan'], rawArgs: {
    meal_slot: 'breakfast', food_lines: ['3 eggs', '150g greek yoghurt'], origin_verbatim_quote: 'x',
  } })
  check('a diet clash is refused, not confirmed', !vegan.ok)
  const disliked = buildCustomMealProposal({ ...base, dislikedFoods: ['eggs'], rawArgs: {
    meal_slot: 'breakfast', food_lines: ['3 eggs', '150g greek yoghurt'], origin_verbatim_quote: 'x',
  } })
  check('a recorded dislike is surfaced, not ignored', !disliked.ok)
  const gibberish = buildCustomMealProposal({ ...base, rawArgs: {
    meal_slot: 'breakfast', food_lines: ['200g flargle root', '100g zorp'], origin_verbatim_quote: 'x',
  } })
  check('unrecognised foods are refused rather than priced by guess', !gibberish.ok)
  check('...saying it cannot measure them', !gibberish.ok && /measure|food data/i.test(gibberish.reason), !gibberish.ok ? gibberish.reason : '')
}

console.log('\n4. The day re-fits around the pin, and never edits it')
{
  const opt = (name: string, calories: number, protein: number): PoolOption =>
    ({ slot: 'lunch', name, ingredients: [{ name, quantity: 100, unit: 'g' }], macros: { calories, protein, carbs: 50, fat: 20 }, tags: [] }) as unknown as PoolOption
  const pools = {
    breakfast: [ { ...opt('Big breakfast', 700, 40), slot: 'breakfast' }, { ...opt('Small breakfast', 400, 30), slot: 'breakfast' } ],
    lunch: [opt('Big lunch', 900, 60), opt('Small lunch', 600, 45)],
    dinner: [ { ...opt('Big dinner', 900, 60), slot: 'dinner' }, { ...opt('Small dinner', 600, 45), slot: 'dinner' } ],
  } as never

  // A 2175-kcal day target: with a light 375-kcal pin, the only combination
  // that lands is big + big (375+900+900 = 2175, exact) — either small
  // option leaves the day 300 kcal short. My first version of this fixture
  // targeted 2000 and asserted big+big anyway; the engine correctly chose
  // 1875 (closer to 2000 than 2175) and the gate went red against right
  // behaviour. The check's job is "free slots compensate around the pin",
  // so the fixture now makes compensation and optimality the same answer.
  const dayTargets: MacroTargets = { calories: 2175, protein: 155, carbs: 200, fat: 70 }
  const pinned = { breakfast: { ...opt('My usual breakfast', 375, 35), slot: 'breakfast' } } as never
  const day = assembleDay(pools, dayTargets, {}, [], pinned)
  check('the pinned meal IS the chosen breakfast', day.chosen.breakfast?.name === 'My usual breakfast', day.chosen.breakfast?.name)
  check('its macros count toward the day exactly',
    Math.round(day.totals.calories) === Math.round(375 + (day.chosen.lunch?.macros.calories ?? 0) + (day.chosen.dinner?.macros.calories ?? 0)), day.totals)
  check('the free slots compensate — both go big around a light pin',
    day.chosen.lunch?.name === 'Big lunch' && day.chosen.dinner?.name === 'Big dinner',
    { lunch: day.chosen.lunch?.name, dinner: day.chosen.dinner?.name })
  check('the pinned meal is returned byte-identical — no repair touched it',
    day.chosen.breakfast != null && Math.round(day.chosen.breakfast.macros.calories) === 375
    && day.chosen.breakfast.ingredients[0].quantity === 100, day.chosen.breakfast?.macros)

  // A pin with an ABSURD calorie load: the day cannot land in tolerance, and
  // the honest outcome is an out-of-tolerance day — never an edited pin.
  //
  // THE INGREDIENT IS A REAL FOOD ON PURPOSE. The first version pinned a
  // made-up name; the repair-scale can't rescale what the food DB can't
  // resolve, so the mutation that lets repair touch pinned slots changed
  // nothing and survived. 450g of oats is resolvable and ~1750 kcal — if
  // repair is ever allowed at a pin again, it CAN rescale this one, and the
  // 1800-unchanged assertion below goes red.
  const heavy = { breakfast: { ...opt('Enormous breakfast', 1800, 90), slot: 'breakfast', ingredients: [{ name: 'oats', quantity: 450, unit: 'g' }] } } as never
  const heavyDay = assembleDay(pools, dayTargets, {}, [], heavy)
  check('an oversized pin ships as an honest miss, still unedited',
    Math.round(heavyDay.chosen.breakfast?.macros.calories ?? 0) === 1800, heavyDay.chosen.breakfast?.macros)
}

console.log('\n5. The chain is wired, end to end')
{
  const chat = read('supabase/functions/chat-gemini/index.ts')
  check('the tool is declared', /name: "propose_custom_meal"/.test(chat))
  check('...and has a courier handler', /name === "propose_custom_meal"/.test(chat))
  check('...whose prompt demands amounts before calling', /ask how much of each/i.test(chat))
  const ui = read('src/components/ChatAssistant.tsx')
  check('the client builds it through buildCustomMealProposal', /buildCustomMealProposal/.test(ui))
  check('confirm reuses the addition executor — one write path', /'propose_meal_addition' \|\| row\.kind === 'propose_custom_meal'/.test(ui))
  const app = read('src/App.tsx')
  check('manual picks are PINNED into assembly, not overlaid after',
    /assembleDay\(mealPools, macros, \{\}, compiledSoftFoodPreferences, pinnedMeals\)/.test(app))
  const panel = read('src/components/MealPlan.tsx')
  check('the swap panel re-checks every alternative against current restrictions', /checkAlternative\(alt\)/.test(panel))
  check('...disabling a blocked one with the reason shown', /disabled=\{busy \|\| !verdict\.ok\}/.test(panel))
  check('the panel can find more options on demand', /More options/.test(panel) && /onFindMore\(slot\)/.test(panel))
}

console.log(failures === 0 ? '\nHer food, her amounts, her day.\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
