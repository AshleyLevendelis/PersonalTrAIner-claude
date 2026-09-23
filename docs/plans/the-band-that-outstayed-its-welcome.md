# The band that outstayed its welcome

**Measured 20 Sep 2026.** Report only so far — nothing built.

## The number, today rather than remembered

`worse_implement_than_available` fires on **1,476 of 9,216 plans (16.0%)**,
measured today on a settled tree. The record said 1,314 (14.3%) on 16 Sep, so
it is **drifting worse, not better** — five days added 162 plans.

Read the denominator: 16.0% is the share of PLANS carrying at least one, over
sixteen weeks. It is a probability of occurrence, not a per-slot rate.

## A correction I owe, before anything else

The standing note said the flag was probably wrong — that the scorer counts a
pull-up bar as a better implement and is "answering the wrong question". I
repeated that framing before measuring it.

**Measured, the flag is mostly RIGHT.** Of **41** flagged entry/tier
combinations, **37 have genuinely better peers that carry real external
load**:

> CORRECTED 20 Sep 2026, same day. This first said "15 combinations, 11 with
> external-load peers". Both figures were wrong: my sweep iterated six
> training styles and **this app has four** — `powerlifting` and `endurance`
> are not `TrainingStyle` values. `getConstrainedPool` does not throw on an
> unknown style, it simply applies no style filter, so two of every six
> profiles were a wider pool than any real trainee gets. The PAIRS were right
> and the COUNTS were invented. Re-run against `ALL_STYLES`, the split moves
> further in the flag's favour, not against it. **Use the app's own constant
> lists; never retype them from memory into a measurement.**

| tier | given | when they own |
|---|---|---|
| full gym | Backpack Curl | barbell, dumbbell, cable and machine curls |
| full gym | Backpack Lateral Raise | dumbbell, cable and machine lateral raises |
| full gym | Band Shrug | barbell, dumbbell, machine and cable shrugs |
| full gym | Band Tricep Pushdown | cable pushdowns, skull crushers |
| minimalist | Band Lateral Raise | dumbbell lateral raises |

A **full gym** member being prescribed a backpack curl is not a scoring
artefact. It is a bad prescription, and the scorer is right to say so.

## Where the note WAS right, and it is narrower than claimed

**4 of the 41** are flagged only because of a bodyweight-on-apparatus peer:

- `Band Lat Pulldown` (home gym, minimalist) → peer: **Pull-Up Negatives**
- `Kneeling Band Lat Pulldown` (minimalist) → peer: **Pull-Up Negatives**
- `Single-Arm Band Pulldown` (minimalist) → peer: **Scapular Pull-Ups**

The catalogue's own words settle it. Pull-Up Negatives is *"the lowering half
of a pull-up… this is how most people earn their first one"*, with the form
cue *"stop the set when the lowering gets fast"* — eccentric-only, carrying no
external load and unable to carry any. Scapular Pull-Ups is *"the movement is
small — a few centimetres"*, and its own `substitution_group` is
`scapular_control`, not `vertical_pull`: **the catalogue already records that
it is not a substitute, and the scorer does not read that field.**

The sentence the app prints is *"has a better-loading option for the same
pattern and tier"*. For these four it is **false**. Neither peer loads
anything.

## But the conclusion is accidentally right, for a reason nobody wrote down

**Pull-Ups and Chin-Ups are in both pools.** They are `tier1_compound`; the
band pulldown is `tier2_compound`, so the scorer's tier match never sees them.

So a home-gym trainee who owns a pull-up bar is being given a band lat
pulldown while real pull-ups sit unused — which IS the defect the flag names,
reached through a peer that cannot justify it. **A finding can be correct while
its stated reason is false, and the reason is what the next reader inherits.**

## How often it actually happens, per tier — and a claim I got wrong

Measured 20 Sep 2026 on a 448-profile grid per tier (4 styles x 4 experience
levels x 4 session lengths x 7 injury sets), against the CURRENT shipped
behaviour:

| tier | plans flagged | commonest pick |
|---|---|---|
| full gym | **81 / 448 (18.1%)** | Backpack Front Raise (1,188 slots) |
| home gym | **160 / 448 (35.7%)** | Backpack Front Raise (2,400) |
| minimalist | **167 / 448 (37.3%)** | Backpack Front Raise (2,512) |

**I said this probably never happened at a full gym, and that was wrong.** The
9,216-profile report prints detail lines only for its TEN WORST-SCORING plans,
and I read that sample as the population: 80 home gym, 32 minimalist, zero
full gym. A biased sample of the worst plans says nothing about where a rule
fires overall.

**And my first two attempts to reproduce it failed for a second reason** —
both grids fixed `session_duration_preference` to `45-60` and `injuries` to
`[]`. Adding the other three durations and six injury sets made it fire
immediately. That is this repository's own standing rule met again: *a gate
built from comfortable fixtures never reaches the code it exists to hold* —
here it was a MEASUREMENT rather than a gate, and the same comfort hid the
same code.

Note also that the headline exercise is **Backpack Front Raise**, not the
Backpack Curl the earlier write-up led with. The curl is real and reachable;
the front raise is what the generator actually picks.

## The actual mechanism: selection and rotation disagree

`poolForRotation` **already drops** every band and backpack entry at home gym
and minimalist — verified today, 6 dropped at home gym, 13 at minimalist. It
asks the question pool-wide, on `substitution_group`.

Selection does not. `betterImplementInList` compares only **within one slot's
candidate list**, so a band pulldown whose better peer was not shortlisted for
that slot survives. Rotation then cannot rescue it, because the pick is already
made.

That is the whole defect: **two predicates for one rule, and the narrower one
runs first.** It is this repository's own written rule — *"when three gates
grep the same expression, the expression should be a function"* — one level up,
about behaviour rather than gates.

## What to do, and what it costs — NOT YET BUILT

Three separable pieces, in value order:

1. **Selection asks the pool-wide question, like rotation already does.**
   Fixes the 11 real cases. **Changes what people are prescribed**, so it needs
   the five CSCS questions answered and a before/after on the full grid — in
   particular *what does it take away*: forcing the better implement narrows
   the shortlist, and a narrower shortlist is the exact shape that caused the
   8 Sep starvation defect.

2. **A peer must carry external load to count as a better-LOADING option.**
   Fixes the 4 false ones and makes the printed sentence true. Scorer-only,
   changes no prescription. Cheap and safe.

3. **The tier match is wrong in both directions** — it hides the genuinely
   better Pull-Ups and admits the eccentric-only regression. Matching on
   `substitution_group`, as rotation does, is the candidate; it needs its own
   measurement because it widens what counts as a peer.

Doing 1 and 2 together would ship two unmeasured changes at once, which is the
mistake the 8 Sep entry records. They get separate measurements.
