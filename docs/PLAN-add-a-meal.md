# "Add this meal to my plan"

## Context

Confirmed missing. The coach has `propose_meal_swap`, `log_meal`,
`add_to_grocery_list` and `check_off_grocery_item`. **There is no tool that
puts a new meal into the plan.** Asking for one lands where every request the
app can't honour lands: a warm reply and nothing else.

This gets a plan before a build because it opens a **new route into what
someone eats**, and CLAUDE.md puts dietary enforcement in the always-plan-first
set. The danger is specific and worth naming: a user-named dish is text the
model wrote. If it reaches `meal_plan_slots` without passing the same checks a
generated meal passes, the app has a second, unguarded door into the meal plan
— which is exactly the "constraint asserted at N paths, missed at N+1" shape
this codebase keeps producing.

## The one idea this rests on

`verifyProposal` (`src/lib/meal-generation.ts:263`) is already the whole gate.
Given a `RawProposal` — name, ingredient lines, prep, cuisine — it:

1. parses ingredients against the food DB (`parseIngredientLines`),
2. rejects slot-inappropriate dishes (`checkSlotAppropriate`),
3. rejects anything containing a disliked food,
4. rejects below 80% ingredient coverage — i.e. **a dish the app can't measure
   is refused rather than guessed at**,
5. **runs `validateMealAgainstDiet`** — the allergen and dietary enforcement,
6. rescales quantities to the slot's macro budget and re-measures,
7. rejects anything that still misses calories or the protein floor.

Every generated meal in the app goes through it. So the build is not "write a
verification path for user-added meals" — it is **route user-added meals into
the existing one**. One enforcement point, not a second copy.

That decides where the work lives: the verification runs **client-side**,
because `verifyProposal` is a `src/lib` module a Deno edge function cannot
import. ChatAssistant already has the hook for exactly this —
`result.proposal.rawArgs` handed to a client-side `build*Proposal()`, which is
how `propose_exercise_swap` recomputes a load preview the server can't.

## The change

1. **`src/lib/meal-addition.ts` (new)** — `buildMealAdditionProposal({ rawArgs,
   profileId, targets, mealsPerDay, includeSnacks, dietaryPreferences,
   dislikedFoods, date })`. Builds a `RawProposal` from the model's arguments,
   gets the slot budget from `computeSlotBudgets`, calls `verifyProposal`, and
   returns **either** a proposal (scopeKey / preconditions / payload / diff)
   **or** a rejection carrying the reason in user-facing words. `verifyProposal`
   already writes a precise reason into `rejectLog`; this translates it rather
   than inventing one.

2. **`executeMealAddition` in `pending-action-executor.ts`** — on Confirm,
   inserts the verified `PoolOption` into `meal_plan_slots` at the next
   `pool_index` for that slot, then `setMealPick(profileId, date, slot, name)`.
   Insert-then-pick, both awaited and both checked; a receipt must never say
   "Added" for a row that didn't land. Deliberately does **not** go through
   `persistPools`, which deletes the slot's existing pool first — adding a meal
   must never wipe the other options.

3. **`propose_meal_addition` in chat-gemini** — declared and executed, returning
   `{ reply: "", proposal: { kind, rawArgs: args } }`. The server does no
   verification and stores nothing; it is a courier. The tool description must
   say the ingredient list is re-measured and re-portioned by the app, so the
   model doesn't claim precision it doesn't have — the same contract
   `generate-meals`' prompt already states.

4. **ChatAssistant wiring** — the `rawArgs` branch, and a `propose_meal_addition`
   arm in the confirm handler alongside `propose_meal_swap`.

5. **Gate: `test:meal-addition`.**

## Decisions taken without asking, and why

- **The dish is re-portioned to fit the slot's macro budget**, not added at
  whatever size the model named. This is not a new policy — it is what
  `scaleToTarget` already does to every meal in the app. Adding one meal
  exempt from it would put a hole in the day-total guarantees the whole meal
  system rests on. Mechanical, so no question.
- **A dish that can't be made to fit is refused, with the reason.** Consistent
  with generation. The alternatives (add it anyway and let the day run over;
  rebalance the other meals around it) are real product options and are noted
  below as follow-ups rather than decided here.
- **An added meal joins the pool AND becomes that date's pick.** "Add this to
  my plan" most naturally means "I want to eat this". A meal that silently
  joined a pool of five alternatives the user never opens would be a feature
  that looks built and does nothing visible — the exact half-landed shape this
  repo keeps hitting. Both effects are named on the confirmation card, so
  nothing is hidden, and the pick is reversible.

## Verification

- **`test:meal-addition` (new)**, with the safety section first:
  - a dish containing a food tagged for the user's declared allergen is
    **rejected**, for each of the twelve enforced preferences;
  - a dish whose ingredients the food DB can't resolve is rejected, not
    guessed;
  - an accepted dish lands inside the slot's calorie tolerance and above the
    protein floor **after** rescaling;
  - the proposal's diff shows the re-portioned macros, not the model's;
  - `propose_meal_addition` is declared, executed, and not a declining stub
    (the `test:coach-promises` §1 invariant);
  - adding does not shrink the slot's pool.
- **Mutation**: remove the `verifyProposal` call from the builder and confirm
  the allergen section goes red. A gate that would stay green with the
  enforcement deleted is worth nothing, and this session already shipped one
  that did.
- `test:coach-promises`, `test:meal-roundtrip`, `test:diet-tag-sync`,
  `test:food-db-parity` — unchanged and still green.
- `npx tsc -b` and `npm run build`.

## Flagged, not built here

- **The pool is the ceiling on variety.** `swapPoolMeal` picks from
  `DEFAULT_POOL_SIZE = 5` pre-generated options, so "something else entirely"
  is unreachable from a swap. That is item 3 of the queue and is where the
  cost question (a model call per swap) has to be put to Ashley.
- **A refused dish currently ends the conversation.** Rebalancing the rest of
  the day around a dish someone actually wants is the better coach behaviour
  and a bigger change; it needs its own plan.
