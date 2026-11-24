/**
 * measure:meal-protein-spread — how evenly a served day's protein sits across its meals (24 Nov 2026).
 *
 * His report: a ~1,970 kcal day served lunch 67 g of protein (about 240 g raw tuna) beside a 23 g snack, on target as
 * a day. The cause (traced): every meal got the SAME share of the day's protein as of its calories, and lunch is the
 * biggest meal (36% with a snack). This builds deep pools from the real library through the real verifier for a grid
 * of people, serves 28 days through the app's own serveDates (leftovers on and off), and prints per meal the mean
 * protein served, the largest single meal, how often a main meal runs more than 15% above an even split of the main
 * meals' protein, days on target, dishes per meal over the 28 days and pool size.
 *
 * Run it before and after a change to the slot split; nothing here decides anything.
 */
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
import { fitDishToBudget } from '../src/lib/meal-library'
import { computeSlotBudgets, verifyProposal, type PoolOption } from '../src/lib/meal-generation'
import { serveDates, addDays } from '../src/lib/meal-rotation'
import type { MealSlotName } from '../src/lib/meal-store'
import type { MacroTargets } from '../src/lib/types'

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
const MAINS: MealSlotName[] = ['breakfast', 'lunch', 'dinner']
const START = '2026-11-09'
const DATES = Array.from({ length: 28 }, (_, i) => addDays(START, i))

// kcal, protein: an ordinary spread plus his day (1,970 / 188) and two high-protein bigger eaters.
const GRID: MacroTargets[] = [[1700, 135], [1970, 188], [2000, 150], [2300, 160], [2700, 190], [3100, 200]].map(([kcal, protein]) => {
  const fat = Math.round((kcal * 0.28) / 9)
  return { calories: kcal, protein, fat, carbs: Math.round((kcal - protein * 4 - fat * 9) / 4) }
})
const DIETS: string[][] = [[], ['vegetarian'], ['dairy-free']]

function deepPool(targets: MacroTargets, diet: string[]): Partial<Record<MealSlotName, PoolOption[]>> {
  const budgets = computeSlotBudgets(targets, 3, true, false)
  const pools: Partial<Record<MealSlotName, PoolOption[]>> = {}
  for (const slot of SLOTS) {
    const budget = budgets[slot]!
    const out: PoolOption[] = []
    for (const dish of MEAL_LIBRARY) {
      if (dish.slot !== slot || out.length >= 100) continue
      const opt = verifyProposal(fitDishToBudget(dish, budget).dish, slot, budget, diet, [])
      if (opt) out.push(opt)
    }
    pools[slot] = out
  }
  return pools
}

interface Acc { protein: Record<string, number[]>; maxMeal: number; lopsidedDays: number; onTarget: number; days: number; distinct: number; pool: number; runs: number }
const fresh = (): Acc => ({ protein: Object.fromEntries(SLOTS.map(s => [s, []])), maxMeal: 0, lopsidedDays: 0, onTarget: 0, days: 0, distinct: 0, pool: 0, runs: 0 })

function serve(acc: Acc, pools: Partial<Record<MealSlotName, PoolOption[]>>, targets: MacroTargets, batchCooking: boolean) {
  const served = serveDates({ dates: DATES, pools, targets, shape: { mealsPerDay: 3, includeSnacks: true, skipBreakfast: false, batchCooking } })
  const snackShare = computeSlotBudgets(targets, 3, true, false).snack?.protein ?? 0
  const even = (targets.protein - snackShare) / MAINS.length
  for (const d of served) {
    acc.days++
    if (d.day.withinTolerance) acc.onTarget++
    let lopsided = false
    for (const slot of SLOTS) {
      const p = d.day.chosen[slot]?.macros.protein
      if (p == null) continue
      acc.protein[slot].push(p)
      acc.maxMeal = Math.max(acc.maxMeal, p)
      if (MAINS.includes(slot) && p > even * 1.15) lopsided = true
    }
    if (lopsided) acc.lopsidedDays++
  }
  for (const slot of SLOTS) acc.distinct += new Set(served.map(d => d.day.chosen[slot]?.name).filter(Boolean)).size / SLOTS.length
  acc.pool += SLOTS.reduce((a, s) => a + (pools[s]?.length ?? 0), 0) / SLOTS.length
  acc.runs++
}

function main() {
  console.log(`PROTEIN SPREAD — ${GRID.length} targets x ${DIETS.length} diets, 3 meals + snack, 28 days, real library, real verifier\n`)
  const pad = (s: string, n: number) => s.padEnd(n)
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const pct = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0 }
  for (const batch of [false, true]) {
    const all = fresh()
    const his = fresh()
    for (const diet of DIETS) for (const targets of GRID) {
      const pools = deepPool(targets, diet)
      serve(all, pools, targets, batch)
      if (targets.protein === 188 && diet.length === 0) serve(his, pools, targets, batch)
    }
    for (const [label, a] of [[`all people, leftovers ${batch ? 'on' : 'off'}`, all], [`1,970 kcal / 188 g, leftovers ${batch ? 'on' : 'off'}`, his]] as const) {
      console.log(label)
      console.log('  ' + SLOTS.map(s => `${pad(s, 9)} mean ${mean(a.protein[s]).toFixed(0).padStart(3)} g  95th ${String(pct(a.protein[s], 0.95)).padStart(3)} g`).join('\n  '))
      console.log(`  largest single meal ${a.maxMeal.toFixed(0)} g; days with a main meal >15% over an even split ${((a.lopsidedDays / a.days) * 100).toFixed(1)}%`)
      console.log(`  days on target ${((a.onTarget / a.days) * 100).toFixed(1)}%; dishes a meal over 28 days ${(a.distinct / a.runs).toFixed(1)}; pool a meal ${(a.pool / a.runs).toFixed(1)}\n`)
    }
  }
}

main()
