# A shoulders day with shoulder work

*Plan before build, per CLAUDE.md: this is exercise selection under an injury
flag. Written 9 Oct 2026 from test log H4 (and its Run 2 updates "H4 and H5"
and "H4 (time cap)"), the tracer's report (`reports/B-injury-underfill.md`)
and a fresh seeded run of the tester's profile. NOT BUILT. Nothing in this
file has changed any plan.*

The tester ("Sam"): Minimalist kit, bodybuilding style, Mon/Tue/Thu/Sat,
30-45 minutes, intermediate, fat loss, and one tick at setup against
"Shoulders" under "anything that regularly flares up".

## What is wrong, with the output

Reproduced from the real generator, seed `sam:2`, week 1:

```
Monday    Chest & Triceps   Scapular Push-Ups 2x8 | Dumbbell Floor Press 4x9-11 | Band Tricep Kickback 3x15-18
Tuesday   Back & Biceps     Band Pull-Aparts 2x8 | Backpack Row 3x9-11 | Hammer Curls 3x15-18 | Rear Delt Flyes 3x15-18
Thursday  Legs & Calves     2 primers | Box Squat | Romanian Deadlifts | Walking Lunges | Chair Leg Extension | Dumbbell Leg Curl
Saturday  Shoulders & Abs   Band Dislocates 2x8 | Single-Leg Glute Bridge 4 | Tempo Air Squat 4 | Cossack Squat 4 | Bird Dog 3
```

Sets per day, primers included: **9, 11, 20, 17.** Monday is one press and one
triceps exercise, seven working sets, and stays that way for sixteen weeks.
Saturday has no shoulder exercise at all, three leg compounds, and is still
called "Shoulders & Abs". On screen it carries the note *"Your current
equipment and injury settings leave nothing eligible for an overhead press
today — not a bug, just a real gap in what's available."*

Five separate things stack to produce it. None of them is a wrong number; each
is a rule that holds where it was written and nowhere else.

