// ---------------------------------------------------------------------------
// MEALS COOKED FOR HIM ELSEWHERE — Ashley's ruling, 11 Nov 2026, "Set days +
// optional menu", in his words: "I dont want it to stop posing the meals, I
// want it to incorporate the meals into its plan."
//
// He says once which meals are cooked for him on which weekdays (breakfast and
// lunch at work, Monday to Friday). Those meals STAY in the day: shown,
// counted, and never shopped for. Plan: docs/plans/meals-cooked-elsewhere.md.
//
// TWO STATES, AND THIS FILE IS THE FIRST:
//   - ASSUMED. Nothing is known about the plate, so the meal is that meal's
//     own share of his day (computeSlotBudgets) and says it is assumed. It is
//     DERIVED, never stored: change the answer and every future day follows,
//     and there is no row to orphan.
//   - ESTIMATE. He told the coach the menu; the dish is a stored option made
//     for one date (ELSEWHERE_TAG), costed from the app's own food table.
//
// THE ANSWER RIDES ON THE MEAL SHAPE (meal-rotation's MealShape), which every
// surface that builds a week already passes as one object, so the Nutrition
// tab, the shopping list, the coach's week and every trial card get it by
// construction rather than by each remembering to ask.
//
// NOTHING HERE CLAIMS ANYTHING ABOUT WHAT THE KITCHEN SERVES. An assumed meal
// has no foods, so it has no diet or allergen verdict and must never be given
// one: the words say the app does not know what is on the plate.
// ---------------------------------------------------------------------------

import type { PoolOption } from './meal-generation'
import type { MealSlotName } from './meal-store'
import type { MacroTargets } from './types'

/** Marks a stored dish as one cooked for him elsewhere (an estimate of a menu he gave). */
export const ELSEWHERE_TAG = 'cooked-elsewhere'

/** Monday = 1 ... Sunday = 7. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7
export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]
export const WORKING_WEEK: Weekday[] = [1, 2, 3, 4, 5]
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const weekdayShort = (d: Weekday): string => WEEKDAY_SHORT[d - 1]
export const weekdayName = (d: Weekday): string => WEEKDAY_LONG[d - 1]

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** The standing answer: for each meal, the weekdays it is cooked for him. A meal with no days is simply absent. */
export type MealsElsewhere = Partial<Record<MealSlotName, Weekday[]>>

/**
 * The stored answer, read defensively: it is a json column written by more than one release, and before the column
 * exists it is `undefined`. Anything that is not a meal name mapped to weekdays 1-7 is dropped, days come back sorted
 * and once each, and an empty meal is left out, so `{}` always means "nothing is cooked for him".
 */
export function readMealsElsewhere(raw: unknown): MealsElsewhere {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: MealsElsewhere = {}
  for (const slot of SLOTS) {
    const days = (raw as Record<string, unknown>)[slot]
    if (!Array.isArray(days)) continue
    const clean = WEEKDAYS.filter(d => days.includes(d))
    if (clean.length > 0) out[slot] = clean
  }
  return out
}

/** Is anything cooked for him at all? */
export function hasMealsElsewhere(answer: MealsElsewhere | undefined): boolean {
  return SLOTS.some(s => (answer?.[s]?.length ?? 0) > 0)
}

/** The same answer with one meal on one weekday switched. Returns a new object; an emptied meal is removed. */
export function toggleMealElsewhere(answer: MealsElsewhere, slot: MealSlotName, day: Weekday): MealsElsewhere {
  const days = answer[slot] ?? []
  const next = days.includes(day) ? days.filter(d => d !== day) : WEEKDAYS.filter(d => d === day || days.includes(d))
  const out: MealsElsewhere = { ...answer }
  if (next.length > 0) out[slot] = next
  else delete out[slot]
  return out
}

