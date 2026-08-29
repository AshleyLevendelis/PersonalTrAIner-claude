# "Height (cm)" and "Weight (kg)" to someone who thinks in feet and stone

**Status: BUILT.** Ashley's ruling: accept both, convert silently, and say
what was stored.

**Three layers stood between the parser and the field, and the plan predicted
none of them.** Every unit test passed throughout while the card could not have
received a single one of those strings.

## Why this is on the load path, not just a form nicety

`height_cm` and `weight_kg` are two of the three inputs to `resolveBodyMetrics`
→ `computeBMR` → `computeStaticTDEE` → every macro target, AND they feed the
population standards table that produces starting loads. A wrong height does
not produce a wrong label; it produces a wrong calorie target and a wrong
weight on the bar, silently, for as long as it stands.

That is also why `load_source: 'assumed_body'` exists — the app already treats
a *missing* body metric as serious enough to hedge every load derived from it.
A *misread* one is worse, because nothing hedges it.

So the rule for this build: **a conversion is only ever applied when the input
says which unit it is.** No bare number is ever guessed at.

## Where it goes

`coerceSlotValue` in `ConversationalOnboarding.tsx` is the single funnel — the
numeric card, the model's `set_slot`, and the typed-text backstop all pass
through it. One change there covers every path. The parsing itself belongs in
`src/lib/body-units.ts` as pure functions, so it can be swept with tests rather
than clicked through.

## What converts, and what deliberately does not

**Height** — `178`, `178cm`, `1.78m`, `5'10`, `5' 10"`, `5ft10`, `5 foot 10`,
`5ft`. **Weight** — `87`, `87kg`, `180lb`, `180 pounds`, `13st`, `13 st 2`,
`13 stone 2`.

**Rejected on purpose:** a bare `70` for height. It could be 70cm (a toddler)
or 70 inches (5'10"), and there is no way to know. The existing 100–250 bound
already fails it, and it should keep failing rather than being guessed into
178. Same for a bare `13` on weight. **The whole incident this session came
from an app inferring something nobody stated; this must not repeat it one
field over.**

## The read-back is the safety rail

A silent conversion is only safe if the result is visible. When an input was
converted, the receipt says both: `✓ Height — 178cm (from 5'10")`. If the
conversion is wrong, it is wrong *on screen*, next to what they typed, at the
moment they can still fix it — rather than surfacing weeks later as a calorie
target nobody can explain.

## Verification

- A table of inputs → expected cm/kg, including every format above and the
  rejects, run as a gate rather than by hand.
- Round-trip sanity: 5'10" → 178cm → reads back as ~5'10".
- Bounds still apply AFTER conversion (a converted value out of 100–250 fails
  the same way a typed one does).
- A gate asserting no bare number is ever unit-guessed.


---

## What the plan missed, and how it was caught

Writing `body-units.ts` and its 40-case table was the easy half, and it proved
nothing about whether anyone could USE it. Driving the real field found three
blockers in a row:

1. **`type="number"`.** A number input physically discards an apostrophe and
   letters, so `5'10` could never reach the converter. Both fields are
   `type="text"` now; the app's own bounds still apply after conversion, so
   nothing was loosened except the browser's character filter.
2. **The card's own `isOk`** validated the RAW string against
   `isNumberIn(100, 250)` — so it rejected `5'10` with "Give a number between
   100 and 250" before the converter was consulted. It validates what will be
   STORED now.
3. **The label and placeholder** still said `cm` / `100–250`, so nothing told
   anyone the other form was allowed. They read `cm or 5'10` and `178 or 5'10`.

Proven end to end in Chromium: `5'10` and `13st 2` typed into the real fields
store **178cm** and **83.5kg**, and the receipts read `(from 5'10")` and
`(from 13st 2lb)`. Four mutations bite, including the control that a bare `70`
is never promoted to inches.
