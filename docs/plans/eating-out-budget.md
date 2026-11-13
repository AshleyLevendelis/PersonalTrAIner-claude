# Eating out, the strategy's half (strategy slice 5, 13 Nov 2026)

His strategy of 13 Nov 2026, slice 5: "I'm out Friday" holds back a budget, protein kept, the floor never breached; a
named restaurant or a menu photo gives 2-3 suggested orders, one reason each; the next meal returns to the plan with
no compensation; the allergen honesty rule does not move. His rulings that bind:

- **Ruling 3 (13 Nov)**: the eating-out budget is the SAME DAY only, never below a calorie floor.
- **Collision (b), asked 13 Nov, his answer "A range"**: a restaurant meal is logged as a range ("about 650-850 kcal,
  estimate"), counted at the middle for the day, clearly marked as an estimate, with no food-by-food questions.
  The range covers the whole plate, so nothing is quietly left out. It sits beside his 15 Oct rule rather than
  replacing it: a food typed into a meal, or told to the coach as a food, is still asked about.
- His 12 Nov eating-out rulings stand ("Ask: light/normal/big"; the day's other meals keep their dishes and are made
  smaller together, never by more than a quarter; protein held).

## What exists (12 Nov 2026, `docs/plans/eating-out.md`)

Marking a meal out on either surface asks Light / Normal / Big, puts an estimate in the day ("Dinner out (Friday)",
badged Estimate, never shopped for), shrinks the day's other meals together by at most a quarter with protein held,
names any knock-on on another day, and has an Undo. Same day already: no other day changes size.

## What is built

### 5a. The estimate is a range (both surfaces)

- The meal shows "about 650-850 kcal" (the estimate ±15%, rounded to 50), badged Estimate; the day counts the middle.
  The coach says the same range. Logging the meal out as eaten records the middle with the range kept in its note.

### 5b. The floor (both surfaces)

- AS BUILT, stronger than the floor: the day's other meals shrink only as far as the day's own TARGET (never below it,
  so never near the calorie floor of 1,500 kcal for men, 1,200 for women), never by more than a quarter of their size
  (now true after rounding: a dish of whole items that rounded under it is asked again a step bigger; measured, a lunch
  at 72%), and never below 95% of the day's protein (the shrink stops there, and a fit that already trimmed the dishes
  grows them back toward their planned size, never past it; measured before, 87-92%). Beyond that the day runs over and
  its line says by how much.
- CSCS: a very low intake earlier in the day to "save" calories for a meal out leaves the day's protein and recovery
  short and tends to backfire at the meal; the floor and the quarter cap keep the day a normal day.

### 5c. Suggested orders (the coach)

- Told a restaurant's name or what is on the menu (typed, or a photo where the chat accepts one), the coach suggests
  2 or 3 orders, each with one reason tied to his day ("grilled chicken and rice: keeps your protein on track"), and
  offers to mark the meal out at the matching size. It never says a dish is free of an allergen it cannot confirm (his
  18 Oct wording, "Can't confirm it's nut-free"), and a dish clashing with his restrictions is never suggested.
- Prompt and exam only: the coach writes the suggestions; the app's existing checks still refuse a food that clashes.

### 5d. No compensation (held by a gate)

- The next day's meals are exactly what they were before the meal out (same dishes, same sizes), and nothing on any
  later day is cut to "make up" for it. Only a leftover lunch from a dinner that is no longer cooked changes, and that
  is already named.

## Not built

- Reading a menu photo in the app itself (the coach reads it where the chat accepts images; no separate screen).
- A week's eating-out budget (ruled out: same day only).

## Measured (`test:eating-out-budget`)

- 4 targets x 3 sizes on dishes of real foods: the day never below its target, protein at least 95% (lowest 95%), no
  other meal under three quarters of its size or over its planned size, the next day identical.
- A steak dinner out (1,900 kcal, 140 g protein): the other meals stop at 76% and the day runs over (3,057 of 2,200).
- Not reachable today, recorded: the shrink's own calorie limit (the swap's fit-around step already sizes such a day
  first) and the protein grow-back's "never past planned" limit (no case needs more than the planned size). Both stay.
