# Actually prescribe the rehab

## Context

Someone tells the app they have a shoulder or knee problem. The app is good at
what it does next — it stops prescribing what would hurt them. It does nothing
at all to help them.

The database already carries the other half. `indicated_joints` is documented
in `exercise-db.ts` as *"the prep/rehab work a physio would prescribe FOR that
joint. These are not merely tolerated: **the plan should deliberately include
them when the matching injury is present**, which is the whole reason this is a
third state rather than a boolean."* Nineteen entries carry it.

Nothing implements that sentence. `isIndicatedFor` (`exercise-db.ts:3144`) is
called in exactly two places in `src/`:

- `isContraindicatedFor` (`:3150`), so a rehab movement is never *excluded* by
  the injury filter — it stays eligible;
- `exercise-plan.ts:3457`, which appends *"Chosen to help your shoulder — keep
  it light and controlled"* to a movement that was already picked for entirely
  unrelated reasons.

So the tag keeps rehab movements in the pool and nothing ever reaches for them.
The label is written as though a choice was made; no choice was made. This is
the same defect shape as the last three rounds — a tag that answers one
question (may this be excluded?) standing in for another (should this be
chosen?) — except here the file's own doc comment states the intended behaviour
and it was simply never built.

**A correction that shaped this plan.** My first count of the tagged entries
was wrong: I matched `indicated_joints:` with a regex that also matches the
tail of `contra`+`indicated_joints:`, so I read contraindication data as rehab
data and reported joints (wrist, neck, lower back) that carry no rehab
movements at all. Re-counted by whole entry, the real coverage is **9 shoulder
and 10 knee, and nothing else**.

That recount is what makes this plan two-shaped rather than one:

| | tiers available | cost per set |
|---|---|---|
| **Shoulder** | 7 primers (Band Pull-Aparts, Wall Slides, Prone Y-T Raises, Scapular Push-Ups, Arm Circles, Band Dislocates, Band Face Pulls) + 2 isolation | 15–18s |
| **Knee** | **no primers.** 7 isolation + 3 tier2 compound | 24–40s |

A "second warm-up slot" would therefore have fixed shoulders and done nothing
whatsoever for knees.

**Ashley's rulings.** (1) Rehab goes in *every* session, not just matching
days. (2) Asked again once the asymmetry was measured — knee rehab is real
exercise, not a warm-up — she confirmed every session, **taking the gentlest
option**: a short-arc quad set, not a Spanish squat. Rehab works through
frequency, and at that size it costs about what a shoulder warm-up costs.

## The build

### 1. One rehab pick per session

New `pickRehabMovement(pool, flaggedJoints, weeklyUsed)` in
`src/lib/exercise-plan.ts`, reusing `isIndicatedFor` rather than re-reading the
array (that is how the wrist/neck miscount happened in the first place).

Gentlest-first ordering, which the data forces to be tier-then-duration:
**every** knee entry is `joint_stress: 'low'`, so that field cannot
discriminate and must not be used to pretend it can.

1. `mechanics_tier === 'primer'` first — the whole shoulder set.
2. Then `tier3_isolation`, ascending `avg_duration_seconds` — knee lands on
   Seated Short-Arc Quad Set (24s, bodyweight, so available at every equipment
   tier), then the 28s band and slider curls.
3. **Never `tier2_compound`.** That is Ashley's ruling made mechanical: it
   excludes Wall Sit (40s), Spanish Squat and Step-Down (Eccentric) from the
   rehab slot. They remain available as ordinary exercises.

Weekly variety uses the same idiom the primer already uses at `:1430` —
`shuffle(pool.filter(p => !weeklyUsed.has(p.name)))[0] ?? shuffle(pool)[0]` —
so rehab rotates across the week rather than repeating one movement.

### 2. Call it from `selectExercisesForTrack`, and protect it

