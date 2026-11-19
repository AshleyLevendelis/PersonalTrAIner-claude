import { splitCompoundFoodLine } from './ingredient-units'
// ---------------------------------------------------------------------------
// "Add this meal to my plan" (docs/PLAN-add-a-meal.md)
//
// THE WHOLE POINT OF THIS FILE IS THAT IT ADDS NO VERIFICATION OF ITS OWN.
//
// A user-named dish arrives as text the model wrote. If it reached
// meal_plan_slots without passing the checks a generated meal passes, the app
// would have a second, unguarded door into what someone eats — the
// "constraint asserted at N paths, missed at N+1" shape this codebase keeps
// producing, and this time on the allergen path.
//
// So this module routes a requested dish into `verifyProposal`, the exact
// function every generated meal already goes through: food-DB resolution, an
// 80% coverage floor (a dish the app cannot measure is refused, not guessed
// at), the disliked-foods filter, validateMealAgainstDiet, rescaling to the
// slot's macro budget, and a re-measure afterwards. One enforcement point.
//
// It lives client-side because verifyProposal is a src/lib module a Deno edge
// function cannot import. chat-gemini is a courier for this kind: it returns
// the model's raw arguments and stores nothing.
// ---------------------------------------------------------------------------

import { whichKindQuestion, computeMealMacros } from './food-db'
import { cookedHint } from './as-weighed'
import { parseIngredientLine, withParsedQuantity, kitchenRound, kitchenLine, pieceHint } from './portion-scaler'
import { computeSlotBudgets, verifyProposal, type PoolOption, type RawProposal } from './meal-generation'
import { tagsMyMeal, type MealSlotName } from './meal-store'
import { datesLabel, repeatDates } from './meal-like-offer'
import type { MacroTargets } from './types'
import type { ProposalDiff } from './pending-actions-store'

