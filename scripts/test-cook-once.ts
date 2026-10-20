/**
 * test:cook-once — runs 7-10, H37 (20 Oct 2026). A leftover lunch is ONE BATCH with the dinner it comes from.
 *
 * The dinner card said "cook both portions together" and named only tonight's amounts; the leftover lunch is a bigger
 * portion (lunch takes 0.40 of a three-meal day, dinner 0.30), so the batch was never written down anywhere. And the
 * shopping list counted the leftover on the LUNCH: today's lunch was bought again (its dinner was cooked yesterday,
 * before the list began), and the last day's batch was short (its lunch falls after the list ends). Held here:
 *   §1 cook X, keep Y: each line's cook amount is tonight's plus tomorrow's, the keep is tomorrow's;
 *   §2 the week as served: a dinner that promises tomorrow's lunch carries that lunch's ACTUAL lines;
 *   §3 the list buys each batch once: the total equals every meal cooked in the list's days, counted independently;
 *   §4 the card and the list read the same function (the screen half is driven in verify:cook-once).
 */
import { readFileSync } from 'node:fs'
import { cookAndKeep, shoppingLinesOf } from '../src/lib/cook-once'
import { serveDates, datesFrom, addDays, leftoverLunchFrom, type MealShape } from '../src/lib/meal-rotation'
import { computeMealMacros } from '../src/lib/food-db'
import { computeSlotBudgets, type PoolOption } from '../src/lib/meal-generation'
import type { MealSlotName } from '../src/lib/meal-store'
import type { MacroTargets } from '../src/lib/types'

let failures = 0
let ran = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}
const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (p: string) => strip(readFileSync(p, 'utf8'))

function meal(slot: MealSlotName, name: string, chicken: number, rice: number): PoolOption {
  const ingredients = [{ name: 'chicken breast', quantity: chicken, unit: 'g' }, { name: 'cooked basmati rice', quantity: rice, unit: 'g' }]
  const m = computeMealMacros(ingredients)
  return { slot, name, ingredients, tags: [], macros: { calories: Math.round(m.kcal), protein: Math.round(m.protein), carbs: Math.round(m.carbs), fat: Math.round(m.fat) } }
}

console.log('\n§1 Cook X, keep Y')
{
  const targets: MacroTargets = { calories: 2200, protein: 165, carbs: 220, fat: 73 }
  const dinner = meal('dinner', 'Chicken and rice', 205, 245)
  const lunch = leftoverLunchFrom(dinner, computeSlotBudgets(targets, 3, false).lunch)
  check('the fixture is the case: tomorrow\'s lunch is a BIGGER portion than tonight\'s dinner', !!lunch && lunch.ingredients[0].quantity > dinner.ingredients[0].quantity, lunch?.ingredients)
  const rows = cookAndKeep(dinner.ingredients, lunch?.ingredients ?? [])
  check('one row per line of tonight\'s dinner', rows?.length === dinner.ingredients.length, rows)
  check('cook is tonight\'s amount plus tomorrow\'s, line by line', !!rows && !!lunch && rows.every((r, i) => r.cook === dinner.ingredients[i].quantity + lunch.ingredients[i].quantity), rows)
  check('keep is tomorrow\'s lunch, line by line', !!rows && !!lunch && rows.every((r, i) => r.keep === lunch.ingredients[i].quantity), rows)
  check('a leftover holding a line tonight\'s dinner lacks is refused (no batch line made up)', cookAndKeep(dinner.ingredients, [{ name: 'avocado', quantity: 50, unit: 'g' }]) === null)
  check('the same food in another unit is a different line, never added across units', cookAndKeep(dinner.ingredients, [{ name: 'chicken breast', quantity: 1, unit: 'piece' }]) === null)
}

// A week with batch cooking on, sized so dishes land inside the bands (the "comfortable fixture inverted" trap that
// test:leftovers §4 records: dishes a third of the budget miss tolerance and test the wrong branch).
const targets: MacroTargets = { calories: 2200, protein: 165, carbs: 220, fat: 73 }
const pools: Partial<Record<MealSlotName, PoolOption[]>> = {
  breakfast: [0, 1, 2].map(i => meal('breakfast', `breakfast-${i}`, 200 + i * 8, 240 + i * 12)),
  lunch: [0, 1, 2].map(i => meal('lunch', `lunch-${i}`, 270 + i * 8, 320 + i * 12)),
  dinner: [0, 1, 2].map(i => meal('dinner', `dinner-${i}`, 205 + i * 8, 245 + i * 12)),
}
const shape: MealShape = { mealsPerDay: 3, includeSnacks: false, batchCooking: true }
const dates = datesFrom('2026-09-28', 7)
// Last night's dinner is known, so TODAY's lunch can be its leftover: the case the list used to buy twice.
const yesterday = pools.dinner![0]
const week = serveDates({ dates, pools, targets, shape, previousDinner: yesterday })

