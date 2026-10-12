# Plan: the ingredient lookup must not throw words away

**Status: BUILT 11 Oct 2026** on Ashley's "Build all four" (her 9 Oct ruling, item 3). Section
10 at the end is the review of this plan against the 11 Oct tree, the decisions taken while
building, what was left for her, and the measured before/after. Sections 1-9 are the plan as
written on 9 Oct and are kept as written.

**Original status: PLAN ONLY.** Written 9 Oct 2026 by the builder of the H6
"typed meals logged far too low" fix, on the instruction to stop at the plan: the function
this changes (`lookupIngredient`, `src/lib/food-db.ts`) also decides which allergen and diet
tags an ingredient carries, so it is safety-adjacent and gets a plan before a build.

It covers four test-log bugs that share one cause — H6 (the rest of it), M20, M23 (oat flour)
and the tracer's new safety finding (bare "chicken" resolves to seitan).

---

## 1. What is wrong, in one sentence

When the lookup cannot account for every word in an ingredient's name, it keeps the words it
recognises and silently discards the rest — so a **dish** is costed and tagged as **one of its
ingredients**, a **dry** food as its **cooked** form, and a **short** name as whichever longer
name happens to contain it.

## 2. Reproduction

Run against the tree as it stands after the H6 amounts fix (commit of 9 Oct 2026). Each line is
`lookupIngredient(<phrase>)`; kcal is per 100 g; tags are the entry's own.

### A. A dish stands for one of its ingredients

```
chicken caesar wrap    -> tortilla wrap   (310 kcal; gluten)         an EMPTY tortilla
tuna mayo sandwich     -> mayonnaise      (680 kcal; egg)            no fish, no gluten
cheese and ham toastie -> ham             (107 kcal; meat, pork)     no dairy, no gluten
egg fried rice         -> egg             (155 kcal; egg)
peanut butter cookie   -> peanut butter   (588 kcal; nuts)           no gluten, egg or dairy
almond croissant       -> almonds         (579 kcal; nuts)           no gluten, no dairy
salmon sushi roll      -> salmon          (208 kcal; fish)
whole milk latte       -> milk whole      (61 kcal; dairy)        [11 Oct: now its own row, see 10b]
egg mayonnaise         -> egg
avocado toast          -> avocado         (160 kcal; no tags)        no gluten
almond-crusted cod     -> cod             (105 kcal; fish)           NOT nuts
honey mustard chicken  -> mustard         (66 kcal; mustard)         not meat
prawn cocktail         -> prawns          (99 kcal; shellfish)       not egg (the sauce is mayonnaise)
sausage roll           -> pork sausage    (296 kcal; meat, pork, gluten)   not dairy
beef lasagne, chicken tikka masala, cheese pizza, fish and chips, chicken soup, beef burger -> NO MATCH
```

The misses on the last line are the honest outcome. The matches above are the defect.

This is what logged a chicken caesar wrap as 186 kcal on 9 Oct. The amounts fix means the
**latte** in that meal is now asked about, but **a wrap logged on its own is still a confident
186 kcal card today**. That is the part of H6 this plan is for.

### B. A state word is dropped

```
dry penne pasta        -> pasta cooked         (158 kcal; dry pasta is about 355)
uncooked basmati rice  -> basmati rice cooked  (121 kcal; dry is about 350)
dried red lentils      -> lentils red          (116 kcal, the cooked figure; dry is about 320)
uncooked quinoa        -> quinoa cooked        (120 kcal; dry is about 370)
raw chicken breast     -> chicken breast       (165 kcal / 31 g protein, the COOKED figure; raw is about 110 / 23)
raw king prawns        -> prawns               (cooked figure)
raw salmon fillet      -> salmon               (cooked figure)
```

A "dry" line is under-costed by more than half (M20: "37g dry penne pasta", 19 g carbs for the
dish). A "raw" line is over-costed by about a third, protein included.

### C. The query is shorter than a known name — the longest name containing it wins

