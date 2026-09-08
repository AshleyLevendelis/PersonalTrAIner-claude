# The style tag that starved a movement

8 Sep 2026. Ashley's Tuesday prescribed a **Backpack Lateral Raise** beside a
barbell bench press and dumbbell shoulder presses. Tapping swap offered exactly
one alternative; typing "Later" into the search box below it turned up three
more that were obviously fine. *"The backpack version is more niche than the
standard dumbbell version for a person with a full gym."*

## One cause, both symptoms

Her live profile, read read-only from production: `full_gym`, `advanced`, no
injuries, no exclusions — and **`training_style: 'functional'`**.

`stageStyleFilter` applied style as a hard pool filter. Of the seven
`isolation_shoulder` entries in the catalogue, two carry `functional`:

```
CUT   Lateral Raises          dumbbells         [bodybuilding, hybrid]
CUT   Cable Lateral Raises    cable machine     [bodybuilding, hybrid]
CUT   Front Raises            dumbbells         [bodybuilding, hybrid]
CUT   Machine Lateral Raise   machine           [bodybuilding, hybrid]
CUT   Backpack Front Raise    weighted backpack [bodybuilding]
KEPT  Band Lateral Raise      resistance band   [functional, hybrid]
KEPT  Backpack Lateral Raise  weighted backpack [bodybuilding, functional]
```

Selection chose from a shortlist of two; the swap then had one left to offer.

The existing safety net could not see it. `MIN_VIABLE_POOL` relaxes the style
filter when the pool gets thin, but it measures the WHOLE pool — **151 of 199**
entries carry `functional`, so the pool looked enormous while one movement was
starved seven to two. The same defect shape that function's own comment records
for knee rehab: *a tag answering one question used to answer another.*

## What changed

**1. A style may not starve a movement.** A per-pattern floor beside the
whole-pool one: if style would leave a movement fewer than four ways to train
it, that movement's off-style entries are reinstated. Reinstated, not
unfiltered — a new `style_fit` score ranks them below every on-style option, so
the plan keeps its character wherever the catalogue is deep.

**Not at the bodyweight tier**, and that is a correction rather than a caveat.
The first version applied it everywhere and turned a bodyweight plan from one
loaded backpack item a week into five to eight, because every entry it
reinstated was a weighted backpack. Three gates caught it and were right to. At
that tier a thin movement is the KIT talking, and the app already draws this
line for the same reason (`EQUIPMENT_QUALITY_TIERS`: a bodyweight trainee's band
and backpack ARE their best tools, not a compromise).

**2. Improvised kit never beats the real thing you own.** The preference
existed but reached only initial selection, at ±1 — which two prior weekly
appearances cancel exactly. It now also reaches block rotation, the weekly
accessory rotation and the swap ranking, and is decisive (−8) when an equivalent
better-loading option is on the same shortlist. Scoped to that shortlist, so a
trainee whose only option really is a backpack keeps it.

**3. Movement families listed whole.** Five lateral raises, of which the map
named two — so the duplicate guards saw the other three as different movements.
Load-bearing after (1), since widening the pool makes the collision likelier. A
dead `cable_row` family built on an exercise name that does not exist came out
with it. The shrug entries added in the first pass were removed again: their
substitution group already does the job, and a mutation test showed the gate
could not tell whether they existed.

**4. A short swap list says why it is short.** The empty case has explained
itself since it was written; one or two options said nothing, so the screen
looked like a complete answer.

## Measured, before and after

Grid: 4 equipment x 4 styles x 4 experience, all 16 weeks (`report:style-implement`).

| | before | after |
|---|---|---|
| exercises using improvised kit while a better peer was in the pool | **310** | **0** |
| ...of those, in week 2+ (invisible to `test:quality`, which scanned week 1) | 309 | 0 |
| movements left with 2 options or fewer | **329** | **53** |
| movements left with NO options | **148** | **18** |
| swap slots offering one option or none | 134/1199 (11.2%) | 85/1268 (**6.7%**) |

Her own case: pool for that movement **2 → 7**, swap list **1 → 6** with real
kit first, and the Tuesday slot now prescribes **Cable Lateral Raises**.

Two honesty notes on the numbers. The swap denominator moved (1199 → 1268)
because plans now hold more distinct exercises, so the rate is the comparable
figure, not the count. And the starvation measure was rebased mid-change: the
first version compared against the whole catalogue and counted a bodyweight
trainee's two vertical pulls as starvation, which is the kit talking; it now
compares against what each equipment tier can actually offer.

**The residual is real and stated.** 64 of the 84 remaining starved patterns are
at the bodyweight tier, where the floor deliberately does not apply. Of the 20
elsewhere, the worst is 2 options of a possible 3, and they arise AFTER the
skill stage — the floor guarantees four where style applies, then capability
filtering can take it to three. None is the two-of-seven shape Ashley hit.

## Gates

`test:style-starve`, mutation-tested — 13 mutations applied, all caught, three
only after the checks that missed them were strengthened. Two existing gates
were re-anchored rather than relaxed: `test:rehab-prescribed` asserted "every
survivor is on-style", which was equivalent only while the rehab exemption was
the sole way an off-style entry could survive. It now asserts the property it
was protecting — that nothing rides in through the exemption.

`test:quality`'s `worse_implement_than_available` rule now scans every week
instead of week 1, which is why 309 of 310 occurrences had never appeared in a
number.

## Still hers to decide

Her current plan is persisted at generation time. This does not rewrite it: she
keeps Backpack Lateral Raise until the plan is rebuilt — or until she swaps it
by hand, which now offers the dumbbell, cable and machine versions. Whether to
rebuild mid-programme is her call.
