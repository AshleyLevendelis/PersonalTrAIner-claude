/**
 * test:meal-method-check — a recipe's cooking steps are checked against her
 * allergies and foods to avoid, and against the dish's own ingredient list.
 *
 * Ashley's ruling of 9 Oct 2026, "Build all four", item 4. Plan:
 * docs/plans/recipe-steps-checked-against-restrictions.md (tracer G: M19).
 *
 * The method used to be checked for written amounts and nothing else, so the
 * allergen and avoid filters never read it. Tracer G proved it by running the
 * real functions; sections 3 and 4 run those two reproductions again.
 * One exit; every check runs every time.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { checkMethod, UNLISTED_ALLOWED } from '../src/lib/meal-method-check'
import { verifyProposal, methodToShow, type RawProposal } from '../src/lib/meal-generation'
import { computeMealMacros } from '../src/lib/food-db'
import { parseIngredientLines, parseIngredientLine } from '../src/lib/portion-scaler'
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
import type { MacroTargets } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let ran = 0
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const code = (f: string) => readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const shown = (prep: string, list: string[], rules = {}) => checkMethod(prep, list, rules).text.length > 0

console.log('\n1. A step that names a food she must not eat is not shown')
{
  const list = ['chicken breast', 'white rice cooked', 'walnuts', 'peanuts', 'milk whole', 'coconut milk canned', 'bacon', 'mushroom', 'pancetta', 'egg']
  const CASES: [string, string, Record<string, string[]>, boolean][] = [
    ['walnuts, nut-free', 'Scatter over the toasted walnuts.', { dietaryPreferences: ['nut-free'] }, false],
    ['walnuts, no restriction', 'Scatter over the toasted walnuts.', {}, true],
    ['crushed peanuts, nut-free', 'Finish with crushed peanuts.', { dietaryPreferences: ['nut-free'] }, false],
    ['"nuts" (no food of that name), nut-free', 'Top with a handful of chopped nuts.', { dietaryPreferences: ['nut-free'] }, false],
    ['a splash of milk, dairy-free', 'Loosen with a splash of milk.', { dietaryPreferences: ['dairy-free'] }, false],
    ['coconut milk is not milk, dairy-free', 'Stir in the coconut milk and simmer.', { dietaryPreferences: ['dairy-free'] }, true],
    ['"add the chicken", vegetarian', 'Fry the chicken until golden.', { dietaryPreferences: ['vegetarian'] }, false],
    ['bacon, vegetarian', 'Crisp the bacon in the pan.', { dietaryPreferences: ['vegetarian'] }, false],
    ['pancetta (a word, not just a food), halal', 'Crisp the pancetta first.', { dietaryPreferences: ['halal'] }, false],
    ['eggs, egg-free', 'Top with halved boiled eggs.', { dietaryPreferences: ['egg-free'] }, false],
    ['"nutmeg" is not a nut, nut-free', 'Grate over a little nutmeg.', { dietaryPreferences: ['nut-free'], avoidFoods: ['nuts'] }, true],
    ['mushrooms, avoided', 'Fry the mushrooms in the pan.', { avoidFoods: ['mushrooms'] }, false],
    ['bacon, "pork" avoided (a category word reaches it through the tag)', 'Crisp the bacon in the pan.', { avoidFoods: ['pork'] }, false],
    ['rice, "pork" avoided', 'Serve over the rice.', { avoidFoods: ['pork'] }, true],
  ]
  for (const [said, prep, rules, want] of CASES) {
    const r = checkMethod(prep, list, rules)
    check(`${said}: ${want ? 'shown' : 'hidden'}`, (r.text.length > 0) === want, r.hidden)
  }
}

console.log('\n2. A step that names a food the dish does not have is not shown (M19)')
{
  const prawnSalad = ['raw king prawns', 'mixed salad leaves', 'cucumber', 'olive oil', 'lemon']
  check('the prawn salad\'s "chilli flakes", not on its list: hidden', !shown('Fry the prawns with garlic and chilli flakes, then toss through the leaves.', prawnSalad))
  check('...and shown once the chilli flakes are on the list (and the garlic)', shown('Fry the prawns with garlic and chilli flakes, then toss through the leaves.', [...prawnSalad, 'chilli flakes', 'garlic']))
  check('salt, pepper and water are allowed unlisted', shown('Season with salt and pepper and add a splash of water.', ['chicken breast']))
  check(`the allowed list is exactly salt, pepper, water and ice (${UNLISTED_ALLOWED.length} wordings)`, UNLISTED_ALLOWED.every(w => /salt|pepper|water|ice/.test(w)) && UNLISTED_ALLOWED.length === 9, UNLISTED_ALLOWED)
  check('"toast the seeds" is a verb, not bread', shown('Toast the seeds in a dry pan.', ['sunflower seeds']))
  check('"tomato" is on a list that says cherry tomatoes; "the rice" on one that says basmati rice cooked', shown('Halve the tomato and spoon over the rice.', ['cherry tomatoes', 'basmati rice cooked']))
  check('"top with mashed potato" when the list has potato: shown', shown('Top with mashed potato and bake.', ['potato boiled']))
  check('a dried herb not on the list is hidden (the strict answer to her open question)', !shown('Sprinkle with chilli flakes.', ['chicken breast']))
}

console.log('\n3. Tracer G\'s reproductions, through the real verifyProposal')
{
  const fit = (p: RawProposal): MacroTargets => {
    const c = computeMealMacros(parseIngredientLines(p.ingredients))
    return { calories: c.kcal, protein: Math.floor(c.protein * 0.95), carbs: c.carbs, fat: c.fat } as MacroTargets
  }
  // The library dish as it was written (its method named eggs that were not in it).
  const halloumi: RawProposal = {
    slot: 'lunch', name: 'Halloumi and chicken quinoa salad', cuisine: 'Mediterranean (Greek, Lebanese, Turkish)',
    ingredients: ['80g halloumi', '100g chicken breast', '150g quinoa cooked', '100g cucumber', '100g cherry tomatoes', '30g rocket'],
    prep: 'Grill the halloumi until golden and toss with the quinoa, cucumber, tomatoes and rocket, then top with halved boiled eggs.',
  }
  const log: string[] = []
  const a = verifyProposal(halloumi, 'lunch', fit(halloumi), ['egg-free'], log)
  check('the halloumi salad is still accepted for egg-free (the dish has no egg)...', !!a, log.slice(-2))
  check('...but its method, which says "top with halved boiled eggs", is not shown', a?.prep === '', a?.prep)
  // Tracer G's made-up writer proposal for Sam (nut-free, avoiding mushrooms and pork).
  const made: RawProposal = {
    slot: 'dinner', name: 'Garlic chicken with rice and broccoli', cuisine: 'British / Classic',
    ingredients: ['150g chicken breast', '200g white rice cooked', '1 garlic clove', '1 tbsp olive oil', '100g broccoli'],
    prep: 'Fry the mushrooms in butter, add the chicken and garlic, then scatter over toasted walnuts and chilli flakes and serve with the rice and broccoli.',
  }
  const b = verifyProposal(made, 'dinner', fit(made), ['nut-free'], log, ['mushrooms', 'pork'])
  check('the made-up dish is accepted for nut-free, avoiding mushrooms and pork...', !!b, log.slice(-2))
  check('...and its method (mushrooms, butter, walnuts, chilli flakes) is not shown', b?.prep === '', b?.prep)
  const clean = { ...made, prep: 'Fry the chicken with the garlic in the oil, then serve with the rice and steamed broccoli.' }
  const c = verifyProposal(clean, 'dinner', fit(clean), ['nut-free'], log, ['mushrooms', 'pork'])
  check('a method that is true of the dish and names nothing she avoids IS shown', !!c?.prep && c.prep.length > 20, c?.prep)
}

console.log('\n4. Again at display, with the restrictions she has TODAY')
{
  const ingredients = parseIngredientLines(['150g chicken breast', '200g white rice cooked', '30g walnuts'])
  const prep = 'Fry the chicken, then scatter the walnuts over the rice.'
  check('a stored method is shown when nothing rules it out', methodToShow(prep, ingredients, {}) === prep)
  check('...and hidden the moment nut-free is added, with nothing regenerated', methodToShow(prep, ingredients, { dietaryPreferences: ['nut-free'] }) === '')
  check('...or the moment walnuts go on Foods to avoid', methodToShow(prep, ingredients, { avoidFoods: ['walnuts'] }) === '')
  check('the amount rule still runs first (a method naming "200g" is not shown)', methodToShow('Fry 200g of the chicken.', ingredients, {}) === '')
}

console.log('\n5. Every library dish passes, and what each answer to her question would cost')
{
  const hidden = MEAL_LIBRARY.filter(d => !shown(d.prep, d.ingredients.map(l => parseIngredientLine(l).name)))
  check(`every one of the ${MEAL_LIBRARY.length} library methods is true of its own list (8 were not, per tracer G; 11 fixed in the data)`, MEAL_LIBRARY.length > 200 && hidden.length === 0, hidden.map(d => d.name))
  console.log(`     library methods hidden by the strict rule: ${hidden.length} of ${MEAL_LIBRARY.length}`)
}

console.log('\n6. The check is wired where the method is written and where it is drawn')
{
  const gen = code('src/lib/meal-generation.ts')
  check('verifyProposal stores the method through methodToShow, with her diet and her avoids',
    /prep:\s*methodToShow\(proposal\.prep,\s*scaled\.ingredients,\s*\{\s*dietaryPreferences,\s*avoidFoods:\s*dislikedFoods\s*\}\)/.test(gen))
  check('methodToShow runs the amount rule and then checkMethod', /export function methodToShow[\s\S]{0,400}methodSafeToShow\(prep\)[\s\S]{0,200}checkMethod\(/.test(gen))
  const plan = code('src/components/MealPlan.tsx')
  check('the meal card computes the method with methodToShow and her rules, once', /methodToShow\(option\.prep,\s*option\.ingredients,\s*methodRules\)/.test(plan) && (plan.match(/methodToShow\(/g) ?? []).length === 1)
  check('...draws only that ({method}), never the raw prep', (plan.match(/\{method\}/g) ?? []).length === 2 && !/\{option\.prep\}/.test(plan) && !/methodSafeToShow/.test(plan))
  check('...with her rules being the same two lists the restriction re-check reads', /const methodRules: MethodRules = \{\s*dietaryPreferences,\s*avoidFoods\s*\}/.test(plan) && /methodRules=\{methodRules\}/.test(plan))
  const slots = code('src/lib/onboarding-slots.ts')
  check('setup\'s allergy backstop reads the same word list (allergen-words.ts), with no copy of its own',
    /from '\.\/allergen-words'/.test(slots) && !/ALLERGEN_FOOD_PATTERNS\s*:/.test(slots))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} meal-method-check check(s) failed`); process.exit(1) }
console.log('A method is shown only when it is true of the dish and names nothing she must not eat.\n')