```
chicken         -> seitan strips   (370 kcal, 75 g protein; gluten; NOT meat)   via alias "meat free chicken pieces"
chicken pieces  -> seitan strips
fish            -> fish sauce      (43 kcal)
cream           -> cream cheese    (342 kcal)
cheese          -> ricotta cheese
nuts            -> cashews
beans           -> black beans
mince           -> beef mince 5% fat
```

And what the diet check says about an ingredient line reading just `chicken` (run today):

```
chicken   vegetarian: PASSES   vegan: PASSES   pescatarian: PASSES   halal: PASSES   kosher: PASSES   gluten-free: blocked
```

**A line that says "chicken" passes the vegetarian and vegan checks.** `sausage` did the same
until 9 Oct (it resolved to vegan sausage); it now resolves to pork sausage in the COSTING
lookup, but the diet check was deliberately left reading the names as stored (section 6), so on
the diet check **`sausage` still passes vegetarian today**. Both are fixed by this plan, not before it.

### D. A qualifier changes the food

```
oat flour / almond flour / coconut flour / rice flour -> plain flour   (wheat; gluten)   M23
spring onions     -> onion            (the singular "spring onion" is right; the plural loses "spring")
corn tortillas    -> sweetcorn        (the singular "corn tortilla" is right)
potatoes          -> mashed potato    (dairy)  via the alias "instant mashed potatoes"
coconut water     -> water            (0 kcal)
water chestnuts   -> water            (0 kcal)
almond milk yoghurt -> almond milk
oyster mushrooms  -> mushroom         (right food, by luck: a tie decided by insertion order)
salt and pepper to taste -> bell pepper
sweet potato fries -> sweet potato baked
```

### How the three passes produce this (`lookupIngredientUncached`)

1. Exact name or alias.
2. **Word-sequence, both directions**: a known name whose words appear in order inside the
   query, OR the query's words inside a known name. Longest known name wins; ties go to
   whichever was inserted first. Nothing asks what the leftover words were. This is A and D
   (known inside query) and C (query inside known).
3. Token overlap: every word of a known name appears somewhere in the query. Same blindness.
4. Only if all three miss: de-pluralise the query and retry. So "spring onions" never reaches
   "spring onion" — pass 2 has already matched "onions".

## 3. The proposed rule

**Every word in the name must be accounted for, or it is a miss.** A miss is not a failure:
`computeMealMacros` lists it as not counted, the coverage floor refuses a meal that is mostly
unknown, and the diet check refuses an unresolved ingredient for every restriction. That
machinery already exists and is the safe direction.

In order:

1. **Exact** name or alias. Unchanged.
2. **Exact after de-pluralising** each word (both the query and the stored key). Moves the
   plural retry AHEAD of the fuzzy passes, so "spring onions" and "corn tortillas" reach their
   own entries. (The stored-side half of this exists since 9 Oct.)
3. **Known name inside the query, with a residue test.** Take the longest known name whose
   words appear in order. The words left over must ALL be on a short written list of words
   that do not change what the food is:
   - preparation: grilled, baked, roasted, steamed, boiled, poached, pan-fried, toasted, chopped,
     diced, sliced, grated, shredded, mashed (only when the entry is not itself a mash), crushed;
   - description: fresh, frozen, lean, extra lean, skinless, boneless, plain, ripe, large, medium,
     small, baby, whole (when not part of a name), organic, free range;
   - cut or form of the same food: fillet, fillets, breast (only after a poultry name), strips,
     pieces, chunks, florets, leaves, halves, slices, rashers;
   - glue: of, and (only between two residue words), the, a, with (never — see below).
   Anything else is a miss: `caesar`, `tikka`, `cookie`, `croissant`, `sandwich`, `latte`,
   `crusted`, `cocktail`, `roll`, `oat`, `almond`, `coconut`, `water` … are not on the list, so
   every line in A and D above becomes a miss or, where a real entry exists, that entry.
   **"with", "and", "in", "on" between two foods mean two foods**: "chicken with rice" is a miss
   for the same reason a dish is.
