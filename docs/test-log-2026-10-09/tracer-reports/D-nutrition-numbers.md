# D · Numbers the user can't trust, and the nutrition side of the coach

Read-only trace. Repo `/home/claude/app` (branch `claude/test-log-fixes-oct9`). Nothing in the repo was edited.
Scratch scripts (read-and-print only) are in the session scratchpad: `h6.ts`, `h6b.ts`, `h6c.ts`, `diet.ts`, `h12.ts`, `h16.ts`, `m20.ts`.

Bugs covered: H6 (+ run 2 update, + L32), H9, H10 (+ run 2 update), H12, H13, H16, M20, M23, L18, L19, L20, L26, L28 (+ L8), L31.

**Headline.** 12 of 14 are confirmed in code, 2 are partly deliberate design (L26 empty list, L20 past days).
Both H6 numbers were reproduced **to the decimal** by running the estimator. The tester's guess ("the first item
is dropped") is wrong: nothing is dropped. Each item is *found* and then *costed at one or two grams*, or
matched to the wrong food. Five of the fourteen bugs come out of two functions in one file.

Legend: **VERIFIED** = read in code and/or run. **INFERRED** = reasoned from verified facts, not run end to end.
The deployed `chat-gemini` cannot be read from here; "deployed" below means "the repo copy the function is built
from". The exact numeric reproduction is the evidence that the two agree.

---

### H6 · Typed-in meals logged far too low (187 kcal wrap + latte; 266 kcal eggs on toast); coach defended the number; "Assuming assumed"

