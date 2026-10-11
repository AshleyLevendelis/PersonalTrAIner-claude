# G · The Nutrition tab (screen side) and cross-app polish

Tracer G, read-only. Checkout `/home/claude/app` (branch `claude/test-log-fixes-oct9`).
IDs: M17, M18, M19, M21, M22, L21, L23, L24, L25, M25 (second half), plus the harness question.
Nothing under `/home/claude/app` was edited. Scripts I ran live in the scratchpad and only read and print.

**How to read "verified"**
- READ = I read the code path end to end and quote the lines.
- RAN = a read-only `npx tsx` script, or a standalone page in headless Chromium outside the repo, produced the number.
- INFERRED = follows from what I read, but needs the live database or the live model to prove.

## Scoreboard

| ID | Status | Class | Ships via |
|---|---|---|---|
| M17 | DELIBERATE DESIGN, gap stands | OWNER DECISION + mechanical parts | frontend |
| M18 | PARTLY (designed note is misplaced; logged slot is not held) | MECHANICAL + OWNER DECISION | frontend |
| M19 | CONFIRMED, and wider than reported: the method escapes the allergen and dislike checks | SAFETY-ADJACENT | frontend (+ `generate-meals` for the prompt half) |
| M21 | CONFIRMED IN CODE (cause INFERRED, high confidence) | MECHANICAL | frontend |
| M22 | CONFIRMED IN CODE | MECHANICAL + OWNER DECISION | frontend |
| L21 | DELIBERATE DESIGN: the tester's premise is out of date | none (no change) | none |
| L23 | CONFIRMED (two missing prompt rules; one claim is written in the prompt itself) | OWNER DECISION | edge function `chat-gemini` (+ `_shared/coach-rules.ts`) |
| L24 | CONFIRMED | MECHANICAL | frontend (+ three prompts for the model's own spelling) |
| L25 | CONFIRMED (mechanism READ, sizes RAN on a reproduction; desktop only) | MECHANICAL | frontend |
| M25b | CONFIRMED | MECHANICAL | frontend |

---

### M17 · Swapping one ingredient, or adding a food, removes the recipe method

- **Status:** DELIBERATE DESIGN. The complaint still stands as a gap in that design.
- **Root cause (READ).** Nothing "overwrites" the method with the note. An edit never changes a meal in place: it stores a NEW option beside the original and makes it today's pick, and that new option is built with no method. The note then renders in the ingredient block where the eye expects the method.
  - The method is one field, `prep`, on the option, shown only when non-empty: `src/components/MealPlan.tsx:1018` `{methodSafeToShow(option.prep).length > 0 && (`.
  - The note is a separate line in the ingredient block: `MealPlan.tsx:986` `{editNote && <p …>{editNote}. Your day has been re-fitted around it.</p>}`. "Swapped the blueberries" comes from `src/components/nutrition/MealFoodEditSheet.tsx:195`.
  - The method is dropped in THREE places, and a fix that touches only one changes nothing:
    1. Every edit builder hardcodes it empty: `src/lib/meal-food-edit.ts:183` `{ slot, name, ingredients, prep: '', cuisine: '' }`; `src/lib/meal-food-add.ts:99` `prep: '',`; `src/lib/meal-move.ts:159` `prep: '',` (the "(as lunch)" copy a slot move makes). The screen does not even hand the builder the method: `MealPlan.tsx:438` passes `meal: { name, ingredients, macros }`.
    2. The verifier's keep-my-amounts branch returns an option with no `prep` key at all: `src/lib/meal-generation.ts:550-556` (`return { slot, name, ingredients: parsed, macros, tags }`), while the normal branch keeps it at `:604`.
    3. The write that stores the edited copy has no `prep` in its insert: `src/lib/pending-action-executor.ts:509-519`.
  - Side finding, same wall: point 3 also discards the method of a dish the COACH adds by name. `src/lib/meal-addition.ts:162` forwards the model's `prep`, the verifier keeps it (`:604`), and the insert drops it. The plan file says the method is "Written by all three persist paths"; this fourth path was missed.
- **Prior rulings.** Deliberate and written down, as a session design choice (not a quoted ruling of Ashley's):
  - `docs/plans/meals-that-change-and-tell-you-how-to-cook.md:174-177`: "A meal whose ingredients were EDITED after generation loses its method for the same reason — the method names foods that may no longer be in it. Every edit path already rebuilds the proposal with an empty `prep`, so this falls out of the existing design rather than needing a new rule."
  - `src/lib/meal-generation.ts:131-135`: "several option builders (custom meals, a food added or swapped within a meal) legitimately produce a meal with no method at all. An absent method renders as no method, which is honest; a wrong one would not be."
  - `MealPlan.tsx:1016-1017`: "Absent … on custom meals and edited meals, which genuinely have no method."
- **Does the complaint still stand?** Yes, in two of the four cases the reason given does not apply:
  - ADD a food, RESIZE one, MOVE the meal to another slot: every food the method names is still in the dish. Hiding the method there loses something true.
  - REMOVE or REPLACE a food: the method may now name a food that is gone. That is the M19 problem, and it has an allergen edge (someone removes the peanuts; the steps still say "finish with crushed peanuts").
- **Fix.**
  1. Carry the method: add `prep?: string` to `CurrentMealForSlot` (`meal-food-add.ts:34`), pass `o.prep` at `MealPlan.tsx:438` and from the chat's current-meal builder, set `prep: currentMeal.prep ?? ''` in the builders, return `prep: methodSafeToShow(proposal.prep)` from the keepPortions branch, and add `prep` to the insert at `pending-action-executor.ts:509` through the existing missing-column retry (`insertPoolRows`, `meal-generation.ts:938`), not a bare insert.
  2. Gate it with the M19 check (below): after an edit, the method is shown only if every food it names is still in the ingredient list. The house rule already says the whole method goes, never one sentence (`meal-generation.ts:438-443`).
  3. Keep the note where it is; when the method is hidden for this reason say so in one line under the note.
- **Class:** OWNER DECISION for what the card says; the plumbing is MECHANICAL.
  - Question: "When someone changes one food in a recipe, what happens to the cooking steps?"
    - A. Hide them, as now.
    - B. Keep them whenever they still match the food list (a food added, an amount changed, the meal moved). Hide them only when they mention a food that is no longer in the meal, and say so in one line. **Recommended**: it keeps what is still true and never shows a step for a food that was taken out.
    - C. Always keep them, with a line saying they were written for the original recipe.
- **Ships via:** frontend only. No migration (the `prep` column exists: `20260919120000_add_meal_prep_method.sql`).
- **Gates:** `test:meal-method` (pins the amount rule; its line 255 asserts `meal-generation.ts` holds no `prep: '',`), `test:meal-food-edit`, `test:meal-food-add`, `test:meal-move`, `verify:meal-food-edit`, `verify:meal-method`, `test:bundle`. New check: after add / resize / move the option's method equals the base's; after a removal of a food the method names, it is empty.
- **Risk:** `test:meal-move.ts:79` builds its expected proposal with `prep: ''`. `meal-dish-identity.ts` reads names and tags only, so variety is unaffected. A fake database without the column is already handled by the retry.
- **Confidence:** high (three drop points read; the design note quoted).

---

### M18 · A logged meal's card keeps its title and tick but shows a different meal's numbers, ingredients and method

- **Status:** PARTLY. The mixed card is a designed state with an explanatory line, but the line sits under the content it describes, and nothing holds a logged slot still.
- **Root cause (READ).**
  - How the two are joined: by SLOT NAME only. The record is `loggedBySlot[slot]`, the meal events for the date grouped by slot (`src/lib/meal-store.ts:770-780`). The plan is `chosen[slot]`, re-derived from the pools on every render. `MealPlan.tsx:473` hands both to the same row.
  - The row then reads the title and the collapsed calories from the record and everything else from the plan:
    - title: `MealPlan.tsx:806-807` `const displayName = isLogged && loggedName ? loggedName : option?.name`
    - collapsed line: `:887` `{Math.round(isLogged ? loggedKcal : option.macros.calories)} kcal{isLogged ? ' ✓' : ''}`
    - expanded calories and macros: `:930-934`, all `option.macros.*`
    - ingredients `:939-988`, method `:1018-1025`, tags `:1035`, all `option.*`
  - The explanation exists but is rendered AFTER all of that: `:1043-1050` "Your plan now shows {option.name} here. The details below are that meal, not the one you logged." The details it calls "below" are above it. That is why the tester read it as the card contradicting itself.
  - The record cannot show its own ingredients: a meal event stores a name and macros and nothing else ("the ledger stores no ingredients", `MealPlan.tsx:812`).
  - Nothing stops the plan changing under a logged meal. Only the swap between DAYS checks: `src/lib/meal-day-move.ts:216-221`, sentence at `src/lib/coach-voice.ts:333` "You've already logged today's ${slot} as eaten, so it can't move." The same-day swap (`App.tsx:2010`), the food edits, Add food, the slot Move, the single-meal regenerate and Regenerate all have no such check (grep `loggedTodaySlots|isLogged` across App.tsx and the three sheets: only `useMealDays.ts:219,230,267`).
  - Wider than the tester saw: logging does not pin the slot in the day's assembly. Pins come from her swaps alone (`App.tsx:406` `pinsFromPicks(manualMealPicks, mealPools)`), and the day is re-searched on every render. So a logged slot's plan can also move when ANOTHER meal is edited or a target moves (INFERRED from the read; the "one edit replaces other meals" mechanism belongs to the tracer holding H9).
  - Stale comment worth deleting with the fix: `MealPlan.tsx:880-885` still describes the old behaviour ("the name above shows the new pick. Considered and kept"), which item 9 reversed.
- **Prior rulings.**
  - `BACKLOG.md:11221-11224`, Ashley's roadmap item 9: "Ensure updating dietary preferences or adding extra items preserves historical consumed meal records instead of retroactively altering past eaten logs on the diary screen."
  - `BACKLOG.md:11235-11236`: "The row now shows the logged name, and when the plan has moved on the expanded view says whose details are underneath."
  - `VISION.md:105-107`: "History is permanent … Nothing the user has recorded" is lost.
  - `CLAUDE.md` day-swap entry: refused for "today's meal once it is logged as eaten, either way round".
  So the record itself is safe (append-only row with its own name and macros; READ, and pinned by `test:diary-preservation`). What is wrong is the card, and that the app holds two positions on changing a logged meal.
- **Fix.**
  1. MECHANICAL, display: when `planMovedOn`, draw two blocks. First the record: "You logged" + the logged name + the logged calories and macros from the event + the Logged control. Then a divider and "On your plan now: {option.name}" with that meal's numbers, ingredients and method. Move the sentence above the details it refers to. The expanded hero number must be the record's, not `option.macros.calories`.
  2. OWNER DECISION, behaviour: one rule for a logged slot, enforced where the day-swap already enforces it (`loggedTodaySlots`).
     - Question: "After a meal is logged as eaten, can the plan for that meal still be changed?"
       - A. Yes, as now, with the clearer card.
       - B. No. Swap, regenerate and food changes on that meal say "You've already logged this — undo the log first", the sentence the day swap uses today. A logged meal also stays put when the rest of the day is re-fitted. **Recommended**: one position instead of two, and the card can never disagree with itself.
       - C. Yes, but ask first.
  3. Not recommended now: storing the ingredients on the record needs a migration.
- **Class:** MECHANICAL (1) + OWNER DECISION (2).
- **Ships via:** frontend. Option 3 would be a migration.
- **Gates:** `test:diary-preservation` (lines 79-80 and 99 pin the exact `planMovedOn` expression and the sentence, so a restructure must re-anchor them on the property), `verify:diary-preservation` (`.tour-harness/diary-preservation.mjs:102` reads the sentence off the `?ate=1` fixture), `test:meal-ledger-snapshot`, `test:meal-day-move`. New driver check: with the plan moved on, the logged name and logged calories sit ABOVE the plan's details and the sentence is inside the viewport before them (CLAUDE.md: "A message is only shown if it is on screen where the tap was").
- **Risk:** the harness page passes `onSwapMealSlot={noop}` (`.tour-harness/real.tsx:1196`), so a "swap is refused on a logged slot" check cannot be driven there until that handler is shared (see choke point 3).
- **Confidence:** high on the join and the misplaced line; medium on "moves when another meal is edited" (read, not run).

---

### M19 · The prawn salad's method uses "chilli flakes", which is not in the ingredient list

- **Status:** CONFIRMED, and the important half is not the chilli: **the method text is checked for amounts and for nothing else, so it also escapes the allergen filter and the foods-to-avoid filter.**
- **Root cause.**
  - Where recipes come from (READ). Two sources, one verifier:
    - The meal writer, `supabase/functions/generate-meals/index.ts`. A new plan and every regenerate use only this (`meal-generation.ts:805-807`: "Only the add path. A fresh plan and a regenerate still ask the writer"). Sam was a new user, so his prawn salad came from here. The library has no dish matching it (grep `chilli flakes|chili flakes` in `meal-library-data.ts`: none; "raw king prawns" is not a library ingredient).
    - Our own library, `src/lib/meal-library-data.ts`, 188 dishes, used only when more options are asked for.
  - The prompt invites the mismatch (READ). Rule 2 (`generate-meals/index.ts:315`): every ingredient "MUST be ONE parseable line with an exact quantity and unit … No ranges, no 'to taste'". Rule 6 (`:319`) forbids amounts in the method. No rule says the method may only name foods in the list. A pinch of chilli has no exact quantity, so the model leaves it off the list and still cooks with it. "chilli flakes" is also not in the food database (grep: only `gochujang` and `chili powder` match).
  - There is no check (READ). The only test applied to the method is `methodSafeToShow` (`meal-generation.ts:445-449`), a regex for a number followed by a mass or volume unit. `prep` is otherwise read for the breakfast heaviness test (`:497`) and the quick/standard tag (`:586`).
  - The dietary checks never see the method (READ): `validateMealAgainstDiet(parsed, dietaryPreferences)` at `meal-generation.ts:531` takes ingredients; the dislike match at `:518` takes the name and ingredient names; the display-time re-check `checkMealAgainstRestrictions(option.name, option.ingredients, …)` (`MealPlan.tsx:167`, `meal-restriction-check.ts:63-90`) takes the name and ingredients.
- **Measured (RAN, scratchpad scripts).**
  - Library count. A word-match heuristic flagged 12 of 188 dishes; reading all 12 by hand, **8 are real (4.3%)** and 4 are false alarms (three are "chilli" in the method against "chili powder" / "sweet chili sauce" in the list, which is itself an L24 spelling split; one is "lettuce cups" against "mixed salad leaves"). The 8:
    | Dish | The method names | The list has |
    |---|---|---|
    | Vanilla protein porridge | banana | blueberries (never mentioned in the method) |
    | Peanut butter overnight oats | a splash of milk | no milk |
    | Ham and egg breakfast burrito | beans | no beans |
    | Tofu breakfast burrito | sliced avocado | no avocado |
    | Halloumi and chicken quinoa salad | halved boiled eggs | no egg |
    | Salmon poke-style bowl | avocado | no avocado |
    | Soy mince chilli with rice | onion | no onion |
    | Ricotta and strawberry toast | a drizzle of honey | no honey |
    The heuristic only knows the words I gave it plus the food database, so 8 is a floor.
  - The safety half, proved by calling the real functions:
    - "Halloumi and chicken quinoa salad" run through `verifyProposal` with `['egg-free']`: **accepted**, method shown as "…then top with halved boiled eggs.", and `checkMealAgainstRestrictions` returns `{"ok":true,"issues":[]}`.
    - A made-up writer proposal for Sam's profile (`['nut-free']`, avoiding mushrooms and pork) whose list is chicken, rice, garlic, oil, broccoli and whose method says "Fry the mushrooms in butter … scatter over toasted walnuts and chilli flakes": **accepted**, method shown in full, display check `ok: true`.
  - Not measurable here: the rate in real writer output. No generated meals are stored in the repo and the model cannot be called from this session.
- **Prior rulings.** None on method-versus-list (grepped BACKLOG, CLAUDE.md, docs for `method`, `prep`, `chilli`). The standing honesty rule points the same way: a method that disagrees with its ingredients is dropped whole (`docs/plans/meals-that-change-and-tell-you-how-to-cook.md:167-169`). The meal card's own line (`MealPlan.tsx:409`) says "Ingredients are filtered, not verified" and does not mention the steps.
- **Fix (needs a written plan first: this is the dietary path).**
  1. One pure function beside `methodSafeToShow`, for example `methodNamesOnlyListedFoods(prep, ingredients)`: find the food words in the method using the food database's names and aliases plus a short kitchen list (salt, pepper, water and the like are allowed), and require each to match an ingredient line. Singular/plural and UK/US alias pairs must count as a match, or the three "chilli/chili" cases fail for the wrong reason.
  2. Apply it in `verifyProposal` (both branches) and again at display, the way the amount rule and the dietary re-check already run twice. Fail = no method shown, meal kept.
  3. Independently, and first: run the method text through the same diet and avoid checks as the ingredients at display time. A method naming a blocked food is hidden even if rule 1 is ever loosened.
  4. Fix the 8 library dishes in data (add the food to the list or take it out of the sentence).
  5. Prompt (separate deploy): add to rule 6 "name only foods that are in the ingredients list; a seasoning you cook with goes in the list with an amount". The prompt is a request; rules 1-3 are the check.
- **Class:** SAFETY-ADJACENT. One OWNER DECISION inside it: "Seasonings with no real calories (chilli flakes, salt, pepper, dried herbs): must they be on the ingredient list for the steps to show, or are they allowed in the steps without being listed?" Options: A must be listed; B a short fixed list of seasonings is allowed unlisted, anything else must be listed (**recommended**: fewer recipes lose their steps, and nothing on that list is an allergen the app tracks); C leave as is.
- **Ships via:** frontend for 1-4; edge function `generate-meals` for 5.
- **Gates:** `test:meal-method` (31 checks, amounts only), `test:meal-library` (83 checks; none compares method to list), `measure:meal-library`, `test:diet-tag-sync`, `test:food-db-parity`, `test:kept-meal-restriction`, `verify:meal-method`. New: a `test:` check that every library dish passes the new function (this would have caught all 8), a check that a method naming a blocked food is not shown, and a mutation that removes the display-time call.
- **Risk:** too strict a matcher hides most methods (the amount rule has the same failure mode). Measure the hide rate on the 188 library dishes before and after, and print it in the gate.
- **Confidence:** high (no-check claim read; both leaks reproduced by running the real functions).

---

### M21 · Tapping the favourite heart does nothing; console says "Couldn't save … as a favourite"

- **Status:** CONFIRMED IN CODE. The failing statement is identified (READ). The reason it fails is INFERRED with high confidence; it needs one look at the live error code to close.
- **Root cause.**
  - The message comes from exactly one place, the insert/update itself: `src/lib/favourite-meals.ts:162-164` `console.error(\`Couldn't save ${meal.name} as a favourite:\`, error); return false`. The read before it has a different message (`:141`), so the read succeeded and the write was rejected.
  - What is written: `favouriteInputFromOption` (`:48-58`) copies `option.macros.calories/protein/carbs/fat` straight in.
  - Those numbers are not whole: `src/lib/food-db.ts:748-751` returns `kcal: Math.round(...)` but `protein: Math.round(totals.protein * 10) / 10` (same for carbs and fat). One decimal place.
  - The table's columns are integers: `supabase/migrations/20260704104715_create_favorite_meals_table.sql:36-39` `calories integer, protein integer, carbs integer, fat integer`.
  - Supabase's REST layer does not round a decimal into an integer column; it rejects the row (the familiar `22P02 invalid input syntax for type integer: "46.6"`). INFERRED: I cannot reach a database from here.
  - RAN: of 152 library dishes that pass verification at a typical target, **0 have whole-number protein, carbs and fat** (first three: 46.6 / 7.9 / 39.5, 53.7 / 72.4 / 11, 53.9 / 68.3 / 9.6). So the heart cannot have saved any real meal since it was built on 19 Sep.
  - Why nothing caught it: the commit says "No migration — the table and every column it needs already existed" (`36aae346`); nobody compared the column TYPES with the new values. Before that commit the only writer was the chat, passing the model's whole-number macros. `verify:meal-favourite` and `test:meal-favourite` run against an in-memory database that does not enforce column types (`.tour-harness/fake-supabase.ts:19-22`: "minus their schema-specific constraint checks"). I found no BACKLOG line saying the heart was proven on the live app.
  - Ruled out: access rules. `favorite_meals` uses the same `owns_profile(profile_id)` policy as the tables Sam's other writes went through in the same session (`20260830120000_scope_every_table_to_its_owner.sql:261-268`), and he was signed in. A duplicate-name clash cannot happen on a first heart.
  - Why it is silent (READ): by design the heart does not move on a failed write (`MealPlan.tsx:184-187`), and nothing else is shown. `handleFavouriteToggle` (`:772-784`) discards the result. That breaks the app's own line "Every write succeeds or says it did not" (`CLAUDE.md:1177`); `test:silent-writes` has no heart check (grep `favourite|heart`: none).
- **Prior rulings.** The heart itself: Ashley, 19 Sep 2026, "a heart on the meal row" (`favourite-meals.ts:4`). Failure behaviour, session design: "a failed WRITE leaves the heart where it was" (`BACKLOG.md:4319-4321`). Nothing rules that the failure should be invisible.
- **Fix.**
  1. `markFavourite`: round the four numbers (`calories: Math.round(meal.calories)` and so on). The columns are a summary for the coach's "used Nx" line; whole grams are enough. No migration.
  2. Say it failed: a line under the row from the shared phrasebook (`didNotSave(...)` in `coach-voice.ts`), cleared on the next tap.
  3. Make the fake honest: teach `fake-supabase.ts` the handful of integer columns so a decimal is rejected the way Postgres rejects it (CLAUDE.md: "A fake must fill what the database fills").
  4. Run the sibling sweep once (CLAUDE.md: re-run a derivation against the cases it was not written for): every integer column that the client writes. The migrations list `target_calories`, `target_protein_g`, `target_carbs_g`, `target_fats_g`, `duration_minutes`, `intensity_rpe`, `reps_completed`, `rest_seconds`, `streak_days` among others. I did not trace those writers.
- **To close the inference (one minute, on TEST):** tap a heart and read the logged error object: `code: "22P02"` confirms; `42501` would mean access rules after all.
- **Class:** MECHANICAL.
- **Ships via:** frontend only.
- **Gates:** `test:meal-favourite` (29 checks), `verify:meal-favourite`, `test:meal-likes`, `verify:meal-likes`, `test:silent-writes`, `test:bundle`. New: the row handed to the table has four integers (mutation: remove one `Math.round`); a failed heart leaves a visible sentence inside the viewport.
- **Risk:** none to stored data. Hearts feed likes (27 Sep), so once hearts start saving, day picks will start favouring hearted dishes for the first time on live; that is the ruled behaviour arriving, not a regression.
- **Confidence:** high on where it fails and why it is silent; high-but-unproven on the integer cause.

---

### M22 · "Regenerate all": no confirm, ~20 seconds behind a tiny spinner, and the edited lunch was replaced

- **Status:** CONFIRMED IN CODE (READ), three separate causes.
- **Root cause.**
  1. No confirm. The header link calls the handler directly: `MealPlan.tsx:385-393` `onClick={onRegenerateAll}`. The "Redo them" banner does the same (`:367`).
  2. The wait. `handleRegenerateAllMeals` (`App.tsx:2160`) runs `generateMealPools`: up to 3 rounds (`MAX_GENERATION_ROUNDS = 3`, `meal-generation.ts:54`) of model calls for 7 options a meal, each round saved before the next (`:887`). On screen the only signal is a 12 px spinner inside the link (`MealPlan.tsx:391` `<Loader2 className="size-3 animate-spin" />`) and disabled buttons. The "Building your meals… this takes up to a minute" message (`:319-324`) is only drawn when there are NO meals yet. The old meals stay on screen and tappable for the whole run.
  3. The edited lunch. Two faults in the same handler:
     - The on-screen options are replaced with the writer's answer only: `App.tsx:2212-2218` `if (options.length > 0) next[s] = options` where `options` is `result.accepted`. The stored pool is different: `persistPools` keeps hearted meals and meals she asked for or edited and re-appends them (`meal-generation.ts:1062`, `:1093-1103`). An edited meal is such a meal: its copy is tagged at `pending-action-executor.ts:518` `tags: [...(option.tags ?? []), USER_REQUESTED_TAG]`. So the edited lunch is still in the database and missing from the screen until the next reload. The single-meal regenerate already does this properly: `App.tsx:2082-2088` "READ BACK, not the generator's answer … Showing `accepted` left kept meals off the screen until the next reload."
     - Today's choice is cleared for every regenerated meal whether or not the chosen dish survived: `App.tsx:2228-2234` (`delete next[slot]` and `clearMealPick`). After a reload the edited lunch is one of the swap options, not today's lunch.
- **What the app already does to protect meals (READ).**
  - Hearted meals and meals asked for by name (which includes every edited copy) survive in the stored pool: `survivesRegeneration`, `meal-generation.ts:1018-1021`.
  - A meal whose regeneration failed keeps its old options AND its pick (fix of 17 Sep, `App.tsx:2219-2227`, `BACKLOG.md:6366-6372`).
  - A read that fails deletes nothing; an insert that fails puts the old pool back (`meal-generation.ts:1057-1070`).
  - Logged meals: the record is untouched, but the plan under it is regenerated like any other (see M18).
  - Not protected: today's picks, the shopping list ("leaves the grocery list naming ingredients for meals that no longer exist", `App.tsx:2107-2109`), and the days the top-up button was ruled to hold still.
- **Prior rulings.**
  - `src/lib/meal-store.ts:534-538`, Ashley 3 Sep 2026: "regeneration replaces the app's OWN suggestions; a meal she asked for by name survives. Her words for the alternative: a button called 'regenerate' silently undoing a request she made two minutes earlier." Clearing the pick on her edited lunch is that alternative, one step removed.
  - `MealPlan.tsx:159-162`: "Ashley's ruling there was 'ask rather than rebuild silently'" (about the automatic redo offer; the manual button was never ruled on).
  - `CLAUDE.md`, 28 Sep "Button, keep today": the add-more button must not move today or shopped-for days. Regenerate all moves both.
  - No ruling found on confirming the button (grepped BACKLOG for `regenerate all`, `confirm.*regenerat`, `are you sure`).
- **Fix.**
  1. MECHANICAL: after the run, set the screen from storage (`getPools`), as the single-meal handler does; clear a pick only when the picked dish is no longer in that meal's stored options.
  2. MECHANICAL: a visible working state for the whole list while it runs (the existing "Building your meals…" wording, with the old meals dimmed and not tappable).
  3. OWNER DECISION: the confirm and what it leaves alone.
     - Question 1: "Regenerate all takes about 20 seconds and replaces every meal option. Should it ask first?"
       - A. No, as now.
       - B. Always ask, in one line that says what goes and what stays: today's meals and the other options are replaced; meals you logged, hearted, asked for or changed yourself are kept; the shopping list will need rebuilding. **Recommended**: one extra tap on the most destructive button on the tab.
       - C. Ask only when something of hers would be affected (a logged meal, a changed meal, a pick, days on the shopping list).
     - Question 2: "Should it leave today's logged meals alone?" Recommended yes; same rule as M18's option B.
- **Class:** MECHANICAL (1, 2) + OWNER DECISION (3).
- **Ships via:** frontend only.
- **Gates:** `test:meal-refit` (reads the handler at line 417), `test:goal-change` (lines 294-296 pin that a goal change calls this handler; it already has its own confirm card, so a confirm must live in the BUTTON, not in the handler), `test:dashboard`, `test:meal-roundtrip`, `test:kept-meal-restriction`, `test:silent-writes`, `test:bundle`. No browser driver reaches it: `.tour-harness/real.tsx:1196` passes `onRegenerateAllMeals={noop}`. New: move the handler into a hook the harness page also uses (the `useMealDays` pattern), then drive "edit lunch, regenerate all, lunch is still the edited one".
- **Risk:** keeping a surviving pick means a meal she edited does not change when she presses regenerate; that is the 3 Sep ruling applied to picks, but say it in the confirm line so it is not read as the button doing nothing.
- **Confidence:** high.

---

### L21 · Coach bubbles are the accent colour and the user's are dark; "your September decision was the reverse"

- **Status:** DELIBERATE DESIGN. What is live is Ashley's LATEST September ruling. The "reverse" was her earlier September design, and she chose against going back to it by name.
- **What is live (READ):** `src/components/ChatAssistant.tsx:6614-6616`: the user's bubble is `border border-border bg-card text-card-foreground` (the panel colour, dark in the dark themes), the coach's is `bg-primary text-primary-foreground` (the accent).
- **The rulings, in order.**
  1. 26 Sep 2026, first grouped-bubble build, `BACKLOG.md:1772-1774`: "your messages sit on the right in the theme's main colour, and the coach's on the left in a surface bubble with a 1px hairline." This is the arrangement the tester remembers.
  2. 27 Sep 2026, `BACKLOG.md:1510-1512`: "DECIDED: THE COACH'S BUBBLE IS THE FLAT MAIN COLOUR … Ashley's answer … from three options: **flat mint**".
  3. 28 Sep 2026, `BACKLOG.md:846-854`: "YOUR CHAT BUBBLES ARE PLAIN; THE COACH STAYS MINT … Her ruling, from three options: **mine plain, coach mint**, over coach plain with hers mint (it would undo her coach ruling) and over a paler mint for hers".
  4. The standing copy: `CLAUDE.md:1229` "**Coach bubbles are the flat main colour** — Ashley's ruling, 27 Sep 2026, from three options" and `CLAUDE.md:1236` "**Your bubbles are PLAIN** — her ruling 28 Sep 2026, from three options".
  The three `design_handoff_*` folders in the repo hold no bubble colour rule (grep `bubble`: only a token table row, `design_handoff_app_polish/README.md:43`, and a pointer to a `design_handoff_chat_grouped_bubbles` folder that is not in this checkout).
- **The unmerged branch.** `git log --oneline main..origin/claude/chat-grouped-bubbles` prints one commit: `d7785db5 The chat becomes a conversation: grouped bubbles, one screen, split replies`, dated **3 Sep 2026**. `git diff --stat main...origin/claude/chat-grouped-bubbles | tail -5` ends "12 files changed, 955 insertions(+), 483 deletions(-)". Its tip is not an ancestor of `main`, and `main` is 393 commits past the fork. In that commit the colours ARE the reverse: `src/components/chat/bubbles.tsx:55` user = `bg-[rgba(var(--glow-rgb),.14)]` (accent tint), `:58` coach = `bg-card`. So yes, the branch does what the tester describes, and no, it should not be merged: it is the superseded first attempt, it predates the 26 Sep rebuild that replaced it on `main` and both colour rulings, and merging it would undo a ruling she made twice.
- **Fix:** none. If she wants the reverse after all, that is a new ruling, and the 28 Sep entry already records that she weighed it.
- **Class:** no action. (If raised: OWNER DECISION, with the 28 Sep quote put in front of her.)
- **Ships via:** nothing.
- **Gates:** `verify:chat-bubbles` (65 checks) and `test:chat-groups` hold the current colours and would fail a reversal.
- **Risk:** a fix written from the test log would break a gated ruling.
- **Confidence:** high.

---

### L23 · "When you're carrying that kind of weight" to a fat-loss client who feels awful; "This app is completely free" stated as fact

- **Status:** CONFIRMED as two gaps in the coach's instructions. One of the two sentences is the prompt talking.
- **Root cause (READ).**
  - Pricing. The coach was told the app is free. `supabase/functions/chat-gemini/index.ts:2079` (same sentence in `supabase/functions/_shared/coach-rules.ts:32`): "…a subscription, billing, payment, or account-cancellation feature of any kind (this app is free, no in-app purchase, no App Store/Google Play subscription to manage either…)". It was written to stop the coach inventing a subscription screen. The model repeats it with emphasis. `scripts/test-chat-app-reality.ts:185` checks the "does not exist" list still names `subscription`; nothing checks or limits what the coach says about price. I found no ruling from Ashley that the app may be described as free (grepped BACKLOG, CLAUDE.md, VISION for `free`, `subscription`, `pricing`).
  - Body talk. The prompt has one relevant rule, `chat-gemini/index.ts:2178`: when the language is "about the PERSON rather than the session (self-worth, hating how they look, feeling awful about themselves) … Ask one gentle, genuine question before jumping to session logistics". It governs what to DO first. Nothing governs the words used for the person's body. §1 VOICE (`:1994-2018`) covers length, lists, praise openers and silver linings; `:2130` says "Never shame a miss". No rule says do not characterise their size or weight. Grep of the prompt for `body|size|overweight|carrying|heavier person|bmi`: no instruction, only tool descriptions.
  - `scripts/test-coach-voice.ts` cannot see either: it grades the sentences the APP writes (the phrasebook in `coach-voice.ts`), not the model's. The model's wording is graded only by the coach exam; the rubric (`docs/coach-exam-rubric.md`) has no body-language line (grep `self-worth|how they look|body`: none), and the ten hard rules do not include one.
- **Prior rulings.** `CLAUDE.md` "STILL HERS … what the app SAYS and how it sounds … what it is allowed to CLAIM about itself." Both halves are hers by that line.
- **The missing rules.**
  1. No commercial claims. The coach should not state what the app costs, will cost, or includes for free. The parenthesis at `:2079` should stop asserting a price and say only that there is nothing to pay for or cancel inside the app.
  2. Body-neutral language. Never describe the person's body, size or weight in the coach's own words ("carrying that kind of weight", "at your size", "someone your weight"). Talk about the goal, the plan and what they did. Quote a number only when they ask for it or it is the subject of the turn. This applies with extra force straight after the self-worth trigger at `:2178`.
- **Fix.** Two prompt edits in `chat-gemini` (and the shared block in `_shared/coach-rules.ts`, which `test:coach-rules-sync` keeps identical), one exam case for each, and two cheap hard-rule patterns in the exam grader (a price claim; a size characterisation), each fixture-tested with a correct twin as CLAUDE.md requires for exam rules. Then the exam must be re-run (`coach-exam-fresh` will fail until it is), on Ashley's machine.
- **Class:** OWNER DECISION, two questions.
  - "If someone asks what the app costs, what may the coach say?" A. "It's free", as now. B. Nothing about price; if asked, "there's nothing to pay for or cancel inside the app". **Recommended**: true today and stays true if pricing ever changes. C. A sentence you write.
  - "How should the coach talk about someone's body?" A. As now, its own judgement. B. Never describe their body or size in its own words; talk about the goal, the plan and what they did. **Recommended.** C. The same, and also never bring up their weight number unless they ask.
- **Ships via:** edge function `chat-gemini` (separate deploy). `_shared/coach-rules.ts` is also imported by `onboarding-chat`, so check whether that function needs redeploying with it.
- **Gates:** `test:chat-app-reality`, `test:coach-rules-sync`, `test:coach-promises` (fails if an exam question is pasted into the prompt, so the new examples must not reuse the exam's wording), `test:coach-exam-grader`, `test:coach-exam-fresh` (goes red on any prompt change until the exam is re-run).
- **Risk:** a wording rule the model half-obeys. Code can only catch the listed phrases; whether the tone is right stays the exam's to judge (the cardio-ruling split in CLAUDE.md).
- **Confidence:** high that the rules are absent and that "free" originates in the prompt; the exact live replies were not reproducible here.

---

### L24 · Dates switch between "2026-10-08" and "Oct 8, 2026"; US spellings beside British ones

- **Status:** CONFIRMED (READ).
- **Is there a shared date formatter?** Yes, and most screens do not use it: `src/lib/day-labels.ts` (`weekdayShort`, `weekdayLong`, `dayOfMonth`, `longDate`, `dayLabel`), all `en-GB`, all read in UTC. Its callers are the meal strip, the Move sheet, the day swap, the top-up, the grocery lines and two chat cards. The chat's own day pill has a second formatter (`src/lib/chat-groups.ts:53`, `en-GB`, "Mon 14 Sept"). There is no "8 Oct" or "Thu 8 Oct" helper for a plain date, which is why the screens below print the raw value.
- **Raw `YYYY-MM-DD` shown to the user:**
  | Where | Line |
  |---|---|
  | Home, recent weigh-ins | `src/components/WeighInCard.tsx:101` `{h.date}` |
  | Session history list | `src/components/exercise/SessionHistoryDialog.tsx:90` `{entry.day ?? entry.splitType} · {entry.date}` |
  | Exercise screen, History tab | `src/components/exercise/ExerciseDetailDialog.tsx:281` `{session.date}` |
  | Exercise screen, strength chart axis | `src/components/exercise/ExerciseStrengthChart.tsx:50-52` |
  | Offline queue review | `src/components/OfflineStatusIndicator.tsx:91` `{item.date}` |
  | Meal cards, any day but today | `src/lib/meal-food-edit.ts:84`, `src/lib/meal-food-add.ts:129` ("Becomes your lunch for 2026-10-09") |
  | Meal cards, always (even today) | `src/lib/meal-addition.ts:193`, `src/lib/custom-meal.ts:111` ("…becomes your dinner for ${date}") |
  | A goal's saved wording | `src/components/ChatAssistant.tsx:4119` (" by ${args.target_date}"), then shown on Profile |
  | Day-swap receipt rows | `src/lib/pending-action-executor.ts:754, 763, 816, 827` (`${l.date} ${l.slot}: …`), split into label/detail at `ChatAssistant.tsx:5775`; I did not confirm on a screen that this label is visible |
- **US-format dates ("Oct 8, 2026"):** `src/components/ProfileScreen.tsx:387` `toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })` (the "added on" badge on goals and remembered facts); `src/App.tsx:3326` `'en-US', { month: 'short', day: 'numeric' }` ("until Oct 15" on an active adaptation). The other `en-US` calls produce weekday names or a 12-hour clock, which read the same in both.
- **US spellings in the app's own strings:**
  - `ProfileScreen.tsx:1280` "Favorite cuisines", while onboarding asks "Any favourite cuisines?" (`src/lib/onboarding-slots.ts:841`) and the heart says "Save as a favourite" (`MealPlan.tsx:1119`).
  - `ChatAssistant.tsx:3949` "I don't recognize …".
  - "program" in `Dashboard.tsx:598`, `exercise/WeekContextRow.tsx:230`, `exercise/ProgramBrowse.tsx:242, 257`, `ToolsTab.tsx:86`, `exercise/SwapDialog.tsx:382`, `exercise/AddExerciseSheet.tsx:274`, `ChatAssistant.tsx:2644`, while two coach cards say "a different programme" (`ChatAssistant.tsx:3541`, `:3711`).
  - Library ingredient lines: "chili powder", "sweet chili sauce" (`meal-library-data.ts`, matching the food database's own names at `src/lib/food-db.ts:485, 493`) beside methods that say "chilli".
- **"Cilantro" is data from the model, as suspected.** The food database's own name is British, with the US word as an alias: `food-db.ts:470` `f('coriander', ['fresh cilantro', 'cilantro', …])` (likewise courgette/zucchini `:271`, aubergine/eggplant `:280`, rocket/arugula `:286`, spring onion/scallion `:405`, prawns/shrimp `:150`). The app keeps the ingredient name the model wrote rather than the database's name, and neither the meal writer's prompt nor the coach's asks for British English (grep `British English|UK English|spell` in the three functions: nothing). The coach's own prompt is written in US spelling ("FAVORITE MEALS … prioritize", `chat-gemini/index.ts:1987, 2485`), which the model mirrors.
- **Prior rulings.** None on locale (grepped). The house style is British by evidence: CLAUDE.md itself, `day-labels.ts`, "Sulphite", kg, "favourite".
- **Fix.**
  1. Add two helpers to `day-labels.ts` (a short date such as "Thu 8 Oct", with the year only when it is not this year, as the chat pill does) and use them at every row above. "today" where the date is today, as `meal-food-edit.ts:79-85` already argues.
  2. Correct the listed strings. Pick "programme" or "plan" once and use it everywhere.
  3. For the model: one line in each prompt ("Write in British English: coriander, courgette, aubergine, yoghurt, prawns, mince, chilli") and, for certainty, show the food database's own name when an ingredient resolved through an alias.
- **Class:** MECHANICAL (consistency with the evidenced house style). Item 3's prompt lines are edge-function work.
- **Ships via:** frontend; `generate-meals`, `chat-gemini`, `onboarding-chat` for the prompt line.
- **Gates:** `test:local-dates` (which DAY a date is, not how it is written), `test:meal-day-move` (reads `day-labels`), `test:tools-grid`, `test:tab-ownership`, `test:profile-groups`, `test:app-tour` (tour copy may name "program"), `test:chat-app-reality` (the prompt's Tools bullet says "full training program"), `test:bundle`. New: a source check that no `.tsx` renders a bare `.date` and that `en-US` is never passed with a `month` option; a word-list check on user-facing strings.
- **Risk:** renaming an ingredient at display must not change the stored name: picks, favourites and the avoid filter all match by name.
- **Confidence:** high on the list as far as grep reaches; it is not proven complete.

---

### L25 · The page shifts about 15 px sideways each time a dialog opens

- **Status:** CONFIRMED. Mechanism READ in the library source; sizes RAN on a standalone reproduction with the app's layout classes (not on the app itself). Desktop browsers only.
- **Root cause.**
  - Every dialog, dropdown and select here is Radix (`src/components/ui/dialog.tsx:3`), which locks page scroll through `react-remove-scroll-bar` 2.3.8. On open it injects (`node_modules/react-remove-scroll-bar/dist/es2015/component.js`, default `gapMode = 'margin'`): `body[data-scroll-locked] { overflow: hidden !important; position: relative !important; margin-right: <gap>px !important }` where gap is the scrollbar's width.
  - The scrollbar disappears, the viewport gets 15 px wider, and the margin keeps the BODY the same width. Anything `position: fixed` is measured from the viewport, not the body, so it is not compensated. The library offers two opt-in class names for that (`right-scroll-bar-position`, `width-before-scroll-bar`); the app uses neither, and `src/index.css` has no `scrollbar-gutter` (grep: none).
  - The fixed pieces: the gear `App.tsx:3050` (`fixed right-3`), the offline pill `:3064` (`fixed left-3 right-14`), the tab bar `BottomTabBar.tsx:100-107` (`fixed inset-x-0` with a centred `max-w-6xl` inside), the session dock `BottomDock.tsx:152…` (`md:right-4`), the chat header `ChatAssistant.tsx:6438`.
- **Measured (RAN, headless Chromium, a page with those classes and the library's exact rule):**
  | Window | Scrollbar | In-flow page | Tab bar contents | Gear (right-anchored) |
  |---|---|---|---|---|
  | 1280 wide, desktop | 15 px | 0 | 7.5 px | **15 px** |
  | 1000 wide, desktop | 15 px | 0 | 0 (bar grows 15 px) | **15 px** |
  | 390 x 844, phone emulation | 0 px | 0 | 0 | 0 |
  The tester was on desktop Chrome, which is where a 15 px scrollbar exists. Phones draw the scrollbar over the page, so there is no shift there, and every `verify:` driver runs at phone size, which is why no check has seen it.
- **Prior rulings.** None (grepped `scrollbar`, `shift`, `dialog` in BACKLOG and CLAUDE.md).
- **Fix (measured on the same reproduction: every shift goes to 0):**
  ```css
  html { scrollbar-gutter: stable; }
  html body[data-scroll-locked] { margin-right: 0 !important; }
  ```
  The second line is required. With the gutter alone the library still adds its 15 px margin and the page content moves 7.5 px the other way (also measured).
- **Class:** MECHANICAL.
- **Ships via:** frontend (`src/index.css`).
- **Gates:** `test:overlay-artifacts` (reads `dialog.tsx` and `index.css`), `test:a11y`, `test:appearance`, `test:bundle`. New: one driver step at a desktop size (not phone emulation) that opens a dialog and asserts the gear's left edge does not move. The harness does not boot `App.tsx`, so it would measure a harness copy of the gear unless the check uses the tab bar, which is the real component.
- **Risk:** desktop pages that do not scroll now reserve an empty 15 px strip on the right. Body background paints it, so it should be invisible; look at the onboarding canvas and the full-page chat on desktop once.
- **Confidence:** high on the mechanism; medium that the gear and tab bar are everything the tester saw move (not measured in the live app).

---

### M25 (second half) · "Exercises to avoid" sits in the Nutrition section, labelled "won't eat/do Band Dislocates"

- **Status:** CONFIRMED (READ). Two separate things.
- **Root cause.**
  1. Placement. The row is inside `<Group label="Nutrition">` (`ProfileScreen.tsx:1173`) under the "Dietary & cooking" heading (`:1176`), at `:1260-1264`, directly after "Foods to avoid". Straight below it, at `:1274-1278`, is the allergy caveat ("These filters check ingredients we recognise … If you have a food allergy, always check ingredients yourself"), which now reads as if it were about exercises.
  2. The label. Four of the five writers of an exercise ban store the FOOD wording:
     - the ban button on the exercise screen: `App.tsx:2429` `displayText: \`won't eat/do ${exerciseName}\``
     - the coach's ban card: `src/lib/pending-action-executor.ts:319`
     - the coach's "remember this" tool, any hard dislike: `ChatAssistant.tsx:3955`
     - onboarding dislikes: `App.tsx:1812`
     - only Profile's own add writes it right: `ProfileScreen.tsx:630` `won't do ${name}`
  3. And the ban is shown twice. The tag list shows the resolved name ("Band Dislocates", `:598`). The "Exercise preferences" list further down prints the stored wording (`:1475` `{f.display_text}`), because `grouped` leaves out food likes and dislikes but not exercise dislikes (`:751-757`).
- **Prior rulings.** The placement was the building session's choice, verified as such, not a quoted ruling: `BACKLOG.md:8277` "This closes it, beside 'Foods to avoid', the same control and the same failure handling" and `:8300` "it sits immediately beside Foods to avoid". `CLAUDE.md:712` repeats it. Injuries were moved OUT of this area on 6 Sep for the same kind of reason (`ProfileScreen.tsx:1323-1327`: it "put 'my shoulder hurts' among the dropdowns").
- **Fix.**
  1. Move the row to the training group ("Training setup", `:955`), beside Equipment.
  2. One helper for the wording by kind ("won't eat X" for food, "won't do X" for an exercise) used by all six writers. Display existing rows by kind rather than rewriting stored text.
  3. Leave exercise dislikes out of `grouped`, as food dislikes are, so a ban appears once.
- **Class:** MECHANICAL. Worth one line to Ashley because it moves something on Profile.
- **Ships via:** frontend. No migration (old rows are re-worded at display).
- **Gates:** `verify:setup-answers` §7d and §7e ENFORCE the current placement (`.tour-harness/setup-answers.mjs:542-543`: "in the same group as Foods to avoid", "and right beside it") and must be re-anchored on the new home. `test:profile-groups`, `test:food-dislike-is-a-ban` (its line 108 pins the food receipt wording), `test:injury-separation` (`scripts/test-injury-exclusion-separation.ts:75` uses the old exercise wording as a fixture), `test:memory`, `test:setup-answers`.
- **Risk:** the exclusion filter matches on the resolved name, not the wording, so re-wording cannot unban anything.
- **Confidence:** high.

---

### Question 11 · The phone-size, tap-target and accessibility drivers

- **Where:** `.tour-harness/` (five pages: `real.html` for Home/Nutrition/Exercise/Tools, `chat.html`, `profile.html`, `grocery.html`, `tour-harness.html`; about 70 `*.mjs` drivers), `.onb-harness/` (onboarding), `.tw-harness/` (reply reveal speed). Whole-app ones: `verify:tap-targets` (`.tour-harness/tap-targets.mjs`, asks what a thumb hits with `elementFromPoint` at 44 px), `verify:screens` (`walk.mjs`: sideways scroll, anything past the right edge, leaked `NaN`/`undefined`, stuck "Loading"), `verify:chat-shell`, `verify:tour-real`. `test:a11y` is a source check (`scripts/test-a11y.ts`), not a browser run. CLAUDE.md names `verify:walk`; there is no such script, the walk is `verify:screens`.
- **How one is written and run, in two lines:** a plain Node file in `.tour-harness/` that serves the built harness, starts `/opt/pw-browsers/chromium` headless on its own fixed debug port, sets 390x844, loads a page with URL switches that pick the fixture (`?ate=1`, `?kept=1`), then clicks and reads the DOM through `Runtime.evaluate`, counts `check(...)` failures and exits once. It is registered in `package.json` as `vite build --config .tour-harness/vite.config.ts && node .tour-harness/<name>.mjs` and run with `npm run verify:<name>`.
- **Does it run in this cloud checkout without a live Supabase?** Yes: no environment variables, no keys. The pages install an in-memory database through the app's own seam (`setSupabaseClient`, `.tour-harness/real.tsx:34-35`), "today" is fixed by `.tour-harness/anchor.mjs`, the meal writer is a stubbed `fetch` (`real.tsx:837-841`), and Chromium is present here (`/opt/pw-browsers/chromium` → `chromium-1194`). The three checks that do need a database are `test:meal-quality`, `test:schema-parity` and `verify:rls`.
- **Limits that matter for this report:**
  - It does not boot `App.tsx`. Swap and Regenerate all are stubbed on the page (`real.tsx:1196` `onSwapMealSlot={noop} onRegenerateMealSlot={noop} onRegenerateAllMeals={noop}`), so M22 and the swap half of M18 cannot be driven until those handlers live in a hook the page shares.
  - The fake database does not enforce column types (M21 passed there).
  - Phone emulation has no scrollbar (L25 is invisible there).
  - Each build writes to `.tour-harness/dist`, so two drivers must not run at once, and I did not run any (read-only brief).

---

## Shared choke points

1. **"Is this method true of this ingredient list?"** (M19, M17, and the allergen leak). One function beside `methodSafeToShow`, called at verification and again at display, plus the method text passed through the existing diet and avoid checks. It decides whether an edited meal keeps its steps (M17) and stops a recipe naming a food that is not there (M19).
2. **A logged meal is a record** (M18, M22, and H9's knock-on). One rule read from one place (`loggedTodaySlots`, which the day swap already uses): a logged meal is displayed from its record, is not swapped, edited or regenerated without undoing the log, and is held when the day re-fits.
3. **App-level meal handlers are outside every browser check** (M22, M18). Swap, single regenerate and Regenerate all are closures in `App.tsx` and `noop` in the harness. Moving them into a hook shared with the harness page, as `useMealDays` was, makes them drivable.
4. **The stand-in database accepts what Postgres rejects** (M21). Teach it integer columns once; then sweep the other integer columns the client writes.
5. **One date voice, one spelling** (L24). `day-labels.ts` gains the two missing helpers and every screen uses them; one British-English line goes into the three prompts.
6. **One wording per kind of dislike** (M25b). Six writers, one helper.
7. **One sentence in the coach's prompt is the source of "free"** (L23): `chat-gemini/index.ts:2079`, mirrored in `_shared/coach-rules.ts:32`.

## Suggested build order

Model and effort are suggestions for the prompts the main session writes.

| # | Work | Why here | Needs Ashley? | Model · effort |
|---|---|---|---|---|
| 1 | M21: round the four numbers, say when a heart fails, type-aware fake | Smallest fix, biggest "it is broken" on the tab | No | Sonnet · low |
| 2 | L25: two CSS lines + one desktop-size check | Two lines | No | Sonnet · low |
| 3 | M25b: move the row, one wording helper, show a ban once; re-anchor `verify:setup-answers` §7d/7e | Mechanical; a gate currently enforces the wrong place | One line to tell her | Sonnet · medium |
| 4 | L24: date helpers and the listed strings | Mechanical sweep | No | Sonnet · medium |
| 5 | M22 mechanical half: read back from storage, keep a pick whose dish survived, a visible working state; share the handlers with the harness | Stops the edited lunch vanishing before any wording is decided | No | Opus · medium |
| 6 | M18 display: the record and the plan as two blocks | Makes the existing design readable | No | Sonnet · medium |
| 7 | Rulings: M22 confirm, M18 logged-meal rule, M17 steps, M19 seasonings, L23 price and body language | Six short questions, one at a time | **Yes** | none |
| 8 | M19 plan, then build with M17's carry-through and the 8 library fixes | Dietary path: plan before build | After 7 | Opus · high |
| 9 | L23 prompt rules, exam cases, grader patterns; deploy `chat-gemini`; re-run the exam on her machine | Needs her deploy and her key | After 7 | Opus · medium |
| 10 | L21 | No change. Do not merge `claude/chat-grouped-bubbles` | No | none |

Deploys: 1-6 and 8 are frontend (live on merge). 8's prompt line needs `generate-meals`; 9 needs `chat-gemini` (and check `onboarding-chat` for the shared block). No migration anywhere in this report.

## What I could not do

- Reach a database: M21's rejection code is inferred, not observed.
- Call the model: how often the live meal writer names an unlisted food (M19), and the exact L23 replies, are unmeasured.
- Run a browser driver against the app: I ran nothing that writes into the repo. L25 was measured on a standalone page.
- Trace the other integer-column writers (M21, fix step 4), or confirm on a screen that the day-swap receipt shows its raw date (L24).