4. **Token overlap with the same residue test.** Keeps "cooked white rice" = "white rice cooked".
5. **The query inside a longer known name is REMOVED as a pass.** It is the whole of C. What
   replaces it is data, reviewed one line at a time: a `generic` alias only where every
   candidate the short word could mean carries the same allergen tags, and the commonest form
   is the one named. Proposed: `chicken` -> chicken breast, `mince` -> beef mince 20% fat (what a
   UK shopper means), `rice` -> white rice cooked, `milk` -> milk semi skimmed, `yoghurt` ->
   natural yoghurt, `bread` -> white bread, `oil` -> olive oil, `flour` -> plain flour (exists).
   Deliberately NOT given a generic: `fish`, `cheese`, `cream`, `nuts`, `beans`, `sausage`
   (pork vs vegan differ on meat), `burger`. Those become a miss, and the coach asks which.
6. **State words must agree with the entry.** Each entry is cooked, dry, raw or not-applicable
   (most are not-applicable). `dry`, `dried`, `uncooked`, `raw`, `cooked` in the query must match
   the entry's state, resolve to a sibling entry of that state, or be a miss — never silently
   the other state. New sibling entries for the staples: pasta dry, wholewheat pasta dry, white /
   basmati / brown rice dry, couscous dry, quinoa dry, red and green lentils dry, chicken breast
   raw, chicken thigh raw, salmon raw, cod raw, prawns raw, beef mince raw (5% and 20%).
   The convention for meal cards and the shopping list (people weigh pasta and rice dry and
   meat raw) is the tracer's COACHING call in M20 and is built in the same change.
7. **New entries the misses will ask for**: oat flour (not wheat; gluten-tagged because oats are
   cross-contaminated unless certified — fail-safe), almond flour (nuts), coconut flour, rice
   flour, coconut water, water chestnuts. And the two toast aliases held back on 9 Oct:
   `toast` / `white toast` -> white bread, `wholemeal toast` / `whole wheat toast` / `brown toast`
   -> wholemeal bread. They were NOT added with the amounts fix because under today's matcher
   `toast` would turn "french toast" from a miss into plain white bread (no egg, no dairy). Under
   rule 3 they are safe, so they land here.

Ties are decided by a written order (more words, then more of the query covered, then name),
never by insertion order.

## 4. Every caller, and what changes for it

`lookupIngredient` (the costing lookup) and `lookupIngredientAsStored` (the diet check's, see
section 6) are one function over two indexes; the rule above goes into the shared function.

| Caller | Uses it for | What changes |
|---|---|---|
| `food-db.ts` `computeMealMacros` | costing every meal: generation, library, refit, custom meal, food add, the coach's log_meal (through the generated copy) | dishes and wrong-state lines stop being costed as something else; they are listed as not counted |
| `diet-rules.ts` `validateMealAgainstDiet` | allergen and diet tags; **unresolved = refused for every restriction** | more refusals (dishes), fewer false passes (`chicken`, `sausage`, `almond-crusted cod`); switch it back to the one lookup once this lands |
| `meal-generation.ts` `verifyProposal` | coverage floor (80%) then the diet check | proposals with a dish-as-ingredient line lose coverage and may be rejected |
| `meal-generation.ts` `steeringLikes` | is a liked phrase a food at all | a liked DISH name is no longer mistaken for an ingredient (correct) |
| `meal-ingredients.ts` `tagsFor` | category dislikes ("no fish" reaches salmon through tags) | a dish line stops inheriting one ingredient's tags; category dislikes on a dish then rely on the word match alone |
| `meal-library.ts` | costing and fitting the 188 library dishes (requires coverage = 1) | any dish with a line that newly misses drops out of the library until the line is rewritten |
| `grocery-store.ts` `resolveGroceryTarget` | the list row's key, name, aisle, grams | **the row key is the entry name** and is UNIQUE per person: a line that re-resolves changes key. Keep the key stable for existing rows (resolve, then keep the stored key if the row exists) |
| `grocery-display.ts` | purchase unit for display | follows the row's name |
| `meal-food-edit.ts` `suggestReplacements` | what a removed food was | a line that newly misses offers no swaps (already the designed empty state) |
| `portion-scaler.ts` `parseIngredientLine` | "a banana" -> one banana (9 Oct) | unaffected in kind |
| `MealFoodAddSheet.tsx` | reads `FOOD_DB` directly (search list, units) | new entries appear in the search |
| `supabase/functions/_shared/food-db.ts` | the coach's log_meal | generated from the app's file; nothing separate to do, but **`chat-gemini` must be redeployed** |
| `supabase/functions/generate-meals` | does not import the database; its prompt names ingredient conventions | prompt: say the dry/raw convention and that each line is ONE food |
| `supabase/functions/chat-gemini` prompt | "Extract ONLY what the user actually stated" | unchanged; a dish becomes a miss, and what the coach does then is the open owner question (section 8) |