1. **A shoulder flag removes nearly everything the shoulder touches, and it is
   the cautious default rather than a reviewed list.** 68 catalogue entries are
   excluded for a shoulder flag and 59 of them only because an entry with no
   reviewed verdict falls back to "it loads the joint, so it is out". That
   takes every lateral and front raise, every overhead press, every push-up,
   every pull-up and pulldown. What is left for Sam's kit is one press
   (Dumbbell Floor Press), two band triceps movements, and — for delts — Rear
   Delt Flyes, which the catalogue files as a row and so can only land on a
   pull day. **This plan does not loosen any of that** (see "What this plan
   does not do").
2. **The six shoulder-friendly presses share one movement family.** A day may
   hold one exercise per family, and all six are `bench_press`. So a
   shoulder-flagged chest day gets ONE press at every tier. The tracer ran a
   full-gym, 60-90 minute, shoulder-flag plan and got `Barbell Floor Press 3 |
   Tricep Pushdowns 3`: six working sets in a session with ninety minutes
   available.
3. **Both band triceps movements share a family too** (`tricep_extension`), so
   only one may appear. One press plus one triceps is the whole day.
4. **"Shoulders & Abs" lists the three leg patterns as PRIMARY.** They were
   added so a four-day body-part split trains legs twice. The track's own
   comment says "a light unilateral leg accessory — not a second leg day". But
   primary patterns are what the general fill draws from once the named slots
   are done, and every overhead press is one family — so after one press, the
   only compounds left to fill with are legs. **This is not an injury effect:**
   14 of 32 uninjured full-gym bodybuilding plans have three or more leg
   movements on "Shoulders & Abs". With the flag, the day's main lift at full
   gym became Trap Bar Deadlift.
5. **A day keeps its name whatever is in it.** A day's label is the track's
   key. The engine only changes track when the track is "not viable", and
   viable means "three exercises of any allowed pattern" plus two hand-written
   checks for two other tracks. Shoulders & Abs passes with twenty leg
   exercises to choose from.

Then the spare time goes to an optional mobility flow (a deliberate house
rule: a short day gets the rest of its time as optional mobility), which is
how seven working sets reads "9 sets · ~37 min".

### Measured spread

The tracer's run, 32 bodybuilding four-day plans per row:

| Kit, injuries | "Shoulders & Abs" with no shoulder work | Chest day with one press or fewer |
|---|---|---|
| Minimalist, shoulders | 28 of 32 | 28 of 32 |
| Home gym, shoulders | 0 | 28 of 32 |
| Full gym, shoulders | 0 | 28 of 32 |
| Minimalist, wrists | 0 | 28 of 32 |
| Any kit, no injury | 0 | 0 (but 14 of 32 Shoulders days are leg-heavy) |

A wider slice was run for this plan on 9 Oct 2026: every bodybuilding
combination of the quality grid at moderate recovery (2,304 plans, same seeds
the quality sweep uses). The table is in "Measurement" below, where it doubles
as the "before".

## The rule

Decided as a CSCS coach, basis after each.

**1. A day named for a body part trains that body part, or it is a different
day and says so.** Every body-part track gets a *defining pattern*: the thing
without which the name is untrue.

| Track | Defining patterns | Named fallback when the pool has none |
|---|---|---|
| Chest & Triceps | a horizontal press | Upper Pull & Core |
| Back & Biceps | a row or a vertical pull | (none needed: a row survives every flag measured) |
| Legs & Calves | squat, hinge or single-leg | (existing viability rule) |
| Shoulders & Abs | an overhead press OR a delt isolation, rear delts included | Upper Pull & Core |

Basis: specificity. A session's label is a claim about its training effect,
and the person plans their week by it.

**2. What a shoulder-flagged "Shoulders & Abs" day contains.** In this order:

1. Delt and shoulder-girdle work that is NOT contraindicated for the flag,
   which today means the catalogue's `indicated` and reviewed-safe entries:
   rear-delt flyes or face pulls, prone Y-T raises, scapular push-ups, wall
   slides, band pull-aparts. Two to three of these, as the day's first block.
2. Upper-body pulling: one row, one biceps or trap movement.
3. Abs: two core movements (the track already requires one).
4. ONE leg accessory, last, and only where the week's legs would otherwise be
   trained once — never the day's main lift, never three.
5. Filled to the time budget from groups 1-3 before any optional mobility is
   added.

Where the pool has a delt movement (group 1 non-empty) the day keeps its name.
Where it has none, the day is built from the named fallback track and takes
that track's name. For Sam that is rear-delt flyes, prone Y-T raises, a row,
a curl and two core movements: about fifteen working sets, upper back and abs,
called what it is.

Basis: when a joint is flagged, a coach trains around it, biases pull over
push, keeps the scapular stabilisers and rear delts working, and moves freed
volume to pulling and trunk — not to a third leg session forty-eight hours
after leg day. This matches two of Ashley's rulings: 30 Aug ("the alternative
to a press is not an easier press — it is legs, core or pulling") and 24 Sep
("a coach prescribes more pulling than pressing when pressing is what hurts").
Replacing shoulder work with other work is what she ruled; replacing it with
ONLY legs is not.

**3. What a shoulder-flagged "Chest & Triceps" day contains.** Per tier, from
the entries that survive the flag today:

| Kit | Presses (after the family split) | Triceps | Borrowed to fill |
|---|---|---|---|
| Full gym | Barbell Floor Press + Neutral-Grip Dumbbell Press (+ Landmine Press) | pushdown + kickback | core |
| Home gym | Barbell Floor Press + Neutral-Grip Dumbbell Press | band pushdown + band kickback | core |
| Minimalist | Dumbbell Floor Press | band pushdown + band kickback | rear delts, core |
| Bodyweight | none survive | none survive | fallback track, renamed |

Two family splits make that possible, and each is a claim that two movements
are different enough to share a day:

- `bench_press` → flat barbell press / neutral-grip dumbbell press / landmine
  press. A barbell floor press, a neutral-grip dumbbell press and a landmine
  press differ in implement, grip, bar path and where in the range they load;
  a coach programmes two of them in one session routinely.
- `tricep_extension` → pushdown / kickback / overhead. Elbow extension with
  the shoulder neutral, extended, and flexed: three different lengths for the
  long head. (Overhead stays contraindicated for the flag; that is unchanged.)

Basis: the one-per-family rule exists to stop a day listing the same lift
twice. Its test is "would a coach call these the same exercise", and for these
they would not.

**4. A thin day borrows work before it borrows time.** When a track's pool
cannot reach the day's exercise count, it widens — in a fixed, per-track order
— to patterns that support the day's purpose (chest day: rear delts, traps,
core; shoulders day: rows, biceps, core) and only then hands the remainder to
optional mobility. Basis: an optional stretch is not a substitute for training
volume the person has the time and the capacity for.

