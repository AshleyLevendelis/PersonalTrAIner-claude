// ---------------------------------------------------------------------------
// HOW A SHOPPING LINE IS SHOWN — design 3a/3b, 27 Sep 2026.
//
// Read-only over the store: nothing here writes, and nothing here changes a
// stored quantity, unit or meal reference. It decides what a row SAYS (the
// amount you would pick up, what it is for, which meals it came from) and
// what the stepper's next value would be, so the screen and test:grocery-
// display read the same rules.
// ---------------------------------------------------------------------------

import { lookupIngredient } from '@/lib/food-db'
import type { GroceryItemRow, MealRef } from '@/lib/grocery-store'
import { weekdayShort, weekdayLong, dayOfMonth } from '@/lib/day-labels'

/**
 * The largest quantity one shopping line will hold. Line items are stored in
 * grams, so this is 100kg of a single ingredient — comfortably past any real
 * shop, and squarely into slipped-decimal-point territory.
 */
export const MAX_GROCERY_QUANTITY = 100_000

export function formatQuantity(item: Pick<GroceryItemRow, 'quantity' | 'unit'>): string {
  const qty = Number.isInteger(item.quantity) ? item.quantity : Math.round(item.quantity * 10) / 10
  return item.unit === 'g' || item.unit === 'ml' ? `${qty}${item.unit}` : `${qty} ${item.unit}`
}

/** The rounding step a shopper reads a weight in: 5g, 10g, 50g or 100g. */
export function gramStep(grams: number): number {
  return grams >= 1000 ? 100 : grams >= 200 ? 50 : grams >= 20 ? 10 : 5
}

function purchaseUnitFor(item: Pick<GroceryItemRow, 'display_name' | 'unit'>) {
  if (item.unit !== 'g') return null
  return lookupIngredient(item.display_name)?.purchaseUnit ?? null
}

/**
 * Shopping-friendly display over the stored gram figure — "378g broccoli"
 * isn't how anyone shops. `exact` is the unrounded figure, kept so it is never
 * lost.
 */
export function formatShoppingQuantity(item: Pick<GroceryItemRow, 'display_name' | 'quantity' | 'unit'>): { primary: string; exact: string } {
  const exact = formatQuantity(item)
  if (item.unit !== 'g') return { primary: exact, exact } // non-gram manual units (e.g. 'rolls') pass through unchanged

  const unit = purchaseUnitFor(item)
  if (unit) {
    const count = Math.max(1, Math.round(item.quantity / unit.avgGrams))
    return { primary: `${count} ${unit.label}${count === 1 ? '' : 's'}`, exact }
  }

  const grams = item.quantity
  const step = gramStep(grams)
  const rounded = Math.round(grams / step) * step
  const approx = rounded !== grams ? '~' : ''
  const primary = rounded >= 1000
    ? `${approx}${(rounded / 1000).toFixed(rounded % 1000 === 0 ? 0 : 1)}kg`
    : `${approx}${rounded}g`
  return { primary, exact }
}

/**
 * The stepper's readout: the same rounded amount as the row, without the "~"
 * (the exact figure sits beside it) and with a space before the unit.
 */
export function stepperReadout(item: Pick<GroceryItemRow, 'display_name' | 'quantity' | 'unit'>): string {
  const { primary } = formatShoppingQuantity(item)
  return primary.replace(/^~/, '').replace(/^([\d.]+)(kg|g|ml)$/, '$1 $2')
}

/** "exact 1,180g" — the stored figure, with thousands separated. */
export function exactLabel(item: Pick<GroceryItemRow, 'quantity' | 'unit'>): string {
  const qty = Number.isInteger(item.quantity) ? item.quantity : Math.round(item.quantity * 10) / 10
  const n = qty.toLocaleString('en-GB')
  return item.unit === 'g' || item.unit === 'ml' ? `exact ${n}${item.unit}` : `exact ${n} ${item.unit}`
}

/**
 * The stepper's next stored quantity, or null when that step would reach zero
 * (the minus is then disabled rather than offering an amount nobody can buy).
 *
 * A counted item (broccoli by the head, bananas, eggs) steps one whole unit,
 * converted back to grams through the unit's own average weight — so "2
 * heads" becomes "3 heads", never "2 heads" and a few grams. A weight steps
 * the same amount the row rounds to, from the rounded value, so 1,180g reads
 * 1.2 kg and steps to 1.3 kg. A manual unit ("2 rolls") steps by one.
 */
export function stepQuantity(item: Pick<GroceryItemRow, 'display_name' | 'quantity' | 'unit'>, direction: 1 | -1): number | null {
  const unit = purchaseUnitFor(item)
  let next: number
  if (unit) {
    const count = Math.max(1, Math.round(item.quantity / unit.avgGrams))
    next = (count + direction) * unit.avgGrams
  } else if (item.unit === 'g' || item.unit === 'ml') {
    const step = gramStep(item.quantity)
    next = (Math.round(item.quantity / step) + direction) * step
  } else {
    next = Math.round(item.quantity) + direction
  }
  if (!(next > 0) || next > MAX_GROCERY_QUANTITY) return null
  return next
}

const SLOT_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }
export function slotLabel(slot: string): string {
  const base = slot.replace(/[_-]?\d+$/, '').toLowerCase()
  return SLOT_LABEL[base] ?? (base.charAt(0).toUpperCase() + base.slice(1))
}

