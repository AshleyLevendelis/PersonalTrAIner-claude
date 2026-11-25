// test:meal-protein-spread — NO LOPSIDED LUNCH: LUNCH AND DINNER ARE THE SAME SIZE (his "Build it", 24 Nov 2026).
//
// His report: a day on target served lunch 67 g of protein (about 240 g raw tuna) beside a 23 g snack. Every macro takes
// the meal's calorie share and lunch was 0.40 of a three-meal day, so lunch carried 36% of the protein, and last night's
// dinner came back as a lunch a third bigger. Now lunch and dinner share equally (0.35 each). Held on the budgets and on
// days served from the real library through the real verifier, leftovers on (the default).
import { computeSlotBudgets, verifyProposal, type PoolOption } from '../src/lib/meal-generation'
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
import { fitDishToBudget } from '../src/lib/meal-library'
import { serveDates, addDays } from '../src/lib/meal-rotation'
import type { MealSlotName } from '../src/lib/meal-store'
import type { MacroTargets } from '../src/lib/types'

let failures = 0
let ran = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

const DAY: MacroTargets = { calories: 1970, protein: 188, carbs: 200, fat: 61 }

console.log('\n1. The budgets: on three meals lunch and dinner are the same size')
for (const snacks of [true, false]) {
  const b = computeSlotBudgets(DAY, 3, snacks, false)
  const label = snacks ? '3 meals + snack' : '3 meals'
  check(`${label}: lunch and dinner have the same calories`, b.lunch!.calories === b.dinner!.calories, { lunch: b.lunch!.calories, dinner: b.dinner!.calories })
  check(`${label}: ...and the same protein`, b.lunch!.protein === b.dinner!.protein, { lunch: b.lunch!.protein, dinner: b.dinner!.protein })
  // A LITERAL bound, not read off the split: the old lunch took 36% (with a snack) and 40% (without) of the protein.
  check(`${label}: lunch takes at most ${snacks ? 32 : 35}% of the day's protein (was ${snacks ? 36 : 40}%)`, b.lunch!.protein <= DAY.protein * (snacks ? 0.32 : 0.35) + 0.5, { lunch: b.lunch!.protein, day: DAY.protein })
  const total = (Object.values(b) as MacroTargets[]).reduce((a, m) => a + m.calories, 0)
  check(`${label}: the day's calories are unchanged`, Math.abs(total - DAY.calories) <= 2, total)
}

console.log('\n2. Served from the real library, leftovers on: no lopsided lunch, and days still land on target')
{
  const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
  const dates = Array.from({ length: 14 }, (_, i) => addDays('2026-11-09', i))
  let days = 0, onTarget = 0, leftovers = 0, worst = 0
  for (const targets of [DAY, { calories: 2300, protein: 160, carbs: 260, fat: 72 }]) {
    const budgets = computeSlotBudgets(targets, 3, true, false)
    const pools: Partial<Record<MealSlotName, PoolOption[]>> = {}
    for (const slot of SLOTS) {
      const out: PoolOption[] = []
      for (const dish of MEAL_LIBRARY) {
        if (dish.slot !== slot || out.length >= 40) continue
        const opt = verifyProposal(fitDishToBudget(dish, budgets[slot]!).dish, slot, budgets[slot]!, [], [])
        if (opt) out.push(opt)
      }
      pools[slot] = out
    }
    const evenMain = (targets.protein - budgets.snack!.protein) / 3
    for (const d of serveDates({ dates, pools, targets, shape: { mealsPerDay: 3, includeSnacks: true, skipBreakfast: false, batchCooking: true } })) {
      days++
      if (d.day.withinTolerance) onTarget++
      if (d.day.chosen.lunch?.leftoverFrom === 'dinner') leftovers++
      worst = Math.max(worst, (d.day.chosen.lunch?.macros.protein ?? 0) / evenMain)
    }
  }
  check('days were served', days === 28, days)
  check('the fixture binds: some lunches are last night\'s dinner (leftovers on)', leftovers >= 3, leftovers)
  // Measured 24 Nov 2026: 100% on target after, 99% before. A literal floor, not the measured value.
  check('days on target stay at least 95%', onTarget / days >= 0.95, `${onTarget}/${days}`)
  // Measured 24 Nov 2026 by this very check: worst lunch 1.27x an even split of the main meals' protein now, 1.44x on
  // the old split (lunch 0.40). The line sits between, so the old split fails it.
  check('no lunch runs more than 30% over an even split of the main meals\' protein', worst <= 1.30, worst.toFixed(2))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
console.log('test:meal-protein-spread passed: lunch and dinner are the same size, and no lunch is lopsided.')
