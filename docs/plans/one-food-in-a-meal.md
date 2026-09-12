# Make one meal as adjustable as one workout

## Context

Ashley, asked what to do next, chose: **make meals as adjustable as workouts.**

The two sides are lopsided today. A workout can have an exercise swapped,
banned, removed or moved, from the screen and from the coach. A meal can be
swapped whole, regenerated, or have a food or a whole meal *added* — and that
is all. Three operations are `MISSING` from CLAUDE.md's own must-have list:

- Remove or replace one food within a meal
- Scale a portion
- Move a meal to another slot or day

That breaks CLAUDE.md rule 1 — a feature touching a grain supports every
operation listed for that grain, or the report says which it does not. Meals
are half the product and this is the thin half.

**Her ruling, asked before planning:** removing a food should **say what it
costs and offer to replace it**, then let her decide. Decline and the day is
simply lighter and the rings show that honestly. Chosen over removing quietly,
and over silently growing the other meals — *"the one thing the app has always
refused to do"*. This is deliberately the same shape as removing an exercise,
which already reports what it costs the week's push:pull balance and offers the
swap list before the tap.

## The finding that makes this small

`meal-food-add.ts` already established the exact pipeline, and all three
within-meal operations are the same pipeline with a different ingredient array:

```
current meal's ingredient lines  →  edit the array  →
verifyProposal(..., keepPortions = true)  →  PoolOption  →
executeMealAddition  →  undo
```

- **Remove** = the lines minus one.
- **Replace** = minus one, plus one.
- **Resize** = one line's quantity changed.

`verifyProposal`'s `keepPortions` mode (`meal-generation.ts:269`) is the single
safety gate: food-DB resolution, the ≥80% coverage floor, the dislike filter and
`validateMealAgainstDiet`. Its own comment records why a parallel path must not
exist — *"a parallel 'custom' path with its own subset of the checks is how the
almond butter got through the swap path — one pipeline, one place to be wrong."*
**Nothing here adds a check and nothing skips one.**

Reused, not rebuilt:

- `parseIngredientLines` / `scaleIngredients` — `src/lib/portion-scaler.ts`
- `verifyProposal`, `computeSlotBudgets` — `src/lib/meal-generation.ts`
- `MealAdditionPayload`, `normaliseSlot`, `normaliseDate`, `explainRejection` —
  `src/lib/meal-addition.ts`
- `executeMealAddition` and its undo — `src/lib/pending-action-executor.ts`
- `assembleDay`'s pinned-slot rebalance — refits the rest of the day, exactly as
  it already does for an addition

## Slice 1 — remove, replace, resize one food

### The module — `src/lib/meal-food-edit.ts` (new)

Modelled directly on `meal-food-add.ts`, including its header explaining which
of the three doors it is. One builder per operation, all returning the existing
`{ ok: true, scopeKey, preconditions, payload, diff } | { ok: false, reason }`.

**The cost line is the point of the slice.** Before the confirm, the card states
what leaves with the food — computed from the parsed line's own macros, rendered
with the `signed()` helper already in `meal-food-add.ts` — and offers two or
three replacements drawn from the food DB that would close the gap. Declining is
a first-class outcome, not a failure.

### Both surfaces, because that is what "as adjustable as workouts" means

- **Screen** — `src/components/MealPlan.tsx` already renders the ingredient list
  behind "view ingredients". Each line gains a row menu: Remove · Replace ·
  Change amount. Same confirm-card shape the coach path produces, so the two
  cannot describe one edit differently.
- **Coach** — three tools in `supabase/functions/chat-gemini/index.ts`
  (`propose_meal_food_remove`, `..._replace`, `..._resize`) with prompt rules
  distinguishing them from the three existing doors, plus propose/confirm
  branches in `src/components/ChatAssistant.tsx`.

Adding a food is currently `coach only`, which is an existing parity gap. Doing
the screen side here closes it for the whole ingredient row rather than widening
it by three.

## Slice 2 — named, not built

**Moving a meal to another slot or day.** Different mechanism entirely: it
re-assigns a pick (`setMealPick`) rather than editing ingredients, and it has an
unanswered question — a dinner dropped into a breakfast slot does not fit
breakfast's budget. Refuse, move and refit, or move and rescale is Ashley's
call, and it deserves its own plan rather than being smuggled in here.

## Safety

This is dietary enforcement, so CLAUDE.md requires a plan before a build — this
document is it, and it must be committed before the first line of code.

The rule that must hold: **every edited meal goes back through
`validateMealAgainstDiet` inside `verifyProposal`.** A removal cannot introduce
an allergen, but a *replacement* obviously can, and a resize changes what a
"contains traces" judgement is being made about. No new verification, no
parallel path.

## Verification

- `test:meal-food-edit` (new, registered): each operation driven through the
  real `verifyProposal`; a replacement that introduces an allergen is refused;
  the coverage floor and dislike filter still bite; the stated cost equals the
  removed line's actual macros; declining leaves the plan untouched.
- Extend `test:food-dislike-is-a-ban` and `test:diet-tag-sync` to cover the new
  entry points — an edited meal is a meal.
- `verify:meal-food-edit` (new): the real Nutrition screen at 390×844 — open a
  meal, remove a food, read the cost line and the offered replacements off the
  screen, confirm, and check the day's rings move by that amount and no other
  meal changed.
- Every new check mutation-tested, with tried/caught reported.
- Full sweep before merge. `test:meal-quality` and `test:schema-parity` fail in
  a cloud session for want of a live database and are not this change.

## Costs

- **Needs a `chat-gemini` deploy** for the coach half — worth batching with the
  one already outstanding on Ashley's machine.
- No migration. The screen half ships with the frontend on merge.
- Merging to `main` needs her word, as always.
