# A weight that is too easy: how fast the plan catches up

Ashley, 11 Nov 2026: *"If it prescribed a weight and I complete it and find it too easy and have lots left on
reserve, will it ramp up accordingly or will it take many weeks to get to a weight that the user actually finds
challenging and beneficial. What if the calibration week feels too easy so the user logs heavier weights than
prescribed, will the plan adjust accordingly?"*

Load prescription is safety-adjacent, so this is the plan before any build. Status: **A and C BUILT 11 Nov 2026**
(see "What was built" at the end); B folded into C's lines; D and E not built. Written when it was **traced and
partly measured, nothing built.** Everything marked TRACED is read from source by a trace on 11 Nov and is a lead until driven in a
browser; MEASURED was run.

## What happens today

**What the app can know.** A set row records weight and reps. There is no "how hard was that" on the screen. The
coach can store an effort number with a set it logs, and nothing that works out a weight reads it. A session can be
marked easy, good, hard or rough through the coach; "easy" changes nothing (only a run of hard or rough sessions
prompts an offer to cut volume). TRACED.

**A normal week.** From week 2 the weight on today's card comes from the last logged session of that lift, not from
the printed plan: every working set at the top of the rep range earns one step, anything less holds last session's
heaviest weight. One step whatever the margin. MEASURED: 40 kg to 70 kg (a weight 75% too light) is 12 sessions on a
barbell squat or bench, 8 on a lat pulldown, 6 on a leg press. Twelve sessions is twelve weeks for a lift trained
once a week.

**Ticking without typing.** A blank tick records the bottom of the rep range (his ruling: never record more work
than was done). So a session ticked through as written never reaches the top of the range, the card says "Held",
and the weight never rises. The card takes the held number even when the printed plan for that week is higher, so it
can sit below the plan's own ramp; at the next block the review reads "same weight, same reps" as a stall and writes
the low weight into the new block without asking. TRACED, not yet driven. The app's own tour tells people to leave
the boxes blank and tap the tick, so this is the default way to train, and it is the way that never progresses.

**Typing a heavier weight.** The next session starts from the heaviest weight logged, plus a step if every set
reached the top of the range. This is the fast route and nothing on the card says so. TRACED.

**The calibration week.** The first week of an unknown lift is priced at about half the estimate (0.55, 0.50, 0.45
by experience) and the main lift's card says set 1 is a probe: go up 5-10% a set while it is easy. Sets 2 onward
must be typed. On Finish, a lift logged heavier than its price rewrites every later loading week of that block to
the heaviest set, with no limit on the jump except the kit and table ceilings. TRACED. Holes:
- the same weight for more reps changes nothing;
- only block 1 is rewritten, so later blocks are still printed from the original guess (the card corrects from
  history while the lift is the same one);
- only the Finish button triggers it: sets logged through the coach, or "I did it, not in the app", do not;
- the probe cue is on the main lift only; chips offer +5% and +10% of the last set, so three sets reach about +20%.

**Block boundaries.** Main lifts only, three sessions needed: a stall is written in without asking, an improvement
is offered (his 1 Sep "offer, never apply" and 10 Oct "Offer it"). Accessories never get an offer.

## The coaching read

1. **What is it doing to the training effect?** A weight far under the working weight is not a lighter version of
   the session, it is a different stimulus: at 55% of a ten-rep weight no set is within reach of the effort the plan
   is written for. Creeping up 2.5 kg a session leaves weeks of work that does little. The standards allow a 2.5-10%
   load rise once the prescribed work is done with reps to spare (NSCA's 2-for-2 rule is the usual statement), and
   when a load is far out a coach re-tests rather than creeps.
2. **What does a faster route take away?** The protection of small steps. So the fast route needs the person's own
   evidence (a heavier set actually lifted, or a stated "too easy"), never the app's guess, and stays under the kit
   limit, the table ceiling, the eased weight after a break, and never applies in a deload week.
3. **Do the fundamentals survive?** Progressive overload is the thing at stake: today the commonest way of using the
   app has none.
4. **Does it redefine a floor or ceiling?** "Never record more work than was done" stays exactly as it is. What
   changes is what a session done as written is taken to mean for the next one.
5. **Scope.** Training load only. Pain is its own triage and is not touched.

## Proposed, in order

**A. A session done as written follows the plan (mine, CSCS; no question for him).** The card never shows less than
the printed plan's number for the week unless the last session FAILED (fewer working sets than prescribed, or any
set under the bottom of the range). History raises the card and failure holds it; completing the prescription is not
a failure. With it, the block review stops reading a ticked-through block as a stall. To verify first in a browser:
that the card really sits under the printed number today.

