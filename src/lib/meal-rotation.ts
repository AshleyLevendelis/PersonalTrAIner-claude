// ---------------------------------------------------------------------------
// MEAL ROTATION — which of the week's days is today, and one answer for every
// surface that asks.
// ---------------------------------------------------------------------------
// assembleDay is pure and stores nothing, so the app has no record of which
// meals it showed yesterday. Without one, `recentNames` is always empty and
// the day-to-day variety preference has nothing to act on — every surface
// re-derives the same single best day, for ever.
//
// TWO WAYS TO GIVE IT A YESTERDAY, and the choice matters:
//
//   - what the user LOGGED. Honest, but somebody who does not log gets no
//     variety at all, and that is most people in their first weeks.
//   - the DATE. A fixed-length rotation walked from a clean history. Needs no
//     storage, works from day one, and is deterministic.
//
// The date won. `buildRotation` walks ROTATION_DAYS days once and keeps the
// history that preceded each one; today is `epochDay % ROTATION_DAYS`.
//
// PARITY HERE IS BY CONSTRUCTION, NOT BY INSPECTION. The Nutrition tab and the
// shopping list read the SAME rotation object rather than each deriving their
// own days, so the list cannot shop for a week the tab will not show. That was
// not a hypothetical: before this existed both surfaces independently derived
// one repeated day, and the "varied week" the shopping list was documented as
// building had a measured 1.11 distinct days out of 7.
//
// NOTHING HERE READS THE MACHINE CLOCK. The date arrives as the app's own
// `YYYY-MM-DD` string (dev-clock's getSessionDateContext, which the browser
// harness overrides), and the day number is pure UTC calendar arithmetic on
// its three components — never a local-midnight subtraction, so the DST bug
// fixed on 15 Sep 2026 cannot come back through this door.
// ---------------------------------------------------------------------------

import { assembleDay, computeSlotBudgets, type AssembledDay, type PoolOption } from './meal-generation'
import { computeMealMacros, type Macros100g } from './food-db'
import { scaleToTarget, meetsProteinFloor } from './portion-scaler'
import type { MealSlotName } from './meal-store'
import type { MacroTargets } from './types'

/**
 * How many days the rotation runs before it comes round again. Seven because
 * the week is the unit the shopping list already works in, and because the
 * pools are not deep enough to fill more: with five options a slot, a measured
 * ~4 of these 7 days come out genuinely different, so a longer cycle would
 * only add repeats.
 */
export const ROTATION_DAYS = 7

/** How many days back counts as "recent" when avoiding a repeat. */
export const RECENT_WINDOW = 3

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Days since the epoch for a `YYYY-MM-DD` string.
 *
 * UTC BY CONSTRUCTION. Date.UTC on the parsed components cannot be moved by a
 * daylight-saving step, where `new Date(str).getTime() / 86400000` can: on the
 * clock-change day one local day is 23 or 25 hours long, and the fixed divisor
 * lands either side of the boundary depending on the hour. Consecutive
 * calendar dates must always be consecutive numbers here or the rotation skips
 * or repeats a day twice a year.
 *
 * An unparseable date returns 0, which puts it at rotation day 0 rather than
 * producing NaN and a blank screen.
 */
export function epochDay(date: string): number {
  const m = DATE_PATTERN.exec(date)
  if (!m) return 0
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000)
}

/** Which day of the rotation a date falls on. Always in [0, ROTATION_DAYS). */
export function rotationIndexFor(date: string): number {
  const d = epochDay(date) % ROTATION_DAYS
  return d < 0 ? d + ROTATION_DAYS : d
}

export interface Rotation {
  /** The rotation's days in order, assembled with no pins. */
  days: AssembledDay[]
  /**
   * The names to treat as recently eaten when assembling rotation day
   * `index` — the meals the preceding RECENT_WINDOW days of the rotation
   * chose. Exposed so a caller that needs to re-assemble a day with extra
   * inputs (today's pinned meals) gets the same day back rather than a
   * different one.
   */
  historyFor(index: number): Partial<Record<MealSlotName, string[]>>
  /**
   * The slots this day serves as leftovers from the day before — empty on most
   * days, and always empty when batch cooking is off or at the rotation's
   * seam. Returned as a pin map so a caller re-assembling one day gets the
   * same answer the rotation already reached.
   */
  leftoverFor(index: number): Partial<Record<MealSlotName, PoolOption>>
}

function extendHistory(
  history: Partial<Record<MealSlotName, string[]>>,
  chosen: Partial<Record<MealSlotName, PoolOption>>,
): Partial<Record<MealSlotName, string[]>> {
  const next: Partial<Record<MealSlotName, string[]>> = {}
  for (const [slot, names] of Object.entries(history) as [MealSlotName, string[]][]) next[slot] = names
  for (const [slot, option] of Object.entries(chosen) as [MealSlotName, PoolOption][]) {
    next[slot] = [...(next[slot] ?? []), option.name].slice(-RECENT_WINDOW)
  }
  return next
}

