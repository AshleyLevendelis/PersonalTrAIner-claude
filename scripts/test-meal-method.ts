// ---------------------------------------------------------------------------
// HOW TO COOK IT — the method the generator has always written, and the app
// always threw away.
//
// generate-meals asks the model for a `prep` field and receives one for every
// dish. Until 19 Sep 2026 it was read twice — to judge whether a dish was too
// heavy for its slot, and to tag the option `quick` or `standard` — and then
// discarded: PoolOption had no field for it and meal_plan_slots had no column.
// A person got a dish name and a list of weighed ingredients with no
// instructions.
//
// THE INTERESTING HALF IS NOT STORING IT, IT IS REFUSING TO STORE A WRONG ONE.
// The model proposes roughly the right portions and scaleToTarget then
// multiplies every ingredient to hit the slot budget, by as much as 2.5x. A
// method that says "fry the 200g of chicken" is describing an amount the
// ingredient list beside it no longer contains — the app printing a number it
// never verified, next to numbers it did. So the prompt asks for technique
// without amounts, and anything that still names one is dropped.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { methodSafeToShow, verifyProposal, computeSlotBudgets } from '../src/lib/meal-generation'
import type { MacroTargets } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}

// ===========================================================================
console.log('\n1. A method that names an amount is not shown')
// ===========================================================================
{
  const clean = 'Sear the chicken skin-side down until golden, then finish in the oven. Toast the rice in the pan juices before adding stock.'
  check('a method with no amounts survives intact', methodSafeToShow(clean) === clean)
  check('...and is trimmed rather than padded', methodSafeToShow(`  ${clean}  `) === clean)

  const withAmounts = [
    'Fry the 200g of chicken until golden.',
    'Add 2 tbsp olive oil to the pan.',
    'Stir in 1 tsp paprika.',
    'Pour over 500 ml of stock.',
    'Serve with 1 cup of rice.',
    'Weigh out 0.5 kg of potatoes.',
    'Grill the 6 oz steak.',
    'Use 1.5 litres of water.',
  ]
  const dropped = withAmounts.filter(m => methodSafeToShow(m) === '')
  check('every method naming a mass or volume is dropped, not shown',
    dropped.length === withAmounts.length, withAmounts.filter(m => methodSafeToShow(m) !== ''))

  // The useful half of a method is times and temperatures. A rule that ate
  // those would make the feature pointless, so it is pinned here.
  const keepThese = [
    'Simmer for 10 minutes, then rest for 5 minutes.',
    'Roast at 200C for 25 minutes.',
    'Preheat the oven to 180 degrees.',
    'Bake on gas mark 6 until risen.',
    'Fry 2 eggs until the whites set.',
    'Dice 3 onions and soften them slowly.',
  ]
  const wronglyDropped = keepThese.filter(m => methodSafeToShow(m) === '')
  check('times, temperatures and plain counts of whole items are kept',
    wronglyDropped.length === 0, wronglyDropped)

  check('nothing at all reads as no method rather than as a crash',
    methodSafeToShow(undefined) === '' && methodSafeToShow('') === '' && methodSafeToShow('   ') === '')
}

// ===========================================================================
console.log('\n2. Through the real verifier, on a real proposal')
// ===========================================================================
{
  // The same fixture shape test:meal-roundtrip uses, so this exercises the
  // actual pipeline — resolution, diet check, scaling and all — rather than
  // the string rule on its own.
  const targets: MacroTargets = { calories: 2200, protein: 165, carbs: 220, fat: 73 }
  const lunchBudget = computeSlotBudgets(targets, 3, false).lunch!
  const base = {
    slot: 'lunch',
    name: 'Verified Chicken Rice Bowl',
    ingredients: ['200g chicken breast', '220g cooked basmati rice', '1 tbsp olive oil', '100g broccoli'],
    cuisine: 'Other',
  }

  const cleanMethod = 'Season and sear the chicken, then slice it. Steam the broccoli and fold everything through the rice.'
  const accepted = verifyProposal({ ...base, prep: cleanMethod }, 'lunch', lunchBudget, [], [])
  check('a proposal is accepted at all, so this section is testing something',
    accepted !== null)
  check('...and its method comes back on the option, ready to store',
    accepted?.prep === cleanMethod, accepted?.prep)

  const dirty = verifyProposal(
    { ...base, prep: 'Sear the 200g chicken breast, then fold through the rice.' },
    'lunch', lunchBudget, [], [])
  check('the same meal with an amount in its method is still accepted',
    dirty !== null)
  check('...but arrives with no method rather than one contradicting its own ingredients',
    dirty?.prep === '', dirty?.prep)
  check('...and is otherwise the identical meal — the method is dropped, never the food',
    JSON.stringify(dirty?.ingredients) === JSON.stringify(accepted?.ingredients)
    && dirty?.macros.calories === accepted?.macros.calories)

  // The scaling that makes a written amount unsafe is real, not hypothetical:
  // prove the pipeline moved the quantities away from what was proposed.
  const proposedChicken = 200
  const scaledChicken = accepted?.ingredients.find(i => i.name.toLowerCase().includes('chicken'))?.quantity
  check('the verifier really does rescale the portions, which is why a written amount cannot be trusted',
    typeof scaledChicken === 'number' && scaledChicken !== proposedChicken,
    { proposed: proposedChicken, stored: scaledChicken })
}

