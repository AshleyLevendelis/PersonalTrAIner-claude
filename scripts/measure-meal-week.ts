/**
 * measure:meal-week — the week Sam saw, measured the way the screen serves it (runs 7-10, H35, 19 Oct 2026).
 *
 * Sam (fat loss, about 1,690 kcal / 162 g protein / 49 g fat, three meals and a snack, leftovers on) saw 3 lunches
 * and 3 dinners in a week, one dinner five times in seven days, one lunch on four of seven days, and two days the same
 * meal for meal. measure:meal-repeats uses random targets and calls the rotation day by day, so a dinner actually
 * served never becomes the next day's lunch. This one runs serveDates, the function the Nutrition strip runs, over
 * seven consecutive dates, at Sam's targets (jittered a little per profile so 200 pools differ), and counts what he
 * counted:
 *   - different dishes in the week, and different lunches and dinners;
 *   - the most times one dish is served in the week (any meal);
 *   - servings that repeat something from the day before (any meal);
 *   - pairs of days identical meal for meal;
 *   - days on target (the day bands, 10% since 18 Oct).
 * Pools are modelled (scripts/meal-fixture.ts): his real ones are not readable from a cloud session.
 */
import { computeSlotBudgets, assembleDay, DEFAULT_POOL_SIZE, type PoolOption } from '../src/lib/meal-generation'
import { topUpPlan } from '../src/lib/meal-top-up'
import { serveDates, buildRotation, type MealShape } from '../src/lib/meal-rotation'
import type { MacroTargets } from '../src/lib/types'
import type { MealSlotName } from '../src/lib/meal-store'
import { mulberry32, makeDish, missingFixtureFoods } from './meal-fixture'

const PROFILES = 200
const DATES = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2026, 9, 16 + i)).toISOString().slice(0, 10))

interface Row { label: string; profiles: number; distinct: number; lunches: number; dinners: number; maxOne: number; nextDay: number; sameDays: number; onTarget: number; days: number; worstMax: number }

function run(label: string, drift: number, poolSize: number, topUp: 'none' | 'any' | 'fits' = 'none'): Row {
  const row: Row = { label, profiles: 0, distinct: 0, lunches: 0, dinners: 0, maxOne: 0, nextDay: 0, sameDays: 0, onTarget: 0, days: 0, worstMax: 0 }
  for (let p = 0; p < PROFILES; p++) {
    const rnd = mulberry32(9100 + p)
    const j = () => 0.95 + rnd() * 0.1
    const calories = Math.round(1690 * j())
    const protein = Math.round(162 * j())
    const fat = Math.round(49 * j())
    const carbs = Math.round((calories - protein * 4 - fat * 9) / 4)
    const today: MacroTargets = { calories, protein, carbs, fat }
    const whenMade: MacroTargets = { calories: Math.round(calories * drift), protein: Math.round(protein * drift), carbs: Math.round(carbs * drift), fat: Math.round(fat * drift) }
    const shape: MealShape = { mealsPerDay: 3, includeSnacks: true, batchCooking: true }
    const pools: Partial<Record<MealSlotName, PoolOption[]>> = {}
    for (const [slot, b] of Object.entries(computeSlotBudgets(whenMade, shape.mealsPerDay, shape.includeSnacks)) as [MealSlotName, MacroTargets][]) {
      pools[slot] = Array.from({ length: poolSize }, (_, i) => makeDish(rnd, slot, i, b)).filter((o): o is PoolOption => o !== null)
    }
    if (Object.values(pools).some(v => !v || v.length < Math.min(3, poolSize))) continue
    // "GET MORE OPTIONS", the way the run adds dishes: what topUpPlan asks for, from candidates sized to today's
    // meal (the library's fit does that), either any that pass (before 19 Oct) or only those that land a day.
    if (topUp !== 'none') {
      const plan = topUpPlan(pools, Object.keys(pools) as MealSlotName[], today)
      const bNow = computeSlotBudgets(today, shape.mealsPerDay, shape.includeSnacks)
      for (const [slot, need] of Object.entries(plan.needs) as [MealSlotName, number][]) {
        let added = 0
        for (let k = 0; k < 40 && added < need; k++) {
          const d = makeDish(rnd, slot, 200 + k, bNow[slot]!)
          if (!d) continue
          if (topUp === 'fits' && !assembleDay(pools, today, {}, [], { [slot]: d }).withinTolerance) continue
          pools[slot] = [...pools[slot]!, d]
          added++
        }
      }
    }
    row.profiles++
    const rotation = buildRotation(pools, today, [], shape)
    const week = serveDates({ dates: DATES, pools, targets: today, shape, rotation })
    const count = new Map<string, number>()
    const lunches = new Set<string>(), dinners = new Set<string>()
    const keys: string[] = []
    week.forEach((s, d) => {
      const chosen = s.day.chosen as Partial<Record<MealSlotName, PoolOption>>
      const names = (Object.values(chosen) as PoolOption[]).map(o => o.name)
      const yesterday = d > 0 ? new Set((Object.values(week[d - 1].day.chosen) as PoolOption[]).map(o => o.name)) : new Set<string>()
      for (const n of names) { count.set(n, (count.get(n) ?? 0) + 1); if (yesterday.has(n)) row.nextDay++ }
      if (chosen.lunch) lunches.add(chosen.lunch.name)
      if (chosen.dinner) dinners.add(chosen.dinner.name)
      keys.push((Object.keys(chosen) as MealSlotName[]).sort().map(sl => chosen[sl]!.name).join('|'))
      row.days++
      if (s.day.withinTolerance) row.onTarget++
    })
    for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) if (keys[a] === keys[b]) row.sameDays++
    const most = Math.max(...count.values())
    row.distinct += count.size; row.lunches += lunches.size; row.dinners += dinners.size; row.maxOne += most
    row.worstMax = Math.max(row.worstMax, most)
  }
  return row
}

