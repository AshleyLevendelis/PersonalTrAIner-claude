# Honest loads when we don't know the body

Backlog item **2b**, split out of the refusal-trap slice on 2026-08-17 and
picked up on 2026-08-24 because Phase 1 of the onboarding work made it
reachable: declining a bodyweight went from a dead end to a one-tap button.

---

## The defect

`resolveParentOneRepMaxKg` in `load-prescription.ts` was the **single
chokepoint** through which every body metric entered every prescribed weight:

```ts
const bodyweight = profile.weight_kg || 75
const gender = profile.gender === 'female' ? 'female' : 'male'
const age = ageAdjustment(profile.age || 30)
```

Three fabrications, silently. `types.ts` already stated the policy for exactly
these fields — *"undefined means 'the user has not told us', never 'assume
something sensible' … **NEVER substitute a default when one of these is
missing**"* — and the nutrition side honours it (`resolveBodyMetrics` → null →
`MissingBodyMetricsNotice`). The load engine was the one subsystem that opted
out, in three `||`s.

Sex was the larger half of the error: female standards are 0.53–0.67× male,
and the check was `=== 'female' ? … : 'male'`, so *unknown* fell to male
rather than being treated as unknown.

### Measured, before

`scripts/run-assumed-body-report.ts` — matched pairs, same persona twice
(stated vs declined), seeded identically so a load difference is the
substitution and not RNG. Ratio = declined ÷ stated.

| Persona | wk 1 | wk 5 | lifts >1.15× | worst |
|---|---|---|---|---|
| 55kg 52yo woman, novice | **2.01×** | **2.09×** | 18 of 18 | 3.00× |
| 100kg 35yo man, intermediate | 0.76× | 0.78× | 0 | — |
| 75kg 30yo man, novice *(the assumed body)* | 1.00× | 1.00× | 0 | — |
| "I know my numbers", none entered | **2.22×** | — | — | no calibration week at all |

Every one of those numbers was labelled **"suggested"** — the same word used
for an estimate built from a real body.

### Why the existing safety nets didn't cover it

Both nets key on `fromKnownWeight` ("is this anchored to a self-reported
number"), which is **orthogonal** to "is the bodyweight real".

- **Calibration conservatism** fires only when `options.isCalibrationWeek`,
  and `exercise-plan.ts` set that to `weekCounter === 1 &&
  profile.skip_calibration_week !== true`. For a user who said "I know my
  numbers" it never fired anywhere in the program. Only
  squat/goblet_squat/bench/deadlift are anchored — the other ~12 categories
  got 100% of the fabricated estimate from session one.
- **The unverified ramp cap** is `Math.min(previous + step, estimate)`. It
  caps week-over-week *velocity*, and its ceiling **is** the fabricated
  estimate.
- The absolute ceilings can't help: `LOADING_CEILING_KG_PER_HAND_OR_TOTAL` is
  an implement limit (barbell 300kg) sitting 3–6× above every fabricated
  number, and `SAFETY_CEILING_KG` is dev-tooling only.

**A related bug found on the way:** `skip_calibration_week` was set from
`knowsWorkingLifts === true` alone, and the three lift-number slots are in
`NEVER_BLOCKING_SLOTS`. Tapping "I know my numbers" and entering **nothing**
yielded no calibration week *and* no known weights, on every lift.

---

## Ashley's rulings

1. **Ask once more, at the point it matters** — at plan generation, explain
   that weight is what sets the starting weights, and offer one more chance.
   Still refusable.
2. **For someone who still declines: force a calibration week, and say why.**
   Keep a real number on screen; make it start low and self-correct.

---

## What was built

### 1. `resolveBodyBasis` — the substitution can't be made silently

One exported function at the chokepoint returns the body **and** whether any
of it was invented (`assumed`, plus `missing` in user-facing words). It does
not return null the way `resolveBodyMetrics` does, because ruling 2 says keep
a number on screen — it returns the number *and* the caveat, so no consumer
can read one without the other.

### 2. The assumed body is deliberately a LIGHT one, not an average one

**This is the change that actually fixed the numbers, and it is not what the
plan originally proposed.** The plan proposed damping the estimate for as
long as the body was assumed. That was built first and measured: the week-1
ratio did not move at all — **still 2.01×** — because a *stated* profile's
week 1 is also a calibration week, so the same multiplier applied to both
sides and cancelled out. It made everyone's numbers smaller and the
fabrication no smaller.

The fabrication is in the body, so the fix is the body:

```ts
const ASSUMED_BODY = { weightKg: 50, gender: 'female' as const, ageYears: 60 }
```

75kg/male/30 was the middle of the population, which sounds neutral and is
not: it makes the error symmetric when the *consequences* are not.
Prescribing a light trainee twice what they can lift is a squat that can hurt
them on their first ever session. Prescribing a heavy trainee half what they
can lift is one boring set, which they correct by logging — the app's own
self-correction path, and exactly what a calibration week asks for. Age 60
rather than 30 for the same reason: `ageAdjustment()` is flat to 40 and only
falls after, so 30 was the single most aggressive choice available.

It releases per field — someone who gives a weight but declines their age
keeps their real weight.

**No second multiplier on top.** A conservative body *and* a conservatism
multiplier compounds to absurdity (a 100kg man on 2kg dumbbells) without
adding safety.

### 3. Calibration cannot be skipped on a body we invented

`canSkipCalibration` now requires all three: the flag, **at least one lift
number actually entered**, and a real body. `knownWorkingWeights` is
deliberately *not* gated on it — someone who gave real lift numbers but
declined their weight keeps those numbers on the lifts they anchor and gets a
calibration week for everything else.

### 4. The app stops asserting something untrue

- New `load_source: 'assumed_body'`, third state alongside `estimate` and
  `known_weight` (`PrescribedLoadSource`), persisted in `mesocycle_weeks.days`
  JSONB — **no migration**.
- `isUnverifiedLoadSource()` exists because adding the state silently broke
  every `=== 'estimate'` comparison in the direction that matters: the least
  trustworthy state would have read as the most.
- Chip label **"starting light"**, not "suggested" — that word implies we
  suggested it *for them*. Fainter dashed chip than an estimate, so the visual
  order matches the confidence order.
- The basis string no longer reads *"from strength standards for your
  bodyweight, sex and experience"* to someone who gave us none of the three.
- `MissingBodyMetricsNotice` no longer says "Your training plan is
  unaffected" when weight, age or sex is what's missing — that was true only
  for height.
- The sex question no longer says it's for "your calorie maths" alone.

### 5. Ask once more, at the review (ruling 1)

At the onboarding review — the point the number is about to be used — one
line saying weight is what sets the starting weight on every lift, what
happens without it, and an inline **Add it now**. Refusing still generates the
plan.

### 6. Exercise selection was contaminated too

`isolationTargetBelowFloor` uses the same reference, so with the old 75kg male
stand-in a 50kg woman never got the lower-floor dumbbell sibling and was
handed a 20kg barbell curl. Fixing the chokepoint fixed this for free.

---

## Deviation from the plan, flagged

**The plan's damping approach was built, measured, and replaced** (see §2
above). The plan also flagged an open interpretation of ruling 2 — whether to
damp for week 1 only or for as long as the body is assumed. That question is
now moot: there is no damping. The conservative body is a permanent, visible
assumption rather than a hidden indefinite discount, which is a better answer
to "start low and self-correct" and doesn't need arbitrating.

