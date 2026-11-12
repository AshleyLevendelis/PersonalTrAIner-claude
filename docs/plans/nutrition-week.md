# Nutrition Week: the rings card, clearer meal rows, and the week ahead

His design handoff, approved 11 Nov 2026 in the design project (pages *Nutrition Numbers* and *Plan Views*).
Nutrition tab only. Presentation only: nothing new is stored, no new action, so coach/screen parity is unchanged.

## His choices (in the handoff)

- **N1, the rings card, option 3d**, in his words: "I want one circle with all the rings inside it like I used to have
  before, including water". It REVERSES his 17 Oct "rings live on Home only" for Nutrition. Home keeps its own rings.
- **M2 meal rows**: a split bar (each macro's share of the meal's energy) with the grams named in words. He rejected
  boxed tiles and plain text.
- **W1 + W3**: a future day tapped in the strip shows its PLANNED totals; a Week view shows the seven days on one
  screen. He rejected W2 (a long scroll of full day cards).

## What was built

- `src/lib/nutrition-week.ts` decides: the ring sizes (N1's table; W1 at 150px and W3 at 44px from one set of
  proportions), how full a ring is (over target, capped at 100%, no target no ring, water only when given), the split
  bar (protein and carbs x4, fat x9), left or over (the phrasebook's), and the week's heading.
- `src/components/nutrition/NutritionRings.tsx` draws: the nested circle and a meal's bar with its legend.
- `src/components/nutrition/NutritionWeek.tsx`: the planned card (W1) and the week view (W3).
- Today's card (N1) is in `NutritionDisplay`; "+ Water" opens the same quick-add the water cell did (his 17 Oct "water
  from Nutrition" holds).
- The strip's selected FUTURE day is violet; today selected stays mint.
- The add-a-day-to-the-list button moved into the planned card (it was under the list); an upcoming day's "Meals
  planned · verdict" line is now the card's (the same verdict, `dayVerdictLabel`).
- "Shop the whole week" opens the shopping list asking for 7 days, once (`openGroceryForDays`); the list picks it as
  its own day choice does: a different number rebuilds at once (his 8 Nov "Rebuild at once"), the same number leaves
  the list as it is.
- The coach's map of the Nutrition tab and the tour's Nutrition stop were brought up to date (the coach still described
  a calories bar and a water "cell"). Needs the `chat-gemini` deploy for the coach's half.

## Decided by me, named

- In the week view, a meal opens THAT DAY on the strip (where every control for it lives) rather than a recipe sheet
  inside the week. The design says "tap a day to open its meals"; it does not say what a meal does.
- The week view hides the strip and the targets row while open, as drawn; "Week ▴" closes it.
- The recipe sheet's header keeps its compact "P 42g C 72g F 18g" line; the handoff drew only the rows.
- Today's row in the week shows the same meals and total as today's list.
- The 44px rings are within 0.1px of the design (its two sizes are not one exact proportion).

## Found by the screen run, fixed

- The restriction warnings (a meal that breaks a food he avoids; a diet the app cannot honour) were pushed below the
  first screen by the taller card. They are now drawn at the top of the page, above the rings card (the meal list
  draws into a slot the screen gives it).
- Today's "Meals planned · verdict" line now sits just under the first screen; it is held to the head of today's meals.
- "+ Water" text deepened for the light themes.

## Checks

`test:nutrition-week` (40 checks), `verify:nutrition-week` (64 checks at 390x844, including the shopping list's
half on grocery.html). Re-anchored to the new card, each with the reversal said: `test:nutrition-layout`,
`test:nutrition-3a`, `test:one-page`, `test:day-as-shown`. Budgets moved in `test:bundle` with the measurement.
