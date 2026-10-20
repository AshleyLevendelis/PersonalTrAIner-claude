// ---------------------------------------------------------------------------
// COOK ONCE, KEEP SOME: the dinner's batch, line by line (runs 7-10, H37, 20 Oct 2026).
//
// Sam's Saturday Bolognese was 153 g mince and Sunday's "Last night's dinner" lunch 205 g: a lunch takes the
// lunch's share of the day, so it can be bigger than the dinner it came from, and the card said only "Cook both
// portions together". Her fix: "cook one batch and keep part; the method and shopping list should say cook X, keep Y".
// This pairs tonight's lines with tomorrow's leftover lines: cook the two together, keep the leftover's.
// ---------------------------------------------------------------------------

export interface IngredientLine { name: string; quantity: number; unit: string }

export interface CookKeepLine {
  name: string
  unit: string
  /** The whole batch: tonight's portion and tomorrow's together. */
  cook: number
  /** Put aside for tomorrow's lunch. */
  keep: number
}

const key = (l: IngredientLine) => `${l.name.trim().toLowerCase()}|${l.unit.trim().toLowerCase()}`

/**
 * One row per ingredient of the batch, or null when the leftover holds a line tonight's dinner does not (then the
 * card cannot honestly say it is the same batch, and says only the one line it always said).
 */
export function cookAndKeep(dinner: readonly IngredientLine[], keep: readonly IngredientLine[]): CookKeepLine[] | null {
  const kept = new Map<string, number>()
  for (const k of keep) kept.set(key(k), (kept.get(key(k)) ?? 0) + k.quantity)
  const tonight = new Set(dinner.map(key))
  for (const k of kept.keys()) if (!tonight.has(k)) return null
  return dinner.map(d => {
    const k = kept.get(key(d)) ?? 0
    return { name: d.name, unit: d.unit, cook: Math.round((d.quantity + k) * 100) / 100, keep: Math.round(k * 100) / 100 }
  })
}

/** A shopping line, and whether it is the portion kept for tomorrow's lunch (bought tonight, with the dinner). */
export interface ShoppingLine extends IngredientLine { forTomorrow?: true }

/** The lines a meal puts on the shopping list (runs 7-10, H37): ONE BATCH, BOUGHT ONCE. A dinner that feeds tomorrow's
 *  lunch buys tomorrow's portion too, marked `forTomorrow`. A leftover lunch buys nothing when its dinner is shopped
 *  for (on the list, or cooked before the list began); when its dinner is a day NOT on the list, the lunch buys its
 *  own lines, or nothing on the list would. */
export function shoppingLinesOf(
  option: { leftoverFrom?: string; ingredients: readonly IngredientLine[]; keepForTomorrow?: readonly IngredientLine[] },
  dinnerShopped: boolean,
): ShoppingLine[] {
  if (option.leftoverFrom === 'dinner' && dinnerShopped) return []
  const own: ShoppingLine[] = option.ingredients.map(l => ({ ...l }))
  return option.keepForTomorrow ? [...own, ...option.keepForTomorrow.map(l => ({ ...l, forTomorrow: true as const }))] : own
}
