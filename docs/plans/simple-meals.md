# Simple meals by default

Ashley, 23 Nov 2026: *"Meal plans are the app's biggest weakness. The meals are too complicated. Users are required to
become gourmet chefs. It's not easy to put in your own meals. Days where you eat out it's not easy to add foods from a
restaurant menu in."* Asked what I would do, I proposed four improvements, biggest first (simple meals, fast logging,
eating out from the menu, adherence). He answered *"Do whatever you think is best"*. This file is the first of them.

## What was wrong, measured

- Our library: 725 dishes. The typical dish had **6 ingredients**, over half had 6 or more, and only **7 of 143 snacks**
  were one or two foods. Only 58 dishes said they were ready in 10 minutes or less.
- The meal writer (the `generate-meals` function, which makes the first seven dishes of every meal of a new plan) was
  told **"You are a chef"**, asked for names like **"Sichuan Mapo Tofu with Charred Bok Choy"** ("not Chicken and
  Rice"), told dinner is **"where the heavier, more involved dishes belong"**, and that a snack is 2-4 ingredients.
- The cooking-time answer (Quick / Moderate / Happy to cook, asked in setup, on Profile) steered almost nothing: a
  +2 score for a dish whose method says "ready in N minutes", which 58 dishes do.
- A new plan served **42%** simple meals and **4%** snacks of one or two foods (measure below).

## What "simple" means (`src/lib/meal-effort.ts`)

A dish a person makes on a weekday without a recipe:

- **five main foods or fewer** (a snack: **two**). Oil, salt, pepper, garlic, lemon, dried spices and herbs are not
  "main foods": the app's own "to taste" list plus cooking oils. Read off the food the line names, so "bell pepper"
  counts and "black pepper" does not;
- **nothing that makes it a recipe**: shaping (patties, balls), layering, a batter, a dough, a risotto stirred a ladle
  at a time, a marinade, a made sauce.

## What changed

1. **78 new simple dishes** in our library (`SIMPLE_EVERYDAY`): 36 snacks of one or two foods (yoghurt and berries, a
   protein shake, cottage cheese on rice cakes, jerky and grapes), 20 lunches (wraps, jacket potatoes, rice bowls,
   sandwiches), 22 dinners (salmon, rice and broccoli; steak, chips and peas; chicken fajita traybake). Plain names.
   Each passed every library rule (costed in full, served to at least one target in six, lean ones fitted at the lean
   targets); 24 first drafts were dropped (16) or changed (8) because they failed one. Simple dishes now: 127 breakfasts, 113
   lunches, 116 dinners, 45 snacks.
2. **Simple first.** Unless someone has said they love cooking, the library offers every simple dish before any
   recipe (a sort KEY, after "meat for meat eaters", before every score).
3. **Recipes are a minority** when a plan is filled from the library, by the cooking answer:
   - *Quick*: no recipes once a meal has 20 dishes;
   - *Moderate* (the default, and what applies with no answer): recipes up to a quarter of the meal, so about two of a
     week's eight dishes a meal are a proper recipe;
   - *Happy to cook*: no limit (as before).
   A thin meal (under 20 dishes) still takes a recipe, so a diet the simple dishes cannot feed keeps its choices.
   The quarter is read off what the meal HOLDS: measured, a meal keeps about 40 dishes, not the 100 allowed (each must
   land a day on target), so a quarter of the ceiling had been 60% of the meal.
4. **The meal writer** is told to propose simple food (five main foods or fewer, one pan or tray, nothing to shape or
   layer; moderate allows one recipe in four), plain names, dinner as "a protein, a carb and vegetables", snacks of
   one or two foods, and is no longer told it is a chef. **Needs the `generate-meals` deploy.**
5. **The choices say what they mean**: Quick "Simple meals, about 15 minutes"; Moderate "Mostly simple meals, the odd
   proper recipe"; Happy to cook unchanged.

## Measured (`npm run measure:simple-meals`)

A new plan through the app's own `generateMealPools` (the writer stood in by a spread of real library dishes), then 28
days served; 3 targets x 4 diets, three meals and a snack. Before = `main` at b11621d with the same script.

| cooking answer | simple meals served | 2-food snacks | days on target | dishes a meal over 4 weeks |
|---|---|---|---|---|
| Moderate, before | 42% | 4% | 94% | 20.1 |
| Moderate, after | **69%** | **57%** | 96% | 17.9 |
| Quick, before | 43% | 7% | 97% | 19.4 |
| Quick, after | **88%** | **68%** | 99% | 18.3 |

The cost is variety: about two fewer different dishes a meal over four weeks (a meal holds fewer dishes). Days on
target did not fall. The writer's own seven dishes a meal will be simpler once `generate-meals` is deployed; the
measure cannot see that (its writer is the library).

## CSCS / nutrition review (mine)

1. *Training effect*: none; this is food. *Nutrition effect*: unchanged. Every dish still goes through the same
   verification (diet, dislikes, the food table, the meal's calories and protein floor) and must land a day on target.
2. *What it takes away*: some variety (above), and fewer adventurous dishes. A complicated dish is never banned.
3. *Fundamentals*: protein targets, the day bands and the protein floor are untouched; days on target went up.
4. *Floors redefined*: none. "Simple" is a new measure, not a changed one.
5. *Scope*: general population food, inside the delegation.

## Not done (named)

- **An existing plan keeps its dishes** until "Regenerate all" on Nutrition or a top-up; nothing is rebuilt behind
  anyone (his refit and top-up rulings).
- **Changing the cooking answer on Profile does not offer new meals**: the next regenerate or top-up follows it.
- **Cook once, eat twice; the same breakfast most days; portions in whole packs and tins**: the next slice of this.
- **Fast logging** (barcode, branded foods, "type it like a text", recents), **eating out from the real menu** and
  **adherence** (protein-first success, an easy-meal button, a Sunday plan): the other three improvements, not started.

## Checks

- `test:simple-meals` (38 checks; 17 mutations, 17 caught): the definition, the library's depth, the chooser's order,
  the share rule where it binds, a real new plan per cooking answer, the writer's instructions and the choices' words.
- `test:meal-library`, `test:meal-library-depth` updated for the new block and the new loop.
- `measure:simple-meals`: the table above.
