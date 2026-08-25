# A chin-up that actually gets heavier

## Context

Ashley's correction while scoping the tempo work: **"Pull ups can add weight."**
Right, and it exposed a defect the app has been carrying quietly.

`npm run report:added-load`, over four equipment tiers x four experience
levels x four goals x three splits x four bodies (including the
declined-metrics one):

| exercise | slots | carrying a weight |
|---|---|---|
| Pull-Ups | 3,960 | **0** |
| Chin-Ups | 3,912 | **0** |
| Tricep Dips | 608 | **0** |
| Chest Dips | 448 | **0** |

**8,928 slots, none of them loaded.** And the trace of what a block actually
does to them is the whole argument (full gym, advanced, 80kg male, loading
weeks only):

```
Pull-Ups   w1:9-11  w2:10-12  w3:11-13 | w5:6-8 w6:7-9 w7:8-10 | w9:3-5 w10:4-6 w11:5-7 | w13:6-8 ...
```

An **advanced** trainee's pull-up drops from 9-11 reps to **3-5 reps** in
week 9, with nothing added. A three-rep set of bodyweight pull-ups, for
someone the plan believes can do eleven, is not a strength block — it is
less work. The phase note says *"Heavier and lower rep"* and delivers only
the lower rep.

### What existing design already hands us

- **The population is already safe.** All three of Pull-Ups, Chin-Ups and
  Chest Dips carry `capability_requirement: { minExperience: 'intermediate' }`,
  so a beginner or novice never sees them — measured, they appear in **0**
  slots at those tiers. Added load only ever concerns intermediate and
  advanced.
- **The declined-metrics case is already conservative.** `ASSUMED_BODY` is
  `{ weightKg: 50 }`, deliberately the lightest plausible body, so anything
  scaled off bodyweight is automatically low for someone who declined —
  which is exactly the item-2b invariant `test:assumed-body` guards.
- **The shape already exists.** `prescribeAssistance` is this same problem
  with the sign flipped: a stateless, experience-scaled table, deliberately
  NOT reusing `prescribeLoad`'s standards/known-weight/ramp machinery
  because none of it has an assistance equivalent. The same reasoning
  applies here, so this mirrors that function rather than inventing a
  parallel to `prescribeLoad`.

## The build

### 1. `prescribeAddedLoad`, the mirror of `prescribeAssistance`

> **CORRECTION — this section is not what the first draft of this plan said,
> and the difference matters.** The original design scaled the added weight
> DOWN as reps rose (`REP_SCALE`: 1.0 at <=5 reps, 0.6 at 6-8, none above)
> with a `0.7 / 0.85 / 1.0` step across the block's weeks. It was built,
> measured, and produced this:
>
> ```
> Pull-Ups  w9:3-5@+12.5  w10:4-6@+15  w11:5-7@+10   ...and w7:8-10 with none
> ```
>
> The weight went **up then down inside one block** and **vanished at the top
> of another** — because reps climb within a block (that IS the within-block
> lever) and the rep scale cut the weight as they climbed. Two levers pulling
> against each other, producing more reps at less weight: a deload wearing
> progress's clothes, the exact failure the frozen-week round already
> documented. Rewritten below before anything shipped.

The weight keys on the **phase**, not the week's rep count:

```
addedKg = bodyweight x FRACTION[experience]     // intermediate 0.10, advanced 0.18
        , only when phase is 'strength' or 'power'
        , constant for the whole block
```

A phase cannot change inside a block, so the weight is constant by
construction and reps stay the within-block lever. One lever at a time — the
rule `loadStepUnaffordable` follows, and the rule the tempo prescription one
file over follows. It also mirrors the goal policies' own
`progressionEmphasis: 'reps'` pattern, which already has copy for exactly
this: *"Weight holds flat by design — reps climb. That IS the progression."*

The fractions are set on the cautious side **because** the weight holds: an
80kg advanced male carries 15kg through a strength block whose reps climb
3-5 -> 5-7 underneath it, which is demanding by the end. Too light costs a
boring set; too heavy costs a shoulder.

Returns `null` — meaning bodyweight, exactly as today — when:

