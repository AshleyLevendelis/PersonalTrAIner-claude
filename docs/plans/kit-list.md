# The kit you actually have — plan (engine half)

9 Oct 2026. Test log H1, H2, H3 (the engine underneath them). Tracer report:
`reports/A-equipment.md`, "The smallest design: an optional kit list". This plan
is required before the build: it touches exercise selection, injury
substitution and load ceilings.

**This round builds the engine half only.** The doors (Profile ticks, the swap
sheet, the "I don't have one" button, onboarding capture, the coach's tool and
its context line) are the next builder's. Every door is meant to be one call
into what is built here. No migration. No edge function. No onboarding edit.

## The owner's ruling

Ashley, 9 Oct 2026, asked in plain language with three options — "How should
someone tell the app what kit they have?" — chose:

> **"Remember what they say": keep the four choices; also remember specifics
> people say in setup or to the coach ("I've got dumbbells and a bench", "I
> don't own bands"), and show them as ticks in Profile. No new setup question.
> Nobody's plan changes unless they say something.**

This **revisits her 9 Sep 2026 "fix the words" choice** (from four options: fix
the words / fix the kit / ask what you actually own / words now and a checklist
later). Her reason then was that *"narrowing the sets would change every
existing plan on those tiers"*. This design does not touch the tier sets: it
adds a per-person list, read only when that person has said something. Her
9 Sep worry does not arise, and the gate holds it (a profile with no kit rows
generates byte-identical plans).

## What it is

A per-person list of **statements about kit**, each naming items from a closed
list of nine. When there are none, the four tiers decide exactly as today.

### The nine items, and what each unlocks

| Key | What the person sees | Catalogue strings it unlocks |
|---|---|---|
| `dumbbells` | Dumbbells | `dumbbells`, `dumbbell` |
| `bench` | Flat bench | `bench` |
| `incline_bench` | Adjustable / incline bench | `incline bench` |
| `barbell` | Barbell and plates | `barbell`, `EZ bar`, `trap bar`, `t-bar` |
| `squat_rack` | Squat rack | `squat rack` |
| `kettlebell` | Kettlebell | `kettlebell` |
| `bands` | Resistance bands | `resistance band` |
| `pull_up_bar` | Pull-up bar | `pull-up bar` |
| `weighted_bag` | Weighted bag | `weighted backpack` |

`bodyweight` is always allowed. The first eight are the list
`test:equipment-labels` already calls disclosable.

### Three kinds of statement

| Kind | Example | Effect |
|---|---|---|
| `has` | "I've got a bench too" | adds the items |
| `hasnt` | "I don't own bands" | removes the items |
| `only` | "I only have dumbbells and a flat bench" / a list given as the answer to the kit question | the kit is exactly these items |

Statements are applied **in the order they were said**, on top of the items the
person's tier assumes (full gym and home gym: all nine; Minimalist: dumbbells,
kettlebell, bands, pull-up bar, weighted bag; bodyweight: pull-up bar, weighted
bag). A later statement wins over an earlier one for the items it names.

**`only` is in the engine because both of her examples need it and they are
different things.** "I don't own bands" removes one thing. "I've got dumbbells
and a bench", said as the answer to what kit they have, is a list: the tester's
own words were "only prescribe what was named", and the report's design says
"when they list what they have, record exactly that list". Which sentences
count as a list is the door's call (and the next builder's); the engine
supports both and the difference is one field.

### The small extras (dip bars, box, ab wheel, medicine ball, skipping rope)

Not on the list of nine. **Decided here, and it departs from the tracer's
report** (which treated them as not owned whenever any kit row exists):

- after `has` / `hasnt` only: **they stay as the tier has them.** Somebody on
  Home gym who says "I don't own bands" has said nothing about a box. Her
  ruling: nobody's plan changes unless they say something.
- after an `only`: **not owned.** They listed what they have and a box was not
  on it. Basis (CSCS): a prescription the trainee cannot perform has no
  training effect; being wrong the other way costs one accessory.
