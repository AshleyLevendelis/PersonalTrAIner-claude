/**
 * measure:meal-variety — does the Nutrition tab show a different day tomorrow?
 *
 * WHY THIS EXISTS. On 19 Sep 2026 I reported that day-to-day meal variety was
 * "wired but switched off at the call site", and that passing the history in
 * was a one-line fix. The first half was true. The second was wrong: the
 * variety preference is a 0.01 penalty added to a macro-distance score, and
 * the gap it has to overcome is a median 0.033 — so threading the history in
 * would have changed almost nothing. Nothing in the repo could have told
 * anyone that, because nobody had ever counted the days. This counts them.
 *
 * WHAT IT MEASURES. It walks a seven-day horizon through the app's OWN
 * assembleDay — threading recentNames exactly the way grocery-store's
 * assembleHorizon does — and counts how many of those seven days are
 * different from one another. It also reports what that costs in macro fit
 * and how many of the chosen days land inside the tolerance bands, because a
 * variety number on its own would say nothing about whether the days are any
 * good.
 *
 * THE FIXTURE IS DERIVED, NOT INVENTED. Real pools need a live database this
 * machine cannot reach, so each option is generated to satisfy exactly the
 * bands verifyProposal enforces on a real proposal and nothing tighter:
 * calories within CALORIE_TOLERANCE of the slot budget, protein at or above
 * the slot budget with NO ceiling (the per-meal protein ceiling was tried and
 * reverted — see portion-scaler.ts), carbs and fat unconstrained. The two
 * degrees of freedom that leaves — how widely carbs/fat spread, and how far
 * protein overshoots — are swept as a grid rather than guessed at, because a
 * single fixture's answer would be that fixture's opinion. If the grid
 * disagrees with itself, the conclusion is not safe to draw.
 */
import {
  assembleDay,
  computeSlotBudgets,
  macroDistanceScore,
  DEFAULT_POOL_SIZE,
  type PoolOption,
} from '../src/lib/meal-generation'
import { CALORIE_TOLERANCE } from '../src/lib/portion-scaler'
import type { MacroTargets } from '../src/lib/types'
import type { MealSlotName } from '../src/lib/meal-store'

const HORIZON = 7
const PROFILES = 400

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

interface FixtureSetting {
  /** How far carbs and fat spread either side of the slot budget. Unconstrained per meal, so this is a free axis. */
  spread: number
  /** How far protein may overshoot the slot budget. A floor is enforced; no ceiling is. */
  proteinOvershoot: number
}

const GRID: FixtureSetting[] = [
  { spread: 0.10, proteinOvershoot: 0.10 },
  { spread: 0.10, proteinOvershoot: 0.40 },
  { spread: 0.20, proteinOvershoot: 0.25 },
  { spread: 0.40, proteinOvershoot: 0.40 },
]

function buildPools(
  targets: MacroTargets,
  mealsPerDay: number,
  rnd: () => number,
  f: FixtureSetting,
): Partial<Record<MealSlotName, PoolOption[]>> {
  const budgets = computeSlotBudgets(targets, mealsPerDay, false)
  const pools: Partial<Record<MealSlotName, PoolOption[]>> = {}
  for (const [slot, b] of Object.entries(budgets) as [MealSlotName, MacroTargets][]) {
    pools[slot] = Array.from({ length: DEFAULT_POOL_SIZE }, (_, i) => ({
      slot,
      name: `${slot}-${i}`,
      // One resolvable ingredient: this measurement is about SELECTION, and a
      // realistic ingredient list would only make the run slower without
      // changing which combination wins.
      ingredients: [{ name: 'chicken breast', quantity: 100 + i, unit: 'g' }],
      macros: {
        calories: Math.round(b.calories * (1 + (rnd() * 2 - 1) * CALORIE_TOLERANCE)),
        protein: Math.round(b.protein * (1 + rnd() * f.proteinOvershoot)),
        carbs: Math.round(b.carbs * (1 + (rnd() * 2 - 1) * f.spread)),
        fat: Math.round(b.fat * (1 + (rnd() * 2 - 1) * f.spread)),
      },
      tags: [],
    }))
  }
  return pools
}

