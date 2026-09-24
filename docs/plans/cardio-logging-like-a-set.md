# Cardio logging, like a lifting set

Ashley, 24 Sep 2026: *"The loggin cardio system needs a revamp to fit with the
aesthetic of the rest of the app"*. Asked which look to use everywhere, from
three options, she chose **"Like a lifting set"**: the same boxes and mint ✓
as lifting sets, planned cardio pre-filled so one tap logs it, a saved row
that reads back what was done ("✓ Walk · 20 min · Easy") with Undo, and
effort as Easy / Steady / Hard everywhere.

## What exists (measured 24 Sep 2026)

Five places write a cardio log, and they look like five different apps:

| Surface | Today | Effort recorded |
|---|---|---|
| Finisher / Optional row (`FinisherRow`) | one line + outline "Log" button | the plan's RPE, silently |
| Prescribed walk on an activity day (`PrescribedRow`) | amber strip + "Log" | the plan's RPE, silently |
| "Did you move today?" (`ActivityLogEntry`) | three tiles + "Other" free-text form | 4, invented, never shown |
| Unplanned work → Cardio (`AddUnplannedWork`) | preset buttons, two text boxes, an RPE 5-10 strip | 5-10 picked |
| "Something else" on What happened (`WhatHappenedSheet`) | two text boxes | 6, invented, never shown |

And none of the "Logged" states survive leaving the screen: each is component
state, so coming back to Today showed the finisher un-logged and offered to
log it a second time. A lifting set reads back from its logs; cardio did not.

## What changes

1. **One effort scale** in a leaf module (`src/lib/cardio-effort.ts`): Easy /
   Steady / Hard at RPE 3 / 5 / 7 — the scale `AddCardioSessionSheet` already
   uses to PLAN cardio, now also the one used to LOG it. A plan's RPE maps onto
   it (≤4 Easy, 5-6 Steady, ≥7 Hard — the app's own labels: every RPE 4
   prescription in the plan says "conversational pace"). When the effort left
   selected is the plan's own, the plan's exact RPE is stored, so logging an
   RPE-8 interval finisher as prescribed still records 8, not 7.
2. **One row** (`CardioSetRow`): a boxed minutes field (the plan's minutes as
   the faint suggestion, exactly as a set row shows its reps), a three-way
   effort box, and the glowing mint ✓. Saved, it collapses to the mint
   read-back with Undo. Refusals show under the row, as a set row's do.
3. **It reads back from the day's logs**, so a saved row stays saved after
   navigating away. Undo is offered while the store can still undo (its
   existing ten-minute window).
4. Each surface uses it:
   - Finisher and Optional rows — the prescription pre-filled.
   - The prescribed walk on an activity day — pre-filled.
   - "Did you move today?" — Walk / Cycle / Swim / Other as chips above the
     row, Walk pre-selected with their own last walk length, so the commonest
     answer is still one tap. Today's other logs read back above it.
   - Unplanned work → Cardio — the four presets become chips; the round
     timer's prefill still leaves the effort for her to choose.
   - What happened → Something else — keeps its form, gains the effort box
     instead of silently recording 6.
5. The prescription phrase everywhere ("Walk · 20m · RPE 4") becomes
   "Walk · 20 min · Easy".

## Store fixes this needs

- A tombstoned pending row (undo raced a sync) was still returned by the
  day's merged read — invisible until now because nothing read it back.
- A synced row loses its local id in the merged read, which would hide Undo
  the moment the network answered. The read now carries it over.

## Not changing

- The coach's own cardio logging, and what the coach is told (it still reads
  RPE numbers — more precise, and not on any screen).
- Deleting a cardio log after the ten-minute undo window. A lifting set can be
  deleted at any time; cardio cannot, before or after this. Named, not built.

## Checks

- `test:cardio-effort` (new, mutation-tested): the mapping, the stored RPE,
  the read-back phrase, and every writer using the shared row.
- Re-anchored where the behaviour moved: `test:rest-day-card`,
  `test:bounds-and-boundaries`, `test:round-logging`, `test:planned-activity`,
  `test:cardio-session`.
- Drivers: `verify:rest-day`, `verify:finisher`, `verify:mobility-filler`,
  `verify:planned-activity`, `verify:cardio-session`, `verify:round-presets`,
  `verify:what-happened`, with screenshots read at 390px.
