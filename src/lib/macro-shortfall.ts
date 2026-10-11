import type { MacroTargets } from '@/lib/types'
import {
  expectedByNow, isBehindPace, WAKING_DAY, PACE_WORTH_SAYING_FRACTION, MEAL_DUE_HOUR,
  type PaceBasis, type PaceClock, type PaceSlot,
} from '@/lib/pace'

/**
 * The one sentence the Personal TrAIner says at the top of the Nutrition tab.
 *
 * Extracted from NutritionDisplay rather than left inline, for the reason
 * every other derivation in this repo lives in src/lib: a rule that decides
 * WHEN TO STAY SILENT cannot be checked by reading JSX. The two thresholds
 * below are the whole behaviour — say nothing when the day is on track, say
 * nothing when the gap is small enough that the next meal closes it anyway —
 * and both are now assertable (test:nutrition-layout §2).
 *
 * Calories are deliberately not a candidate. The kcal number is the hero
 * number six lines above this sentence; repeating it as prose would be the
 * screen telling you the same fact twice and calling one of them coaching.
 */

/** One planned meal for today, in the order the meal list renders them. */
export interface PlannedMeal {
  /** Which meal of the day it is — what decides WHEN it is due (pace.ts). */
  slot: PaceSlot
  /** As the meal list labels it — "Dinner", not "dinner" or "DINNER". */
  label: string
  logged: boolean
  macros: MacroTargets
}

export interface ShortfallInput {
  /** Today's macro targets, or null when there is no body weight to compute them from. */
  targets: Pick<MacroTargets, 'protein' | 'carbs' | 'fat'> | null
  eaten: { protein: number; carbs: number; fat: number }
  waterTargetMl: number
  waterMl: number
  meals: PlannedMeal[]
  /**
   * The app's clock and whether today is the person's first day (pace.ts).
   * REQUIRED, so no caller can leave the time out: until 9 Oct 2026 this rule
   * had none, and said "Protein is behind — 162g to go" before breakfast.
   */
  clock: PaceClock
}

/**
 * Under this share of the target still outstanding, nothing is said. Being a
 * little under at 4pm is the normal shape of a day, and a line that fires on
 * it is wallpaper by Wednesday.
 *
 * NECESSARY, NOT SUFFICIENT, since 9 Oct 2026: a wide gap is only "behind"
 * when the clock says that much was due by now (pace.ts). Before that this
 * was the whole rule, and at 7am everything is 100% outstanding.
 */
export const SHORTFALL_SPEAK_FRACTION = 0.34
/**
 * A planned meal is only named if it covers at least this much of what is
 * left. Naming one that barely dents the gap makes it look handled.
 */
export const COVERING_MIN_FRACTION = 0.2

type MacroKey = 'protein' | 'carbs' | 'fat'

/**
 * With no meal plan for today there are no planned amounts to go by, so the
 * day's food is read as three main meals of a third each. Stated here rather
 * than left to fall out of an empty list: an empty list would mean "nothing is
 * ever due", and somebody with targets and no plan would never hear a word.
 */
const NO_PLAN_SLOTS: PaceSlot[] = ['breakfast', 'lunch', 'dinner']

const NOUN: Record<MacroKey | 'water', string> = { protein: 'protein', carbs: 'carbs', fat: 'fat', water: 'water' }

/** This many meals past their time and unlogged: the line says that, not a macro. */
export const LOGGING_GAP_MEALS = 3

/** Most of the day still to log: say that, not a macro. */
export function loggingGapLine(n: number): string {
  return `${n} of today's meals still to log, so these numbers are only what's logged so far.`
}

