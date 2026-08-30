// ---------------------------------------------------------------------------
// IS THIS MEAL STILL ALLOWED? — audit §2.1
//
// Enforcement in this app ran at GENERATION time only. validateMealAgainstDiet
// is called when a meal is created (meal-generation), added (meal-addition) or
// swapped in (meal-swap-proposal) — and nothing ever looked at a meal again.
//
// So a restriction added AFTERWARDS did nothing. Turn on "Nut-free" today and
// this morning's breakfast keeps its 15g of peanut butter, on screen,
// unflagged, permanently — until the user finds the Regenerate button and
// knows to press it. Measured: eleven checks across the whole render path,
// all failing; no effect anywhere watches dietary_preferences, and no screen
// re-validates a meal it displays.
//
// The twelve "-free" tags in the dietary list are allergens. Someone turning
// one on after a reaction is not expressing a preference, and a plan that
// still shows the food reads as the app telling them it is fine.
//
// THIS MODULE ADDS NO NEW JUDGEMENT. It calls validateMealAgainstDiet and
// containsPhrase — the exact two functions generation already uses — so a
// meal cannot be judged one way when it is created and another way when it is
// shown. A second matcher here would be the same divergence the almond-butter
// fix was about, one layer along.
// ---------------------------------------------------------------------------

import { validateMealAgainstDiet, type DietaryPreference } from './diet-rules'
import { containsPhrase } from './meal-ingredients'

export interface MealRestrictionIssue {
  /** 'diet' is a restriction from the picker (including every allergen tag); 'avoid' is the free-text avoid-list. */
  kind: 'diet' | 'avoid'
  /** The restriction as the user set it — "nut-free", "mushrooms". */
  restriction: string
  /** The ingredient that breaks it, when one can be named. */
  ingredient?: string
}

export interface MealRestrictionVerdict {
  ok: boolean
  issues: MealRestrictionIssue[]
  /**
   * One line for the user, or null when there is nothing wrong.
   *
   * Names the restriction AND the ingredient, because "this doesn't match
   * your restrictions" gives someone nothing to act on.
   */
  message: string | null
}

const OK: MealRestrictionVerdict = { ok: true, issues: [], message: null }

/**
 * Re-checks one meal against the CURRENT restrictions.
 *
 * `ingredients` are the meal's ingredient lines. A meal with no recorded
 * ingredients cannot be checked and comes back ok — deliberately, and this is
 * the honesty boundary: a flag appearing means something was found, a flag
 * not appearing has never meant "safe". The disclosure on the Profile screen
 * says so in the user's words, and this does not quietly widen that claim.
 */
export function checkMealAgainstRestrictions(
  mealName: string,
  ingredients: { name: string; quantity: number; unit: string }[],
  dietaryPreferences: string[],
  avoidFoods: string[],
): MealRestrictionVerdict {
  if (ingredients.length === 0) return OK

  const issues: MealRestrictionIssue[] = []

  const diet = validateMealAgainstDiet(ingredients, dietaryPreferences)
  if (!diet.ok) {
    for (const v of diet.violations) {
      issues.push({ kind: 'diet', restriction: v.preference, ingredient: v.ingredient })
    }
  }

  const names = ingredients.map(i => i.name)
  for (const food of avoidFoods) {
    if (!food.trim()) continue
    if (containsPhrase(mealName, names, food)) {
      issues.push({
        kind: 'avoid',
        restriction: food.trim(),
        ingredient: names.find(n => containsPhrase('', [n], food)),
      })
    }
  }

  if (issues.length === 0) return OK
  return { ok: false, issues, message: describeIssues(issues) }
}

/** Plain-English label for a restriction tag — "nut-free" reads oddly in a sentence. */
function restrictionLabel(issue: MealRestrictionIssue): string {
  if (issue.kind === 'avoid') return issue.restriction
  const tag = issue.restriction as DietaryPreference | string
  return typeof tag === 'string' && tag.endsWith('-free')
    ? `${tag.slice(0, -'-free'.length).replace(/-/g, ' ')}-free`
    : String(tag).replace(/-/g, ' ')
}

function describeIssues(issues: MealRestrictionIssue[]): string {
  const first = issues[0]
  const named = first.ingredient ? `${first.ingredient}` : null
  const label = restrictionLabel(first)
  const extra = issues.length > 1 ? ` (and ${issues.length - 1} more)` : ''
  // Two shapes, because naming the ingredient is much more useful and is not
  // always possible — a tag violation can come from an ingredient the food
  // database couldn't resolve, and inventing a name there would be worse
  // than the vaguer sentence.
  return named
    ? `Contains ${named}, which doesn't fit "${label}"${extra}.`
    : `Doesn't fit "${label}"${extra}.`
}