Gates that read these paths and must be run, and where a pinned old answer must be re-anchored
on purpose: `test:meal-amounts`, `test:food-db-parity` (its three "agreement only" phrases
become pinned answers; section 6 is rewritten), `test:meal-log`, `test:diet-tag-sync`,
`test:allergen-hidden-forms`, `test:food-dislike-is-a-ban`, `test:custom-meal`,
`test:meal-addition`, `test:meal-food-add`, `test:meal-food-edit`, `test:meal-library` and
`measure:meal-library`, `test:meal-roundtrip`, `test:meal-refit`, `test:meal-variety`,
`test:meal-likes`, `test:kept-meal-restriction`, `test:soft-preferences`, `test:grocery`,
`test:grocery-display`, `test:grocery-screen`, `verify:grocery`, `verify:meal-food-edit`,
`verify:meal-log-card`, `test:coach-promises`, `test:bundle`, `test:no-dead-code`,
`test:functions-deployable`. `test:meal-quality` needs a live database and only runs on
Ashley's machine. New gate: the tables in section 2 as assertions (a dish is a miss; a state
word never resolves to the other state; a bare `chicken` never passes vegetarian), with the
residue list read from the source so a word cannot be added without the gate seeing it.

## 5. How the meal-pool impact would be measured, before anything ships

The risk is real and has a number that nobody has yet: a stricter lookup rejects more meals.

1. **Offline, in a cloud session, same commit before and after:**
   - the 188 library dishes (401 ingredient lines): how many lines change entry, how many newly
     miss, and `measure:meal-library` servable % per target shape (must not fall; rewrite the
     dish line where it does);
   - every ingredient string in the repo's fixtures and drivers (about 190 strings);
   - the 10,827-phrase corpus used on 9 Oct (every stored name and alias, its singular and
     plural, nine preparation prefixes, three form suffixes, every single word): classify each
     change as same / different food / newly a miss / newly a match, and for every change list
     the allergen tags gained and lost. A lost tag on a phrase that still matches is a finding
     to read by eye, every one.
   - the diet verdict grid: phrases x 22 restrictions (238,194 verdicts on 9 Oct). Report every
     verdict that flips from refused to passes. The target is zero, except the reviewed generics.
2. **Against real meal pools, on Ashley's machine, read-only on the TEST project:** dump every
   stored pool option's ingredient lines; run old and new lookup over them; report per person
   and per meal how many stored options would (a) change calories by more than 7%, (b) drop
   under the 80% coverage floor, (c) newly fail that person's diet check. A pool that would fall
   under three servable options for any meal is a blocker, not a footnote.
3. **Live generation, TEST project:** `test:meal-quality` before and after — accepted options per
   request, the rejection reasons histogram (coverage / diet / scale), and time to a full pool.
   If acceptance falls by more than a few points, the fix is the meal writer's prompt (one food
   per line; name the state) before the lookup ships, not a looser rule.

Stop points: after step 1 (report, no merge), after step 2 (Ashley sees the pool numbers).

## 6. What 9 Oct already changed, so this plan starts from the truth