const SLOTS: MealSlotName[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** The model's tool arguments, unvalidated — everything here is `unknown` until it has been through verifyProposal. */
export interface MealAdditionArgs {
  meal_slot?: unknown
  meal_name?: unknown
  ingredients?: unknown
  prep?: unknown
  cuisine?: unknown
  date?: unknown
  reason?: unknown
  /** The coach was ASKED how much (his ruling 16 Nov 2026, "App sizes it"): the card is said as the answer. */
  as_suggestion?: unknown
  /** "Every breakfast this week" (16 Nov 2026): how many days in a row from `date`, clamped to the days the plan shows. */
  days?: unknown
}

export interface MealAdditionPayload {
  slot: MealSlotName
  date: string
  /** The VERIFIED option — re-portioned and re-measured by verifyProposal. Never the model's own numbers. */
  option: PoolOption
  /** The days after `date` it is also that meal for ("every breakfast this week"). Absent for one day. */
  alsoDates?: string[]
}

export interface BuildMealAdditionInput {
  rawArgs: MealAdditionArgs
  profileId: string
  /** The day's macro targets the slot budget is carved out of. */
  targets: MacroTargets
  mealsPerDay?: number
  /** Breakfast skipped (skipsBreakfast): on two meals a day the day is lunch and dinner. Required so no surface forgets it. */
  skipBreakfast: boolean | undefined
  includeSnacks?: boolean
  dietaryPreferences: string[]
  dislikedFoods?: string[]
  /** Today, as YYYY-MM-DD — used when the model names no date. */
  todayDate: string
  /** HIS OWN meal (Profile, My meals): the verifier's own re-portioning, as it always was (his "My usual meals first"), never the coach's plate sizing. */
  libraryFit?: boolean
}

export type MealAdditionResult =
  | { ok: true; scopeKey: string; preconditions: Record<string, unknown>; payload: MealAdditionPayload; diff: ProposalDiff }
  | { ok: false; reason: string }

export function normaliseSlot(value: unknown): MealSlotName | null {
  const s = String(value ?? '').trim().toLowerCase()
  return (SLOTS as string[]).includes(s) ? (s as MealSlotName) : null
}

/** Ingredient lines as verifyProposal wants them — one string per line, blanks dropped. Accepts an array or a newline-separated block, because a model will produce either. */
export function normaliseIngredients(value: unknown): string[] {
  const lines = Array.isArray(value)
    ? value.map(v => String(v ?? ''))
    : String(value ?? '').split('\n')
  // A line that is two foods with two amounts is two lines (splitCompoundFoodLine).
  return lines.flatMap(l => splitCompoundFoodLine(l.trim())).filter(Boolean)
}

/** YYYY-MM-DD or nothing. A malformed date silently becoming today would put the meal on the wrong day, so it is checked rather than coerced. */
export function normaliseDate(value: unknown, fallback: string): string {
  const s = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback
}

/**
 * An ingredient as a person would say it, for the cards that list the portions: "227g chicken breast", "1 cup white rice cooked",
 * "2 carrots". The cards used to print `name 227g`, `name 1cup` and `name 2whole`, and rounded every amount to a whole number, so
 * half a teaspoon read "1tsp" on a line headed "your portions, untouched" (1 Oct 2026).
 */
export function formatPortion(i: { name: string; quantity: number; unit: string }): string {
  // The meal card's own words (18 Nov 2026): "3 eggs", "1¾ tsp olive oil". This printed "3 egg" and "1.8 tsp".
  return kitchenLine(i.unit === 'g' || i.unit === 'ml' ? (i.quantity >= 10 ? Math.round(i.quantity) : Math.round(i.quantity * 10) / 10) : i.quantity, i.unit, i.name)
}

/**
 * A portion as a card says it: the amount as bought, with the cooked weight beside a raw or dry line (his 18 Oct
 * "Dry, plus cooked hint"). ONE function since 18 Nov 2026: the custom-meal card said "Your portions, untouched —
 * 275g raw chicken breast" to someone who had typed 200g, with nothing to say the 200 was read as cooked.
 */
export function portionWithHint(i: { name: string; quantity: number; unit: string }): string {
  const hint = cookedHint(i) ?? pieceHint(i)
  return hint ? `${formatPortion(i)} (${hint})` : formatPortion(i)
}

/**
 * ONE FOOD, MORE THAN THIS IN ONE MEAL, IS A SLIP OF THE FINGER (the Nutrition walk, 18 Nov 2026, finding N4): the
 * amount box took 99999 g of chicken and the card worked out 120,327 kcal. Two kilos (or two litres) of a single food
 * is past any portion one person eats at a sitting, so a line over it is sent back with a sentence, wherever an
 * amount is typed or said: changing an amount, adding a food, and a meal described to the coach.
 * A typing check, not a judgement about his eating: 1.5 kg of anything still goes through, with its numbers shown
 * before he applies it. The weight is the app's own reading of the line (a count or a volume is turned to grams).
 */
export const MAX_ONE_FOOD_G = 2000
export function overfullLine(lines: string[]): string | null {
  const read = computeMealMacros(lines.map(parseIngredientLine)).lines
  const at = read.findIndex(l => l.grams != null && l.grams > MAX_ONE_FOOD_G)
  if (at === -1) return null
  return `${lines[at].trim()} is more than one meal can hold. Check the amount and try again.`
}

/**
 * verifyProposal writes a precise diagnostic into its rejectLog. These are
 * written for a developer reading a generation run, not for someone who just
 * asked for a curry, so they are translated here — TRANSLATED, not replaced:
 * the reason the user sees says the same thing the log says, because "I
 * couldn't add that" with no cause is the reply this whole feature exists to
 * stop the app giving.
 */
export function explainRejection(log: string[], dishName: string, slot: MealSlotName): string {
  const line = log[log.length - 1] ?? ''

  if (/diet violation/i.test(line)) {
    // The log line reads: ... diet violation(s) — "chicken breast" is tagged
    // contains_meat, which vegetarian forbids. That is written for someone
    // reading a generation run; a user must never be shown "tagged
    // contains_meat". Pull out the FOODS and the RESTRICTION and say it in
    // English, falling back to the plain sentence if the shape ever changes.
    const detail = line.split('—').slice(1).join('—')
    const foods = [...detail.matchAll(/"([^"]+)"/g)].map(m => m[1])
    // A FOOD WHOSE KIND DECIDES IT (his ruling 10 Nov 2026, "Ask which"): calamari that could not be confirmed for a
    // restriction is asked about, breaded or plain, rather than refused. Only when nothing in the dish is a definite
    // clash: a dish that is out anyway is not worth a question.
    const definite = /is tagged /.test(detail)
    const kindAsk = definite ? null : foods.map(f => whichKindQuestion(f)).find(q => q != null)
    if (kindAsk) return `${kindAsk} I'll add ${dishName} once I know.`
    const restriction = /which ([a-z-]+) forbids/i.exec(detail)?.[1]
    const foodList = foods.length > 0
      ? foods.slice(0, 3).join(', ').replace(/, ([^,]*)$/, ' and $1')
      : null
    if (foodList) {
      return `I can't add ${dishName} — it's got ${foodList} in it${restriction ? `, and you've told me you're ${restriction.replace(/-free$/, '-free')}` : ", which is on your avoid list"}. Give me a version without it and I'll add that instead.`
    }
    return `I can't add ${dishName} — it clashes with what you've told me you avoid. Give me a version without it and I'll add that instead.`
  }
  if (/an amount could not be read/i.test(line)) {
    // THE ASK (Ashley, 1 Oct 2026, from three options: ask / refuse / estimate). One question, quoting the line, and
    // nothing is saved until she answers. The quoted lines are the ones as written, so she can see which one.
    const quoted = [...(line.split('—').slice(1).join('—')).matchAll(/"([^"]+)"/g)].map(m => `"${m[1]}"`)
    // "My dinner" is the default name of a meal she typed in; mid-sentence it reads as a title, so say it as hers.
    const dish = /^My /.test(dishName) ? `your ${dishName.slice(3)}` : dishName
    // One sentence for both readers of "how much" (the amount reader, 1 Oct, and the piece-weight table, 9 Oct):
    // what could not be weighed, as she wrote it, that nothing was saved, and the one question that fixes it.
    const names = quoted.map(q => q.replace(/^"|"$/g, ''))
    const list = names.length === 0 ? 'one of the ingredients' : names.slice(0, 3).join(', ').replace(/, ([^,]*)$/, ' and $1')
    return `I couldn't put a weight on ${list}, so I haven't added ${dish}. Roughly how many grams is ${names.length > 1 ? 'each' : 'it'}?`
  }
  if (/unrecognised dietary restriction/i.test(line)) {
    return `Something's wrong with the dietary restrictions saved on your profile, so I can't safely check ${dishName} against them. Worth fixing those in Profile first — I'd rather stop than guess.`
  }
  if (/contains disliked food/i.test(line)) {
    const food = /"([^"]+)"\s*$/.exec(line)?.[1]
    return `${dishName} has ${food ?? "something you've told me you don't like"} in it. Want me to add a version without it?`
  }
  if (/coverage/i.test(line)) {
    const unmatched = /unmatched:\s*([^—]*)/.exec(line)?.[1]?.trim()
    // A FOOD NAMED WITHOUT ITS KIND (9 Nov 2026, his "ask which"): ask the kind, not for a better-known ingredient.
    const kindAsk = (unmatched ?? '').split(',').map(u => whichKindQuestion(parseIngredientLine(u.trim()).name) ?? whichKindQuestion(u.trim())).find(q => q != null)
    if (kindAsk) return `${kindAsk} I'll add ${dishName} once I know.`
    // A food the app KNOWS, in an amount it could not read ("2 hummus", "1
    // bowl of pasta"). Saying "I don't have hummus in my food data" would be
    // false, and "more everyday ingredients" would not help: it needs a weight.
    const amountUnknown = /amount unknown:\s*(.+)$/.exec(line)?.[1]?.trim()
    if (amountUnknown && !unmatched) {
      return `I can't measure ${dishName} accurately — I couldn't put a weight on ${amountUnknown}. Give me a rough weight in grams and I'll try again.`
    }
    return `I can't measure ${dishName} accurately${unmatched ? ` — I don't have ${unmatched} in my food data` : ''}${amountUnknown ? `, and I couldn't put a weight on ${amountUnknown}` : ''}, and I'd rather not put a made-up number in your plan. Describe it with more everyday ingredients and I'll try again.`
  }
  if (/not slot-appropriate/i.test(line)) {
    return `${dishName} doesn't really work as a ${slot}. Want it in a different slot?`
  }
  if (/missed target|scale factor|no ingredients parsed|not a realistic portion/i.test(line)) {
    return `I couldn't portion ${dishName} to fit your ${slot} target without distorting it — the macro balance is too far from what that meal needs to be. It'd fit better as a different slot, or alongside a change to the rest of the day.`
  }
  return `I couldn't add ${dishName} to your ${slot} — I wasn't able to verify it against your targets.`
}

