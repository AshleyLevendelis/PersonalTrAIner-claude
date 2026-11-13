# Flexible nutrition (strategy slice 4, 13 Nov 2026)

His strategy of 13 Nov 2026, slice 4: follow / swap / freestyle; a starter tier with no numbers; plans built from staples
(portions resized before dishes are replaced); a weekly calorie average; a repetition setting. His rulings that bind:
collision (c) answered **"Its own label"**: a freestyle day reads "Freestyle · protein hit · calories within range",
never "on target"; and "go with your recommendations" for the rest. Every sentence below is his to change.

## What exists (measured 13 Nov 2026, cited in BACKLOG)

- FOLLOW and SWAP exist: the day's meals come from one pure search (`assembleDay`), a swap pins a dish for a date, and
  "on target" has one source (`dayVerdictLabel`, bands ±5% calories, protein 0.95-1.10x, carbs and fat ±10%).
- STAPLES largely exist: his own meals ("My meals", setup's usual meals) get the first call on each week's menu and a
  day works towards half its meals being his; when targets move, the search first RESIZES a dish (0.75-1.35x quietly,
  then up to 0.4-2.5x) before it picks a different one, and a refit offer resizes the whole pool. What is missing is
  that this is not said anywhere he can see.
- Logging records what he ate per meal (`meal_events`), so a day of only his own food can be counted already.
- MISSING: freestyle, any way to hide numbers, any weekly calorie average, any repetition setting (all constants).

## What is built

### 4a. Freestyle, a day at a time (both surfaces)

- AS BUILT: on Nutrition, under Today's meals (today or any of the next six days on the strip), **"Freestyle this
  day"**: the plan's meals step aside for that date and each becomes an empty "Your dinner choice (Friday)", filled with
  what he ate (Add food, or telling the coach) and then logged. An empty choice cannot be logged as eaten. A meal already
  logged stays as eaten. Never shopped for; "Back to the plan" puts the plan's dishes back. Stored as pin-only picks the
  way eating out is (no migration).
- The day's line: **"Freestyle · protein hit · calories within range"** when protein is at least 95% of target and
  calories within ±10%; otherwise it names the miss in the same words ("Freestyle · protein 30 g short"). Never "on
  target". With nothing logged yet: "Freestyle · log what you eat".
- NOT BUILT: the coach's own control to set or undo a freestyle day. The coach can log what he ate on one (its existing
  food logging), and sees the day's line. Named in the parity list as screen only.

### 4b. The starter tier (screen; the coach is told)

- Profile, Food: **"Show numbers"** on or off (on by default). Off is the starter tier: Nutrition and Home show the
  meals, the portions to cook and what is logged, and no calories, macros, rings or "kcal left". The day line becomes
  "3 meals planned" / "Logged 2 of 3 meals"; the week line counts days logged ("food logged on 1 day of 2"); a coach
  line built from a figure is not drawn, and the resize offer says the same thing with no figure. The coach is told not to quote calories or macros to him.
- Stored as a profile column `show_numbers` (migration NOT run; until then the switch says it is not switched on yet).

### 4c. Staples, said where it happens

- When a meal of his ("My meals" or a usual meal) is on the plate at a different size from how he wrote it, the meal
  says so once: "Your usual, sized to today's targets." No change to the search (it already resizes before replacing).
- Checked: his meal at another size says so; at his own size, or within 3%, it says nothing; a plan dish never does.

### 4d. The weekly average (screen and coach)

- Nutrition's Week view gains one line: "This week so far: 2,140 kcal a day against 2,200 (4 days logged)". Monday to
  Sunday, days with nothing logged left out and counted. Protein the same way. A freestyle day counts like any other.
- The coach's context gets the same line (the Saturday review reads the coach's context, so it can name it).
- CSCS: body composition follows the weekly energy balance, so a day over is not a failure if the week lands; no
  automatic compensation (the next day is not cut), which is also slice 5's rule.

### 4e. Repetition setting (screen; the coach can change it)

- Profile, Meals & shopping: **"Meal variety"**: Lots of variety (today's rules, the default) / Some repeats (a dish can come back
  after one day off) / Same meals most days (the same dish on consecutive days is fine, so the week can be built from a
  few staples). Read by the day search's variety keys only: never past the day's targets (variety stays inside the
  bands, as now). Stored as a profile column `meal_variety` (same migration as 4b).

## CSCS review

The targets, bands and safety rules (allergens, restrictions, the uncountable-food question) are unchanged; freestyle
judges protein and calories only, which are the two that matter most for body composition; the weekly average is
display, never a reason to cut a day. Basis: energy balance over the week determines weight change; protein intake is
the main dietary lever for keeping muscle in a deficit.

## Not built

- A freestyle WEEK in one tap (a day at a time; the coach can do several).
- Hiding numbers inside the coach's own replies beyond the instruction (model behaviour, the exam's to judge).

## Measured (`test:flexible-nutrition`)

- Variety setting, one five-dish pool, a week: "Lots of variety" 5 different dinners, none back to back; "Same meals
  most days" 1 dinner; both 7 of 7 days on target.
