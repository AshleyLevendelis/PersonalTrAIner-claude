# A swap keeps the day's other dishes (M34, runs 3-4)

**Her ruling, 10 Oct 2026, from three options: "Resize, else leave."** When one meal of a day is
swapped, the day's other meals keep the dishes they showed before; they are re-sized together by
one factor, about 25% either way, to land the day on its targets, and one line says so with an
Undo. If no factor in that band lands the day, they are left alone and the line says how far over
or under the day is. The same rule as her H24 ruling for a logged meal. Rejected: resize-else-
re-pick, and keeping today's behaviour (re-pick, with a line saying which changed).

## What happens today

A swap writes a pick (date, slot, dish name). The day for that date is then searched again with
the pick fixed and every other slot FREE (`meal-rotation.ts`, the day-for-date function, then
`assembleDay`), so a free slot can land on a different dish. That is how lunch changed the snack.

## The collision found while planning

Every pinned meal reaches the day through the same pick and the same search: a swap, a meal moved
to or from another day (29-30 Sep), a meal asked for by name or built from the fridge, and a meal
with a food added. Her **1 Sep ruling ("plan the rest of my meals")** is that a fridge meal is
fixed and the OTHER slots are searched to fit it. That is re-picking, the opposite of today's
ruling. A pick does not record where it came from, and adding that would be a database change.

The pinned dish does carry one fact already: a meal asked for by name, built from the fridge or
edited is tagged `user-requested`; a dish from the plan's own list is not. So the rule can split
on the DISH without new storage:
- the pinned dish is one of the plan's own dishes (a swap, a move between days): hold the others,
  resize, else leave;
- the pinned dish is her own (by name, fridge, edited): the 1 Sep re-plan stands.

That split was put to her before building. **Her answer, 10 Oct 2026, from three options: "Plan's
own dishes only"**, over every pinned meal (which would replace 1 Sep) and over swaps only (which
needed a database change). So a swap or a move between days of one of the plan's own dishes holds
the others; a by-name, fridge or edited meal still re-plans the rest of the day.

## Build, once scoped

1. The day as planned is the day with no pins of hers (the rotation's own day, leftovers kept).
2. With a qualifying pin: every slot that is not pinned and not a leftover takes the planned
   day's dish; one factor = (target kcal − pinned and leftover kcal) / held kcal; in [0.75, 1.25]
   each held dish is scaled and re-costed (`scaleToTarget` + `computeMealMacros`, as
   `day-as-shown.ts` does), all or none; outside the band, held at 1.0 and the gap is said.
3. One line under the swapped row, with Undo (Undo keeps the planned sizes; the day is said as it
   is). The swap card's knock-on line and the day-move card's "a different dish so the day still
   fits" become "resized" or "the day is N over/under".
4. Grocery reads the same day function, so the list follows by construction.
5. Gates: a pure function with the 0.75/1.25 edges, the all-or-none rule, the user-requested
   split; the day-move and top-up gates re-run (they read the same path); a driver on the swap.