console.log('\n§2 The dinner carries the lunch actually served tomorrow')
{
  const promised = week.map((d, i) => ({ i, dinner: d.day.chosen.dinner })).filter(x => x.dinner?.reusedTomorrow === true)
  check('the fixture is the case: several dinners promise tomorrow\'s lunch', promised.length >= 2, promised.map(p => p.i))
  check('today\'s lunch is last night\'s dinner (cooked before the list began)', week[0].day.chosen.lunch?.leftoverFrom === 'dinner', week[0].day.chosen.lunch?.name)
  const inRun = promised.filter(p => p.i + 1 < week.length)
  check('every promising dinner inside the run carries EXACTLY the lunch served the next day', inRun.length >= 1 && inRun.every(p => JSON.stringify(p.dinner!.keepForTomorrow) === JSON.stringify(week[p.i + 1].day.chosen.lunch?.ingredients)), inRun.map(p => ({ keep: p.dinner!.keepForTomorrow, lunch: week[p.i + 1].day.chosen.lunch?.ingredients })))
  check('a dinner that promises nothing keeps nothing aside', week.every(d => d.day.chosen.dinner?.reusedTomorrow === true || !d.day.chosen.dinner?.keepForTomorrow))
  const last = week[week.length - 1].day.chosen.dinner
  check('the last day\'s dinner, when it promises tomorrow, still carries tomorrow\'s portion (the batch is bought)', last?.reusedTomorrow !== true || (last.keepForTomorrow?.length ?? 0) > 0, last)
  check('...and the fixture reaches that case', last?.reusedTomorrow === true, last?.name)
  check('a leftover lunch never carries a keep of its own', week.every(d => !d.day.chosen.lunch?.keepForTomorrow))
}

console.log('\n§2b A swap moves the promise, and the keep goes with it')
{
  // Two swaps, each pinned for a date, the way the screen's swap writes them. A LUNCH swapped on the day after a
  // promising dinner breaks the promise; a DINNER swapped to another dish makes a new one (tomorrow's lunch is
  // re-made from it). The rotation's own keep is stale in both, so the served week must replace it.
  const i = week.findIndex((d, k) => k + 2 < week.length && d.day.chosen.dinner?.reusedTomorrow === true)
  const lunchSwap = pools.lunch!.find(o => o.name !== week[i + 1]?.day.chosen.lunch?.name)!
  const j = week.findIndex((d, k) => k > i + 1 && k + 1 < week.length && week[k + 1].day.chosen.lunch?.leftoverFrom === 'dinner')
  const dinnerSwap = pools.dinner!.find(o => o.name !== week[j]?.day.chosen.dinner?.name && o.name !== week[j - 1]?.day.chosen.dinner?.name)!
  const pinned = serveDates({ dates, pools, targets, shape, previousDinner: yesterday, pinsByDate: { [dates[i + 1]]: { lunch: lunchSwap }, [dates[j]]: { dinner: dinnerSwap } } })
  check('the fixture is the case: a promising dinner, then a day with room for a dinner swap', i >= 0 && j > i + 1, { i, j })
  const broken = pinned[i].day.chosen.dinner
  check('a lunch swapped the next day: tonight\'s dinner promises nothing', pinned[i + 1].day.chosen.lunch?.name === lunchSwap.name && broken?.reusedTomorrow !== true, broken)
  check('...and keeps nothing aside for it', !broken?.keepForTomorrow, broken?.keepForTomorrow)
  const swapped = pinned[j].day.chosen.dinner
  const next = pinned[j + 1].day.chosen.lunch
  check('a dinner swapped: tomorrow\'s lunch is made from it', swapped?.name.startsWith(dinnerSwap.name) === true && next?.leftoverFrom === 'dinner' && next.name === swapped?.name, { swapped: swapped?.name, next: next?.name })
  check('...and the swapped dinner carries that lunch\'s own lines', swapped?.reusedTomorrow === true && JSON.stringify(swapped.keepForTomorrow) === JSON.stringify(next?.ingredients), { keep: swapped?.keepForTomorrow, lunch: next?.ingredients })
  const lunch = leftoverLunchFrom({ ...pools.dinner![0], reusedTomorrow: true, keepForTomorrow: pools.dinner![1].ingredients }, computeSlotBudgets(targets, 3, false).lunch)
  check('a leftover made from a dinner that carries a keep does not inherit it', !!lunch && !lunch.keepForTomorrow && lunch.reusedTomorrow !== true, lunch)
}