**5. Legs come OUT of the Shoulders day's primary patterns** and stay as the
one slot that asks for them. This fixes the uninjured leg-heavy Saturdays too.

**6. The gap note describes the day as it is now.** It is stamped once at
generation today and never recomputed, so it still read "your injury
settings" after the flag was removed and after an adaptation changed the
exercises. It should be derived when the day is shown, name what the day does
instead, and stop pointing at Profile for a change that Profile cannot make
(H5; see the adaptations plan).

### The CSCS review

1. **Training effect.** Restores delt, upper-back and trunk stimulus on a day
   that was a redundant leg session; gives a flagged chest day two to three
   times its working sets.
2. **What it takes away.** The "legs twice a week" intent on the fallback day
   where the leg slot is dropped, and three leg compounds from uninjured
   Shoulders days. Legs & Calves still trains legs once, hard; the build must
   count leg sets per week before and after and say the number.
3. **Fundamentals.** Push, pull, squat and hinge all still appear weekly.
   Recovery improves: no squat pattern 48 hours after leg day.
4. **Floors and ceilings quietly redefined.** Three, each to be re-measured
   rather than assumed: `isTrackViable`'s "three exercises" rule (it stops
   being the only test); the audit's "legs on two or more days" check (it will
   fire where the fallback day has no leg slot — the check or the day must
   give, decided on the numbers); and the one-per-family rule, which NO gate
   holds today (the tracer's report names a `test:movement-families`; there
   is no such gate — `test:band-slots` and `test:style-starve` read families
   only in passing). The build adds one that lists every deliberate split.
5. **Scope.** No diagnosis, no rehab prescription. Every movement added is one
   the catalogue already tags as safe or indicated for the flag. No tag is
   relaxed.

## How the engine would do it

All in `exercise-plan.ts` unless said.

- `TrackDefinition` gains `defining_patterns` and `fallback_track`. The two
  hand-written lines in `isTrackViable` (`squatOk`, `pushOk`) become data on
  their tracks, so one mechanism serves all three cases.
- `isTrackViable` adds: the pool holds at least one defining pattern.
  `getViableTrack` tries the track's `fallback_track` BEFORE its existing
  "richest track" search — the richest is a leg or full-body track, which is
  how a shoulders day becomes a leg day by another route.
- "Delt isolation, rear delts included" needs rear-delt work to be admissible
  on the Shoulders day. Rear Delt Flyes and Face Pulls are filed as
  `horizontal_pull`; the track forbids that pattern. Admit them by
  substitution group (`rear_delt`), not by lifting the ban on rows.
- `Shoulders & Abs`: remove `single_leg`, `knee_dominant`, `hip_hinge` from
  `primary_patterns`; keep the one leg slot; add a second core slot and a
  rear-delt slot.
- `exercise-db.ts`: split the two movement families (`getMovementFamily`'s
  override table). No tag changes.
- Thin-day borrowing: a per-track `borrow_patterns` list read by the refill
  step when the track pool is exhausted, before `applyDurationFiller`.
- `buildPatternGapNote`: derived from the day at render time (a pure function
  of the day and the profile), or dropped once the day has been renamed.
