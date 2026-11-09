# A deep meal pool: every library dish that suits you, and a menu that changes week to week

Ashley, 9 Nov 2026, asked about pool size with measured options (7, 10, 14 a meal): *"We need a much deeper pool of
meals to choose from not only 14"*. It replaces his 28 Sep "seven" ruling, and it settles his open "seeding fresh
plans from the library" question in favour of seeding.

## What stands in the way (measured or read, 9 Nov 2026)

1. **The day picker tries every combination.** `assembleDay` is a nested product over the meals: N^4 days at four
   meals, with an off-target list that keeps one object per combination. At 7 a meal that is 2,401 days; at 100 it is
   10^8 and the phone runs out of memory. Everything that serves a day calls it: the week strip, today, the shopping
   list, the resize offer, every Apply card's trial, and the "how many fit" count behind the more-meals offer
   (`fittingCounts`, which runs one search per dish, so 4N^4, on every render that changes the pool).
2. **The week does not depend on the date.** The rotation is a 7-day cycle (`epochDay % 7`) built from the pool
   alone. A deep pool would still serve about 7 dishes a meal and then the identical week, every week; the rest of
   the pool would never be served.
3. **The cuisine cap is on the pool**: one adventurous cuisine per meal, so a library seed would keep one Thai,
   Korean, Japanese... dish per meal and reject the rest.
4. Lists and writes sized for 7: the swap list renders every option with a restriction check each; a refit resizes
   every option with one database update each, in sequence; the phone's start-up copy drops ENTIRELY past 1.5 MB.

## The design

**One idea: the deep pool is what you HAVE; each week's MENU is what the app SERVES from.**

- **The menu**: for each rotation week (the 7 days the rotation already uses), up to `MENU_SIZE` dishes a meal,
  drawn from the deep pool by a rotation through the whole pool (a stable order, the week number as the offset), so
  successive weeks serve successive dishes and the whole pool comes round in turn. Liked dishes are always on the
  menu. At most one adventurous cuisine per meal on a menu (the coherence cap, moved from the pool to the menu).
  A pool no deeper than `MENU_SIZE` is its own menu, so today's plans (7 a meal) behave exactly as now.
- **Everything combinatorial runs on the menu, never the pool**: `serveDates` (and so the strip, today, the shopping
  list and every trial) gets each date's menu from one function, after `poolsServedOn`, so the rotation is built per
  week menu. App's own rotation, the resize offer and the fit counts use the same function. One function, so no
  surface can serve a day another would not.
- **The pool is seeded from the library**: a new plan gets the meal writer's dishes as now, then every library dish
  that passes the person's checks (`verifyProposal`, the diet check, dislikes) and fits their meal budget. An
  existing plan is offered the same through the more-options path, never topped up unasked (his 28 Sep "Button,
  keep today" ruling still holds: days before the new dishes' first day are worked out from the pool as it was).
- **Lists**: the swap list shows this week's menu first, then the rest of the pool behind a search box (the
  exercise picker's pattern, his 13 Sep "show everything" shape).
- **Writes**: the resize write becomes one batched request; the start-up copy keeps the menu-sized slice rather
  than dropping everything.

## Decided here, and why (mechanical or CSCS)

- `MENU_SIZE` is a measurement: the largest size whose week build stays inside today's cost at 7 on a phone, read
  against days on target and distinct dishes a month (`measure:deep-pool`).
- The cuisine cap moves to the menu: it existed so a plan reads as one way of eating, which is about what is served
  together, not about what is stored.
- Performance nutrition is unchanged: every dish still passes the same verifier, and a day is still judged by the
  same bands.

## Not built, named

- The meal writer is still asked for its usual dishes on a new plan (it reads cuisine wishes the library cannot).
- The coach does not see the pool (it never did); it sees today and the strip.

## Verification

`measure:deep-pool` (distinct dishes a month, days on target, week build time), a `test:` gate on the menu function
(determinism, rotation covers the pool, likes kept, cap, a 7-dish pool unchanged), the existing meal gates, and
drivers for the strip and the swap list at phone size.
