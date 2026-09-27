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
import type { PoolOption } from './meal-generation'
import type { MealSlotName } from './meal-store'

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

/**
 * THE LINE FOR A MEAL ALREADY EATEN — roadmap item 9, Ashley's ruling 9 Sep
 * 2026, chosen over saying nothing and over keeping the red warning:
 * "a quiet note".
 *
 * A warning is an instruction to act, and there is no action left on food
 * that is already eaten — swapping or regenerating changes the plan, not
 * lunch. But silence is wrong too: someone who has just added an allergen tag
 * after a reaction is precisely the person who wants to know that this
 * morning's meal contained it. So this states the fact, in the past tense,
 * and asks for nothing.
 *
 * Returns null for an ok verdict, so a caller cannot render an empty note.
 */
export function describeEatenBeforeChange(verdict: MealRestrictionVerdict): string | null {
  if (verdict.ok || verdict.issues.length === 0) return null
  const first = verdict.issues[0]
  const label = restrictionLabel(first)
  // Naming the ingredient is the useful half and is not always possible —
  // same honesty boundary as describeIssues: a tag violation can come from an
  // ingredient the food database could not resolve, and inventing one here
  // would be worse than the shorter sentence.
  return first.ingredient
    ? `This had ${first.ingredient} — you ate it before you added ${label}.`
    : `You ate this before you added ${label}.`
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

/**
 * THE POOLS, WITH EVERY OPTION THAT BREAKS A CURRENT RESTRICTION MARKED — so
 * a like never favours it (27 Sep 2026).
 *
 * A heart, or a meal asked for by name, survives a regenerate without being
 * re-checked, so a pool can hold a meal that broke nothing when it was kept
 * and breaks a restriction added since. The day ranking knows nothing about
 * restrictions; before likes were a sort key that meal could only win on fit,
 * and with them it would have won ON PURPOSE, which would make "they never
 * override what you avoid" false. The same check the meal card runs, one
 * place, applied to every pool the app assembles from.
 *
 * A fresh object only where the mark changes, so a clean option keeps its
 * identity; and a stale mark is REMOVED, because a pool read back from a
 * marked copy must not carry yesterday's restriction into today's.
 */
export function markRestrictionBreakers(
  pools: Partial<Record<MealSlotName, PoolOption[]>>,
  dietaryPreferences: string[],
  avoidFoods: string[],
): Partial<Record<MealSlotName, PoolOption[]>> {
  const out: Partial<Record<MealSlotName, PoolOption[]>> = {}
  for (const [slot, options] of Object.entries(pools) as [MealSlotName, PoolOption[] | undefined][]) {
    if (!options) continue
    out[slot] = options.map(o => {
      const breaks = !checkMealAgainstRestrictions(o.name, o.ingredients, dietaryPreferences, avoidFoods).ok
      if (breaks) return o.breaksRestriction ? o : { ...o, breaksRestriction: true as const }
      if (!o.breaksRestriction) return o
      const { breaksRestriction: _stale, ...rest } = o
      return rest
    })
  }
  return out
}

/**
 * The hearted dishes the generator may be asked for: every one, minus any the
 * pools mark as breaking a current restriction. A pure function so the rule
 * can be run by a check rather than read off App's source.
 */
export function favouritesStillAllowed(
  pools: Partial<Record<MealSlotName, PoolOption[]>>,
  favouriteNames: string[],
): string[] {
  const breaking = new Set(
    (Object.values(pools) as (PoolOption[] | undefined)[])
      .flatMap(opts => opts ?? [])
      .filter(o => o.breaksRestriction)
      .map(o => o.name.trim().toLowerCase()),
  )
  return favouriteNames.filter(n => !breaking.has(n.trim().toLowerCase()))
}