/** The same answer with one meal set to exactly these weekdays (the "Mon to Fri" shortcut). */
export function setMealElsewhereDays(answer: MealsElsewhere, slot: MealSlotName, days: Weekday[]): MealsElsewhere {
  const next = WEEKDAYS.filter(d => days.includes(d))
  const out: MealsElsewhere = { ...answer }
  if (next.length > 0) out[slot] = next
  else delete out[slot]
  return out
}

/**
 * The weekday of a `YYYY-MM-DD` date, by calendar arithmetic on its three numbers (never the machine's clock or
 * zone). 1 January 1970 was a Thursday. An unreadable date is null, so it is covered by nothing.
 */
export function weekdayOfDate(date: string): Weekday | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return null
  const day = Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000)
  return ((((day + 3) % 7) + 7) % 7 + 1) as Weekday
}

/**
 * The weekday a rotation day falls on. The rotation's index is the day number modulo seven (rotationIndexFor), and
 * day 0 was a Thursday, so the mapping never moves: test:meals-elsewhere holds it against every date of a year.
 */
export function weekdayOfRotationIndex(index: number): Weekday {
  return ((((Math.trunc(index) + 3) % 7) + 7) % 7 + 1) as Weekday
}

/** Which meals are cooked for him on this weekday, in the day's own order. */
export function mealsElsewhereOn(answer: MealsElsewhere | undefined, weekday: Weekday | null): MealSlotName[] {
  if (!answer || weekday === null) return []
  return SLOTS.filter(s => answer[s]?.includes(weekday))
}

const SLOT_WORD: Record<MealSlotName, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

/** The name an assumed meal carries everywhere a meal is named: the strip, the coach's week, a logged row. */
export const assumedMealName = (slot: MealSlotName): string => `${SLOT_WORD[slot]} cooked for you`

/**
 * THE ASSUMED MEAL: that meal's own share of his day, with no foods. Its numbers are the budget's, rounded as a
 * meal's are, so a day holding one is planned exactly as it would be around a plan dish of that size.
 */
export function assumedMeal(slot: MealSlotName, budget: MacroTargets): PoolOption {
  return {
    slot,
    name: assumedMealName(slot),
    ingredients: [],
    macros: {
      calories: Math.round(budget.calories), protein: Math.round(budget.protein),
      carbs: Math.round(budget.carbs), fat: Math.round(budget.fat),
    },
    tags: [ELSEWHERE_TAG],
    elsewhere: 'assumed',
  }
}

/**
 * The assumed meals for one weekday, as the pins a day is assembled with. Only for a meal the plan has (`budgets`
 * holds the split's own meals; `planSlots` the meals the pool can serve), so a two-meal day never grows a lunch.
 */
export function assumedMealsOn(
  answer: MealsElsewhere | undefined,
  weekday: Weekday | null,
  budgets: Partial<Record<MealSlotName, MacroTargets>>,
  planSlots: MealSlotName[],
): Partial<Record<MealSlotName, PoolOption>> {
  const out: Partial<Record<MealSlotName, PoolOption>> = {}
  for (const slot of mealsElsewhereOn(answer, weekday)) {
    const budget = budgets[slot]
    if (!budget || budget.calories <= 0 || !planSlots.includes(slot)) continue
    out[slot] = assumedMeal(slot, budget)
  }
  return out
}

/** Is this meal one cooked for him elsewhere, and in which state? Null for every other meal. */
export function elsewhereState(option: Pick<PoolOption, 'tags' | 'elsewhere'> | null | undefined): 'assumed' | 'estimate' | null {
  if (!option) return null
  if (option.elsewhere) return option.elsewhere
  return option.tags?.includes(ELSEWHERE_TAG) ? 'estimate' : null
}

/** A meal cooked for him elsewhere, in either state: never shopped for, never resized, never a leftover's source. */
export const isCookedElsewhere = (option: Pick<PoolOption, 'tags' | 'elsewhere'> | null | undefined): boolean =>
  elsewhereState(option) !== null

