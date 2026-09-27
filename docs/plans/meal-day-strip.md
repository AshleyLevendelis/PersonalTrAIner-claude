# Upcoming meals: the day strip (27 Sep 2026)

Ashley, 27 Sep 2026: *"I can only see today's meal, I can't see upcoming meals
and I can't add things to the grocery list for future meals so I can plan
ahead."* Her ruling that day, from three options: **Day strip** — "a row of
days across the top of Nutrition, today highlighted. Tap a day to see its
meals, swap one, or add that day to the shopping list. Same look as the week
strip on Home, and today's screen stays as it is." She rejected a week list
under today and a separate week page.

## What already exists (traced, not assumed)

- The rotation (`meal-rotation.ts`) builds a seven-day cycle and
  `assembleRotationDay(rotation, date, …, pinned)` works for ANY date. Only
  today is ever asked for.
- Per-date picks are stored: `meal_plan_picks` is `UNIQUE(profile_id, date,
  slot)` and `setMealPick` / `getMealPicksForDate` take any date. The app only
  ever passes today; React holds one flat `manualMealPicks`.
- The shopping list builds a horizon with its OWN walk (`assembleHorizon`),
  honouring swaps on day 0 only. A swap on Monday would be shopped wrong the
  moment Monday can be swapped. It also threads history differently from the
  tab after the rotation's seam.
- `meal_refs` is jsonb `{day, slot, mealName}`, `day` an offset from a build
  date the store never records (the screen keeps a memo on the phone).

## The build

### 1. One day, one derivation (engine)
- `mealDayFor(rotation, date, pools, targets, likes, picksByDate)` is the ONE
  way any surface gets a date's meals: the tab (today and any strip day) and
  the shopping list both call it. `assembleHorizon`'s private walk goes.
  Parity by construction, the `meal-refit` pattern.
- A swap on any date pins that date only (`meal_plan_picks` row for that date).
- `MealRef` gains `date` (YYYY-MM-DD). Readers prefer it; the old offset plus
  memo stays as the fallback for lists built before today.

### 2. Adding a day to the list
- `addGroceryDays({ dates, … })`: the list's generated rows cover a set of
  dates (read off their refs). Adding a day recomputes the generated rows for
  (covered dates from today on) ∪ the new dates, through the SAME reconciliation
  Rebuild uses — so nothing is counted twice, adding a day twice changes
  nothing, hand-added / coach-added / edited / removed rows keep every
  existing protection.
- Already covered → no write, and the screen says so.
- Rebuild keeps its meaning: the next N days from today, replacing coverage.

### 3. The screen
- `MealDayStrip`: seven days from today, the Exercise strip's look (it is the
  navigator there too), "Today" marked, the selected day filled.
- Today selected: the tab exactly as now.
- Another day selected: that day's meals with its name as the heading, its
  planned totals against target, and **Add <day> to the shopping list**. The
  rings, the nudge and the resize offer hide — they are about today.
- On an upcoming day a meal can be opened (ingredients, method), swapped for
  that day, and hearted. NOT offered, and named: logging (you cannot have
  eaten it), editing its foods, moving it between slots, regenerating or
  finding more — those change the dish or the pool for every day, and stay on
  today's view where they live.
- The restriction re-check runs on every shown meal, upcoming days included.

### 4. The coach (parity, both ways)
- Its context gains the next six days' meals.
- `propose_meal_swap` takes an optional `date`; the card names the day and
  confirms through the same date-aware swap.
- New `add_day_to_grocery_list(date)`, through the same store function.
- `propose_meal_move` stops saying no screen shows another day; moving between
  days is still not built, and it says so without promising it.
- Needs the `chat-gemini` deploy.

## Checks
- Engine: a swap on a future date is served on that date and no other; the
  list for a horizon equals, day by day, what the strip shows; add-a-day is
  idempotent and never double counts; covered past days drop the way Rebuild
  drops them; meal refs carry dates.
- Driver: tap a day, see its meals and heading, swap one and see it stay after
  switching days, add the day and read the rows on the grocery screen; today's
  view unchanged.
- Coach: parity doc, tool courier shape, the prompt text.

## Not in this build, named
- Moving a meal to another day.
- Editing a future day's foods from that day.
- Logging ahead.
