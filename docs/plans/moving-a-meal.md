# Moving a meal — "I'll have dinner as my snack instead"

Written 14 Sep 2026, from Ashley's instruction to fix everything on the four
decision cards she sent. `docs/plans/` gets a file before the build because
this path re-runs dietary enforcement, and CLAUDE.md requires a plan for that
even when the change looks obvious.

## What was there before, measured rather than remembered

CLAUDE.md's must-have list says, under "Changing one meal":

> Move a meal to another slot or day — `MISSING`, and deliberately: a dinner
> dropped into a breakfast slot does not fit breakfast's budget, and refuse /
> refit / rescale is Ashley's call.

Measured today, and the list is right about the state and understates the
reason. Three facts decide the shape of this work:

1. **There is no per-day meal plan.** `meal_plan_slots` holds a DATELESS pool
   of options per slot. `meal_plan_picks` layers a per-`(profile, date, slot)`
   override saying which pool option is that slot's meal on that date. So
   "today's dinner" is a pick, not a stored day.
2. **Only today is ever rendered.** `NutritionDisplay` is handed
   `getSessionDateContext(profile.id).date` and passes it straight to
   `MealPlan`. No screen anywhere shows another day's meals.
3. **The resize machinery already exists and is already trusted.**
   `scaleToTarget` / `scaleIngredients` (`portion-scaler.ts`) scale a whole
   meal by one factor and REFUSE outside 0.4x–2.5x rather than forcing an
   absurd portion. Generation uses them. No user-facing edit path calls them —
   every edit builder runs `verifyProposal` in `keepPortions` mode, because
   amounts a person stated are facts and are never rescaled.

## The two rulings

**Ashley, 13 Sep 2026 — "Resize it to fit."** Chosen over refusing the move and
over leaving the portions alone. So a meal that lands in a smaller slot is
scaled down to that slot's budget, and the app says what changed.

**Ashley, 14 Sep 2026 — "They swap places."** Asked what happens to the slot
the meal LEFT, from three options (swap / refill from the pool / leave it
empty). Her answer: dinner becomes the snack, the snack becomes dinner, both
resized to their new slots, both new sizes stated. Her reason matches the one
offered: it is the only option where the day still adds up without the app
inventing a change she did not ask for.

## What this builds, and what it deliberately does not

**BUILT — moving between slots on the same day**, both surfaces. This is where
the resize actually bites: the default splits are breakfast 30%, lunch 40%,
dinner 30%, snack 15% of the day (`computeSlotBudgets`, `BASE_RATIOS`), so a
dinner moved to the snack slot is a real halving, not a rounding.

**NOT BUILT — moving to another day**, and named rather than quietly dropped.
The destination would be a day no screen displays (fact 2 above), so the
control would change something the person cannot see, check, or undo by
looking. That is the one thing the must-have list forbids outright. It needs a
future-day meal view first, and that is its own piece of work.

## How it works

One new builder, `src/lib/meal-move.ts`, and it adds no checks and skips none.

1. Resolve both slots. A slot the profile does not have (no snack configured)
   is refused with a sentence pointing at Profile, exactly as the food-edit
   builder already does.
2. Read both slots' budgets from `computeSlotBudgets` — the same function the
   food edits read, so a move and an edit cannot disagree about what a slot
   is worth.
3. For each direction, compute the factor from the DESTINATION budget's
   calories over the meal's own calories. Outside 0.4x–2.5x, refuse and say so
   in plain words rather than serving a 40g dinner.
4. Scale each ingredient line with `withQuantity`, which replaces the number
   and preserves everything after it verbatim. Not by re-rendering the parsed
   line: the parser normalises "3 slices wholemeal bread" to "3 slice
   wholemeal bread", and the ingredient list she reads must stay in her words.
5. Run each scaled meal through `verifyProposal(..., keepPortions = true)` —
   food-DB resolution, the coverage floor, the dislike filter,
   `validateMealAgainstDiet`. `keepPortions` because step 4 has already set the
   portions deliberately; letting verify scale again would undo the fit.
   **A move cannot introduce an allergen — the foods are identical and only
   the amounts change — and it is verified identically anyway.** Deciding
   per-operation which checks to run is precisely the shape of the bug that
   let the almond butter through the swap path.
6. Name each moved meal distinctly — "Chicken Curry (as breakfast)". A pick is
   stored and resolved by NAME, so an option that keeps its name is
   indistinguishable from the original and the screen goes on rendering the
   old one while the write lands in the database. That failure has happened
   here once already and only the browser driver caught it.

The executor applies the two legs through the existing
`applyMealOptionToSlot`, and rolls the first leg back if the second fails —
a half-completed swap is a day with the same meal twice.

## What the card says before the tap

Both new sizes, because the resize is the part she cannot predict:

> Dinner and your snack swap places.
> Chicken Curry becomes your snack — 620 kcal down to 310, portions halved.
> Greek Yoghurt & Berries becomes dinner — 310 kcal up to 620.

And when the destination slot has no meal at all, the move is one-way and the
card says the source slot will be empty, rather than doing it quietly.

## Gates

- `test:meal-move` — the builder: both budgets read from the one function,
  the resize hits the destination budget, absurd factors refused rather than
  forced, dietary verification runs on BOTH legs, the names differ from the
  originals, a one-way move states the empty slot, and the ingredient wording
  survives the resize.
- `verify:meal-move` — a real Chromium at 390x844 driving the actual meal
  rows: the control is there, the card states both new sizes, and after the
  tap the two slots really hold each other's meals with the new numbers.
- Mutation-test every new check, and report how many were tried and caught.

## Not in this plan

Moving to another day (above). Changing how many meals a day — already on
Profile. The coach exam, still Ashley's to run.
