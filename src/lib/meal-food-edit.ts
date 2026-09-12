import { verifyProposal, computeSlotBudgets, type RawProposal } from './meal-generation'
import { normaliseSlot, normaliseIngredients, normaliseDate, explainRejection, type MealAdditionPayload } from './meal-addition'
import { parseIngredientLines, withQuantity } from './portion-scaler'
import { FOOD_DB, lookupIngredient, unitToGrams, type FoodEntry, type Macros100g } from './food-db'
import type { MacroTargets } from './types'
import type { ProposalDiff } from './pending-actions-store'
import type { MealSlotName } from './meal-store'
import type { CurrentMealForSlot } from './meal-food-add'

// ---------------------------------------------------------------------------
// CHANGING ONE FOOD INSIDE A MEAL — take it out, swap it, resize it.
//
// Ashley, asked on 12 Sep 2026 what to build next, chose "make meals as
// adjustable as workouts". A workout can have an exercise swapped, banned,
// removed or moved. A meal could be swapped whole, regenerated, or have a food
// ADDED — and nothing else. CLAUDE.md's must-have list marks all three of
// these MISSING, which breaks its own rule 1: a feature touching a grain
// supports every operation listed for that grain, or says which it does not.
//
// ONE PIPELINE, AND IT IS NOT A NEW ONE. meal-food-add.ts established it, and
// all three operations here are that pipeline with a different ingredient
// array:
//
//   remove  = the lines minus one
//   replace = minus one, plus one
//   resize  = one line's number changed
//
// Everything then goes through verifyProposal in keepPortions mode — food-DB
// resolution, the >=80% coverage floor, the dislike filter,
// validateMealAgainstDiet — and comes out as a PoolOption confirmed through
// the same executor with the same undo. That function's own comment records
// why no parallel path may exist: "a parallel 'custom' path with its own
// subset of the checks is how the almond butter got through the swap path —
// one pipeline, one place to be wrong." Nothing here adds a check and nothing
// skips one.
//
// A REMOVAL CANNOT INTRODUCE AN ALLERGEN; A REPLACEMENT OBVIOUSLY CAN. Both
// are verified identically anyway, because deciding per-operation which checks
// to run is the shape of the bug above.
//
// HER RULING ON WHAT A REMOVAL SAYS, 12 Sep 2026, chosen over removing quietly
// and over silently growing the other meals ("the one thing the app has always
// refused to do"): it states what leaves with the food — "-31g protein,
// -210 kcal" — and offers to replace it. Decline and the day is simply
// lighter, and the rings show that honestly. Deliberately the same shape as
// removing an exercise, which already reports what it costs the week's
// push:pull balance and offers the swap list before the tap.
// ---------------------------------------------------------------------------

export interface BuildMealFoodEditInput {
  rawArgs: Record<string, unknown>
  /** Null when the slot has no meal today — there is nothing to edit. */
  currentMeal: CurrentMealForSlot | null
  profileId: string
  todayDate: string
  targets: MacroTargets
  mealsPerDay?: number
  includeSnacks?: boolean
  dietaryPreferences: string[]
  dislikedFoods?: string[]
  /**
   * What the app is already serving this person — the ingredient lines across
   * her current meals, passed as they are written. Used ONLY to order the
   * swaps offered when a food is removed, never to filter and never to
   * verify: a suggestion still has to pass the same build as any other.
   * Optional, and the offer degrades to macro-similarity alone without it
   * rather than going quiet.
   */
  pantryFoods?: string[]
}

export type MealFoodEditResult =
  | { ok: true; scopeKey: string; preconditions: Record<string, unknown>; payload: MealAdditionPayload; diff: ProposalDiff }
  | { ok: false; reason: string }

const signed = (n: number, unit: string) => `${n > 0 ? '+' : ''}${n}${unit}`

/**
 * "today", not "2026-09-12". A date she can read off her own phone's clock is
 * not information; it is the app talking to itself in front of her.
 */
const whenFor = (input: BuildMealFoodEditInput) => {
  const date = normaliseDate(input.rawArgs.date, input.todayDate)
  return date === input.todayDate ? 'today' : date
}

/**
 * The fewest foods a meal may be reduced to. One: a meal of a single food is
 * a real thing people eat, and refusing it would be the app having an opinion
 * about her lunch. Zero is not a meal — that is deleting it, which is what
 * regenerate and swap are for.
 */
export const MIN_FOODS_PER_MEAL = 1

