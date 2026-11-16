// ---------------------------------------------------------------------------
// A MEAL HE SAYS HE LIKES CAN GO IN THE PLAN, NOT ONLY INTO MEMORY.
//
// His screenshot, 16 Nov 2026: "I like having greek yoghurt with fruit and almonds for breakfast" was saved as a like
// ("Saved to memory · new meals are made with it in mind"), and the plan did not change. A like only ranks the dishes
// the plan already has; when none of them is greek yoghurt with fruit and almonds, nothing he can see moves. His
// "Meal planning" brief names this as the core gap: what is said in the chat never reaches the plan.
//
// Now a like that is a WHOLE MEAL for a named meal ("X with Y for breakfast") is followed by the app's offer, in its
// own words, with buttons: put it in tomorrow's breakfast, have it every breakfast for the days the plan shows, or
// just remember it. A button is his instruction to the coach's add-a-meal route, so the dish is costed, checked against
// his diet and avoids, sized by the app and shown with Apply before anything is written (his rulings "App sizes it",
// "Text + small buttons"). Nothing is added because he said he liked something.
//
// "Every day" is offered for breakfast and a snack only (CSCS, mine, 16 Nov 2026): a breakfast or a snack eaten every
// day costs little, because the day's other meals still rotate and carry the vegetables and the fish; the same lunch or
// dinner every day takes most of a week's variety with it. Asked for in words, any meal can repeat: he asked, he gets it.
// ---------------------------------------------------------------------------

import type { MealSlotName } from './meal-store'
import { addDays } from './meal-rotation'

const SLOT_WORDS: [RegExp, MealSlotName][] = [
  [/^breakfast$/, 'breakfast'],
  [/^(?:lunch|dinner at work)$/, 'lunch'],
  [/^(?:dinner|tea|supper)$/, 'dinner'],
  [/^(?:a )?snack$/, 'snack'],
]

/** The meal he says he likes, and which meal it is for, or null when the message is not that. */
export function wholeMealLike(message: string): { meal: string; slot: MealSlotName } | null {
  const t = (message ?? '').trim().replace(/[’]/g, "'").replace(/[.!]+$/, '')
  if (!t || t.length > 160 || t.includes('?')) return null
  const m = /\b(?:i (?:really )?(?:like|love|enjoy)|i (?:usually|often|normally|always) (?:have|eat)|my (?:usual|go-to|favourite|favorite)(?: \w+)? is)\s+(?:having |eating |a |an |some )?(.+?)\s+(?:for|at|as)\s+(?:my |a )?(breakfast|lunch|dinner|tea|supper|snack)\b/i.exec(t)
  if (!m) return null
  const meal = m[1].trim().replace(/^(?:having|eating)\s+/i, '')
  const slotWord = m[2].toLowerCase()
  const slot = SLOT_WORDS.find(([re]) => re.test(slotWord))?.[1]
  if (!slot) return null
  // A whole meal is more than one food ("greek yoghurt with fruit and almonds"); "I like eggs for breakfast" is a like.
  if (!/\b(?:with|and|plus|on)\b|,/.test(meal)) return null
  if (meal.split(/\s+/).length > 12) return null
  return { meal, slot }
}

/** Whether the app offers "every day" for this meal (CSCS, above). */
export function offersEveryDay(slot: MealSlotName): boolean {
  return slot === 'breakfast' || slot === 'snack'
}

export const MEAL_LIKE_OFFER = {
  question: (slot: MealSlotName) => `Want it in your plan too? It can be one of your ${slot === 'snack' ? 'snacks' : `${slot}s`}.`,
  tomorrow: (meal: string, slot: MealSlotName) => `Put ${meal} in tomorrow's ${slot}`,
  everyDay: (meal: string, slot: MealSlotName) => `Have ${meal} every ${slot} this week`,
  justRemember: 'Just remember it',
  /** The app's reply to "Just remember it": nothing else happens. */
  remembered: "Noted. It's in your likes, and the plan stays as it is.",
  /** The offer, with its buttons, as the text of the app's turn. */
  turn(meal: string, slot: MealSlotName) {
    const chips = [this.tomorrow(meal, slot), ...(offersEveryDay(slot) ? [this.everyDay(meal, slot)] : []), this.justRemember]
    return `${this.question(slot)}\n[QUICK_REPLIES: ${chips.map(c => `"${c.replace(/"/g, "'")}"`).join(' | ')}]`
  },
}

/** How many days a meal added "every day" covers: from its date to the last day the plan shows (today + 6). */
export function repeatDates(date: string, days: number, todayDate: string): string[] {
  const n = Math.max(1, Math.min(7, Math.floor(Number.isFinite(days) ? days : 1)))
  const last = addDays(todayDate, 6)
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const d = addDays(date, i)
    if (d > last) break
    out.push(d)
  }
  return out
}

/** "Tue 17 Nov to Sun 22 Nov", or the one date. */
export function datesLabel(dates: readonly string[]): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()]} ${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`
  }
  if (dates.length === 0) return ''
  return dates.length === 1 ? fmt(dates[0]) : `${fmt(dates[0])} to ${fmt(dates[dates.length - 1])}`
}
