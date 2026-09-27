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
 * A meal reference stores a DAY OFFSET from the date the list was built, not a
 * date. So the weekday is only named when that build date is known; otherwise
 * the line says "Day 1", "Day 2", which is what the offset actually is. Naming
 * weekdays from TODAY would print the wrong day for any list built earlier in
 * the week, and nothing rebuilds the list on its own.
 */
export function mealRefLines(refs: readonly MealRef[], builtOn: string | null): string[] {
  const order = ['breakfast', 'lunch', 'dinner', 'snack']
  const sorted = [...refs].sort((a, b) => a.day - b.day || order.indexOf(a.slot.replace(/[_-]?\d+$/, '')) - order.indexOf(b.slot.replace(/[_-]?\d+$/, '')))
  const m = builtOn ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(builtOn) : null
  return sorted.map(r => {
    const when = m
      ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + r.day).toLocaleDateString('en-GB', { weekday: 'short' })
      : `Day ${r.day + 1}`
    return `${when} · ${slotLabel(r.slot)} · ${r.mealName}`
  })
}