/**
 * Which line she means. Matched on the parsed NAME rather than the raw line,
 * so "the chicken" finds "122g raw chicken breast" without her having to
 * quote the amount back at us.
 *
 * Ambiguity is reported, never guessed: two lines containing "chicken" is a
 * question, and picking one would silently change the wrong food.
 */
/** Just the food, without its amount — for naming, never for matching. */
function foodNameOf(line: string): string {
  return parseIngredientLines([line])[0]?.name ?? line
}

export function matchIngredient(lines: string[], phrase: string):
  | { ok: true; index: number }
  | { ok: false; reason: 'not_found' | 'ambiguous'; candidates: string[] } {
  const want = phrase.trim().toLowerCase().replace(/^(the|my|some)\s+/, '')
  if (!want) return { ok: false, reason: 'not_found', candidates: [] }
  const parsed = parseIngredientLines(lines)
  const norm = (s: string) => s.toLowerCase().replace(/s\b/g, '')
  const hits: number[] = []
  parsed.forEach((p, i) => {
    const name = norm(p.name)
    const w = norm(want)
    if (name.includes(w) || w.includes(name)) hits.push(i)
  })
  if (hits.length === 1) return { ok: true, index: hits[0] }
  if (hits.length === 0) return { ok: false, reason: 'not_found', candidates: lines }
  return { ok: false, reason: 'ambiguous', candidates: hits.map(i => lines[i]) }
}

/** Everything the three operations need before they can differ. */
type Common =
  | { err: string; slot?: undefined }
  | { err?: undefined; slot: MealSlotName; budget: MacroTargets; index: number; line: string; meal: CurrentMealForSlot }

function common(input: BuildMealFoodEditInput): Common {
  const slot = normaliseSlot(input.rawArgs.meal_slot) as MealSlotName | null
  if (!slot) return { err: 'Which meal — breakfast, lunch, dinner or a snack?' } as const
  if (!input.currentMeal) {
    return { err: `There's no ${slot} on your plan today to change. Tell me what you're having and I'll set it up as the meal instead.` } as const
  }
  const budgets = computeSlotBudgets(input.targets, input.mealsPerDay, input.includeSnacks)
  const budget = budgets[slot as MealSlotName]
  if (!budget) {
    return { err: `Your plan doesn't have a ${slot} slot at the moment. You can change how many meals a day you eat in Profile.` } as const
  }
  const food = typeof input.rawArgs.food === 'string' ? input.rawArgs.food : ''
  if (!food.trim()) return { err: 'Which food in it did you mean?' } as const
  const match = matchIngredient(input.currentMeal.ingredients, food)
  if (!match.ok) {
    return {
      err: match.reason === 'ambiguous'
        ? `There's more than one thing like that in your ${slot} — ${match.candidates.join(', ')}. Which one?`
        : `I can't find ${food} in your ${slot}. It has ${match.candidates.join(', ')}.`,
    } as const
  }
  const line = input.currentMeal.ingredients[match.index]
  // Belt and braces: matchIngredient only ever returns an index it found, but
  // returning the LINE means no caller has to index the array again and none
  // of them can drift out of step with the match.
  if (!line) return { err: `I can't find ${food} in your ${slot} any more — try again?` } as const
  return { slot, budget, index: match.index, line, meal: input.currentMeal } as const
}

