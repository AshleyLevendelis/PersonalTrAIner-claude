# Teach the quality score that rehab is a legitimate second warm-up

## Context

`f7939ef` made rehab actually prescribed: a shoulder- or knee-injured trainee
now gets the work their joint needs in **every** session, up from ~51% arriving
by luck. Shoulder rehab is warm-up tier — seven of its nine movements are
primers — so an injured session now opens with two short movements: the primer
for that day's training, then the rehab primer. Roughly 15 seconds each.

The app's own quality score marks that down. Measured on this machine, same
9,216 combinations, my work stashed for the baseline:

| dimension | before `f7939ef` | after |
|---|---|---|
| Time fit | 1.53 | 1.55 |
| **Structure** | **1.95** | **1.81** |
| Progression | 1.66 | 1.66 |
| Selection | 1.95 | 1.94 |
| Goal alignment | 1.97 | 1.96 |
| Primer fit | 2.00 | 2.00 |
| **Overall** | **11.05** | **10.94** |

Structure is the entire delta. The cause is one rule, `quality-score.ts:218-228`:

```ts
if (entry?.mechanics_tier === 'primer' && i !== 0) { …violation… }
```

Any primer at any position other than the first is a violation. The rule
encodes "a session has exactly one warm-up, and it comes first" — true before
rehab existed, and now wrong for injured trainees specifically. At
`RULE_PENALTY = 0.4` per *distinct* rule type (`:55`), tripping this one rule
costs 0.4 of Structure, and the 0.14 average implies roughly a third of
combinations newly hit it.

**Ashley's ruling:** keep both warm-ups — a shoulder-injured person should warm
up for the day's actual training *and* do their rehab — and fix the check so
the score reflects the plan honestly. She was told explicitly that this changes
what the score measures.

The alternative she rejected was making rehab *replace* the day's primer. It
would have restored 11.05 with no measurement change, at the cost of leaving a
shoulder-injured trainee with no leg preparation before squatting on leg day —
trading a metric problem for a training one.

## The build

### 1. Narrow the rule instead of deleting it

`scoreStructure(mesocycle)` (`src/lib/quality-score.ts:210`) does not currently
receive the profile. `scorePlan(profile, mesocycle, comboKey)` (`:1093`) has it
and passes only the mesocycle, so this is a one-argument thread, not new
plumbing.

The rule becomes: **warm-ups must be contiguous at the front of the session,
and a non-first one is only acceptable when it is rehab for a joint this
trainee actually reported.** Concretely, a primer at `i > 0` violates unless
both hold:

- every exercise before it is also primer-tier, and
- `isIndicatedFor(entry, flaggedJoints)` for this profile's own injuries.

Reuse `getFlaggedJoints` (`exercise-plan.ts:407`) and `isIndicatedFor`
(`exercise-db.ts:3144`) rather than re-deriving either — `quality-score.ts`
already imports from both modules. Do **not** relax to "any primer carrying
`indicated_joints`": that would pass a rehab warm-up for someone who never
reported the injury, which is precisely the tag-answering-the-wrong-question
shape the last five rounds have all been.

This keeps the rule's teeth. Two arbitrary warm-ups still violate. A warm-up
after the main lift still violates. A knee drill for a shoulder injury still
violates.

### 2. Check the neighbouring rules are genuinely unaffected

`core_before_main` (`:230-243`) fires on core/carry/finisher work before the
main lift. Knee rehab is `tier3_isolation` with quad/hamstring patterns, so it
should not trip — **verify rather than assume**, since knee rehab is placed
before the main lift by design and this is the rule most likely to object.

### 3. Make the next attribution cheap

`run-quality-score.ts` prints deductions only for sampled worst-case combos
(`:235-237`) with no aggregate. That is why attributing this 0.11 drop cost a
stash-and-rerun of two 14-minute sweeps. Add a per-rule frequency table to the
report — additive output, no scoring change — so "which rules newly fired"
is answerable by reading two reports.

## Verification

- **Unit assertions in `test:rehab-prescribed`**, so the relaxation cannot
  silently widen later:
  - an injured profile's rehab second primer does **not** trip
    `primer_not_first`;
  - a non-rehab second primer **still** does;
  - a rehab primer placed after the main lift **still** does;
  - an uninjured profile scores identically to before the change.
- **Re-run `test:quality`.** Expect Structure back to ~1.95 and overall to
  ~11.05. If it lands materially short, `primer_not_first` was not the whole
  story — find what else is firing rather than accepting the number. The new
  rule-frequency table makes that a diff, not another bisect.
- `test:audit` (0/13,967) and `test:rehab-prescribed` re-run — the scorer is
  not in the generation path, so both should be untouched; cheap to confirm.
- `tsc -b`, `npm run build`.
- Discard `audit-report.txt` and `quality-report.txt` before committing
  (PROJECT-LOG §7.5). `quality-report.txt` currently holds the **pre-`f7939ef`
  baseline** and is worth reading before it is overwritten.

## Say it loudly, in writing

CLAUDE.md: *"If a metric's scale, denominator, or threshold changes, say so —
prior numbers stop being comparable."* This changes what Structure measures.

Record in both `BACKLOG.md` and the plan doc: **Structure scores from before
this change are not comparable for injured profiles.** The 1.81 reading was not
a real quality regression — it was the scorer penalising a deliberate,
Ashley-approved decision — and the ~1.95 after this change is not an
improvement earned by better plans. Uninjured profiles are unaffected either
way, so the overall figure remains comparable for them.

## Out of scope

- The five injury codes with no rehab movements at all (hips, ankles, elbows,
  wrist, lower back). Already flagged in `BACKLOG.md`; whether the app should
  say so rather than stay quiet is Ashley's call.
- `main_lift_short_rest` and `frozen_week`, both present in the baseline and
  unmoved by this work.
- Preferring loadable variants over resistance bands — still open, still wants
  its own measurement pass.