**One fix beyond item 2b's scope**, found by this item's own gate and fixed
because the gate could not otherwise pass: the unverified ramp tracker
(`lastUnverifiedLoadingWeekKg`) is keyed by **slot position**, and variations
rotate at block boundaries — so a lift returning to a slot it left five weeks
ago stepped up from whatever had been sitting there. Observed: Romanian
Deadlifts ran 8kg in week 3, vanished for a block, and returned at **16kg** in
week 9. That breaks the invariant `UNVERIFIED_RAMP_STEP_KG` is written around
("never more than one increment between an unverified lift's own consecutive
loading weeks") and is the same contamination the `forceStartingWeightKg`
path already guards against. Now also keyed by lift name, with the slot value
kept as the fallback for a genuinely new variation — dropping it entirely
would reintroduce the block-boundary snap the ramp exists to prevent.

---

## Verified

### Measured, after

| Persona | wk 1 before → after | wk 5 before → after | lifts >1.15× |
|---|---|---|---|
| 55kg 52yo woman, novice | 2.01× → **0.94×** | 2.09× → **0.94×** | 18 → **0** |
| 100kg 35yo man, intermediate | 0.76× → 0.35× | 0.78× → 0.36× | 0 → 0 |
| 75kg 30yo man, novice | 1.00× → 0.52× | 1.00× → 0.46× | 0 → 0 |
| "I know my numbers", none entered | 2.22× → **0.93×** | — | calibration week now fires |

Nobody is the assumed body any more — that is the point. The control row
moving off 1.00× is the fix working, not a regression.

### Gates

- New `npm run test:assumed-body` — the invariant stated once (*no prescribed
  load may derive from a body metric the user never gave without being marked
  as such, and must never exceed what the same person would get if they had
  told us*), plus the over-firing matrix, plus an end-to-end walk of all 16
  weeks (264 prescriptions, not one heavier for the declined profile).
- `test:audit` byte-identical (54 pre-existing failures, unchanged).
- `test:quality` over 9216 combinations: overall **11.04 → 11.05 / 12**,
  Progression **1.65 → 1.66**, every other dimension unmoved. The gain is the
  ramp-tracker fix — fewer `frozen_week` findings, because an unverified lift
  now steps from its own last number instead of sitting at a stranger's
  ceiling. The regenerated `quality-report.txt` is deliberately not committed
  (PROJECT-LOG §7.5).
- `test:workout`, `test:mesocycle-roundtrip`, `test:block-consistency`,
  `test:block-review`, `test:ramp-visibility`, `test:session-derive`,
  `test:onboarding-slots`, `test:training-week`, `test:reply-guarantee`,
  `test:injury-separation`, `test:no-forked-state`, `tsc -b`.

### Live, in the browser

Declined-body persona driven through onboarding against the local mock
(`*.supabase.co` is 403 from this environment — see below):

- The review shows the ask-once-more line and its **Add it now** button.
- The generated plan opens on **"Wk 1/16 · B1 Calibration"** — the forced
  calibration week.
- Deadlifts render **22.5kg** under **STARTING LIGHT**, not "SUGGESTED".

**No deploy needed** — all client/engine code, ships with the Vercel push.

---

## Still open

- **The load path ignores later weigh-ins.** `nutrition-targets.ts` prefers
  the latest `daily_metrics` weight; the load path reads only
  `profile.weight_kg`. Someone who declines at onboarding but weighs in daily
  keeps assumed-body loads. Not fixed here — it widens the change.
- `SAFETY_CEILING_KG` remains dev-tooling only, never imported by runtime
  code.
- The `isolation_shoulder` load_cap failures in the audit are a pre-existing,
  separately-tracked finding.
