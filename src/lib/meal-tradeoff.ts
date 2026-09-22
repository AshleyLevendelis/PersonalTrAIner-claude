// ---------------------------------------------------------------------------
// WHAT A MEAL CHANGE COSTS THE GOAL — the food half of Ashley's 14 Sep ruling.
//
// She decided that day, from four options, that a change working against
// somebody's goal is ASKED about and then ALLOWED: never refused unless it is
// unsafe, exactly one tap further away, with "do it anyway" always on offer.
// That was built for exercise. Measured 14 Sep: of the coach's seventeen
// proposal builders, three carried it — swap, add and remove an EXERCISE — and
// there was exactly one `shouldAsk` call site in the entire app. No meal change
// had ever asked anything.
//
// What meal cards showed instead was a macro table: calories, protein, carbs
// and fat, before and after, with signed deltas. That is a READOUT. It says the
// number moved; it never says what the number means. Swapping the salmon for
// pizza once is fine and the app should not fuss. Doing it four nights a week
// is how somebody sits in a deficit all month and keeps none of their muscle —
// and the app performed that silently, four times, with a tidy table each time
// showing the protein falling.
//
// SIBLING, NOT A FORK. `Tradeoff`, `applyTradeoff`, `askText`, `shouldAsk` and
// `downgradeToCard` are goal-agnostic — they act on a verdict, not on an
// exercise. Only the JUDGEMENT is food-shaped, so only the judgement is here.
// That is what keeps the coach's question grammar identical on both sides,
// which is the thing the coach exam has to be able to grade.
//
// PROTEIN LEADS, IN EVERY GOAL. It is the hardest thing to make up later in the
// day and the one that protects the outcome whether somebody is cutting or
// growing. Calories come second, and WHICH DIRECTION IS BAD DEPENDS ON THE GOAL
// — over the target undoes a fat-loss deficit, under it starves a hypertrophy
// block. Carbs and fat are never spoken about alone: nobody changes their
// dinner over a fat gram, and a sentence about one is noise.
//
// See docs/plans/meals-are-plans-too.md.
// ---------------------------------------------------------------------------

import type { MacroTargets, FitnessGoal } from './types'
import type { Tradeoff, TradeoffAlternative } from './tradeoff-shape'

/** Every meal path that CHANGES the plan. */
export type MealEditKind =
  | 'meal_swap' | 'meal_food_remove' | 'meal_food_replace' | 'meal_food_resize'
  | 'meal_addition' | 'meal_food_add' | 'custom_meal'

/**
 * Below this share of the day's protein target, the day has stopped serving
 * the goal rather than merely drifting.
 *
 * 0.8 and not 0.9: a day at 90% of protein is a normal good day, and a question
 * on it is the wallpaper this whole design exists to avoid. 0.8 with a 150g
 * target is 120g — the point where somebody training hard is genuinely short.
 */
export const PROTEIN_AGAINST_GOAL_FRACTION = 0.8

/**
 * Below this, protein is worth a SENTENCE but not a question. Between the two
 * thresholds is "this costs you something and here is the cheaper route".
 */
export const PROTEIN_WORTH_SAYING_FRACTION = 0.95

/**
 * How many goal-damaging meal changes in one block before the REPETITION is
 * the thing worth asking about, regardless of whether today's change alone
 * would clear any threshold.
 *
 * Three, because two is a coincidence and four is a habit already formed. This
 * is the case no single card can ever see — each swap looks survivable on its
 * own, and the pattern is the thing that actually costs somebody their result.
 */
export const REPEAT_CHANGES_THIS_BLOCK = 3

/** Over the calorie target by more than this share, the deficit is gone for the day. */
export const CALORIE_OVERSHOOT_FRACTION = 0.1

