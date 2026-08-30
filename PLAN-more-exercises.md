# Plan — more exercises, aimed at the holes that are actually there (audit §6.2)

Ashley: *"lets work on 6.2 the exercise swaps. we need more exercises."*

Exercise entries carry a load anchor, so adding them is load prescription.
Plan before build, per the standing rule.

## What I measured, before writing anything

`scripts/probe-swap-depth.ts` calls `getReplacementCandidates` — the same
function the ⇄ button calls — across all 158 entries, at every equipment tier.

```
             avg options   0 options   <=2 options
full_gym        10.1           0          0 / 158
home_gym         8.4           0         21 / 158
minimalist       6.9           0         30 / 158
bodyweight       4.9           5         45 / 158
```

**A correction to the audit's own numbers.** §6.2 says a bodyweight user gets
"squats 2, bench 2, deadlift 4, overhead press 2, rows 2, pull-ups 1". Running
the real function against the real names, bodyweight gets:

```
Barbell Squats 3   Bench 3   Deadlifts 3   Overhead Press 3   Rows 4   Pull-Ups 4
```

Three of the six names the audit used (`Barbell Back Squat`, `Barbell
Deadlift`, `Barbell Row`) **are not in the catalogue at all** — the real
entries are `Barbell Squats`, `Deadlifts`, `Barbell Rows`. So those figures
were produced against something other than the live catalogue. The shortage is
real but it is not where the audit pointed, which is why this plan starts from
a fresh measurement rather than from that paragraph.

## Where it is genuinely thin — ranked by how much it hurts

**1. An injured shoulder with no equipment strands the entire pushing half.**
Not in the audit at all, and the biggest hole by far. With `injuries:
['shoulders']` at bodyweight, **35 exercises have zero suggested
alternatives**:

```
horizontal_push     17    vertical_push        6
isolation_tricep     6    isolation_shoulder   5    cardio 1
```

With a full gym the same injury strands **zero**. So this is specifically the
person training at home who has hurt their shoulder — and that is exactly the
person who most needs the app to offer something else.

**2. Five exercises have zero alternatives at bodyweight even with no injury**
— every one of them `isolation_shoulder` (Lateral Raises, Cable Lateral
Raises, Front Raises, Band Lateral Raise, Machine Lateral Raise). Raising your
arm against gravity with no implement has few honest substitutes, but "few" is
not "none".

**3. Pull-Ups offers exactly 1 alternative at home_gym and at minimalist** —
worse than at bodyweight (4), which is backwards. `vertical_pull` holds only
7 entries and `vertical_push` only 6, the two thinnest real patterns.

**4. Of 158 entries, 27 are `activation`** — warm-up and primer movements.
The catalogue that does the actual training work is nearer 131.

## What is NOT broken

The empty state is honest: *"No alternative exercises fit your equipment,
injuries, style, and skill level for this movement pattern. Search below to
pick anything from the full catalog instead."* Nobody is stuck — there is a
manual search behind it. This is a quality-of-suggestion problem, not a dead
end, and it should not be written up as one.

## The shape of the work

Roughly 30-40 new entries, aimed at the four holes above rather than spread
evenly. Each one needs `movement_pattern`, `mechanics_tier`,
`prescription_type`, `angle_vector`, `primary_muscles`, `equipment` (plus
`equipment_alternatives` where the implements really are interchangeable),
`joint_stress`, `loads_joints`, form cues, and a load anchor.

**The load anchor is the part that can do harm.** It decides the prescribed
weight. A new entry anchored to the wrong bucket prescribes a real number to a
real person — that is how kettlebell swings once landed an 85kg intermediate
on the heaviest bell in the gym. Every new entry gets its anchor checked
against a comparable existing entry, and the sweep re-run.

## What was built, and what it measured

**The code half — the cross-training third stage.** `getSmartReplacements` had
two stages: the movement's own pattern, then `NEAREST_PATTERN_FALLBACK`. That
map pairs pushing with pushing and pulling with pulling, which is right when a
pattern is thin and useless when the reason it is empty is the shared joint.
A third stage now crosses to legs, core, pulling or carries, and the note says
which joint is being rested.

**A defect found in my own first version of that note.** It said "this rests
your sore shoulder" whenever the stage fired — but the stage also fires for
somebody with no equipment and nothing sore at all (bodyweight Lateral Raises
have no same-pattern and no vertical-push alternative either). That is the app
inventing an injury the trainee never reported. Caught by reading the measured
numbers rather than the intent: the five no-injury zeros closed too, and they
had no business being explained by an injury. Two sentences now, one per cause.

**The content half — 27 entries**, constrained to what each thin tier actually
owns: bodyweight gets only `bodyweight`, `pull-up bar` and `weighted backpack`.
Backpack entries are over-represented on purpose, since a backpack is allowed
at every tier and one entry lands in all four pools.

Measured like-for-like — the same 157 exercises before and after, because
adding 27 entries to thin patterns creates 27 new subjects that are themselves
thin and would flatter or distort any count taken over the whole catalogue:

