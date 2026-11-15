// ---------------------------------------------------------------------------
// THE WEEK'S TUNA AND OILY FISH WHILE PREGNANT (his ruling 15 Nov 2026, "NHS list, auto-on";
// docs/plans/pregnancy-one-switch.md). The NHS advice is a LIMIT, not a ban: no more than 4 medium tins of tuna (or 2
// tuna steaks) and no more than 2 portions of oily fish (about 140 g each) a week. So nothing here refuses a meal: the
// served week is counted and Nutrition says so when it goes over, in the advice's own words.
// ---------------------------------------------------------------------------

import { lookupIngredient, unitToGrams } from './food-db'

/** A medium tin, drained (about 112 g of a 145 g tin). */
const TUNA_TIN_G = 112
const TUNA_TINS_PER_WEEK = 4
/** A tuna steak counts as two tins (the advice is 4 tins OR 2 steaks). */
const STEAK_AS_TINS = 2
const STEAK_G = 140
/** A meal-deal tuna sandwich holds about half a tin. */
const SANDWICH_AS_TINS = 0.5
const OILY_FISH_PORTION_G = 140
const OILY_FISH_PORTIONS_PER_WEEK = 2

const OILY = /\b(salmon|mackerel|sardines?|trout|anchov(y|ies)|herring|kippers?|pilchards?)\b/

interface Line { name: string; quantity: number; unit: string }
interface DayMeals { chosen: Partial<Record<string, { ingredients: readonly Line[] } | null | undefined>> }

/** Tins of tuna and portions of oily fish in the served days, one decimal. */
export function pregnancyFishCount(days: readonly DayMeals[]): { tunaTins: number; oilyPortions: number } {
  let tins = 0, oilyG = 0
  for (const day of days) {
    for (const meal of Object.values(day.chosen)) {
      for (const line of meal?.ingredients ?? []) {
        const entry = lookupIngredient(line.name)
        if (!entry) continue
        const grams = unitToGrams(entry, line.unit, line.quantity, line.name) ?? 0
        if (entry.name === 'tuna canned in water') tins += grams / TUNA_TIN_G
        else if (entry.name === 'tuna steak fresh') tins += (grams / STEAK_G) * STEAK_AS_TINS
        else if (entry.name === 'tuna mayo sandwich') tins += (grams / (entry.purchaseUnit?.avgGrams ?? 180)) * SANDWICH_AS_TINS
        else if (OILY.test(entry.name)) oilyG += grams
      }
    }
  }
  return { tunaTins: Math.round(tins * 10) / 10, oilyPortions: Math.round((oilyG / OILY_FISH_PORTION_G) * 10) / 10 }
}

/** What Nutrition says over the limits, in the advice's words. Empty when within them. */
export function pregnancyFishLines(days: readonly DayMeals[]): string[] {
  const { tunaTins, oilyPortions } = pregnancyFishCount(days)
  const out: string[] = []
  if (tunaTins > TUNA_TINS_PER_WEEK) {
    out.push(`This week's meals have about ${tunaTins} tins' worth of tuna. While you're pregnant the NHS advice is no more than ${TUNA_TINS_PER_WEEK} a week, so swap one or two of them.`)
  }
  if (oilyPortions > OILY_FISH_PORTIONS_PER_WEEK) {
    out.push(`This week's meals have about ${oilyPortions} portions of oily fish. While you're pregnant the NHS advice is no more than ${OILY_FISH_PORTIONS_PER_WEEK} a week, so swap one or two of them.`)
  }
  return out
}
