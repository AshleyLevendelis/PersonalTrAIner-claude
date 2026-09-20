# When the next dumbbell is too big a jump

**Plan before build**, because this touches load prescription. Nothing here
changes a weight, a rep, a set, a rest or an exercise. It changes what the card
is able to SAY about a weight the app is already, correctly, holding still.

## Ashley's ruling, 19 Sep 2026

From three options, after the progressive-overload audit
(`docs/audits/progressive-overload-2026-09-19.md`): **its own line, because it
is temporary.** Over reusing the existing "as heavy as this gets" (one sentence
for all three reasons, but it sounds permanent when this one is not) and over
leaving it silent.

Her reason is the one that matters: of the three ways a weight can stop in this
app, this is the only one that resolves itself. A bar at the estimate's ceiling
needs a logged set. A loaded backpack is simply as heavy as a backpack gets.
A 7.5kg lateral raise held because 2kg is 27% of it starts moving again on its
own the moment the trainee is strong enough to afford the notch.

## What is measured, not assumed

From `npm run report:progression-levers` over 1,024 plans / 186,146 slot pairs:

- 2,480 week-to-week pairs repeat load and reps exactly; **90.3% already carry
  a label** and 241 (9.7%) say nothing.
- **236 of those 241 (97.9%)** are a weight held because one real notch is over
  12% of the current load — `exercise-plan.ts`'s `loadStepUnaffordable`, which
  is a deliberate, documented decision and the right coaching call.
- Cross-tabulated, that single fact covers **all 70** of the pairs whose
  recorded ceiling was erased by the app's own rep bump and **all 26** of the
  coherence-pinned ones. Only 5 sit outside it.

**This kills one of the three fixes the audit proposed.** "Carry a recorded
ceiling forward once a rep has been bought against it" would be a new mechanism
in the generator for at most 5 pairs, because the other 70 are already covered
by the affordability stamp. Not building it.

## The build

### 1. The reason gets somewhere to live

`Exercise.load_hold` has codes for `ceiling`, `implement`, `floor` and
`matched`. The commonest reason a weight stops in this app is not among them,
which is why nothing downstream can say it. Add `unaffordable_step`, stamped
by the generator at the point it already decides `loadStepUnaffordable` — and
only when `prescribeLoad` reported no hold of its own, because `ceiling` and
`implement` are more specific claims and must win.

### 2. A refused rep counts as a lever spent

`atPrescribedCeiling` requires BOTH that the weight cannot move and that no
other lever did — that is the rule that stops a held bar with climbing reps
being labelled as stuck, and it stays. `band` (the 25% divergence backstop
refusing the next rep bump) is missing from the "no lever left" side. From the
trainee's side a refused rep is a rep that is not there.

`unaffordable_step` joins the "weight cannot move" side for the same reason
`floor` and `matched` do not: those are presentation decisions about a weight
that could still rise, and this is a weight that cannot this week.

### 3. A third wording

`ceilingLabel` has two, because a bar at a guess and a full backpack are
different claims. This is a third and it is the hopeful one:

| hold | on the card | why it differs |
|---|---|---|
| `ceiling` | at your estimate's ceiling | a logged set moves it |
| `implement` | as heavy as this gets | nothing moves it |
| `unaffordable_step` | **next weight up is too big a jump** | getting stronger moves it |

and the coach gets the matching sentence in `ceilingNoteForCoach`, so the two
surfaces cannot disagree — the same pairing that already exists for the other
two.

## The CSCS review

1. **Training effect** — unchanged. No prescription moves. What changes is
   whether the trainee knows why the week looks the same.
2. **What it takes away** — nothing. It adds one short line to a card, on the
   rows that currently carry none.
3. **Do the fundamentals survive** — yes; this is a labelling change. The
   underlying overload stall is real and is NOT fixed here, deliberately (see
   below).
4. **Does it redefine a floor or ceiling?** This is the question with teeth.
   `atPrescribedCeiling` gains two new ways to be true, so anything reading it
   sees more cases than before. Two readers: the card's chip and the coach's
   plan context. Neither gates a number. The 12% affordability threshold and
   the 25% divergence backstop are untouched — both keep their current meaning
   and this change reads them rather than moving them.
5. **Scope** — programming, not clinical.

## Deliberately not built

- **A third progression lever.** The textbook next move for a stalled light
  isolation lift is to take the bigger dumbbell and drop back to the bottom of
  the rep range — refused today by a backstop aimed at contaminated anchors
  carried through a rotation, not at deliberate jumps. Separating those two
  cases changes what people are prescribed and needs its own five-question
  review. Adding a set when a lift is capped was option (a) on 5 Sep and Ashley
  declined it.
- **The 26 coherence-pinned pairs** (`hold=matched`, or a rep target matched to
  the same lift's other slot). They stay silent. A slot pinned to its sibling
  may well have a sibling that IS progressing, and labelling this one "held"
  could be false. Named here rather than quietly folded in.
- **The 5 pairs where the notch was affordable** and the weight stopped anyway.
  Unexplained; too few to design for and left as a lead.

## Verification — what was actually done

1. **`test:frozen-weeks` §9, 19 new checks**, all green: the two new ways to
   be at a ceiling; the three false cases that keep them honest (a too-big
   notch whose reps still climbed is NOT at a ceiling); three distinct
   wordings, each true of its own case; three distinct coach notes; the
   generator's `??` stamp; and end to end on eight generated plans — 423
   stamped slots, 877 loaded slots with no hold at all (so the stamp is not
   unconditional), and every stamped slot's notch DERIVED from
   `getLoadIncrementKg` rather than compared against a copy of the 12%
   constant. **10 mutations, 10 caught, 0 missed, 0 invalid**, every run
   executing all 69 checks.
2. **`verify:ceiling-label`, 9 checks**, a real Chromium at 390x844 walking
   the app's own generated plan — 13 weeks, 52 days, 341 exercise rows — until
   it finds the line, with no fixture of any kind. Found on week 14, Sunday:
   *Front Raises · ~6kg per hand · suggested · next weight up is too big a
   jump*. It checks the row does not ALSO carry either of the other two
   wordings, that no weight explainer was opened to reveal it, and that it is
   drawn beside the weight rather than adrift. **3 mutations, 3 caught**, each
   run executing all 9 checks, and the harness rebuilds the bundle after
   restoring so the next driver does not measure the mutant.
3. **The prediction was wrong and the measurement is in the audit**: 241 → 178,
   not 241 → 31. `report:progression-levers` §6c asks whether a notch *would
   have been* affordable; the app only consults affordability for a
   load-ramping candidate, so a non-compound accessory under a `reps` or
   `maintain` goal never reaches it. A new §6e asks the question that matters.
4. **Nothing prescribed moved, measured rather than asserted**: the same seeded
   1,024-plan run reports the same 2,480 frozen pairs out of the same 186,146
   slot pairs before and after. `load_hold` has exactly one behavioural reader
   in the app — `progression-ceiling.ts` — so the blast radius is the label and
   the coach's note.
5. `npx tsc --noEmit` clean; 13 affected gates green (frozen-weeks 69,
   coach-plan-context 86, exercise-today 75, calibration-search 68, coach-voice
   44, primer-load 37, added-load 36, block-phases 36, load-display 27,
   tempo-prescription 23, bundle 19, week-load-consistency 10, no-dead-code 8).
