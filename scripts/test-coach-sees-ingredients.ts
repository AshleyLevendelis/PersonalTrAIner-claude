// ---------------------------------------------------------------------------
// Gate: the coach can see what is in the user's meals, and says so honestly.
//
// Ashley, with two screenshots: "i told the app i dont like almond butter but
// it didn't even offer to remove it from my meal. then I told it to remove it
// and it confirmed it removed it but it was still in my meal."
//
// The reply was "Looking at your plan for today, none of your scheduled meals
// actually contain almond butter, so you're all set." Her breakfast was a
// Greek Yoghurt Berry Crunch Bowl containing 13g of it.
//
// Not a lookup that went wrong — one that could not happen. The coach's whole
// view of food was dish names and macros. THE APP KNEW: the memory receipt one
// message earlier scanned item.ingredients and printed "Today's Breakfast —
// still has it". Two readers of the same data, one right and one blind.
//
// So the invariant this file exists for is §3: anything the receipt's scan can
// find must appear in the text the coach is given. That is the divergence that
// produced the false sentence, and it is the one thing a source-text check
// could never have caught.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  buildCoachMealSummary,
  mealsContaining,
  itemContains,
  ingredientNamesOf,
  MAX_INGREDIENTS_SHOWN,
} from '../src/lib/meal-ingredients'
import type { Meal, MealPlanDay } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const meal = (name: string, ingredients?: string[]): Meal => ({
  name, calories: 584, protein: 35, carbs: 82, fat: 15,
  portion_size: '1 bowl', prep: '', substitution: '', ingredients,
})

// Ashley's actual breakfast, from the screenshot.
const ASHLEY: MealPlanDay[] = [
  { meal: 'Breakfast', items: [meal('Greek Yoghurt Berry Crunch Bowl', [
    '216g 0% fat Greek yoghurt', '65g rolled oats', '17g honey',
    '9g chia seeds', '13g almond butter', '69g fresh blueberries',
  ])] },
  { meal: 'Lunch', items: [meal('Mexican Chicken Rice and Beans', ['150g chicken breast', '80g rice', 'black beans'])] },
]

console.log('\n1. The dish that started this is legible to the coach')
{
  const summary = buildCoachMealSummary(ASHLEY)
  check('the summary names the almond butter', summary.toLowerCase().includes('almond butter'), summary.slice(0, 120))
  check('...and still carries the dish name and macros',
    summary.includes('Greek Yoghurt Berry Crunch Bowl') && summary.includes('584 kcal'))
  // The exact sentence the model produced was reachable because the words were
  // not there to read. They are now.
  check('the old blind summary would NOT have contained it',
    !ASHLEY[0].items.map(i => `${i.name} (${i.calories} kcal)`).join().toLowerCase().includes('almond butter'))
}

console.log('\n2. A missing list says so; a shortened one says so')
{
  const noList = buildCoachMealSummary([{ meal: 'Dinner', items: [meal('Someone else\'s curry')] }])
  check('a dish with no ingredients is called out, not left blank',
    /ingredients not recorded for this dish/.test(noList), noList)
  check('...and does not render an empty "contains:"', !/contains:\s*($|\n|\|)/.test(noList))

  const many = Array.from({ length: MAX_INGREDIENTS_SHOWN + 4 }, (_, i) => `ingredient ${i + 1}`)
  const long = buildCoachMealSummary([{ meal: 'Lunch', items: [meal('Everything Bowl', many)] }])
  check('a long list is truncated', !long.includes(`ingredient ${MAX_INGREDIENTS_SHOWN + 1}`))
  check('...and the truncation is ANNOUNCED, never silent', /\+4 more not listed/.test(long), long.slice(-60))
  check('...while everything up to the cap is still shown',
    many.slice(0, MAX_INGREDIENTS_SHOWN).every(i => long.includes(i)))
}