/** Runs the edited line list through the one pipeline and builds the card. */
function settle(
  input: BuildMealFoodEditInput,
  ctx: { slot: MealSlotName; budget: MacroTargets; meal: CurrentMealForSlot },
  ingredients: string[],
  /**
   * WHAT THE EDITED MEAL IS CALLED, and it must not be what the original is
   * called. A pick is stored and resolved by meal NAME, so an edit that kept
   * the name inserted a second option indistinguishable from the first and
   * the screen went on rendering the original — the change landed in the
   * database and nowhere else. Found by the browser driver, which is the only
   * check that could have found it: every unit check here was green.
   * meal-food-add had it right all along with "<meal> + <food>"; this is the
   * same grammar for the other three directions.
   */
  name: string,
  verb: 'propose_meal_food_remove' | 'propose_meal_food_replace' | 'propose_meal_food_resize',
  headline: { field: string; before: string; after: string },
  implications: { severity: 'info' | 'warn'; text: string }[],
  subject: string,
  alternatives?: ProposalDiff['alternatives'],
): MealFoodEditResult {
  const { slot, budget, meal } = ctx
  const proposal: RawProposal = { slot: slot as MealSlotName, name, ingredients, prep: '', cuisine: '' }
  const rejectLog: string[] = []
  // keepPortions: every amount here is a fact — the meal's as it was served,
  // and hers wherever she has restated one.
  const option = verifyProposal(proposal, slot, budget, input.dietaryPreferences, rejectLog, input.dislikedFoods ?? [], undefined, true)
  if (!option) return { ok: false, reason: explainRejection(rejectLog, subject, slot) }

  const date = normaliseDate(input.rawArgs.date, input.todayDate)
  const m = option.macros
  const b = meal.macros
  const diff: ProposalDiff = {
    rows: [
      headline,
      { field: 'Calories', before: `${Math.round(b.calories)} kcal`, after: `${Math.round(m.calories)} kcal`, note: signed(Math.round(m.calories - b.calories), ' kcal') },
      { field: 'Protein', before: `${Math.round(b.protein)}g`, after: `${Math.round(m.protein)}g`, note: signed(Math.round(m.protein - b.protein), 'g') },
      { field: 'Carbs', before: `${Math.round(b.carbs)}g`, after: `${Math.round(m.carbs)}g`, note: signed(Math.round(m.carbs - b.carbs), 'g') },
      { field: 'Fat', before: `${Math.round(b.fat)}g`, after: `${Math.round(m.fat)}g`, note: signed(Math.round(m.fat - b.fat), 'g') },
    ],
    implications,
    alternatives: alternatives && alternatives.length > 0 ? alternatives : undefined,
    rationale: typeof input.rawArgs.origin_verbatim_quote === 'string' && input.rawArgs.origin_verbatim_quote.trim()
      ? input.rawArgs.origin_verbatim_quote.trim() : undefined,
    reversible: true,
  }
  return {
    ok: true,
    scopeKey: `${input.profileId}:${verb}:${slot}:${date}`,
    preconditions: { slot, date, mealName: option.name, editedFrom: meal.name },
    payload: { slot, date, option },
    diff,
  }
}

/**
 * How many foods we are willing to TRY before giving up. Each trial is a full
 * verification, so this is the ceiling on the work one removal does — 14 is
 * comfortably more than the number of same-category foods that survive the
 * gram clamp, and small enough that a slow phone does not notice.
 */
const MAX_CANDIDATES_TRIED = 14
/** Her ruling said two or three. Three, and fewer when fewer survive. */
const SUGGESTION_COUNT = 3

type MacroKey = 'protein' | 'carbs' | 'fat'

/** One offered swap: what it is, what it keeps, and what tapping it asks for. */
export type MealSwapSuggestion = NonNullable<ProposalDiff['alternatives']>[number]

/**
 * WHAT THE FOOD WAS THERE FOR — the macro contributing the most of its
 * calories. Chicken is in the meal for its protein, rice for its carbs, olive
 * oil for its fat, and a swap that keeps that is a swap that keeps the meal's
 * shape. Compared in CALORIES, not grams, or fat (9 kcal/g) would never win.
 */
function dominantMacro(m: Macros100g): MacroKey {
  const byKcal: [MacroKey, number][] = [['protein', m.protein * 4], ['carbs', m.carbs * 4], ['fat', m.fat * 9]]
  return byKcal.sort((a, b) => b[1] - a[1])[0][0]
}

/**
 * TWO OR THREE SPECIFIC SWAPS THAT CLOSE THE GAP — Ashley's ruling, 12 Sep
 * 2026, chosen over a generic "tell me what you'd like instead": on a phone
 * the generic version means typing a food name into a box, and the whole
 * point of the offer is that it is one tap.
 *
 * EVERY SUGGESTION IS BUILT BY THE REPLACE BUILDER AND KEPT ONLY IF IT COMES
 * BACK OK. That is the entire safety argument, and it is why this does not
 * filter foods itself: a hand-rolled "skip the nuts" filter here would be a
 * second, weaker copy of validateMealAgainstDiet, which is precisely the
 * shape of bug verifyProposal's comment warns about. Offering a food is a
 * promise it can be confirmed, so the only honest way to make it is to run
 * the confirmation.
 *
 * Returns fewer than three, or none at all, rather than reaching for a worse
 * candidate — an empty list is a true statement that nothing in the database
 * fits, and the card still says what the removal costs.
 */