It already holds the constrained pool and already returns
`{ primer, main, requiredNames, … }` (`:1399`, `:1834`). Add the rehab pick to
that return and **add its name to `requiredNames`**.

That last part is the whole guarantee, and it is reuse rather than new
machinery: `stageTimeCap`'s `protectedNames` parameter (`:778`) already means
"never removed outright under duration pressure, may still lose sets". "In
every session" and "the thing time pressure deletes first" cannot both be
true, and the existing mechanism already resolves exactly that conflict for
required slots.

Two details that are easy to get wrong:

- **Bypass `primer_pattern_affinity`.** Affinity is track fit — the shoulder
  primers are tagged for push/pull patterns, so on a leg day an affinity-
  respecting pick finds nothing. Rehab is not track work; a shoulder needs its
  band pull-aparts on leg day too.
- **Seed `usedGroups` with the pick's movement family**, mirroring the existing
  `if (primer) usedGroups.add(getMovementFamily(primer))` at `:1442`. Without
  it a knee-injured trainee can draw Sliding Leg Curl as rehab and again as an
  accessory — the identical duplication that line already exists to prevent.

### 3. Make the label mean what it now says

`exercise-plan.ts:3457` already writes "Chosen to help your shoulder — keep it
light and controlled." Until now that sentence was untrue: nothing chose it.
Re-read it once the choice is real and correct it if it now over- or
under-claims. No new copy invented if the existing line is honest.

## Verification

- **BEFORE, measured first**: across a sweep of shoulder-injured and
  knee-injured profiles, what fraction of sessions already contain at least
  one indicated movement by luck? Knee rehab movements are also some of the
  only leg work that survives a knee injury, so the knee baseline may already
  be high and the shoulder baseline near zero. Report both; the AFTER number
  is meaningless without them.
- **New gate `npm run test:rehab-prescribed`**, named for the behaviour:
  every session of a shoulder-injured profile contains an indicated shoulder
  movement, and the same for knee, across seeds and equipment tiers; the pick
  is never a `tier2_compound`; it never duplicates an accessory in the same
  day; it rotates across a week rather than repeating; and — the over-fire
  check — an **uninjured** profile's plan is byte-identical to before.
- **`npm run test:audit` must stay at 0/13,967.** Duration is the real risk
  and injured profiles are already in the sweep
  (`dev-constraint-audit.ts:300`). Adding a movement to every session is
  precisely what put `'Back & Biceps'` 6 minutes over budget last round. If
  failures appear, verify causation by stashing before concluding.
- `test:joint-tag-states`, `test:injury-separation`, `test:injury-rebuild`,
  `test:workout`, `test:slot-replacement`, `tsc -b`, `npm run build`.
- `test:quality` before/after — primerFit and Selection are the dimensions
  this should move; report if anything else does.
- Browser-verify against the local mock: generate a plan for a
  shoulder-injured profile and show the rehab movement present on a **leg**
  day, which is the case the affinity bypass exists for.
- **No deploy** — engine and selection only, ships with the Vercel push.

## Flagged, deliberately not built

- **Five injuries get nothing.** `getFlaggedJoints`' own comment records that
  only 5 of 8 `INJURY_OPTIONS` codes map to a joint at all (hips, ankles and
  elbows are collected at onboarding and map to nothing), and of the five that
  do, only shoulder and knee have any indicated movements. Someone reporting a
  hip problem will see no change. Whether the app should say so rather than
  stay quiet is a real user-facing question and Ashley's to answer — asking it
  now would stall this build behind it.
- **No scoring bonus for indicated movements in ordinary slots.** Adding one
  to `scoreCandidate` would over-fire: a knee-injured trainee would draw leg
  curls into accessory slots all week on top of the guaranteed rehab pick. One
  guaranteed slot is what was ruled.
- **No new tags and no new exercises.** Widening rehab coverage is a content
  decision with a physio-shaped question behind it, not a code change.

---

# What actually happened