- `quality-score.ts`: `day_label_mismatch` reads `defining_patterns` instead
  of two hard-coded labels.

## Every caller and gate affected

Callers of the changed pieces: generation (`generateExercisePlan`,
`generateMesocycle`), block rotation, every rebuild (`rebuildAgainstProfile`:
the injury, equipment, style, goal, days and session-length offers), session
rebuild, the swap shortlist (families decide what may share a day), and the
scorer.

Gates that read them: `test:quality` (score distribution and frozen
fingerprints will move for every bodybuilding plan), `test:audit`,
`test:injury-coverage`, `test:joint-tags`, `test:injury-rebuild`,
`test:day-coverage`, `test:session-length`, `test:session-shortfall`,
`test:filler-yields`, `test:week-note`, `test:band-slots`, `test:style-starve`,
`test:muscle-balance`, `test:push-pull-score`, `test:pattern-floor`,
`test:one-main-lift`, `test:equipment-labels`. A catalogue-family change is a
full sweep, not a derived set.

## The gate, written FIRST

`test:day-purpose`, seeded, and pinned on offenders the broken code names
(the rule that a fixture must be under pressure, and that the only honest way
to find one is to let the broken code name it):

1. **Named offenders.** Sam's profile (seed `sam:2`); the full-gym, 60-90
   minute shoulder profile; and an uninjured home-gym 60-90 profile whose
   Saturday is leg-heavy. Each must fail today, for the reason above.
2. **The properties, over the bodybuilding slice of the grid:**
   - every body-part day holds at least one exercise of its defining pattern,
     OR carries a different focus;
   - no day has three or more leg compounds unless its focus is a leg track;
   - a chest day holds two presses wherever the pool, after the family split,
     has two;
   - no trained day is under ten working sets while carrying ten minutes or
     more of optional filler, unless the pool for that day is exhausted (and
     then the day says so).
3. **A constructed case** for each mechanism handed directly to the selector,
   so the unit proves the mechanism and the grid proves it matters.
4. Mutation-tested: each property with the corresponding rule switched off.

## Measurement: the grid, before and after

Before, measured 9 Oct 2026 on this tree. Every bodybuilding combination of
the quality grid at moderate recovery and "tolerate" conditioning: 2,304
plans (4 kits x 9 injury sets x 4 lengths x 4 experience levels x 4 goals),
seeded with the grid's own keys, week 1 of each.

Each cell is a count of PLANS in which at least one day has the property (a
"how many contain one" count, not a rate per day). "Flagged" is the three
injury sets that include shoulders; "not flagged" is the other six.

| Kit, shoulder flag | Plans | Shoulders day with no overhead press and no delt raise | Shoulders day with 3+ leg compounds | Chest day with exactly one press | A day of 9 working sets or fewer carrying 10+ min of optional mobility | Gap note on a day |
|---|---|---|---|---|---|---|
| Full gym, flagged | 192 | 0 | 129 | **192** | **176** | 0 |
| Full gym, not flagged | 384 | 0 | 207 | 0 | 0 | 32 |
| Home gym, flagged | 192 | 0 | 132 | **192** | **176** | 0 |
| Home gym, not flagged | 384 | 0 | 202 | 0 | 0 | 32 |
| Minimalist, flagged | 192 | **192** | 175 | **192** | **180** | 192 |
| Minimalist, not flagged | 384 | 0 | 198 | 64 | 13 | 32 |
| Bodyweight, flagged | 192 | 64 | 0 | 0 | 0 | 64 |
| Bodyweight, not flagged | 384 | 0 | 99 | 60 | 51 | 32 |
| **All** | **2,304** | **256** | **1,142** | **700** | **596** | **384** |

What the table says, read against the five causes above:

- **Every shoulder-flagged plan with any kit has a one-press chest day** (576
  of 576 where a chest day exists), and 532 of those 576 have a day of nine
  working sets or fewer padded with ten minutes or more of optional mobility.
  Not one unflagged full-gym or home-gym plan has either. This is cause 2 and
  cause 3, and it is not a Minimalist problem.
