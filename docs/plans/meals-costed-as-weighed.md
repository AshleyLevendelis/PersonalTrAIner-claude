# Plan: a meal is costed in the state its card tells her to weigh it

**Status: BUILT 15 Oct 2026** (H32, run 7 of the live-app test, 14 Oct 2026). Sections 1-8 are
the plan as written before the build; section 9 is what the build measured and decided.

Owner's words: *"each ingredient must be counted in the same state the card tells me to weigh it.
Then measure across the whole meal library and the 188-dish library: how many dishes are
affected, and by how much."* It touches calorie numbers, so it is planned before it is built.

---

## 1. What is wrong

A dinner card read **"Greek Chicken Souvlaki with Herbed Couscous"**, listing **177g raw chicken
breast** and **53g dry couscous**, with **459 kcal · 64P · 20C · 13F**. Weighed as written, the
dish is about 520-540 kcal, ~53 g protein, ~45-49 g carbs.

The two lines, through the real code (measured, not reasoned):

| | kcal | protein | carbs | fat |
|---|---|---|---|---|
| pre-11-Oct lookup (git 45264e98), what was stored | 351 | 56.9 | 12.2 | 6.5 |
| today's lookup, the same stored lines | 412 | 46.6 | 41.0 | 4.9 |

The other lines of her dish account for the rest (459 - 351 = 108 kcal), so the card is exactly
the pre-fix costing, and the corrected dish is about 520 kcal, 54 g protein, 49 g carbs.

## 2. Cause

The **lookup is already right**. Since 11 Oct (`docs/plans/ingredient-lookup-truth.md`, rule 6;
merged to `main` 12 Oct) "raw chicken breast" reaches `chicken breast raw` and "dry couscous"
reaches `couscous dry` (`STATE_TWINS`, `src/lib/food-db.ts`).

The **card does not ask the lookup**. Every meal's numbers are worked out once, when it is made
(`verifyProposal`), and stored with it (`meal_plan_slots.macros`). `readPools`
(`src/lib/meal-store.ts`) hands the stored numbers straight to every reader: the card, the day's
header and verdict, the day search (`assembleDay`, which decides what she is served), the refit
and top-up offers, the coach's context, and Profile's hearted list. Stored numbers are only
recomputed when a dish is resized. So a pool made before the fix reached her phone, or by an edge
function still running the old copy of the food table, keeps its old numbers for as long as it is
kept; and a heart or a meal asked for by name is kept for ever.