function suggestReplacements(input: BuildMealFoodEditInput, slot: MealSlotName, removed: string): MealSwapSuggestion[] {
  const parsed = parseIngredientLines([removed])[0]
  if (!parsed) return []
  const entry = lookupIngredient(parsed.name)
  if (!entry) return []
  const grams = unitToGrams(entry, parsed.unit, parsed.quantity)
  if (!(grams > 0)) return []

  const share = grams / 100
  const lost: Macros100g = {
    kcal: entry.per100g.kcal * share,
    protein: entry.per100g.protein * share,
    carbs: entry.per100g.carbs * share,
    fat: entry.per100g.fat * share,
  }
  const key = dominantMacro(lost)
  // Nothing meaningful to match (a lettuce leaf, a pinch of herbs): the
  // removal costs almost nothing, so there is nothing to close.
  if (lost[key] < 1) return []

  // WHAT SHE ALREADY EATS COMES FIRST. Ranking on macros alone is correct and
  // useless: the first build offered anchovies and beef jerky in place of a
  // chicken breast, both of which match the protein and neither of which any
  // trainer would say out loud. The app's own meals for THIS person are the
  // only honest signal for "a normal thing to put here" — they have already
  // passed her dietary settings and her dislikes, and she has been served
  // them. Absent that list the order is macro-similarity alone, which is
  // weaker but never wrong.
  // Substring, not equality, so a caller can hand over the ingredient LINES
  // it already has ("122g raw chicken breast") without parsing them first.
  const pantry = (input.pantryFoods ?? []).map(n => n.toLowerCase())
  const inPantry = (f: FoodEntry) =>
    [f.name, ...f.aliases].some(n => pantry.some(entry => entry.includes(n.toLowerCase())))
  // Distance across ALL THREE macros in calorie terms, not just the dominant
  // one: beef jerky matches a chicken breast's protein and carries 26g of fat
  // with it, and only a whole-profile comparison notices.
  const distance = (f: FoodEntry) =>
    Math.abs(f.per100g.protein - entry.per100g.protein) * 4
    + Math.abs(f.per100g.carbs - entry.per100g.carbs) * 4
    + Math.abs(f.per100g.fat - entry.per100g.fat) * 9

  const candidates = FOOD_DB
    .filter(f => f.category === entry.category && f.name !== entry.name && f.per100g[key] > 0)
    .sort((a, b) => (inPantry(b) ? 1 : 0) - (inPantry(a) ? 1 : 0) || distance(a) - distance(b))
    .slice(0, MAX_CANDIDATES_TRIED)

  const out: MealSwapSuggestion[] = []
  for (const c of candidates) {
    const need = Math.round((lost[key] / c.per100g[key]) * 100 / 5) * 5
    // ROUGHLY THE SAME AMOUNT OF FOOD, or it is not a swap. Measured against
    // the amount coming out rather than a flat gram floor, because within a
    // single category the densities span fourteen-fold — 5.5g of protein per
    // 100g for silken tofu against 80g for whey — so matching one scoop of
    // whey with 870g of tofu is arithmetically perfect and absurd. The other
    // end matters just as much: 110g of garlic carries the protein of 300g of
    // watercress and is a seasoning, not a salad.
    //
    // The bounds are what the real database produces for sensible pairs, with
    // room either side: every swap offered for chicken, rice, oil and broccoli
    // lands between 0.9x and 1.6x. 500g is the ceiling whatever the ratio says.
    //
    // A flat 10g floor stood here first. It was doing the trace-ingredient job
    // the `lost < 1` guard above already does, and that overlap is what let a
    // mutation of the guard pass unnoticed: two mechanisms guarding one
    // property means neither is tested.
    if (need > 500 || need > grams * 2.5 || need < grams * 0.5) continue
    const line = `${need}g ${c.name}`
    const trial = buildMealFoodReplaceProposal({ ...input, rawArgs: { ...input.rawArgs, with_food: line } })
    if (!trial.ok) continue
    const kcalDelta = Math.round(c.per100g.kcal * need / 100 - lost.kcal)
    out.push({
      label: line,
      note: Math.abs(kcalDelta) < 10 ? `same ${key}, about the same calories` : `same ${key}, ${signed(kcalDelta, ' kcal')}`,
      prompt: `Replace the ${parsed.name} in my ${slot} with ${line}`,
    })
    if (out.length === SUGGESTION_COUNT) break
  }
  return out
}

