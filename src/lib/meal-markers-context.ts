// ---------------------------------------------------------------------------
// WHICH OF TODAY'S MEALS ARE NOT PLANNED DISHES, FOR THE COACH (28 Nov 2026, docs/audits/coach-awareness-2026-11-28.md
// (a) 4; the lead's order).
//
// Nutrition badges some of today's meals: "Assumed" (cooked for him, nothing known about the plate), "Estimate" (cooked
// for him, from a menu he described, or a meal out), and the freestyle day's empty "Your choice" meals. The coach's meal
// list is built after the tags are gone (chosenToMealPlanDays keeps name and macros), so an assumed lunch read to the
// coach as a planned dish with exact numbers, and "how much protein is in my lunch?" got a figure the app never had.
//
// Each marker comes from the app's own test for that kind (elsewhereState, isEatingOut / eatingOutRangeWords,
// isFreestyle / isFreestyleDay), applied to the SAME chosen meals Nutrition draws, so the coach and the badges agree.
// Pure: today's chosen meals in, one block out ('' when every meal is a planned dish).
// ---------------------------------------------------------------------------
import { elsewhereState } from './meals-elsewhere'
import { isEatingOut, eatingOutRangeWords } from './eating-out'
import { isFreestyle, isFreestyleDay } from './freestyle'
import type { MealSlotName } from './meal-store'
import type { PoolOption } from './meal-generation'

const ORDER: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']
const WORD: Record<MealSlotName, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

type Chosen = Partial<Record<MealSlotName, Pick<PoolOption, 'name' | 'tags' | 'elsewhere' | 'macros'> | null | undefined>>

export function buildCoachMealMarkers(chosen: Chosen, eaten: ReadonlySet<MealSlotName> = new Set()): string {
  const lines: string[] = []
  for (const slot of ORDER) {
    const o = chosen[slot]
    if (!o) continue
    // Freestyle before the others: an edited "Your choice" keeps its name and none of the other tags.
    if (isFreestyle(o)) {
      lines.push(`- ${WORD[slot]} (${o.name}): FREESTYLE, their own one-day choice; it counts only what they log into it, so never quote planned numbers for it.`)
    } else if (isEatingOut(o)) {
      lines.push(`- ${WORD[slot]} (${o.name}): EATING OUT, an ESTIMATE of ${eatingOutRangeWords(o.macros.calories)}; the day counts the middle. Never quote it as exact.`)
    } else {
      const state = elsewhereState(o)
      if (state === 'assumed') lines.push(`- ${WORD[slot]} (${o.name}): ASSUMED, cooked for them; the app does not know what is on the plate and counts a normal-sized ${slot}. If they say what it is, offer to make it an estimate.`)
      else if (state === 'estimate') lines.push(`- ${WORD[slot]} (${o.name}): an ESTIMATE from what they described, cooked for them, ordinary portions; never quote it as exact.`)
    }
  }
  if (lines.length === 0) return ''
  const day = isFreestyleDay(chosen, eaten)
    ? '\nToday is a FREESTYLE day: it is judged on protein and calories only (its own line), never "on target".'
    : ''
  return `TODAY'S MEALS THAT ARE NOT PLANNED DISHES (as Nutrition badges them; every other meal today is a planned dish):\n${lines.join('\n')}${day}`
}