- Likewise machines and cables: a full-gym member who says "no bands" keeps
  everything else in the gym; one who gives an `only` list keeps only the list.

### Storage — existing `user_facts` rows, no migration

Verified against `20260806090000_create_memory_and_goals.sql:40-78`:

- `kind = 'hard_constraint'`, `constraint_kind = 'equipment'` (both in the CHECK lists)
- `resolved_refs` = item keys from the closed list (nullable `text[]`, no CHECK)
- `polarity`: `'like'` = has, `'dislike'` = hasn't (nullable; CHECK allows both)
- `hardness = 'hard'` together with `polarity = 'like'` = **only** (the list is
  the whole kit). `hardness` is nullable with a CHECK of `hard` / `soft`, and no
  reader of a `hard_constraint` row looks at it.
- `source` = `'onboarding' | 'chat' | 'manual'`; `display_text` is the line
  Profile already shows under "Things it remembers", whose delete is the undo.

`getActiveFacts` already returns rows oldest first, which is the order they are
applied in. A row with no recognised item key is ignored — which is every
`constraint_kind = 'equipment'` row the coach's `record_fact` has written so
far (free text, `resolved_refs` null), so nothing already stored changes any
plan.

### The derived tier

The stored tier stays what the person picked: it is the label on Profile and
the base the statements are applied to. But things in the engine that are about
the *kind* of trainee (bodyweight phase rules, the implement preference, the
"I do not know which weights you have" sentence, whether a ceiling is asked)
read a **derived** tier when a kit list exists:

- full gym with no `only`: full gym (still a gym; less the items removed)
- otherwise: a barbell → home gym; any of dumbbells / kettlebell / bands →
  Minimalist; else bodyweight.

It is never written back, and the hydrated profile keeps the stored
`equipment_access` (overwriting it would compound: a screen that copies the
profile into state would make the derived tier the next base).

## Every choke point

| Place | Today | Change |
|---|---|---|
| `kit-list.ts` (new, pure) | — | the nine items, statements, `resolveKit`, `kitOf(profile)`, `equipmentTierFor(profile)`, `ownsKitItem`, `profileWithKit`, `travelProfile`, the fact shape for the doors |
| `fact-compiler.ts` | compiles `availability` constraints only | `compileKitStatements(facts)` — the reader the coach's equipment facts never had |
| `exercise-plan.ts` `isEquipmentAllowed`, `stageEquipmentFilter` | `EQUIPMENT_SETS[tier]` | one helper, `allowedEquipmentFor(profile)` |
| `getConstrainedPool` → generation, swap shortlist, add-an-exercise, injury substitution and rebuild, session rebuild, block rotation, the quality scorer's pool | inherit the filter | no change needed |
| every `profile.equipment_access` read in the engine (15 in `exercise-plan.ts`, plus `mesocycle-edit`, `exercise-add-candidates`, `quality-score`, `load-prescription`, `load-ceiling-prompt`, `warmup`) | the stored tier | `equipmentTierFor(profile)`; the gate fails if an engine file reads the field directly |
| `getExerciseCompatibilityWarnings` | "outside your minimalist equipment" | with a kit list: "Needs a bench — you've said you don't have one." |
| `warmup.ts` `EQUIPMENT_AVAILABLE` | a second tier→kit map (bands, pull-up bar) | with a kit list, the same ownership answer |
| `effective-constraints.ts` `constraintProfile`, `plan-adaptations.ts` `substituteForEquipment` | travel tier laid over the profile | **a travel tier describes somewhere else**: that tier's plain set, the person's own list dropped — except that a bag or bands they have said they do not have do not appear there either (they are things you bring, not things a place has) |
| `load-prescription.ts` `ceilingKindsFor` / `statedCeilingKg` / the limit sentence | by implement | never the answer for an implement the person does not have: a dumbbell-or-kettlebell lift uses the dumbbell ceiling when there is no kettlebell |
| `load-ceiling-prompt.ts` `ceilingToAskFor` | asks once per unstated implement | never asks about an implement they have said they do not have |
| `dev-constraint-audit.ts` | independent copy of the tier sets | gains its own copy of the nine and the same rule; shares no code with the engine |
| `App.tsx` | `profile` state handed to every tab | ONE derivation beside the effective exclusions: the profile every tab, swap, add, adaptation, rebuild and the coach's cards receive is the stored one plus the compiled statements. The cold-load chain (block checks that can rebuild) runs before React has state, so it compiles from the same read with the same function |
| `kit-change.ts` (new) | — | the doors' one function: record a statement → trial-fit from today to the end of the plan (trained days never touched: builder A2's day guard) → what changes → apply |

