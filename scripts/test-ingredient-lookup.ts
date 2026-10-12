/**
 * test:ingredient-lookup — the food lookup never throws a word away.
 *
 * Ashley's ruling of 9 Oct 2026, "Build all four", item 3: a "chicken caesar
 * wrap" is not an empty tortilla, and bare "chicken" must not match a
 * meat-free product. Plan: docs/plans/ingredient-lookup-truth.md (section 10
 * is the build).
 *
 * The plan's reproduction tables are the assertions here, both copies (the
 * app's and the coach's generated one), plus the diet verdicts that made it
 * safety-adjacent, the state twins, the reviewed bare words, and the list of
 * harmless words read from the source so a word cannot be added unseen.
 *
 * One exit: every check runs every time, and the count printed is compared by
 * the mutation round.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as app from '../src/lib/food-db'
import * as coach from '../supabase/functions/_shared/food-db.ts'
import { validateMealAgainstDiet } from '../src/lib/diet-rules'
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
import { parseIngredientLine } from '../src/lib/portion-scaler'
import { resolveGroceryTarget } from '../src/lib/grocery-store'
import { swapGroupOf } from '../src/lib/food-swap-groups'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let ran = 0
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const both = (phrase: string) => {
  const a = app.lookupIngredient(phrase)?.name ?? null
  const c = coach.lookupIngredient(phrase)?.name ?? null
  return a === c ? a : `app=${a} coach=${c}`
}

console.log('\n1. A dish is not one of its ingredients (plan, table A)')
{
  const DISHES = ['chicken caesar wrap', 'tuna mayo sandwich', 'cheese and ham toastie', 'egg fried rice', 'peanut butter cookie',
    'almond croissant', 'salmon sushi roll', 'oat milk latte', 'egg mayonnaise', 'avocado toast', 'almond-crusted cod',
    'honey mustard chicken', 'prawn cocktail', 'sausage roll', 'beef lasagne', 'chicken with rice', 'rice cakes with dark chocolate',
    'salt and pepper to taste', 'sweet potato fries', 'almond milk yoghurt', 'peanut sauce']
  const resolved = DISHES.map(d => [d, both(d)] as const).filter(([, r]) => r !== null)
  check(`all ${DISHES.length} dishes are a miss in both copies (they used to be a tortilla, mayonnaise, ham, cod...)`, resolved.length === 0, resolved)
}

console.log('\n2. A state word is kept (plan, table B; M20)')
{
  const STATES: [string, string][] = [
    ['dry penne pasta', 'pasta dry'], ['dry spaghetti', 'pasta dry'], ['dry pasta penne', 'pasta dry'],
    ['uncooked basmati rice', 'basmati rice dry'], ['dried red lentils', 'red lentils dry'], ['uncooked quinoa', 'quinoa dry'],
    ['raw chicken breast', 'chicken breast raw'], ['raw king prawns', 'prawns raw'], ['raw turkey breast', 'turkey breast raw'],
    ['raw haddock fillet', 'haddock raw'],
    ['uncooked chicken breast', 'chicken breast raw'], ['raw skinless chicken breast fillets', 'chicken breast raw'],
    // the cooked forms are untouched
    ['cooked white rice', 'white rice cooked'], ['white rice cooked', 'white rice cooked'], ['200g cooked basmati rice', 'basmati rice cooked'],
    ['cooked chicken breast', 'chicken breast'], ['grilled chicken breast fillet', 'chicken breast'],
    // a raw-figure entry already describes raw food, so "raw" is right as it was
    ['raw salmon fillet', 'salmon'],
    // no state on the entry: the state word is harmless
    ['raw spinach', 'spinach'], ['cooked spinach', 'spinach'],
  ]
  const wrong = STATES.map(([p, want]) => {
    const name = /^\d/.test(p) ? parseIngredientLine(p).name : p
    return [p, both(name), want] as const
  }).filter(([, got, want]) => got !== want)
  check(`${STATES.length} lines reach the entry for the state they name`, wrong.length === 0, wrong)
  const NEVER_OTHER_STATE = ['dried mango', 'cooked oats', 'dried chickpeas', 'raw lamb chop', 'cooked dry pasta']
  const leaked = NEVER_OTHER_STATE.map(p => [p, both(p)] as const).filter(([, r]) => r !== null)
  check('a state with no entry of its own is a miss, never the other state (dried fruit is not fresh fruit)', leaked.length === 0, leaked)
  // The numbers the M20 line was reported with: 37 g of dry penne.
  const penne = app.computeMealMacros([{ name: 'dry penne pasta', quantity: 37, unit: 'g' }])
  check('"37g dry penne pasta" is about 28 g of carbs, not 11.5 (it was costed as cooked)', penne.carbs >= 25 && penne.carbs <= 30 && penne.coverage === 1, penne.carbs)
  const breast = app.computeMealMacros([{ name: 'raw chicken breast', quantity: 150, unit: 'g' }])
  check('"150g raw chicken breast" is about 34 g of protein, not 46 (it was costed as cooked)', breast.protein >= 31 && breast.protein <= 37, breast.protein)
}

console.log('\n3. A short word does not take a longer name (plan, table C) — the seitan finding')
{
  check('bare "chicken" is chicken, not seitan (it was "meat free chicken pieces")', both('chicken') === 'chicken breast', both('chicken'))
  check('"chicken pieces" is chicken too', both('chicken pieces') === 'chicken breast', both('chicken pieces'))
  for (const pref of ['vegetarian', 'vegan']) {
    const v = validateMealAgainstDiet([{ name: 'chicken', quantity: 120, unit: 'g' }], [pref])
    check(`an ingredient line saying "chicken" is REFUSED for ${pref} (it used to pass)`, v.ok === false, v.violations.map(x => x.reason))
  }
  const MISS = ['fish', 'cream', 'cheese', 'nuts', 'beans', 'sausage', 'sausages', 'yoghurt', 'burger']
  const took = MISS.map(p => [p, both(p)] as const).filter(([, r]) => r !== null)
  check('a word whose foods differ on a tag is a miss (fish was fish sauce, cheese ricotta, nuts cashews, sausage pork OR vegan)', took.length === 0, took)
  check('"vegan sausages" is the vegan sausage, never pork', both('vegan sausages') === 'vegan sausage', both('vegan sausages'))
  check('"meat free chicken pieces" is still the seitan it names', both('meat free chicken pieces') === 'seitan strips', both('meat free chicken pieces'))
}

console.log('\n4. A qualifier that changes the food (plan, table D; M23)')
{
  const QUAL: [string, string | null][] = [
    ['oat flour', 'oat flour'], ['almond flour', 'almond flour'], ['coconut flour', 'coconut flour'], ['rice flour', 'rice flour'],
    ['coconut water', 'coconut water'], ['water chestnuts', 'water chestnuts'], ['spring onions', 'spring onion'],
    ['corn tortillas', 'corn tortilla'], ['potatoes', 'potato boiled'], ['light mayonnaise', 'mayonnaise light'],
    ['low fat cottage cheese', 'cottage cheese low fat'], ['light coconut milk', 'coconut milk light'],
    ['chocolate rice cake', 'chocolate rice cakes'], ['oyster mushrooms', null], ['tomato puree', null],
  ]
  const wrong = QUAL.map(([p, want]) => [p, both(p), want] as const).filter(([, got, want]) => got !== want)
  check(`${QUAL.length} qualified foods reach their own entry, or nothing (oat flour used to be WHEAT flour)`, wrong.length === 0, wrong)
  const oat = app.lookupIngredient('oat flour')
  check('oat flour carries the gluten tag (fail-safe: no gluten-free verdict moved)', !!oat?.tags.contains_gluten)
  check('almond flour carries the nut tag (it was plain flour: no nut tag at all)', !!app.lookupIngredient('almond flour')?.tags.contains_nuts)
  for (const broth of ['chicken stock', 'beef stock', 'chicken broth']) {
    const v = validateMealAgainstDiet([{ name: broth, quantity: 200, unit: 'ml' }], ['vegetarian'])
    check(`"${broth}" is refused for vegetarian (meat stock carried no tag at all)`, v.ok === false, v.violations.map(x => x.reason))
  }
}

console.log('\n5. What did not move')
{
  const ORDINARY: [string, string][] = [
    ['eggs', 'egg'], ['scrambled egg', 'egg'], ['bread', 'white bread'], ['whole milk', 'milk whole'], ['milk', 'milk whole'],
    ['rice', 'white rice cooked'], ['tuna', 'tuna canned in water'], ['greek yoghurt', 'greek yoghurt 0%'], ['greek yogurt', 'greek yoghurt full fat'],
    ['scallions', 'spring onion'], ['butter', 'butter'], ['prawns', 'prawns'], ['rice cakes', 'rice cakes'], ['tinned chickpeas', 'chickpeas'],
    ['pot of natural yoghurt', 'natural yoghurt'], ['glass of whole milk', 'milk whole'], ['garlic cloves', 'garlic'],
    ['seitan-based strips', 'seitan strips'], ['chopped tomatoes', 'chopped tomatoes canned'], ['french toast', 'french toast'],
    ['toast', 'white bread'], ['chilli powder', 'chili powder'], ['chilli flakes', 'chilli flakes'],
    // "and" between two harmless words is harmless; between two foods it is two foods (section 1)
    ['chopped and drained chickpeas', 'chickpeas'], ['peeled and diced onion', 'onion'],
  ]
  const wrong = ORDINARY.map(([p, want]) => [p, both(p), want] as const).filter(([, got, want]) => got !== want)
  check(`${ORDINARY.length} everyday names resolve as they should`, wrong.length === 0, wrong)
  const libNames = MEAL_LIBRARY.flatMap(d => d.ingredients.map(l => parseIngredientLine(l).name))
  const libMiss = [...new Set(libNames.filter(n => !app.lookupIngredient(n)))]
  check(`every one of the ${libNames.length} library ingredient lines still resolves (measured: none changed food)`, libNames.length > 1000 && libMiss.length === 0, libMiss)
}

console.log('\n6. The words that may be left over, read from the source')
{
  const src = readFileSync(join(ROOT, 'src/lib/food-db.ts'), 'utf8')
  const block = src.match(/export const HARMLESS_WORDS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? ''
  const words = [...block.replace(/\/\/.*$/gm, '').matchAll(/'([^']+)'/g)].map(m => m[1]).sort()
  // REVIEWED 11 Oct 2026. Adding a word changes what every ingredient line
  // can resolve to, so it is added HERE too, on purpose, after asking whether
  // the word could ever be another food or join two foods.
  const REVIEWED = ['a', 'an', 'baby', 'based', 'baked', 'beaten', 'boiled', 'boneless', 'canned', 'chilled', 'chopped', 'chunk', 'clove', 'cold', 'crunchy',
    'crushed', 'cube', 'cubed', 'deseeded', 'diced', 'drained', 'extra', 'fillet', 'finely', 'flaked', 'floret', 'for', 'free', 'fresh', 'fried',
    'frozen', 'garnish', 'grated', 'grilled', 'half', 'halved', 'halves', 'heaped', 'into', 'large', 'lean', 'leaf', 'leaves', 'level', 'loin',
    'mature', 'medium', 'melted', 'mild', 'minced', 'mini', 'of', 'optional', 'organic', 'pan', 'peeled', 'piece', 'pitted', 'plain', 'poached',
    'quartered', 'range', 'rasher', 'ring', 'rinsed', 'ripe', 'roast', 'roasted', 'roughly', 'salted', 'seared', 'segment', 'serve', 'serving',
    'shelled', 'shredded', 'skinless', 'slice', 'sliced', 'small', 'smooth', 'softened', 'some', 'sourdough', 'spear', 'sprig', 'stalk',
    'steamed', 'stick', 'stir', 'strip', 'tenderstem', 'the', 'thick', 'thin', 'thinly', 'tinned', 'to', 'toasted', 'torn', 'trimmed',
    'unsalted', 'unsweetened', 'warm', 'wedge', 'whole', 'wholegrain', 'wholemeal'].sort()
  check(`the harmless-word list is exactly the reviewed ${REVIEWED.length}`, words.length > 50 && JSON.stringify(words) === JSON.stringify(REVIEWED),
    { added: words.filter(w => !REVIEWED.includes(w)), removed: REVIEWED.filter(w => !words.includes(w)) })
  const NEVER = ['with', 'in', 'on', 'and', 'crusted', 'sauce', 'roll', 'sandwich', 'wrap', 'cookie', 'latte', 'light', 'reduced', 'low', 'fat', 'smoked', 'dry', 'dried', 'raw', 'uncooked', 'cooked']
  check('it holds none of the words that join two foods, make a dish, or change the numbers', words.length > 50 && !NEVER.some(w => words.includes(w)), NEVER.filter(w => words.includes(w)))
}

console.log('\n7. A twin is the same food in another state')
{
  const PAIRS: [string, string][] = [['pasta cooked', 'pasta dry'], ['white rice cooked', 'white rice dry'], ['lentils red', 'red lentils dry'],
    ['egg noodles cooked', 'egg noodles dry'], ['chicken breast', 'chicken breast raw'], ['prawns', 'prawns raw'], ['cod', 'cod raw'], ['pork loin', 'pork loin raw']]
  const ALLERGEN = ['contains_meat', 'contains_pork', 'contains_fish', 'contains_shellfish', 'contains_dairy', 'contains_egg', 'contains_gluten', 'contains_nuts', 'contains_soy', 'is_grain', 'is_legume']
  const byName = (n: string) => app.FOOD_DB.find(f => f.name === n)
  const differ = PAIRS.filter(([c, t]) => {
    const a = byName(c), b = byName(t)
    return !a || !b || ALLERGEN.some(k => !!(a.tags as Record<string, boolean>)[k] !== !!(b.tags as Record<string, boolean>)[k])
  })
  check('every twin carries exactly its cooked form\'s allergen and diet tags (a state never changes an allergen)', differ.length === 0, differ)
  const denser = PAIRS.filter(([c, t]) => (byName(t)?.per100g.kcal ?? 0) >= (byName(c)?.per100g.kcal ?? Infinity) === false && /dry/.test(t))
  check('a dry twin carries more energy per 100 g than the cooked food (water is gone)', denser.length === 0, denser)
  check('a dry line shops on its cooked twin\'s row, at its own weight', resolveGroceryTarget('75g dry pasta'.replace(/^\d+g /, '')).canonicalKey === resolveGroceryTarget('pasta').canonicalKey)
  check('...and has a swap group, so a swap can be offered for it', swapGroupOf('pasta dry') !== null && swapGroupOf('chicken breast raw') === swapGroupOf('chicken breast'))
}

// A LATTE (11 Oct 2026, found by verify:meal-log-card): the old lookup threw "latte" away and costed
// "whole milk latte" as milk; the stricter one refused it, so the coach no longer knew a latte at all.
// It has its own row now. The milk it is made with is a word that must be accounted for: a dairy latte
// carries the dairy tag, and an oat or soy latte is a MISS, never the dairy row.
{
  const latte = app.lookupIngredient('large latte')
  check('a latte is a food the app knows, and it carries the dairy tag', latte?.name === 'latte whole milk' && !!(latte.tags as Record<string, boolean>).contains_dairy, latte?.name)
  check('...and "whole milk latte" is the same food', app.lookupIngredient('whole milk latte')?.name === 'latte whole milk')
  const plantLattes = ['oat milk latte', 'soy latte', 'almond milk latte', 'skimmed milk latte'].filter(n => app.lookupIngredient(n) !== null)
  check('a latte made with another milk is a miss, never costed as the whole-milk one', plantLattes.length === 0, plantLattes)
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} ingredient-lookup check(s) failed`); process.exit(1) }
console.log('Every word in an ingredient line is accounted for, or the line is a miss.\n')
