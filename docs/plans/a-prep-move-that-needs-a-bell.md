# A prep move that needs a bell gets a weight

Ashley, 18 Sep 2026, mid-session: *"Swapped exercises doesnt show prescribed
weights."* Her Kettlebell Swings sat in the PRIMER slot with no weight anywhere
on the card, a box offering `0`, and a plate calculator link beside it. She put
24kg on the bell and logged it.

## What is actually happening — measured, not assumed

`prescribeLoad` DOES return a number for Kettlebell Swings: 8kg, computed with
the primer's own RPE label, under the same ceilings as everything else. Three
places then throw it away:

    suggested_load_kg: isPrimer ? null : load.starting_weight_kg

`exercise-plan.ts:3542` and `:4902` (generation) and `mesocycle-edit.ts:302`
(swap). Measured across a generated mesocycle: **64 of 64 primer slots carry
`kg=null`, `suggested_load: "Light"`.** So the swap is not the defect and there
is no parity gap — the swap is faithfully reproducing what generation does.

**The rule is right for most primers and wrong for this one.** The primers the
generator picks are Wall Slides, Standing Band Hip Abduction, Bodyweight Squat
Marches — nothing to load. A kettlebell swing is a primer that cannot be done
without choosing a weight, and the app had one and said nothing.

### And a second defect on the same card

`SetGrid.defaultWeightFor` ends `return suggestedLoadKg != null ? String(...) : '0'`.
With no prescription the box does not merely look empty — **it defaults to 0, so
tapping the tick on a blank row logs 0kg.** That is the app inventing a
prescription, which `load-prescription.ts:12` forbids in as many words.

## Her ruling, 18 Sep 2026, from three options

**A starting weight, kept light.** Over "say Light, no number" and over asking
her once and remembering. Her reason, in the option she chose: the app already
works one out and throws it away, and she should not be guessing in the gym.

## The build

1. **One predicate, three call sites.** A primer keeps `suggested_load_kg`,
   `per_set_load` and `load_source` when the movement is externally loaded, and
   keeps `null` when it is not. Nothing else about a primer changes: the
   intensity stays `Light — movement prep` and the guidance stays *"Stay light
   and controlled. This is preparation, not a working set."* on BOTH branches,
   because that sentence is the ruling's other half.
2. **The number is not a new number.** It is what `prescribeLoad` already
   returned for that slot, with the primer's own RPE label passed in — so it is
   computed as prep, under every existing ceiling. No new arithmetic, nothing
   invented, and `load_source` travels with it so the card can still say where
   it came from.
3. **A blank box stops inventing 0.** Where a movement is externally loaded and
   nothing is prescribed, the box says `type it` rather than defaulting to 0.
   An unloaded movement keeps 0, which is the honest record of a bodyweight set.

## Safety

This makes the app prescribe a weight where it previously prescribed none, so
it is a load-prescription change and gets this plan first.

- The value comes from the ONE function every other slot uses, already clamped
  by the implement ceilings and the plausibility rules; none of that is
  bypassed.

  **CORRECTED, MEASURED, and this is the important half.** The first draft of
  this plan said the number "is computed as prep" because `prescribeLoad` is
  handed the primer's own `targetRpeLabel`. **It is not.** Measured on one
  profile, one movement, three labels:

      label="Light — movement prep"  ->  10kg
      label="RPE 7-8"                ->  10kg
      label=undefined                ->  10kg

  The label reaches the function and changes nothing. So what the card now
  shows is **the movement's own conservative starting prescription** — for a
  kettlebell swing at an 80kg intermediate, 10kg — and the app does NOT
  additionally lighten it for being prep. That is honest and it is an
  improvement on a blank card with a box offering 0, but it is only half of
  "kept light": the number is light because the MOVEMENT is light, not because
  anything made it lighter.
  **The residue is named rather than papered over**: a primer that is also a
  heavy movement would show a heavy number under the word Light. The fix is to
  take the fraction from the warm-up ladder the app already builds for working
  lifts rather than invent a constant — and that is its own change, with its
  own measurement, not a line smuggled into this one.

  **CLOSED 18 Sep 2026 — and decided here rather than asked, under Ashley's
  standing delegation of training questions** (CLAUDE.md, *Asking*): how heavy
  a movement-prep set should be is programming, not product taste.

  **The decision: half the working weight.** A specific warm-up set is
  submaximal by definition — its job is to rehearse the pattern and raise
  tissue temperature, not to accrue stimulus — and the conventional first
  rung of a warm-up ramp is ~50% of the day's working load. Crucially the app
  does not need told that: `RAMP_SCHEMES` in `warmup.ts` already starts every
  experience level's build-up at 50%, and `ABBREVIATED_RAMP_SCHEME` agrees. So
  the primer takes the LOWEST non-zero rung the ladder actually contains,
  derived from those tables rather than written down again. Change the ladder
  and the prep weight follows; nothing can drift apart, and no number is
  invented — which is what `load-prescription.ts:12` demands.

  **Floored, never rounded to nothing.** Half of a light bell can land below
  the lightest implement that exists, so the result goes through the same
  `roundToPlate` every other prescription does and then through the loading
  mode's own floor. A prep weight is never a number nobody can load.

  **One decision, not four.** The four call sites each carried their own
  four-way ternary — the exact shape that produced the personal-best bug a day
  earlier, where three sites re-derived one value and two got the same case
  wrong. They now all call one function, so the weight and the words it is
  printed beside cannot disagree.

  **What stays**: `Light — movement prep` and the prep sentence, on both
  branches, unchanged. The number only ever moves DOWN from what shipped
  yesterday, so nothing that was readable becomes unreadable.
- It can only ever go UP from what the app already computed and hid — the
  change reveals a number, it does not raise one.
- The wording that keeps it prep rather than work is unchanged and is asserted
  on both branches, so a loaded primer can never read as a working set.

## Verification

- `test:primer-load`, new: the predicate, all three call sites reached with a
  real generated plan, the guidance identical on both branches, and the box
  fallback. Every check mutation-tested with the count reported.
- `test:load-ceilings`, `test:audit`, `test:quality` re-run — this changes what
  is prescribed, so the plan-quality floor has to be re-measured, not assumed.
- Read on a real 390x844 screen: a loaded primer shows a number AND the prep
  sentence; an unloaded one shows neither a number nor a 0.