## What it takes away (the report's measured table, Sam's settings)

| Pattern | Tier pool, no injury | True kit, no injury | Tier pool, shoulder | True kit, shoulder |
|---|---|---|---|---|
| horizontal pull | 5 | 2 | 3 | 2 |
| vertical pull | 5 | **1** | 0 | 0 |
| tricep isolation | 4 | 2 | 2 | **0** |
| bicep isolation | 4 | 2 | 4 | 2 |
| shoulder isolation | 4 | 2 | 0 | 0 |
| horizontal push | 7 | **10** | 1 | **2** |
| single leg | 6 | 7 | 6 | 7 |

An honest kit is thinner than the dishonest tier exactly where a dumbbell
trainee needs it. Re-measured after the build, with the pack below, in the
backlog entry.

## The dumbbell pack (a CSCS decision, recorded as one)

Six entries the report recommends, plus a cable kickback (the catalogue holds
one kickback, a band one). Joint tags are reviewed entries, each with its
reason, not defaults. "Loads" = participates; "contraindicated" = removed when
that area is flagged.

| Entry | Kit | Pattern, tier, group, family | Contraindicated for | Reviewed, joint by joint |
|---|---|---|---|---|
| Bent-Over Dumbbell Row | dumbbells | horizontal pull, tier 2, `row`, `row` | lower back | **Lower back:** an unsupported hip hinge held under load for the whole set; same call as Barbell Rows and T-Bar Rows. A flagged lower back gets the bench-supported row. **Shoulder:** participates, kept: a neutral-grip row below shoulder height, as Dumbbell Rows and Chest-Supported Row are kept. **Elbow / wrist:** neutral static grip, no tag (as every row). **Knee:** soft, unloaded. |
| Dumbbell Tricep Kickback | dumbbells | triceps isolation, tier 3, `tricep_extension`, `tricep_kickback` | elbow | **Elbow:** loaded isolated extension whose resistance peaks at lockout; the app's standing position is that free-weight elbow isolation goes on an elbow flag and cable/band pushdowns stay. **Shoulder:** kept — arm by the side, nothing overhead, light. This is the shoulder-safe triceps movement the honest kit lacked. **Lower back:** one arm at a time with the free hand on the thigh or a bench, so nothing is held in an unsupported hinge. **Wrist / knee:** not loaded. |
| Cable Tricep Kickback | cable machine | as above | none (elbow participates) | **Elbow:** kept, with the cable and band pushdowns: smooth resistance in small steps. **Shoulder / lower back / wrist / knee:** as the dumbbell one. |
| Lying Dumbbell Tricep Extension | dumbbells + bench | triceps isolation, tier 3, `tricep_extension`, `tricep_extension` | elbow, shoulder | **Elbow:** loaded deep flexion, as Skull Crushers. **Shoulder:** kept WITH ITS FAMILY (Skull Crushers and Overhead Tricep Extension are both removed on a shoulder flag): the long head crosses the shoulder and the arm drifts behind the head under load. A neutral grip makes it kinder than the bar; relaxing it is its own reviewed decision, not a default. **Wrist:** neutral, stacked, not tagged (the bar version is). **Lower back / knee:** supine, supported. |
| Close-Grip Dumbbell Press | dumbbells + bench | horizontal push, tier 2, `bench_press`, family `neutral_grip_press` | elbow | **Elbow:** the elbows take most of the load by design. **Shoulder:** participates, kept: tucked elbows and a neutral grip are the shoulder-friendly press (Neutral-Grip Dumbbell Press and Dumbbell Floor Press are kept on the same basis). **Wrist:** neutral, stacked. **Lower back / knee:** supported. Filed as the press it is, not as triceps work: the catalogue prices and counts by pattern, and as triceps isolation it would be priced at 12kg per hand and would not count as pressing in the week's push:pull balance. It shares a family with Neutral-Grip Dumbbell Press, so a day holds one of them. |
| Dumbbell Hip Thrust | dumbbell + bench | hip hinge, tier 2, `hip_thrust`, `hip_thrust` | none (hip participates) | As the barbell Hip Thrust, which is kept on a hip flag: **hip** participates through a supported range; **lower back** supported on the bench, the standard back-sparing hinge; **knee** held at a right angle, unloaded; **shoulder / wrist** nothing. |
| Dumbbell Reverse Lunge | dumbbells | single leg, tier 2, `single_leg`, `single_leg` | knee, hip, ankle | Kinder to the knee than a walking lunge (the shin stays upright, nothing to decelerate) but still loaded single-leg knee and hip flexion with a balance demand: removed on the same three flags as Walking Lunges and Bulgarian Split Squats. **Lower back / shoulder / wrist:** dumbbells at the sides, upright trunk; no tag, as Walking Lunges. |

