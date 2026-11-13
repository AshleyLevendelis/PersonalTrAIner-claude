import type { MacroTargets } from '@/lib/types'
import type { MealSlotName } from '@/lib/meal-store'
import type { PoolOption } from '@/lib/meal-generation'
import { tagsPinOnly } from '@/lib/meal-new-from'
import { dayVerdictLabel } from '@/lib/meal-generation'

// ---------------------------------------------------------------------------
// FREESTYLE, A DAY AT A TIME (his 13 Nov 2026 strategy, slice 4a; collision (c), his answer "Its own label"). The
// plan's meals step aside for one date: each meal of that day becomes an EMPTY "Your choice" meal, one day only
// (pin-only, so no other day is ever served it), which he fills with what he actually ate (the screen's "Add food",
// or telling the coach) and logs as usual. Nothing pretends a planned number was eaten: the empty meal counts nothing.
// Never shopped for. "Back to the plan" puts the plan's dishes back. docs/plans/flexible-nutrition.md.
//
// THE DAY'S LINE is its own (his ruling): "Freestyle · protein hit · calories within range", never "on target". It is
// judged on protein and calories only, the two that matter most for body composition; the plan's tighter bands are for
// a planned day, and judging a day he chose to eat freely by them would be the app grading something it never set.
// ---------------------------------------------------------------------------

export const FREESTYLE_TAG = 'freestyle'

/** Protein counts as hit at 95% of target, the plan's own protein floor. */
const FREESTYLE_PROTEIN_FLOOR = 0.95
/** Calories within ±10%: looser than a planned day's ±5%, because nothing about a freestyle day was sized in advance. */
const FREESTYLE_CALORIE_BAND = 0.10

const SLOT_WORD: Record<MealSlotName, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

function weekdayOf(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return date
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
}

/** "Your choice (Friday)": one per meal per date, so a pick can name it. */
export function freestyleName(slot: MealSlotName, date: string): string {
  return `Your ${SLOT_WORD[slot].toLowerCase()} choice (${weekdayOf(date)})`
}

/** The empty one-day meal: no foods, nothing counted, never shopped for. */
export function freestyleOption(slot: MealSlotName, date: string): PoolOption {
  return {
    slot,
    name: freestyleName(slot, date),
    ingredients: [],
    macros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    tags: tagsPinOnly([FREESTYLE_TAG]),
  } as PoolOption
}

export function isFreestyle(option: { tags?: string[]; name?: string } | null | undefined): boolean {
  if (!option) return false
  if ((option.tags ?? []).includes(FREESTYLE_TAG)) return true
  // An edited copy ("Your dinner choice (Friday) + 2 eggs") keeps the base's name at its start.
  return /^Your (breakfast|lunch|dinner|snack) choice \(/.test(option.name ?? '')
}

/**
 * A day is freestyle when every meal not already eaten is one (at least one). A meal logged before he went freestyle
 * stays as eaten and counts in the day like any other.
 */
export function isFreestyleDay(
  chosen: Partial<Record<MealSlotName, { tags?: string[]; name?: string } | null | undefined>>,
  eaten: ReadonlySet<MealSlotName> = new Set(),
): boolean {
  const open = (Object.entries(chosen) as [MealSlotName, { tags?: string[]; name?: string } | null | undefined][])
    .filter(([slot, o]) => !!o && !eaten.has(slot))
  return open.length > 0 && open.every(([, o]) => isFreestyle(o))
}

/**
 * THE DAY'S LINE. `totals` is what the day holds as shown (logged meals as eaten, the empty meals as nothing).
 * "Freestyle · log what you eat" before anything is in; then protein and calories, each named only when it is off.
 */
export function freestyleDayLabel(totals: MacroTargets, targets: MacroTargets): string {
  if (!(totals.calories > 0)) return 'Freestyle · log what you eat'
  const proteinShort = Math.round(targets.protein * FREESTYLE_PROTEIN_FLOOR - totals.protein)
  const kcalDelta = Math.round(totals.calories - targets.calories)
  const kcalOff = Math.abs(kcalDelta) > targets.calories * FREESTYLE_CALORIE_BAND
  const protein = proteinShort > 0 ? `protein ${proteinShort} g short` : 'protein hit'
  const calories = !kcalOff ? 'calories within range'
    : kcalDelta > 0 ? `${kcalDelta.toLocaleString('en-GB')} kcal over` : `${Math.abs(kcalDelta).toLocaleString('en-GB')} kcal under`
  return `Freestyle · ${protein} · ${calories}`
}

export const FREESTYLE_WORDS = {
  offer: 'Freestyle this day',
  back: 'Back to the plan',
  marked: (dayWord: string) => `${dayWord} is freestyle: eat what you like and log it as you go. Add food to a meal, or tell the coach.`,
  cleared: (dayWord: string) => `${dayWord} is back on the plan.`,
  rowNote: 'Freestyle: add what you ate, or tell the coach, then log it.',
  notSaved: "That didn't save. Check your connection and try again.",
  outsideWindow: 'Freestyle works for today and the next six days.',
}

export type FreestyleResult = { ok: true; reason?: undefined } | { ok: false; reason?: string }
export interface FreestyleController {
  dates: string[]
  mark: (date: string) => Promise<FreestyleResult>
  clear: (date: string) => Promise<boolean>
}

/**
 * THE ONE DAY LINE every screen shows: the freestyle line on a freestyle day, else the plan's own verdict. The day's
 * header, an upcoming day's card and the week view all read it, so no screen grades a freestyle day "on target".
 */
export function dayLineFor(
  chosen: Partial<Record<MealSlotName, { tags?: string[]; name?: string } | null | undefined>>,
  totals: MacroTargets,
  targets: MacroTargets,
  eaten: ReadonlySet<MealSlotName> = new Set(),
): string {
  return isFreestyleDay(chosen, eaten) ? freestyleDayLabel(totals, targets) : dayVerdictLabel(totals, targets)
}

/** Profile's "Meal variety" choices (slice 4e). The words are his to change. */
export const MEAL_VARIETY_OPTIONS: { value: 'variety' | 'some' | 'same'; label: string; description: string }[] = [
  { value: 'variety', label: 'Lots of variety', description: 'A dish comes back after a few days off' },
  { value: 'some', label: 'Some repeats', description: 'A dish can come back after one day off' },
  { value: 'same', label: 'Same meals most days', description: 'Your best-fitting meals, day after day' },
]
