// ---------------------------------------------------------------------------
// WHAT HOME'S SHOPPING CARD MAY SAY ABOUT THE LIST — run 5 of the live test,
// 11 Oct 2026 (M44).
//
// The card said "for the week ahead" over a list built days earlier: half its
// dates had passed, the meals she had swapped since were not on it, and the
// count included onions for a dinner eaten on Tuesday. The words were a
// constant; nothing about them was read off the list.
//
// So the card's words come from the rows, through the same two readers the
// Grocery screen uses (coveredDates for which days the list was built for,
// coverageSentence for how to say them):
//   - "for the week ahead" ONLY when the dates still ahead reach a week out;
//   - otherwise the coverage, said as the Grocery screen says it, and that the
//     list is out of date;
//   - a meal swapped on a covered day since the build (a pick for that day and
//     meal that no row was built from) is out of date too, and said so;
//   - the count is only what is still to buy FOR A DAY NOT YET PAST: a row
//     whose every meal has gone is not something to buy any more. Rows she
//     typed herself carry no meal and always count.
// Pure: the card hands it what it read.
// ---------------------------------------------------------------------------
import { coveredDates, type GroceryItemRow } from './grocery-store'
import { coverageSentence } from './grocery-display'
import { addDays } from './session-move'

export interface ShopCardState {
  /** Unchecked rows still for today or later (and every row she added by hand). */
  toBuy: GroceryItemRow[]
  /** Ticked rows, for "· N already in". */
  checked: number
  /** True only when the days still ahead on the list reach a week out and nothing changed since. */
  weekAhead: boolean
  /** The list no longer matches the week: it stops short, or a meal changed since it was built. */
  outOfDate: boolean
  /** A meal on a covered day was changed after the list was built. */
  mealsChanged: boolean
  /** What the list covers from today on, in the Grocery screen's own words; null when no row says. */
  coverage: string | null
  /** A list was built from meals at all (rows with meal references). */
  hasBuiltList: boolean
}

/** Days from today a list must reach to be "the week ahead": today plus six. */
const WEEK_AHEAD_DAYS = 6

export function shopCardState(input: {
  items: GroceryItemRow[]
  /** The app's today, YYYY-MM-DD. */
  today: string
  /** The Grocery screen's rebuild memo, for rows written before refs carried a date. */
  legacyStartDate?: string
  /** Meal picks (date -> slot -> dish name) for the covered dates, when they could be read. */
  picks?: Record<string, Partial<Record<string, string>>>
}): ShopCardState {
  const { items, today, legacyStartDate, picks } = input
  const refDate = (ref: GroceryItemRow['meal_refs'][number]) => ref.date ?? addDays(legacyStartDate ?? today, ref.day)
  const stillAhead = (row: GroceryItemRow) => {
    const refs = row.meal_refs ?? []
    if (row.source !== 'generated' || refs.length === 0) return true
    return refs.some(r => refDate(r) >= today)
  }
  const toBuy = items.filter(i => !i.checked && stillAhead(i))
  const checked = items.filter(i => i.checked).length

  const covered = coveredDates(items, today, legacyStartDate)
  const ahead = covered.filter(d => d >= today)
  const hasBuiltList = covered.length > 0

  // A meal changed since the build: on a covered day still ahead, a pick for a
  // meal the list WAS built from (it has rows for that day and meal) that none
  // of those rows names. A meal the list never covered is not evidence.
  let mealsChanged = false
  if (picks) {
    const built = new Map<string, Set<string>>()
    for (const row of items) {
      if (row.source !== 'generated') continue
      for (const ref of row.meal_refs ?? []) {
        const key = `${refDate(ref)}|${ref.slot}`
        if (!built.has(key)) built.set(key, new Set())
        built.get(key)!.add(ref.mealName)
      }
    }
    for (const date of ahead) {
      for (const [slot, name] of Object.entries(picks[date] ?? {})) {
        const names = built.get(`${date}|${slot}`)
        if (name && names && !names.has(name)) mealsChanged = true
      }
    }
  }

  // EVERY day from today to a week out, not merely the two ends.
  const aheadSet = new Set(ahead)
  const reachesWeek = Array.from({ length: WEEK_AHEAD_DAYS + 1 }, (_, i) => addDays(today, i)).every(d => aheadSet.has(d))
  const weekAhead = hasBuiltList && reachesWeek && !mealsChanged
  return {
    toBuy,
    checked,
    weekAhead,
    outOfDate: hasBuiltList && !weekAhead,
    mealsChanged,
    coverage: coverageSentence(ahead, today),
    hasBuiltList,
  }
}
