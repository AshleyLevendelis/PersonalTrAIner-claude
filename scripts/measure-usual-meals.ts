/**
 * measure:usual-meals — what "My usual meals first" does to a real week (docs/plans/usual-meals-first.md).
 *
 * Ashley's ruling, 11 Nov 2026. For a grid of targets, a deep pool is built the way a new plan's is (every library
 * dish that passes, re-portioned to the meal). Ordinary meals, typed the way a person types them, are then put
 * through the screen's own planner (my-meals.ts planMyMeal: sized to the meal, else kept at his amounts, else refused)
 * and added. 28 dates are served through the app's own serveDates, before and after.
 *
 * Printed: how each typed meal was kept (sized / as written / refused) and whether it can be part of a day on target;
 * then, with 2, 4 and 8 usual dinners and with a full set across the meals, how many of the servings are his own,
 * how many days hold at least one, how often the same dish is served two days running (his and the plan's), and days on target before and after
 * (it must not fall).
 */
import { MEAL_LIBRARY } from '../src/lib/meal-library-data'
import { fitDishToBudget } from '../src/lib/meal-library'
import { computeSlotBudgets, verifyProposal, isFamiliarOption, type PoolOption } from '../src/lib/meal-generation'
import { serveDates, addDays } from '../src/lib/meal-rotation'
import { planMyMeal, type MyMealContext } from '../src/lib/my-meals'
import { dishLandsADay } from '../src/lib/meal-top-up'
import type { MealSlotName } from '../src/lib/meal-store'
import type { MacroTargets } from '../src/lib/types'

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
const START = '2026-11-09'
const DATES = Array.from({ length: 28 }, (_, i) => addDays(START, i))
const GRID: MacroTargets[] = [[1700, 135], [2000, 150], [2300, 160], [2700, 170], [3100, 180]].map(([kcal, protein]) => {
  const fat = Math.round((kcal * 0.28) / 9)
  return { calories: kcal, protein, fat, carbs: Math.round((kcal - protein * 4 - fat * 9) / 4) }
})
type Pools = Partial<Record<MealSlotName, PoolOption[]>>

/** Typed as a person types them: amounts he would know, foods by their everyday names. */
const USUAL: { slot: MealSlotName; name: string; lines: string[] }[] = [
  { slot: 'dinner', name: 'Chicken, rice and veg', lines: ['150g chicken breast', '70g dry rice', '100g broccoli'] },
  { slot: 'dinner', name: 'Spag bol', lines: ['150g 5% beef mince', '90g dry pasta', '150g passata'] },
  { slot: 'dinner', name: 'Salmon and potatoes', lines: ['170g raw salmon fillet', '350g raw potato', '120g broccoli'] },
  { slot: 'dinner', name: 'Chicken stir-fry', lines: ['160g chicken breast', '80g dry egg noodles', '120g bell pepper', '10g olive oil'] },
  { slot: 'dinner', name: 'Sausage and mash', lines: ['3 pork sausages', '300g raw potato', '80g peas'] },
  { slot: 'dinner', name: 'Chilli and rice', lines: ['150g 10% beef mince', '120g kidney beans', '70g dry rice', '150g passata'] },
  { slot: 'dinner', name: 'Jacket potato, beans and cheese', lines: ['350g raw potato', '200g baked beans', '40g cheddar cheese'] },
  { slot: 'dinner', name: 'Steak and chips', lines: ['200g sirloin steak', '250g oven chips', '80g peas'] },
  { slot: 'lunch', name: 'Tuna rice bowl', lines: ['150g canned tuna', '90g dry basmati rice', '80g sweetcorn'] },
  { slot: 'lunch', name: 'Chicken wrap', lines: ['1 tortilla wrap', '120g chicken breast', '30g cheddar cheese', '50g lettuce'] },
  { slot: 'lunch', name: 'Cheese sandwich', lines: ['2 slices wholemeal bread', '40g cheddar cheese', '10g butter'] },
  { slot: 'lunch', name: 'Ham and egg salad', lines: ['100g ham', '2 eggs', '100g lettuce', '100g tomato', '10g olive oil'] },
  { slot: 'lunch', name: 'Beans on toast', lines: ['200g baked beans', '2 slices wholemeal bread'] },
  { slot: 'lunch', name: 'Turkey pasta', lines: ['170g raw turkey breast', '90g dry pasta', '150g passata'] },
  { slot: 'breakfast', name: 'Porridge with banana', lines: ['80g oats', '300ml semi-skimmed milk', '1 banana'] },
  { slot: 'breakfast', name: 'Eggs on toast', lines: ['3 eggs', '2 slices wholemeal bread'] },
  { slot: 'breakfast', name: 'Yoghurt and granola', lines: ['200g fat-free greek yoghurt', '50g granola', '80g blueberries'] },
  { slot: 'breakfast', name: 'Cereal and milk', lines: ['50g cornflakes', '250ml semi-skimmed milk'] },
  { slot: 'breakfast', name: 'Bacon sandwich', lines: ['3 rashers bacon', '2 slices white bread'] },
  { slot: 'snack', name: 'Apple and peanut butter', lines: ['1 apple', '20g peanut butter'] },
  { slot: 'snack', name: 'Yoghurt and berries', lines: ['150g fat-free greek yoghurt', '80g blueberries'] },
  { slot: 'snack', name: 'Protein shake', lines: ['30g whey protein', '250ml semi-skimmed milk'] },
]