The H6 fix merged the two copies of the food database into one. The coach's copy had extra
singular keys ("prawn" for "prawns", "rice cake" for "rice cakes") that the app's did not.
Bringing them into the app's COSTING lookup changed 106 of 10,827 corpus phrases: 88 that were a
miss now match (including dishes: "prawn cocktail", "sausage roll", "peanut sauce"), 18 resolve
to a different food (bare "sausage": vegan sausage -> pork sausage; "butter bean": butter ->
butter beans; "egg noodle": egg -> egg noodles).

On the diet check a new match is a WEAKER answer than a miss, so the diet check was kept on the
names exactly as stored (`lookupIngredientAsStored`): all 238,194 verdicts are identical to
before the merge, held by `test:food-db-parity` section 6. The cost of that caution is named
here so it is not lost: the diet check still has the old `sausage -> vegan sausage` reading, and
still over-refuses harmless singulars ("1 rice cake" for a vegan). Rule 2 and rule 5 fix both;
after this plan is built the diet check goes back to the one lookup.

## 7. Risks

- **Fewer servable meals.** Every dish-like or wrong-state line becomes a miss; a miss costs
  coverage and is refused outright for anyone with a restriction. Measured in section 5 before
  shipping. The library's 188 dishes need coverage of exactly 1.
- **Stored meals are re-costed when read** (refit, day assembly). A stored dinner with "raw
  chicken breast" changes by about a third. Days already on target can move off it. Measure
  on-target % across the variety fixtures and real pools.
- **Kept and hearted meals** are re-checked against restrictions at display time; a newly
  unresolved line marks the meal as clashing and it stops being served (her 27 Sep ruling
  working as written, but on meals that were fine yesterday). List them before shipping.
- **The shopping list's row keys** (above): duplicates or orphaned rows if keys move.
- **The residue list is a judgement.** Too short and ordinary lines miss ("oven-baked",
  "tinned"); too long and it becomes the hole again ("crusted" must never be on it). Derive it
  from the corpora in section 5, review every word, and gate it.
- **The coach asks more often.** A dish with no entry is a miss, and what the coach does with a
  miss is section 8. Until that is ruled, the coach can only say it does not know the dish.
- **Generics are a product choice dressed as data** — `chicken` meaning chicken breast is a
  guess about what the person meant. Each generic is listed for review, none is implicit.
- **Speed.** The lookup is memoised and the day search calls it thousands of times; the residue
  test must stay inside the memo.

## 8. Owner questions this plan depends on (not answered here)

1. *When someone logs something the app has no recipe for — a shop-bought wrap, a coffee-shop
   latte, a takeaway — what should the coach do?* (A) ask what was in it or what the pack says,
   and log their figure marked as theirs; (B) estimate from a typical version, shown clearly as
   an estimate, and let them overwrite it; (C) say it cannot put a number on that and log
   nothing. The tracer recommends B, falling back to A. **Today, after rule 3, the answer would
   be C by default** — which is safe and unhelpful.