- **Status:** CONFIRMED IN CODE (reproduced exactly, both meals).
- **Root cause:** four separate defects on one path.

  **The path (VERIFIED).** `log_meal` tool (`supabase/functions/chat-gemini/index.ts:1470`). The model only
  *parses*: it sends `ingredients: [{name, quantity, unit}]` and `assumptions`. The numbers come from
  `computeMealMacros(ingredients)` (`index.ts:3608`), imported from the edge function's own copy of the food
  database (`index.ts:4` → `supabase/functions/_shared/food-db.ts`). With intent `logging` the handler returns a
  `propose_meal_log` proposal carrying those numbers (`index.ts:3679-3698`); the browser builds the card in
  `src/lib/meal-log-proposal.ts` and does **not** recompute (`ChatAssistant.tsx:4672-4691`). No second model
  call, no `macro-calibration` (that function is referenced only in comments in `src/`).

  **Defect 1 — an unknown unit is silently read as GRAMS.** `_shared/food-db.ts:637-645`:
  ```ts
  if (entry?.units && entry.units[u] != null) return entry.units[u] * quantity
  if (DEFAULT_UNIT_GRAMS[u] != null) return DEFAULT_UNIT_GRAMS[u] * quantity
  // Unknown unit name (e.g. a stray "1 handful") — treat the quantity as grams
  return quantity
  ```
  Egg only knows `medium / large / small` (`:146`). So "2 eggs" sent as unit `whole`, `egg`, `eggs`, `piece`,
  `each` = **2 grams of egg = 3 kcal**. The tool's own schema *suggests* `whole` as a unit (`index.ts:1511`:
  "g, ml, medium, large, scoop, tbsp, tsp, slice, **whole**, clove"). Coverage stays 100% (the food resolved), so
  nothing is flagged. This is the repo's "silent default launders a bug" pattern exactly.

  **Defect 2 — the edge function runs a STALE COPY of the food database in which this was already fixed.**
  `src/lib/food-db.ts` fixed the bare-count case on 1 Sep 2026 (commit `30f1594c`), with this comment
  (`src/lib/food-db.ts:686-700`, in `unitToGrams`):
  > "Falling through to the treat-as-grams default turned "3 eggs" into THREE GRAMS of egg: 5 kcal, coverage
  > 100%, nothing flagged — a confidently wrong number in the worst place for one."

  The edge copy's header (`_shared/food-db.ts:4-9`) says "SYNCED COPY of src/lib/food-db.ts, verbatim … Kept in
  sync by hand". It is not. Measured: **324 entries vs 333**; the edge copy lacks the `whole` fix, the accent /
  punctuation normaliser, the `-ies/-oes` plural rule and 9 foods (`black coffee`, `rye crispbread`,
  `pancake mix`, `ricotta cheese`, `mixed berries`, `cannellini beans`, `brown lentils`, `marinara sauce`,
  `creme fraiche`). It has also diverged the *other* way: the 9 Sep stored-plural
  index exists only in the edge copy (`_shared/food-db.ts:522-532`). So a straight file copy in either direction
  loses a fix. `test:food-db-parity` only compares allergen tags, one direction
  (`scripts/test-food-db-parity.ts:15-17`: "rather than demanding the files be identical, which they are not
  and need not be").

  **Defect 3 — a whole DISH is matched to one of its ingredients.** `lookupIngredient`'s word-sequence pass
  (`_shared/food-db.ts:582-593`) was written so "grilled chicken breast fillet" finds "chicken breast". It also
  makes "chicken caesar wrap" find the alias `wrap` → **`tortilla wrap`, 60 g, 186 kcal**: an empty tortilla.
  The prompt then forbids the model from doing better: "Extract ONLY what the user actually stated. Never add an
  ingredient they didn't mention" (`index.ts:2429`), so it cannot break the wrap into chicken, dressing, cheese.

  **Defect 4 — a made drink has no entry.** `latte` → no match. If the model names its assumption
  ("whole milk latte"), that resolves to `milk whole` with unit `large` → Defect 1 → **1 gram of milk, 0.6 kcal**.

  **Run (VERIFIED, `h6.ts`, deployed copy):**
  ```
  {"name":"chicken caesar wrap","quantity":1,"unit":"whole"} -> tortilla wrap  60g  186.0 kcal P 5.04 C 30.00 F 4.80
  {"name":"whole milk latte","quantity":1,"unit":"large"}    -> milk whole      1g    0.6 kcal P 0.03
  TOTAL 187 kcal P 5.1 C 30 F 4.8  coverage=1.00  unmatched=[]          <- the card, exactly

  eggs 2 (unit whole|egg|eggs|piece|each)  -> egg          2g    3.1 kcal P 0.26
  bread 2 slice                            -> white bread 72g  190.8 kcal P 6.48 C 35.28
  butter 10 g                              -> butter      10g   71.7 kcal F 8.10
  TOTAL 266 kcal P 6.8 C 35.3 F 10.6                                    <- the card, exactly
  ```
  So the wrap is *present* (as a bare tortilla) and the latte is the part worth ~1 kcal; the eggs are *present*
  at 2 g. Same lines through the frontend copy: eggs-on-toast = **417 kcal, P 19.6** when the unit is `whole`
  (`h6c.ts`). Which unit word the model actually sent is INFERRED (eight candidates give the identical 266).
  Note "assumed whole wheat toast" on the card while the number is *white* bread: `whole wheat toast` does not
  resolve at all in either copy, so the model must have sent a name that resolves to white bread ("bread", "toast bread") — the assumption
  shown and the food costed are different foods.

  **Also broken the same way (VERIFIED, both copies):** `2 "slices"` of bread (plural) = 2 g; `1 large banana`
  = 1 g; `1 "serving" chicken breast`, `1 "fillet" salmon`, `1 "can" tuna`, `1 "bowl" pasta`, `1 "glass" milk`
  = 1 g each, coverage 100%. Only 10 of 333 foods have a piece weight for the frontend fix to use.

  **Coverage is poisoned by the same default.** Coverage is by weight (`:691`). An unmatched "latte, 1 large"
  weighs 1 g against the tortilla's 60 g → coverage 0.98 → passes the 80% floor
  (`meal-log-proposal.ts:100-108`). And `payload.unmatched` is documented "shown on the card"
  (`meal-log-proposal.ts:34`) but `ChatAssistant.tsx` never renders it (0 occurrences of `unmatched`).

  **Why the coach defended 187 (VERIFIED from the prompt; the reply itself is model behaviour).**
  1. It has no channel for a number the user gives. `log_meal` has no calories field, and the prompt says "You
     must NEVER calculate or state a macro number … yourself" (`index.ts:2424`). Calling the tool again with the
     same words returns the same 187.
  2. A stale line tells it to bend logged food to the plan: "When a food LOGGING command is given (log_meal),
     execute it immediately. **Scale portions to the meal slot budget above.**" (`index.ts:2503`).
  3. "594" is the prompt's own Lunch line: `Math.round(context.macros.calories * 0.35)` (`index.ts:2463`) =
     1,697 × 0.35. So "550 fits right into that slot's budget of 594" is the model reconciling the user's figure
     with the only number it is allowed to quote. (Side finding: that table is 25/35/30/10; the engine's real
     budgets for Sam are 458 / 611 / 458 / 170 — `computeSlotBudgets`, run in `h16.ts`. Two definitions of a
     meal's budget.)

  **"Assuming assumed" (VERIFIED).** The schema tells the model to write `'assumed 0% fat greek yoghurt'`
  (`index.ts:1519`); the card prefixes `Assuming ${assumptions.join('; ')}.` (`meal-log-proposal.ts:129`).

- **Prior rulings:** Ashley 7 Sep 2026 — "ask first, log when she taps confirm" (`meal-log-proposal.ts:11-12`).
  The coverage floor's own reason: "logging 40 kcal for a proper dinner is worse than logging nothing: it does
  not read as missing, it reads as a light day" (`meal-log-proposal.ts:96-99`) — H6 is that harm arriving by a
  route the floor cannot see. No ruling found on bought/restaurant dishes (grepped BACKLOG, CLAUDE, docs for
  `caesar`, `latte`, `takeaway`, `restaurant`, `composite`).
- **Fix:**
  1. MECHANICAL. `unitToGrams` never returns `quantity` for a unit it does not know. Return "amount unknown"
     (e.g. `NaN`/`null`) and have `computeMealMacros` treat that line as unresolved: listed in `unmatched`,
     and counted against coverage by **line**, not by a 1 g weight. Normalise the unit first (`slices`→`slice`,
     `eggs`/`egg`/`piece`/`each`/`item`/`x`/`''` → count). A count uses `units.medium ?? units.whole ??
     purchaseUnit.avgGrams`; a size word the entry lacks (`large` banana) scales the medium (×0.85 / ×1.15),
     else unknown.
  2. MECHANICAL. One food database, not two. Either generate the edge copy from `src/lib/food-db.ts` in the
     deploy script, or keep both and make `test:food-db-parity` behavioural: same entry count, and
     `lookupIngredient` / `computeMealMacros` agree over a fixed phrase list (include "2 eggs", "chocolate rice
     cake", "crème fraîche", "coffee"). Merge both directions first (keep the 9 Sep plural index).
  3. MECHANICAL. A plausibility stop in the `log_meal` handler before the proposal is returned: any line that
     resolved to under ~5 g from a count/size unit, or a breakfast/lunch/dinner under ~100 kcal, returns a
     question ("how big was it?") instead of a card.
  4. MECHANICAL. Delete "Scale portions to the meal slot budget above" from `index.ts:2503`. Render
     `payload.unmatched` on the card ("not counted: latte"). Card line: strip a leading `assum(ed|ing)` from each
     item and print `Assumed: large eggs; whole wheat toast; 10 g butter.`
  5. SAFETY-ADJACENT (plan first — same function decides allergen tags). `lookupIngredient` must not let a dish
     name stand for one ingredient: when the known name is shorter than the query, the leftover words must all
     be preparation words (grilled, cooked, raw, fresh, sliced, lean, boneless, large …); otherwise it is a miss.
  6. OWNER DECISION — see below.
- **Class:** MECHANICAL (1-4) · SAFETY-ADJACENT (5) · OWNER DECISION (6).
  **Question for Ashley:** *When someone logs something the app has no recipe for — a shop-bought wrap, a
  coffee-shop latte, a takeaway — what should the coach do?*
  - A. Ask one question ("roughly what was in it, or what does the pack say?") and log their figure, marked as theirs.
  - B. Estimate from a typical version, show it clearly as an estimate with what it assumed, and let them overwrite it with the pack's number.
  - C. Say it can't put a number on that one and log nothing.
  - Recommend **B**, falling back to A when they give a number. A coach would say "call it about 550, tell me if
    the label says different". Today the app does none of the three: it logs a confident wrong number.
- **Ships via:** edge function `chat-gemini` (1, 2, 3, 4-prompt) + frontend (1, 2, 4-card). No migration.
- **Gates:** existing — `test:meal-log` (already imports the edge copy's `lookupIngredient`,
  `scripts/test-meal-log.ts:26`), `test:food-db-parity`, `test:diet-tag-sync`, `test:custom-meal` (holds the
  `3 eggs` case for the *frontend* copy only), `test:coach-promises`, `test:functions-deployable`. No gate reads
  `unitToGrams` at all. New: a table of everyday phrases × both copies asserting grams > 20 for every counted
  food, plus the two test-log meals asserting ≥ 350 kcal or a refusal — never a card under 300.
- **Risk:** stricter units will turn some meals that log today into a question; that is the intended trade.
  Fix 5 changes what generated meals resolve to, so it needs `test:quality`-scale meal checks
  (`measure:meal-library`, `test:meal-variety`, `test:soft-preferences`) and a look at pool sizes.
- **Confidence:** high on 1-4 (run, exact match). Medium on which unit word the model sent.

---

### H10 · A typo weigh-in rewrites the calorie target; 81.2 kg had already moved it with no notice

- **Status:** CONFIRMED IN CODE.
- **Root cause (VERIFIED):**
  - **Where it is saved.** `WeighInCard.tsx:35-51`: range check 25-350 only, then
    `upsertDailyMetric({ profile_id, date: today, weight_kg })`. `daily-tracking.ts:10-13` upserts
    `onConflict: 'profile_id,date'` — **one row per day; a second entry the same day replaces the first.** The
    coach's `log_weight` is a second writer with the same 25-350 check and no confirm card
    (`chat-gemini/index.ts:3386-3418`).
  - **How it moves the target.** `App.tsx:2801-2818` `handleWeightLogged` →
    `getEffectiveTargetWeightKg` (`nutrition-targets.ts:145-168`): 7-day mean via `computeWeightTrend`
    (one value per date, `weight-trend.ts:46-55`), compared with the last anchor stored in
    `daily_nutrition_targets.calculated_weight_kg`:
    ```ts
    if (lastAnchorKg == null) return { weightKg: trend.rollingAvgKg }
    if (Math.abs(trend.rollingAvgKg - lastAnchorKg) >= TARGET_WEIGHT_ANCHOR_THRESHOLD_KG) return { weightKg: trend.rollingAvgKg }
    return { weightKg: lastAnchorKg }
    ```
  - **Why 81.2 moved it (should not have under the ruling: 0.8 kg < 1 kg).** Onboarding never writes the first
    anchor. `handleOnboardingComplete`'s `commitPlan` (`App.tsx:1670-1690`) sets macros and seeds a weigh-in row
    (`App.tsx:1785-1794`) but never calls `snapshotTargetsIfChanged` — the only callers are `:796`, `:1292`
    (session restore), `:2768`, `:2796`, `:2813`. So in the sign-up session `lastAnchorKg == null` and the first
    reading *becomes* the anchor. The same-day 81.2 also overwrote the 82 seed row, so the "average" was 81.2.
    No notice because a first snapshot is by definition not a change
    (`nutrition-targets.ts:244` `changedFromPrior: last != null`).
  - **Why 62 moved it.** Same day → replaces 81.2 → the 7-day mean of one row is 62 → 19.2 kg ≥ 1 kg → anchor
    moves. The rule as written was followed; it has no minimum sample, and **a threshold that only stops small
    moves gives no protection against big ones** — the bigger the typo, the more surely it passes.
  - **Numbers reproduced (`h16.ts`, `getStaticDailyMacros`):** 82 kg → 1,697 kcal / 164 P; 81.2 → 1,689 / 162;
    62 → 1,506 / 124. Exactly the tester's three targets.
  - "7-day avg 62 kg" is `WeighInCard.tsx:62-64`, the mean of however many rows exist (here, one).
  - Not caught the same day, a typo stays in the 7-day mean for a week (and the rate window for two); the card
    can only write *today*, so a past entry cannot be corrected from any screen.
  - Side findings: the card says "Targets recalculate from your latest weigh-in" (`WeighInCard.tsx:95`) and the
    coach's floor says the same (`index.ts:3425`) — both contradict the 7-day/1 kg rule. `getEffectiveTargetWeightKg`
    takes "today" from `new Date().toISOString()` (UTC, `:149`) while the row is saved on the *local* date
    (`WeighInCard.tsx:49`); between midnight and 1 am UK summer time today's weigh-in is outside the window.
    Same-day snapshots also overwrite each other (`daily-tracking.ts:39`), so the 1,689 row was lost from history.
- **Prior rulings:** `BACKLOG.md:14620` — "Targets now anchor to a 7-day rolling average
  (getEffectiveTargetWeightKg) and only move once it's shifted ≥1kg from the average that last set the target; a
  real move surfaces a one-time dismissible notice." `CLAUDE.md:134` — "Targets from the profile, moved by a
  seven-day weight average, explained when they move". `nutrition-targets.ts:101-109` gives the threshold's
  reason (day-to-day noise is 1-2% of bodyweight). Nothing found on implausible entries (grepped `plausib`,
  `typo`, `implausible weigh`).
- **Fix:**
  1. MECHANICAL. Write the first anchor at onboarding: call `snapshotTargetsIfChanged(id, profile, targets,
     profile.weight_kg)` in `commitPlan`'s saved path and `setTargetWeightAnchorKg(profile.weight_kg)`.
  2. MECHANICAL. Stop a same-day weigh-in erasing the sign-up weight as the baseline (see L31).
  3. MECHANICAL. One shared `checkWeighIn(newKg, lastKg, daysSince)` in `src/lib` used by `WeighInCard`, the
     Profile weight field and (mirrored) `log_weight`; one "today" (`getLocalDateString(getAppNow())`) in
     `getEffectiveTargetWeightKg` and `snapshotTargetsIfChanged`.
  4. MECHANICAL. Card wording: "Targets follow your 7-day average" and "avg of N weigh-ins" until N ≥ 3.
  5. OWNER DECISION — the plausibility check itself.
- **Class:** MECHANICAL (1-4) + OWNER DECISION (5). CSCS basis for the threshold: real day-to-day change is
  water, food and salt, about 1-2% of bodyweight (the constant's own comment). More than ~3% in a day (2.5 kg
  for Sam) is almost never real; 19 kg is not.
  **Question for Ashley:** *If someone types a weight that is far from their last one, what should happen?*
  - A. Accept anything from 25 to 350 kg, as now.
  - B. Ask first when it is more than about 3% from the last weigh-in ("That's 19 kg lighter than this morning — is 62 right?"), and save only on yes.
  - C. B, and also don't move the calorie target on one surprising reading — wait for a second day that agrees.
  - D. Never ask, but only move targets once there are 3 weigh-ins in the week.
  - Recommend **C**: it costs one tap in the rare case and nothing otherwise, and matches the tester's pick.
- **Ships via:** frontend (all) + edge function `chat-gemini` (`log_weight` check and its wording). No migration.
- **Gates:** `test:target-change-notice` covers the *sentence* only (`scripts/test-target-change-notice.ts:4`
  imports `targetsMoved` and nothing else). `test:dashboard` covers `computeWeightTrend`. **No script reads
  `getEffectiveTargetWeightKg` or `TARGET_WEIGHT_ANCHOR_THRESHOLD_KG` — the ruling is UNGUARDED.** New: a logic
  gate for sign-up 82 → 81.2 (target holds) → 62 (asks, target holds) → 84 over three days (moves, notice says
  from/to); a `verify:` driver typing 62 into the card.
- **Risk:** someone who genuinely returns after months at a very different weight must be able to say "yes,
  that's right" in one tap; base the check on days since the last weigh-in too.
- **Confidence:** high on mechanism and numbers. Medium on *which* path left the anchor empty for Sam (no
  reload before the first weigh-in is the reading that fits 1,689 exactly).

---

### L31 · "-0.2 kg since week 1" measures from the first weigh-in, not the sign-up weight

- **Status:** CONFIRMED IN CODE.
- **Root cause (VERIFIED):** `Dashboard.tsx:481-482`:
  `weightDeltaKg = weightSeries[last].kg - weightSeries[0].kg`, and `weightSeries` is the **last 14 weigh-in
  rows** (`dashboard-data.ts:311`, `:321`). Two errors: (1) the sign-up weight is seeded as a weigh-in *dated
  today* (`App.tsx:1785-1791`), so a weigh-in on sign-up day overwrites it (one row per day) and 82 is gone from
  the series; (2) after 14 weigh-ins the baseline is "14 entries ago", while the label still says "week 1".
- **Prior rulings:** none found (grepped `since week 1`).
- **Fix:** baseline = `profile.weight_kg` (the starting weight, already loaded) or the earliest weigh-in ever
  (one `order asc limit 1` read), not `series[0]`. Label "since you started". For the seed collision, keep the
  sign-up weight as its own fact and don't rely on a same-day row.
- **Class:** MECHANICAL (the three words of label are Ashley's to approve).
- **Ships via:** frontend.
- **Gates:** `test:dashboard`. New check: 15 weigh-ins, baseline still the first.
- **Risk:** `profile.weight_kg` is editable in Profile ("Onboarding weight"), so an edit moves the baseline.
- **Confidence:** high.

---

### H9 · Adding 100 g banana replaced dinner and the snack

- **Status:** CONFIRMED IN CODE as designed behaviour that is undisclosed, with a ranking that prefers a new
  recipe over a re-portion.
- **Root cause (VERIFIED):** an added food makes a new option that is **pinned** to that slot and date
  (`meal-food-add.ts:131-139`). `assembleDay` then re-searches *every combination* of the other slots with the
  pin fixed (`meal-generation.ts:1647-1663`, `:1757`). Combinations are ordered by `betterOf`
  (`:1601-1612`): in-tolerance, back-to-back repeats, repeats, likes, recency, **`resized`**, fit.
  - Nothing in that order knows what the day was showing a second ago. There is no "keep today's dishes" key.
  - `resized` sits *below* variety and is a cost: a day that keeps the same dinner at a quietly adjusted size
    loses to any in-tolerance day made of different, un-resized dishes. So it **re-picks before it
    re-portions**. It only re-portions (one slot, the largest free one, 0.75-1.35×, `:1518-1519`) when no stored
    combination fits.
  - The card says "The rest of the day re-fits around it" (`meal-food-add.ts:122`) as an assertion; no trial is
    run, so it cannot name the meals. Same sentence in `custom-meal.ts:110`. The grocery list is left stale.
- **Prior rulings:** Ashley 3 Sep 2026 — "her food, at her amount … with the rest of the day re-fitted around
  it" (`meal-food-add.ts:12-14`). The 17 Sep refit ruling — "same meals, adjusted amounts, so the shopping list
  stays valid" (`CLAUDE.md:145-149`). The day-swap rule — "**THE CARD IS READ OFF A TRIAL, NOT ASSERTED** …
  Before the tap the card says: each day's dish, every OTHER meal that changes and WHY" (`CLAUDE.md:567-577`).
  So re-fitting is deliberate; changing recipes silently is not covered by any ruling, and the disclosure
  standard already exists for the newest meal tool and was never applied back to the older ones.
- **Fix:** (a) run the same before/after trial `buildMealDayMoveProposal` uses, for food-add, custom meal, food
  remove/replace/resize and meal swap, and list on the card each other meal that changes and whether it is the
  same dish resized or a different dish; (b) on an edit, pass the day's current dishes as incumbents and prefer
  "same dish, resized" over "different dish" for the free slots — a new key above variety *for edit-time only*
  (the nightly/next-day search keeps its variety order); (c) say when the shopping list needs rebuilding.
- **Class:** OWNER DECISION (already in the tester's table as #3). Options: A silently, as now · B re-portion
  the other meals, keep the recipes · C show the knock-on and ask. Recommend **B by default, C when a recipe has
  to change** — it is the 17 Sep ruling applied to edits. The trial card (a) is MECHANICAL either way.
- **Ships via:** frontend (the coach's card is built client-side from the same builder; no edge deploy needed
  unless prompt wording changes).
- **Gates:** `test:meal-food-add`, `verify:meal-food-edit`, `test:custom-meal`, `test:meal-days`,
  `test:meal-variety`, `test:meal-refit`, `test:meal-swap-rotation`. New: add a banana to lunch on a fixture
  whose dinner has ≥ 2 in-tolerance options; assert dinner's dish is unchanged or named on the card.
- **Risk:** an incumbent preference must not leak into ordinary day-to-day selection or variety drops again
  (the 19/27/28 Sep history). Keep it strictly to "the day being edited, at edit time".
- **Confidence:** high on mechanism; the exact dishes are data-dependent (seen once).

---

### H12 · "I don't eat pork" confirmed three times, saved only as a memory note; "mushrooms and pork" saved as "mushrooms"

- **Status:** CONFIRMED IN CODE (two gaps, plus a third silent one found on the way).
- **Root cause (VERIFIED unless marked):**
  1. **Onboarding has no route from a stated food exclusion to Foods to avoid.** Allergens have a prompt rule
     *and* a code backstop that scans every typed message (`ConversationalOnboarding.tsx:1078-1090`,
     `detectAllergenTags`). A non-allergen exclusion has neither. The prompt has an explicit rule for exercises
     ("EXERCISES THEY WON'T DO ARE AN ANSWER … the exact mirror of dislikedFoods",
     `onboarding-chat/index.ts:269`) but no matching sentence for foods said before the question is reached.
     The only "remember this" tool onboarding has is `record_context_fact` (`onboarding-chat/index.ts:101-115`), whose own
     prompt says "a context fact is memory only, never read by meal generation" (`index.ts:304`). So "I don't
     eat pork" went there — hence "Shapes how your Personal TrAIner talks to you — never your plan".
  2. **"Change Foods to avoid" is not a deterministic write.** For a text slot `handleEditSlot` only posts
     "Sure — type what you'd like foods to avoid to be instead." (`ConversationalOnboarding.tsx:1398-1415`).
     The typed answer goes to the model as an ordinary message; the slot changes only if the model calls
     `set_slot(dislikedFoods, …)` with the full list. Taps, numeric cards and exact chip labels are captured in
     code; text slots are "deliberately" excluded from that capture (`:287`). The model answered in prose ("no
     mushrooms, no pork") and the value stayed "mushrooms". Which of "no call" or "called with mushrooms only"
     happened is INFERRED — both leave the same screen.
  3. **Even a literal save would have enforced nothing.** `assembleProfile` splits on commas only
     (`onboarding-slots.ts:1093`), so "mushrooms and pork" becomes one dislike. Run (`h12.ts`): the phrase
     `"mushrooms and pork"` blocks **nothing** — not pork chop, bacon, ham or mushroom — while `"pork"` alone
     blocks pork chop, bacon, ham and gammon. A dead rule that looks saved.
  4. **Main chat (INFERRED to be a second trap, not what Sam hit).** `record_fact` with a food dislike *is*
     enforced (`index.ts:1569-1598`, "a food they dislike … is ALWAYS hard"). But the prompt also says: "Never
     again, in anything is a DISLIKE — **you cannot set those**, so say the Profile screen holds their
     foods-to-avoid list" (`index.ts:2443`). That contradicts the tool, and Promise 2 ("The coach acts; it never
     sends anyone to a control", `CLAUDE.md:897`).
- **Prior rulings:** "ASHLEY'S RULING: 'treat it as don't serve it.' … Every food dislike is now a filter, at
  either hardness. *Nobody names a food they dislike hoping to still be served it.*" (`BACKLOG.md:13524`).
  The August onboarding ruling for the identical bug with allergies — "allergy disclosed during onboarding was
  only saved as a memory note while the coach said it would be filtered … Ashley approved the thorough option —
  AI told to apply the restriction, plus a code-level backup that scans messages and applies it independently of
  the AI" (project memory, onboarding notes; the backstop is the code at `ConversationalOnboarding.tsx:1068-1090`).
  **So the rule already exists: a stated food exclusion is an enforced avoid, and it is held in code, not left
  to the model.** H12 is that rule never having been extended from allergens to plain exclusions in onboarding.
- **Fix:**
  - Onboarding prompt: one line mirroring the exercise rule — a food they say they don't/won't eat is
    `set_slot(dislikedFoods = everything already recorded + the new one)`, never `record_context_fact`.
  - Code backstop in the browser (the guarantee): a pure `detectFoodExclusions(text)` for "I don't eat X",
    "no X", "I won't eat X", "can't stand X", merged into `dislikedFoods` with a visible receipt, the same shape
    as the allergen backstop.
  - When a text slot is re-opened by the user, mark it pending and take the next typed message as its value in
    code, split on `,` / `and` / `&` / `/`.
  - `assembleProfile` and the Profile tag list split on the same separators.
  - Main chat: delete "you cannot set those" at `index.ts:2443`; route "never again" to `record_fact`.
- **Class:** SAFETY-ADJACENT (dietary enforcement — written plan before build) + OWNER DECISION on how much to
  ask. **Question for Ashley:** *When someone mentions in passing that they don't eat something ("I don't eat
  pork"), should the app…*
  - A. add it to Foods to avoid straight away and show a tick ("✓ Foods to avoid — pork"), so they can undo it;
  - B. ask first ("Want me to keep pork out of your meals?");
  - C. only remember it for conversation.
  - Recommend **A**: it is what the "treat it as don't serve it" ruling already says, and the tick makes a wrong
    catch visible at the moment it can be fixed.
- **Ships via:** frontend (backstop, split, re-open capture) + edge function `onboarding-chat` (prompt) + edge
  function `chat-gemini` (line 2443). No migration.
- **Gates:** `test:onboarding-corrections`, `test:onboarding-conversational`, `test:onboarding-slots`,
  `test:onboarding-exercise-dislikes` (the mirror, a good template), `test:food-dislike-is-a-ban`,
  `verify:onboarding-walk`, `test:coach-rules-sync`. New: the phrase list above → enforced dislike; "mushrooms
  and pork" → two dislikes that each block their food; re-open + type → saved without any model call.
- **Risk:** a phrase detector can over-catch ("I don't eat much fish"); keep it to plain negations and always
  show the receipt. "Pork" as a word-match catches bacon/ham/gammon but not unlisted pork products — the
  honesty rule on word-matching still applies to what the coach may say.
- **Confidence:** high on 1-3 (read and run); medium on exactly what the model sent at the re-open turn.

---

### H13 · Onboarding says "We will absolutely keep your meals entirely tree-nut free"

- **Status:** CONFIRMED IN CODE — the honest rule is already *in* the onboarding prompt; three things work against it.
- **Root cause (VERIFIED):**
  1. The shared `ALLERGEN_HONESTY_BLOCK` (`_shared/coach-rules.ts:44-55`) is interpolated into onboarding
     (`onboarding-chat/index.ts:300`) with "use the framing above (what the app actually did, never a safety
     guarantee)" (`:302`). But every banned form in it is about a *verdict on a food* ("is safe", "is X-free",
     "won't contain"). A *promise about the plan* at the moment of disclosure is not named.
  2. The onboarding prompt itself uses guarantee language two lines later: "only a value on dietaryPreferences
     actually **keeps that food out of their meals**" and "All twelve are **enforced** by meal generation"
     (`:304`). The model echoed its own instructions.
  3. The few-shot that makes the main chat honest exists only in `chat-gemini` (`index.ts:2344-2351`:
     "…that's tag-matching against the ingredient list, not a lab check, so I can't call it verified nut-free").
     Onboarding has the rule and no example. The repo's own lesson: a bare prohibition does not hold without a
     concrete example.
  4. **The app's own receipt over-promises too**, in code, not model text: "✓ Flagged as a hard restriction, not
     just a preference — ${labels} will be kept out of every meal." (`ConversationalOnboarding.tsx:1085`). With
     the label "Nut-free" that prints "Nut-free will be kept out of every meal" (also L3's grammar slip).
  - Side finding: the shared block still says "Celery, sesame, mustard, lupin, and sulphites have NO tag
    mechanism at all, full stop" (`coach-rules.ts:47`) while the onboarding prompt says they "now have real tags
    too" (`:304`). One prompt, two opposite statements.
- **Prior rulings (the ruling exists):** `VISION.md:128-131` — "Allergens. The app filters ingredients it
  recognises. It cannot verify brands, preparation or cross-contamination, and it says so. It never claims a
  food 'is safe' or 'is X-free'." The live honesty copy: "These filters check ingredients we recognise. We can't
  check brands, preparation, or cross-contamination." (`SlotChipsCard.tsx:171`, `ProfileScreen.tsx:1275`) and
  "Ingredients are filtered, not verified. Check labels if you have an allergy." (`MealPlan.tsx:409`,
  `GroceryList.tsx:551`). The exam's hard rule `allergen-verdict` (`docs/coach-exam-rubric.md:45`).
- **Fix:** (a) add "a promise is a verdict in the future tense" to the shared block with a disclosure-time
  WRONG/RIGHT pair, e.g. RIGHT: "Noted — I've switched on your nut-free filter, so meals are built without
  anything tagged as nuts. It's a filter on ingredients, not a lab check, so still read labels."; (b) reword
  `:304` to "puts the filter on" / "filtered by meal generation"; (c) reword the receipt, e.g. "✓ Nut-free filter
  on — meals are built without ingredients tagged as nuts. Check labels yourself."; (d) fix the stale
  five-allergens line; (e) optional code guard on the onboarding reply for `(entirely|completely|absolutely|100%)
  … free` and "no X in your plan", swapping in the app's sentence.
- **Class:** OWNER DECISION on the exact sentences (what the app may claim is hers), inside an existing ruling;
  SAFETY-ADJACENT band. No new product question needed beyond approving the two sentences above.
- **Ships via:** edge functions `onboarding-chat` **and** `chat-gemini` (shared block) + frontend (receipt).
- **Gates:** `test:coach-rules-sync`, `test:onboarding-style`, `test:onboarding-conversational`,
  `test:coach-promises`, coach exam (`allergen-verdict` runs on the main chat only). New: source check that no
  app-authored onboarding string says "kept out of every meal"; an onboarding exam case for a disclosed allergy.
  Whether the model obeys stays an exam question, not a gate.
- **Risk:** the exam goes stale when the shared block changes (`coach-exam-fresh`); re-run it.
- **Confidence:** high on the sources; the model's sentence itself cannot be traced further.

---

### H16 · "Change tomorrow's dinner to salmon and cut the chicken down to once a day" → refused; chicken part ignored

- **Status:** CONFIRMED IN CODE (refusal reproduced with Sam's numbers).
- **Root cause (VERIFIED, `h16.ts`):** a named dish goes through `buildMealAdditionProposal` →
  `verifyProposal` (not keep-portions) → one proportional scale to the slot's calories
  (`portion-scaler.ts:123-139`) → hard checks: calories ±7% and `meetsProteinFloor`, which is
  `actualProtein >= targetProtein` with **no tolerance** (`portion-scaler.ts:89-91`,
  `meal-generation.ts:571-574`). Sam's dinner budget is 458 kcal / 44 g protein = 38% of calories from protein.
  Salmon on its own is 38%. Any side dish dilutes it:
  ```
  salmon + potato + beans + oil : post-scale 458 kcal, 30.7 g protein — missed 44 g   REJECTED
  salmon + quinoa + asparagus   : post-scale 457 kcal, 35.1 g                          REJECTED
  salmon + veg only             : post-scale 459 kcal, 42.8 g (1.2 g short)            REJECTED
  salmon alone, 220 g           : 458 kcal, 44 g                                       ACCEPTED
  cod + potato + beans          : 459 kcal, 56.6 g                                     ACCEPTED
  ```
  The builder returned the tester's sentence word for word (`meal-addition.ts:126-127`). So **no salmon dinner
  with a carb in it can ever be added for this person**; the limit is the per-meal floor plus a scaler that can
  only multiply every ingredient by one number (it cannot raise the fish and trim the potato — the library path
  can: "each dish is first re-portioned to the person's own meal (protein and carb foods only…)",
  `CLAUDE.md` meal-library entry).
  - **Chicken frequency: there is nothing to call.** Grepped `once a day`, `at most once`, `maxPerDay`,
    `protein variety`, `main protein`, `frequency` across `meal-generation.ts`, `meal-rotation.ts`,
    `meal-dish-identity.ts`, `chat-gemini`, `generate-meals`: no hits. Variety is counted by **dish**
    (`meal-dish-identity.ts`), so thirteen different chicken dishes score as full variety. The only levers are a
    like (sort key) and a dislike (total ban).
  - INFERRED, supported by the run above: chicken is in 13 of 14 meals *because of the same floor* — at 38%
    protein-of-calories only very lean proteins survive verification, and pork is excluded.
  - Run 2's salmon card came from a different tool (`propose_meal_food_replace`), which keeps portions, states
    the cost and offers swaps (Ashley's 12 Sep ruling). Two tools, two answers to "can I have salmon".
- **Prior rulings:** "When a change works AGAINST the goal, the app asks first, then allows — **it never
  refuses anything that is not unsafe**" (`CLAUDE.md:812-813`, 14 Sep, written for exercise edits; the meal
  section is headed "mirrored from exercise, because meals are plans too"). 12 Sep: "a removal states what it
  costs and offers 2-3 verified swaps". Custom meals already keep the user's portions and re-fit the day
  (`meal-generation.ts:471-477`). Nothing found on protein frequency.
- **Fix:**
  1. For an *asked-for* dish, try the library's two-lever re-portion before refusing.
  2. If it still misses, do not refuse: pin it at the slot's calories, let the day re-fit (the pin path already
     exists), and put the cost on the card from a trial — "dinner comes in 13 g under on protein; lunch goes up
     to cover it" or "the day ends 9 g short".
  3. Handle a two-part message as two things: card for the salmon, and for the chicken either a new preference
     or an honest "I can't cap that yet, but I can swap these three dinners" — never silence.
  4. New soft rule "no more than N meals a day built on the same main protein": needs a main-protein tag per
     dish (first `protein`-category ingredient by grams) and a key in the day search, plus protein spread asked
     of the meal writer.
- **Class:** OWNER DECISION (#5 in the tester's table: A refuse · B do it and show the cost — recommend **B**,
  it is the 14 Sep rule applied to food) + COACHING for the rest. CSCS basis: daily protein is what drives the
  outcome; an even split per meal is a convenience, and ~0.4 g/kg per meal (33 g for Sam) is already a full
  dose, so a 31-35 g salmon dinner with the day made whole elsewhere is a sound plan, not a compromised one. A
  same-protein cap is also sound (variety and adherence), provided it is a preference that yields to the targets.
- **Ships via:** frontend (builder, trial, search key) + edge function `chat-gemini` (prompt: two requests, the
  cap) + edge function `generate-meals` if the meal writer is asked for protein spread. No migration if the cap
  is stored as a fact.
- **Gates:** `test:meal-addition`, `test:coach-promises`, `test:question-not-a-card`, `test:custom-meal`,
  `test:meal-variety`, `measure:meal-repeats`, `test:soft-preferences`. New: Sam's dinner + a salmon-and-potato
  dish → a card with a cost line, never the refusal; a week fixture asserting ≤ N servings of one protein a day.
- **Risk:** relaxing the floor for requested dishes must not relax it for *generated* pools (that floor is why
  days land on target). The cap can make a tight pool unservable; it must yield, and say so.
- **Confidence:** high on the refusal; medium on "the floor is why chicken dominates" (not measured across a pool).

---

### M20 · "37g dry penne pasta" with 19 g carbs for the whole dish

- **Status:** CONFIRMED IN CODE.
- **Root cause (VERIFIED, `m20.ts`):** `lookupIngredient('dry penne pasta')` → `pasta cooked` (alias `penne`,
  158 kcal / 31 g carbs per 100 g). The word "dry" is dropped. 37 g × 0.31 = **11.5 g carbs, 58 kcal**; dry
  pasta is about 27 g carbs and 130 kcal. The database is cooked-basis by design ("cooked weight for
  grains/meat/rice", `food-db.ts:13-15`) and has no dry pasta or rice. The meal writer is never told which
  state to use — rule 2 only gives examples (`generate-meals/index.ts:315`).
  - Same drop, other direction: `raw chicken breast` → `chicken breast` (cooked, 31 g protein/100 g; raw is
    about 22-23), `raw king prawns` → `prawns` (cooked), `uncooked basmati rice` → `basmati rice cooked`. A line
    that says "raw" is costed as cooked, so protein is **over**stated by roughly a quarter for anyone weighing
    as the recipe says. INFERRED as a population effect (not counted across real pools — they are in the
    database, which a cloud session cannot read).
- **Prior rulings:** the qualifier drop is a recorded open defect for allergens ("almond-crusted cod" → cod;
  `coach-rules.ts:49`, project memory "THE BIGGEST OPEN DEFECT"). Nothing on cooked/dry state (grepped `dry
  pasta`, `cooked weight`, `raw weight`).
- **Fix:** (a) add dry/raw entries for the staples (pasta dry, rice dry, chicken breast raw, salmon raw, prawns
  raw, mince raw); (b) make resolution state-aware: a state word in the line (dry, dried, uncooked, raw, cooked)
  must agree with the matched entry or the line is a miss — never silently the other state; (c) tell the meal
  writer one convention and show that on the card.
- **Class:** COACHING (nutrition accuracy — decided: people weigh pasta and rice dry and meat raw, so show and
  cost those states; it is how every food label and tracker works) + SAFETY-ADJACENT plan because it edits
  `lookupIngredient`.
- **Ships via:** frontend (database, resolver) + edge function `generate-meals` (prompt) + the edge food-db copy.
- **Gates:** `test:meal-log`, `test:food-db-parity`, `test:diet-tag-sync`, `measure:meal-library`,
  `test:meal-roundtrip`. `test:meal-quality` needs a live database (never runs in cloud). New: every line in
  `meal-library-data.ts` and a list of generated-style lines resolve to an entry of the stated state.
- **Risk:** existing saved meals are re-costed on read; targets-fit shifts for dishes with "raw"/"dry" lines.
- **Confidence:** high.

---

### M23 · Grocery: "white rice cooked ~650g", "pasta cooked ~300g", "rye crispbread ~5g", oat flour → plain flour

- **Status:** CONFIRMED IN CODE (four causes).
- **Root cause (VERIFIED, `m20.ts`):**
  1. The row's name is the database key: `displayName: entry.name` (`grocery-store.ts:262-263`). Hence "white
     rice cooked", "pasta cooked".
  2. The amount is the summed **cooked** grams (`:760-770`); nobody buys 650 g of cooked rice (that is about
     230 g dry).
  3. "rye crispbread ~5g": "5 rye crispbreads" parses as a bare count (unit `whole`,
     `portion-scaler.ts:197-200`); crispbread has no piece weight, so `unitToGrams` returns **5 grams** — the H6
     default again. The snack is also costed at 16 kcal of crispbread instead of about 160.
  4. `lookupIngredient('oat flour')` → `plain flour` (alias `flour`; no oat flour entry). Wrong name on the
     list, plain-flour macros, and a gluten tag an oat recipe may not deserve.
- **Prior rulings:** purchase units are display-only by design (`food-db.ts` `purchaseUnit` comment);
  water is skipped as un-shoppable (`grocery-store.ts:753-758`). Nothing on cooked/dry.
- **Fix:** a shopping name and a cooked→as-bought factor per entry (rice ≈ ×0.36, pasta ≈ ×0.45), applied in
  `resolveGroceryTarget`; piece weights for countable foods (crispbread ≈ 10 g, bread slice, tortilla, fillets);
  an `oat flour` entry; and H6 fix 1 so an unknown count is flagged, not turned into grams.
- **Class:** MECHANICAL.
- **Ships via:** frontend. Existing saved rows refresh on the next Rebuild.
- **Gates:** `test:grocery`, `test:grocery-display`, `test:grocery-screen`, `verify:grocery`. New: no generated
  row's name contains "cooked"; no counted food under 5 g.
- **Risk:** `canonical_key` is the database name and is UNIQUE per profile; change the *display* name and
  conversion only, never the key, or rows duplicate.
- **Confidence:** high.

---

### L26 · Grocery empty until Rebuild; eggs under Meat & Fish, butter under Dry Goods; "blueberries is in the trolley"

- **Status:** PARTLY — the empty list is DELIBERATE DESIGN; the aisles and the toast are confirmed.
- **Root cause (VERIFIED):**
  - Empty: nothing builds the list unasked. The empty state says so: "Your list is empty. It fills from your
    meal plan — tap Rebuild above, or add an item by hand." (`GroceryList.tsx:435-438`). The gap that stands: a
    brand-new user is told to *Re*build a list that was never built.
  - Aisles: `CATEGORY_MAP` sends every `protein` to `meat_fish` and every `fat` to `dry_goods`
    (`grocery-store.ts:225-234`); the only exceptions are legumes and dairy-tagged proteins (`:245-249`). Egg is
    `protein`, butter is `fat` → Meat & Fish, Dry Goods. Tofu also lands in Meat & Fish.
  - Toast: `{toast.name} is in the trolley` (`GroceryList.tsx:593`) — "is" after a plural name.
- **Prior rulings:** "The list is not rebuilt behind her back (her refit and top-up rulings)"
  (`CLAUDE.md:577-578`); "nothing rebuilds the list on its own" (grocery page entry, 27 Sep).
- **Fix:** eggs → Dairy (relabel "Dairy & Eggs"); `fat` + `contains_dairy` → Dairy; soy/quorn proteins → their
  own or Dry Goods; toast "Blueberries — in the trolley"; first-run button "Build my list".
- **Class:** MECHANICAL (aisles, grammar) + small OWNER DECISION: *should the first shopping list build itself
  when the first plan is made?* A no, keep the tap (relabel it) · B yes, once, at sign-up only. Recommend **A
  with the relabel** — it keeps her "never behind her back" rule with no exception.
- **Ships via:** frontend.
- **Gates:** `test:grocery`, `test:grocery-screen`, `verify:grocery`, `test:app-tour` §9.
- **Risk:** aisle change moves existing rows on next Rebuild only.
- **Confidence:** high.

---

### L18 · Quantities nobody can measure ("1.3 tsp", "0.8 tsp", "119g liquid egg whites", "239g raw king prawns")

- **Status:** CONFIRMED IN CODE (reproduced: one 0.795× scale gives 0.8 tsp, 119 g and 239 g together).
- **Root cause (VERIFIED):** `scaleIngredients` (`portion-scaler.ts:69-82`) multiplies every line by one factor
  and rounds grams to the nearest 1 and spoons to one decimal. There is no kitchen rounding anywhere after it.
- **Prior rulings:** none found (grepped `1.3 tsp`, `kitchen`, `round to`). The method rule shows the concern
  is known: amounts are stripped from recipes because they are rescaled (`generate-meals/index.ts:319`).
- **Fix:** round **at scale time**, then re-cost (the code already recomputes after scaling,
  `meal-generation.ts:566`): grams to 5 above 50 g and to 1 below 20 g; spoons to quarters, shown as ¼ ½ ¾;
  counts stay whole. Do it in `scaleIngredients` so every path (generation, refit, move, library fit) agrees,
  and the number on the card is the number costed.
- **Class:** COACHING (decided): 5 g on a 240 g portion is 2% — well inside the ±7% slot band and far inside the
  error of a home scale; a quantity people can actually weigh improves adherence more than the lost precision costs.
- **Ships via:** frontend.
- **Gates:** `test:meal-roundtrip`, `test:meal-refit`, `test:meal-move`, `test:meal-food-edit`,
  `test:meal-library`, `measure:meal-library` (servable rate must not fall), `test:meal-variety`.
- **Risk:** rounding can tip a borderline dish out of tolerance; measure servable % before and after.
- **Confidence:** high.

---

### L19 · Ingredient swaps match macros, not food ("65g lime", "80g avocado" for blueberries)

- **Status:** CONFIRMED IN CODE (the two figures follow from the arithmetic for ~50 g of blueberries).
- **Root cause (VERIFIED):** `suggestReplacements` (`meal-food-edit.ts:301-304`) takes every food in the same
  database *category* and sorts by "is it in any of her meals" first, then macro distance. `fruit` contains lime,
  lemon and avocado (`food-db.ts`: avocado is category `fruit`). Lime is in Sam's "Mexican Lime and Cilantro
  Chicken", so pantry-first put a marinade ingredient at the top for pancakes. The grams clamp (0.5-2.5×) does
  not catch it. The function's own comment records the same failure for protein: "the first build offered
  anchovies and beef jerky in place of a chicken breast" (`:281-284`) — pantry-first fixed that case and caused
  this one.
- **Prior rulings:** Ashley 12 Sep 2026 — "TWO OR THREE SPECIFIC SWAPS THAT CLOSE THE GAP" (`:243-246`).
- **Fix:** a swap group per food (berries, citrus/seasoning, sweet fruit, leafy veg, starchy veg, lean meat,
  oily fish, cooking fat …); only same-group foods are candidates; seasoning-type foods are never offered; the
  candidate's main macro must equal the removed food's; pantry-first applies within the group.
- **Class:** COACHING (decided: a substitute must do the same job on the plate, not only in the numbers).
- **Ships via:** frontend (data + one function).
- **Gates:** `test:meal-food-edit`, `verify:meal-food-edit`. New: for ten everyday foods, every offered swap is
  in the same group; blueberries never offer lime or avocado.
- **Risk:** fewer suggestions for odd foods — an empty list is already the designed honest outcome (`:256-258`).
- **Confidence:** high.

---

### L20 · "ON THE NUMBER" at 179 of 164 g protein, "MACROS OFF" at 181; past days can't be opened

- **Status:** CONFIRMED IN CODE (label) · DELIBERATE DESIGN (past days).
- **Root cause (VERIFIED):** `MealPlan.tsx:628-635` has its own definition: calories within 30 kcal **and**
  protein within ±10% **and** carbs within ±10% (fat not checked). 164 × 1.10 = 180.4, so 179 passes and 181
  fails. The engine's definition of a correct day is different: calories ±5%, protein −5% to +15% (156-189 g),
  carbs and fat ±25% (`meal-generation.ts:1229-1233`, `:1268-1275`). So the screen calls a day "macros off"
  that the engine chose as on target, and can call a day "on the number" with fat 40% out.
  Past days: the strip is today plus six by ruling (`CLAUDE.md:225-230`); eaten history lives in the meal ledger
  with no screen.
- **Prior rulings:** "Fix 4.6 (ux-sweep)" comment at `MealPlan.tsx:619-627` (why protein and carbs were added).
  Strip ruling 27 Sep 2026. No ruling on a history view.
- **Fix:** export one per-macro verdict from `meal-generation.ts` and have `TotalsHero` call it; when off, name
  the macro ("protein 17 g over") instead of "macros off".
- **Class:** MECHANICAL. Past days: OWNER DECISION, not a bug — *do you want to be able to look back at what was
  eaten on earlier days?* A not now · B a read-only "earlier" end on the strip. Recommend B later; it is new work.
- **Ships via:** frontend.
- **Gates:** `test:meal-roundtrip` and `test:app-tour` mention the label; nothing checks the threshold. New:
  the label and `dayWithinTolerance` agree across a grid of totals.
- **Risk:** none beyond wording.
- **Confidence:** high.

---

### L28 (+ L8) · "Protein is behind — 162g to go" before breakfast; "Water is behind — 2000ml to go" at 8:30; "no meals logged yet" at 07:01; "1850ml behind on water" seconds after sign-up at 21:53

- **Status:** CONFIRMED IN CODE — three pacing rules, only one of which has a clock.
- **Root cause (VERIFIED):**
  - Nutrition line: `macroShortfallLine` (`macro-shortfall.ts:52-70`) compares eaten against the **whole-day**
    target and speaks when ≥ 34% is still outstanding. It takes no time. Before breakfast 100% is outstanding,
    so it always says "behind". Its own comment — "Being a little under at 4pm is the normal shape of a day" —
    describes a clock the function does not have. Protein first, then water once protein's share shrinks, is
    its "only the widest" rule working as written.
  - Home amber line: `if (ledger.eaten.kcal === 0) gaps.push('no meals logged yet')` (`dashboard-data.ts:503`),
    no time condition.
  - Home water tip: `water_pace` (`coach-tips.ts:120-141`) *is* clocked — pro-rata 08:00-22:00, quiet before
    10:00. At 21:53: 2,000 × 13/14 = 1,857 → "about 1850ml". True arithmetic, but it counts a day the person was
    not a user for. It reads `new Date().getHours()` (`dashboard-data.ts:491`), not the app clock.
- **Prior rulings:** `coach-tips.ts:101` — "ASHLEY'S OWN EXAMPLE: 'You're 1,200 ml behind on water target for 12
  PM.'" So the water tip is hers and deliberate; the first-day case was not considered.
- **Fix:** one `expectedByNow(target, now, wakeWindow)` used by all three. "Behind" only when under what was due
  by now (meals: only slots whose usual time has passed; water: the existing pro-rata). Before anything is due,
  say what is left, not "behind" ("162 g of protein to come today"), or stay quiet. No pace line on the day the
  account was created.
- **Class:** MECHANICAL for the missing clock + OWNER DECISION on when it speaks (hers by standing rule).
  **Question for Ashley:** *Should the app say you're "behind" on food or water (A) only once the time for it
  has passed, (B) never — just show what's left, (C) as now?* Recommend **A**, with the first day left quiet.
- **Ships via:** frontend.
- **Gates:** `test:nutrition-layout` §2 (thresholds only), `test:dashboard` (water tip). New: same inputs at
  07:00 / 12:00 / 20:00 give silence / silence-or-left / behind; account created today → silence.
- **Risk:** harness has one fixed "today" (`.tour-harness/anchor.mjs`); the clock must come from the app clock.
- **Confidence:** high.

---

## Shared choke points

1. **`unitToGrams` — "unknown unit means grams"** (`food-db.ts`, both copies). One line produces H6 (eggs,
   latte), M23 (crispbread 5 g), the poisoned coverage figure, and wrong macros on any generated dish that
   counts a food with no piece weight. Fix once, in both copies, and add piece weights.
2. **`lookupIngredient` — words it cannot account for are thrown away** (both copies). H6 (dish → tortilla), M20
   (dry → cooked), M23 (oat flour → plain flour), the recorded allergen qualifier drop, **and one new
   safety finding outside my list**: when the query is *shorter* than a known name the longest known name wins,
   so bare `chicken` resolves to **`seitan strips`** (alias "meat free chicken pieces") and bare `sausage` to
   `vegan sausage`. Run (`diet.ts`): an ingredient line "chicken" **PASSES** the vegetarian, vegan and halal
   checks, and is costed at 370 kcal / 75 g protein per 100 g. "chicken pieces" passes too. Not in BACKLOG
   (grepped `seitan strips`). SAFETY-ADJACENT; needs its own plan.
3. **Two food databases** (`src/lib/food-db.ts` vs `supabase/functions/_shared/food-db.ts`), diverged both ways,
   guarded by a gate that compares allergen tags only. The coach and the screen can cost the same words
   differently (266 vs 417 kcal).
4. **Three definitions of "on target"**: the engine's bands, the Nutrition label's own ±10%, and the coach
   prompt's 25/35/30/10 meal budgets against the engine's real ones. L20, the "594" in H6, part of H16.
5. **A card that asserts instead of trialling**: H9 (food add), and the same sentence in custom meal. The
   day-swap builder already does it properly.
6. **Things the model is trusted to write that the app could write itself**: H12 (text slots, food exclusions),
   H13 (the app's own receipt). The allergen backstop is the pattern to copy.
7. **No clock in pacing**: L28 / L8, three rules.
8. **The anchor that is never written at sign-up**: H10 and L31 both come from the first day's weigh-in row.

## Owner decisions (plain language, one each)

| Bug | Question | Recommend |
|---|---|---|
| H6 | Bought/restaurant food the app has no recipe for: ask, estimate-and-label, or decline? | Estimate and label; take their number if they have one |
| H10 | A weigh-in far from the last one: accept, confirm, confirm-and-hold-target, or need 3 readings? | Confirm, and hold the target for a second day |
| H9 | May one meal edit change other meals? (tester's #3) | Re-portion by default; show and ask when a recipe must change |
| H12 | "I don't eat pork" in passing: save now with a tick, ask first, or only remember? | Save now with a tick (matches "treat it as don't serve it") |
| H13 | Approve the two honest sentences (coach example + app receipt) | Approve; ruling already exists in VISION |
| H16 | Asked-for meal that misses the macros (tester's #5); and should "chicken at most once a day" be a thing the app can hold? | Do it and show the cost; yes, as a preference that yields to targets |
| L26 | Build the first shopping list automatically? | No; relabel the button "Build my list" |
| L28 | When may the app say "behind"? | Only once the time for it has passed; quiet on day one |
| L20 | A way to look back at earlier days' food? | Later; new work |

## Suggested build order

1. **H6 mechanical set** (unit default, merge the two databases + behavioural parity gate, plausibility stop,
   delete prompt line 2503, show `unmatched`, "Assumed:"). Smallest change, biggest trust gain; also fixes the
   crispbread half of M23. Needs the `chat-gemini` deploy.
2. **H10 mechanical set** (write the anchor at sign-up, one "today", shared check function, honest label) and
   L31 — then the confirm step once Ashley rules.
3. **Written plan for `lookupIngredient`** (dish-as-ingredient, state words, the `chicken` → seitan finding,
   oat flour) — SAFETY-ADJACENT, then build; carries M20 and the rest of M23.
4. **H12 + H13 together** (one plan, both edge functions + the browser backstop and receipt).
5. **H9 + H16** (trial-based cards for every meal edit; cost-not-refusal; then the protein cap).
6. **L20, L28/L8, L18, L19, L26** — independent, frontend only, any order.

Deploys: `chat-gemini` (1, 2, 4, 5), `onboarding-chat` (4), `generate-meals` (3, 5); everything else ships with
the web build. No migration is needed for anything above.