The 11 Oct plan named this risk as if it were already handled ("Stored meals are re-costed when
read (refit, day assembly)", its section 7). Measured now: they are not. Only a RESIZED dish is
re-costed; one served at its stored size never is.

It is wrong in BOTH directions, and that matters for the person:
- a **raw** meat line was costed as cooked meat: about 1.35x too much energy and protein;
- a **dry** grain or pulse line was costed as cooked: about 2.4-3.3x too little energy and carbs.

## 3. The inverse gap (checked as asked)

A food whose figures describe one state with no twin for the other is costed in the wrong state
when a line names the other one. Read off the table today:

- RAW figures, no cooked twin, and "cooked X" was costed raw: salmon, both beef minces, chicken
  mince, fresh tuna steak, trout, red snapper, squid, scallops, oysters, chicken liver, taro.
- COOKED figures, no raw twin, and "raw X" / "dried X" was costed cooked: duck breast, venison,
  split peas, barley.
- Already right: every entry in `ENTRY_STATE` (cooked meats, fish, beans, grains) misses a state
  it has no figures for ("raw lamb chop", "dried chickpeas" are asked about, never costed).
- Left alone, and why: an entry whose figures I cannot place in one state with confidence
  (turkey, lamb and pork mince; brisket; pork belly; gammon; lobster; crab), or where the state
  changes the numbers by under about 10% (yam, plantain, potato, edamame). Marking one wrongly
  would make the RIGHT state word a miss.

## 4. Options

1. **Re-cost a stored meal from its own lines whenever it is read** (one function, in the one
   read). Every reader then sees the numbers the app would give the dish if it were made today.
2. Re-cost and WRITE BACK the corrected numbers. Rejected: a write on every read is a write
   nobody asked for, and the read would then fail differently offline.
3. A one-off repair script on her machine. Rejected as the fix: it repairs today's rows and not
   tomorrow's (a kept meal, an edge function on an old copy), and nothing would notice the next one.
4. Leave stored numbers and re-cost only on the card. Rejected: the card would disagree with the
   day header, the day search and the coach, which is the worse defect.

**Chosen: 1.** The inverse gap is closed in the lookup's own state table: a line naming the state
the figures do not describe is a miss (asked about), never costed in the wrong state.

## 5. The design

- `src/lib/meal-costing.ts`, `costStoredMeal(ingredients, stored)`: `computeMealMacros` over the
  stored lines. **If every amount is understood and the costed share is at least the floor a new
  meal must meet (`MIN_COVERAGE`, 80%), the re-costed numbers are used; otherwise the stored
  numbers are kept, whole.** Never a mix of the two, line by line. The floor is the same one
  `verifyProposal` applies, so the card always shows numbers the app would accept for a new meal,
  or the old ones untouched; it never shows a dish missing a fifth of its food.
- `MIN_COVERAGE` moves into that module (`meal-generation.ts` imports it from there) so the two
  cannot drift.
- `readPools` calls it for every row. That is the ONE read of stored meals, so the card, the day
  totals and verdict, the day search, refit, top-up, the coach and Profile all see the same
  numbers. A row kept at stored numbers is logged once per read, not shown (see section 8).
- Performance: the re-cost runs once per pool read (load, regenerate, top-up), not per render. A
  pool is about 30 options of 4-7 lines, and the lookup is memoised. No per-render cache needed.
- Resized, refitted and library-fitted options already re-cost from their lines with the same
  function, so after this every number on screen comes from one costing.
- `food-db.ts` `ENTRY_STATE` gains the entries in section 3; the shared copy for the edge
  functions is regenerated (`sync-shared-code.mjs`, held by `test:food-db-parity`).

## 6. What changes on screen

The meal card's numbers, the day header's totals and verdict, which dish the day search picks
for a day, and whether a refit or top-up is offered: for a stored meal with a raw or dry line
costed the old way. Her H32 dinner reads about 520 kcal · 54P · 49C · 11F instead of 459 · 64 ·
20 · 13. Nothing else moves: a meal whose lines cost the same reads the same. **No new message.**

Not changed: what she has already LOGGED as eaten (history is permanent, and it is the number she
logged); the stored rows themselves; the ingredient lines, the grocery list, the method.

## 7. CSCS review (nutrition at the population level the app already works at)

1. **Training effect / intake.** The numbers she eats against become what the food delivers. On
   the H32 dinner the old card over-stated protein by about 10 g and under-stated carbs by about
   29 g; a day of such meals reads "on target" while delivering less protein and more energy than
   it says. Re-costing makes the day search choose against the real food, so on-target days
   become on target in fact.
2. **What it takes away.** A stored day that read on target may now read off it, and the day
   search may serve a different dish, or the refit or top-up offer may appear. That is the app
   being honest about a day that was never on target; no meal is removed. A meal whose lines can
   no longer be read keeps its old numbers rather than losing food from the count.
3. **Fundamentals.** Protein floor, deficit and macro split logic are untouched; this changes the
   measurement they are compared with, not the targets.
4. **Floors and ceilings.** None redefined. `MIN_COVERAGE` keeps its value and its meaning, and is
   now one constant for two places instead of one.
5. **Scope.** Not clinical nutrition; no diet is prescribed. The diet and allergen check reads
   the same lookup: the section 3 entries become misses only for the state they lack figures for,
   and a miss is fail-closed (violates every active restriction), so no verdict can become more
   permissive. Checked over every diet (section 9).

## 8. Not covered, and questions for Ashley

- **Her own stored pools cannot be read from this cloud session** (no database). How many of HER
  meals move is unmeasured; the fix covers them by construction, the numbers below come from the
  library and a stand-in corpus.
- A stored line that was itself misread before 1 Oct (an ounce stored as a gram) cannot be
  repaired from the line; re-costing reproduces the misread. Named in the units plan; no live users.
- **Question (hers, what the app says):** should the card say so when a meal's numbers change
  ("worked out again from what's in it")? Built neutral: no message.
- **Question (hers, what the app says):** an unmarked line ("170g chicken breast", "150g salmon")
  does not tell her which state to weigh. The figures assume cooked for chicken, fish fillets,
  rice and pasta, and raw for salmon and mince. Should the card say "cooked" or "raw" on every
  such line? Built neutral: the card is unchanged.

## 9. Built, measured and decided (15 Oct 2026)

**Built as planned (section 5).** `costStoredMeal` in `src/lib/meal-costing.ts`, called once per
row by `readPools`; `MIN_COVERAGE` lives there and `verifyProposal` imports it; 16 entries added to
`ENTRY_STATE`; `_shared/food-db.ts` regenerated.

**Measured** (`npm run measure:meals-costed-as-weighed`; the pre-fix costing is simulated as
"drop the state word", and the simulation was checked against the real pre-fix code, git
45264e98, run on 14 Oct: same numbers on H32 and on all 290 library dishes):

- **H32.** The two lines: stored 351 kcal / 56.9 P / 12.2 C / 6.5 F, as weighed 412 / 46.6 / 41.0 /
  4.9. A whole reconstructed dish (the two lines plus tzatziki, cucumber, tomatoes, onion, oil):
  482 / 61 / 23 / 15 stored, **543 / 51 / 52 / 14 as weighed**, which matches her own estimate
  (~540 kcal, ~53 g protein, ~45 g carbs).
- **The library as written: 0 of 290 dishes affected** (the 188 of 30 Sep and the 102 lean of
  1 Oct alike). It carries no macros and writes meat, grains and pulses in the cooked state the
  table's figures describe; its only state-naming lines are 118 "cooked" lines and 2 "dried
  apricots" (no raw, dry or uncooked line at all), and every one reaches the state it names.
- **The same 290 dishes written the way the meal writer is told to** ("150g raw chicken breast",
  "75g dry pasta", same food at the same energy), as a pre-fix pool would have stored them:
  **149 of 290 dishes affected** (197 lines). Calories off by a median of 83 kcal (15%), 120 of
  the 149 by more than a new meal's 7% band; 97 under-counted (a dry grain), 52 over-counted (raw
  meat or fish). Protein off by a median of 5 g (worst 21 g over-stated); carbs under-stated by a
  median of 19 g (worst 46 g). Worst dish: 919 kcal stored for 646 as weighed. Every one of the
  149 is re-costed by the read (0 kept at stored numbers).