/**
 * Builds a confirmable proposal for adding a dish, or an honest refusal.
 *
 * Returns the VERIFIED option in the payload, so the confirm step writes
 * exactly what was shown on the card and re-runs nothing — the model's own
 * ingredient quantities never reach the database.
 */
/** The protein foods sized to the meal's protein; carbs kept at the offered portion, cut only to stay inside its calories. */
function sizeToProtein(dish: RawProposal, budget: MacroTargets): RawProposal {
  const parsed = dish.ingredients.map(parseIngredientLine)
  const m = computeMealMacros(parsed)
  const role = m.lines.map(l => {
    if (!l.entry || !l.macros || !/^(g|ml)$/i.test(l.input.unit)) return 'F' as const
    const cat = l.entry.category
    if (cat === 'protein' || (cat === 'dairy' && l.entry.per100g.protein >= 8)) return 'P' as const
    return cat === 'carb' ? 'C' as const : 'F' as const
  })
  const sum = (r: 'P' | 'C' | 'F', k: 'kcal' | 'protein') => m.lines.reduce((t, l, i) => t + (role[i] === r && l.macros ? l.macros[k] : 0), 0)
  const pProt = sum('P', 'protein')
  const otherProt = sum('C', 'protein') + sum('F', 'protein')
  const a = pProt > 0 ? Math.min(2.5, Math.max(0.4, (budget.protein - otherProt) / pProt)) : 1
  const kcalAfterP = sum('F', 'kcal') + a * sum('P', 'kcal')
  const cKcal = sum('C', 'kcal')
  // Carbs then fill toward the meal's calories: cut as far as needed, but grown by 30% at most (CSCS, mine, 16 Nov
  // 2026): a plate answering "how much" is a normal plate, never 900g of potatoes to close a gap, and what is left
  // short is said in numbers in the answer.
  const b = cKcal > 0 ? Math.min(1.3, Math.max(0.4, (budget.calories - kcalAfterP) / cKcal)) : 1
  const lines = dish.ingredients.map((text, i) => {
    const factor = role[i] === 'P' ? a : role[i] === 'C' ? b : 1
    if (factor === 1) return text
    return withParsedQuantity(text, Math.max(5, kitchenRound(parsed[i].quantity * factor, parsed[i].unit))) ?? text
  })
  return { ...dish, ingredients: lines }
}