console.log('\n§3 The list buys each batch once')
{
  // THE LIST'S OWN RULE, stated here as data: last night's dinner is shopped for when it is on the list or was cooked
  // before the list began (grocery-store reconcileGenerated; §4 holds that it reads it this way).
  const bought = (listed: string[], food: string) => {
    const on = new Set(listed)
    return week.filter(d => on.has(d.date)).flatMap(d => {
      const prev = addDays(d.date, -1)
      const dinnerShopped = on.has(prev) || prev < dates[0]
      return (Object.values(d.day.chosen) as PoolOption[]).flatMap(o => shoppingLinesOf(o, dinnerShopped))
    }).filter(l => l.name === food).reduce((a, l) => a + l.quantity, 0)
  }
  // INDEPENDENT COUNT: what is cooked in the list's days, and what the list's days eat that nothing else on it cooks.
  const grams = (lines: readonly { name: string; quantity: number }[], food: string) => lines.filter(l => l.name === food).reduce((a, l) => a + l.quantity, 0)
  const needed = (listed: string[], food: string) => {
    const on = new Set(listed)
    let g = 0
    week.forEach((d, i) => {
      if (!on.has(d.date)) return
      for (const o of Object.values(d.day.chosen) as PoolOption[]) {
        if (o.leftoverFrom === 'dinner') {
          // Eaten today, cooked last night: bought here only when last night is a day of the list's future not on it.
          const prev = addDays(d.date, -1)
          if (!on.has(prev) && prev >= dates[0]) g += grams(o.ingredients, food)
          continue
        }
        g += grams(o.ingredients, food)
        // Tonight's batch also cooks tomorrow's lunch, whether or not tomorrow is on the list.
        if (o.slot === 'dinner' && o.reusedTomorrow) g += grams(o.keepForTomorrow ?? [], food)
      }
      void i
    })
    return g
  }
  for (const food of ['chicken breast', 'cooked basmati rice']) {
    check(`${food}: a whole week's list buys exactly what is cooked in it`, Math.abs(bought(dates, food) - needed(dates, food)) < 0.01, { bought: bought(dates, food), needed: needed(dates, food) })
  }
  // A LIST WITH A GAP: a day whose lunch is the leftover of a day NOT on the list. That lunch has to be bought on its
  // own day, or nothing on the list would buy it.
  const g = week.findIndex((d, k) => k >= 1 && k + 1 < week.length && week[k + 1].day.chosen.lunch?.leftoverFrom === 'dinner')
  const gap = dates.filter((_, k) => k !== g)
  check('the fixture is the case: a list day whose lunch is cooked on a day left off the list', g >= 1, g)
  const lunchAfterGap = week[g + 1]?.day.chosen.lunch
  check('...and that lunch is bought on its own day', !!lunchAfterGap && shoppingLinesOf(lunchAfterGap, false).length === lunchAfterGap.ingredients.length)
  for (const food of ['chicken breast', 'cooked basmati rice']) {
    check(`${food}: a list with a gap buys what its days eat, none of it twice`, Math.abs(bought(gap, food) - needed(gap, food)) < 0.01 && bought(gap, food) < bought(dates, food), { bought: bought(gap, food), needed: needed(gap, food) })
  }
  const today = week[0].day.chosen.lunch!
  check('today\'s leftover lunch puts nothing on the list (bought with yesterday\'s dinner)', shoppingLinesOf(today, true).length === 0)
  const plain = pools.breakfast![0]
  check('an ordinary meal puts its own lines on the list, unchanged', JSON.stringify(shoppingLinesOf(plain, true)) === JSON.stringify(plain.ingredients))
  const promising = week.find(d => d.day.chosen.dinner?.reusedTomorrow)?.day.chosen.dinner
  check('tomorrow\'s portion is marked as tomorrow\'s on the list', !!promising && shoppingLinesOf(promising, true).filter(l => l.forTomorrow).length === (promising.keepForTomorrow?.length ?? -1))
}

console.log('\n§4 The card and the list read the same function')
{
  const grocery = read('src/lib/grocery-store.ts')
  const at = grocery.indexOf('async function reconcileGenerated(')
  const body = at >= 0 ? grocery.slice(at, at + 2500) : ''
  check('the list adds up shoppingLinesOf(option, dinnerShopped), not option.ingredients', /for \(const ing of shoppingLinesOf\(option, dinnerShopped\)\)/.test(body) && !/for \(const ing of option\.ingredients\)/.test(body))
  check('...with last night\'s dinner shopped for when it is on the list or before the list began', /const dinnerShopped = listed\.has\(addDays\(date, -1\)\) \|\| addDays\(date, -1\) < base/.test(body))
  check('...and tomorrow\'s portion dated tomorrow only when tomorrow is on the list', /ing\.forTomorrow && tomorrowListed/.test(body) && /const tomorrowListed = listed\.has\(addDays\(date, 1\)\)/.test(body))
  const card = read('src/components/MealPlan.tsx')
  check('the dinner card draws its batch rows from cookAndKeep(option.ingredients, option.keepForTomorrow)', /cookAndKeep\(option\.ingredients, option\.keepForTomorrow\)/.test(card))
  check('...only on a dinner that promises tomorrow\'s lunch', /option\.reusedTomorrow === true && option\.keepForTomorrow && \(\(\) => \{/.test(card))
}

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('cook once: all checks passed')
