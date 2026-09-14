# Meals get the trade-off treatment too — the plan before the build

Ashley, 14 Sep 2026, choosing this from three: *"Work through all three one at
a time until [all] are completed."* First of the three.

## What is actually true today — measured, not recalled

The trade-off engine Ashley approved on 14 Sep (*"Build it"*) is **exercise
only**. Measured:

- `src/lib/edit-tradeoff.ts` mentions "meal" **once**, in a comment about a
  meal removal's swaps. Nothing in it computes anything about food.
- The coach has **17** proposal builders. **3** carry `advice` —
  `buildExerciseSwapProposal`, `buildExerciseAddProposal`,
  `buildExerciseRemoveProposal`. All exercise.
- There is exactly **one** `shouldAsk` call site in the whole app, and it is
  the exercise one. **No meal change has ever asked anything.**

What meal cards DO show is a macro table: calories, protein, carbs and fat,
before and after, with signed deltas (`meal-food-edit.ts:190-196`). That is a
READOUT. It tells you the number moved; it never says what the number means.

This is the same defect CLAUDE.md already records for exercise — *"the cards
price every change against the plan's STRUCTURE … and never against the
person's GOAL"* — and meals never even got the structural half.

**A correction to my own earlier note:** I first read `macroShortfallLine` as
the meal side's "cost" sentence. It is not. It answers "what is left to eat
today", and it fires on the day's progress, not on an edit. The meal edit paths
say nothing about cost at all.

## Why this matters, as coaching

Swapping the salmon for pizza once is fine and the app should not fuss. Doing
it four nights a week is how somebody eats at a deficit all month and keeps
none of their muscle — and today the app performs that silently, four times,
with a tidy table each time showing the protein falling.

The exercise side already asks in that situation. Meals are plans too; the
must-have list says so in as many words.

## The build

### 1. Reuse everything that is not the judgement

`Tradeoff`, `TradeoffAlternative`, `DO_IT_ANYWAY`, `applyTradeoff`, `askText`,
`shouldAsk` and `downgradeToCard` are all goal-agnostic — they operate on a
`Tradeoff`, not on an exercise. Only `assessEdit` and `EditContext` are
exercise-shaped.

So: a sibling `src/lib/meal-tradeoff.ts` exporting `assessMealEdit(ctx):
Tradeoff`, and every downstream step is the code already shipped. That is not
tidiness — it is what makes the coach's question grammar identical on both
sides, which is what the exam has to grade.

### 2. The goal's own terms, for food

Protein leads, in every goal. It is the hardest thing to make up later in the
day and the one that protects the outcome whether somebody is cutting or
growing. Calories come second, and **which direction is bad depends on the
goal** — over the target undoes a fat-loss deficit; under it starves a
hypertrophy block. Carbs and fat are never spoken about on their own: nobody
changes their dinner because of a fat gram.

### 3. The tiers

The SHAPE is already Ashley's ruling (four tiers, the goal's own terms, ask
once per block per thing, "do it anyway" always present). What is new here is
where the lines sit for food. These are my call, under the same delegation as
the exercise thresholds, and they are flagged rather than buried:

- **Tier 0, silent** — the day still lands inside its targets. Most swaps.
- **Tier 1, one sentence and a cheaper route** — a real but recoverable cost:
  the day's protein drops meaningfully, or the day goes the wrong way on
  calories for this goal. Offers the higher-protein version of the same dish,
  which the pool already holds.
- **Tier 2, ask first** — against the goal:
  - the day's protein would land **below 80%** of target, or
  - **fat loss** and the day would go **over** its calorie target, or
  - it is the **third such change this block** — the repetition case, which is
    the one that actually costs somebody their result and the one no single
    card can see.
- **Unsafe, refused** — allergens and stated bans. Already built
  (`meal-restriction-check`), untouched, and deliberately NOT part of this.

### 4. Which operations

The six that change the plan: `meal_swap`, `meal_food_remove`,
`meal_food_replace`, `meal_food_resize`, `meal_addition`, `meal_food_add`.
Plus `custom_meal`.

NOT `meal_log` (recording what happened is a fact, never a negotiation) and
NOT `meal_pool_refresh` (it offers options, it changes nothing).

### 5. The day, not the meal

A slot's own budget cannot answer "does the DAY still hit protein" — the
builders hold the slot budget and the meal's macros only. The day's living
targets are already in scope at every meal builder (`targets: macros`), and
`getTodayLedger` / `getMealPicksForDate` reach the rest of the day. That read
is async; the one place that dispatches proposals is already async and already
awaits sibling builders, so this is the road the swap-card cost fix already
took.

### 6. Both surfaces

Coach first, because that is where the builders live. Then the Nutrition
screen's own row menu, which reaches the same builders — so the sentence and
the question are literally the same strings, not two copies that drift.

## Gates

- `test:meal-tradeoff` — the tiers, against real generated meal days: each
  threshold from both sides, so no check passes vacuously.
- `test:coach-promises` — extended: a meal change that works against the goal
  ASKS rather than carding, the same section shape the exercise one has.
- `verify:meal-tradeoff` — a real browser. **This is not optional here**:
  CLAUDE.md records that a `test:` gate cannot prove a branch is REACHED —
  `if (false && advice)` left all twelve exercise source checks green.
- Mutation-test every one, and say how many were tried and caught.

## Deliberately NOT in this plan

- Changing what a meal edit is ALLOWED to do. Nothing gets refused that is not
  already refused.
- The allergen and dietary path. Untouched.
- Moving a meal to another DAY — still `MISSING` for its own reason (no screen
  renders another day's meals).