Basis for the pack: the catalogue holds 31 dumbbell entries and the only loaded
dumbbell row needs a bench; a trainee with dumbbells and no bench had no loaded
row at all, and one with a shoulder flag had no triceps isolation. Each entry
is the standard free-weight form of a movement the catalogue already has on
other kit (NSCA exercise technique: bent-over row, triceps kickback, lying
triceps extension, hip thrust, reverse lunge).

**Loads (safety-adjacent).** Each new entry is priced by the category it
already belongs to; where one fraction does not fit the implement the E1
pattern is followed (a factor on the reference, never a new category, so
ceilings, steps and coherence groups do not move): a kickback works at about
half of a pushdown per hand (short lever, peak torque at lockout: 5-10kg per
hand is the working range for an intermediate man). Measured before and after
on the whole catalogue; only the new entries may move.

## E2's two measured costs (the same defect twice)

Both are **improvised kit beside better kit**: a band triceps movement second
on chest days (192 of 192 full-gym shoulder-flag plans, 343 of 384 home gym,
378 of 384 Minimalist) and a backpack or band raise beside the dumbbell one on
479 of 1,728 Shoulders days.

Why it happens: "a band or a bag loses to a real weight" is a **ranking
penalty**, and a penalised candidate still wins when it is the only one left —
which is what the one-per-family rule arranges once the real weight is already
on the day.

The fix, decided as a CSCS coach:

