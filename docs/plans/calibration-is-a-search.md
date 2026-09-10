# Calibration week is a search, not a prescription

## Context

Ashley, 10 Sep 2026, after training on it: the weights were too light, the
screen prescribed 72.5kg × 3 while the banner said "add until 3-4 reps in
reserve", it was not clear whether the ramp comes before or after, and she
expects week 2 to crawl up from a number that was wrong to begin with.

She then shared Gemini's analysis and asked for my own best solution.

## What the app actually does today — measured, not read off the screen

Every claim below was traced through the code, because two of Gemini's
conclusions turn out to describe the screen rather than the engine.

1. **The 72.5kg is deliberately half the app's own estimate.** Calibration week
   multiplies the standards-table estimate by 0.50 for an intermediate
   (`CALIBRATION_WEEK_CONSERVATISM_BY_EXPERIENCE`) — a safety rule earned by a
   first-ever deadlift once landing at 130kg. It is meant as a floor. Nothing
   on the screen says so.

2. **A ✓ on an untouched box logs the pre-filled number.** `SetGrid`'s confirm
   reads `input.weight || ghost || defaultWeightFor(set)`, and the default is
   the prescription. So a lifter who trusts the screen ticks 72.5 three times
   and has, without knowing it, told the app that 72.5 is her working weight.
   This is the single most damaging fact in this document.

3. **Week 2 ALREADY re-anchors to the heaviest logged working set.** Gemini's
   "+2.5kg a week from the estimate, 11 weeks to catch up" is only true if she
   logs the estimate. `getDoubleProgressionRecommendation` takes the last
   session's heaviest working set; holds there if she did not hit the top of
   the rep range on every set, or adds one step (barbell main: 3.5%, snapped
   to 2.5kg) if she did. `TodayPanel` overrides the plan with it and labels the
   chip `logged`. `test:logged-reanchor` pins all of this. So: log 100kg in
   week 1 and week 2's session shows 100kg. **The engine is not the problem.
   The input is.**

4. **The printed future weeks do NOT re-anchor.** "See the whole program" keeps
   the formula's numbers until the accelerator (`beat-target-offer`) has three
   sessions to judge and then OFFERS a block re-anchor. So after an honest
   calibration session, today is right and the program view still says ~75kg
   for next week. That is where "it'll take forever" would come from even
   after she does everything right.

5. **The ramp is a warm-up ladder that ends just under the start** (20 → 67.5,
   then 72.5). It is rendered AFTER the S1/S2/S3 chips, and the only words
   saying "before the sets below" are in a hover tooltip, which a phone never
   shows.

## Gemini's proposal, weighed

| Idea | Verdict | Why |
|---|---|---|
| Set 1 is a probe; don't lock sets 2–3 to it | **Take it** | Correct diagnosis of the contradiction. |
| Copy that says what to do when it's light | **Take it, shorter** | Hers is a paragraph; the gym needs a sentence. |
| Empty / cascading inputs for sets 2–3 | **Take it** | Directly closes the silent-guess trap (fact 2). |
| Per-set RIR pop-up after every ✓ | **No** | Extra taps between sets on a phone she is putting down. The weight she TYPES already says whether set 1 was light — if set 2 is heavier, it was. Infer, don't interrogate. |
| Warm-up sets adjust set 1 automatically | **No** | Ramp sets are not logged — her own ruling of 7 Sep (place-keeper, not a log). Building load logic on data the app deliberately does not keep contradicts that. |
| e1RM from top set + reported RIR → week 2 at 75% | **No** | Solves a problem the app does not have (fact 3), and does it with the noisiest number in the gym — self-reported RIR from someone the app has never watched lift. ±2 RIR swings e1RM ~10%. This app spent weeks removing invented numbers from the load path; adding a formula on top of a guess is the wrong direction. The heaviest set she actually lifted IS the anchor. |
| Top set / back-off structure | **Not for a one-week calibration** | Real method, but it redefines what "3 working sets" means for volume and progression accounting. Probe-and-climb reaches the same answer without changing the session's shape. |

## The design

**One principle: in calibration week the screen must look like what it is —
a search for her weight, with the app's number as the first guess.**

### 1. The screen, calibration week only

- **Ramp first, and it says so.** The ramp block moves ABOVE the start number,
  labelled `Ramp up first`, ending `→ then set 1`. No tooltip carries meaning.
