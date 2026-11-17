// THE MEAL A CARD IS ABOUT, ON THE CARD'S OWN DAY (17 Nov 2026, the chat review): "add a banana to tomorrow's
// breakfast" was priced against TODAY's breakfast while the card said tomorrow. Today (or no date) is the plan's meal
// as served; another day is the dish the strip serves that day, found in the slot's options by name. A day whose meal
// cannot be read is said plainly, never priced against today's.
import type { MealPlanDay } from './types'
import type { MealSlotName } from './meal-store'
import { normaliseDate } from './meal-addition'

export interface UpcomingMealsDay { date: string; dayName: string; meals: Partial<Record<MealSlotName, string>> }

export function mealOnDay(mealPlan: MealPlanDay[], upcoming: UpcomingMealsDay[] | undefined, slotName: string, rawDate: unknown, today: string):
  { item: MealPlanDay['items'][number] | undefined; unseen: string | null } {
  const slotRow = mealPlan.find(m => m.meal.toLowerCase() === slotName)
  const date = normaliseDate(rawDate, today)
  if (date === today) return { item: slotRow?.items[0], unseen: null }
  const day = (upcoming ?? []).find(d => d.date === date)
  const name = day?.meals[slotName as MealSlotName]
  const item = name ? slotRow?.items.find(o => o.name === name) : undefined
  if (item) return { item, unseen: null }
  return { item: undefined, unseen: `I can't see your ${slotName || 'meal'} for ${day?.dayName ?? 'that day'} from here, so I won't change it blind. Open that day on Nutrition and tell me again, or I can change today's.` }
}
