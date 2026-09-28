/**
 * measure:meal-variety — does the Nutrition tab show a different day tomorrow?
 *
 * WHY THIS EXISTS. On 19 Sep 2026 I reported that day-to-day meal variety was
 * "wired but switched off at the call site", and that passing the history in
 * was a one-line fix. The first half was true. The second was wrong: the
 * variety preference was a 0.01 penalty added to a macro-distance score, and
 * the gap it had to overcome was a median 0.033 — so threading the history in
 * would have changed almost nothing. Nothing in the repo could have told
 * anyone that, because nobody had ever counted the days. This counts them.
 *
 * WHAT IT MEASURES. It walks a seven-day horizon through the app's OWN
 * assembleDay — threading recentNames exactly the way grocery-store's
 * assembleHorizon does — and counts how many of those seven days are
 * different from one another. Beside that: how many weeks are the same day
 * seven times (split into weeks whose one day is on target and weeks where no
 * day could be), how many served days are on target, and the mean calorie
 * miss — because variety bought with days that miss their targets would be a
 * worse app, not a better one.
 *
 * THE FIXTURE CHANGED ON 27 SEP 2026, AND NUMBERS FROM BEFORE ARE NOT
 * COMPARABLE. Ashley reported the same meals every day, eight days after this
 * script had printed "3.98 to 4.51 distinct days". Two things about the old
 * fixture hid it:
 *   1. Every pool was built from the SAME targets it was then assembled
 *      against. A real pool is sized to the targets of the day it was made,
 *      and targets move (weigh-ins, a macro split, a goal). So this now
 *      sweeps DRIFT: the pool is made for targets some percent away from the
 *      ones the day is assembled against. At 10% drift the old code served
 *      1.11 distinct days a week — the 19 Sep defect, back.
 *   2. Its dishes were one chicken breast with invented macros, which a
 *      resize (it recomputes a dish from its ingredients) turns into
 *      nonsense. Dishes are now built from real foods — a protein, a carb, a
 *      fat and a vegetable, amounts drawn at random — with macros computed
 *      from those foods, then sized the way verifyProposal accepts a real
 *      proposal: calories within CALORIE_TOLERANCE of the slot budget and
 *      protein at or above it, with no ceiling. That no-ceiling overshoot is
 *      real, and it is most of why some pools have no on-target day at all.
 * Real pools need a live database this machine cannot reach, so this is
 * still a model of them; it is a model with the two properties that mattered.
 */
import {
  assembleDay,
  computeSlotBudgets,
  DEFAULT_POOL_SIZE,
  type PoolOption,
} from '../src/lib/meal-generation'
import type { MacroTargets } from '../src/lib/types'
import { mulberry32, makeDish, DRIFTS, missingFixtureFoods } from './meal-fixture'
import type { MealSlotName } from '../src/lib/meal-store'

const HORIZON = 7
const PROFILES = 200

interface Row {
  drift: number
  profiles: number
  meanDistinct: number
  sameAllWeek: number
  sameAllWeekOnTarget: number
  daysOnTarget: number
  days: number
  meanCalorieMiss: number
}

function run(drift: number): Row {
  const row: Row = { drift, profiles: 0, meanDistinct: 0, sameAllWeek: 0, sameAllWeekOnTarget: 0, daysOnTarget: 0, days: 0, meanCalorieMiss: 0 }
  let sumDistinct = 0
  let sumMiss = 0
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
    const mealsPerDay = [2, 3, 4][Math.floor(rnd() * 3)]
    const pools: Partial<Record<MealSlotName, PoolOption[]>> = {}
    for (const [slot, b] of Object.entries(computeSlotBudgets(whenMade, mealsPerDay, false)) as [MealSlotName, MacroTargets][]) {
      pools[slot] = Array.from({ length: DEFAULT_POOL_SIZE }, (_, i) => makeDish(rnd, slot, i, b)).filter((o): o is PoolOption => o !== null)
    }
    // A pool with fewer than three options in a slot is a different question
    // (a shortfall), and would count as "no variety" for the wrong reason.
    if (Object.values(pools).some(v => !v || v.length < 3)) continue
    row.profiles++

    const recentNames: Partial<Record<MealSlotName, string[]>> = {}
    const keys: string[] = []
    let firstOnTarget = false
    for (let d = 0; d < HORIZON; d++) {
      const day = assembleDay(pools, today, recentNames, [])
      keys.push((Object.keys(day.chosen) as MealSlotName[]).sort().map(s => day.chosen[s]!.name).join('|'))
      row.days++
      if (day.withinTolerance) row.daysOnTarget++
      if (d === 0) firstOnTarget = day.withinTolerance
      sumMiss += Math.abs(day.totals.calories - today.calories) / today.calories
      for (const [slot, o] of Object.entries(day.chosen) as [MealSlotName, PoolOption][]) {
        recentNames[slot] = [...(recentNames[slot] ?? []), o.name].slice(-3)
      }
    }
    const distinct = new Set(keys).size
    sumDistinct += distinct
    if (distinct === 1) {
      row.sameAllWeek++
      if (firstOnTarget) row.sameAllWeekOnTarget++
    }
  }
  row.meanDistinct = sumDistinct / row.profiles
  row.meanCalorieMiss = sumMiss / row.days
  return row
}

function main(): void {
  const missing = missingFixtureFoods()
  if (missing.length > 0) {
    // A food the database cannot find computes as nothing, and a fixture
    // built on it measures nothing. One exit, and it says why.
    console.error(`These fixture foods are not in the food database, so nothing below would mean anything: ${missing.join(', ')}`)
    process.exit(1)
  }
  console.log('MEAL VARIETY — how many of seven days are different from one another?')
  console.log(`${PROFILES} profiles per row, ${HORIZON}-day horizon, up to ${DEFAULT_POOL_SIZE} dishes a slot, built from real foods.`)
  console.log('"Pool made at" is the targets the dishes were sized for, as a share of today\'s.\n')

  const rows = DRIFTS.map(run)
  const pad = (s: string, n: number) => s.padEnd(n)
  console.log(pad('pool made at', 14) + pad('distinct/7', 12) + pad('same day all week', 32) + pad('days on target', 20) + 'mean calorie miss')
  console.log('-'.repeat(14 + 12 + 32 + 20 + 17))
  for (const r of rows) {
    const same = `${r.sameAllWeek}/${r.profiles} (${((100 * r.sameAllWeek) / r.profiles).toFixed(1)}%), ${r.sameAllWeekOnTarget} on target`
    console.log(
      pad(`${(r.drift * 100).toFixed(0)}%`, 14)
      + pad(r.meanDistinct.toFixed(2), 12)
      + pad(same, 32)
      + pad(`${r.daysOnTarget}/${r.days} (${((100 * r.daysOnTarget) / r.days).toFixed(1)}%)`, 20)
      + `${(100 * r.meanCalorieMiss).toFixed(2)}%`,
    )
  }
  console.log('')
  console.log('A week that reads as ~1 is the same meals every day; ~7 is a different day each day.')
  console.log('"On target" beside the identical weeks counts those whose one day is correct: a pool')
  console.log('with exactly one on-target combination serves it every day, by design, because a')
  console.log('correct day always outranks a novel one. More dishes, not a looser rule, fixes those.')
}

main()
