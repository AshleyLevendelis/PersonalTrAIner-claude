# More meal options for a plan that already exists — 28 Sep 2026

## The ruling

Ashley, 28 Sep 2026, from three options, after choosing seven options a meal:
**"Button, keep today"**. A "Get more meal options" button on Nutrition adds
more to each meal. Today, and any day already on the shopping list, stay
exactly as they are; only the other days are re-picked from the bigger set.
She rejected re-picking everything (today included, list rebuilt), and having
no button (seven only on "Redo all meals").

It also follows her earlier standing ruling on running out of swaps: new
options are OFFERED, never fetched unasked.

## What "exactly as they are" costs, measured

Holding a day by saving its dish names (the pick store) is not exact:

- **Portions.** The day search quietly resizes one dish by 0.75-1.35x to land
  a day on target. Measured on the modelled pools at five options: 6% of days
  at no target drift, **66% at 10% drift, median factor 1.27**. A name brings
  back the stored portion, so most held days would change by about a quarter
  on one dish.
- **Leftovers.** About four lunches a week are last night's dinner,
  re-portioned. A lunch pick naming a dinner does not resolve at all.

So a held day is not re-pinned; it is **worked out from the pool as it was**.

## The design

1. **A start date on every new option.** The top-up tags each option it adds
   `new-from:YYYY-MM-DD`. On any date before that, the option does not exist:
   the day is assembled from the old pool, through the rotation the old pool
   builds, so it is byte-identical to what was shown before, resized dishes
   and leftovers included.
2. **Why a start date and not a list of held dates.** Days are a chain: a
   lunch is last night's dinner. A held Wednesday after a re-picked Tuesday
   would lose its leftover lunch, because Tuesday's dinner changed. Holding
   every day before the start date keeps every chain intact. The start date
   is the day after the later of today and the last shopping-list day. When
   the list has a gap (Monday and Friday), the days between are held too:
   more held than she asked for, never less. Recorded as a deviation.
3. **One function serves every date.** `serveDates` in meal-rotation.ts
   decides which pool and rotation serve each date, and assembles a run of
   consecutive dates. The Nutrition tab (today and the strip), the shopping
   list, the coach's view of the week and the resize offer all read from it,
   so none can disagree about a day.
4. **A leftover needs its dinner.** A lunch that is "last night's dinner" is
   served only when the dinner actually served the night before is that dish.
   This was already wrong after a swap: change tonight's dinner, and
   tomorrow's lunch still said "Last night's dinner." about a dish nobody
   cooked. The start date makes that boundary happen on purpose, so it is
   fixed here for both. "Cook both portions together" on a dinner follows the
   next day's actual lunch the same way.
5. **The offer.** Shown on today's Nutrition view when a meal has fewer than
   seven options she can be served (restriction-marked meals do not count),
   and at least one. One tap tops every short meal up to seven. "Not now"
   hides it on that device. Words come from the phrasebook.

## Not changed

- Targets, verification, allergen and diet checks: every new option goes
  through the same `verifyProposal` as any other.
- The coach's per-slot "find more options" (its swap-exhausted card) stays as
  it is: she is choosing a new meal for today there, so holding today would be
  wrong.

## What proves it

- `test:meal-top-up`: the start date hides new options before it and shows
  them from it; held days identical to before, resize and leftovers included;
  the leftover chain; the offer's arithmetic; the generator tags what it adds.
- `test:meal-days` §3 (list = tab for every date) keeps holding.
- `verify:meal-top-up`: the button on a real screen, today unchanged after
  the tap, the receipt, "Not now".

## Seven dishes of which two fit (30 Sep 2026)

Ashley, on "all the days' meals look very similar": a meal can hold seven
dishes and serve two of them, because the rest no longer land a day on her
numbers (her targets moved after they were made). The count above cannot see
that, and the offer stayed quiet.

**Measured first** (modelled pools, 150 profiles, targets 10% above the ones
the pools were made for): a dinner with fewer than three dishes that fit
served **2.7 different dinners in a week; the rest served 4.0**. Adding the
dishes the ask names cleared the flag on every one of the 52 flagged
profiles and lifted the week to 3.7. "Fit" is the assembler's own test: pin the
dish in its meal, let the search choose the rest, and ask whether the day it
would serve lands within the tolerance bands.

**Her ruling, from three options: speak when FEWER THAN THREE fit** (over
fewer than four, and over only one or none). It is still an offer, the same
button and the same promise (today and the shopping-list days stay), never
done unasked. It went into the existing offer rather than a second one.

**Mine, named:**
- FITTING_GOAL 5: the ask aims at five that fit (a week of five dinners uses
  all five, `measure:meal-repeats`, 28 Sep).
- MAX_POOL 10: the day search is a product over the meals, so a pool of ten
  costs a week about 3.4x a pool of seven (measured 30 Sep). A pool already at
  ten is not asked for more; the coach says why, and the screen says nothing.
  In a pool of seven that leaves room for three more, so the ask is three
  however few fit.
- The two shortfalls (seven servable, five that fit) are asked for together as
  the LARGER of the two, so one tap covers both.
- "Not now" for the fit offer is remembered per calorie and protein target:
  her targets moving is what makes dishes stop fitting, so it asks again.

**One computation for both surfaces**: App works out a `TopUpPlan` once
(what to ask for, what is short by count, what she has, which meals have too
few that fit, which are crowded) and hands it to the Nutrition offer and to
the coach's card, so the coach cannot offer what the button would not. The
card reads "2 of 7 fit" to "up to 5 of 10 fit".

**Not built, named:** replacing dishes that no longer fit (nothing recorded is
lost, and a kept meal survives a regenerate by her ruling), and a fit measure
in the meal-quality gate (`test:meal-quality` needs a live database).

## What proves the fit offer

- `test:meal-top-up` section 8: the fit count on fixtures with a known number
  that fit, the three numbers, the threshold at two versus three, the pool
  cap, the larger of the two shortfalls, the exact sentences, the "Not now"
  keys, App's wiring, and the population claim measured on every run.
- `verify:meal-top-up` [7] and `verify:chat-top-up` [7]-[8]: the screen's
  offer and receipt, the coach's card and its refusal for a crowded meal.
