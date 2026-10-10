// ---------------------------------------------------------------------------
// TODAY'S MEALS AS THE SCREEN SHOWS THEM — one calculation for the header, the
// rows and the line under them (runs 3-4 of the live-app test, H24, 10 Oct 2026).
//
// The tester saw "1692 kcal planned · on the number" over four meals that
// added up to 1,801, and after the coach logged a meal that replaced a planned
// one, 1,690 over meals that added up to 1,498. The header summed the PLAN's
// dishes while a logged row showed what was eaten: two numbers for one day,
// computed in two places. Here they are one: each slot is what was eaten if
// it was logged, else the planned dish; the header is their sum; the verdict
// is judged on that sum.
//
// AND THE REST OF THE DAY FITS AROUND WHAT WAS EATEN. Ashley's ruling, 10 Oct
// 2026, from two options: A (the eaten meal stays exactly as eaten and the
// other meals re-size around it), with two conditions she set:
//   1. when other meals are re-sized, ONE line says so, with an Undo;
//   2. it only re-sizes the SAME dishes, within about 25% either way; beyond
//      that it leaves the meals alone and says plainly how far over or under
//      the day is.
// It resizes the way the day assembler already resizes a dish (scaleToTarget,
// then the macros recomputed from the scaled ingredients), so no number here
// is one the app has not costed. Nothing is saved: today's screen changes, the
// stored meals and the shopping list do not.
// ---------------------------------------------------------------------------
import { scaleToTarget } from './portion-scaler'
import { computeMealMacros } from './food-db'
import { dayVerdict, type PoolOption } from './meal-generation'
import type { MealSlotName } from './meal-store'
import type { MacroTargets } from './types'

/** Her "about 25% either way". */
export const AROUND_EATEN_MIN = 0.75
export const AROUND_EATEN_MAX = 1.25

export interface EatenMacros { kcal: number; protein: number; carbs: number; fat: number }

export interface ShownSlot {
  slot: MealSlotName
  /** The dish on the row: the plan's, or the plan's re-sized around what was eaten. */
  option: PoolOption | null
  /** What was eaten, when the slot is logged. Its macros are the row's macros. */
  eaten: EatenMacros | null
  /** The macros this row contributes to the header. */
  macros: MacroTargets
  /** Set when this dish was re-sized around an eaten meal: the factor applied. */
  resizedBy: number | null
}

export type AroundEaten =
  /** Nothing logged, nothing left to fit, or the day already on target. */
  | { kind: 'none' }
  /** Undo was tapped for this day: the plan stands, and the day is said as it is. */
  | { kind: 'kept'; deltaKcal: number }
  /** The un-eaten meals were re-sized by `factor` (one line, with Undo). */
  | { kind: 'resized'; factor: number; slots: MealSlotName[]; deltaKcal: number; eatenVsPlanKcal: number; eatenSlots: MealSlotName[] }
  /** A fit would need more than 25% either way: meals left alone, the gap said. */
  | { kind: 'too_far'; deltaKcal: number }

export interface DayAsShown {
  slots: ShownSlot[]
  totals: MacroTargets
  aroundEaten: AroundEaten
}

const ZERO: MacroTargets = { calories: 0, protein: 0, carbs: 0, fat: 0 }
const add = (a: MacroTargets, b: MacroTargets): MacroTargets => ({
  calories: a.calories + b.calories, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat,
})
const fromEaten = (e: EatenMacros): MacroTargets => ({ calories: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat })

/** One dish scaled by `factor`, costed again from its own scaled ingredients; null when it cannot be honestly. */
function resized(option: PoolOption, factor: number): PoolOption | null {
  const m = option.macros
  const result = scaleToTarget(
    option.ingredients,
    { kcal: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat },
    { kcal: m.calories * factor, protein: m.protein * factor, carbs: m.carbs * factor, fat: m.fat * factor },
  )
  if (result.rejectedReason) return null
  const costed = computeMealMacros(result.ingredients)
  if (costed.coverage < 0.999) return null
  return {
    ...option,
    ingredients: result.ingredients,
    macros: { calories: Math.round(costed.kcal), protein: Math.round(costed.protein), carbs: Math.round(costed.carbs), fat: Math.round(costed.fat) },
  }
}

export function dayAsShown(input: {
  /** The slots on screen, in order. */
  slots: MealSlotName[]
  chosen: Partial<Record<MealSlotName, PoolOption>>
  /** Summed eaten macros per logged slot. A slot absent here is not logged. */
  eatenBySlot: Partial<Record<MealSlotName, EatenMacros>>
  targets: MacroTargets | null
  /** Undo tapped for this date: show the plan's portions. */
  keepAsPlanned?: boolean
}): DayAsShown {
  const { slots, chosen, eatenBySlot, targets, keepAsPlanned } = input
  const plain = (): ShownSlot[] => slots.map(slot => {
    const eaten = eatenBySlot[slot] ?? null
    const option = chosen[slot] ?? null
    return { slot, option, eaten, macros: eaten ? fromEaten(eaten) : (option?.macros ?? ZERO), resizedBy: null }
  })
  const sum = (rows: ShownSlot[]) => rows.reduce((acc, r) => add(acc, r.macros), ZERO)

  const base = plain()
  const baseTotals = sum(base)
  const logged = base.filter(r => r.eaten)
  const open = base.filter(r => !r.eaten && r.option)
  if (!targets || logged.length === 0 || open.length === 0) return { slots: base, totals: baseTotals, aroundEaten: { kind: 'none' } }

  // QUIET UNTIL IT MATTERS: a day already inside the app's own bands is left
  // exactly as planned, the same "stay quiet until the drift is real" rule
  // the plan-level refit follows.
  if (dayVerdict(baseTotals, targets).onTarget) return { slots: base, totals: baseTotals, aroundEaten: { kind: 'none' } }
  const deltaKcal = Math.round(baseTotals.calories - targets.calories)
  if (keepAsPlanned) return { slots: base, totals: baseTotals, aroundEaten: { kind: 'kept', deltaKcal } }

  const eatenKcal = logged.reduce((s, r) => s + r.macros.calories, 0)
  const openKcal = open.reduce((s, r) => s + r.macros.calories, 0)
  const factor = openKcal > 0 ? Math.max(0, targets.calories - eatenKcal) / openKcal : 1
  if (!(factor >= AROUND_EATEN_MIN && factor <= AROUND_EATEN_MAX)) {
    return { slots: base, totals: baseTotals, aroundEaten: { kind: 'too_far', deltaKcal } }
  }
  const rows = base.map(r => {
    if (r.eaten || !r.option) return r
    const next = resized(r.option, factor)
    return next ? { ...r, option: next, macros: next.macros, resizedBy: factor } : r
  })
  // Every open dish or none: a half-resized day would describe a fit it did not make.
  if (rows.some(r => !r.eaten && r.option && r.resizedBy == null)) {
    return { slots: base, totals: baseTotals, aroundEaten: { kind: 'too_far', deltaKcal } }
  }
  return {
    slots: rows,
    totals: sum(rows),
    aroundEaten: {
      kind: 'resized', factor, slots: rows.filter(r => r.resizedBy != null).map(r => r.slot), deltaKcal,
      eatenVsPlanKcal: Math.round(eatenKcal - logged.reduce((s, r) => s + (r.option?.macros.calories ?? 0), 0)),
      eatenSlots: logged.map(r => r.slot),
    },
  }
}
