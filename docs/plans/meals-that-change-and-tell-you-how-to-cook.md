# Meals that change, and tell you how to cook them

Ashley, 19 Sep 2026, on the meal-engagement proposal: *"fix the variety and
keep the cooking steps"*. Two builds, one change.

---

## PART A — VARIETY

### The correction that has to come first

I told her yesterday that the day-to-day variety rule was "wired, tested, and
fed an empty history by the Nutrition tab", that turning it on was a one-line
fix, and that the shopping list meanwhile shopped for a varied week the tab
never showed.

**The first half is true. The second half is false, and the recommendation was
wrong.** Measured today over 500 profiles, walking the horizon exactly the way
`assembleHorizon` does — with `recentNames` threaded, the way the grocery list
already threads it:

| | |
|---|---|
| mean distinct days in a 7-day week | **1.11** |
| profiles whose whole week is ONE repeated day | **89.4%** |
| days after day 0 identical to day 0 | **96.4%** |

So the shopping list's week is the same day seven times too. The two surfaces
do not disagree; **they are both stuck**. And passing `recentNames` into the
tab, the fix I recommended, would have moved the number from 1.00 to about
1.11 — a change nobody would see.

**Why.** The repeat penalty is `0.01`, added to `macroDistanceScore`, whose
units are weighted relative macro error — `0.01` is the cost of a 1% calorie
miss. The gap between the best combination and the best combination that shares
no meal with it is a median **0.033**, three times the penalty. Sensitivity
sweep across carb/fat spread ±5%→±40% and per-meal protein overshoot
+10%→+40%: the best case any fixture produced was 1.66 distinct days. The
result is not an artefact of the fixture.

**The shape of my error, which is the part worth keeping.** I read the call
site, saw `{}` where a variety argument belonged, and reported a defect without
ever asking whether the mechanism behind the argument could do the job. *An
argument that is not passed and an argument that does nothing look identical
from the call site.* The repo's own rule — a written finding is a lead, not a
fact — caught this one turn later only because I went to build it.

### What is actually wrong

Variety is scored as a tiebreak against macro fit, in the same units, at a
magnitude that can only win an almost exact tie. It therefore cannot express
the thing we want, which is not "prefer variety slightly" but:

> **Every combination inside the tolerance bands is, by the app's own
> definition, a correct day. Among correct days, the one you did not eat
> yesterday is better — and that is not a tiebreak, it is the point.**

### The change

`assembleDay`'s comparison becomes a lexicographic sort, applied only when at
least one combination is within tolerance:

1. within tolerance beats outside it (hard);
2. then fewest slots repeating a name from the last three days;
3. then macro fit, exactly as scored today.

When **no** combination is within tolerance, nothing changes: the current
single fit score decides, so a day the app cannot get right still spends
everything on getting it as right as possible. The soft-liked-food and
multi-exotic penalties stay where they are, inside the fit term.

Measured effect (same 400-profile grid, four fixture settings):

| fixture | distinct days/7 now | after | mean macro distance now | after |
|---|---|---|---|---|
| spread ±10%, protein +0-10% | 1.64 | **4.01** | 0.0296 | 0.0431 |
| spread ±10%, protein +0-40% | 1.11 | **4.22** | 0.0677 | 0.0947 |
| spread ±20%, protein +0-25% | 1.20 | **4.51** | 0.0586 | 0.0896 |
| spread ±40%, protein +0-40% | 1.10 | **3.98** | 0.0938 | 0.1268 |

### What it costs, stated plainly

The day shown is no longer the single closest fit to target — it is a correct
day chosen for variety. Mean weighted macro distance rises by 0.013–0.033, and
the 90th-percentile worsening is 0.057. **Every day chosen this way is still
inside the bands** (±5% calories, protein −5%/+15%, carbs and fat ±25%),
because in-tolerance is the first and hard key. The app does not loosen a band,
and does not ship an out-of-tolerance day it could have avoided — in fact it
ships fewer, since fit-first could previously prefer a combination that scored
well overall while busting one band.

**One consequence to watch, and it is a real one.** The resize offer fires off
`before.withinTolerance`. Choosing in-tolerance days more reliably means the
offer will fire LESS often. That is the correct behaviour — if a combination of
the meals you already have fits, the app should serve it rather than offer to
re-portion — but it is a change to when a user-visible offer appears, and it is
recorded here rather than discovered later.

