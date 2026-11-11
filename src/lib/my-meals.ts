// ---------------------------------------------------------------------------
// MY MEALS — the meals he already eats, added by him.
//
// Ashley, 11 Nov 2026: "how do we ensure we are helping users fit meals around
// foods they already enjoy without always prescribing meals they have never
// had before?" His ruling, from three options: "My usual meals first".
//
// A meal he types (a name, which meal, its foods with amounts) is read by the
// same reader and costed from the same table as every other dish, and goes
// through the same check the coach's "add a meal" does: one builder
// (buildMealAdditionProposal), so the screen cannot keep a dish the coach
// would refuse. No model is involved: a line the app cannot read is asked
// about, never guessed (his 1 Oct ruling).
//
// What makes it HIS is one mark on the stored dish (MY_MEAL_TAG). The week's
// menu and the day's pick read that mark (meal-menu.ts, meal-generation.ts's
// isFamiliarOption): his meals come first, and about half a day is his when
// he has enough of them. Variety still comes first of all, so two usual
// dinners are not served on alternate nights for ever.
//
// Docs: docs/plans/usual-meals-first.md.
// ---------------------------------------------------------------------------

import { buildMealAdditionProposal, formatPortion, type MealAdditionPayload } from './meal-addition'
import { buildCustomMealProposal } from './custom-meal'
import { dishLandsADay } from './meal-top-up'
import { computeSlotBudgets } from './meal-generation'
import { fitDishToBudget } from './meal-library'
import { cookedHint } from './as-weighed'
import { executeMealAddition, undoMealAddition } from './pending-action-executor'
import { isPinOnly } from './meal-new-from'
import { MY_MEAL_TAG, type MealSlotName } from './meal-store'
import type { PoolOption } from './meal-generation'
import type { MacroTargets } from './types'

type Pools = Partial<Record<MealSlotName, PoolOption[]>>

export interface MyMeal { slot: MealSlotName; name: string; calories: number; protein: number }

const SLOT_ORDER: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** His meals as kept, in meal order. A copy made for one day is not one of them. */
export function listMyMeals(pools: Pools): MyMeal[] {
  const out: MyMeal[] = []
  for (const slot of SLOT_ORDER) {
    const seen = new Set<string>()
    for (const o of pools[slot] ?? []) {
      if (!(o.tags ?? []).includes(MY_MEAL_TAG) || isPinOnly(o) || seen.has(o.name)) continue
      seen.add(o.name)
      out.push({ slot, name: o.name, calories: Math.round(o.macros.calories), protein: Math.round(o.macros.protein) })
    }
  }
  return out
}

export interface MyMealDraft {
  name: string
  slot: MealSlotName
  /** One food per line, each with its amount: "2 eggs", "150g chicken breast". */
  lines: string
}

export interface MyMealContext {
  profileId: string
  targets: MacroTargets
  mealsPerDay?: number
  includeSnacks?: boolean
  dietaryPreferences: string[]
  dislikedFoods: string[]
  todayDate: string
  pools: Pools
}

export type MyMealPlan =
  | {
      ok: true
      payload: MealAdditionPayload
      /** What the card says, top to bottom: the dish and its numbers, the portions, what happens to it. */
      card: { title: string; numbers: string; portions: string; what: string }
    }
  | { ok: false; reason: string }

/** The meals this plan has, so the form offers only those. */
export function mealsOffered(pools: Pools): MealSlotName[] {
  return SLOT_ORDER.filter(s => (pools[s]?.length ?? 0) > 0)
}