2. *When a recipe or a person says just "chicken", "mince" or "milk", may the app assume the
   commonest kind and say so, or must it ask?* Recommendation: assume and say so ("Assumed:
   chicken breast"), the way the card already prints assumptions — but only for the reviewed
   list in rule 5.

## 9. Order of work once approved

1. The measurement scripts of section 5, run on today's code (the baseline).
2. Rule 2 (plural order) and the tie-break. Smallest, fixes "spring onions" and "corn tortillas".
3. Rule 5 (remove query-inside-known; add the reviewed generics). Closes `chicken` -> seitan.
4. Rule 3 and 4 (the residue test). The large one; re-measure after it.
5. Rule 6 and the new entries (states). Carries M20 and the dry/raw convention on cards.
6. Point the diet check back at the one lookup; delete `lookupIngredientAsStored`.
7. Re-measure everything in section 5; BACKLOG; `chat-gemini` and `generate-meals` deploys.

---

## 10. Review against the 11 Oct tree, and the build

### 10a. What changed under this plan since it was written

- The amount reader (`ingredient-units.ts`) and the piece-weight resolver (`resolveAmount` in
  `food-db.ts`) were merged on 11 Oct. Neither touches name resolution: `computeMealMacros`
  calls `lookupForLine` → `lookupIngredient` exactly as this plan assumed. The merge left two
  gates red before this work started (`test:ingredient-units` 6 of 42, `test:meal-amounts` 2 of
  264; both about amounts, both reconciling the two amount fixes, neither about names). This
  build holds their failure lists constant and does not try to reconcile them.
- `toast` / `white toast` → white bread and a separate `french toast` entry landed on 10 Oct
  (her ruling "toast counts as bread"), so rule 7's toast half is already done.
- The grocery half of M23 (shopping names and the cooked-to-bag factor, `AS_BOUGHT`) and the
  crispbread piece weight are already built. What remains of M23 here is oat flour.
- The stored-plural index block in `food-db.ts` is present twice (a merge artifact; the second
  copy is a no-op). Removed with this change.

### 10b. Decisions taken while building (mechanical or under the CSCS/nutrition delegation)

1. **Rules 1-4 and the tie-break are built as written.** The residue list is a constant in
   `food-db.ts` (`HARMLESS_WORDS`), read by the gate from the source.
2. **Rule 5: the query-inside-a-longer-name pass is removed. NO generics are added.** The
   generics are a product choice (owner question 2 below); the safe default is that a bare
   "chicken", "fish", "cheese", "mince" is a miss: not counted in a meal's numbers, and refused
   for anyone with a restriction. Bare words that were already an exact name or alias ("pasta",
   "bread", "milk"...) are unaffected.
3. **Rule 6, states, built narrowly where the numbers are badly wrong**: a "dry"/"dried"/
   "uncooked" line against a cooked grain, pasta or pulse, and a "raw"/"uncooked" line against a
   cooked lean meat or fish. Each goes to a new sibling entry of that state, or is a miss. Read
   off this table's own figures, two staples the plan listed are NOT cooked figures: `salmon`
   (208 kcal, 20 g protein) and both `beef mince` entries are RAW figures already, so "raw
   salmon fillet" and "raw beef mince" were right all along and are left alone. "Cooked" against
   a raw-figure entry is not enforced (fat fish and mince change little per 100 g; the aliases
   "baked salmon", "grilled salmon" already say so). Dried FRUIT is a different food from fresh,
   so "dried mango" against `mango` is a miss, never fresh mango.
4. **New entries** (per 100 g, as recalled from USDA FoodData Central and cited in the file so
   they can be checked): dry pasta, wholewheat pasta, white, brown and basmati rice, couscous,
   quinoa, red and green lentils, egg and rice noodles; raw chicken breast, chicken thigh, cod
   and prawns; oat flour, almond flour, coconut flour, rice flour, coconut water, water
   chestnuts. The dry figures are the ones `AS_BOUGHT` already uses for the shopping list, so
   the two cannot disagree. A dry line goes on the shopping list under the same row as its
   cooked twin ("pasta"), at its own weight.
5. **Oat flour is tagged gluten** (fail-safe), as the plan said. This changes no gluten-free
   verdict: "oat flour" resolved to plain flour (gluten) before and is refused either way. Plain
   `oats` are untouched: whether oats pass the gluten-free filter is her open question.
6. **The diet check goes back to the one lookup** (rule 9.6) once the measurement showed no
   phrase moving from refused to passes that was not reviewed (10d).

- **A latte has its own row (found by `verify:meal-log-card`, after the sweep).** Table A's
  "whole milk latte -> milk whole" was a silent read the old lookup got roughly right by accident;
  the stricter one refused "latte", so "a large latte" in chat became "I don't know it". Added
  `latte whole milk`, DERIVED from this table's own whole milk (about 85% milk by weight, espresso
  near 0 kcal): 52 kcal, 2.7 g protein, 4.1 g carbs, 2.8 g fat per 100 g, dairy-tagged, no size of
  its own (so "a large latte" is asked about, as before). An oat, soy, almond or skimmed latte is a
  MISS, never this row. `test:ingredient-lookup` §8 (3 checks; 4 mutations, 3 caught, the fourth an
  equivalent mutant that showed a "whole milk latte" alias was redundant, so it was deleted).