function deepPool(targets: MacroTargets): Pools {
  const budgets = computeSlotBudgets(targets, 3, true)
  const pools: Pools = {}
  for (const slot of SLOTS) {
    const budget = budgets[slot]!
    const out: PoolOption[] = []
    for (const dish of MEAL_LIBRARY) {
      if (dish.slot !== slot || out.length >= 100) continue
      const opt = verifyProposal(fitDishToBudget(dish, budget).dish, slot, budget, [], [])
      if (opt) out.push(opt)
    }
    pools[slot] = out
  }
  return pools
}

const ctxFor = (targets: MacroTargets, pools: Pools): MyMealContext => ({
  profileId: 'measure', targets, mealsPerDay: 3, includeSnacks: true, dietaryPreferences: [], dislikedFoods: [], todayDate: START, pools,
})

function week(pools: Pools, targets: MacroTargets) {
  // Leftovers OFF: a lunch that is last night's dinner would count his dinner twice and hide what the pick itself does.
  const served = serveDates({ dates: DATES, pools, targets, shape: { mealsPerDay: 3, includeSnacks: true, batchCooking: false } })
  let servings = 0, mine = 0, daysWithMine = 0
  // The same dish in the same meal on consecutive dates: his own, and anybody's. Split by where in the week it falls,
  // because a week's days are worked out as a cycle of seven and the menu changes on a Monday.
  const back = { mine: 0, plan: 0, wedThu: 0, sunMon: 0, elsewhere: 0 }
  served.forEach((d, i) => {
    const here = SLOTS.map(s => d.day.chosen[s]).filter((o): o is PoolOption => !!o)
    servings += here.length
    const fam = here.filter(isFamiliarOption)
    mine += fam.length
    if (fam.length > 0) daysWithMine++
    if (i === 0) return
    for (const s of SLOTS) {
      const a = served[i - 1].day.chosen[s], b = d.day.chosen[s]
      if (!a || !b || a.name !== b.name) continue
      if (isFamiliarOption(b)) back.mine++; else back.plan++
      const weekday = new Date(`${d.date}T12:00:00Z`).getUTCDay() // 1 = Monday
      if (weekday === 4) back.wedThu++; else if (weekday === 1) back.sunMon++; else back.elsewhere++
    }
  })
  return { servings, mine, daysWithMine, back, onTarget: served.filter(d => d.day.withinTolerance).length, days: served.length }
}