function main(): void {
  const missing = missingFixtureFoods()
  if (missing.length > 0) { console.error(`Fixture foods missing from the food database: ${missing.join(', ')}`); process.exit(1) }
  console.log("MEAL WEEK — Sam's targets, served the way the Nutrition strip serves them")
  console.log(`${PROFILES} profiles a row (about 1,690 kcal / 162 P / 49 F, three meals and a snack, leftovers on), seven dates.\n`)
  const rows = [
    run(`${DEFAULT_POOL_SIZE} dishes a meal, as made`, 1.0, DEFAULT_POOL_SIZE),
    run(`${DEFAULT_POOL_SIZE} dishes a meal, 10% drift`, 0.9, DEFAULT_POOL_SIZE),
    run('3 dishes a meal, 10% drift', 0.9, 3),
    run('3, more options: any that pass', 0.9, 3, 'any'),
    run('3, more options: only if it fits', 0.9, 3, 'fits'),
  ]
  const per = (r: Row, n: number) => (n / Math.max(1, r.profiles)).toFixed(2)
  const pad = (s: string, n: number) => s.padEnd(n)
  console.log(pad('', 30) + pad('dishes', 8) + pad('lunches', 9) + pad('dinners', 9) + pad('most of one', 13) + pad('worst', 7) + pad('day after', 11) + pad('same days', 11) + 'on target')
  for (const r of rows) {
    console.log(pad(r.label, 30) + pad(per(r, r.distinct), 8) + pad(per(r, r.lunches), 9) + pad(per(r, r.dinners), 9) + pad(per(r, r.maxOne), 13)
      + pad(String(r.worstMax), 7) + pad(per(r, r.nextDay), 11) + pad(per(r, r.sameDays), 11) + `${((100 * r.onTarget) / Math.max(1, r.days)).toFixed(1)}%`)
  }
  console.log('\nPer week, averaged. "most of one": the most servings of any single dish (any meal). "day after": servings that')
  console.log('repeat something from the day before. "same days": pairs of days identical meal for meal.')
}
main()
