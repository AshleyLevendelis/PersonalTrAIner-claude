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

import { assembleDay, type AssembledDay, type PoolOption } from './meal-generation'
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
): Rotation {
  const histories: Partial<Record<MealSlotName, string[]>>[] = []
  const days: AssembledDay[] = []
  let history: Partial<Record<MealSlotName, string[]>> = {}

  for (let i = 0; i < ROTATION_DAYS; i++) {
    histories.push(history)
    const day = assembleDay(pools, targets, history, softLikedFoods)
    days.push(day)
    history = extendHistory(history, day.chosen)
  }

  return {
    days,
    historyFor(index: number) {
      if (!Number.isFinite(index)) return {}
      const wrapped = ((Math.trunc(index) % ROTATION_DAYS) + ROTATION_DAYS) % ROTATION_DAYS
      return histories[wrapped]
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
  return assembleDay(pools, targets, rotation.historyFor(index), softLikedFoods, pinned)
}
