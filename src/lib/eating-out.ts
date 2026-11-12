// ---------------------------------------------------------------------------
// EATING OUT — his request 12 Nov 2026 ("build it, start with out for dinner"), and his ruling the same day, from
// three options: "Ask: light/normal/big". He marks a meal on a day as out; the app ASKS how big a night it is (Light,
// Normal or Big night); the meal stays in the day's plan as an estimate, is never shopped for, and the day's other
// meals fit around it. When he tells the coach what he'll order, the coach's estimate replaces this one.
//
// It rides on the "cooked for you" road (meals-elsewhere.ts): the meal is a one-day option (pin-only, so no other day
// is ever served it) tagged as cooked elsewhere, so the shopping list leaves it out, the day never resizes it, and a
// meal is never moved into it or out of it. What this file adds is the SIZE and the NAME. docs/plans/eating-out.md.
// ---------------------------------------------------------------------------
import type { MacroTargets } from './types'
import type { MealSlotName } from './meal-store'
import type { PoolOption } from './meal-generation'
import { ELSEWHERE_TAG } from './meals-elsewhere'
import { USER_REQUESTED_TAG } from './meal-store'
import { tagsPinOnly } from './meal-new-from'

export type EatingOutSize = 'light' | 'normal' | 'big'
export const EATING_OUT_SIZES: EatingOutSize[] = ['light', 'normal', 'big']
export const EATING_OUT_TAG = 'eating-out'
const SIZE_TAG_PREFIX = 'eating-out-size:'

/**
 * HOW BIG, AGAINST THE MEAL'S OWN SHARE OF HIS DAY (CSCS delegation, population-level nutrition, 12 Nov 2026; basis
 * in BACKLOG). A restaurant main is larger than a home dinner: studies of full-service restaurant meals put the average
 * near 1,000-1,200 kcal (UK full-service mains averaged about 1,030 kcal; US restaurant meals about 1,200), against a
 * planned dinner share of roughly 600-1,100 kcal. So: Light is his usual size (a salad, a light main), Normal is a
 * third again (a typical main), Big night about seven tenths more (starter, main, dessert or drinks).
 */
export const EATING_OUT_FACTOR: Record<EatingOutSize, number> = { light: 1.0, normal: 1.35, big: 1.7 }

const SLOT_WORD: Record<MealSlotName, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

/** "Friday", in the app's UTC date convention (dates are YYYY-MM-DD). */
function weekdayOf(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return date
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
}

/**
 * The meal's name, one per meal per day: "Dinner out (Friday)". The day keeps it unique across the seven days the
 * strip shows, and a pick names a meal by its name.
 */
export function eatingOutName(slot: MealSlotName, date: string): string {
  return `${SLOT_WORD[slot]} out (${weekdayOf(date)})`
}

/**
 * THE ESTIMATE. Calories are the meal's share times the size; PROTEIN STAYS AT THE MEAL'S SHARE (a restaurant main
 * carries a normal serving of protein; the extra energy is in sauces, sides, bread, desserts and drinks), and the extra
 * energy is split between carbs and fat in the share's own proportion. Light reproduces the share exactly.
 */
export function eatingOutMacros(budget: MacroTargets, size: EatingOutSize): MacroTargets {
  const calories = budget.calories * EATING_OUT_FACTOR[size]
  const protein = budget.protein
  const carbE = Math.max(0, budget.carbs) * 4
  const fatE = Math.max(0, budget.fat) * 9
  const rest = Math.max(0, calories - protein * 4)
  const carbShare = carbE + fatE > 0 ? carbE / (carbE + fatE) : 0.5
  return {
    calories: Math.round(calories),
    protein: Math.round(protein),
    carbs: Math.round((rest * carbShare) / 4),
    fat: Math.round((rest * (1 - carbShare)) / 9),
  }
}

/** The one-day option for a meal out: no foods (nothing to cook or shop), the estimate's macros, and its tags. */
export function eatingOutOption(slot: MealSlotName, date: string, budget: MacroTargets, size: EatingOutSize): PoolOption {
  return {
    slot,
    name: eatingOutName(slot, date),
    ingredients: [],
    macros: eatingOutMacros(budget, size),
    // HIS OWN MEAL, not one of the plan's (USER_REQUESTED_TAG): the rest of the day is worked out again around it, as it
    // is around the coach's estimate of a meal he names, never held at its old dishes. His ruling: the size "drives
    // how much the rest of the day shrinks", and holding the day's dishes within a quarter cannot shrink it for a big
    // night (measured 12 Nov 2026: 467 kcal over, the other meals untouched).
    tags: tagsPinOnly([USER_REQUESTED_TAG, ELSEWHERE_TAG, EATING_OUT_TAG, `${SIZE_TAG_PREFIX}${size}`]),
  }
}

export function isEatingOut(option: { tags?: string[] } | null | undefined): boolean {
  return !!option && (option.tags ?? []).includes(EATING_OUT_TAG)
}