### Where "yesterday" comes from

Nothing persists which meals were shown on which day, and `assembleDay` is
pure by design. Two candidate sources:

- **what was logged** — honest, but a person who does not log gets no variety
  at all, which is most people early on;
- **the date** — a seven-day rotation, deterministic, needs no storage and
  works from day one.

**Chosen: the date.** `rotationWeek` walks seven days from a clean history and
returns all seven; today is `epoch-day mod 7`. Parity is then by construction
rather than by inspection — the same seven days are computed once and handed to
both the Nutrition tab and the shopping list, so the list cannot shop for a week
the tab will not show. This is the pattern the resize offer already uses and the
one CLAUDE.md singles out as worth copying.

Date arithmetic is UTC epoch-day from the `YYYY-MM-DD` string the app already
passes around — never `Date.now()`, never a local-midnight subtraction, so the
DST bug fixed on 15 Sep cannot come back through this door.

Today's pinned meals are applied only to today's entry, after the walk: a pin is
a fact about one date and must not bend the other six days.

### Cost of the walk

Up to seven `assembleDay` calls where there was one. Each is a cartesian search
over at most 5^4 combinations of cheap arithmetic. Memoised in App on
pools/targets/likes/pins/date, so it runs when one of those changes rather than
on every render.

---

## PART B — THE COOKING METHOD

### What is true today

`generate-meals` asks for, and the model returns, a `prep` field for every
dish. It is read exactly twice — to judge whether a dish is too heavy for
breakfast, and to tag it `quick` or `standard` — and then dropped. `PoolOption`
has no field for it; `meal_plan_slots` has no column for it. So the app pays
for the method and shows a dish name with weighed ingredients and no
instructions.

One path already forwards it and is discarded at the same wall: a meal added by
name through the coach passes the model's `prep` straight into the proposal.

### The change

- `prep?: string` on `PoolOption` — **optional**, so every existing pool row and
  every other option builder keeps working untouched and no backfill is needed.
- A migration adding `prep text NOT NULL DEFAULT ''`.
- Written by all three persist paths, read by `readPools`, rendered under the
  ingredients on the meal card.

### The honesty rule, which is the only interesting part

**The app rescales every meal it is given.** The model proposes roughly the
right portions and `scaleToTarget` then multiplies every ingredient to hit the
slot budget. So a method that says *"fry the 200g of chicken"* can be describing
an amount the ingredient list no longer contains. That is the app printing a
number it did not verify, next to numbers it did — exactly what the load-
prescription rule forbids elsewhere.

Two halves, belt and braces:

1. The prompt asks for a method with **no quantities** — the ingredient list
   carries the amounts, the method carries the technique.
2. At verification, a method that still mentions a mass or volume figure is
   **dropped**, and the meal is kept. A meal with no method is a smaller loss
   than a meal whose method contradicts its own ingredients.

Counts of time ("simmer for 10 minutes") and oven temperatures are not
quantities of food and are left alone.

A meal whose ingredients were EDITED after generation loses its method for the
same reason — the method names foods that may no longer be in it. Every edit
path already rebuilds the proposal with an empty `prep`, so this falls out of
the existing design rather than needing a new rule.

### Sequencing, which matters

The frontend writes the new column. **The migration must be applied before the
frontend reaches anything that uses that database**, or every meal write fails.
Migrations are Ashley's to run, so this goes in the handover as an ordered pair,
not a list.

---

## Verification

1. `measure:meal-variety` — the BEFORE/AFTER table above, re-runnable, in the
   repo rather than in a chat message.
2. Gates for: the lexicographic sort (including that it does NOT apply when no
   combination is in tolerance), the epoch-day arithmetic across a DST boundary,
   the tab and the list reading one rotation, the quantity-drop rule, and the
   method surviving a round trip through persist and read.
3. Every new check mutation-tested, counts reported.
4. A real Chromium at 390x844 on the real Nutrition screen: the method visible
   under a meal, and the day changing when the date does.
5. `npx tsc --noEmit`, then a full sweep before any merge. Three checks always
   fail in a cloud session for want of a live database and are reported as
   environmental.
6. BACKLOG with both builds, the correction above, and the measured numbers.