- **Every Minimalist shoulder-flagged plan (192 of 192) has a Shoulders day
  with no shoulder work.** The tracer's 28 of 32 was a narrower slice; the
  wider one is all of them. The 64 at Bodyweight are the three-injury set
  only; for the other two see the bodyweight line below.
- **The leg-heavy Shoulders day is the commonest finding and has nothing to do
  with injuries: 706 of 1,536 unflagged plans (46%).** It is the long
  sessions. Uninjured, full gym, by length: 0 of 16 at 30-45 minutes, 3 of 16
  at 45-60, **16 of 16 at 60-90 and 16 of 16 at 90+**. At 60-90 the Saturday
  is Overhead Press, then four leg compounds, then one lateral raise (printed
  in the run: Romanian Deadlifts, Belt Squat, Bulgarian Split Squats, Hip
  Thrust). Cause 4.
- **The zeros for "Bodyweight, flagged" are the worst row, not the best.**
  Printed for this plan: a bodyweight, shoulder-flagged bodybuilding week is
  **"Legs & Calves" on all four days** (16 of 16 length and goal
  combinations checked). No press survives the flag, the chest and shoulders
  tracks are not viable, and the existing fallback picks the "richest" track
  every time. There is no chest or shoulders day left to count, so the
  columns read zero. This is the existing fallback doing what rule 1's named
  fallback is there to replace.
- The detectors were proven on the superset in the same run: each column is
  non-zero somewhere and zero somewhere, so no zero above is a detector that
  cannot fire. "Chest day with no press at all" was also measured and is 0 of
  2,304 everywhere (the bodyweight case above shows why: a chest day with no
  press stops being a chest day). That is the one column not seen to fire,
  and it is reported as such.

Also measured, as context for rule 4 rather than as a defect: in 1,523 of the
2,304 plans at least one day's required work (everything except the optional
mobility) is shorter than the shortest session asked for. That is the 23 Sep
"a short day gets the rest of its time as optional mobility" rule doing its
job; the build must report this number before and after, because borrowing
work before time should bring it DOWN and must not push any day over its cap.

The same script, unchanged, is the "after". Report both tables side by side
from one run each, with the denominators printed, plus:

- the full `test:quality` grid (9,216) for score distribution, the count
  below the 7.2 floor (must stay 0), `day_label_mismatch`, `push_pull`,
  duration failures, and weekly leg sets (question 2 of the review);
- `test:audit` for "legs on two or more days";
- working sets per day and required minutes per day, as distributions, so a
  fix that fills the thin day by overfilling another is visible.

A measurement that counts only what the change bought is half a measurement:
the leg-set and duration columns are there to catch what it costs.

## The time label ("9 sets · ~37 min")

Separate finding, same test-log item, one-helper fix.

**How 37 is made.** `estimateDaySeconds` = warm-up + two minutes of overhead +
every set's work and rest + post-session cardio + the mobility filler. For
Sam's Monday: 5.5 warm-up + 2.0 overhead + 14.9 lifting + **15.0 optional
mobility** = 37.4. The filler is sized to "budget minus actual" and the 30-45
budget's target is 37, so a filled day always reads about 37. The "9 sets"
beside it counts the two warm-up sets.

**What is left out.** Monday also carries a 30-minute walk (33 in week 2). It
comes from the fat-loss conditioning count, placed on the first light training
day, and the engine deliberately makes it a SEPARATE session for a 30-45
minute trainee: `timing: 'independent_session'`, with the reason "Scheduled as
a separate session to preserve your strict lifting window." The estimate
correctly leaves it out. The screen then draws it under a "Finish" heading in
a row labelled "Finisher", and never shows the reason. So the engine means
"22 minutes of training, a separate walk, and an optional stretch" and the
screen reads "9 sets, ~37 min, then a 33-minute finisher": 52 minutes against
a stated 40.