/** The size he chose, or null on a meal that is not out (or an old one with no size recorded). */
export function eatingOutSizeOf(option: { tags?: string[] } | null | undefined): EatingOutSize | null {
  const tag = (option?.tags ?? []).find(t => t.startsWith(SIZE_TAG_PREFIX))
  const size = tag?.slice(SIZE_TAG_PREFIX.length)
  return size === 'light' || size === 'normal' || size === 'big' ? size : null
}

/**
 * THE SIZE IN HIS OWN WORDS, or null. The coach may only mark a meal out at a size he said ("a big night", "something
 * light", "normal"); anything else the APP asks, with the three as buttons (his ruling: the app asks). Read off the
 * whole message he sent, never the coach's argument.
 */
export function eatingOutSizeSaid(text: string): EatingOutSize | null {
  const t = ` ${text.toLowerCase()} `
  // "Nothing heavy", "not a big night": a size word under a no is the light end, never the big one.
  if (/\b(nothing|not)( a| too| that)? (big|heavy|massive)\b/.test(t)) return 'light'
  if (/\b(big night|big one|big meal|big (?:dinner|lunch|breakfast)|blow ?out|feast|three courses|3 courses|massive|heavy)\b/.test(t)) return 'big'
  if (/\b(light|small|just a salad|something light|not much)\b/.test(t)) return 'light'
  if (/\b(normal|regular|usual|average|typical)\b/.test(t)) return 'normal'
  return null
}

/** Every word the screen and the coach's card say about a meal out, in one place. */
export const EATING_OUT_WORDS = {
  label: 'Eating out',
  badge: 'Estimate',
  offer: 'Eating out',
  sizeLabel: { light: 'Light', normal: 'Normal', big: 'Big night' } as Record<EatingOutSize, string>,
  sizeHint: { light: 'about your usual size', normal: 'a typical main', big: 'starter, main, dessert or drinks' } as Record<EatingOutSize, string>,
  question: (slot: MealSlotName) => `How big a ${slot} out?`,
  note: (size: EatingOutSize, kcal: number) =>
    `An estimate for a ${EATING_OUT_SIZES_WORDS[size]} night out, about ${kcal.toLocaleString('en-GB')} kcal. The rest of the day fits around it. Tell the coach what you'll order and it updates.`,
  notOut: 'Not eating out',
  marked: (slot: MealSlotName, dayWord: string, size: EatingOutSize) =>
    `${dayWord} ${slot} is out, a ${EATING_OUT_SIZES_WORDS[size]} night. The rest of the day fits around it.`,
  cleared: (slot: MealSlotName, dayWord: string) => `${dayWord} ${slot} is back on the plan.`,
  notSaved: "That didn't save. Check your connection and try again.",
  /** The app's question in the chat when he has not said how big: his ruling, the app asks. */
  chatAsk: (slot: MealSlotName, dayWord: string) => `How big a night out is ${dayWord} ${slot}?`,
  chatChip: (size: EatingOutSize, slot: MealSlotName, dayWord: string) => `${EATING_OUT_SIZES_CHIP[size]} ${slot} out ${dayWord}`,
}
const EATING_OUT_SIZES_WORDS: Record<EatingOutSize, string> = { light: 'light', normal: 'normal', big: 'big' }
const EATING_OUT_SIZES_CHIP: Record<EatingOutSize, string> = { light: 'A light', normal: 'A normal', big: 'A big night,' }

/** What marking a meal out did, or why it did not. `previous` is the dish the meal showed before, for the Undo. */
export type EatingOutResult =
  | { ok: true; option: PoolOption; previous: string | null }
  | { ok: false; reason: string }

/**
 * ONE CONTROLLER FOR BOTH SURFACES (the `meal-refit` pattern: parity by construction). The meal's sheet on Nutrition
 * and the coach's card both call these, so the coach cannot mark a meal the screen would refuse, or save it another way.
 */
export interface EatingOutController {
  /** The days a meal can be marked out on: today and the six the strip shows. */
  dates: string[]
  mark: (date: string, slot: MealSlotName, size: EatingOutSize) => Promise<EatingOutResult>
  /** Puts the meal back on the plan; `restore` is the dish it showed before it was marked, when there was one. */
  clear: (date: string, slot: MealSlotName, restore?: string | null) => Promise<boolean>
}

/** The plain-words reasons a meal cannot be marked out, said by both surfaces. */
export const EATING_OUT_REFUSALS = {
  outsideWindow: "I can only mark a meal out for today or the next six days, the days on your meal plan.",
  noSuchMeal: (slot: MealSlotName) => `Your plan has no ${slot} that day.`,
  eaten: (slot: MealSlotName) => `You've already logged today's ${slot} as eaten, so it can't be marked as eating out.`,
  noTargets: 'I need your height, weight, age and sex before I can size a meal out. You can add them in Profile.',
}
