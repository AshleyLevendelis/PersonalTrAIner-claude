/**
 * measure:meal-repeats — how often does the WEEK serve the same dish again?
 *
 * WHY THIS EXISTS. 28 Sep 2026, Ashley, on the live day strip: "a lot of the
 * days just repeat meals in a slightly different order." measure:meal-variety
 * could not have seen it. It counts whole DAYS, and a day is "different" if any
 * one slot differs, so a day whose lunch is yesterday's dinner, or a week that
 * cycles four days, both read as varied. It also calls assembleDay directly,
 * so it never ran the rotation's leftovers at all.
 *
 * WHAT IT MEASURES, through the app's OWN buildRotation and
 * assembleRotationDay, over seven consecutive dates, with the app's default
 * shape (three meals and a snack, leftovers on unless the row says off):
 *   - distinct dishes served in the week, out of every serving;
 *   - servings of a dish already served EARLIER that week (the repeats she
 *     sees), and of those, how many are back the very next day in any slot;
 *   - lunches that are yesterday's dinner (the leftovers);
 *   - days identical to the day four before (the rotation's cycle);
 *   - and, beside them, the old whole-day number and the days on target, so
 *     variety bought with days that miss their targets would show.
 * Real pools need a live database this machine cannot reach; this is the same
 * modelled pool measure:meal-variety uses (scripts/meal-fixture.ts).
 */
import { computeSlotBudgets, DEFAULT_POOL_SIZE, type PoolOption } from '../src/lib/meal-generation'
import { buildRotation, assembleRotationDay, type MealShape } from '../src/lib/meal-rotation'
import type { MacroTargets } from '../src/lib/types'
import type { MealSlotName } from '../src/lib/meal-store'
import { mulberry32, makeDish, missingFixtureFoods } from './meal-fixture'

const PROFILES = 200
const DATES = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 8, 28 + i))
  return d.toISOString().slice(0, 10)
})

interface Row {
  label: string
  profiles: number
  servings: number
  distinct: number
  repeatServings: number
  nextDay: number
  leftoverLunches: number
  cycleDays: number
  wholeDays: number
  onTarget: number
  days: number
}

function run(label: string, drift: number, batchCooking: boolean, poolSize: number): Row {
  const row: Row = { label, profiles: 0, servings: 0, distinct: 0, repeatServings: 0, nextDay: 0, leftoverLunches: 0, cycleDays: 0, wholeDays: 0, onTarget: 0, days: 0 }
  for (let p = 0; p < PROFILES; p++) {
    const rnd = mulberry32(5000 + p)
    const calories = 1600 + Math.round(rnd() * 1600)
    const protein = Math.round((calories * (0.25 + rnd() * 0.1)) / 4)
    const fat = Math.round((calories * (0.25 + rnd() * 0.1)) / 9)
    const carbs = Math.round((calories - protein * 4 - fat * 9) / 4)
    const today: MacroTargets = { calories, protein, carbs, fat }
    const whenMade: MacroTargets = {
      calories: Math.round(calories * drift), protein: Math.round(protein * drift),
      carbs: Math.round(carbs * drift), fat: Math.round(fat * drift),
    }
    // The app's defaults: three meals and a snack.
    const shape: MealShape = { mealsPerDay: 3, includeSnacks: true, batchCooking }
    const pools: Partial<Record<MealSlotName, PoolOption[]>> = {}
    for (const [slot, b] of Object.entries(computeSlotBudgets(whenMade, shape.mealsPerDay, shape.includeSnacks)) as [MealSlotName, MacroTargets][]) {
      pools[slot] = Array.from({ length: poolSize }, (_, i) => makeDish(rnd, slot, i, b)).filter((o): o is PoolOption => o !== null)
    }
    if (Object.values(pools).some(v => !v || v.length < 3)) continue
    row.profiles++

    const rotation = buildRotation(pools, today, [], shape)
    const week = DATES.map(date => assembleRotationDay(rotation, date, pools, today, [], {}))
    const seen = new Set<string>()
    const keys: string[] = []
    week.forEach((day, d) => {
      const names = (Object.values(day.chosen) as PoolOption[]).map(o => o.name)
      const yesterday = d > 0 ? new Set((Object.values(week[d - 1].chosen) as PoolOption[]).map(o => o.name)) : new Set<string>()
      for (const n of names) {
        row.servings++
        if (seen.has(n)) { row.repeatServings++; if (yesterday.has(n)) row.nextDay++ }
        seen.add(n)
      }
      if (d > 0 && day.chosen.lunch && day.chosen.lunch.name === week[d - 1].chosen.dinner?.name) row.leftoverLunches++
      const key = (Object.keys(day.chosen) as MealSlotName[]).sort().map(s => day.chosen[s]!.name).join('|')
      if (d >= 4 && key === keys[d - 4]) row.cycleDays++
      keys.push(key)
      row.days++
      if (day.withinTolerance) row.onTarget++
    })
    row.distinct += seen.size
    row.wholeDays += new Set(keys).size
  }
  return row
}

function main(): void {
  const missing = missingFixtureFoods()
  if (missing.length > 0) {
    console.error(`These fixture foods are not in the food database, so nothing below would mean anything: ${missing.join(', ')}`)
    process.exit(1)
  }
  const poolSize = Number(process.env.POOL_SIZE || DEFAULT_POOL_SIZE)
  console.log('MEAL REPEATS — how often does a week serve the same dish again?')
  console.log(`${PROFILES} profiles a row, seven dates through the app's own rotation, three meals and a snack, up to ${poolSize} dishes a slot.\n`)
  const rows = [
    run('leftovers on,  pool as made', 1.0, true, poolSize),
    run('leftovers on,  10% drift', 0.9, true, poolSize),
    run('leftovers off, pool as made', 1.0, false, poolSize),
    run('leftovers off, 10% drift', 0.9, false, poolSize),
  ]
  const per = (r: Row, n: number) => (n / r.profiles).toFixed(2)
  const pad = (s: string, n: number) => s.padEnd(n)
  console.log(pad('', 30) + pad('dishes/wk', 11) + pad('servings', 10) + pad('repeats', 9) + pad('next day', 10) + pad('lunch=last dinner', 19) + pad('day=4 before', 14) + pad('old: days/7', 13) + 'on target')
  for (const r of rows) {
    console.log(
      pad(r.label, 30) + pad(per(r, r.distinct), 11) + pad(per(r, r.servings), 10) + pad(per(r, r.repeatServings), 9) + pad(per(r, r.nextDay), 10)
      + pad(per(r, r.leftoverLunches), 19) + pad(per(r, r.cycleDays), 14) + pad(per(r, r.wholeDays), 13)
      + `${((100 * r.onTarget) / r.days).toFixed(1)}%`,
    )
  }
  console.log('\nPer week, averaged over the profiles. "repeats" are servings of a dish already served earlier that')
  console.log('week; "next day" are the repeats that were on the day before, in any slot.')
}

main()