0. **A bag is still a bag when the entry also says "bodyweight".** Found
   while writing the gate: Backpack Row and Loaded Backpack Walk list
   `['bodyweight', 'weighted backpack']`, every item required, and the rank
   function took the best of the two — so neither was ever "improvised kit",
   here or in the quality scorer. A full-gym plan could hold a Backpack Row
   beside cable and dumbbell rows (it did, in the gate's first sample). They
   now rank as what carries the load. Two entries. **This widens what the
   scorer's `worse_implement_than_available` rule can see**, so the "after"
   count is measured by a stricter rule than the "before".
1. **Eligibility, not ranking.** When a day is being filled, a band or bag
   movement the person owns a properly loading equivalent of (the app's one
   existing definition, `hasBetterLoadingPeer`: same substitution group and
   tier, a real loadable implement, in THEIR pool) is not a candidate at all —
   the same pool block rotation has used since 8 Sep. Rehab and trunk work stay
   exempt (her ruling). Someone whose only option is a band keeps it.
2. **The pack gives the second triceps job a real implement** (a cable or
   dumbbell kickback), so rule 1 does not cost the second triceps movement.
3. **A second delt movement is a different delt job.** The general fill takes
   at most two movements of one family onto a day (two angles or implements is
   what a coach writes; a third is padding).
4. **A freed slot on a Shoulders day does not borrow a row when the day has its
   press** (E2's withdrawn fix borrowed one on 375 uninjured days and the
   week's balance pass answered by trimming the back day).

Measured on E2's own 2,304-plan slice and 768-plan quality sample, before and
after, in the backlog entry — including what it takes away.

## The five CSCS questions

1. **Training effect.** Improves it. A movement that cannot be performed has
   none; a dumbbell row replaces a backpack row with a load that progresses.
   An improvised duplicate of a lift already on the day adds fatigue to the
   same fibres on a tool that cannot be loaded properly.
2. **What it takes away.** An honest kit thins vertical pulling and triceps
   isolation (table above), answered by the pack. The eligibility rule removes
   band/bag "variety" from long days; what fills the slot instead is counted in
   the same run.
3. **Fundamentals.** Push, pull, hinge and squat survive for {dumbbells,
   bench}. Vertical pull does not exist without a bar or bands; the app's gap
   note already says so honestly. Progressive overload improves (real
   implements). Recovery and specificity unchanged.
4. **Floors and ceilings quietly redefined.** (i) The implement rule's comment
   says "a minimalist owns a kettlebell and dumbbells": false for a bands-only
   kit; safe because the demotion test reads the real pool; comment corrected
   and a bands-only fixture is in the gate. (ii) The stated-ceiling cap for a
   dumbbell-or-kettlebell lift becomes "the heaviest thing they have that can
   do it" where "have" now excludes a kettlebell they have said they do not
   own — it can only lower a cap. (iii) "Improvised kit loses to real kit"
   moves from a penalty to an exclusion at selection. (iv) The scorer's
   `worse_implement_than_available` rule now also sees the two bag movements
   that list "bodyweight" beside the bag: the after-count is by a stricter
   rule than the before-count (it can only read higher than the old rule
   would have).
5. **Scope.** Inside. Equipment selection, substitution and load are
   delegated. Nothing here diagnoses or treats; no existing joint tag is
   changed; the pain rule is untouched.

## Gates

- **New `test:kit-list`, written first and seen red.** For each kit in a small
  grid (dumbbells + bench; dumbbells only; bands only; dumbbells + bench +
  pull-up bar; full gym less bands): no generated, swapped, added, rebuilt or
  injury-substituted slot needs an implement outside the kit, checked against
  the gate's own table AND the audit's independent copy; a profile with no kit
  rows produces byte-identical seeded plans; the tester's profile with
  {dumbbells, flat bench} gets Dumbbell Rows as its main back lift and no band,
  bag or kettlebell movement anywhere, including the warm-up, the knee
  adaptation's substitutes and the travel card; the ceiling question; the
  mixed-implement cap; the warning wording; the record → trial → apply function
  against a stand-in database; trained days untouched.
- Existing gates derived from the diff, plus `test:bundle` and
  `test:no-dead-code`. A catalogue change reads into nearly every gate; the
  orchestrator's merged sweep covers the rest.
- `test:audit` then `test:quality`, once, at the very end, on the committed
  tree.

## Risks

- **A wrong `only`.** A list taken as the whole kit when it was a remark
  ("I've got dumbbells at my mum's too") strips a plan. The engine cannot tell;
  the doors must show what changes before applying (the function returns it)
  and the row's delete on Profile undoes it.
- **Thin kits.** Bands only leaves no loaded hinge; the plan is built from what
  exists and the day says so. Measured in the gate's grid.
- **Two readers of the tier.** A new engine read of `profile.equipment_access`
  would ignore the list; the gate fails on one.
- **Cold load.** The block checks run before the memory read that feeds React;
  they compile the kit from their own read. A failed read falls back to the
  tier (as today) and logs it.
- **Catalogue additions move seeded plans** wherever a new entry is in the
  person's pool, picked or not (the tie-break draws from the same seeded
  stream). Counted, by kit, in the backlog entry.
- **Stored plans do not change** until they are next rebuilt or a kit statement
  is applied through the doors' function.