function main() {
  console.log(`USUAL MEALS — ${USUAL.length} ordinary meals as typed, ${GRID.length} targets, deep pool, 28 days from ${START}\n`)

  console.log('1. How each typed meal is kept, and whether it can be part of a day on target (of 5 targets)')
  const kept = new Map<string, { sized: number; asWritten: number; refused: string[]; lands: number; judged: number }>()
  const poolsByTarget = GRID.map(deepPool)
  for (const u of USUAL) {
    const row = { sized: 0, asWritten: 0, refused: [] as string[], lands: 0, judged: 0 }
    GRID.forEach((targets, gi) => {
      const pools = poolsByTarget[gi]
      const plan = planMyMeal(ctxFor(targets, pools), { name: u.name, slot: u.slot, lines: u.lines.join('\n') })
      if (!plan.ok) { row.refused.push(plan.reason.slice(0, 70)); return }
      if (/^Sized/.test(plan.card.portions)) row.sized++; else row.asWritten++
      const lands = dishLandsADay(pools, SLOTS, targets, u.slot, plan.payload.option, START)
      if (lands !== null) { row.judged++; if (lands) row.lands++ }
    })
    kept.set(u.name, row)
    console.log(`  ${u.slot.padEnd(9)} ${u.name.padEnd(34)} sized ${row.sized}  as written ${row.asWritten}  refused ${row.refused.length}  lands a day ${row.lands}/${row.judged}${row.refused.length ? '   <- ' + row.refused[0] : ''}`)
  }
  const all = [...kept.values()]
  const tot = (f: (r: (typeof all)[number]) => number) => all.reduce((a, r) => a + f(r), 0)
  console.log(`  TOTAL of ${USUAL.length * GRID.length}: sized ${tot(r => r.sized)}, as written ${tot(r => r.asWritten)}, refused ${tot(r => r.refused.length)}; lands a day ${tot(r => r.lands)} of ${tot(r => r.judged)} judged`)

  console.log('\n2. What a four-week plan serves (mean over the 5 targets)')
  const sets: [string, (u: (typeof USUAL)[number], i: number, bySlot: Record<string, number>) => boolean][] = [
    ['no usual meals', () => false],
    ['2 usual dinners', (u, _i, n) => u.slot === 'dinner' && n.dinner < 2],
    ['4 usual dinners', (u, _i, n) => u.slot === 'dinner' && n.dinner < 4],
    ['8 usual dinners', (u, _i, n) => u.slot === 'dinner' && n.dinner < 8],
    ['a full set (3 breakfasts, 3 lunches, 4 dinners, 2 snacks)', (u, _i, n) => n[u.slot] < ({ breakfast: 3, lunch: 3, dinner: 4, snack: 2 } as Record<string, number>)[u.slot]],
    ['everything (all 22)', () => true],
  ]
  for (const [label, take] of sets) {
    const acc = { servings: 0, mine: 0, daysWithMine: 0, onTarget: 0, days: 0, added: 0, backMine: 0, backPlan: 0, wedThu: 0, sunMon: 0, elsewhere: 0 }
    GRID.forEach((targets, gi) => {
      const pools: Pools = Object.fromEntries(SLOTS.map(s => [s, [...(poolsByTarget[gi][s] ?? [])]]))
      const n: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 }
      USUAL.forEach((u, i) => {
        if (!take(u, i, n)) return
        const plan = planMyMeal(ctxFor(targets, pools), { name: u.name, slot: u.slot, lines: u.lines.join('\n') })
        if (!plan.ok) return
        pools[u.slot]!.push(plan.payload.option)
        n[u.slot]++
        acc.added++
      })
      const w = week(pools, targets)
      acc.servings += w.servings; acc.mine += w.mine; acc.daysWithMine += w.daysWithMine; acc.onTarget += w.onTarget; acc.days += w.days
      acc.backMine += w.back.mine; acc.backPlan += w.back.plan; acc.wedThu += w.back.wedThu; acc.sunMon += w.back.sunMon; acc.elsewhere += w.back.elsewhere
    })
    console.log(`  ${label.padEnd(58)} kept ${(acc.added / GRID.length).toFixed(1)}  his own: ${((100 * acc.mine) / acc.servings).toFixed(1)}% of ${acc.servings} servings, on ${((100 * acc.daysWithMine) / acc.days).toFixed(0)}% of days; days on target ${acc.onTarget}/${acc.days} (${((100 * acc.onTarget) / acc.days).toFixed(1)}%)`)
    console.log(`  ${''.padEnd(58)} same dish two days running: his ${acc.backMine}, plan dishes ${acc.backPlan}  (Wed to Thu ${acc.wedThu}, Sun to Mon ${acc.sunMon}, any other pair of days ${acc.elsewhere})`)
  }
}
main()