export function buildMealAdditionProposal(input: BuildMealAdditionInput): MealAdditionResult {
  const { rawArgs } = input
  const dishName = String(rawArgs.meal_name ?? '').trim()
  if (!dishName) return { ok: false, reason: "I didn't catch what you wanted adding — tell me the dish and I'll sort it." }

  const slot = normaliseSlot(rawArgs.meal_slot)
  if (!slot) return { ok: false, reason: `Which meal should ${dishName} go in — breakfast, lunch, dinner or a snack?` }

  const ingredients = normaliseIngredients(rawArgs.ingredients)
  if (ingredients.length === 0) {
    return { ok: false, reason: `I need to know roughly what goes into ${dishName} before I can put it in your plan — otherwise the macros would be a guess.` }
  }

  const budgets = computeSlotBudgets(input.targets, input.mealsPerDay, input.includeSnacks, input.skipBreakfast)
  const budget = budgets[slot]
  if (!budget) {
    return { ok: false, reason: `Your plan doesn't have a ${slot} slot at the moment. You can change how many meals a day you eat in Profile, and then I can add it.` }
  }

  const proposal: RawProposal = {
    slot,
    name: dishName,
    ingredients,
    prep: String(rawArgs.prep ?? ''),
    cuisine: String(rawArgs.cuisine ?? ''),
  }

  // THE ENFORCEMENT. Everything above is normalisation; this line is the
  // reason a user-added meal is no less safe than a generated one.
  // THE PLATE A COACH WOULD SERVE (16 Nov 2026, his live test and "App sizes it"; CSCS, mine): scaling a whole dish to a
  // meal's calories carries its protein with it, so a chicken-heavy plate sized to a 1,200 kcal lunch held 146 g of
  // protein against 64. The library's own fitter moves the protein foods and the carb foods within ranges a cook would
  // call the same dish, so the plate lands on the meal's whole budget; verification below is unchanged.
  // "HOW MUCH SHOULD I HAVE?" IS SIZED TO HIS PROTEIN, NOT FILLED TO HIS CALORIES (16 Nov 2026; CSCS, mine). A canteen
  // plate of chicken, potatoes and salmon carries almost no fat, so filling it to a 1,200 kcal lunch meant 940 g of
  // cooked potatoes, which no coach would serve. Asked as a question, the protein foods are sized to the meal's protein,
  // the carbs stay at the ordinary portion he was offered (only ever cut, to stay inside the meal's calories), and the
  // calories land where they land: the answer says so, and the rest of the day is the day's own business. Every safety
  // check still runs (keepPortions keeps the amounts, never the checks).
  const asked = rawArgs.as_suggestion === true
  // ONE PLATE, HOWEVER HE PUT IT (CSCS, mine, 16 Nov 2026): told "add it", the calorie fit gave 1,070g of raw potatoes
  // for one lunch, the plate his question had just been spared. Asked or told, a dish the coach names is sized the same
  // way (protein first, carbs within 30%), and the amounts are kept as sized.
  const fitted = input.libraryFit ? proposal : sizeToProtein(proposal, budget)
  const rejectLog: string[] = []
  const option = verifyProposal(fitted, slot, budget, input.dietaryPreferences, rejectLog, input.dislikedFoods ?? [], undefined, !input.libraryFit)
  if (!option) return { ok: false, reason: explainRejection(rejectLog, dishName, slot) }

  const date = normaliseDate(rawArgs.date, input.todayDate)
  const m = option.macros
  // EVERY DAY, WHEN ASKED (16 Nov 2026): one dish, one option, picked for each day from `date` to the last day the plan
  // shows. The card names the days, so a week asked late in the week says where it stops.
  const allDates = repeatDates(date, Number(rawArgs.days ?? 1), input.todayDate)
  const alsoDates = allDates.slice(1)
  const forWhen = alsoDates.length > 0 ? `every day from ${datesLabel(allDates)}` : date

  return {
    ok: true,
    scopeKey: `${input.profileId}:propose_meal_addition:${slot}:${date}${alsoDates.length ? `+${alsoDates.length}` : ''}`,
    preconditions: { slot, date, mealName: option.name },
    // HIS OWN MEAL (11 Nov 2026, "My usual meals first"): marked so the week's menu and the day's pick put it first.
    payload: { slot, date, option: { ...option, tags: tagsMyMeal(option.tags) }, ...(alsoDates.length ? { alsoDates } : {}) },
    diff: {
      // AN ANSWER TO "HOW MUCH?" (his ruling 16 Nov 2026, "App sizes it"): the amounts and the numbers are the app's and are
      // said as the answer, in the lead; the buttons offer to put it in. Nothing is written until the tap.
      ...(rawArgs.as_suggestion === true
        ? { lead: `By the app's own food figures, for your ${slot}: ${option.ingredients.map(portionWithHint).join(', ')}. That's about ${Math.round(m.calories)} kcal and ${Math.round(m.protein)}g protein, against about ${Math.round(budget.calories)} kcal and ${Math.round(budget.protein)}g for your ${slot}. Want it as your ${slot}?` }
        // WHICH DAYS, BEFORE THE TAP (16 Nov 2026): a meal for another day, or for every day, says so in the headline.
        : date !== input.todayDate || alsoDates.length > 0
          ? { lead: `I can add **${option.name}** to your ${slot}, ${alsoDates.length > 0 ? `every day from ${datesLabel(allDates)}` : `for ${datesLabel([date])}`}:` }
          : {}),
      rows: [
        { field: 'Adding to', before: slot, after: option.name },
        { field: 'Calories', before: `${Math.round(budget.calories)} kcal target`, after: `${Math.round(m.calories)} kcal` },
        { field: 'Protein', before: `${Math.round(budget.protein)}g target`, after: `${Math.round(m.protein)}g` },
        { field: 'Carbs', before: `${Math.round(budget.carbs)}g target`, after: `${Math.round(m.carbs)}g` },
        { field: 'Fat', before: `${Math.round(budget.fat)}g target`, after: `${Math.round(m.fat)}g` },
      ],
      // Said out loud on the card rather than discovered afterwards: the
      // portions are the app's, not the model's, and the meal becomes that
      // day's pick as well as joining the slot's options.
      implications: [
        // When he asked how much, the answer above already lists every amount; saying it twice would say it two ways.
        ...(rawArgs.as_suggestion === true ? [] : [{ severity: 'info' as const, text: `Portions adjusted to fit your ${slot} target — ${option.ingredients.map(portionWithHint).join(', ')}` }]),
        { severity: 'info', text: `Joins your ${slot} options, and becomes your ${slot} for ${forWhen}.` },
      ],
      rationale: typeof rawArgs.reason === 'string' && rawArgs.reason.trim() ? rawArgs.reason.trim() : undefined,
      reversible: true,
    },
  }
}