**B. Say the fast route on the card (wording, his to change).** Where the row has a weight: "Too easy? Type a
heavier weight. Next time starts from what you log."

**C. Ask how it felt, one tap (HIS: how much the app asks).** After the last working set of a lift: Too easy, About
right, Too hard. Proposed meaning, mine:
- Too easy: the next session of that lift is a "find your weight" session, the calibration week's own search (probe,
  go up 5-10% a set, heaviest set becomes the weight), and what is found re-anchors the rest of the block. One
  session to arrive instead of twelve. Offered for the rest of TODAY's sets too, as the +5% and +10% chips.
- About right: as now, with A.
- Too hard: hold; twice running, come down one step.

**D. Calibration holes (mine).** The same weight for clearly more reps than the top of the range counts as a heavier
weight for the reps asked (worked from the set, capped per session); the anchor is carried into later blocks' printed
numbers; sets logged through the coach or "did it, not in the app" anchor as Finish does.

**E. Found on the way, to verify.** The block review and the load suggestion appear to write the full weight into
the deload week; the load suggestion's sentence says "consistently hit the top of your range" while its trigger
never looks at the top of the range.

## Not decided here

Whether to ask at all, and whether on every lift or the main lift only (C) is his. Everything else above is a
coaching decision under his 18 Sep delegation, recorded in BACKLOG with its basis when built.

## What was built (11 Nov 2026)

His ruling on C: **"One tap per lift"**.

- **The tap.** Under a lift whose working sets are all in: "How did that feel?" with Too easy, About right, Too hard.
  Kept as the effort on the lift's last working set (5, 8, 10 on the 1-10 scale the coach's logged sets already use),
  taken back by tapping it again. Asked only for a loaded lift with a number, never in a deload or calibration week.
- **The rule** (`progression-engine.ts`, `test:lift-effort`):
  - too easy: the next session starts 10% up (never less than one real step) and is a find-your-weight session, the
    calibration week's own search on that one lift; its heaviest set becomes the weight even when the climb was steep.
    MEASURED through the rule: 40 kg to 70 kg in 2 sessions after the answer, against 12.
  - about right: the top of the range on every set still earns a step; so do two sessions running at one weight,
    every set done, both about right.
  - too hard, or a set under the bottom of the range: hold; twice running at that weight, down one step, never
    under the lightest loadable weight.
- **Today's weight reads the plan's week** (`cardLoadFor`), which is A and two faults A's trace found:
  - a session done as written (at or over the plan's number for its week, not short, not too hard) takes the plan's
    number for this week when that is higher; a session lifted UNDER the plan stays on the log (her 14 Sep ruling);
  - a DELOAD week is lighter: the plan's number for somebody on the plan to the kilo, otherwise the deload share of
    what was actually lifted. Before, the card showed last week's full weight;
  - the first session AFTER a deload starts from this block's number, never more than a step over where the lift
    was before the deload. Before, it was held at the deload's weight.
- **Not built:** the printed plan is not rewritten after a find-your-weight session outside the calibration week
  (the card follows the log; the Program view keeps its old numbers); D (the calibration week's three holes); E
  (the block review and the load suggestion in a deload week, and the suggestion's sentence); the session summary's
  "next time" and Home's lead lift still read the rule without the plan's week.
