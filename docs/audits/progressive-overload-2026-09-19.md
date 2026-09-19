# The progressive-overload audit — 19 Sep 2026

The record said `frozen_week` fires on **4,060 plans (44.1%)** and that
"nearly half of all generated weeks contain a lift whose weight doesn't move",
with two suspected innocent explanations — deloads and calibration weeks —
that nobody had ever separated out from genuine stalling. This is that
separation, measured.

**How it was measured.** `npm run report:progression-levers`, sweeping every
9th combination of the shared 9,216-profile grid — **1,024 plans, 186,146
week-to-week slot pairs**, seeded so it gives the same answer on a Tuesday.
The rule is not re-implemented: `scripts/frozen-pairs.ts` now holds one copy,
imported by this and by `report:frozen-exercises`, and every 101st plan is
re-scored by `quality-score.ts` itself and the counts compared (11 plans, 0
mismatches). A smaller 250-plan run agrees to within a point on every headline.

---

## 1. The lead was right about the number and wrong about the question

| | |
|---|---|
| plans carrying at least one frozen week | **433 of 1,024 — 42.3%** |
| frozen pairs | 2,480 |
| week-to-week slot pairs examined | 186,146 |
| **the rate** | **1.3%** |

Both numbers are true and they are not the same question. 44.1% was always
"what share of sixteen-week plans contain one such week ANYWHERE" — a count of
plans, not of weeks. Read as a rate it says a lift stands still one week in
two; measured as a rate it is one slot in seventy-five.

**A per-plan "contains at least one" count and a rate are different
measurements, and the first is roughly *n* times the second.** Nothing in the
name `frozen_week` says which one it is.

## 2. Neither suspected innocent explanation exists

- **Deloads**: excluded by the rule itself, and always were — a transition into
  or out of a deload week is never counted.
- **Calibration weeks**: **zero** frozen pairs come out of one. The calibration
  week is week 1 in all 1,024 plans, and `week 1 -> 2` does not appear once in
  the distribution of frozen transitions. The deliberate cap does not produce a
  repeat; week 2 always moves off it.

So the whole 42.3% is a lift that genuinely did not get harder. The split that
matters is a different one.

## 3. What the split actually is

| verdict | pairs | of frozen | plans carrying one |
|---|---|---|---|
| **stalled, and the app says so** | 2,239 | 90.3% | 334 (32.6%) |
| **stalled, and silent** | 241 | 9.7% | **149 (14.6%)** |
| progressed by another lever | **0** | 0.0% | 0 |

The first row is Ashley's 5 Sep ruling working: the card carries *"at your
estimate's ceiling"* or *"as heavy as this gets"*, and the coach has the same
fact. A repeated week that says why it is repeating is honest coaching, not a
defect.

The last row is the finding nobody was looking for. **Not one frozen pair was
secretly progressing.** Sets, tempo and machine assistance all move elsewhere
in these plans — 304, 516 and 978 slot pairs respectively — so the detectors
fire; they simply never rescue a lift whose load and reps have stopped. The app
has exactly two progression levers, and when both run out there is no third.
(That is not news: adding a set when a lift is capped was option (a) on 5 Sep
and Ashley deliberately did not choose it. It is recorded here with a number
attached.)

Two things measured and deliberately **not** counted as progression:

- **RPE moved on 730 pairs (29.4%)**. A different effort label beside an
  identical load and rep target describes the same session; it is not more
  work, and the scorer's own deduction text says so.
- **Rest moved on 26 (1.0%)**, and it moves because the time-cap trimmer and
  the phase's rest shift moved it, not because anything decided to train
  denser.

## 4. The silent 9.7% is one story, and the app is RIGHT about all of it

**236 of the 241 (97.9%) are a weight the app is deliberately holding still.**
`exercise-plan.ts` measures, for every loaded slot, what one real notch would
cost as a share of the current load, and when that is over 12% it holds the
weight flat and ramps reps instead. Its own comment says why, and says it is
not a bug:

> the minimum real dumbbell notch is 2kg/hand, which is 33% of a 6kg curl no
> matter how gently the target rate is set … the load catches up once the
> baseline itself has grown enough to afford a real step (this can legitimately
> take a whole block or more on light isolation work; that's correct, not a
> bug).

It is correct. A coach does not put 25% on a lateral raise because the week
turned over. So the whole residue is the app making the right call — and then
the fallback lever it switched to runs out:

| what the lift was doing earlier in the same block | pairs | |
|---|---|---|
| bought a rep, then the next bump was refused | 145 | 60.2% |
| was at a recorded ceiling, then bought a rep, then refused | 70 | 29.0% |
| never held, never bumped — coherence pinned it to a sibling slot | 26 | 10.8% |

One trace, which 215 of 241 follow:

```
Machine Lateral Raise, full gym, beginner, block 2
  wk5   2x11-14 @ 7.5kg   hold=–  bump=–        <- 2kg is 27% of 7.5kg: weight held by design
  wk6   2x14-17 @ 7.5kg   hold=–  bump=bought   <- reps ramp instead, exactly as intended
  wk7   2x14-17 @ 7.5kg   hold=–  bump=band     <- refused, and now nothing is said
```

**Three separate reasons the honest sentence cannot appear**, and they compound:

1. **The affordability decision leaves no record.** `load_hold` has codes for
   `ceiling`, `implement`, `floor` and `matched`. "One notch is too big a jump"
   is not among them, so the most common reason a weight stops moving in this
   app is the one thing the Exercise never carries.