export interface MealEditContext {
  /**
   * JUST THE GOAL, not a whole profile — because the goal is all this decides
   * anything from, and saying so is what stops a caller manufacturing a
   * profile-shaped object to satisfy a signature. The Nutrition sheet has no
   * profile in scope and would have had to fake one; a cast that adds fields
   * the object does not really have always compiles and can never be checked.
   */
  goal: FitnessGoal
  /** The day's living targets — the same numbers the Nutrition tab shows. */
  targets: MacroTargets | null
  /** The whole day's planned+eaten macros BEFORE this change. */
  dayBefore: MacroTargets
  /** The same totals with the trial applied — the change confirm would make. */
  dayAfter: MacroTargets
  kind: MealEditKind
  /** Which slot, for the sentence. 'dinner', 'breakfast'… */
  slot: string
  /** What is being removed, swapped out or resized, where there is one. */
  foodName?: string
  // `newFoodName` stood here, declared for "what is going in, on a swap or
  // replace". Nothing ever passed it and nothing ever read it — not even this
  // module — so it was a field that looked like wiring. Deleted 22 Sep 2026
  // rather than filled: the incoming meal's NUMBERS are what this judgement
  // needs, and those arrive as dayAfter. A name would only have changed the
  // sentence, and the sentence reads better about the slot.
  /**
   * How many goal-damaging meal changes this block already. The CALLER owns
   * this count, because it needs history a pure module must not fetch — the
   * same contract `priorShorteningsThisBlock` has on the exercise side.
   */
  priorCostlyChangesThisBlock?: number
  /**
   * A higher-protein option for the same slot, when the pool holds one. Offered
   * as the cheaper route rather than invented here: this module knows nothing
   * about what food exists.
   */
  higherProteinOption?: { name: string; protein: number }
}

const free = (reason: string): Tradeoff => ({ tier: 0, cost: null, alternatives: [], question: null, reason })

const g = (n: number) => `${Math.round(n)}g`

/** Fat loss is the one goal where going OVER is the failure; the rest fail by going under. */
const overshootHurts = (goal: FitnessGoal): boolean => goal === 'fat_loss'

/**
 * The cheaper route, and it is deliberately not invented here. When the pool
 * holds a higher-protein option for the slot, that is the alternative; when it
 * does not, offering one would be the app promising food it cannot produce.
 */
function alternativesFor(ctx: MealEditContext): TradeoffAlternative[] {
  const out: TradeoffAlternative[] = []
  if (ctx.higherProteinOption) {
    out.push({
      label: 'Higher-protein version',
      note: `${ctx.higherProteinOption.name} — ${g(ctx.higherProteinOption.protein)} protein`,
      prompt: `Swap my ${ctx.slot} for ${ctx.higherProteinOption.name} instead`,
    })
  }
  // ALWAYS AVAILABLE, and it needs no pool: a change that only applies to today
  // costs a day, not a block. The exercise side offers the same escape.
  out.push({
    label: 'Just today',
    note: 'Tomorrow goes back to the plan',
    prompt: `Only change my ${ctx.slot} for today`,
  })
  return out
}

/**
 * What this meal change costs, and how firm to be about it.
 *
 * Called with the day totals BEFORE and AFTER — the caller has already run the
 * trial, exactly as the exercise side does. Reads, never writes.
 */
