/**
 * measure:deep-pool — what a deep pool serves over four weeks (docs/plans/deep-meal-pool.md).
 *
 * For a grid of people, every library dish goes through the path a seed would take (re-portioned to the meal's
 * budget, then the real verifier with the person's diet), capped at DEEP a meal. Then 28 dates from a Monday are
 * served through the app's own serveDates, which now draws each week's menu from the pool. Printed per row:
 * different dishes a meal over the four weeks and in one week, how many of a week's dishes come back the next week,
 * days on target, and the cost of serving a week. The first row is today's shape: the first 7 dishes a meal.
 *
 * MEAL_MENU_SIZE=8 npm run measure:deep-pool   sizes the menu (default 10).
 */
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
import { fitDishToBudget } from '../src/lib/meal-library'
import { computeSlotBudgets, verifyProposal, type PoolOption } from '../src/lib/meal-generation'
import { serveDates, addDays } from '../src/lib/meal-rotation'
import { MENU_SIZE } from '../src/lib/meal-menu'
import type { MealSlotName } from '../src/lib/meal-store'
import type { MacroTargets } from '../src/lib/types'

const DEEP = Number(process.env.DEEP || 100)
const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
const START = '2026-11-09' // a Monday; rotation weeks are whatever menuWeekOf says, so the run spans 4-5 menus
const DATES = Array.from({ length: 28 }, (_, i) => addDays(START, i))

const GRID: MacroTargets[] = [[1700, 135], [2000, 150], [2300, 160], [2700, 170], [3100, 180]].map(([kcal, protein]) => {
  const fat = Math.round((kcal * 0.28) / 9)
  return { calories: kcal, protein, fat, carbs: Math.round((kcal - protein * 4 - fat * 9) / 4) }
})
const DIETS: string[][] = [[], ['vegetarian'], ['vegan'], ['dairy-free']]

function deepPool(targets: MacroTargets, diet: string[]): Partial<Record<MealSlotName, PoolOption[]>> {
  const budgets = computeSlotBudgets(targets, 3, true)
  const pools: Partial<Record<MealSlotName, PoolOption[]>> = {}
  for (const slot of SLOTS) {
    const budget = budgets[slot]!
    const out: PoolOption[] = []
    for (const dish of MEAL_LIBRARY) {
      if (dish.slot !== slot || out.length >= DEEP) continue
      const opt = verifyProposal(fitDishToBudget(dish, budget).dish, slot, budget, diet, [])
      if (opt) out.push(opt)
    }
    pools[slot] = out
  }
  return pools
}

interface Row { distinct28: number; distinctWeek: number; backNextWeek: number; onTarget: number; days: number; msWeek: number; poolSize: number }

function serve(pools: Partial<Record<MealSlotName, PoolOption[]>>, targets: MacroTargets): Row {
  const t0 = performance.now()
  const served = serveDates({ dates: DATES, pools, targets, shape: { mealsPerDay: 3, includeSnacks: true } })
  const ms = performance.now() - t0
  let distinct28 = 0, distinctWeek = 0, back = 0
  for (const slot of SLOTS) {
    const names = served.map(d => d.day.chosen[slot]?.name).filter((n): n is string => !!n)
    distinct28 += new Set(names).size
    const weeks = [0, 7, 14, 21].map(i => new Set(names.slice(i, i + 7)))
    distinctWeek += weeks.reduce((a, w) => a + w.size, 0) / weeks.length
    for (let w = 1; w < weeks.length; w++) back += [...weeks[w]].filter(n => weeks[w - 1].has(n)).length / 3
  }
  const onTarget = served.filter(d => d.day.withinTolerance).length
  const poolSize = SLOTS.reduce((a, s) => a + (pools[s]?.length ?? 0), 0) / SLOTS.length
  return { distinct28: distinct28 / SLOTS.length, distinctWeek: distinctWeek / SLOTS.length, backNextWeek: back / SLOTS.length, onTarget, days: served.length, msWeek: ms / 4, poolSize }
}

function main() {
  console.log(`DEEP POOL — every library dish that passes, up to ${DEEP} a meal; menu ${MENU_SIZE} a meal; 28 days from ${START}`)
  console.log(`${GRID.length} targets x ${DIETS.length} diets, three meals and a snack, leftovers off.\n`)
  const pad = (s: string, n: number) => s.padEnd(n)
  console.log(pad('', 36) + pad('pool/meal', 11) + pad('dishes/4wk', 12) + pad('dishes/wk', 11) + pad('back next wk', 14) + pad('on target', 11) + 'ms a week')
  const rows: Record<string, Row[]> = { today: [], deep: [] }
  for (const diet of DIETS) {
    for (const targets of GRID) {
      const pools = deepPool(targets, diet)
      const seven: typeof pools = {}
      for (const s of SLOTS) seven[s] = (pools[s] ?? []).slice(0, 7)
      rows.today.push(serve(seven, targets))
      rows.deep.push(serve(pools, targets))
    }
  }
  for (const [label, rs] of Object.entries(rows)) {
    const avg = (f: (r: Row) => number) => rs.reduce((a, r) => a + f(r), 0) / rs.length
    const on = rs.reduce((a, r) => a + r.onTarget, 0) / rs.reduce((a, r) => a + r.days, 0)
    console.log(pad(label === 'today' ? 'first 7 a meal (today\'s shape)' : `deep pool, menu ${MENU_SIZE}`, 36)
      + pad(avg(r => r.poolSize).toFixed(1), 11) + pad(avg(r => r.distinct28).toFixed(1), 12) + pad(avg(r => r.distinctWeek).toFixed(2), 11)
      + pad(avg(r => r.backNextWeek).toFixed(2), 14) + pad(`${(on * 100).toFixed(1)}%`, 11) + avg(r => r.msWeek).toFixed(0))
  }
  const slowest = Math.max(...rows.deep.map(r => r.msWeek))
  console.log(`\nslowest deep week: ${slowest.toFixed(0)} ms (this machine; a phone is several times slower)`)
}

main()
