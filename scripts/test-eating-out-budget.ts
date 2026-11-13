// test:eating-out-budget — his 13 Nov 2026 strategy, slice 5 (docs/plans/eating-out-budget.md): a meal out is a range
// (his ruling "A range"), the same day holds the budget, protein is kept, the floor is never breached, and the next day is
// not cut to make up for it. Run on dishes made of real foods, across a grid of targets and every size.
import { readFileSync } from 'fs'
import { eatingOutRange, eatingOutRangeWords, EATING_OUT_WORDS, eatingOutOption, EATING_OUT_SIZES } from '../src/lib/eating-out'
import { serveMealWeek } from '../src/lib/meal-rotation'
import { computeSlotBudgets, type PoolOption } from '../src/lib/meal-generation'
import type { MealSlotName } from '../src/lib/meal-store'
import type { MacroTargets } from '../src/lib/types'
import { makeDish, mulberry32 } from './meal-fixture'

let passed = 0
let failed = 0
const check = (name: string, ok: boolean, detail: unknown = '') => {
  if (ok) { passed++; console.log(`  ok: ${name}`) }
  else { failed++; console.log(`  FAIL: ${name} — ${JSON.stringify(detail).slice(0, 300)}`) }
}

console.log('test:eating-out-budget\n')

console.log('1. A meal out is a range (his ruling "A range")')
check('760 kcal reads 650-850 (±15%, to the nearest 50)', JSON.stringify(eatingOutRange(760)) === '{"low":650,"high":850}', eatingOutRange(760))
check('the words carry both ends and an en dash', eatingOutRangeWords(1030) === 'about 900–1,200 kcal', eatingOutRangeWords(1030))
const note = EATING_OUT_WORDS.note('normal', 1030)
check('the meal\'s note says the range and that the day counts the middle', note.includes('about 900–1,200 kcal') && /counts the middle/.test(note) && !/about 1,030 kcal/.test(note), note)
const chat = readFileSync('src/components/ChatAssistant.tsx', 'utf8')
check('the coach\'s two cards quote the range, never a single figure',
  (chat.match(/eatingOutRangeWords\(/g) ?? []).length >= 2 && !/about \$\{(est\.calories|r\.option\.macros\.calories)\.toLocaleString/.test(chat))
const coach = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
check('the coach suggests 2 or 3 orders, one reason each, and never says a dish is free of an allergen',
  /SUGGESTED ORDERS/.test(coach) && /2 or 3 orders/.test(coach) && /ONE reason each/.test(coach) && /never say a dish is free of an allergen/.test(coach))
check('...and never tells him to eat less tomorrow or earn it with exercise', /never tell them to eat less tomorrow or skip a meal/.test(coach) && /never suggest earning it with extra exercise/.test(coach))

console.log('\n2. The same day holds it: protein kept, the floor never breached, the next day untouched')
const TODAY = '2026-11-13'
const DATES = ['2026-11-13', '2026-11-14', '2026-11-15']
const shape = { mealsPerDay: 3, includeSnacks: false, batchCooking: false }
const FLOOR = 1500 // the calorie target's own floor for a man (macro-calculator), the lower of the two never reached here
let cases = 0, floorOk = 0, totalAtLeastTarget = 0, proteinKept = 0, homeCapped = 0, nextDayUntouched = 0, shrunkCases = 0
let minProteinShare = Infinity
let notPast = 0
for (const kcal of [1800, 2200, 2800, 3400]) {
  const T: MacroTargets = { calories: kcal, protein: Math.round(kcal * 0.075), carbs: Math.round(kcal * 0.11), fat: Math.round(kcal * 0.033) }
  const budgets = computeSlotBudgets(T, 3, false)
  const rnd = mulberry32(kcal)
  const pools: Partial<Record<MealSlotName, PoolOption[]>> = {}
  for (const slot of ['breakfast', 'lunch', 'dinner'] as MealSlotName[]) {
    pools[slot] = Array.from({ length: 5 }, (_, i) => makeDish(rnd, slot, i, budgets[slot]!, { shape: 0.1 })).filter((d): d is PoolOption => !!d)
  }
  const plain = serveMealWeek({ today: TODAY, dates: DATES, todaysPins: {}, pinsByDate: {}, pools, targets: T, softLikedFoods: [], shape, rotation: null })
  for (const size of EATING_OUT_SIZES) {
    const out = eatingOutOption('dinner', TODAY, budgets.dinner!, size)
    const withPools = { ...pools, dinner: [...(pools.dinner ?? []), out] }
    const served = serveMealWeek({ today: TODAY, dates: DATES, todaysPins: { dinner: out }, pinsByDate: {}, pools: withPools, targets: T, softLikedFoods: [], shape, rotation: null })
    const day = served[0].day
    const total = Object.values(day.chosen).reduce((n, o) => n + (o?.macros.calories ?? 0), 0)
    const protein = Object.values(day.chosen).reduce((n, o) => n + (o?.macros.protein ?? 0), 0)
    const homePlanned = (['breakfast', 'lunch'] as MealSlotName[]).reduce((n, s) => n + (plain[0].day.chosen[s]?.macros.calories ?? 0), 0)
    const homeServed = (['breakfast', 'lunch'] as MealSlotName[]).reduce((n, s) => n + (day.chosen[s]?.macros.calories ?? 0), 0)
    // THE SAME DISH AGAINST ITSELF: a home meal on the pool at its own size, and as served beside the meal out.
    const sameDishCapped = (['breakfast', 'lunch'] as MealSlotName[]).every(s => {
      const o = day.chosen[s]; const base = (pools[s] ?? []).find(p => p.name === o?.name)
      return !o || !base || o.macros.calories >= base.macros.calories * 0.75 - 1
    })
    // NEVER GROWN PAST ITS PLANNED SIZE: keeping protein brings a dish back toward the plan, never beyond it.
    const notPastPlan = (['breakfast', 'lunch'] as MealSlotName[]).every(s => {
      const o = day.chosen[s]; const p = plain[0].day.chosen[s]
      return !o || !p || o.name !== p.name || o.macros.calories <= p.macros.calories + 1
    })
    if (notPastPlan) notPast++
    cases++
    if (homeServed < homePlanned * 0.98) shrunkCases++
    if (total >= FLOOR) floorOk++
    if (total >= T.calories * 0.95) totalAtLeastTarget++
    if (sameDishCapped) homeCapped++
    // Within a gram of 95%: dishes are resized in whole grams of food, so the last quarter-gram is rounding.
    if (protein >= T.protein * 0.95 - 1) proteinKept++
    minProteinShare = Math.min(minProteinShare, protein / T.protein)
    const sameNext = JSON.stringify(Object.values(served[1].day.chosen).map(o => [o?.name, o?.macros.calories]))
      === JSON.stringify(Object.values(plain[1].day.chosen).map(o => [o?.name, o?.macros.calories]))
    if (sameNext) nextDayUntouched++
  }
}
console.log(`  (measured over ${cases} cases, ${shrunkCases} of them shrinking the other meals: lowest protein ${Math.round(minProteinShare * 100)}% of target)`)
check('the grid has cases where the other meals really shrink (otherwise nothing below means anything)', shrunkCases >= 4, shrunkCases)
check('the day never drops below the calorie floor', floorOk === cases, `${floorOk}/${cases}`)
check('...nor below its own target (the other meals stop at the target)', totalAtLeastTarget === cases, `${totalAtLeastTarget}/${cases}`)
check('no other meal is served at less than three quarters of its own size', homeCapped === cases, `${homeCapped}/${cases}`)
check('protein is kept: the day holds 95% of target (within a gram of rounding)', proteinKept === cases, { proteinKept, cases, minProteinShare })
check('no other meal is ever served bigger than its planned size', notPast === cases, `${notPast}/${cases}`)

console.log('\n3. A protein-rich meal out (his order told to the coach: a steak dinner), where the quarter cap decides')
{
  const T: MacroTargets = { calories: 2200, protein: 165, carbs: 242, fat: 73 }
  const budgets = computeSlotBudgets(T, 3, false)
  const rnd = mulberry32(77)
  const pools: Partial<Record<MealSlotName, PoolOption[]>> = {}
  for (const slot of ['breakfast', 'lunch', 'dinner'] as MealSlotName[]) {
    pools[slot] = Array.from({ length: 5 }, (_, i) => makeDish(rnd, slot, i, budgets[slot]!, { shape: 0.1 })).filter((d): d is PoolOption => !!d)
  }
  const plain = serveMealWeek({ today: TODAY, dates: DATES, todaysPins: {}, pinsByDate: {}, pools, targets: T, softLikedFoods: [], shape, rotation: null })
  const base = eatingOutOption('dinner', TODAY, budgets.dinner!, 'big')
  // Big, and nearly all the day's protein in it: the protein floor no longer binds, so only the quarter cap stops the
  // other meals shrinking further. (Built from his words on the coach's card in the app; here, set directly.)
  const steak = { ...base, macros: { calories: 1900, protein: 140, carbs: 90, fat: 95 } }
  const served = serveMealWeek({ today: TODAY, dates: DATES, todaysPins: { dinner: steak }, pinsByDate: {}, pools: { ...pools, dinner: [...(pools.dinner ?? []), steak] }, targets: T, softLikedFoods: [], shape, rotation: null })
  const day = served[0].day
  // Against the dish's OWN size on the plan (the pool), the size the quarter is a quarter of.
  const shares = (['breakfast', 'lunch'] as MealSlotName[]).map(s => {
    const o = day.chosen[s]; const p = (pools[s] ?? []).find(d => d.name === o?.name)
    return o && p ? o.macros.calories / p.macros.calories : null
  }).filter((x): x is number => x != null)
  void plain
  const total = Object.values(day.chosen).reduce((n, o) => n + (o?.macros.calories ?? 0), 0)
  console.log(`  (shares of planned size: ${shares.map(x => x.toFixed(2)).join(', ')}; day ${Math.round(total)} kcal of ${T.calories})`)
  check('the other meals are made smaller, and stop at three quarters of their size (the cap binds here)',
    shares.length === 2 && shares.every(x => x >= 0.74 && x <= 0.77), shares)
  check('...so the day says it runs over rather than cutting a meal further', total > T.calories * 1.05, Math.round(total))
}
{
  // A light night out with little protein in it: the meals shrink ONLY as far as the day needs (not to the cap).
  const T: MacroTargets = { calories: 2200, protein: 165, carbs: 242, fat: 73 }
  const budgets = computeSlotBudgets(T, 3, false)
  const rnd = mulberry32(78)
  const pools: Partial<Record<MealSlotName, PoolOption[]>> = {}
  for (const slot of ['breakfast', 'lunch', 'dinner'] as MealSlotName[]) {
    pools[slot] = Array.from({ length: 5 }, (_, i) => makeDish(rnd, slot, i, budgets[slot]!, { shape: 0.1 })).filter((d): d is PoolOption => !!d)
  }
  const base = eatingOutOption('dinner', TODAY, budgets.dinner!, 'normal')
  const out = { ...base, macros: { calories: Math.round(budgets.dinner!.calories * 1.2), protein: 120, carbs: 60, fat: 40 } }
  const served = serveMealWeek({ today: TODAY, dates: DATES, todaysPins: { dinner: out }, pinsByDate: {}, pools: { ...pools, dinner: [...(pools.dinner ?? []), out] }, targets: T, softLikedFoods: [], shape, rotation: null })
  const total = Object.values(served[0].day.chosen).reduce((n, o) => n + (o?.macros.calories ?? 0), 0)
  console.log(`  (a 20% bigger dinner out: day ${Math.round(total)} kcal of ${T.calories})`)
  check('a meal out a little over its share: the day lands on target, not cut below it', total >= T.calories * 0.95 && total <= T.calories * 1.05, Math.round(total))
}

check('the next day is exactly what it would have been (no compensation)', nextDayUntouched === cases, `${nextDayUntouched}/${cases}`)

console.log(`\n${passed + failed} checks ran: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
