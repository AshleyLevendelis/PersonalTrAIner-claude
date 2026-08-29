# A stated lift the app's own table calls impossible

## What happened

Ashley, from her live profile: *"i didn't tell the app i could deadlift 150 but
it claims i did. and 150kg is a lot and someone who hasn't specified or shown
they can lift that could injure themselves."*

Her Exercise tab showed **Trap Bar Deadlift 152.5 kg**, labelled **YOU TOLD
US**, with a ramp to 140 kg × 1 and three working sets at 152.5.

## What is actually wrong, measured against the app's OWN standards

Profile: male, 86 kg, advanced. `STRENGTH_STANDARDS_1RM_PER_BW` in
`load-prescription.ts` is the table the app already uses to estimate loads.

| lift | stated | app's advanced 1RM estimate | stated as % of it |
|---|---|---|---|
| squat | 100 kg | 172 kg | 58% — normal |
| **bench** | **150 kg** | **129 kg** | **116%** |
| deadlift | 150 kg | 215 kg | 70% |

A stated *working* weight above the app's own top-tier *one-rep-max* estimate
is not a strong lifter, it is a wrong number.

And the pair is conclusive: **stated deadlift ÷ bench = 1.00×. The lowest
ratio anywhere in that table — either sex, every experience level — is
1.67×.** The two numbers are outside anything the app itself considers
possible, and nothing consults the table to notice.

## The three gaps

1. **No plausibility check.** The only validation on a stated lift is
   `isNumberIn(1, 500)`. The app has a typo guard for what weights someone
   *owns* (`load-ceiling-prompt.ts`, "deliberately wide — this is a typo
   guard") and none for what they can *lift*, which is the more dangerous.
2. **It is then trusted above everything.** `load_source: 'known_weight'`
   outranks the app's estimate, skips the starting-light hedge, and with
   `skip_calibration_week` skips the calibration week entirely. One
   unverified number becomes a confident heavy prescription on day one.
3. **It cannot be corrected.** There is no squat/bench/deadlift row in
   `ProfileScreen.tsx`. The only route is chat, via `record_goal` →
   `fact-compiler.ts` → the same columns — indirect and undiscoverable.

## Provenance — stated as evidence, not proof

Bench and deadlift are *exactly* the same number, which is the signature of a
mis-assignment rather than two independent answers. The "100, 150" bug — the
model assigning numbers to lifts by the order its own sentence listed them —
was live when this profile was created. That path is closed as of today's
deploy. The resulting data is still in the profile.

## Ashley's ruling

**"Ask once, and never skip calibration on it."** Two layers:

1. At the point of entry the app queries an implausible number plainly, which
   catches typos and mis-assignments while they are cheap to fix.
2. If confirmed anyway, the number is still recorded — but it may not skip
   the calibration week, and it may not anchor day-one loads. Calibration
   week already says exactly the right thing: *"Loads start deliberately
   light — find the weight where the last rep feels like RPE 6, log it, and
   next week builds from YOUR numbers."*

## Design

**`src/lib/lift-plausibility.ts`** — pure, and it **imports** the standards
table rather than restating it. A second copy of the numbers that decide
whether a weight is safe is exactly the drift this repo keeps finding.

Two rules, both deliberately narrow so a false positive is rare:

- **Above the ceiling.** A stated working weight above the **advanced** 1RM
  standard for that body — not their own tier's, the top tier's — so only
  genuinely impossible figures flag. Needs bodyweight; skipped when the body
  is assumed, because a ratio against a guessed weight proves nothing.
- **Impossible pair.** Deadlift below `bench × 1.25`. The table's own minimum
  is 1.67×; 1.25 leaves generous room for a bench specialist while still
  catching 1.00×. Needs no bodyweight at all, so it works for someone who
  declined their weight.

**Wiring:**
- `exercise-plan.ts` — an implausible lift is dropped from
  `knownWorkingWeights` (so it cannot anchor a load) and forces
  `canSkipCalibration = false`.
- `SlotNumericCard` — the ask, inline, where a typo is cheapest to fix.

## Verification

1. Ashley's exact profile flags bench (ceiling) and deadlift (pair).
2. A plausible advanced lifter flags nothing — the false-positive check.
3. A flagged lift produces a calibration week and does not anchor loads.
4. Mutations bite on every rule and on both wiring points.

## Deploy

Client-side only → Vercel. No edge-function change, no migration.