- the entry has no `accepts_added_load` (the other 129 exercises);
- **the phase is not a heavy one.** In an anatomical-adaptation or
  hypertrophy block the bodyweight set IS the work. This is also what keeps
  the change scoped: every light block is byte-for-byte identical to before;
- **it is a deload.** Recovery comes from doing less, not from carrying the
  same belt for fewer reps — the same reason tempo skips deloads;
- **it is the calibration week.** The app has never seen this person do a
  single pull-up. Week one finds the baseline;
- experience is beginner or novice. Unreachable today via the capability
  gate, asserted anyway so relaxing that gate cannot silently start loading
  a novice's dips;
- the rep target is above 10 — a guard, not a scale, against a phase config
  that ever prescribes a heavy block at fifteen reps. Never fires today.

### 2. Two ceilings, because the estimate is a guess about a stranger

- **35% of bodyweight, absolute.** A backstop against a formula bug, in the
  spirit of `SAFETY_CEILING_KG`: no arithmetic error can produce something
  absurd.
- **`IMPROVISED_IMPLEMENT_CEILING_KG` for a bodyweight-tier trainee.**
  Ashley said "loaded backpack", and for someone with no gym that IS the
  implement — straps, no rigid frame, the failure mode that ceiling exists
  for. 8/12/20/25kg by experience, applied on top.

### 3. It is ADDED weight, and the screen must say so

A new `suggested_added_load_kg` on `Exercise`, **not** `suggested_load_kg`.
Putting 17.5 in the ordinary load field would render "17.5kg" next to
"Pull-Ups", which reads as *lift 17.5kg* — a lie of exactly the kind the
LoadChip's own header exists to prevent. Rendered as **"+17.5kg"** through
its own chip, the way `suggested_assistance_kg` already has `AssistanceChip`.

Keeping it a separate field also means every consumer of `suggested_load_kg`
— `enforceLoadCoherence`, quality-score's `load_incoherent`, the frozen-week
report, `isLoadlessWeek`, the tempo exclusion — carries on treating a pull-up
as it always has. No silent reinterpretation of an existing field.

## Verification

- **`npm run report:added-load`** before/after. Target: the >8-rep weeks stay
  at 0 (unchanged by construction), the low-rep strength weeks carry a real
  number, and beginner/novice stay at 0 slots.
- **New gate `npm run test:added-load`**:
  - an advanced trainee's strength block carries weight; the hypertrophy and
    anatomical-adaptation blocks do not;
  - the weight does NOT change inside a block, and reps DO climb underneath
    it — the two halves of "one lever at a time", pinned so the rejected
    rep-scaled design cannot come back;
  - neither the calibration week nor a deload ever does;
  - never on an exercise without `accepts_added_load`;
  - **a declined-metrics profile never gets more than a stated one** — the
    item-2b invariant, checked directly rather than trusting `ASSUMED_BODY`;
  - both ceilings hold, including the backpack one at the bodyweight tier;
  - the value is plate-rounded, never a number nobody can load;
  - the chip renders it as "+Nkg", never as a bare weight.
- **`test:assumed-body` must stay green** — this is the gate that caught the
  frozen-week attempt that produced a 6kg RDL.
- **`test:audit` at 0 / 13,967**; `test:session-length`; `test:quality`
  (11.19). Added weight does not change set duration, so the duration risk
  is low — but it is measured, not assumed.
- `test:tempo-prescription` (these four must stay excluded from tempo),
  `test:frozen-weeks`, `test:loadless-notes`, `test:band-slots`,
  `test:mesocycle-roundtrip`, `test:per-side-load`, `test:starting-out`,
  `tsc -b`, `npm run build`.
- **No deploy** — engine + frontend, ships with the Vercel push.

## Out of scope, flagged

- **Dips could take more than pull-ups.** A dip is usually the stronger
  movement, and Tricep Dips (a bench dip) is weaker than Chest Dips. One
  fraction table covers all four, deliberately on the conservative side —
  the file's own doctrine is that too light costs a boring set and too heavy
  costs a shoulder.
- **No logged-history path.** Once real sets exist,
  `getDoubleProgressionRecommendation` should take over here as it does for
  loaded lifts. That needs a set-logging schema that can record added
  weight, which is the same open question `prescribeAssistance` already
  documents for assistance.
