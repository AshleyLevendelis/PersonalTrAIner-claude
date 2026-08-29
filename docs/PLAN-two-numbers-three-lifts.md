# "100, 150" became Squat 100 and Bench 150, and nobody asked

**Status: PLAN ONLY. Not built.** Load prescription gets a plan before a build
(CLAUDE.md), and starting weights are load prescription.

## What happened

The coach asked for **three** lifts in one sentence:

> "what are your current working weights for your squat, bench, and deadlift?"

Ashley typed **`100, 150`** — two numbers. The app recorded:

```
✓ Squat — 100
✓ Bench — 150
```

...and then asked only about the deadlift. Ashley's report: *"I presumed it was
squat and bench because those were first in its list but it should have
confirmed with the user rather than presume."*

She is right, and note what the app did: it **inferred the mapping from the
order the question happened to list them in**. Nobody said 100 was a squat.

## Why this one matters more than it looks

Those two numbers are not display text. `knownSquatKg` / `knownBenchKg` /
`knownDeadliftKg` set `load_source: 'known_weight'`, which is the app's
**most-trusted** load basis — it outranks the population estimate and skips the
"starting light" hedge entirely. So a mis-assigned number does not produce a
slightly-off suggestion; it produces a **confident** one, on the wrong lift,
carried through the whole mesocycle.

A 150kg bench for someone who benches 100 is not a rounding error.

This is the same family as the rules already written into `chat-gemini`:
*"NEVER INVENT REPS OR SETS"*, *"a number you supplied is indistinguishable
from a number they reported the moment it is written."* Those rules govern
**values**. This is the gap one level up: the **assignment** of a stated value
to a field was invented, and no rule covers that.

## Where the decision is being made

Unknown, and finding out is step one. Two candidates:

1. **The model** called `set_slot` twice off its own reading of the order.
2. **The client's** typed-answer path (`tryExactLabelMatch` splits on commas
   for multi-selects) did something similar for numerics.

The fix differs completely depending on which, so this must be established
before anything is written — the last three bugs in this area were each a
different layer than the obvious one.

## Proposed rule

**A stated number is only recorded against a lift the user named, or a lift the
app asked about on its own.** Concretely:

- One question, one lift. If the coach wants three numbers it asks three times,
  or presents three numeric cards. The card already exists and already labels
  its field ("Deadlift (kg)") — the screenshot shows it working correctly for
  the third lift.
- If a reply carries more numbers than the question asked for, **record none of
  them** and read them back: *"Got 100 and 150 — which is which?"* Silence is
  recoverable; a wrong 150kg bench is not.
- If the user names them ("squat 100, bench 150"), take both — that is stated,
  not inferred.

## What Ashley still needs to decide

Her instruction — *"it should have confirmed with the user rather than
presume"* — settles the behaviour. The open question is the **shape** of the
confirmation:

- **(a)** Ask one lift at a time, always. Slowest, and impossible to get wrong.
- **(b)** Let the coach ask for all three in one sentence, but require it to
  read back any mapping it inferred before recording. One extra turn only when
  the answer is ambiguous.
- **(c)** Present the three numeric cards together, each labelled, and let her
  fill in what she knows.

I would recommend **(c)**: the labelled card is the one surface in this flow
where the mapping cannot be ambiguous — the field says "Deadlift (kg)" above
the box — and it is already built and already working. It also fixes the
underlying problem rather than adding a confirmation turn to paper over it.

## Verification this would need

- A gate that no numeric lift slot is ever written from a reply containing more
  numbers than lifts named.
- A conversation fixture for exactly this exchange, asserting that `100, 150`
  against a three-lift question records **nothing** and asks.
- The existing `test:log-correction` rules extended: they forbid inventing a
  value; they should also forbid inventing which field a value belongs to.