/**
 * The answer in plain words, for the coach and a line of text: "Breakfast and lunch, Monday to Friday", or one
 * sentence a set of days when they differ. Empty string when nothing is cooked for him.
 */
export function describeMealsElsewhere(answer: MealsElsewhere | undefined): string {
  return mealsElsewhereClauses(answer).join('. ')
}

/** One clause for each set of days: ["Breakfast and lunch, Monday to Friday"]. Empty when nothing is cooked for him. */
export function mealsElsewhereClauses(answer: MealsElsewhere | undefined): string[] {
  if (!hasMealsElsewhere(answer)) return []
  const byDays = new Map<string, MealSlotName[]>()
  for (const slot of SLOTS) {
    const days = answer?.[slot]
    if (!days || days.length === 0) continue
    const key = days.join(',')
    byDays.set(key, [...(byDays.get(key) ?? []), slot])
  }
  const clauses: string[] = []
  for (const [key, slots] of byDays) {
    const days = key.split(',').map(Number) as Weekday[]
    const meals = joinWords(slots.map((s, i) => (i === 0 ? SLOT_WORD[s] : SLOT_WORD[s].toLowerCase())))
    clauses.push(`${meals}, ${describeDays(days)}`)
  }
  return clauses
}

/** "Monday to Friday", "every day", "Monday, Wednesday and Friday". */
export function describeDays(days: Weekday[]): string {
  const sorted = WEEKDAYS.filter(d => days.includes(d))
  if (sorted.length === 7) return 'every day'
  if (sorted.length === 0) return ''
  const run = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
  if (run && sorted.length >= 3) return `${weekdayName(sorted[0])} to ${weekdayName(sorted[sorted.length - 1])}`
  return joinWords(sorted.map(weekdayName))
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/**
 * THE WORDS, in one place so the screen, the coach and the gates read the same ones. Each is his to change: the plan
 * names the labels as an open question. None says what is on the plate, and none says the meal suits his diet.
 */
export const ELSEWHERE_WORDS = {
  /** The quiet label on the row, either state. */
  label: 'Cooked for you',
  assumedBadge: 'Assumed',
  estimateBadge: 'Estimate',
  /** Under an assumed meal: where the numbers come from, and how to make them better. */
  assumedNote: (slot: MealSlotName) =>
    `A normal-sized ${slot}, assumed. The app doesn't know what's on the plate. Tell the coach what's on the menu and the rest of your day fits around it.`,
  /** Under an estimate. */
  estimateNote: 'An estimate from what you told the coach, with ordinary portions.',
  /** On the row: a day he is cooking for himself. It changes that one day, never the standing answer. */
  ownOffer: (upcoming: boolean) => (upcoming ? 'Cooking my own that day' : 'Cooking my own today'),
  ownPrompt: (upcoming: boolean) => `Pick one of your meals for ${upcoming ? 'that day' : 'today'}. Your other days stay as they are.`,
  ownNotSaved: "That didn't save. Check your connection and try again.",
  ownNone: 'None of your saved meals for this one fit what you avoid.',
  /** On the shopping list, once, when it left meals out. */
  listLine: (count: number) =>
    `${count} ${count === 1 ? 'meal is' : 'meals are'} cooked for you, so ${count === 1 ? 'it is' : 'they are'} not on this list.`,
  profileHeading: 'Meals cooked for me',
  profileHelp: 'Meals somebody else cooks for you, at work for example. They stay in your day and count towards it, and are never on your shopping list.',
  profileNone: 'None',
  /** After a change saved. The list is never rebuilt behind his back, so it says what he has to do. */
  saved: (any: boolean) => any
    ? 'Saved. Those meals stay in your day and count towards it. Rebuild your shopping list to take them off it.'
    : 'Saved. Every meal is yours to cook again. Rebuild your shopping list to put them back on it.',
  /** Before the database step lands on his account. */
  notSavedYet: "That didn't save: this setting isn't switched on for your account yet.",
  notSaved: "That didn't save. Check your connection and try again.",
} as const