Four things the plan did not predict. Recorded here rather than smoothed over,
because three of them were only found by looking at output rather than at a
green gate.

## 1. The BEFORE number was not zero — it was 51%

The plan said the app "does nothing at all to help them", which described the
MECHANISM correctly (nothing selected on the tag) and gave a badly wrong
impression of the OUTCOME. Measured: rehab already reached **51.0%** of a
shoulder-injured trainee's days and **50.7%** of a knee-injured trainee's,
arriving by luck of the shuffle — seven of the nine shoulder-indicated
movements are primers, so an ordinary primer pick lands on one often.

The defect was never "no rehab". It was "rehab as a coin toss", plus **40 of
144 knee plans containing none at all across sixteen weeks**. Both joints are
now at 100%, uninjured control unmoved at 0%.

## 2. A style preference was deleting a safety response

The guarantee stalled at 75% for knees, in a suspiciously clean quarter of
profiles. Cause: `stageStyleFilter` stripped every knee-rehab drill from
anyone who picked **'bodybuilding'** — full gym left one survivor (Lying Leg
Curl), and home gym, minimalist and bodyweight left **zero**, because a seated
short-arc quad set is tagged functional/hybrid and nobody tags a rehab drill
'bodybuilding'. `MIN_VIABLE_POOL` never fired: the pool stayed large, just
missing the one category that mattered.

That function's own comment already drew the line it was crossing — "style is
a preference, not a safety constraint — unlike equipment (you physically don't
have the kit) or injury (it will hurt you)". Indicated movements now pass the
style filter. The exemption is gated to rehab only, and asserted to be.

## 3. A regression I shipped four commits earlier

`test:injury-rebuild` was already failing before any of this work — verified
by stashing, then bisected to **`6646854` "Shrugs are not shoulder work"**,
my own commit from the previous session, which I reported as green because
the gate list I ran that round did not include this one.

The mechanism is the shrug plan's own stated risk: splitting `isolation_trap`
out of `isolation_shoulder` left the trap pattern holding exactly two
movements, both shrugs, both **contraindicated for a neck injury**. So a
neck-injured trainee's 32 shrug slots had no same-pattern replacement and were
dropped outright, which reads downstream as "a whole movement pattern was
wiped" and forced a full rebuild over what is genuinely a thinning injury.
Before the split they fell back to lateral raises, which a neck injury allows.

I verified the split did not orphan shrugs for an UNINJURED trainee (54 of 288
days) and never checked what it did to an injured one. The plan named the
invariant; the verification only covered half of it.

The general bug underneath: `getSmartReplacements` demanded an exact
`movement_pattern` match **with no fallback at all**, while plan-build has had
`NEAREST_PATTERN_FALLBACK` for exactly this since long before traps existed.
Any thin pattern could hit the same wall. The map now lives in `exercise-db.ts`
beside `MovementPattern` with both readers importing it, and the swap path
falls back rather than dropping a slot. The over-fire check that matters still
passes: a shoulder injury, which genuinely wipes `vertical_pull`, still forces
a rebuild.

## 4. Two warm-ups doing the same job

Found by reading a generated plan, not by a gate: a session opened "Scapular
Push-Ups, Scapular Push-Ups". The ordinary primer pick and the rehab pick draw
from the same small set, and `usedGroups` stopped `main` colliding with rehab
while saying nothing about the primer. Where the day's primer is already
indicated for the injured joint, no second rehab movement is added — the
guarantee is that every session carries rehab, not that every session carries
a rehab slot. `test:rehab-prescribed` §2b now asserts no exercise appears
twice in a session, across 384 injured days.

## Also changed

The warning copy read "**Chosen** to help your shoulder". That was false while
nothing chose anything. It is true now for the guaranteed pick, but the
function that writes it sees only an exercise and a profile — never which slot
placed it — so it still fires on a rehab movement an ordinary accessory slot
happened to pick. Now "**Good for** your shoulder", which is true in both
cases without threading provenance down to the label.