```
                BEFORE                          AFTER
             avg   zero   <=2            avg   zero   <=2
full_gym    10.1     0     0            11.0     0     0
home_gym     8.4     0    21             9.1     0    12
minimalist   6.9     0    30             7.6     0    18
bodyweight   4.9     5    45             5.5     0    40

shoulder injury at bodyweight: 35 exercises with nothing to offer -> 0
Pull-Ups alternatives, home_gym and minimalist: 1 -> 5
```

**A METRIC THAT LIED, worth recording.** Overhead Press at bodyweight went
from 3 alternatives to 2, and Pull-Ups from 4 to 2 — and both are
improvements. Before the content additions those patterns were empty at
bodyweight, so the cross-training stage fired and padded the list with wall
sits and planks. Now stage one returns two genuinely relevant options. A raw
count rewards the fallback for dumping unrelated work, so the comparison above
also counts only same-or-nearest-pattern candidates.

Likewise "exercises with no same-kind alternative under a shoulder injury"
rises from 35 to 41. That is not a regression either: with a hurt shoulder
there IS no safe pressing alternative, and the new pressing entries inherit
that correctly. The number that matters is the one that went to zero — nobody
is offered an empty list any more.

## A REGRESSION THIS CHANGE CAUSES, and does not fix

`test:frozen-weeks` tracks a known defect class — a rep increase paid for with
a lighter weight — against a budget of 10. With the 27 entries it is **11**.

Reproduced (`scripts/probe-raise-drop.ts`), full_gym / push_pull_legs / novice,
inside a single block:

```
wk 9   Lateral Raises  3x12-17  ~6kg per hand
wk10   Lateral Raises  3x13-18  ~4kg per hand   <- reps up, weight down
wk11   Lateral Raises  3x15-20  ~4kg per hand
```

**It is not caused by any particular entry.** Removing the two backpack
shoulder entries leaves it at 11; reverting the `REGRESSION_VARIATIONS`
additions leaves it at 11; removing all 27 returns it to exactly 10; adding
any ONE of them keeps it at 10. Thirteen tip it over. The diff touches no
load-prescription code at all — only the catalogue, the swap logic and two
names in a regression list. More entries simply re-roll which profiles land in
a bad state that already existed.

**The budget was not raised.** Raising it would be the same move as skipping a
failing test. The underlying defect is a load-prescription bug and gets its own
plan, per the standing rule, before anyone touches it.

## A SECOND REGRESSION, measured after the fact by the quality scorer

The full 9,216-profile sweep came back **11.47 / 12 against a baseline of
11.51** — down 0.04, and all of it in one dimension:

```
                baseline   now
Time fit          1.92     1.93
Structure         1.97     1.97
Progression       1.75     1.75
Selection         1.90     1.87   <- the entire drop
Goal alignment    1.96     1.96
Primer fit        2.00     2.00

Plans below the 7.2 floor: 0 / 9216 (unchanged)
```

The scorer names the cause directly, in its own worst-plan listings:

```
[worse_implement_than_available] "Backpack Lateral Raise" uses weighted
backpack when this minimalist profile has a better-loading option for the
same pattern and tier
[worse_implement_than_available] "Band Lat Pulldown" uses resistance band
when this minimalist profile has a better-loading option ...
```

**The ranking mechanism is not broken.** `EQUIPMENT_QUALITY` already rates
`resistance band` and `weighted backpack` as `low`, below dumbbells and
kettlebells. The problem is that adding low-ranked entries to a pattern
enlarges the pool, and the preference is a weighting rather than a rule — so
sometimes a backpack wins a slot from somebody who owns dumbbells.

**This is the cost of the depth, stated rather than buried.** The same entries
that close the bodyweight holes are, at minimalist, worse than what that person
already owns. There is no content-only fix: equipment sets are per-tier and an
entry cannot be scoped to one tier. Making a `low` implement never beat an
available `high` one is a change to plan generation, which needs its own plan
under the standing rule — and it is the same area as the frozen-weeks defect
above, so both belong in one piece of work rather than two.

## Verification

- `probe-swap-depth` re-run: the four holes close, with before/after in the
  same table shape.
- `test:audit` stays **13,967 / 0** — it will grow, since combinations
  multiply; the new number gets stated rather than the old one repeated.
- Every new entry's prescribed load compared against its nearest existing
  neighbour; anything more than one increment apart is wrong until explained.
- `test:workout`, `test:frozen-weeks`, and the plan-quality scorer (currently
  11.51/12) must not drop.
- A gate that every catalogue entry has a resolvable load anchor, so a future
  entry cannot be added without one.

## Ashley's ruling, 30 Aug 2026

Asked what the app should offer when somebody's shoulder hurts and they have
no equipment, given four options — swap in different work / offer gentler
pushing / offer both / leave it — she chose **swap in different work**: offer
legs, core or pulling in place of the pushing, and say plainly that it is
resting the shoulder.

I had recommended that one, for the reason that stands: the injury filter
exists to never load a joint somebody has told us hurts, and adding "gentle"
push-ups for a sore shoulder would be the app quietly overruling that.

**This changes the shape of the work.** Hole 1 is no longer a content problem
at all — no shoulder-safe pushing movements get added. It becomes a change to
what the suggester does when the pattern itself is unsafe: cross to another
pattern, and say why. Holes 2, 3 and 4 remain content.