export function macroShortfallLine(input: ShortfallInput): string | null {
  const { targets, eaten, waterTargetMl, waterMl, meals, clock } = input
  // THE FIRST DAY IS QUIET, and there is no line here that makes it so:
  // `expectedByNow` is zero all day for somebody who joined today, and a gap
  // nothing of which is due is never mentioned (below). A second stop here was
  // tried and removed — breaking it changed no answer, so it held nothing.

  const mealBasis = (key: MacroKey, target: number): PaceBasis => ({
    kind: 'meals',
    meals: meals.length > 0
      ? meals.map(m => ({ slot: m.slot, amount: m.macros[key] }))
      : NO_PLAN_SLOTS.map(slot => ({ slot, amount: target / NO_PLAN_SLOTS.length })),
  })
  const gaps: { label: string; key: MacroKey | 'water'; left: number; target: number; unit: string; actual: number; expected: number }[] = []
  if (targets) {
    for (const [label, key] of [['Protein', 'protein'], ['Carbs', 'carbs'], ['Fat', 'fat']] as const) {
      gaps.push({
        label, key, unit: 'g', target: targets[key], actual: eaten[key], left: targets[key] - eaten[key],
        expected: expectedByNow(targets[key], clock, mealBasis(key, targets[key])),
      })
    }
  }
  gaps.push({
    label: 'Water', key: 'water', unit: 'ml', target: waterTargetMl, actual: waterMl, left: waterTargetMl - waterMl,
    expected: expectedByNow(waterTargetMl, clock, WAKING_DAY),
  })

  // A target of zero is not a gap of 100% — it is a number nobody set. And a
  // gap nothing of which was DUE yet is the ordinary shape of a morning, not
  // something to mention: before the time for it has passed, the line is quiet.
  const open = gaps.filter(g => g.target > 0 && g.left > 0 && g.expected > 0)
  if (open.length === 0) return null
  // ONLY THE WIDEST. Four "you're a bit under" lines is a list, and a list is
  // not a nudge.
  const widest = (list: typeof open) => list.reduce((a, b) => (b.left / b.target > a.left / a.target ? b : a))

  const unlogged = meals.filter(m => !m.logged)
  // BEHIND is the old threshold asked of what was DUE: the same third (and a
  // bit) outstanding, but of the meals whose time has passed, not of the
  // whole day. At the end of the day the two are the same rule.
  const behind = open.filter(g => isBehindPace(g.actual, g.expected, g.target, 1 - SHORTFALL_SPEAK_FRACTION))
  // NOT BEHIND, BUT THE PLAN DOES NOT COVER IT. The person is keeping up with
  // the clock, a good share of the day is still open, and the meals left to
  // log would not close it. Worth one neutral sentence — what is left, never
  // "behind". Water is left out: the app plans food, not drinks, so every
  // morning would qualify, and the ring already shows the figure.
  const uncovered = open.filter(g => {
    if (g.key === 'water' || behind.includes(g)) return false
    const key = g.key
    const planned = unlogged.reduce((sum, m) => sum + m.macros[key], 0)
    return g.left - planned >= g.target * PACE_WORTH_SAYING_FRACTION
  })
  const isBehind = behind.length > 0
  // A LOGGING GAP IS NOT AN EATING GAP (runs 3-4, LOW, decided as a CSCS
  // coach): at 9pm with three meals unlogged the line led with "Fat is
  // behind". With three or more meals whose time has passed still unlogged,
  // the numbers say what was logged, not what was eaten, so that is what is
  // said. Two is left to the ordinary line, which already names the meal
  // "still to log"; dinner at 1pm is not due and never counts.
  const dueUnlogged = unlogged.filter(m => clock.hour >= MEAL_DUE_HOUR[m.slot])
  const foodBehind = behind.filter(g => g.key !== 'water')
  if (foodBehind.length > 0 && dueUnlogged.length >= LOGGING_GAP_MEALS) return loggingGapLine(dueUnlogged.length)
  const pool = isBehind ? behind : uncovered
  if (pool.length === 0) return null
  // PROTEIN FIRST when it is one of the gaps: it is the macro a day is
  // planned around, and fat's small target made it "widest" for a few grams.
  const worst = pool.find(g => g.key === 'protein') ?? widest(pool)
  if (worst.left / worst.target < SHORTFALL_SPEAK_FRACTION) return null

  const left = `${Math.round(worst.left)}${worst.unit}`
  const bare = isBehind
    ? `${worst.label} is behind — ${left} to go.`
    : `${left} of ${NOUN[worst.key]} to come today.`
  // Water has no planned meal behind it (the app plans food, not drinks), so
  // that gap always gets the bare line rather than a meal that happens to
  // contain some liquid.
  if (worst.key === 'water') return bare

  const macroKey = worst.key
  const covering = unlogged
    .map(m => ({ label: m.label, amount: m.macros[macroKey] }))
    .sort((a, b) => b.amount - a.amount)[0]
  if (!covering || covering.amount < worst.left * COVERING_MIN_FRACTION) return bare

  // Capped at the gap: a 60g dinner against a 40g shortfall covers 40 of it,
  // not 60. The sentence is about what is missing, not about the meal.
  const covered = Math.round(Math.min(covering.amount, worst.left))
  return `${bare} Your ${covering.label.toLowerCase()} has ${covered}${worst.unit} of it, still to log.`
}
