# Custom meals and pool depth — plan (dietary path)

**Status: plan, then build in this same session.** Ashley, 1 Sep 2026: *"there's
no way for me as a user to say I want to have certain foods and have the app
fit it in around my macros... the app should ask how much of each food I'm
having so it can calculate and then add that as my breakfast and plan for the
rest of my meals"* — and *"go ahead and implement the solutions you think are
best."* This touches the dietary/allergen path, so per CLAUDE.md it gets this
written plan first; the build proceeds under her explicit go-ahead above.

## What exists already (from the investigation, cited there)

- `propose_meal_addition` is 80% of the feature: a chat-named dish goes
  through `verifyProposal` — food-DB re-measure, diet rules, dislike filter,
  coverage floor — joins the pool, becomes the day's pick. **It adds no
  verification of its own**, which is the property to preserve.
- But it **rescales the dish to the slot's budget** (`scaleToTarget`), which
  is backwards for this ask: Ashley's portions are facts. "3 eggs, 150g
  yoghurt, 100g blueberries" resolves TODAY at 100% coverage → 375 kcal,
  35.2g protein. The food DB needs nothing added for the core flow.
- `assembleDay` has **no pinned-slot support**: manual picks override AFTER
  assembly (`App.tsx:222-225`), so the other slots are chosen as if the swap
  never happened. This is the "plan the rest of my meals" gap, and it is a
  gap for ORDINARY swaps too.
- Known allergen-path gap (do not widen; close it while here): the Nutrition
  tab's own swap panel offers pool alternatives **unfiltered by current
  restrictions**, unlike the chat swap path which re-checks via
  `optionBlockedBy`.

## The build

### 1. `propose_custom_meal` — "here's what I'm having"

New chat tool, courier-only server-side like every proposal. Args: `slot`,
`food_lines` (each "quantity unit food", the user's words), optional `name`,
`origin_verbatim_quote`. Prompt rules:
- Fire when the user states foods they WILL have ("I usually have eggs and
  greek yoghurt and fruit for breakfast").
- **Never guess a quantity.** If any food lacks an amount, ask "how much of
  each?" first — exactly the flow Ashley described — then call.
- This is not logging; `log_meal` stays as it is.

Client `buildCustomMealProposal`: runs the SAME pipeline as an addition with
one difference — **portions are kept as stated**. Concretely, `verifyProposal`
gains a `keepPortions` mode that skips `scaleToTarget` and the slot-budget
calorie/protein bands (the day-level rebalance replaces them), while keeping
everything that must never be skipped: ingredient resolution, the ≥80%
coverage floor (below it, the card says which foods weren't recognised and
asks her to rephrase rather than shipping a wrong number), the dislike
filter, and `validateMealAgainstDiet`. A restriction match doesn't silently
block her own food — the card states the conflict plainly and does not offer
Confirm, same posture as the chat swap path.

Confirm executes exactly like an addition: insert into `meal_plan_slots`,
set as the day's pick, same undo. **No new tables, no migration** — a custom
meal IS a pool option, so every downstream surface (display-time allergen
re-check, logging, shopping list, ledger) treats it like any other meal with
zero new code paths.

### 2. Pinned slots — "plan the rest of my meals"

`assembleDay` gains `pinned: Partial<Record<slot, PoolOption>>`. A pinned
slot contributes its macros and is excluded from the search; the free slots
are optimised so the WHOLE day lands in the existing tolerance bands. The
single-slot repair-scale never touches a pinned slot — stated quantities are
facts. `App.tsx` passes `manualMealPicks` as `pinned` instead of overriding
after assembly.

Consequence, stated rather than hidden: after ANY manual swap, the other
slots may change their picks to compensate. That is precisely what Ashley
asked for ("plan the rest of my meals"), it is what the day-total maths
already pretends happens, and it applies to ordinary swaps too — one model,
not two.

### 3. Depth: on-demand, not upfront

The "find more options" generator (`onFindMoreMealOptions`) already exists
but is reachable only through chat. It gets a button in the meal panel's
swap list ("More options"), so a shallow slot deepens itself when SHE wants,
at the moment she's looking — instead of paying more Gemini spend for every
user at onboarding. `DEFAULT_POOL_SIZE` stays 5.

### 4. Close the unfiltered-swap-panel gap

The panel's alternatives run through the same current-restriction check the
chat swap uses before being offered. A blocked option shows why it's blocked
rather than disappearing silently.

## Verification

- New gate `test:custom-meal`: as-stated portions are never rescaled (3 eggs
  stay 3 eggs); coverage floor still rejects; diet rules still reject; a
  pinned slot's macros are exact; free slots re-fit around a pin; the
  repair-scale never touches a pin; the panel's alternatives are filtered.
- Mutations that must each go red: re-enable rescaling in keepPortions mode;
  skip the diet check in keepPortions mode; drop the pin from assembleDay's
  totals; let repair-scale hit a pinned slot; unfilter the panel.
- Existing: `test:meal-addition`, `test:meal-roundtrip`, `test:meal-swap-rotation`,
  `test:audit-fixes`, `test:coach-promises` (new tool must act, not decline),
  `test:chat-actions`, tsc, build. `test:meal-quality` needs the live TEST DB
  and runs on Ashley's machine.

## Deploys

chat-gemini (new tool + prompt rules) — `npm run deploy:functions:prod --
chat-gemini`. generate-meals untouched. No migration.
