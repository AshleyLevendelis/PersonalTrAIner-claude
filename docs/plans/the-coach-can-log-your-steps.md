# The coach can log your steps — Ashley's ruling, 5 Sep 2026

## Context

I flagged that the coach could now *describe* where steps live but not write
them. Ashley: **"build it so it can log them for you."**

One fork was hers to settle. The app deliberately only *acts* on an instruction
and *offers* on a statement — `imperative-classifier.ts` has no "walked" in its
verb list — so "I walked 9,000 steps today" would have produced nothing at all.
Put to her as three options. **She chose: show a confirm card, every time.**

That made the build simpler than `log_water` rather than harder: steps never
take the immediate path, so there is no new intent channel. It also raised the
stakes on the second half.

## The second half: the coach could not see steps either

`ChatAssistant.tsx` held no step reference — no count, no target. A writer that
cannot read is how "I did another 3,000" **replaces** a 6,240 day with 3,000,
because `daily_steps` holds one row per day and `logStepsManual` upserts. So the
read shipped with the write: `steps-context.ts` puts one line into the coach's
context, and the prompt tells it to add an increment to that number and send
the total.

## What the data layer decided, not me

- **`logStepsManual` UPSERTS.** Its own comment: "re-entering today's count
  corrects it rather than duplicating a row." A step count replaces the day.
  This is the opposite of water, and it drove three divergences below.
- **`source` is CHECKed `manual | health_connect | healthkit`** — no `'chat'`
  value, unlike `water_logs`. A spoken count is still manual entry, so it
  writes `'manual'` and **no migration was needed.**
- **No offline queue** ("plain async, not local-first"), so the write can
  reject where `logWater` cannot, and the rejection has to be visible.

## Three divergences from the water template, all forced

1. **The card shows a `before`.** It is the only append-proposal that does,
   because it is the only one that overwrites. A replace the user cannot see is
   a replace they cannot consent to.
2. **Undo restores; it does not delete.** `resolveAndSaveWater`'s own comment
   explains its undo is a straight delete because water "doesn't coalesce logs
   by day" — steps are exactly the case that excludes. The undo token packs
   `{date, previous}` (the contract calls it "a single opaque string", and
   grocery already packs JSON into it), and `restoreStepsForDate` deletes the
   row when there was nothing before rather than writing 0: zero and "never
   logged" are different facts.
3. **A plausibility bound.** No safe default exists the way water falls back to
   250ml, and a mistyped 900,000 would replace the day permanently. Rejected
   outside 0–100,000 with a sentence, in the spirit of `lift-plausibility.ts`
   at lower stakes.

## The landmine, found before it shipped

`ChatAssistant.tsx`'s confirm branch routed append-proposals through a ternary
ending in a bare `: resolveAndSaveWater(...)`. Adding `log_steps` to
`APPEND_PROPOSAL_KINDS` without touching that line would have **logged water
when the user confirmed a steps card** — a silent write of the wrong thing with
a cheerful receipt. Every kind is now named and an unknown one throws rather
than being routed somewhere plausible. The gate pins the routing per kind.

## And the write is visible where it lands

`onStepsChanged` is threaded App → ChatAssistant, and a `stepsVersion` token
App → ExerciseTab → TodayPanel → StepsRow so the row re-reads.

Worth recording why that is not optional: **`onWaterChanged` is declared on
ChatAssistant, awaited in two places, and passed by nobody** — verified, zero
assignments in `src/`. Chat water logs therefore do not refresh the Nutrition
tab today. That is the failure BACKLOG already records four instances of from
Ashley's phone: *"the receipt framework guarantees the app never claims a write
it did not make… It does NOT guarantee the user ever sees the result."* The
gate asserts `App.tsx` actually passes the steps callback, so this one cannot
ship as a dead prop.

## Gates

**New `test:coach-logs-steps`** — the card is the only path (Ashley's ruling
pinned as a ruling, so a later "simplification" cannot reverse it silently);
the confirm routes to the right resolver; chat writes through the shared store
and reads its target through `stepsTargetFor`; the prompt says total-not-
increment; undo carries the pre-image; the bound holds; the coach's summary
distinguishes "none yet" from zero.

**`test:silent-writes` §3b** — the write is guarded and a failure is reported.
**`test:pending-actions` §9** — `log_steps` covered, and the hardcoded case
list is now checked against `APPEND_PROPOSAL_KINDS` so the next new kind cannot
sit there untested.

**Seven mutations, each confirmed to apply**, including the landmine itself.
One found a weak check of my own: `test:silent-writes`'s "bound before write"
compared `indexOf` positions, and −1 < anything, so deleting the guard entirely
left it green. Presence is asserted before order now. Found by running the
mutation, not by reading the check.

## Verification

`tsc`, `npm run build`, 20 gates green. `test:audit` and `test:quality`
untouched — no generation path involved.

**Cannot be proven from the sandbox:** the model choosing the tool, the card
rendering, the number landing on the Exercise tab. All need the deployed
function and a live profile.

**Needs a deploy:** `npm run deploy:functions:prod -- chat-gemini`, which also
carries the form-cue block from the previous commit. **No migration.**
