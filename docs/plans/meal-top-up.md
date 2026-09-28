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