- **One number, labelled `START HERE`**, not "starting point". The three
  identical S1/S2/S3 chips are hidden in calibration week — they are the
  loudest "this is fixed" signal on the screen. In their place, one line:
  `Set 1 · probe at 72.5kg`.
- **The instruction, in one breath:**
  > Set 1 is a probe. Too easy — 5 or more reps left? Go up 5–10% for set 2,
  > and again if it's still easy. Your heaviest set at 3–4 reps in reserve
  > becomes next week's weight. Know your weight already? Start there.
  That last sentence is the whole "enter your real weights" feature, for free:
  the box is editable and always was.

### 2. The log grid, calibration week only

- **Set 1 pre-filled** with the start weight — it IS the instruction.
- **Sets 2 and 3 empty.** No default. A ✓ on an empty box refuses with the
  message that already exists for a zero ("Enter the weight you lifted").
  This is the fix for fact 2 and it costs one condition.
- **After set 1 is logged, set 2 gets three chips under it:**
  `same · 72.5` | `+5% · 76` | `+10% · 80` — tapping fills the box. After set
  2, set 3 gets the same three off set 2's weight. Snapped to real plates for
  the implement (the snapping already exists in `getLoadIncrementKg`'s
  granularity table). The chips are a suggestion, never a default: she can
  still type anything.

### 3. The engine — one change, and one question for her

- **Next week's session** needs nothing. It already anchors to her heaviest
  set (fact 3).
- **The printed program** does. After a calibration-week session where the
  heaviest logged set is above the estimate, write that anchor into the stored
  plan for the following weeks of the block — the same `rebuildLoadForExercise`
  path the injury rebuild uses — so "See the whole program" agrees with today.
  The row says where it came from: `from your 100kg set`.

  **The question that is hers:** the accelerator's rule (her ruling, 1 Sep) is
  *offer, never apply*, because auto-applying would reward chasing reps.
  Calibration week is different in kind — the estimate is an admitted guess,
  the banner promises "week 2 builds on it", and the heavier number came from
  her own fingers answering exactly the question the app asked. **My
  recommendation: apply it automatically, once, from calibration week only,
  and keep the offer-first rule for every week after.** The alternative is
  consistent but means one more card to tap before the program view is honest.

- The 3.5% / 2.5kg weekly step stays. It is the right size once the anchor is
  right; it was never the problem.

### 4. What does not change

- The 0.50 calibration multiplier. It exists for the first-ever lifter, and
  the redesign makes climbing the default behaviour, so the floor stops doing
  damage without being raised.
- The ramp stays a place-keeper (her ruling). It moves and gets a label; it
  does not start feeding the engine.
- Weeks after calibration: pre-filled sets as today, the accelerator offers,
  double progression as today.

## The guarantee

New gate `test:calibration-search`, every check mutation-tested:

- in a calibration week, sets 2 and 3 have **no default weight**, and a ✓ on
  an empty box refuses rather than writing the estimate — asserted through the
  grid's confirm path, not by reading a prop;
- set 1 keeps its pre-fill, so the probe is one tap when the guess is right;
- the cascade chips are computed off the previous LOGGED set, not the
  prescription, and snap to the implement's real plate step;
- in a calibration week the S1/S2/S3 chips are not rendered and the ramp
  precedes the start number in document order;
- after a calibration session whose heaviest set beats the estimate, the
  stored plan's later weeks carry that anchor (or, if she chooses offer-first,
  an offer row exists) — and nothing is written when the heaviest set is AT or
  BELOW the estimate;
- outside calibration week, none of the above applies — pre-fill, chips and
  program view behave exactly as before.

Browser, `verify:calibration-search`, at 390×844 on the pinned-Monday fixture
(the dev-clock trick from `verify:ramp-ticks`): ramp above the number with its
label visible; `START HERE`; set 1 filled, sets 2–3 empty; tick set 1 → three
chips appear under set 2; tap `+10%` → the box fills; ✓ on an empty set 3
shows the refusal. Screenshots read.

## Costs

Frontend only. No function deploy, no migration — the plan rebuild writes to
the same `mesocycle_weeks` rows the injury rebuild already writes. Load
prescription is touched, so this document precedes any build, and merging to
`main` needs her word as always.

## Not in this plan, named

- The dumbbell-leg-curl anchor (48kg between the feet) — still open, still hers.
- The program view lagging after a NON-calibration week until the accelerator
  offers — unchanged, by her 1 Sep ruling.
