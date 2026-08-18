# Plan: make exercise selection prefer the best tool the trainee actually owns

Status: PLAN ONLY — approved to write, not yet built.
Origin: a real Push day put Band Tricep Kickback in a full-gym advanced
profile's tricep slot, while the Pull day two days later correctly used a
lat pulldown and a cable row.

---

## The finding this is built on (verified, not assumed)

Equipment is currently a **filter**, never a **preference**. `pool` is
filtered by what the trainee can physically do, and after that the scorer
(`scoreCandidate`, exercise-plan.ts) never looks at equipment again.

Concretely, for a full-gym profile's tricep slot:

| Candidate | tier | tier score | equipment score |
|---|---|---|---|
| Tricep Pushdowns (cable machine) | tier3_isolation | 30 | — none exists — |
| Band Tricep Kickback (resistance band) | tier3_isolation | 30 | — none exists — |

Identical on every axis. The only separation is the ±0.3 random
tie-break, so it is close to a coin flip. That is the entire mechanism
behind the "why is a band in my full gym" complaint — not a broken
filter, not a duplicate bug, just an absent preference.

`isRegressionFor` (periodization.ts:322) does down-rank easier variants
for experienced lifters, but it is a hardcoded list of 14 NAMES
(Push-Ups, Air Squat, Goblet Squats...). No band exercise is on it, and
adding every band exercise by name would be the same unscalable pattern.

## Why the injury case needs no special-casing

Ashley's ruling: prefer the better tool, but keep bands when they are the
injury-safe option.

That falls out of existing order-of-operations rather than needing a
carve-out. Injury filtering happens **before** scoring — `findForSlot`
scores `pool.filter(...)`, and `pool` is already injury-filtered. So when
a shoulder rules out pushdowns and skull crushers, those candidates are
already gone and the band wins on being the only survivor, whatever
penalty it carries. A scoring preference can only ever choose between
options that are already safe for that person.

This is worth stating explicitly because it is the difference between a
5-line change and a fragile "is this the safe one?" predicate.

**Caveat found while checking this:** Band Tricep Kickback's shoulder-safe
rationale exists ONLY as a source comment (exercise-db.ts, above the
entry). It carries no `indicated_joints` tag, unlike the knee-rehab
entries which do. So the app cannot currently read "this is the safe
option" from data. That does not block this plan (filtering covers it),
but it means the reasoning is invisible to every future change. Tagging it
is a separate small item.

## Data inconsistency that must be fixed first

The equipment vocabulary is freeform and has at least one true duplicate:

- `dumbbells` — 22 entries
- `dumbbell` — 5 entries

Any equipment logic keying on exact strings treats these as different
implements. Before adding preference scoring, normalise the vocabulary
(and add a gate test asserting every `equipment` value is drawn from a
known set, so this cannot silently regress). Full current vocabulary is 31
distinct strings; the rest looked internally consistent on inspection but
should be eyeballed as part of this step.

---

## The change

### 1. An equipment-quality rank, not a band blacklist

Rank implements by how well they load a working set — roughly:

- **high**: barbell, EZ bar, trap bar, cable machine, machine, leg press
  machine, hack squat machine, dip bars, pull-up bar, dumbbells,
  kettlebell
- **medium**: bodyweight, bench/incline bench (as the loaded implement),
  medicine ball, plyo box, ab wheel
- **low**: resistance band, weighted backpack

Deliberately a property of the IMPLEMENT, not a list of exercise names —
that is what makes it scale to every new exercise added later, which the
`REGRESSION_VARIATIONS` name-list approach does not.

Cardio machines (treadmill, rowing machine, stationary bike, elliptical)
sit outside this axis entirely — they are selected by the cardio
reservation, not this scorer, and must not be ranked against strength
implements.

### 2. Score it, weakly

Add an `equipment_fit` factor to `scoreCandidate`'s existing `factors`
object, worth roughly ±1 — the same order as `role_support` and
`goal_fit`, deliberately far below the tier gap (30/60/90) so it can
reorder two same-tier candidates but can NEVER promote an isolation
exercise over a compound. Same discipline the tier comment already
documents.

Only applies when the trainee actually has the better implement — a
bodyweight-only or minimalist profile must see no change at all, since
for them the band IS the best available tool. This is the main
regression risk and the thing the measurement below has to prove.

### 3. Make the harness able to see it

`quality-score.ts` scores 6 dimensions (`timeFit`, `structure`,
`progression`, `selection`, `goalAlignment`, `primerFit`) across a
profile grid with a 1.2/2.0 floor. It has no concept of equipment
appropriateness, so today it would score the good Pull day and the
band-carrying Push day identically.

Add an equipment-appropriateness deduction to the `selection` dimension:
a full-gym profile receiving a low-rank implement where a high-rank one
was available and safe is a real selection defect and should cost points.

**This step is the one that makes it stick.** Without it, we fix the
tricep slot today and rediscover the same class of problem elsewhere in a
month with no automated signal.

---

## Verification (before/after, measured, not asserted)

1. `test:quality` across the full profile grid, before and after —
   per-dimension averages, and specifically whether `selection` moves.
2. Count how many exercise picks change across the grid. If the answer is
   "only triceps", the fix is too narrow and the ranking needs revisiting;
   if it is "hundreds", check nothing regressed in bodyweight/minimalist
   profiles, which must be **zero change**.
3. `test:audit` diffed against the committed baseline (the ✗ count is
   deterministic per-commit — any movement must be explained, not
   absorbed).
4. `test:differentiation` — confirm goal differentiation did not shift as
   a side effect.
5. Regenerate the exact reported Push profile (full_gym / advanced /
   hypertrophy) and confirm the tricep slot now resolves to a cable or
   barbell option, and that a shoulder-injured variant of the same profile
   still gets the band.

Report all of it as before/after numbers. If a dimension DROPS because
days got correctly different, say so rather than smoothing it over — that
has happened repeatedly on this engine and is worth naming when it does.

---

## Explicitly not in scope

- Gemini's "redundant heavy pressing / add lateral raises" critique. That
  is a programming-taste opinion about slot composition, not a verified
  defect, and it should be judged on its own evidence rather than bundled
  into a mechanical fix.
- The deferred item 2b (training loads still assume 75kg when weight is
  declined) — already logged in BACKLOG.md, separate plan.
- Retagging Band Tricep Kickback with `indicated_joints`. Small, real,
  but a data-quality task rather than part of this behaviour change.