console.log('\n3. THE DIVERGENCE GUARD — the receipt and the coach cannot disagree')
// The bug in one line: mealsContaining() found almond butter, the coach's text
// did not mention it, and the model answered from the text. Anything one can
// find, the other must show.
{
  const phrases = ['almond butter', 'chia', 'honey', 'chicken', 'rice', 'blueberries', 'yoghurt']
  const summary = buildCoachMealSummary(ASHLEY).toLowerCase()
  const divergent = phrases.filter(p => mealsContaining(ASHLEY, p).length > 0 && !summary.includes(p))
  check('every phrase the scan can find is visible to the coach', divergent.length === 0, divergent)

  // ...and the converse, so the guard cannot be satisfied by dumping
  // everything: a phrase in NO meal must be found by neither.
  check('a phrase in nothing is found by neither',
    mealsContaining(ASHLEY, 'marmite').length === 0 && !summary.includes('marmite'))

  // Randomised over every real ingredient, so the guard is not just the seven
  // above. This is the property, stated over the whole plan.
  const everyIngredient = ASHLEY.flatMap(m => m.items.flatMap(ingredientNamesOf))
  const missed = everyIngredient.filter(i => !summary.includes(i.toLowerCase()))
  check('...for EVERY ingredient on the plan, not just a sample', missed.length === 0, missed)
}

console.log('\n4. The matcher behaves like the generator\'s own filter')
{
  const bowl = ASHLEY[0].items[0]
  check('substring, so "almond" catches "almond butter"', itemContains(bowl, 'almond'))
  check('...and a dish name match still counts', itemContains(meal('Almond Butter Toast'), 'almond butter'))
  check('...and an empty phrase matches nothing', !itemContains(bowl, '   '))
  check('...and it is honestly NOT synonym-aware', !itemContains(bowl, 'almond paste'))
}

console.log('\n5. Both callers read the one module')
const chat = readFileSync(join(ROOT, 'src/components/ChatAssistant.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
check('the coach summary is built by the shared reader', /buildCoachMealSummary\(mealPlan\)/.test(chat))
check('the receipt scan uses the same reader', /mealsContaining\(mealPlan, targetPhrase\)/.test(chat))
check('...and neither keeps a private copy of the rule',
  !/m\.items\.some\(i => i\.name\.toLowerCase\(\)\.includes/.test(chat))

console.log('\n6. The coach is told what that section is, and what it is not')
const prompt = readFileSync(join(ROOT, 'supabase/functions/chat-gemini/index.ts'), 'utf8')
check('the meal plan is labelled as carrying ingredients', /CURRENT MEAL PLAN — WITH INGREDIENTS/.test(prompt))
check('...and named as the only ingredient data there is', /THIS IS THE ONLY INGREDIENT DATA YOU HAVE/.test(prompt))
check('a missing list is not to be read as "contains nothing"',
  /ingredients not recorded for this dish/.test(prompt) && /reading the absence as/.test(prompt))
check('a truncated list cannot rule anything out', /you cannot rule anything out/.test(prompt))

console.log('\n7. The honesty rule reaches past the eight tagged allergens')
check('preferences are covered, not just allergens', /BEYOND ALLERGENS/.test(prompt))
check('...naming the sentence that was actually sent', /none of your scheduled meals actually contain almond butter/.test(prompt))
check('...and forbidding the absence claim in general',
  /never state that a food is ABSENT from anything except by reading an ingredient list you have actually been given/.test(prompt))
check('...while still allowing the action claim',
  /I've filtered that out of future meals/.test(prompt))
// Ashley's first complaint: it never offered.
check('and it must OFFER the swap rather than leave her to find it',
  /offer to swap that meal/.test(prompt) && /propose_meal_swap/.test(prompt))
// FOUND WHILE WIRING THIS: the block is duplicated verbatim into
// _shared/coach-rules.ts and read by onboarding-chat too, which has neither a
// meal plan nor propose_meal_swap. The generic honesty half belongs in both;
// the swap instruction must not reach a coach that cannot act on it, or the
// rule becomes a promise of a button that isn't there.
{
  const shared = readFileSync(join(ROOT, 'supabase/functions/_shared/coach-rules.ts'), 'utf8')
  const onboarding = readFileSync(join(ROOT, 'supabase/functions/onboarding-chat/index.ts'), 'utf8')
  check('the generic half reaches the onboarding coach too', /BEYOND ALLERGENS/.test(shared))
  check('...but the swap instruction does not', !/propose_meal_swap/.test(shared) && !/propose_meal_swap/.test(onboarding))
  check('...because that coach has no swap tool to offer', !/propose_meal_swap/.test(onboarding))
}
// The edit must not have weakened what was already there.
check('the original allergen rule is intact',
  /Never state or imply that a specific food or meal "is safe,"/.test(prompt)
  && /Celery, sesame, mustard, lupin, and sulphites have NO tag mechanism at all/.test(prompt))

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}

console.log('\nAll coach-ingredient checks passed.')
