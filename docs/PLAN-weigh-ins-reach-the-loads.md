# When you finally step on the scales, your lifting weights should catch up

The follow-on to backlog item 2b (`docs/PLAN-honest-loads-without-a-body.md`),
chosen by Ashley on 2026-08-24 and built the same day.

---

## Context

Weighing yourself updated your food targets and nothing else. `computeTargets`
prefers the latest `daily_metrics` reading over the immutable signup weight;
the training side read only `profile.weight_kg`, and `generateMesocycle` runs
exactly once, at onboarding. There is no block-boundary regeneration, so the
sixteen weeks of loads written at signup were the loads forever. Editing
"Onboarding weight" in Profile hit the same dead end.

**Item 2b made this cost more, not less.** Replacing the 75kg-male stand-in
with a deliberately light one (50kg/female/60) means a 100kg man who declines
is now prescribed **0.35×** his real loads, where before he got 0.76×. That is
the right trade while we know nothing — but the moment he weighs in we *do*
know, and nothing noticed. Closing this was the completion of 2b, not an extra.

## Ashley's ruling

> **Ask them first.** A weigh-in produces a message — "you've told me your
> weight; want me to redo your starting weights?" — and nothing changes unless
> they say yes.

She was shown and accepted the cost: someone who ignores the message stays on
the deliberately-light weights. Two design consequences follow, both built
rather than re-asked:

1. **The offer survives being ignored.** A durable `pending | confirmed |
   declined` row, re-surfaced on every app load. Explicitly **not**
   `pending_actions`, whose `PENDING_WINDOW_MINUTES = 10` would have expired
   the offer before most people reopened the app — a one-shot that vanished
   would quietly restore the very problem the ruling was avoiding.
2. **The offer names the numbers.** "Rebuilding them would take Trap Bar
   Deadlift from 47.5kg to 95kg." Asking first is only meaningful if they can
   see what they are agreeing to.

---

## What was built

- **`weight_basis_offers`** — one small table modelled on `load_suggestions`,
  which is the same pattern for a single exercise. Rows are also the receipt:
  `basis_weight_kg` records what a confirmed rebuild derived from, and the
  `headline_*` columns record what the trainee was shown before agreeing.
- **`src/lib/weight-basis-offer.ts`** — check / confirm / decline, with the
  rules exported as pure functions so the gate needs no database.
- **`rebuildForWeightBasis`** — the "yes" branch, built on `rebuildForInjury`.
  The shared half is now `rebuildAgainstProfile`, so week-identity
  preservation (`week_number`, `block_number`, `label`, `phase_label`) is not
  re-derived per caller — anything holding a week reference (logged sets, the
  active session, `load_suggestions` rows keyed by block) resolves through it.
- **The profile row is never written.** `weight_kg` is formally the immutable
  onboarding weight; the corrected weight lives on a local clone only, the
  same separation `test:injury-separation` protects for injuries.
- **Decline is permanent**, and the button says "No thanks" rather than
  "Dismiss" — a dismiss-shaped control on a decision that never comes back
  would be the app deciding for them while looking like it hadn't.

### A prerequisite, found while verifying

The Home tab spun on **"Loading your day…" forever** for anyone who declined a
body metric: `computeTargets` returns null for them, and `Dashboard`'s load
effect required `macros` while `loading` initialises to true. `WeighInCard`
lives inside `Dashboard`, so the offer's main trigger could not fire for the
persona it was built for.

*Correction to the previous session:* I saw this same spinner during the 2b
browser run and attributed it to the local mock returning empty rows. That was
wrong — it reproduces against a real database and the mock was irrelevant. The
error shape is worth naming: I explained away an app defect as harness noise
because the harness was already known to be partial.

`loadDashboardData` now takes `MacroTargets | null` and reports
`hasNutritionTargets`; the calorie tile renders "0 kcal · no target yet" with
no ring, rather than "of 0 kcal" — the placeholder
`MissingBodyMetricsNotice`'s own doctrine forbids.

---

## Three bugs the gate caught

1. **"The plan holds `assumed_body` loads" is not the eligibility rule.**
   Someone who declined weight, age *and* sex still has an unknown sex after a
   weight rebuild, so their loads stay correctly marked `assumed_body` and
   that flag stays true forever — the offer would have re-asked on every app
   load. `rebuildChangesAnything` is the real test, and it counts a provenance
   change as well as a weight change.
2. **The headline was "largest INCREASE"**, which silently skipped the one
   case with a real safety cost: a trainee *lighter* than the light stand-in,
   currently carrying numbers too heavy for them. Now largest absolute change.
3. **Preview and confirm disagreed.** Each called `generateMesocycle` with the
   default RNG, so they selected different exercises — the offer could name a
   lift the applied rebuild never contained. It surfaced as a flaky assertion
   that passed or failed on what `Math.random` returned. Both runs are now
   seeded on profile id + basis weight.

A fourth, found in the browser: the confirm handler posted "Done — the rest of
your plan now uses your real weight" even when the rebuild returned null and
nothing had been written.

---

## Measured

`scripts/run-assumed-body-report.ts`, new third column, computed through the
real rebuild path rather than a fresh generation.

| Persona | declined | after weighing in + confirming |
|---|---|---|
| 40yo woman, 68kg — declined **weight only** | 0.89× | **0.98×** |
| 35yo man, 100kg — declined all three | 0.35× | **0.57×** |
| 52yo woman, 55kg — declined all three | 0.94× | 0.90× |

**0.57×, not the ~1.00× the plan predicted.** A weigh-in supplies one of three
metrics, and sex is the larger term (female standards are 0.53–0.67× male). So
weighing in closes the weight half and leaves the sex half open. Supply sex
later in Profile and the offer fires again — which is why no wording claims
the weight was the missing piece, and why a persona declining weight alone was
added to isolate what a weigh-in genuinely can fix.

## Verified

- **`npm run test:weight-basis`** — eligibility and over-firing, the rebuild
  never reaching backwards, week identity preserved, the profile row
  unmutated, reproducibility across two runs, both message shapes. Confirmed
  deterministic across repeated runs.
- **`test:dashboard`** extended for the absent-targets payload.
- `test:assumed-body`, `test:workout`, `test:mesocycle-roundtrip`,
  `test:plan-adaptations-separation`, `test:injury-separation`,
  `test:session-derive`, `test:training-week`, `test:starting-out`,
  `test:activity-streak`, `test:audit` (54 pre-existing failures, unchanged),
  `tsc -b`, `npm run build`.
- **Browser, end to end** against the local mock: declining persona onboards,
  Home loads, a 100kg weigh-in produces the offer, confirming rebuilds the
  plan and today's main lift moves **22.5kg → 42.5kg**.

## Deploys owed

- **`npm run db:push-both`** for the migration — TEST first, then PRODUCTION
  behind the typed confirmation, relinking to TEST afterwards. **Not applied:**
  `*.supabase.co` is 403 from this sandbox. The feature is inert until it is —
  every offer read will fail against a missing table.
- Frontend ships with the Vercel push. No edge function involved.

## Still open

- **Ordinary weight drift** (gave 90kg at signup, now weighs 78kg) — the same
  defect one-fifth the size, deliberately untouched: the progression engine
  already corrects anything they log, and widening this would change loads for
  people who never asked.
- The 51 `isolation_shoulder` audit failures — cable lateral raises prescribed
  ~2× too heavy, because a *unilateral* cable exercise is not recognised as
  per-side. One exercise in the whole database is affected; it would take the
  sweep from 54 failures to about 3.
- Load ceilings by equipment tier.