const asMacros100g = (t: MacroTargets): Macros100g => ({
  kcal: t.calories, protein: t.protein, carbs: t.carbs, fat: t.fat,
})
const asTargets = (m: Macros100g): MacroTargets => ({
  calories: Math.round(m.kcal), protein: Math.round(m.protein), carbs: Math.round(m.carbs), fat: Math.round(m.fat),
})

/**
 * The parts of a profile that decide the SHAPE of a day's meals. One object
 * rather than three arguments because the Nutrition tab and the shopping list
 * must pass identical values or they build different weeks — the failure this
 * whole module exists to prevent, and one a long argument list invites.
 */
export interface MealShape {
  mealsPerDay?: number
  includeSnacks?: boolean
  /**
   * Cook once, eat twice. UNDEFINED READS AS ON: Ashley's ruling of 19 Sep
   * 2026 was "a setting, on by default", and every profile that predates the
   * column has no value stored.
   */
  batchCooking?: boolean
}

/** Is batch cooking on for this shape? Undefined means yes. */
export function batchCookingOn(shape: MealShape | undefined): boolean {
  return (shape?.batchCooking ?? true) === true
}

/**
 * Last night's dinner, re-portioned as today's lunch — or null when it cannot
 * honestly be one.
 *
 * WHY IT IS NOT "COOK DOUBLE". Lunch takes a different share of the day from
 * dinner (0.40 against 0.30 on a three-meal split), so serving the same
 * portion twice would leave lunch a third short. Measured over 400 profiles,
 * the factor needed is a median 1.26x.
 *
 * RECOMPUTED, NOT MULTIPLIED, the same rule meal-refit lives under: scaling
 * rounds per ingredient, so the achieved size is never exactly the requested
 * factor, and multiplying the old macros would print a number the food was
 * never going to deliver.
 *
 * REFUSED RATHER THAN FORCED. A rescale the portion-scaler rejects, or one
 * that lands under the lunch protein floor, returns null and that day simply
 * gets an ordinary lunch. Measured: 6.7% of dinners fall out here, all of them
 * on protein — none on portion size. Batch cooking is a preference, not a
 * constraint the pool has to satisfy.
 */
export function leftoverLunchFrom(
  dinner: PoolOption | null | undefined,
  lunchBudget: MacroTargets | undefined,
): PoolOption | null {
  if (!dinner || !lunchBudget || lunchBudget.calories <= 0) return null
  if (dinner.ingredients.length === 0 || dinner.macros.calories <= 0) return null

  const scaled = scaleToTarget(dinner.ingredients, asMacros100g(dinner.macros), asMacros100g(lunchBudget))
  if (scaled.rejectedReason) return null

  const recomputed = computeMealMacros(scaled.ingredients)
  if (!meetsProteinFloor(recomputed.protein, lunchBudget.protein)) return null

  return {
    ...dinner,
    slot: 'lunch',
    ingredients: scaled.ingredients,
    macros: asTargets(recomputed),
    leftoverFrom: 'dinner',
  }
}

/**
 * Walks the whole rotation once. Pure, and deterministic for fixed pools and
 * targets, so two surfaces calling it with the same inputs get the same week.
 *
 * DELIBERATELY UNPINNED. A pinned meal is a fact about ONE date, and folding
 * it in here would bend the other six days around a choice made for today.
 * Today's pins are applied by re-assembling that one day with `historyFor`.
 */