### 10c. Owner questions (not decided here; the safe version is built)

1. Bought or restaurant food with no recipe (H6): unchanged, and now more often reached — a
   dish name is a miss, so the coach can only say it does not know it.
2. A bare "chicken", "mince", "milk" in a recipe or a log: assume the commonest kind and say so,
   or ask? Built: neither is assumed (a miss). Recommendation unchanged: assume and say so, for
   a reviewed short list.
3. Oats and oat flour and the gluten-free filter (from N2): left as they were.

### 10d. Measured before and after (same process: the 58fbc675 lookup frozen beside the new one)

Section 5 step 1, run in this cloud session. Steps 2 and 3 (her real stored pools on the TEST
project, and live generation) need her machine and have NOT been run: they are the stop point
before release.

- **The library: 1,578 ingredient lines (219 distinct names) in 290 dishes. 0 change food,
  0 newly miss.**
- **Corpus, 12,292 phrases** (every stored name and alias, its plural or singular, 11
  preparation prefixes, 3 form suffixes, every single word, the plan's tables, the library
  names): 11,475 the same, **703 now a miss** (dishes, bare words, wrong-state lines, corpus
  nonsense like "dry chicken breast"), 1 newly a match ("chilli flakes", a new entry), **113 a
  different food**, of which 12 lost a tag, every one read by eye and each a correction ("almond
  flour" is no longer WHEAT flour; "vegan sausages" were costed as PORK sausage; "potatoes" were
  mashed potato, with dairy; "spring onions" were onion).
- **Diet verdicts, 270,424** (the corpus x 22 restrictions): **1,719 moved from refused to
  passes, across 100 phrases: 85 are the singular of a stored food** ("chickpea", "prawn", "red
  lentil": the 9 Oct plan's "harmless singulars") **and 15 are the right food at last**
  ("chicken" was seitan, so it now passes gluten-free and FAILS vegetarian; "rice flour" no
  longer carries wheat's gluten tag). None is a dish. 14,029 moved the safe way (passes to
  refused): the newly-missed phrases, refused for every restriction.
- **Writer-style and fixture lines** (610 strings from every script and driver, plus about 200
  lines a meal writer commonly uses): 49 change. 15 newly miss and each is meant to: bare words
  with no single meaning ("sausages", "fillets"), dishes ("eggs and toast", "rice cakes with dark
  chocolate"), and fat-level or product variants with no entry yet ("reduced fat feta", "low fat
  greek yoghurt", "red thai curry paste", "tomato puree"). The first cut missed 64; the other 49
  were ordinary lines that missed only for a gap ("light soy sauce", "brown onion", "tinned
  chickpeas", "a pot of natural yoghurt") and were closed with reviewed aliases, the amount
  words, five light entries and a chilli/chili fold, never by loosening the rule.
- **Bare words (rule 5), built as the neutral version.** Making every bare word a miss would have
  changed what the app does today for "milk", "rice", "tuna" (fixtures across four gates use
  them, and so, presumably, do real meals), which is a decision, not a fix. So the app keeps
  assuming what it assumed before for a reviewed list where every candidate shares the allergen
  tags (`GENERIC_NAMES`: chicken, rice, milk, tuna, mince, oil, whey), changes only "chicken"
  (seitan was the unsafe answer), and makes the rest a miss (fish, cheese, cream, nuts, beans,
  sausage, yoghurt, burger).
- **Found by the measurement, fixed:** chicken and beef broth carried NO tag, so meat stock
  passed vegetarian (now `contains_meat`).
- **Found, NOT changed, recorded:** "greek yogurt" (US spelling) is the FULL-FAT entry while
  "greek yoghurt" has always reached the 0% one. Folding the spellings would re-cost every Greek
  yoghurt in every meal by about 40 kcal per 100 g, so both answers are kept as they were and the
  disagreement is left for a decision. The chat's receipt for sesame, celery and mustard still
  says "there's no tag for it in the food data" (now an understatement: those tags exist on a
  few foods); its wording is hers.
