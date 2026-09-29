# Moving a meal to another day

29 Sep 2026, Ashley's list item 2: *"Moving a meal to another day. Neither the
screen nor the coach can do this yet."* Her ruling, from three options:
**they swap places** (Monday's dinner goes to Wednesday, Wednesday's comes to
Monday), over "Monday gets a fresh dinner" and over "both days have it". It is
her 14 Sep slot-move ruling, applied across days.

## What was there, measured

- The written reason moving between days was `MISSING` ("no screen renders
  another day's meals") stopped being true on 27 Sep, when the day strip
  shipped. It was simply not built.
- A day's meals are not stored. `meal_plan_picks` holds `(profile, date, slot)
  -> meal name`, layered over the dateless pool, and the day assembler fits
  the rest of the day around whatever is pinned. So a move is **two picks**.
- `meal-move.ts` (slot to slot, today only) creates NEW pool options because
  the meal lands in a different-sized slot and is resized. Across days the slot
  is the same slot, so the budget is the same: **no resize, no new option, no
  pool write.** Two picks name two dishes already in the pool.

## What it builds

`meal-day-move.ts` (pure, one function) is the only place a cross-day move is
decided. It runs the SAME week derivation the screen runs (`serveMealWeek`),
once as it stands and once with the two picks in, and the card is read off the
difference. Nothing on the card is asserted that the trial did not produce:

- the two rows (each day's dish before and after);
- every OTHER meal in the week whose dish changes, and why. Pinning a dinner
  re-fits the rest of that day, and a lunch that is last night's dinner is
  re-made from the dinner now served the night before (28 Sep), so a move can
  change a day nobody named. Said before the tap;
- a day that falls out of its target BECAUSE of the move (one that was already
  out is not blamed on it);
- the shopping list: a moved day that is on it is stale until the list is
  rebuilt, and the card says so. The list is not rebuilt silently (her rulings
  on refit and top-up: tell her, don't do it behind her back). A list that
  cannot be read is said, not skipped.

One App-level controller (`plan`, `confirm`) is handed to the Move sheet on
the Nutrition tab and to the coach, so the coach cannot offer a swap the sheet
would refuse. The confirm RE-PLANS against the live week and refuses if a dish
on either day is no longer the one the card named.

## Refused, in plain words

- a day outside today plus six (the strip);
- the same day twice; the same dish on both days (nothing to swap);
- a slot with no dish on either day;
- a leftover lunch (it is last night's dinner: move the dinner and the leftovers
  are worked out again from it);
- TODAY's meal once it is logged as eaten, either way round;
- a dish the pool no longer holds.

## Named, not built

Moving a meal to a DIFFERENT meal on another day (Monday's dinner to
Wednesday's lunch). That needs the resize and the new pool option the
slot-to-slot move makes, on a day, and nobody asked for it. Each half exists on
its own: swap across days (this), and slot to slot (today only).

No undo token: two picks swapping back is one more move, said on the receipt,
exactly as the slot move does.

## Gates

`test:meal-day-move` (the builder and the executor), `verify:meal-day-move`
(a real Chromium at 390x844: open a day, Move, another day, read the card,
swap, the strip shows it), `verify:chat-day-move` (the coach's card and receipt),
`coach-parity`. Every one mutation-tested.
