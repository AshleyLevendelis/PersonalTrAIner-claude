# Two minutes on the big lift

*Plan before build, per CLAUDE.md — this is load and density prescription.
Written 2 Sep 2026, straight after Ashley's answer.*

## Where this came from

Second item taken from "The Coach's Decision Stack" after the assessment of
2 Sep 2026 (see `how-did-that-feel.md` for the first, and for the filter: only
claims I would bet on independently of the document).

The document's claim: rest under 60s costs real work, the benefit is banked by
roughly 90–120s, and 2–3 minutes is right for a heavy compound — with "rest on
the primary lift" on its never-cut list. That one I would bet on. Short rests
reducing the work you can do in the next set is about as replicated as
anything in the field, and the loss lands on the hardest lift of the day, the
one the whole session is built around.

## What the measurement found

`scripts/report-training-dose.ts`, new, over the same 9,216-plan quality grid:

| | |
|---|---|
| main-lift slots with a parseable rest | 182,847 |
| **resting under two minutes** | **147,897 (80.9%)** |
| resting under 60s (the old floor) | 0 — the old floor held exactly |
| most common values | 90s (24.9%), 60s (17.0%), 75s (13.5%) |
| rest-trim events across the sweep | 319,750 (57,896 min cut) |
| **…that reached a tier-1 main lift** | **14,764 (4.6%)**, 4,269 landing on the 60s floor |

So the 60s floor was doing its job and the job was too small: four in five main
lifts sat below two minutes, and the trimmer was actively pulling thousands of
them down to the floor.

**And the cost, measured before asking rather than estimated.** The whole grid
re-swept with a 120s floor: mean exercises per session **7.57 → 7.46**. About
one exercise fewer every nine sessions. Cheaper than I expected, and that is
the number the question was put on.

## The decision

Four options, both sides costed: two minutes with conditioning keeping its
shorter rest (recommended); two minutes everywhere including conditioning;
ninety seconds; leave it at sixty.

**She chose "2 minutes, but conditioning keeps its short rest."** Decision
log: asked, answered, not decided unprompted.

## How it is built — a value change, not a new mechanism

`minLoadedMainLiftRestSeconds` on the goal policy ALREADY is this rule: a
loaded-main-lift floor, goal-scoped, stacked over
`MAIN_LIFT_REST_FLOOR_SECONDS` with `Math.max`, and already respected at
prescription time and by the budget trimmer. Conditioning already carried 90
from her earlier ruling — *"the session still conditions, the part with a bar
on your back does not."*

So the change is three numbers: hypertrophy, fat loss and functional gain
`minLoadedMainLiftRestSeconds: 120`. Conditioning is untouched.

Two things fall out for free, both of them previous rulings of hers still
holding:

- **Bodyweight main lifts keep the flat 60.** The higher floor is a density
  rule about a bar; a chin-up is not one.
- **Promoted anchors keep the flat 60**, for the same reason.

`quality-score.ts`'s `main_lift_short_rest` check moved with it: it hardcoded
60, which was right while the generator's only floor was 60, and would now
have passed plans the rule forbids — the exact rule/check disagreement
`MAIN_LIFT_REST_FLOOR_SECONDS`' doc comment was written to end.

**METRIC CHANGE, stated because prior scores stop being comparable:**
`main_lift_short_rest` can now fire on a loaded main lift resting between 60
and 120 seconds, which it previously could not.

## The limit of her ruling, flagged rather than decided

Her ruling is **goal-scoped**, because that is how the existing exception is
scoped and how she phrased it. The consequence: a *hypertrophy* trainee's
**Metabolic Conditioning block** now rests two minutes on its loaded main
lift, even though that block's own focus text promises *"short rest, sustained
output."*

That is arguably the same case her conditioning exception covers, and I could
have widened the rule to the metabolic PHASE as well as the conditioning GOAL.
I did not, because widening a ruling on my own judgement is how a decision
stops being hers. **Flagged for her; not decided.** It is a one-line change if
she wants it.

## Gate

`test:block-rest-sizing` §6. Her ruling is **pinned by name** — 120 for each of
the three goals, 90 for conditioning — not derived from the configs. That is
the lesson from the metabolic rep floor earlier the same day: a check that
reads its expected value out of the config it is checking deletes itself when
the config changes, and stays green while doing it.

Plus an end-to-end assertion: across goals × experience × duration, every
loaded tier-1 main lift in a generated plan rests at least its goal's floor
(2,864 slots, 0 below).

| mutation | result |
|---|---|
| hypertrophy floor reverted to 60 | red |
| conditioning dragged up to 120 (her exception deleted) | red |
| floor no longer applied at prescription time | red — caught end-to-end at 61s vs a floor of 90 |

**One check was wrong and was rewritten, which is worth recording.** The first
version squeezed `sizeBlockToRestBudget` with an impossible budget and asserted
the rest came down to the floor. It does not: that function removes exercises
and leaves a main lift's rest alone. The check was asserting a ceiling where
there is only a floor, against a function that does not set either — it failed
for a reason with nothing to do with the change. Replaced with the end-to-end
assertion above, which is what the claim actually is.

## Measurement

`test:audit` **17,423 / 0**, unchanged.

`test:quality`: **Overall average 11.54 / 12 — identical to before the change**
(11.54), **0 of 9,216 plans below the 7.2 floor**. Per-dimension: time fit
1.93, structure 1.97, progression 1.82, selection 1.86, goal alignment 1.96,
primer fit 2.00.

That the score did not move is the point worth stating rather than glossing:
about one exercise fewer every nine sessions is not enough volume to register
against the scorer's own time-fit and selection dimensions, so the change buys
the rest without paying for it anywhere the score can see.

**And the tightened check fires zero times.** `main_lift_short_rest` — now
drawing the goal's own floor rather than a hardcoded 60 — finds no violations
in 9,216 plans. Rule and check agree, and the rule is actually enforced
everywhere, which is the thing the end-to-end gate assertion also proves on a
smaller grid.

**Frozen weeks are unchanged in kind**: the residual is still the named
backpack/carry classes from `when-the-bar-cannot-go-up.md` (implement cap,
distance cap), which rest changes cannot touch.