/** What saving this meal would keep, or the plain reason it cannot be kept. Nothing is written. */
export function planMyMeal(ctx: MyMealContext, draft: MyMealDraft): MyMealPlan {
  const name = draft.name.trim()
  if (!name) return { ok: false, reason: 'Give the meal a name.' }
  if (!draft.lines.trim()) return { ok: false, reason: "List what's in it, one food per line with its amount." }
  const already = (ctx.pools[draft.slot] ?? []).some(o => o.name.trim().toLowerCase() === name.toLowerCase() && !isPinOnly(o))
  if (already) return { ok: false, reason: `${name} is already one of your ${draft.slot} options.` }

  const shared = {
    profileId: ctx.profileId, targets: ctx.targets, mealsPerDay: ctx.mealsPerDay, includeSnacks: ctx.includeSnacks,
    dietaryPreferences: ctx.dietaryPreferences, dislikedFoods: ctx.dislikedFoods, todayDate: ctx.todayDate,
  }
  const foodLines = draft.lines.split('\n').map(l => l.trim()).filter(Boolean)
  const active = Object.keys(computeSlotBudgets(ctx.targets, ctx.mealsPerDay, ctx.includeSnacks)) as MealSlotName[]
  const budget = computeSlotBudgets(ctx.targets, ctx.mealsPerDay, ctx.includeSnacks)[draft.slot]
  const sizedFrom = (lines: string[]) => buildMealAdditionProposal({ rawArgs: { meal_name: name, meal_slot: draft.slot, ingredients: lines }, ...shared })
  const lands = (o: PoolOption) => dishLandsADay(ctx.pools, active, ctx.targets, draft.slot, o, ctx.todayDate)

  // THREE VERSIONS OF THE SAME MEAL, best first, each through a builder the coach already uses, so every refusal that
  // matters (a food it cannot read, an avoid, his diet) is made by the same code whichever version is kept:
  //   1. RE-PORTIONED as the library's own dishes are (fitDishToBudget: the protein food and the carb food move
  //      separately, within what a cook would call the same dish), then sized to the meal. Measured before this was
  //      here: sized by energy alone, 150g of chicken with rice became 350g to fill a dinner, at 1.3x the meal's
  //      protein, and the card had to say it would not come up often.
  //   2. Sized to the meal by energy alone (the coach's "add a meal", unchanged).
  //   3. KEPT AT HIS AMOUNTS (the coach's "my own foods"): a usual meal that cannot be sized without distorting it
  //      (porridge and a banana is leaner than a breakfast here) is what he eats, and the rest of the day moves.
  // The first that can be part of a day on his targets is kept. When none can, it is kept as he wrote it and the card
  // says it will not come up often: a meal nobody resized is the honest thing to hold when no size fits.
  const fitted = budget ? fitDishToBudget({ slot: draft.slot, name, ingredients: foodLines, prep: '', cuisine: '' }, budget).dish.ingredients : foodLines
  const versions: { built: ReturnType<typeof sizedFrom>; sized: boolean }[] = []
  if (fitted.join('\n') !== foodLines.join('\n')) versions.push({ built: sizedFrom(fitted), sized: true })
  versions.push({ built: sizedFrom(foodLines), sized: true })
  versions.push({ built: buildCustomMealProposal({ rawArgs: { name, meal_slot: draft.slot, food_lines: foodLines }, ...shared }), sized: false })
  const valid = versions.filter((v): v is { built: Extract<ReturnType<typeof sizedFrom>, { ok: true }>; sized: boolean } => v.built.ok)
  // Nothing can be kept: the reason is the last builder's, the one that changes nothing about what he typed.
  const last = versions[versions.length - 1].built
  if (valid.length === 0) return { ok: false, reason: last.ok ? '' : last.reason }
  const verdicts = valid.map(v => lands(v.built.payload.option))
  const at = verdicts.findIndex(v => v !== false)
  const chosen = at >= 0 ? valid[at] : valid[valid.length - 1]
  const landsADay = at >= 0 ? verdicts[at] : false

  // The builders mark the dish as his (MY_MEAL_TAG): the coach's routes and this are the same functions.
  const option = chosen.built.payload.option
  const m = option.macros
  // Every food is counted raw or dry (his 18 Oct ruling), so "150g chicken breast" as he typed it is held as 205g
  // raw. The cooked weight is said beside it, as the meal cards say it, or "kept at your amounts" would show a
  // number he never typed.
  const portions = option.ingredients.map(i => { const hint = cookedHint(i); return hint ? `${formatPortion(i)} (${hint})` : formatPortion(i) }).join(', ')
  return {
    ok: true,
    payload: chosen.built.payload,
    card: {
      title: option.name,
      numbers: `${Math.round(m.calories)} kcal · ${Math.round(m.protein)}g protein · ${Math.round(m.carbs)}g carbs · ${Math.round(m.fat)}g fat`,
      portions: chosen.sized ? `Sized to your ${draft.slot}: ${portions}.` : `Kept at your amounts: ${portions}.`,
      what: myMealJoins(draft.slot, landsADay),
    },
  }
}

/**
 * What happens to a meal of his once kept. Says what the app does, and no more than it does: a meal that cannot be
 * part of a day on his targets is kept all the same, and the card says it will not come up often.
 */
export function myMealJoins(slot: MealSlotName, lands: boolean | null = true): string {
  const joins = `Joins your ${slot} options.`
  if (lands === false) return `${joins} With your other meals it doesn't make a day that lands on your targets, so it won't come up often.`
  return `${joins} Your own meals come first when each week's meals are chosen.`
}

/** Keeps a planned meal. It joins the meal's options; no day's pick is written, so nothing on the plan moves today. */
async function saveMyMeal(profileId: string, plan: Extract<MyMealPlan, { ok: true }>): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { receipt } = await executeMealAddition(profileId, plan.payload)
  if (receipt.failed.length > 0) return { ok: false, reason: `${plan.payload.option.name} didn't save. Check your connection and try again.` }
  return { ok: true }
}

/** Takes one of his meals back out of that meal's options. */
async function removeMyMeal(profileId: string, meal: Pick<MyMeal, 'slot' | 'name'>, todayDate: string, pools: Pools): Promise<boolean> {
  const option = (pools[meal.slot] ?? []).find(o => o.name === meal.name && (o.tags ?? []).includes(MY_MEAL_TAG))
  if (!option) return false
  return undoMealAddition(profileId, { slot: meal.slot, date: todayDate, option })
}

/**
 * What the "My meals" section works through, built from what App hands over (MyMealsSource; the browser harness
 * hands the same): one object, so the screen cannot plan with one set of targets and save with another. `reload`
 * re-reads the meals after a save or a removal.
 */
export interface MyMealsController {
  meals: MyMeal[]
  slots: MealSlotName[]
  plan: (draft: MyMealDraft) => MyMealPlan
  save: (plan: Extract<MyMealPlan, { ok: true }>) => Promise<{ ok: true } | { ok: false; reason: string }>
  remove: (meal: Pick<MyMeal, 'slot' | 'name'>) => Promise<boolean>
}

/** What App hands over: the facts a meal is planned against, and how to re-read the meals. No code, so App loads none. */
export interface MyMealsSource { context: MyMealContext; reload: () => Promise<void> }

export function makeMyMealsController(ctx: MyMealContext | null, reload: () => Promise<void>): MyMealsController | null {
  if (!ctx) return null
  return {
    meals: listMyMeals(ctx.pools),
    slots: mealsOffered(ctx.pools),
    plan: draft => planMyMeal(ctx, draft),
    save: async plan => { const r = await saveMyMeal(ctx.profileId, plan); if (r.ok) await reload(); return r },
    remove: async meal => { const ok = await removeMyMeal(ctx.profileId, meal, ctx.todayDate, ctx.pools); if (ok) await reload(); return ok },
  }
}