// ===========================================================================
console.log('\n3. The generator is asked for technique, not amounts')
// ===========================================================================
{
  const fn = read('supabase/functions/generate-meals/index.ts')
  check('the prompt tells the model the method carries no amounts',
    /"prep"[\s\S]{0,200}NO AMOUNTS OF FOOD/.test(fn))
  check('...naming the units it means, so the instruction is checkable',
    /grams, millilitres, tablespoons, teaspoons, ounces or cups/.test(fn))
  check('...and explains WHY, so a later prompt edit does not drop it as noise',
    /rescales those amounts after you propose them/.test(fn))
  check('...while still inviting times and temperatures',
    /Times and oven temperatures are welcome/.test(fn))
  check('the worked example no longer shows a placeholder method',
    !/"prep": "Brief steps\."/.test(fn))
}

// ===========================================================================
console.log('\n4. It survives the round trip to storage')
// ===========================================================================
{
  const gen = read('src/lib/meal-generation.ts')
  const store = read('src/lib/meal-store.ts')

  // Every write path, named individually: a method that reached one of them
  // and not the others would come back empty after a regenerate or a restore,
  // which reads exactly like the model never wrote one.
  const writes = gen.match(/prep: opt\.prep \?\? ''/g) ?? []
  check('both option-writing paths carry the method into the row',
    writes.length === 2, writes.length)
  const carried = gen.match(/prep: row\.prep \?\? ''/g) ?? []
  check('...and both row-preserving paths carry it too — the meals kept across a regenerate, and the restore after a failed insert',
    carried.length === 2, carried.length)
  check('the read asks the database for the column',
    /\.select\('slot, pool_index, name, ingredients, macros, tags, prep'\)/.test(store))
  check('...and the delete-then-insert path reads it back before wiping the slot',
    /\.select\('pool_index, name, ingredients, macros, tags, prep'\)/.test(gen))
  check('a stored row with no method reads as no method, not as undefined',
    /prep: row\.prep \?\? ''/.test(store))

  check('the migration adds the column with a default, so existing rows stay valid',
    /ADD COLUMN IF NOT EXISTS prep text NOT NULL DEFAULT ''/.test(read('supabase/migrations/20260919120000_add_meal_prep_method.sql')))

  // A resize changes amounts, not technique — so it must not touch the column.
  const resize = gen.slice(gen.indexOf('export async function persistResizedPools'))
  check('resizing a day re-portions the food and leaves the method alone',
    /\.update\(\{\s*\n\s*ingredients: option\.ingredients,/.test(resize) && !/prep:/.test(resize.slice(0, resize.indexOf('return { updated'))))
}

// ===========================================================================
console.log('\n5. It reaches the screen, and only when there is one')
// ===========================================================================
{
  const card = read('src/components/MealPlan.tsx')
  check('the meal card renders the method',
    /data-meal-method=/.test(card) && /\{methodSafeToShow\(option\.prep\)\}/.test(card))
  check('...only when the meal actually has one',
    /methodSafeToShow\(option\.prep\)\.length > 0 &&/.test(card))
  // DEFENCE IN DEPTH, and the same reasoning as the dietary re-check that
  // already runs on this screen: verification is where a method naming an
  // amount is dropped, but this is where being wrong costs something. A row
  // written by a future path, or by hand, must not be able to put an
  // unverified number in front of somebody.
  check('...and the amount rule is re-applied on display rather than trusting what was stored',
    /import \{ methodSafeToShow/.test(card) && !/option\.prep \?\? ''/.test(card))
  check('...labelled, so it is not mistaken for another list of ingredients',
    />Method</.test(card))
  // BOTH ANCHORS MUST EXIST BEFORE THEY ARE COMPARED. The first version of
  // this check compared two indexOf results directly, so renaming the
  // ingredients heading made it -1 and the comparison passed for free — an
  // ordering check that silently stopped ordering anything. A mutation
  // removing the ingredients anchor now fails it rather than satisfying it.
  const iIngredients = card.indexOf('option.ingredients.length > 0 && (')
  const iMethod = card.indexOf('data-meal-method=')
  check('...and below the ingredients, which are where the amounts live',
    iIngredients >= 0 && iMethod >= 0 && iIngredients < iMethod, { iIngredients, iMethod })
  check('the legacy chat shape stops hardcoding an empty method',
    !/prep: '',/.test(strip(gen0())))
}
function gen0() { return read('src/lib/meal-generation.ts') }

// ===========================================================================
console.log('\n6. The detector is not vacuous')
// ===========================================================================
{
  // Prove the quantity rule fires on something it SHOULD reject and passes
  // something it SHOULD keep, using strings constructed here rather than any
  // the app produced — so this section cannot go quiet if the rule is
  // loosened to the point of matching nothing.
  check('the rule rejects a synthetic method that plainly names an amount',
    methodSafeToShow('Add 250g of the thing.') === '')
  check('the rule accepts a synthetic method that plainly does not',
    methodSafeToShow('Add the thing and stir.') === 'Add the thing and stir.')
}

console.log(failures === 0 ? '\nAll meal-method checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
process.exit(failures === 0 ? 0 : 1)
