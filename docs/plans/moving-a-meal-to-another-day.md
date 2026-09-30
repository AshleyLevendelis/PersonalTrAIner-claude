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

## Two different meals — 30 Sep 2026

Monday's dinner to Wednesday's lunch. It was "named, not built" for a day on
the reason that it needs the resize the slot move makes, on a day. It was
built the next day, on her 14 Sep slot-move ruling applied across days: **they
swap places and each is resized to fit the meal it lands in**, both new sizes on
the card before the tap.

- The builder takes an optional second meal (`to_slot`). Absent, or the same
  meal, it is the same-meal swap above, unchanged. Two different meals is the
  same two picks plus **two resized copies**, `X (as lunch)`, made by the slot
  move's own function (`movedOptionFor`, so the same resize limits and the same
  dietary re-check) and written the way the slot move writes them.
- **The copies are held until the strip ends** (`new-from:<the day after the
  last strip day>`, the top-up's device): a pick by name serves them, no other
  day's search can find them, so the swap cannot reshuffle a day nobody named.
  This is also why the trial does not need them in its pools.
- The card is read off the same trial as before. It names both dishes and what
  each becomes (with the calorie change), that each is resized, any other meal
  the swap changes and why, any day taken off target, and the shopping list.
- Refused in plain words, on top of the list above: two meals on the same day
  (that is the slot move), a meal this profile does not have, and a resize the
  slot move itself would refuse.
- One decision used the whole way: writes go **copy first, then pick, for each
  leg**; a failed leg puts back every leg already written and removes its
  copy. Both picks or neither, and nothing left behind either way.

## Undo — 30 Sep 2026

The swap's payload IS the record of what it did: each leg names the pick it
wrote and the pick that was there before (`previous`) and, for two different
meals, the copy it added. So an undo needs no second record.

- **Only when both days still hold what the swap wrote.** An undo that put back
  a pick on a day she has changed since would overwrite her later choice with an
  earlier one. It says so ("One of those meals has changed since, so I've left
  both as they are.") and touches nothing; the button stays.
- A meal of today's that she has **logged as eaten since** is left alone too,
  for the reason the swap refuses to move one. An unreadable ledger is said, not
  passed as "nothing eaten".
- Both picks or neither; a copy is taken out of the options only once no pick
  names it. A pick that will not clear puts the swap back and says nothing has
  changed; if even that fails the receipt says only half went back.
- **Screen:** the Undo sits beside the note on the row the swap was made from,
  and goes with the row (tap another day and it is gone, like every note on that
  row). **Coach:** the receipt carries the Undo for as long as the message is on
  screen; its token is the pending action's own row, whose payload is the record.
  Both call the same function.

## Gates

`test:meal-day-move` (the builder, the executor and the undo), `verify:meal-day-move`
(a real Chromium at 390x844: open a day, Move, another day, another meal, read
the card, swap, Undo, an Undo refused, an Undo that will not save),
`verify:chat-day-move` (the coach's card, receipt and Undo), `coach-parity`, and
the coach exam's `meal-day-swap-not-slot-move` case (three turns now: a swap
between two days is not a move between meals on one day, and a swap between two
different meals on two days is neither). Every one mutation-tested.
