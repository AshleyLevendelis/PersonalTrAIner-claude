import { createContext, useContext } from 'react'

// ---------------------------------------------------------------------------
// THE STARTER TIER (his 13 Nov 2026 strategy, slice 4b): Profile, Food, "Show numbers" off hides calories and macros
// on Nutrition and Home. ONE switch that every part drawing a nutrition number reads, so a screen cannot be missed by
// a copy of the rule. Meals, the portions to cook and what is logged stay: only the energy and macro figures go.
// Absent reads as on (every profile before the setting).
// ---------------------------------------------------------------------------

export const ShowNumbersContext = createContext<boolean>(true)

export function useShowNumbers(): boolean {
  return useContext(ShowNumbersContext)
}

/** The day's line on the starter tier: meals, never numbers. */
export function starterDayLine(loggedMeals: number, plannedMeals: number): string {
  if (plannedMeals === 0) return 'No meals planned'
  return loggedMeals > 0 ? `Logged ${loggedMeals} of ${plannedMeals} meals` : `${plannedMeals} meals planned`
}

/**
 * Does a sentence carry a calorie or gram figure? On the starter tier a coach line built from the day's numbers
 * ("Protein is behind — 160g to go") is not drawn, wherever it comes from: one test, so a new line cannot slip past.
 * A weight on the bar ("80 kg") and minutes are not nutrition figures.
 */
export function holdsNutritionFigure(text: string): boolean {
  return /\d[\d,.]*\s*(kcal|calories|cal|g)\b/i.test(text)
}

/** The refit offer's sentence on the starter tier: the same offer, no figure. */
export const MEALS_DRIFTED_PLAIN = 'Your meals no longer fit your targets. I can resize them — same meals, different amounts.'
