# Plan: a food you say you don't eat goes into Foods to avoid, and setup stops promising what it cannot check

**Status: plan written 11 Oct 2026, then built the same day** (Ashley's 9 Oct ruling "Build
all four", told to build on 11 Oct). Items (1) and (2) of that ruling. Test log H12 and H13;
tracer D. Safety-adjacent (dietary enforcement), so this plan came first.

## 1. What is wrong

**H12.** Sam typed "I'm allergic to tree nuts, and I don't eat pork". The nut half was saved by
the app's own code (the allergen backstop). The pork half had no route: setup's only
"remember this" tool is a memory note that meal generation never reads, so Profile filed it as
"Does not eat pork — never your plan". Later, "Change Foods to avoid" with "mushrooms and pork"
typed in also failed: a text answer to an edit prompt is only saved if the model calls
`set_slot` with the full list, and it answered in prose. And even a literal save would have
enforced nothing: the list is split on commas only, so "mushrooms and pork" is one dislike that
matches no food (measured by the tracer: it blocks neither pork chop nor mushroom).

In the main chat, the prompt says of a "never again" food: "you cannot set those, so say the
Profile screen holds their foods-to-avoid list". The `record_fact` tool CAN set them (a food
dislike is always a ban, her 30 Aug ruling), so the prompt sends people to a control for
something the coach does itself.