/**
 * What a line is FOR, replacing "from N meals": the meal slots it feeds,
 * most frequent first, up to two — "Lunch ×5", "Lunch ×3 · Dinner ×2".
 * Empty for a line with no meals behind it (added by hand or by the coach).
 */
export function purposeLine(refs: readonly MealRef[]): string {
  const counts = new Map<string, number>()
  for (const r of refs) {
    const label = slotLabel(r.slot)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([label, n]) => `${label} ×${n}`)
    .join(' · ')
}

/**
 * The meals a line came from, one per line: "Mon · Lunch · Chicken rice bowl".
 *
 * A reference written since 27 Sep 2026 carries its own date, and the weekday
 * is read off that. An older one stores only a DAY OFFSET from the date the
 * list was built, so its weekday is only named when that build date is known;
 * otherwise the line says "Day 1", "Day 2", which is what the offset actually
 * is. Naming weekdays from TODAY would print the wrong day for any list built
 * earlier in the week, and nothing rebuilds the list on its own.
 */
export function mealRefLines(refs: readonly MealRef[], builtOn: string | null): string[] {
  const order = ['breakfast', 'lunch', 'dinner', 'snack']
  const m = builtOn ? DATE.exec(builtOn) : null
  const dateOf = (r: MealRef): string | null => r.date ?? (m ? isoPlus(m, r.day) : null)
  const sorted = [...refs].sort((a, b) => {
    const da = dateOf(a), db = dateOf(b)
    const byDay = da && db ? da.localeCompare(db) : a.day - b.day
    return byDay || order.indexOf(a.slot.replace(/[_-]?\d+$/, '')) - order.indexOf(b.slot.replace(/[_-]?\d+$/, ''))
  })
  return sorted.map(r => {
    const d = dateOf(r)
    const when = d ? weekdayOf(d) : `Day ${r.day + 1}`
    return `${when} · ${slotLabel(r.slot)} · ${r.mealName}`
  })
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function isoPlus(m: RegExpExecArray, days: number): string {
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** "Mon", from a `YYYY-MM-DD` date — the one formatter the strip and its headings use too. */
export const weekdayOf = weekdayShort

/**
 * The list's own account of which days it covers, for the note under it, read
 * off the rows' dates — so a list that had one day added reads true where
 * "your next 7 days" would not. Null when no row carries a date (a list built
 * before dates were kept), and the screen falls back to its rebuild memo.
 *   a Rebuild from today      "Built from your next 7 days of meals."
 *   one added day             "Built from Friday's meals."
 *   one run, not from today   "Built from 3 days of meals, Fri 18 to Sun 20 Sep."
 *   anything else             "Built from the meals for Fri 18 Sep and Mon 21 to Tue 22 Sep."
 */
export function coverageSentence(dates: readonly string[], today: string): string | null {
  const sorted = [...new Set(dates)].sort()
  if (sorted.length === 0) return null
  const runs: [string, string, number][] = []
  for (const d of sorted) {
    const last = runs[runs.length - 1]
    if (last && isoPlusDays(last[1], 1) === d) { last[1] = d; last[2]++ }
    else runs.push([d, d, 1])
  }
  if (runs.length === 1) {
    const [from, to, n] = runs[0]
    if (from === today) return n === 1 ? "Built from today's meals." : `Built from your next ${n} days of meals.`
    if (n === 1) return `Built from ${weekdayLong(from)}'s meals.`
    return `Built from ${n} days of meals, ${runLabel(from, to)}.`
  }
  const labels = runs.map(([from, to]) => runLabel(from, to))
  return `Built from the meals for ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}.`
}

/** "Fri 18 Sep", or a run: "Fri 18 to Sun 20 Sep", "Mon 28 Sep to Sun 4 Oct". */
function runLabel(from: string, to: string): string {
  const month = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
  const head = (d: string) => `${weekdayShort(d)} ${dayOfMonth(d)}`
  if (from === to) return `${head(from)} ${month(from)}`
  return month(from) === month(to) ? `${head(from)} to ${head(to)} ${month(to)}` : `${head(from)} ${month(from)} to ${head(to)} ${month(to)}`
}

function isoPlusDays(date: string, n: number): string {
  const m = DATE.exec(date)
  return m ? isoPlus(m, n) : date
}

/**
 * WHEN AND OVER HOW MANY DAYS THE LIST WAS LAST REBUILT, on this phone.
 *
 * A meal reference written before 27 Sep 2026 stores only a day OFFSET from
 * the build date, and the list is only ever rebuilt by hand, so the weekday
 * such a meal falls on — and the "next N days" in the note — are only true if
 * the build date is known. This is a note ABOUT the list, kept beside it. The
 * Nutrition tab reads it too, when it adds a day, to date an older list's rows.
 */
export interface GroceryBuildMemo { startDate: string; days: number }
const buildMemoKey = (profileId: string) => `fitplan_grocery_built_v1:${profileId}`
export function readGroceryBuildMemo(profileId?: string): GroceryBuildMemo | null {
  if (!profileId) return null
  try {
    const v = JSON.parse(localStorage.getItem(buildMemoKey(profileId)) ?? 'null')
    return v && typeof v.startDate === 'string' && typeof v.days === 'number' ? v : null
  } catch { return null }
}
export function writeGroceryBuildMemo(profileId: string, memo: GroceryBuildMemo): void {
  try { localStorage.setItem(buildMemoKey(profileId), JSON.stringify(memo)) } catch { /* private window — the screen falls back to "Day 1" */ }
}