export function assessMealEdit(ctx: MealEditContext): Tradeoff {
  const { goal, targets, dayBefore, dayAfter, kind, slot } = ctx

  // NO TARGETS, NO JUDGEMENT. Without the day's numbers there is nothing to
  // measure against, and a guess about somebody's protein is worse than
  // silence. This is the declined-body-metrics case, which is a real state.
  if (!targets || targets.protein <= 0 || targets.calories <= 0) {
    return free('no living targets to judge against')
  }

  // AND NO DAY, NO JUDGEMENT — the same rule, one level up. A day with nothing
  // planned in it totals zero, so every change would look like it left
  // somebody on nothing and EVERY card would become a question. Found because
  // the chat harness passes an empty meal plan: the first driver run would
  // have "proved" this feature working off arithmetic about a day that did not
  // exist. It lives HERE rather than at the call site so it can be tested and
  // broken on purpose, which is the whole difference between a guard and a
  // line of code that looks like one.
  if (dayBefore.calories <= 0 && dayBefore.protein <= 0) {
    return free('no planned day to judge against')
  }

  const proteinAfter = dayAfter.protein
  const proteinShare = proteinAfter / targets.protein
  const proteinLost = dayBefore.protein - dayAfter.protein
  const calorieShare = dayAfter.calories / targets.calories

  const priorCostly = ctx.priorCostlyChangesThisBlock ?? 0
  const alternatives = alternativesFor(ctx)

  const subject = ctx.foodName ? `taking ${ctx.foodName} out` : `changing your ${slot}`

  /**
   * THE QUESTION MUST NOT OFFER WHAT THE CHIPS CANNOT. Read off the first
   * browser run: the coach asked "Want a higher-protein version, or shall I do
   * it anyway?" under chips reading only "Just today" and "Do it anyway",
   * because the pool had handed up no alternative. That is the app promising a
   * route it has no way to take — the same shape as the clarification card that
   * asked a question with no answer box, which this codebase already calls the
   * loop.
   *
   * So the closing clause is built from what is actually on offer, never
   * written out beside an assumption about it.
   */
  const closer = ctx.higherProteinOption
    ? 'Want a higher-protein version, or shall I do it anyway?'
    : 'Want to keep it to today, or shall I do it anyway?'

  // --- TIER 2: against the goal ---------------------------------------------

  // The day stops serving the goal on protein.
  if (proteinShare < PROTEIN_AGAINST_GOAL_FRACTION) {
    return {
      tier: 2,
      cost: `That puts your day at ${g(proteinAfter)} protein against a ${g(targets.protein)} target.`,
      alternatives,
      question: `That puts your day at ${g(proteinAfter)} protein against a ${g(targets.protein)} target — enough short that you'd feel it in how you recover from ${goal === 'fat_loss' ? 'training while you\'re cutting' : 'this week\'s sessions'}. ${closer}`,
      reason: `protein ${proteinShare.toFixed(2)} of target, below ${PROTEIN_AGAINST_GOAL_FRACTION}`,
    }
  }

  // Fat loss, and the day goes over. The deficit IS the plan.
  if (overshootHurts(goal) && calorieShare > 1 + CALORIE_OVERSHOOT_FRACTION) {
    const over = Math.round(dayAfter.calories - targets.calories)
    return {
      tier: 2,
      cost: `That puts the day about ${over} kcal over.`,
      alternatives,
      question: `That puts the day about ${over} kcal over your target, which is the deficit gone for today rather than dented. One day won't undo the month — do you want it just for today, or shall I do it anyway?`,
      reason: `fat_loss and calories ${calorieShare.toFixed(2)} of target`,
    }
  }

  // THE REPETITION, which is the case no single card can see. Each change
  // looked survivable on its own; the pattern is what costs the result.
  if (priorCostly + 1 >= REPEAT_CHANGES_THIS_BLOCK) {
    return {
      tier: 2,
      cost: `That's ${priorCostly + 1} changes like this in this block.`,
      alternatives,
      question: `That's the ${priorCostly + 1}${priorCostly + 1 === 3 ? 'rd' : 'th'} change like this in this block — each one is small, but together they're pulling your week away from what you asked for. Is something about these meals not working, or shall I do it anyway?`,
      reason: `${priorCostly + 1} costly meal changes this block`,
    }
  }

  // --- TIER 1: it costs something, said once, with the cheaper route --------

  if (proteinShare < PROTEIN_WORTH_SAYING_FRACTION && proteinLost > 0) {
    return {
      tier: 1,
      cost: `${subject[0].toUpperCase()}${subject.slice(1)} drops your day to ${g(proteinAfter)} protein, ${g(targets.protein - proteinAfter)} under target.`,
      alternatives,
      question: null,
      reason: `protein ${proteinShare.toFixed(2)} of target`,
    }
  }

  // Under-eating matters for every goal that is not fat loss — a hypertrophy
  // block run at 80% of calories is a maintenance block nobody chose.
  if (!overshootHurts(goal) && calorieShare < 0.9 && dayAfter.calories < dayBefore.calories) {
    return {
      tier: 1,
      cost: `That leaves the day around ${Math.round(targets.calories - dayAfter.calories)} kcal short, which is under what this block is built on.`,
      alternatives,
      question: null,
      reason: `calories ${calorieShare.toFixed(2)} of target on a ${goal} block`,
    }
  }

  if (overshootHurts(goal) && calorieShare > 1) {
    return {
      tier: 1,
      cost: `That takes the day to about ${Math.round(dayAfter.calories)} kcal against a ${Math.round(targets.calories)} target — still close, but it eats into the deficit.`,
      alternatives,
      question: null,
      reason: `fat_loss and calories ${calorieShare.toFixed(2)} of target`,
    }
  }

  return free(`${kind} leaves the day inside its targets`)
}

/** Identifies the thing being asked about, so the ask happens once per block per thing. */
export function mealAskKey(ctx: Pick<MealEditContext, 'kind' | 'slot' | 'foodName'>, blockNumber: number): string {
  return `${blockNumber}:${ctx.kind}:${(ctx.foodName ?? ctx.slot).toLowerCase()}`
}