**H13.** Setup said "We will absolutely keep your meals entirely tree-nut free", directly above
the app's own line that it cannot check brands or cross-contamination. Three causes:
- The setup prompt describes the filter in guarantee words ("actually keeps that food out of
  their meals", "All twelve are enforced"), and the model echoed them.
- The shared ALLERGEN HONESTY block bans verdicts about a FOOD ("is safe", "is X-free") but
  not a PROMISE about the plan at the moment of disclosure.
- The app's own receipt, in code: "✓ Flagged as a hard restriction, not just a preference —
  Nut-free will be kept out of every meal."
- Side finding, the "stale five-allergens line": the shared block still says "Celery, sesame,
  mustard, lupin, and sulphites have NO tag mechanism at all, full stop" and "Only SEVEN
  allergens have any real tag check", while the data carries those tags on 10 foods and the
  diet check enforces them. One prompt, two opposite statements.

## 2. Prior rulings this rests on (not new decisions)

- Ashley, 30 Aug 2026: a food dislike is "don't serve it" — every food dislike is a filter.
- Ashley, August (onboarding allergy): AI told to apply it AND a code-level backup that scans
  messages and applies it independently of the AI. This plan extends that backup from allergens
  to plain exclusions.
- Ashley, 9 Oct 2026, from the tracer's options: **save it straight away with a visible tick**
  (over asking first, and over only remembering it).
- VISION: "The app filters ingredients it recognises. It cannot verify brands, preparation or
  cross-contamination, and it says so. It never claims a food 'is safe' or 'is X-free'."
- Her 9 Oct ruling (2): setup uses **the honest wording the meal screens already use**:
  "Ingredients are filtered, not verified. Check labels if you have an allergy."

## 3. What gets built

### 3a. One pure module, `src/lib/food-exclusions.ts`

- `splitFoodList(text)`: "mushrooms and pork" → `['mushrooms', 'pork']`. Splits on `,` `;` `/`
  `&` `+`, the words `and` / `or` / `nor`, and newlines. Strips leading filler ("no", "any",
  "also", "I don't eat") and trailing ("please", "at all", "anymore").
  "none" / "nothing" / "no" → `[]`. AS BUILT: a "keep a known pair whole" rule was planned here and
  NOT built, because no food in the data is named with "and" today; if "fish and chips" is ever
  added it would be split, and that is the moment to build it. The splitter lives in its own file,
  `src/lib/food-list.ts`, so setup's profile builder (first-paint code) does not pull the detector
  onto first paint.
- `detectFoodExclusions(text)`: a plain negation about eating, followed by foods:
  "I don't / do not / won't / never / can't / cannot eat|have X", "I don't do X",
  "I don't like X", "I avoid X", "I can't stand X", "no X for me". The X is split with
  `splitFoodList`, and each piece is kept ONLY if it is a food: a name or alias in the food
  database (exact, after plurals), or one of the category words the avoid filter already
  understands through tags (pork, meat, dairy, fish, seafood, nuts, gluten, egg, red meat...).
  "I don't eat breakfast", "I don't like cardio" capture nothing.
- **Conservative on purpose**, because a wrong catch costs someone a food: a clause with a
  frequency or time qualifier is a habit, not a ban, and captures nothing — "I don't eat much
  fish", "I don't eat meat on weekdays", "I don't eat after 8pm", "I don't usually have
  bread". "Anymore", "at all", "ever" are bans and are kept.
- An item that is an allergen the allergen backstop already turned into a "-free" tag in the
  same message is left to that tag (no duplicate tick).

### 3b. Setup (onboarding)

- **Backstop**, beside the allergen one in `ConversationalOnboarding.tsx`'s send path, on every
  typed message: detected foods not already in Foods to avoid are merged into `dislikedFoods`
  (as a comma list) and a receipt is shown: `✓ Foods to avoid — pork`. Committed before the
  model is called, so the model sees it as already answered.
- **The model cannot silently drop it**: if the same turn's `set_slot(dislikedFoods)` from the
  model omits an item the app captured in code that very turn, the item is put back. Removing
  a food later still works (the summary edit, or a later turn).
- **Editing "Foods to avoid" from the summary is settled in code**, never by the model: the
  typed text is split with `splitFoodList` and saved as the new list, with the receipt, and the
  summary comes back. "None"/"nothing" clears it. (The tap-and-chip edits already work this way;
  text slots were the exception.)
- `assembleProfile` splits `dislikedFoods` with `splitFoodList` instead of commas only, so
  "mushrooms and pork" becomes two avoids that each block their food.
- Prompt (`onboarding-chat`): one line mirroring the exercise rule — a food they say they
  don't or won't eat is `set_slot(dislikedFoods = everything already recorded + the new one)`,
  never `record_context_fact`.

### 3c. Main chat

- Prompt (`chat-gemini`): "you cannot set those, so say the Profile screen holds..." is
  replaced with: a food they never want is `record_fact` (food_preference, dislike), which puts
  it in Foods to avoid; never send them to Profile for it.
- **Backstop in the browser**: after a turn, if the coach did NOT record a food dislike that
  turn, the same detector runs over what she typed; foods not already avoided are saved through
  the same write the Profile list uses (a hard food dislike) and a receipt shows
  `✓ Foods to avoid — pork`. A turn where the coach recorded one is left alone, so nothing is
  saved twice.

### 3d. Profile

- The "Foods to avoid" box splits what is typed with `splitFoodList`, so typing
  "mushrooms and pork" adds two tags.

### 3e. Honest wording (H13)

- The receipt in code becomes: `✓ Nut-free filter on. Ingredients are filtered, not verified.
  Check labels if you have an allergy.` The second sentence is the meal screens' own, word for
  word (her ruling). It lives in the phrasebook (`coach-voice.ts`) so a gate can read it.
- The setup prompt's guarantee words go: "only a value on dietaryPreferences actually keeps that
  food out of their meals" → "only a value on dietaryPreferences turns the meal filter on";
  "All twelve are enforced by meal generation" → "All twelve are filtered by meal generation".
- The shared ALLERGEN HONESTY block (in `_shared/coach-rules.ts` and its twin in
  `chat-gemini`) gains: a promise about the plan is a verdict in the future tense ("I'll keep
  your meals entirely nut-free", "absolutely no nuts in your plan" are banned), with a
  WRONG/RIGHT pair at the moment of disclosure. RIGHT: "Got it — I've switched on your
  nut-free filter, so meals are built without anything tagged as nuts. It's a filter on
  ingredients, not a lab check, so still read labels."
- The stale lines are corrected to what is true: twelve allergens have tags (the seven,
  shellfish combined, and celery, sesame, mustard, lupin, sulphites, which are tagged on the
  few foods in the data that carry them); the "almond-crusted cod → cod" line is replaced once
  the lookup plan (item 3) makes a dish name with unaccounted words a miss.
- A code guard on setup replies is NOT built (the tracer's optional (e)): replacing the model's
  sentence is a change to what the app says and when, and the receipt plus the prompt carry the
  ruling. Named here so it is not lost.

## 4. What it costs, and how it could go wrong

- **Over-catch** takes a food away from someone. Limited by: plain negations only, a food check
  on every item, qualifiers skip the clause, and a visible tick she can undo from the summary
  or Profile. Measured by a gate over a phrase list (both directions).
- **Under-catch** leaves the model as the second layer, as with allergens.
- A word-matched avoid only catches what its word and category tags reach: "pork" catches pork
  chop, bacon, ham and gammon through tags, not an unlisted pork product. The coach's honesty
  rules already say this and are not loosened.
- No migration: avoids are `user_facts` rows, as today.

## 5. Gates

- New `test:food-exclusions`: the split, the detector's catches and refusals (phrase lists in
  both directions), the summary-edit capture, `assembleProfile`'s split, and that each captured
  word actually blocks its food through the real avoid filter (`containsPhrase`), the property
  that failed in H12. Source checks: the backstop runs in both send paths and is called, the
  receipt uses the phrasebook, the model-drop guard is in place (AS BUILT: in setup the coach's
  reply can ADD to Foods to avoid and can never take a food off it; removing one is her own edit), the
  two prompts' lines.
- Existing, re-run: `test:onboarding-*`, `test:food-dislike-is-a-ban`, `test:coach-rules-sync`,
  `test:coach-promises`, `test:coach-voice`, `test:setup-answers`, `test:functions-deployable`,
  `verify:onboarding-turns` / `verify:onboarding-walk` (the receipt is visible).
- Mutation-tested, tried/caught counts in BACKLOG.

## 6. Deploys

Frontend on merge. `onboarding-chat` (prompt) and `chat-gemini` (prompt and shared block).
No migration.