## Verified

- `report:rehab-coverage`: shoulder 51.0% -> **100%**, knee 50.7% -> **100%**,
  uninjured control **0% before and after**, knee plans with no rehab 40 -> 0.
- `test:audit`: **0 failures / 13,967 combinations**, re-run after each change.
  The duration risk the plan flagged did not materialise — rehab movements are
  15-30s and the injured pool already had room.
- New `test:rehab-prescribed`; plus `test:injury-rebuild` (now passing),
  `test:joint-tags`, `test:injury-separation`, `test:injury-adaptation-safety`,
  `test:plan-adaptations-separation`, `test:workout`, `test:slot-replacement`,
  `test:pattern-tags`, `test:per-side-load`, `test:mesocycle-roundtrip`,
  `test:training-week`, `test:starting-out`, `test:block-consistency`,
  `tsc -b`, `npm run build`.
- Read real generated plans for both injuries rather than trusting the
  counters — which is the only reason §4 was found.

## Still flagged, not built

Five of the eight injury codes a user can pick have no rehab movements at all
(`getFlaggedJoints` maps only five to a joint; of those, only shoulder and knee
have indicated entries). Someone reporting a hip, ankle, elbow, wrist or back
problem sees no change. Whether the app should SAY so rather than stay quiet is
a user-facing question for Ashley.

---

# Follow-up: the quality score had to be told

## The measurement, and why it moved

Adding a rehab warm-up to every injured session cost 0.11 of the overall
quality score. Measured on one machine, same 9,216 combinations, with the work
stashed for the baseline:

| dimension | before | after |
|---|---|---|
| Time fit | 1.53 | 1.55 |
| **Structure** | **1.95** | **1.81** |
| Progression | 1.66 | 1.66 |
| Selection | 1.95 | 1.94 |
| Goal alignment | 1.97 | 1.96 |
| Primer fit | 2.00 | 2.00 |
| **Overall** | **11.05** | **10.94** |

Structure was the entire delta, and one rule caused it. `primer_not_first`
flagged any primer at any position but the first — encoding "a session has
exactly one warm-up". True until rehab was prescribed; wrong for injured
trainees after. At 0.4 per distinct rule type, a third of combinations newly
tripped it.

## Ashley's ruling

Keep both warm-ups and fix the check. The alternative — making rehab REPLACE
the day's primer — would have restored 11.05 with nothing measured differently,
at the cost of a shoulder-injured trainee having no leg preparation before
squatting on leg day. A metric problem traded for a training one.

## The change

A primer past position 0 is now acceptable only when **every exercise before
it is also a primer** AND it is **indicated for a joint this trainee actually
reported**. `scoreStructure` takes the profile (one argument threaded from
`scorePlan`, which already had it) and reuses `getFlaggedJoints` and
`isIndicatedFor`.

Deliberately NOT relaxed to "any primer carrying `indicated_joints`" — that
passes a rehab warm-up for someone who never reported the injury, which is the
same tag-answering-the-wrong-question shape as the five defects before it.

The rule keeps its teeth, and `test:rehab-prescribed` §7 asserts all three:
a second warm-up that is not rehab is still flagged; a rehab warm-up after the
main lift is still flagged; and an uninjured profile with the identical day is
still flagged.

## METRIC CHANGE — prior numbers stop being comparable

**Structure readings for INJURED profiles from before this change cannot be
compared with readings after it.** The 1.81 was the scorer penalising a
deliberate, approved decision, not plans getting worse; the recovery is not
plans getting better. Uninjured profiles are unaffected in both directions,
so their figures remain comparable.

## Also added

`run-quality-score.ts` now prints a per-rule frequency table across all swept
combinations, not just the ten worst-scoring plans it samples. Attributing this
0.11 drop required stashing the work and running two 14-minute sweeps to
discover a single rule was responsible. The next such question is a diff
between two reports.
