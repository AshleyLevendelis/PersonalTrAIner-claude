# Reading ingredient amounts honestly (BUILT 1 Oct 2026)

**BUILT 1 Oct 2026; what shipped, what was verified and what is not live is in BACKLOG.md
("An amount is understood or it is asked about"). Differences from this plan:** the
reader also understands an exact amount written LAST ("chicken breast 150g"), found
when a driver fixture wrote its meals that way; stage 3's "per-line check on the meal
writer's reply" is the same refusal every dish already goes through, not a new one;
the coach's `log_meal` asks instead of adding up (the plan said "tells her what it
could not read"). Not built: repairing stored meals, the grocery list's display of
an old misparsed line. Everything below is the plan as approved.

**Her rulings, 1 Oct 2026, from her "Ask me, then build it":** (1) a line the app still
cannot read, typed into an own meal or told to the coach, is **asked about** ("how
many grams?", nothing saved until answered), over refusing and over estimating.
(2) **"Understood" now means the food AND the amount**, over leaving the meaning
alone. Both were asked one at a time, with the recommendation first.

1 Oct 2026. Ashley asked for "the unit fix". It sits on the dietary and macro
path, so it is a plan first (CLAUDE.md, safety-adjacent work), and nothing here
is built until she says "build it". Every claim below is MEASURED unless it says
"read". Measured by running the real parser, not by reading it; a read-only
trace of every reader (file and line) was done first and its disputed claims
were re-run.

## What is wrong, measured

53 ordinary recipe lines through the real parser and food database: **31 come
out with an amount more than 25% wrong, and all 31 still read as fully covered.**

| Written | Costed as | Why |
|---|---|---|
| 8 oz chicken breast | 8 g | oz is not a unit the reader knows; it becomes a count of 8 "whole" with "oz" left in the name, and the grams function's last line is `return quantity` |
| 1 lb beef mince / 1 kg potatoes / 1 l milk | 1 g | the same |
| 8oz chicken, 1kg potatoes, a banana, 2-3 tbsp, ½ cup, 2 x 150g | 1 g | no space, no number, or a shape it does not parse: "quantity 1, grams" |
| 2 cans chickpeas | 2 g | can / tin are not units |
| 1 cup oats | 240 g (910 kcal; a cup is about 90 g) | **cup is 240 g for every food**, right for milk, wrong for oats (2.7x), rice, spinach (8x) |
| 1 half avocado | 150 g (twice) | "half" is not a named count |
| 1 large banana | 1 g | the banana knows "medium" only |
| 1 tin tuna, a pinch of salt | refused for a dieter, 1 g otherwise | they do not resolve to a food (the unit word is in the name) |

**Why nothing noticed: `coverage` is weighted by mass, and the mass is the
misread number.** A meal of rice, 8 oz chicken, a tin of tuna, a pinch of salt,
broccoli and oil measured **coverage 0.993, protein 10 g** (the chicken alone is
about 70 g). A line whose mass is mis-estimated small has almost no weight in a
mass-weighted share, so it can never be seen by it. This is the "wrong number
that looks right" shape.

**Corrections to what the repo already said** (BACKLOG, CLAUDE.md, the library
plan): "8 oz is read as 8 grams" is not the mechanism (nothing recognises oz;
the 8 g comes from the catch-all). Tins and pinches are NOT silent: they do not
resolve, so they cost nothing and a dieter's dish is refused. Cans, pounds,
kilos, litres, cups and "half" are the silent ones. Earlier counts (19 of 115)
were a different line set; do not compare them.

## Who can be hit today (read, plus the measured cases above)

1. **The coach's `log_meal`, which writes what she ATE.** It runs the edge
   function's OWN copy of the food database, not the app's. Measured: the same
   structured line `3 egg, unit whole` is **5 kcal on the server and 233 in the
   app** (the server copy lacks the piece-weight rule). Its header says it is a
   verbatim synced copy; it is not, and `test:food-db-parity` compares allergen
   tags only. The coach prompt also tells the model to use cups (`chat-gemini`
   :2476). Not measured: what the model actually sends as `unit`.
2. **Own meals: custom meal, add a food, edit or resize, move a meal.** They run
   `keepPortions`, where the amount is "a fact" and nothing re-checks it. The
   missing-amount check lets "a banana" through and it costs 1 g.
3. **Generated meals.** The meal writer's prompt asks for "an exact quantity and
   unit" but does not forbid oz, lb, cups or tins, and its reply is passed on with
   no per-line check. A dish with an "oz" line is accepted at the slot's budget
   by the app's own arithmetic, which is consistent with the WRONG costing.
4. **The shopping list** sums the same grams, so it under-buys. Display reads
   "8 whole oz chicken breast".
5. **The library is safe by construction**: every line is grams or a plain count
   and `test:meal-library` now refuses oz, lb, kg, tins, pinches and the rest.
6. **Meals already stored are not re-parsed** (they are structured). Not
   measured: how many stored meals have a unit word in a name. Production is
   select-only and this session cannot reach it; a read-only count on her
   machine would answer it.

## What the diet check does today (and must keep doing)

Fail-closed: a name that does not resolve is treated as unknown and refuses the
dish for anyone with a preference. Measured: "1 tin tuna" and "a pinch of salt"
are refused for vegetarian and vegan; "8 oz chicken breast" and "1 lb beef mince"
resolve to meat and are refused; "2 cans chickpeas" resolves and passes. **The
allergen path is not weakened by anything below**: cleaning the unit word out of
a name can turn a refused line into a resolved one, so the gate pins that the
verdict for every table line is never more permissive than its resolved food's
own tags.

## The build, staged (smallest and safest first)

**Stage 1 — stop guessing (no change for any line that reads correctly).**
- An amount the reader does not understand is marked "not understood" instead of
  falling to `return quantity`. Carried on the line, not in a side list.
- `verifyProposal` refuses a dish with ANY not-understood line, in every caller
  (generation, addition, custom meal, add/edit/move). A separate line-count rule,
  because mass-weighted coverage cannot see it. The reason goes in the rejection
  log in plain words.
- The coach's `log_meal` tells her what it could not read instead of logging
  totals; the missing-amount backstop stops accepting "a banana".
- The server's food database copy is brought to the app's rules.

**Stage 2 — understand the ordinary units, exactly where there is one answer.**
- Exact: oz, lb, kg, l (and fl oz), with the unit removed from the name.
- Fractions and shapes: ½, 1/2, 1 1/2, "1,5", "2 x 150g". Ranges ("2-3 tbsp")
  read as the midpoint, said on the line. `withQuantity` is fixed for mixed
  fractions ("1 1/2 cups" set to 2 currently becomes "2 1/2 cups").
- Per food, where the answer depends on the food: cup (a table for the foods
  that are measured in cups), can / tin (typical drained or net weight, and a
  stated size such as "(14 oz)" wins), handful, half, large / small.
- Negligible: a pinch or a dash is a fraction of a gram and costs about nothing.
- The text-rewriting callers (`withQuantity`, the move-a-meal resize, the food
  edit resize) assume the written unit survives. So normalise ONCE, where a
  line enters, into `{grams, name}`, and let everything downstream see only that.
  Nothing re-reads the original text.

**Stage 3 — stop asking for the wrong thing.** The meal writer's rule and the
coach's prompt (cups, "common measurements") ask for grams or counts; the writer's
reply gets a per-line check.

**Not built here:** repairing stored meals (no live users; a read-only count
first); the grocery list's display of an old misparsed line.

## Decisions

Hers (what the app says, and what it refuses):
- When an own-meal line cannot be read, the app asks ("I couldn't read '1 tin
  tuna'. How many grams?") rather than refusing in silence. Recommended.
- Whether the meal writer losing a dish to an unreadable line is acceptable. It
  is measurable on her machine (run the writer on TEST and count refusals).

Mine, decided here on the CSCS delegation (population-level nutrition, recorded
with its basis): a pinch is negligible; a can is the typical drained weight for
its food; a cup is the food's own density, not 240 g.

CSCS review: (1) effect: no prescription changes; the numbers shown become the
numbers eaten, which is what protein and calorie targets rest on. (2) takes
away: dishes with unreadable lines are refused, so a few generated meals will
disappear, counted before shipping. (3) fundamentals: protein floor, calorie
band and scale limits are read, not edited. (4) the one thing that moves is the
MEANING of "covered": a line is covered only if its food AND its amount were
understood. That changes what a safety-adjacent number measures, which is why it
is hers to approve. (5) scope: not clinical; allergens stay fail-closed.

## Gates (all mutation-tested; a plan, not built)

- `test:ingredient-units`: the 53-line table above plus a few hundred generated
  lines, expected grams within 10%, and the property that **no line is ever
  costed from a guess**: either right, or marked not understood.
- A parity gate that runs the SAME lines through the app's and the server's food
  database and fails on any difference (the existing parity gate compares
  allergen tags only).
- The diet property above, over the table and six diets.
- Browser: the edit and add-food sheets show "227g chicken breast", not "8 whole
  oz chicken breast", and a refused own meal says why on screen.
- Mutations: restore the catch-all; drop the line-count rule; oz as 28 g; cup back
  to 240 g flat; strip the not-understood flag; server copy without the piece rule.
