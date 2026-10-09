# Adaptations respect the week already trained

*Plan before build, per CLAUDE.md: this is injury filtering and plan
rewriting. Written 9 Oct 2026 from test log H11 (with H5 and M25), the
tracer's report (`reports/B-injury-underfill.md`) and a fresh run of the real
adaptation code on a seeded build of the tester's plan. NOT BUILT. Nothing in
this file has changed any plan.*

Seven things, one family: a temporary change to the plan ("ease off my knees
for two weeks", "I've only got bodyweight this week") is applied to whole
plan weeks, held as a whole-week snapshot, and known about by nothing except
the card that made it.

## What is wrong, with the output

The tester told the coach about a knee on Thursday of his first week and
accepted "ease off for two weeks". Reproduced with the real
`substituteForInjury` on his plan (seed `sam:2`), weeks 1 and 2, in the order
the card lists them:

```
Thursday (Week 1): Box Squat (Bodyweight) -> Spanish Squat
Saturday (Week 1): Single-Leg Glute Bridge -> Kettlebell Swing (Heavy)
Thursday (Week 2): Box Squat (Bodyweight) -> Spanish Squat
Saturday (Week 2): Single-Leg Glute Bridge -> Kettlebell Swing (Heavy)
Thursday (Week 1): Walking Lunges -> Low Box Step-Up
Saturday (Week 1): Tempo Air Squat -> Spanish Squat
Thursday (Week 2): Walking Lunges -> Low Box Step-Up
Saturday (Week 2): Tempo Air Squat -> Spanish Squat
Thursday (Week 1): Chair Leg Extension -> Banded Terminal Knee Extension
…
```

What that shows, one cause each:

1. **A finished session was rewritten.** Thursday of week 1 was already
   trained. The card's weeks are "every plan week from the live one, for
   ceil(days / 7) weeks", and the substitution walks every day of every
   target week. There is no test for "before today", "has logged sets" or
   "done". The stored plan row changes, so the completed day now shows Spanish
   Squat where Box Squat was logged.
2. **The window is not the fourteen days asked for.** The adaptation expires
   fourteen days after it was made, but the weeks rewritten are plan weeks 1
   and 2. Made on a Thursday, it rewrote four days that had already passed
   and leaves days 11 to 14 — which fall in week 3 and include a leg day —
   **not adapted at all**. This is the safety-relevant one: the person is told
   two weeks and gets ten days.
3. **The rows are in no order.** Days and weeks are processed in parallel and
   each row is pushed when its own price lookup resolves. The card and the
   receipt print them as they arrive.
4. **The replacements ignore what else is true of the person.** Three
   separate things:
   - The pick is "first candidate" from the swap list, which since 18 Sep
     deliberately includes exercises outside the person's training style (a
     ruling about what a person is SHOWN and chooses from). An automatic path
     now inherits it and can prescribe off-style work nobody chose.
   - Uniqueness is per day only, so Spanish Squat and Low Box Step-Up each
     land on both Thursday and Saturday.
   - Single-Leg Glute Bridge was removed for the knee only because it has no
     reviewed verdict and falls back to "loads the knee" (the plain Glute
     Bridge is tagged as loading nothing). Replacing a glute bridge with a
     24kg kettlebell swing for a sore knee is a poor trade. A tag review, not
     an engine change; listed so it is not lost.
   - (That the swing and the bands need kit he does not own is the equipment
     tier's problem — both are in Minimalist — and belongs to the kit-list
     decision, not here.)
5. **The shared tail does not run.** Swap, ban, move, remove and volume
   changes all finish with `settleWeek` (warm-up rebuilt for the exercises now
   on the day, set hierarchy, one weight per lift, push:pull balance). The
   adaptation path does not. CLAUDE.md's rule 3, "adjustment keeps the bar",
   lists the paths that do; adaptations are not on it.
6. **Ending restores a snapshot, not a difference.** The adaptation stores the
   whole of each affected week as it was, and expiry writes those weeks back.
   Anything done to those weeks in between is silently undone. In Run 2 the
   tester banned Band Tricep Kickback while the knee adaptation was active;
   when it expires, the kickback comes back.