/** Take one food out. Her ruling: say what it costs, and offer the swap. */
export function buildMealFoodRemoveProposal(input: BuildMealFoodEditInput): MealFoodEditResult {
  const c = common(input)
  if (c.err !== undefined) return { ok: false, reason: c.err }
  const { slot, meal, index, line: removed } = c
  if (meal.ingredients.length - 1 < MIN_FOODS_PER_MEAL) {
    return { ok: false, reason: `That's the only thing in your ${slot}. Swap the whole meal instead, or tell me what you're having.` }
  }
  const ingredients = meal.ingredients.filter((_, i) => i !== index)
  const alternatives = suggestReplacements(input, slot, removed)
  return settle(input, c, ingredients, `${meal.name} without ${foodNameOf(removed)}`, 'propose_meal_food_remove',
    { field: 'Taking out', before: removed, after: '—' },
    [
      // HER RULING, IN THE CARD. The numbers are on the rows above; this is
      // the offer that goes with them. Named swaps when the database has
      // them, the honest generic line when it does not — never a promise of
      // options that are not there.
      alternatives.length > 0
        ? { severity: 'info', text: `Tap one of the swaps below to put it in instead — or leave it out and your day just comes in lighter.` }
        : { severity: 'info', text: `Say the word and I'll put something else in its place instead — otherwise your day just comes in lighter.` },
      { severity: 'info', text: `The rest of your ${slot} keeps its amounts exactly; nothing is re-portioned to cover the gap.` },
      { severity: 'info', text: `Becomes your ${slot} for ${whenFor(input)}; the original stays in your ${slot} options.` },
    ],
    removed,
    alternatives)
}

/** Swap one food for another, at an amount she states. */
export function buildMealFoodReplaceProposal(input: BuildMealFoodEditInput): MealFoodEditResult {
  const c = common(input)
  if (c.err !== undefined) return { ok: false, reason: c.err }
  const { slot, meal, index, line: removed } = c
  const withLines = normaliseIngredients(input.rawArgs.with_food)
  if (withLines.length === 0) return { ok: false, reason: 'What should go in instead? Tell me the food and how much.' }
  // Same rule as adding: the amount is hers, so it has to be stated.
  const vague = withLines.filter(l => !/\d/.test(l) && !/\b(a|an|one|half|quarter)\b/i.test(l))
  if (vague.length > 0) {
    return { ok: false, reason: `How much ${vague.join(', ')}? Grams, or counts like "2 eggs", both work.` }
  }
  const ingredients = [...meal.ingredients.slice(0, index), ...withLines, ...meal.ingredients.slice(index + 1)]
  return settle(input, c, ingredients, `${meal.name} with ${withLines.map(foodNameOf).join(', ')} instead of ${foodNameOf(removed)}`, 'propose_meal_food_replace',
    { field: 'Swapping', before: removed, after: withLines.join(', ') },
    [
      { severity: 'info', text: `Everything else in your ${slot} stays exactly as it is.` },
      { severity: 'info', text: `Checked against your dietary settings the same way any new meal is.` },
      { severity: 'info', text: `Becomes your ${slot} for ${whenFor(input)}; the original stays in your ${slot} options.` },
    ],
    withLines.join(', '))
}

/** Same food, different amount. */
export function buildMealFoodResizeProposal(input: BuildMealFoodEditInput): MealFoodEditResult {
  const c = common(input)
  if (c.err !== undefined) return { ok: false, reason: c.err }
  const { slot, meal, index, line: before } = c
  const raw = input.rawArgs.amount
  const amount = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : NaN
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'How much of it do you want instead? A number in the same units — grams, or a count.' }
  }
  const after = withQuantity(before, amount)
  if (!after) {
    return { ok: false, reason: `"${before}" has no amount to change. Tell me what you'd like it to be and I'll swap it instead.` }
  }
  if (after === before) return { ok: false, reason: `Your ${slot} already has ${before}.` }
  const ingredients = [...meal.ingredients.slice(0, index), after, ...meal.ingredients.slice(index + 1)]
  return settle(input, c, ingredients, `${meal.name} with ${after}`, 'propose_meal_food_resize',
    { field: 'Changing', before, after },
    [
      { severity: 'info', text: `Only the amount changes — everything else in your ${slot} stays as it is.` },
      { severity: 'info', text: `Becomes your ${slot} for ${whenFor(input)}; the original stays in your ${slot} options.` },
    ],
    after)
}