**The one helper.** `dayLengthParts(day)` → `{ workMinutes, optionalMinutes,
separateMinutes, workingSets, warmupSets }`, built on the existing
`estimateRequiredDaySeconds` and `optionalFillerSeconds`. Every place that
prints a day's length reads it — the programme list, Today's header, Home, the
"what happened" sheet and the coach's cards (seven call sites today, each
calling `estimateDaySeconds` bare) — so they cannot drift, and the header bug
in L17 (today's minutes shown while another day is open) is fixed by passing
the day being shown.

**The honest label proposed** (wording is Ashley's; question 3):

> **7 sets · ~22 min** · + 15 optional
>
> Separate, any time today: Walk · 30 min · Easy

and the walk's row is headed "Separate" (or "Also today"), shows its reason,
and is called a "Finisher" only when it really is one (`post_session`).

Gates: `verify:finisher`, `verify:mobility-filler`, `test:filler-yields`,
`test:cardio-effort`, `test:session-length`, `test:one-day-one-look`. New: a
driver check that a day whose cardio is an independent session never shows the
word "Finisher"; a check that the printed minutes equal work plus optional
and that both parts are on screen.

## What this plan does not do

- **It relaxes no joint tag.** How much a shoulder tick should take away is
  question 1 below and needs somewhere to store the answer.
- **It adds no catalogue exercise.** The dumbbell triceps gap (no dumbbell
  kickback, no lying dumbbell extension, no close-grip dumbbell press) is real
  and makes the Minimalist row above thinner than it should be; it is held
  for the kit-list decision, which changes which entries a dumbbell owner can
  reach.
- **It does not rebuild anyone's plan when a flag is removed.** That is H5, in
  `adaptations-respect-the-week-already-trained.md`.

## Risks

- Every bodybuilding-style plan changes, uninjured ones included (the
  Shoulders day). Scores and fingerprints move; none may fall below the floor.
- Splitting a family can put two near-identical moves on one day. The split
  is by named entries, not by a looser rule, and the new family gate pins it.
- The fallback day drops a leg exposure. If the weekly leg count falls below
  what the goal needs, the leg slot stays on the fallback day; decided on the
  measured number.
- Thin-day borrowing can unbalance push:pull for a flagged profile. That is
  the 24 Sep ruling's permitted direction (pull-heavy when pressing hurts) and
  the scorer already does not count it; the uninjured case must not move.
- No stored plan changes until it is regenerated.

## Questions for Ashley

**1. When someone ticks "Shoulders" at setup, how much should the app take
away?**

- A. Everything it removes today: all pressing except the floor press, all
  overhead work, all raises. Safest. It is why Sam got one chest exercise a
  week.
- B. Ask one follow-up — "which of these bother it?" (pressing overhead /
  pressing from the chest / pulling from overhead / lifting the arm out to
  the side) — and remove only those.
- C. Ask "a niggle you train around, or an injury?" A niggle keeps the gentle
  versions and drops only overhead work and dips; an injury behaves as today.
- **Recommended: B.** It is your own 15 Sep rule (ask which kind before
  acting) applied to the one place that skips it; the person names the
  movements, so the app makes no medical judgement. B or C needs the answer
  stored, which is a database change and needs your word.

The engine work in this plan is worth doing whichever you pick. It makes the
day honest under A, and it is what B and C would be built on.

**2. The on-screen sentence "not a bug, just a real gap in what's
available".**

- A. Keep it.
- B. Say what the day does instead: "No overhead pressing while your
  shoulder's flagged, so today is upper back and abs."
- C. Say nothing once the day has been renamed; the name is the explanation.
- **Recommended: B**, and C where the day has a new name.

**3. Should a day's time show only the work, or the work plus the optional
stretch?**

- A. As now: one number that includes the optional part ("~37 min").
- B. Both, apart: "~22 min · + 15 optional".
- C. Work only: "~22 min".
- **Recommended: B.** It is the only one where the number matches what
  someone with a hard stop needs to know.