7. **Nothing else knows the adaptation exists.** A time-bounded adaptation
   deliberately does not touch the profile's injuries. Active adaptations are
   read in exactly one place (the "Start a new plan" warning). So the swap
   list, add-an-exercise, session rebuild, every rebuild offer and the kit
   adaptation all filter on the profile alone and can put Box Squat straight
   back. Profile shows no sign of it (M25). The coach's context has no line
   for it. And `endAdaptationEarly` — "tell me anytime to end it early", the
   coach's own words — has no caller.

And the reverse case, **H5**: removing an injury raises no offer and changes
nothing. That is deliberate and pinned (`test:rebuild-offer`: "removing an
injury does not"), on the reasoning that a plan built around an injury is
"merely more cautious than it needs to be". For a flag set at setup that is
wrong in size: the same profile without the flag gets three chest exercises
and ten working sets on Monday instead of two and seven, and a real shoulder
day on Saturday. "More cautious" is one press a week and a third leg day for
sixteen weeks, with a note on screen telling the person to fix it in Profile,
where un-ticking does nothing.

## The rule

**1. A session already trained is never rewritten.** By anything: an
adaptation, a rebuild offer, a kit change, a re-price. One guard, one
definition, used by every path that replaces days.

A day is *protected* when any of these is true:

- its date is before today (on the app's own clock);
- it has logged sets;
- it is marked done, missed, rested or swapped for an activity;
- its session was moved away (the moved-to day is judged in its own right).

"Today" itself is protected once anything is logged on it, and open
otherwise. Basis (CSCS): a training record is the evidence progression is
built from; a plan row that disagrees with the log makes both untrustworthy.

**2. A window is dates.** An adaptation of N days touches each day whose date
falls in [today, today + N), across however many plan weeks that spans, and
no other. Its stored record names the (week, day) pairs, not week numbers.

**3. Rows are sorted** by week, then weekday, then position in the session,
at the one place they are produced. The card and the receipt cannot disagree.

**4. Ending puts back what the adaptation changed, and only that.** Each
changed slot is recorded as {week, day, position, was, became}. At expiry or
"end now", a slot is restored only if it still holds what the adaptation put
there, and only on a day that is not protected. A slot the person has since
swapped, banned or removed keeps their edit. The settle pass runs on each day
touched.

**5. One answer to "what must this person's plan avoid right now".**
`effectiveConstraints(profile, activeAdaptations)` returns the profile's
injuries plus every active injury adaptation, and the profile's kit tier
unless an active kit adaptation overrides it for the day in question. It is
built once (App already loads adaptations on plan load) and handed to:

- every pool-building call — swap list, add-an-exercise, session rebuild,
  ban's replacement, every rebuild offer, the kit and injury adaptations
  themselves;
- Profile, which lists each active adaptation under Injuries ("Easing off
  your knees until 22 Oct") with "End now" and "What changed";
- the coach's context, as one line per adaptation.

Profile WRITES keep using the real list. A temporary adaptation is still
never saved as an injury (`test:injury-separation`,
`test:plan-adaptations-separation` hold that and must keep holding it).

**6. An automatic replacement respects what the person owns and how they
train.** First candidate from the STRICT pool (kit, injuries, skill AND
style); the style-relaxed pool only when the strict one is empty for that
slot, and the card says so on that row. Uniqueness is per week for the
replacements an adaptation makes, so one substitute does not appear on every
leg day. Then the settle pass.

Basis (CSCS): a substitute chosen for someone should meet the same bar as an
exercise generated for them; the 18 Sep widening was for choices a person
makes with the option in front of them. And repeating one substitute across a
week narrows the stimulus the adaptation was meant to preserve.

**7. Removing an injury offers a rebuild** (H5), through the same offer as
adding one: asked, never silent; from today forward; everything logged stays.
It lands WITH rule 1, because the rebuild replaces whole weeks today and
"from this week onwards" would otherwise rewrite the days of this week already
trained. The coach's "recovered" card makes the same offer through the same
function, and stops promising "your full volume comes back immediately".

### The CSCS review

1. **Training effect.** The adaptation covers the days it claims to, which is
   the point of it; trained days stay as trained; substitutes are on-style.
2. **What it takes away.** Nothing prescribed. A slot whose strict pool is
   empty is now dropped or filled off-style *with a note* rather than
   silently; count how many slots that is on the grid.
3. **Fundamentals.** Running the settle pass restores the warm-up, set
   hierarchy and balance checks that adaptations skipped.
4. **Floors and ceilings.** `assessAdaptation` decides "substitute or
   rebuild" from the share of slots lost. With fewer days in the window the
   denominator changes; the 15% threshold must be re-measured against the
   date-true window, not assumed to carry over.
5. **Scope.** No change to what counts as a red flag and no new medical
   judgement. See question 3 for the one place the coach path is weaker than
   the screen.

## How it would be built

Order matters; each step is useful alone and safe without the next.

1. **`isDayProtected(weekNumber, dayName, ctx)`** in a small module of its
   own. `ctx` carries the plan start date, today (the app clock), the logged
   set dates and the day states. It needs the "which session is on this date"
   lookup that the moved-session work (H15, H19) is fixing; share that one,
   do not write a second.
2. **`substituteSlots` and `rebuildAgainstProfile`'s splice take the guard.**
   The splice becomes per day: a protected day keeps the original day object.
   Every rebuild caller gets this for free.
3. **Date-true windows.** One function turns (today, days) into the list of
   (week, day) pairs; the coach's card builder, the screen's appliers and the
   executors all call it. `affected_week_numbers` on the stored row keeps its
   meaning (weeks touched) so old rows still read.
4. **Sorted rows**, at the end of `substituteSlots`.
5. **Strict-first candidates and weekly uniqueness**, then `settleWeek` per
   touched day.
6. **Slot-level revert.** `pre_image` is a JSON column with no schema of its
   own, so the new shape (a list of slot changes) needs no migration. Rows
   written before the change hold whole weeks; the revert reads either, and
   for an old row restores only the slots that differ from what the plan
   holds now AND are on unprotected days — which is the new rule applied to
   the old data.
7. **`effectiveConstraints`** and its three readers (pools, Profile, coach
   context). Derive the call sites by grepping for the profile's injuries and
   kit tier, not from memory: a missed one is a silent gap.
8. **Profile: the adaptation line, "End now" (wiring `endAdaptationEarly`),
   and moving "Exercises to avoid" out from under Nutrition** (M25). The
   three writers that store an exercise ban as "won't eat/do X" write "won't
   do X".
9. **Rebuild offer on removal** (H5), screen and coach, one function.

No migration anywhere in this plan.

## Every caller and gate affected

Callers: `substituteForInjury` and `substituteForEquipment` (the coach's two
card builders, the screen's two appliers, three executors);
`rebuildAgainstProfile` (injury rebuild, weight-basis rebuild, ceiling
reconcile, and every Profile rebuild offer through `rebuildFromCurrentWeek`:
equipment, style, goal, days, session length, known lifts, starting
preference); `createPlanAdaptation`, `checkAndRevertExpiredAdaptations`,
`endAdaptationEarly`; `detectPlanInvalidation` (four call sites on Profile);
every reader of the profile's injuries for a pool (generation, swap list,
add, session rebuild, warm-up, the audit).

Gates that exist and are touched: `test:injury-adaptation-safety` (joint
cleanliness only), `test:plan-adaptations-separation`,
`test:injury-separation`, `test:injury-rebuild`, `test:slot-replacement`,
`test:replacement-prescription`, `test:pending-actions`, `test:chat-actions`,
`test:rebuild-offer` (**line 94-95 flips by design**: "removing an injury does
not" becomes "removing an injury offers a rebuild"), `test:setup-answers`,
`test:profile-restore`, `test:coach-parity`, `test:coach-promises`,
`test:food-dislike-is-a-ban`, `test:edit-keeps-the-bar`, `verify:hurts`,
`verify:setup-answers` (§7 drives "Exercises to avoid"; its selector moves).
None of them looks at dates, order, trained days or revert-after-edit today.

New, each mutation-tested, each with at least two weeks and two days in play
so an ordering or a window is a real choice:

- a day before today, and a day with logged sets, are identical after
  substitute AND after rebuild (every rebuild caller, not one);
- every date in the stated window is adapted, and none outside it — with the
  adaptation started mid-week, which is the case that fails today;
- rows are in week, day, position order;
- edit, then expire: the edit survives, on both the new and the old stored
  shape;
- a swap list, an added exercise and a session rebuild made during an active
  adaptation contain nothing the adaptation excludes;
- an automatic replacement is on-style whenever the strict pool has one;
- removing an injury raises the offer; confirming restores a press on the
  chest day; days already trained this week are identical afterwards;
- a browser driver: Profile shows the active adaptation, "End now" restores
  the plan and keeps a later edit.

## Measurement

- **Before, on the tester's plan:** the card above (14 rows, 4 on a trained
  day, 0 on days 11-14, unsorted, 2 substitutes repeated across days).
- **On the grid:** for a sample of the quality grid, apply each single-injury
  adaptation for 7 and 14 days starting on each weekday. Count days adapted
  outside the window, days in the window not adapted, protected days changed,
  slots filled off-style, and slots dropped. Before and after, same seeds,
  denominators printed. The second and fourth numbers are the ones that say
  what the fix costs.
- **Revert:** the same sample with one ban made mid-adaptation; count edits
  lost at expiry (today: all of them in the affected weeks).

## Risks

- **The guard needs a reliable "done" signal.** Moved sessions are the weak
  point today (H15, H19). Build on that fix or share its lookup; a guard that
  protects the wrong day is worse than none.
- **Effective constraints touch every pool call.** One missed call site is a
  silent hole. Derive the list, and hold it with a check that fails when a new
  pool call does not go through the one function.
- **Slot-level revert changes what a stored snapshot means.** Reading both
  shapes is the mitigation; nobody is live, so no row needs converting.
- **An offer on every un-tick could nag** someone toggling to explore. The
  existing behaviour (one offer per change, cleared on decline) covers it.
- **A rebuild re-picks exercises** for the remaining weeks, so lifts with
  logged progress can change. The card must say so before the tap.

## Questions for Ashley

**1. When someone removes an injury, should the app offer to rebuild their
plan?**

- A. No, as now. The plan stays cautious until they start a new plan, which
  hides their history.
- B. Yes, every time, from today forward, history kept.
- C. Only when the plan was visibly built around it.
- **Recommended: B.** It is the question the app already asks when one is
  added, saying no costs nothing, and without it both the Profile tick and
  the coach's "recovered" card look broken.

**2. Where should a temporary change ("easing off your knees until 22 Oct")
be shown?**

- A. On Profile, under Injuries.
- B. On the Exercise tab, a line while it is active.
- C. Both.
- **Recommended: C.** Profile is where the tester looked; the Exercise tab is
  where it matters.

**3. Which words mean "see someone" rather than "ease off", when said to the
coach?** On the exercise screen this is enforced in code: sharp, one-sided or
getting worse names a professional and changes nothing. In chat it is only an
instruction to the model, and the tester's "sharp pinch below the kneecap"
was offered a two-week adaptation.

- A. The screen's three: sharp, one-sided, getting worse.
- B. Those plus swelling, locking, giving way, numbness.
- C. Leave it to the coach's judgement, as now.
- **Recommended: B**, blocking in one direction only: a message carrying one
  of those words never produces an adaptation card. (The same shape as your
  cardio ruling: code blocks the direction that costs something, the coach
  exam grades the other.)

**4. When a temporary change ends, and the person edited those days in the
meantime, what happens to their edit?**

- A. It is undone with the rest, as now.
- B. Their edit stays; only what the temporary change itself did is put back.
- **Recommended: B.** This is in the plan as the rule; it is listed here
  because it changes what "it'll ease back to normal after that" means.