export function buildRotation(
  pools: Partial<Record<MealSlotName, PoolOption[]>>,
  targets: MacroTargets,
  softLikedFoods: string[] = [],
  shape: MealShape = {},
): Rotation {
  const histories: Partial<Record<MealSlotName, string[]>>[] = []
  const leftovers: Partial<Record<MealSlotName, PoolOption>>[] = []
  const days: AssembledDay[] = []
  let history: Partial<Record<MealSlotName, string[]>> = {}

  // Only worked out when batch cooking is on and the profile's own meal split
  // actually has a lunch — a two-meal day is breakfast and dinner, with
  // nowhere for last night's dinner to go.
  const lunchBudget = batchCookingOn(shape)
    ? computeSlotBudgets(targets, shape.mealsPerDay, shape.includeSnacks).lunch
    : undefined
  let previousDinner: PoolOption | null = null

  for (let i = 0; i < ROTATION_DAYS; i++) {
    histories.push(history)
    // THE CYCLE HAS A SEAM AT DAY 0, ON PURPOSE. Day 0's "yesterday" is day 6
    // of the previous turn of the rotation, and pinning lunches changes which
    // dinners get chosen — so seeding day 0 from a first pass would promise a
    // leftover from a dinner the second pass might not serve. One day a week
    // lunch is cooked fresh, always consistently, instead of a fixed point
    // that is nearly right. Chasing that fixed point was considered and
    // rejected: "nearly right" is the worst state for a promise made the
    // night before.
    //
    // The `i === 0` is belt and braces: previousDinner is still null on the
    // first pass, so removing it creates no defect — measured, a mutation
    // doing exactly that came back MISSED and was right to. It stays because
    // the seam is a decision, and a decision the code does not state is one
    // the next reader will "tidy away" the moment previousDinner gains a seed.
    const pinned: Partial<Record<MealSlotName, PoolOption>> = {}
    const leftover = i === 0 ? null : leftoverLunchFrom(previousDinner, lunchBudget)
    if (leftover) pinned.lunch = leftover
    leftovers.push(pinned)

    let day = assembleDay(pools, targets, history, softLikedFoods, pinned)

    // COOK ONCE, EAT TWICE — NOT TWICE TODAY.
    //
    // Found by looking at a real screen, not by reading this code: with the
    // leftover pinned at lunch, the assembler was free to choose the SAME dish
    // again for dinner, and did. The person was shown a roast chicken tray
    // bake for lunch and a roast chicken tray bake for dinner, four hours
    // apart, under a feature whose promise is that it saves cooking rather
    // than that it feeds you one plate all day.
    //
    // THE LEFTOVER YIELDS, NOT THE RULE. The day gives up its leftover and
    // cooks lunch fresh, because "you are eating this twice today" is a worse
    // day than "you cook one extra lunch this week".
    //
    // A SECOND MECHANISM WAS TRIED HERE AND DELETED: adding the leftover's
    // name to the dinner slot's recent list, so the ordinary variety sort
    // steered away from it. It reads well and does nothing. Variety is a sort
    // key INSIDE tolerance, so it cannot help on the days that need help; and
    // measured with it in and out, across a 200-profile grid and this
    // module's own gate fixtures, not one day changed. A mutation removing it
    // came back MISSED against every check, which is what sent me to measure.
    // Two mechanisms for one property, one of them inert, is worse than one.
    if (leftover && day.chosen.dinner?.name === leftover.name) {
      delete pinned.lunch
      leftovers[leftovers.length - 1] = {}
      day = assembleDay(pools, targets, history, softLikedFoods, pinned)
    }
    days.push(day)
    history = extendHistory(history, day.chosen)
    previousDinner = day.chosen.dinner ?? null
  }

  const wrap = (index: number) =>
    Number.isFinite(index) ? ((Math.trunc(index) % ROTATION_DAYS) + ROTATION_DAYS) % ROTATION_DAYS : -1

  return {
    days,
    historyFor(index: number) {
      const w = wrap(index)
      return w < 0 ? {} : histories[w]
    },
    leftoverFor(index: number) {
      const w = wrap(index)
      return w < 0 ? {} : leftovers[w]
    },
  }
}

/**
 * Today's assembled day: the rotation's day for this date, re-assembled so any
 * meals pinned for today are honoured.
 *
 * ONE CODE PATH whether or not anything is pinned. Returning `rotation.days[i]`
 * when `pinned` is empty and re-assembling otherwise would be two paths that
 * are supposed to agree, which is the shape that lets them quietly stop
 * agreeing. One extra cartesian search over a handful of options is cheap.
 */
export function assembleRotationDay(
  rotation: Rotation,
  date: string,
  pools: Partial<Record<MealSlotName, PoolOption[]>>,
  targets: MacroTargets,
  softLikedFoods: string[] = [],
  pinned: Partial<Record<MealSlotName, PoolOption>> = {},
): AssembledDay {
  const index = rotationIndexFor(date)
  // THE LEFTOVER IS PART OF THE DAY, so today has to get the one the rotation
  // already decided on rather than re-deriving a different answer. A meal the
  // USER pinned still wins — their choice outranks the plan's, which is the
  // rule everywhere else in the app.
  const withLeftover = { ...rotation.leftoverFor(index), ...pinned }
  const day = assembleDay(pools, targets, rotation.historyFor(index), softLikedFoods, withLeftover)

  // PROMISE TOMORROW'S LUNCH ONLY WHEN IT IS ACTUALLY PROMISED. The rotation
  // worked out tomorrow's leftover from the dinner IT chose; if the user has
  // swapped tonight's dinner for something else, that leftover is no longer
  // coming out of tonight's pan and the card must not say it is. Comparing
  // the names is what makes the promise conditional on the swap not having
  // happened, rather than on nobody having tried.
  const tomorrowsLunch = rotation.leftoverFor(index + 1).lunch
  const dinner = day.chosen.dinner
  if (tomorrowsLunch && dinner && tomorrowsLunch.name === dinner.name) {
    return { ...day, chosen: { ...day.chosen, dinner: { ...dinner, reusedTomorrow: true } } }
  }
  return day
}
