// ---------------------------------------------------------------------------
// "Add a banana to my breakfast" — a food joining a meal already on the plan
// (Ashley, 3 Sep 2026). Until this existed, every such request was routed to
// propose_meal_addition, treated as a whole new dish called "Banana", and
// refused for not fitting a breakfast's macros.
//
// The promises, each with a check and a mutation that turns it red:
//   1. THE MEAL KEEPS WHAT IT HAD, and the food keeps the amount she said —
//      nothing is re-portioned on either side.
//   2. Amounts are required — a food with no quantity is asked about.
//   3. Nothing to add to is said plainly, with the custom-meal door offered.
//   4. Safety is not traded for convenience: the same diet rules, dislike
//      filter and coverage floor every generated meal passes still run.
//   5. It is wired end to end on the SAME rails as a custom meal — one tool,
//      one courier, one client builder, one executor, one undo.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildMealFoodAddProposal } from '../src/lib/meal-food-add'
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
const parfait = {
  name: 'Greek Yoghurt and Honey Berry Parfait',
  ingredients: ['200g greek yoghurt', '100g blueberries', '20g honey', '30g granola'],
  macros: { calories: 450, protein: 25, carbs: 60, fat: 10 },
}
const base = {
  profileId: 'p1',
  todayDate: '2026-09-03',
  targets,
  mealsPerDay: 3,
  includeSnacks: true,
  dietaryPreferences: [] as string[],
  currentMeal: parfait,
}

console.log('\n1. The meal keeps what it had; the food keeps its amount')
{
  const r = buildMealFoodAddProposal({ ...base, rawArgs: {
    meal_slot: 'breakfast',
    food_lines: ['1 banana'],
    origin_verbatim_quote: 'add a banana to my breakfast',
  } })
  check('the addition is accepted', r.ok, r.ok ? undefined : r.reason)
  if (r.ok) {
    const names = r.payload.option.ingredients.map(i => i.name.toLowerCase())
    const yog = r.payload.option.ingredients.find(i => /yoghurt|yogurt/i.test(i.name))
    check('the original ingredients are all still there', names.length === parfait.ingredients.length + 1, names)
    check('200g of yoghurt is still 200g — the meal was not re-portioned', yog != null && Math.round(yog.quantity) === 200 && yog.unit === 'g', yog)
    check('the banana joined it', names.some(n => /banana/.test(n)), names)
    check('the calories went up, not sideways — nothing was scaled down to make room',
      r.payload.option.macros.calories > parfait.macros.calories, r.payload.option.macros)
    check('the card leads with what is being added and where',
      r.diff.rows[0].field === 'Adding to' && r.diff.rows[0].before === 'breakfast' && /banana/.test(r.diff.rows[0].after), r.diff.rows[0])
    check('...shows the before and after numbers', r.diff.rows.some(row => row.field === 'Calories' && /450 kcal/.test(row.before)), r.diff.rows)
    check('...says the meal was not re-portioned', r.diff.implications?.some(i => /no re-portioning/.test(i.text)) === true)
    check('...and that the rest of the day re-fits', r.diff.implications?.some(i => /re-fits/.test(i.text)) === true)
    check('the original meal is kept in the options', r.diff.implications?.some(i => /original stays/.test(i.text)) === true)
    check('the option is named as the meal plus the food', /parfait/i.test(r.payload.option.name) && /banana/i.test(r.payload.option.name), r.payload.option.name)
  }
}

console.log('\n2. No amount, no guess')
{
  const r = buildMealFoodAddProposal({ ...base, rawArgs: { meal_slot: 'breakfast', food_lines: ['banana'], origin_verbatim_quote: 'x' } })
  check('a food with no amount is refused', !r.ok)
  check('...by asking how much, in words', !r.ok && /how much/i.test(r.reason), !r.ok ? r.reason : '')
}

console.log('\n3. Nothing to add to is said plainly')
{
  const r = buildMealFoodAddProposal({ ...base, currentMeal: null, rawArgs: { meal_slot: 'snack', food_lines: ['1 banana'], origin_verbatim_quote: 'x' } })
  check('an empty slot is refused', !r.ok)
  check('...naming the slot and offering to set the meal up instead', !r.ok && /no snack/.test(r.reason) && /set it up/.test(r.reason), !r.ok ? r.reason : '')
}

console.log('\n4. Safety is never traded for convenience')
{
  const vegan = buildMealFoodAddProposal({ ...base, dietaryPreferences: ['vegan'], currentMeal: { name: 'Oat Bowl', ingredients: ['80g rolled oats', '200ml oat milk'], macros: { calories: 400, protein: 12, carbs: 60, fat: 10 } }, rawArgs: {
    meal_slot: 'breakfast', food_lines: ['2 eggs'], origin_verbatim_quote: 'x',
  } })
  check('a diet clash on the added food is refused, not confirmed', !vegan.ok)
  const disliked = buildMealFoodAddProposal({ ...base, dislikedFoods: ['banana'], rawArgs: {
    meal_slot: 'breakfast', food_lines: ['1 banana'], origin_verbatim_quote: 'x',
  } })
  check('a recorded dislike is surfaced, not ignored', !disliked.ok)
  const gibberish = buildMealFoodAddProposal({ ...base, rawArgs: {
    meal_slot: 'breakfast', food_lines: ['50g flargle root'], origin_verbatim_quote: 'x',
  } })
  check('an unrecognised food is refused rather than priced by guess', !gibberish.ok)
}

console.log('\n5. Wired end to end, on the custom-meal rails')
{
  const chat = read('supabase/functions/chat-gemini/index.ts')
  check('the tool is declared', /name: "propose_meal_food_add"/.test(chat))
  check('...as a courier — the server writes nothing', /name === "propose_meal_food_add"/.test(chat) && /kind: "propose_meal_food_add"/.test(chat))
  check('...and the prompt routes "add a banana to my breakfast" to it', /add a banana to my breakfast/i.test(chat))
  check('...distinct from a new dish and from replacing the meal', /propose_meal_food_add/.test(chat.slice(chat.indexOf('ADDING A MEAL vs SWAPPING ONE'))))
  const ui = read('src/components/ChatAssistant.tsx')
  check('the client builds it through buildMealFoodAddProposal', /buildMealFoodAddProposal\(/.test(ui))
  check('...from the meal currently in the slot', /currentMeal:/.test(ui))
  check('confirm reuses the addition executor — one write path',
    /'propose_meal_addition' \|\| row\.kind === 'propose_custom_meal' \|\| row\.kind === 'propose_meal_food_add'/.test(ui))
  check('...and so does undo', (ui.match(/row\.kind === 'propose_meal_food_add'/g) ?? []).length >= 2)
  const types = read('src/lib/types.ts')
  check('the receipt kind exists', /'propose_meal_food_add'/.test(types))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll meal-food-add checks passed.')
