# The leg curl she actually does

## Context

Ashley, 10 Sep 2026, mid-session, from the gym floor. Four observations on one
exercise:

1. She wanted to swap Dumbbell Leg Curl for an **Iso-Lateral Kneeling Leg
   Curl** and it was not offered.
2. The card said **"26 kg per hand"** on a movement she performs **per leg**.
3. **"24kg per leg is very heavy considering this is calibration week."**
4. **Swapping gave her no prescribed weight at all.**

**Asked which movement she actually does**, offered the three shapes: **"Machine,
one leg at a time"** — the iso-lateral kneeling machine. So the app has been
prescribing, labelling and offering alternatives for a movement she does not do.

## What is actually true, measured

- **The machines WERE offered — ranked 4th and 5th.**
  `getReplacementCandidates('Dumbbell Leg Curl', full_gym)` returns, in order:
  Sliding Leg Curl (bodyweight), Single-Leg Sliding Leg Curl (bodyweight),
  Seated Band Leg Curl (band), Lying Leg Curl (machine), Seated Leg Curl
  (machine). At a full gym she had to scroll past three unloaded options to
  reach a loaded one.
- **That is also why the swap produced no weight.** Measured through
  `prescribeLoad`: the top three return `Bodyweight` / `kg = null` — correctly,
  they have nothing to load. Not a null bug; a bad default. Swapping silently
  converted a loaded hamstring lift into an unloaded one.
- **Iso-Lateral Kneeling Leg Curl is not in the catalogue at all.** Six leg
  curls exist; none is a per-leg machine.
- **A CORRECTION I OWE HER.** I told her "yours is unchanged at 24kg, nowhere
  near any cap". That was measured on a stand-in 70kg intermediate, not her
  plan. Her real card reads 26kg per hand = 52kg of dumbbell; with the
  single-implement fix merged it reads **~48kg** (the ceiling), not 24kg. The
  label fix is right and does nothing for the weight. I quoted a number from a
  profile I invented and called it hers.

## The change

### 1. The movement she does, in the catalogue

Add **Iso-Lateral Kneeling Leg Curl**: `equipment: ['machine']`,
`unilateral: true`, `movement_pattern: 'isolation_hamstring'`,
`mechanics_tier: 'tier3_isolation'`, `substitution_group: 'leg_curl'`.

`'machine'` is in `STACK_MACHINE_EQUIPMENT`, so `isPerSideLoad` returns true for
a unilateral entry: the estimate is halved and labelled per side, which is the
correct arithmetic for one leg working at a time. Lying Leg Curl prescribes
~27.5kg for both legs, so this lands near ~14kg for one — a sane per-leg number.

### 2. It says "per leg", because that is what it is

`(single side)` is the existing vocabulary and reads wrong on a leg movement —
her point 2. Add a `per_leg` label mode alongside `per_hand` / `single_side` /
`total`, chosen when a per-side entry's primary muscles are lower-body. Every
place that already branches on the label handles it: `formatLoad`,
`loadLabelMode`, `labelModeForEntry`, `splitLoadDisplay`, `LoadChip`'s
substring test, `SetGrid`'s header, `set-plausibility`'s suffix map.

The number does not change. Only the words do.

### 3. A loaded lift is not replaced by an unloaded one, by default

In `getReplacementCandidates`, sink candidates that can carry NO external load
below those that can, when the outgoing exercise IS externally loaded — the
same stable-partition shape as the existing improvised-kit demotion directly
above it, and for the same reason: someone whose machine is busy still wants
the slider on the list, just not above the machine.

### 4. The dumbbell version's ceiling

Not hers any more, but still wrong for anyone: 48kg clamped between the feet is
not a thing a person can do. Out of scope for this slice and left named — it
needs its own number, and she has already said the general area feels heavy.

## The guarantee

Extend `test:single-implement` (already the home of the leg-curl unit rules) or
a sibling gate:

- the per-leg machine exists, is in the `leg_curl` group, and is reachable as a
  swap for the dumbbell version;
- its prescribed number is per-leg — roughly half the two-leg machine, not equal
  to it;
- its label says **per leg**, and no dumbbell-pair lift's label changed;
- **for a loaded outgoing exercise, no unloaded candidate outranks a loaded
  one** — pinned as that property over the whole catalogue, not as this one
  exercise's list, so the next loaded lift with a bodyweight-heavy group is
  caught too;
- every existing per-side invariant still holds (`test:per-side-load` §4/§5).

Every new check mutation-tested. Browser: the swap dialog at 390×844 showing the
machine reachable without scrolling, and the row reading per leg.

## Costs

Frontend only. No function deploy, no migration. Merging to `main` needs her
word, and the single-implement fix is still sitting unmerged ahead of this.
