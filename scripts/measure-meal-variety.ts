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
import { CALORIE_TOLERANCE, scaleIngredients } from '../src/lib/portion-scaler'
import { computeMealMacros, lookupIngredient, type MealIngredientLine } from '../src/lib/food-db'
import type { MacroTargets } from '../src/lib/types'
import type { MealSlotName } from '../src/lib/meal-store'

const HORIZON = 7
const PROFILES = 200

/** Seeded, so two runs of this script are comparable. Nothing here reads the clock. */
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Food = readonly [name: string, lo: number, hi: number, unit?: string]
const PROTEIN: Food[] = [['chicken breast', 100, 200], ['salmon', 100, 180], ['tuna', 80, 160], ['beef mince', 100, 180], ['greek yogurt', 150, 300], ['eggs', 2, 4, 'whole'], ['tofu', 120, 220], ['turkey breast', 100, 200], ['cottage cheese', 100, 250]]
const CARB: Food[] = [['white rice', 60, 150], ['oats', 40, 100], ['pasta', 60, 140], ['sweet potato', 150, 300], ['wholemeal bread', 2, 3, 'slice'], ['potatoes', 150, 350], ['quinoa', 50, 120], ['banana', 1, 2, 'medium'], ['lentils', 50, 120]]
const FAT: Food[] = [['olive oil', 5, 15], ['peanut butter', 10, 30], ['avocado', 50, 120], ['cheddar', 15, 40], ['almonds', 10, 30]]
const VEG: Food[] = [['broccoli', 60, 150], ['spinach', 30, 80], ['peppers', 50, 120], ['mixed berries', 50, 120], ['tomatoes', 60, 150]]

/** How far the pool's targets sit from today's. 1.00 is the old fixture's only case. */
const DRIFTS = [1.0, 0.95, 0.9, 1.1]

const pick = <T,>(rnd: () => number, xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]
function line(rnd: () => number, [name, lo, hi, unit]: Food): MealIngredientLine {
  const q = lo + rnd() * (hi - lo)
  return { name, quantity: unit ? Math.max(1, Math.round(q)) : Math.round(q), unit: unit ?? 'g' }
}
function macrosOf(ings: MealIngredientLine[]): MacroTargets {
  const c = computeMealMacros(ings)
  return { calories: Math.round(c.kcal), protein: Math.round(c.protein), carbs: Math.round(c.carbs), fat: Math.round(c.fat) }
}

/** One dish from real foods, sized the way verifyProposal accepts one, or null after enough tries. */
function makeDish(rnd: () => number, slot: MealSlotName, i: number, budget: MacroTargets): PoolOption | null {
  for (let tries = 0; tries < 200; tries++) {
    let ings = [line(rnd, pick(rnd, PROTEIN)), line(rnd, pick(rnd, CARB)), line(rnd, pick(rnd, FAT)), line(rnd, pick(rnd, VEG))]
    const first = macrosOf(ings)
    if (first.calories <= 0) continue
    ings = scaleIngredients(ings, budget.calories / first.calories)
    const m = macrosOf(ings)
    if (Math.abs(m.calories - budget.calories) / budget.calories > CALORIE_TOLERANCE) continue
    if (m.protein < budget.protein) continue
    return { slot, name: `${slot}-${i}`, ingredients: ings, macros: m, tags: [] }
  }
  return null
}

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
  const missing = [...PROTEIN, ...CARB, ...FAT, ...VEG].filter(([n]) => !lookupIngredient(n)).map(([n]) => n)
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