2. **The ceiling record is destroyed by the app's own remedy.** Where a hold
   *was* recorded, `load_hold` is re-read off the natural prescription at
   *this* week's rep range, and extra reps lower a standards estimate — so once
   a rep is bought, the weight is no longer "at" the estimate, it is above it,
   and the hold comes back empty. That is the 70.
3. **`band` is not in the list of exhausted levers.** `atPrescribedCeiling`
   treats `capped` and `range_fixed` as "no lever left" and does not mention
   `band`, the 25% divergence backstop's refusal. Even with a hold intact, a
   band decline produces no label.

Each alone is enough to silence the card, so fixing any one of them changes
nothing — the same shape as the six independent exclusions that hid bodyweight
personal bests.

The remaining 26 are the one-weight-per-lift and one-target-per-lift coherence
rules pinning a slot to its sibling (`hold=matched`). A presentation decision
that reads, from the card, exactly like a plateau.

## 5. Who gets it

| | |
|---|---|
| experience | beginner 46.9%, intermediate 33.2%, novice 13.7%, advanced 6.2% |
| goal | functional 43.2%, hypertrophy 24.9%, fat loss 18.7%, conditioning 13.3% |
| equipment | minimalist 34.0%, full gym 33.2%, home gym 21.6%, bodyweight 11.2% |
| where in the plan | 44% of all freezing is weeks 13→15; 1.1% is weeks 2→3 |

The exercises are light isolation work almost without exception — Walking
Lunges, Hammer Curls, Lateral and Front Raises, Rear Delt Flyes, Face Pulls,
Backpack raises — sitting at 7.5–10kg, where the smallest real notch is a
quarter of the working weight. That is measured, not inferred: section 6c of
the report tests each one against the app's own 12% affordability rule.

## 6. The CSCS read

Against the five review questions, on the behaviour as it stands:

1. **Training effect.** A 7.5kg lateral raise held at 14–17 reps for three
   weeks is a real plateau, and holding the weight rather than putting 27% on
   it is the right call — this is the app doing textbook double progression and
   running out of the rep half. The stimulus maintains rather than builds,
   across the back half of a block, on accessory work, for 1 in 7 plans.
2. **What it takes away.** Nothing is removed. This is about what is not added,
   and about what is not said.
3. **Do the fundamentals survive?** Movement-pattern coverage, recovery and
   specificity are untouched. Progressive overload stops for these slots, and
   it stops hardest for beginners (46.9% of the residue) — the population that
   adapts fastest and should be the easiest to progress.
4. **Does it redefine a floor?** No — and this is the reason not to reach for a
   new lever inside this change. The 12% affordability rule and the 25%
   divergence backstop are both doing their jobs; the textbook next move
   (take the 10kg and drop the reps back to the bottom of the range) is
   currently refused by the backstop, which exists to catch contaminated
   anchors carried through a rotation, not deliberate jumps. Separating those
   two cases is a prescription change and needs its own five-question review.
   Adding a set when a lift is capped was option (a) on 5 Sep and Ashley
   deliberately did not choose it.
5. **Scope.** Programming, not clinical.

**The verdict: the prescription is right and the silence is not.** A coach
looking at a 7.5kg lateral raise that has stopped does not pretend the week is
new. They say: *"this one's parked — the next dumbbell up is a 27% jump, so
we're holding it and buying reps, and we've run out of reps I'll give you at
this weight."* The app knows every clause of that sentence and shows nothing,
because the reason it is holding the weight is the one reason it has no slot
to record.

So the fix is an **honesty fix, not a programming change** — no weight, rep,
set or rest moves — and it has to do all three of:

- give the affordability decision a hold code of its own, so the commonest
  reason a weight stops is recorded at all;
- keep a recorded ceiling once a rep has been bought against it, instead of
  recomputing it from the rep range the bump just changed;
- count a `band` refusal as a lever spent, because from the trainee's side it
  is.

And one half that is **Ashley's, not mine**: there are now three different
reasons, and the app has two wordings. A weight held because the next dumbbell
is too big a jump is not "at your estimate's ceiling" and is not "as heavy as
this gets" — it is the most hopeful of the three, because it ends on its own
once the trainee gets stronger. Whether that deserves its own sentence, and
what it says, is a decision about what the app tells people.

## 7. Corrections this makes to the record

- *"nearly half of all generated weeks contain a lift whose weight doesn't
  move"* — **wrong as stated.** 42.3% is the share of PLANS carrying one
  anywhere in sixteen weeks. The rate is 1.3%.
- *"Some of that is deliberate (deload, calibration)"* — **neither exists.**
  Deloads never entered the count; calibration weeks contribute zero.
- *"Needs splitting by phase before anyone acts on it"* — split by block
  position instead, which is where the signal is: 44% of it is the last third.
- **My own first draft of this audit** said the fix was two mechanical halves
  and would have covered 70 of 241. It missed the affordability rule entirely
  and only found it by asking, of the 145 pairs that had never recorded a hold,
  what the increment would have cost — a question I nearly answered by
  reasoning instead of measuring. The number that settled it, 97.9%, is not
  close to the one reasoning was heading for.
- The 5 Sep figure of **41.6% of plans / 626 pairs** has drifted to **42.3% /
  2,480 on a four-times-larger sample**. Same magnitude; the old number was not
  stale, only smaller-sampled.
