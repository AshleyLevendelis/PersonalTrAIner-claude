// ---------------------------------------------------------------------------
// A SWAP KEEPS THE DAY'S OTHER DISHES (runs 3-4 of the live-app test, M34).
//
// Swapping lunch changed the snack to a different recipe: a pin fixed lunch and
// the rest of the day was searched again, so any free slot could land on a new
// dish. Ashley's ruling, 10 Oct 2026, from three options: "Resize, else leave".
// The day's other meals keep the dishes they showed before the swap; they are
// re-sized together by ONE factor, about 25% either way, to land the day; if
// that cannot land it, they are left as planned and the screen says how far
// over or under the day is. Her H24 rule for a logged meal, applied to a swap,
// with the same arithmetic (day-as-shown.ts's resizeDish).
//
// SCOPE, her second answer the same day: "Plan's own dishes only". A meal she
// asked for by name, built from the fridge or edited (tagged user-requested)
// still re-plans the rest of the day, her 1 Sep "plan the rest of my meals".
// The caller decides that; this function only holds.
// ---------------------------------------------------------------------------
import { dayVerdict, type AssembledDay, type HeldAround, type PoolOption } from './meal-generation'
import { resizeDish, AROUND_EATEN_MIN, AROUND_EATEN_MAX } from './day-as-shown'
import { sameDish } from './meal-dish-identity'
import type { MealSlotName } from './meal-store'
import type { MacroTargets } from './types'

/** Most real re-sizes tried for one day: the model's best few, never the whole band. */
const MAX_PROVEN = 6

const ZERO: MacroTargets = { calories: 0, protein: 0, carbs: 0, fat: 0 }
const sum = (opts: PoolOption[]): MacroTargets => opts.reduce((a, o) => ({
  calories: a.calories + o.macros.calories, protein: a.protein + o.macros.protein,
  carbs: a.carbs + o.macros.carbs, fat: a.fat + o.macros.fat,
}), ZERO)

/**
 * The day with every slot that is not fixed holding the planned day's dish.
 * `fixed` is what the day must serve as given: her pins, and a leftover lunch
 * (it is last night's dinner, re-portioned already). Null when holding would
 * put one dish on the plate twice in a day, or there is nothing to hold; the
 * caller then keeps the search's answer.
 */
export function holdAroundPins(input: {
  /** The day as served with no pins of hers: what she saw before the swap. */
  planned: AssembledDay
  fixed: Partial<Record<MealSlotName, PoolOption>>
  targets: MacroTargets
  /** Undo tapped for this date: held at the planned sizes, the gap said. */
  keepSizes?: boolean
}): AssembledDay | null {
  const { planned, fixed, targets, keepSizes } = input
  const pools = planned.alternatives
  const slots = Object.keys(planned.chosen) as MealSlotName[]
  const heldSlots = slots.filter(s => !fixed[s] && planned.chosen[s])
  if (heldSlots.length === 0) return null
  const chosen: Partial<Record<MealSlotName, PoolOption>> = {}
  for (const s of slots) chosen[s] = fixed[s] ?? planned.chosen[s]
  for (const s of Object.keys(fixed) as MealSlotName[]) if (!chosen[s]) chosen[s] = fixed[s]
  // ONE DISH, ONCE A DAY: a held dish that is the dish she pinned elsewhere
  // would serve it twice. Then the plan's search stands, as it did before.
  const every = (Object.values(pools) as (PoolOption[] | undefined)[]).flatMap(p => p ?? [])
  const all = Object.entries(chosen) as [MealSlotName, PoolOption][]
  for (const [a, oa] of all) for (const [b, ob] of all) {
    if (a < b && sameDish(every, oa.name, ob.name)) return null
  }

  const asPlanned = sum(Object.values(chosen) as PoolOption[])
  const deltaKcal = Math.round(asPlanned.calories - targets.calories)
  const base = { ...planned, chosen, totals: asPlanned, withinTolerance: dayVerdict(asPlanned, targets).onTarget }
  if (base.withinTolerance) return { ...base, heldAround: { kind: 'none', slots: heldSlots } }
  if (keepSizes) return { ...base, heldAround: { kind: 'kept', slots: heldSlots, deltaKcal } }

  const fixedTotals = sum(Object.values(fixed) as PoolOption[])
  const heldTotals = sum(heldSlots.map(s => chosen[s]!))
  const kcalFactor = heldTotals.calories > 0 ? Math.max(0, targets.calories - fixedTotals.calories) / heldTotals.calories : 0
  // ONE FACTOR FOR THE WHOLE DAY'S NUMBERS, not calories alone: sized on
  // calories only, a day can land its calories and miss protein (measured on
  // test:meal-day-move's own fixture, 12 kcal under and off target). A straight-
  // line model ranks the factors inside the band whose day would be on target,
  // closest to the calorie factor first; the real re-size then PROVES each, and
  // the first proven one is served (a 2% factor can round to no change at all).
  // None proven: the calorie factor, and the day says what it comes to.
  const at = (f: number): MacroTargets => ({
    calories: fixedTotals.calories + f * heldTotals.calories, protein: fixedTotals.protein + f * heldTotals.protein,
    carbs: fixedTotals.carbs + f * heldTotals.carbs, fat: fixedTotals.fat + f * heldTotals.fat,
  })
  const candidates: number[] = []
  for (let step = Math.round(AROUND_EATEN_MIN * 100); step <= Math.round(AROUND_EATEN_MAX * 100); step++) {
    const f = step / 100
    if (dayVerdict(at(f), targets).onTarget) candidates.push(f)
  }
  candidates.sort((x, y) => Math.abs(x - kcalFactor) - Math.abs(y - kcalFactor))
  const tooFar: HeldAround = { kind: 'too_far', slots: heldSlots, deltaKcal }
  const resizedAt = (f: number): Partial<Record<MealSlotName, PoolOption>> | null => {
    const out = { ...chosen }
    for (const s of heldSlots) {
      const r = resizeDish(chosen[s]!, f)
      // Every held dish or none: a half-resized day describes a fit it did not make.
      if (!r) return null
      out[s] = { ...r, heldBy: f }
    }
    return out
  }
  let factor = kcalFactor
  let next: Partial<Record<MealSlotName, PoolOption>> | null = null
  for (const f of candidates.slice(0, MAX_PROVEN)) {
    const n = resizedAt(f)
    if (n && dayVerdict(sum(Object.values(n) as PoolOption[]), targets).onTarget) { factor = f; next = n; break }
  }
  if (!next) {
    if (!(kcalFactor >= AROUND_EATEN_MIN && kcalFactor <= AROUND_EATEN_MAX)) return { ...base, heldAround: tooFar }
    next = resizedAt(kcalFactor)
    if (!next) return { ...base, heldAround: tooFar }
  }
  const totals = sum(Object.values(next) as PoolOption[])
  return {
    ...planned, chosen: next, totals,
    withinTolerance: dayVerdict(totals, targets).onTarget,
    heldAround: { kind: 'resized', factor, slots: heldSlots, deltaKcal },
  }
}