interface Row {
  label: string
  meanDistinct: number
  weeksAllOneDay: number
  profiles: number
  meanDistance: number
  chosenInTolerance: number
  chosenDays: number
}

function run(f: FixtureSetting): Row {
  let profiles = 0
  let sumDistinct = 0
  let weeksAllOneDay = 0
  let sumDistance = 0
  let chosenDays = 0
  let inTolerance = 0

  for (let p = 0; p < PROFILES; p++) {
    const rnd = mulberry32(1000 + p)
    const calories = 1600 + Math.round(rnd() * 1600)
    const protein = Math.round((calories * (0.25 + rnd() * 0.1)) / 4)
    const fat = Math.round((calories * (0.25 + rnd() * 0.1)) / 9)
    const carbs = Math.round((calories - protein * 4 - fat * 9) / 4)
    const targets: MacroTargets = { calories, protein, carbs, fat }
    const mealsPerDay = [2, 3, 4][Math.floor(rnd() * 3)]
    const pools = buildPools(targets, mealsPerDay, rnd, f)
    if (Object.keys(pools).length === 0) continue
    profiles++

    const recentNames: Partial<Record<MealSlotName, string[]>> = {}
    const dayKeys: string[] = []
    for (let d = 0; d < HORIZON; d++) {
      const day = assembleDay(pools, targets, recentNames, [])
      const slots = (Object.keys(day.chosen) as MealSlotName[]).sort()
      dayKeys.push(slots.map(s => day.chosen[s]!.name).join('|'))
      chosenDays++
      sumDistance += macroDistanceScore(day.totals, targets)
      if (day.withinTolerance) inTolerance++
      for (const [slot, o] of Object.entries(day.chosen) as [MealSlotName, PoolOption][]) {
        const list = recentNames[slot] ?? []
        recentNames[slot] = [...list, o.name].slice(-3)
      }
    }
    const distinct = new Set(dayKeys).size
    sumDistinct += distinct
    if (distinct === 1) weeksAllOneDay++
  }

  return {
    label: `carb/fat ±${(f.spread * 100).toFixed(0)}%, protein +0-${(f.proteinOvershoot * 100).toFixed(0)}%`,
    meanDistinct: sumDistinct / profiles,
    weeksAllOneDay,
    profiles,
    meanDistance: sumDistance / chosenDays,
    chosenInTolerance: inTolerance,
    chosenDays,
  }
}

function main(): void {
  console.log('MEAL VARIETY — how many of seven days are different from one another?')
  console.log(`${PROFILES} profiles per fixture setting, ${HORIZON}-day horizon, pool size ${DEFAULT_POOL_SIZE}.`)
  console.log('Fixture options satisfy exactly the bands verifyProposal enforces; the two free')
  console.log('axes are swept so the answer is not one fixture\'s opinion.\n')

  const rows = GRID.map(run)
  const pad = (s: string, n: number) => s.padEnd(n)
  console.log(pad('fixture', 38) + pad('distinct/7', 12) + pad('weeks all 1 day', 18) + pad('macro distance', 16) + 'chosen days in tolerance')
  console.log('-'.repeat(38 + 12 + 18 + 16 + 24))
  for (const r of rows) {
    console.log(
      pad(r.label, 38) +
      pad(r.meanDistinct.toFixed(2), 12) +
      pad(`${r.weeksAllOneDay}/${r.profiles} (${((100 * r.weeksAllOneDay) / r.profiles).toFixed(1)}%)`, 18) +
      pad(r.meanDistance.toFixed(4), 16) +
      `${((100 * r.chosenInTolerance) / r.chosenDays).toFixed(1)}%`,
    )
  }

  const best = Math.max(...rows.map(r => r.meanDistinct))
  const worst = Math.min(...rows.map(r => r.meanDistinct))
  console.log('')
  console.log(`Across the whole grid: ${worst.toFixed(2)} to ${best.toFixed(2)} distinct days out of ${HORIZON}.`)
  console.log('A week that reads as ~1 is the same three meals every day; ~7 is a different day each day.')
  console.log('Read the macro-distance and in-tolerance columns beside it — variety bought by')
  console.log('shipping days that miss their targets would be a worse app, not a better one.')
}

main()