- **Her own pools: not measured** (no database from here). Model-written pools are the ones
  told to write raw/dry, so they are the affected population; the library is not.
- **Unmarked lines** on a food whose numbers depend on its state, in the library: 147 assume
  cooked (chicken, fish fillets, rice, pasta), 19 assume raw (salmon, mince), 14 dry (oats). This
  is the open question in section 8: the card does not say which.

**Decided under the CSCS delegation (nutrition at population level), basis recorded:** the floor
for re-costing is the floor for accepting a new meal (80% costed, every amount understood),
because the card should show either what the app would say of this dish today or what it said
then, never a dish with a fifth of its food silently missing. The 16 state placements are read
off the entries' own figures against USDA SR Legacy (cited in `food-db.ts`); where the figures
did not place the state with confidence, the entry was left alone.

**Not decided, hers:** the two questions in section 8 (say so when a meal's numbers change; say
the state on unmarked lines). Built neutral.

**Verified:** `test:meals-costed-as-weighed` (20 checks; 17 mutations, 17 caught, every check
seen failing at least once), `verify:meal-costed` (8 checks on the real Nutrition screen at
390x844; 8 mutations, 8 caught; screenshot read: the card reads 543 kcal · 51 P · 52 C · 14 F
under "177g raw chicken breast / 53g dry couscous", the day planned 1427 = the three rows).
