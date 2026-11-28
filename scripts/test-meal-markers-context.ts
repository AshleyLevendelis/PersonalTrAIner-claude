// WHICH OF TODAY'S MEALS ARE NOT PLANNED DISHES, FOR THE COACH (28 Nov 2026, coach-awareness audit (a) 4). Every meal
// is made by the app's own constructor for its kind (assumedMeal, eatingOutOption, freestyleOption), so the check reads
// what Nutrition would badge, not a hand-written tag.
import { buildCoachMealMarkers } from '../src/lib/meal-markers-context'
import { assumedMeal, ELSEWHERE_TAG, elsewhereState } from '../src/lib/meals-elsewhere'
import { eatingOutOption, eatingOutRangeWords, isEatingOut } from '../src/lib/eating-out'
import { freestyleOption } from '../src/lib/freestyle'
import type { PoolOption } from '../src/lib/meal-generation'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}
const DATE = '2026-11-28'
const budget = { calories: 700, protein: 45, carbs: 70, fat: 25 }
const dish = (name: string): PoolOption => ({ slot: 'breakfast', name, ingredients: [], macros: budget, tags: [] } as unknown as PoolOption)
const estimate = { ...dish('Chicken curry at work'), tags: [ELSEWHERE_TAG] } as PoolOption

console.log('1. Planned dishes only: nothing to say')
check('a day of plan dishes gives no block', buildCoachMealMarkers({ breakfast: dish('Oats'), lunch: dish('Wrap'), dinner: dish('Salmon') }) === '')

console.log('2. Each kind, by the app\'s own test')
{
  const out = eatingOutOption('dinner', DATE, budget, 'big')
  check('the eating-out option is also "cooked elsewhere" (why eating out is tested first)', isEatingOut(out) && elsewhereState(out) === 'estimate')
  const t = buildCoachMealMarkers({ breakfast: dish('Oats'), lunch: assumedMeal('lunch', budget), dinner: out, snack: estimate })
  check('the plan dish is not listed', !/Oats/.test(t), t)
  check('the assumed lunch is ASSUMED, with its name', /- Lunch \(Lunch cooked for you\): ASSUMED/.test(t), t)
  check('the meal out is EATING OUT with the screen\'s range', t.includes(`EATING OUT, an ESTIMATE of ${eatingOutRangeWords(out.macros.calories)}`) && !/- Dinner .*ASSUMED/.test(t), t)
  check('a described meal is an ESTIMATE', /- Snack \(Chicken curry at work\): an ESTIMATE/.test(t), t)
  check('each is told never to be quoted as exact', (t.match(/never quote/gi) ?? []).length >= 2, t)
  check('meals in the day\'s order', t.indexOf('- Lunch') < t.indexOf('- Dinner') && t.indexOf('- Dinner') < t.indexOf('- Snack'), t)
  check('not a freestyle day', !/FREESTYLE day/.test(t), t)
}

console.log('3. A freestyle day')
{
  const fs = { breakfast: freestyleOption('breakfast', DATE), lunch: freestyleOption('lunch', DATE), dinner: freestyleOption('dinner', DATE) }
  const t = buildCoachMealMarkers(fs)
  check('each empty meal is FREESTYLE, counting only what is logged', (t.match(/FREESTYLE, their own one-day choice/g) ?? []).length === 3, t)
  check('the day is said to be judged on protein and calories only', /FREESTYLE day: it is judged on protein and calories only/.test(t), t)
  const edited = { ...freestyleOption('lunch', DATE), name: 'Your lunch choice (Saturday) + 2 eggs', tags: [] } as PoolOption
  check('an edited freestyle meal (its name kept, tags gone) is still freestyle', /- Lunch \(Your lunch choice \(Saturday\) \+ 2 eggs\): FREESTYLE/.test(buildCoachMealMarkers({ lunch: edited })))
  const part = buildCoachMealMarkers({ breakfast: dish('Oats'), lunch: freestyleOption('lunch', DATE) }, new Set(['breakfast']))
  check('breakfast eaten before going freestyle: still a freestyle day', /FREESTYLE day/.test(part), part)
  const notDay = buildCoachMealMarkers({ breakfast: dish('Oats'), lunch: freestyleOption('lunch', DATE) })
  check('one freestyle meal beside an uneaten plan dish is not a freestyle day', !/FREESTYLE day/.test(notDay) && /FREESTYLE, their own/.test(notDay), notDay)
}

console.log(`${ran} checks ran`)
if (failures > 0) { console.log(`${failures} failed`); process.exit(1) }
console.log('PASS')
