# Plan: Learn from what actually happened (Vision Step 4)

## Context

Steps 1-3 are built and live: the app now scores exercise picks instead of shuffling them, explains a non-obvious pick, and has real backup options where the catalogue was thin. All three still only look **forward** — they decide today's plan from your profile and goal, never from what you actually did.

VISION.md is explicit about the next gap: *"The app currently prescribes forward. It should also read backward. A coach notices that someone always fails the last set, skips every Friday, or consistently beats the target — and adjusts. Logged sets, missed sessions, and actual versus prescribed loads should feed the next block."*

I checked the code before writing this, not just the vision text. The app already has almost everything needed to read backward — it just isn't wired into how a new training block gets built. Every week's exercise plan is generated once, all sixteen weeks at once, the moment you finish onboarding — before you've lifted a single real set. Nothing ever goes back and checks how a block actually went before building the next one. Weeks 2 and 3 within a block are already a fixed formula stepped up from week 1's number, never re-checked against what really happened.

This plan is the first, deliberately small step toward closing that gap: when you finish a 4-week block, the app looks at what you actually logged in it, and if one specific exercise genuinely didn't move — not one bad day, but no real progress across the whole block — it holds that exercise's weight steady into the next block instead of bumping it up on a formula that assumed you were progressing. It tells you plainly why, right on that exercise. It does not ask permission first, and you can always just log a heavier weight than it suggests if you disagree — the same as you can with every suggested weight today.

## Decisions made while designing this, and why

You corrected two things in the first draft of this plan, and both changed the design for the better:

1. **"No progress" must mean no real progress, not just "the weight didn't go up."** The app already tracks double progression — hit the top of your rep range on every set, and the weight goes up; anything short of that, you hold the weight and work on reps first. That "hold" state on its own does NOT mean nothing improved — going from 9 reps to 11 reps at the same weight is real progress, just not yet enough to earn a heavier weight. So this only counts as a stall if reps genuinely didn't move either, comparing your actual logged sessions across the block, not by repeating that single day-to-day "hit the top or not" flag.
2. **A week you didn't train is not a week you failed to progress.** If you missed sessions, the app has fewer real data points, not evidence you plateaued. The stall check only ever compares real logged sessions to each other — a skipped week just isn't part of the comparison. Whether you're missing enough sessions to matter is tracked completely separately (see below), never folded into "did you stall."

You also asked two direct questions that changed the shape of this:

- **Should this even ask permission first?** No — you're right that "decline" would mean the app adds weight to someone who's genuinely stalled, which is the worse outcome. This applies the same way the app already silently decides "hold weight, chase reps" week to week, without asking every time — it's an extension of prescription the app already does on its own, not a new kind of profile change. It applies automatically, explains itself plainly, and you can always just log something different if you disagree — nothing is locked.
- **Where do I actually see it?** Not chat-only — directly on the exercise itself, the moment you'd actually wonder about it. The app already has a small note that appears under a load number explaining where that number came from ("suggested," "from your last session," etc.) — this reuses that exact same spot with a new note ("Held steady — no real progress last block"). A short coach-voice message in chat backs it up with more detail, and there's a small dashboard nudge too, so it's not missed by someone who trains straight from the plan screen without opening chat.

Then, approving the plan, you added one more correction:

- **Two logged sessions (one comparison) isn't enough evidence.** With only one comparison, a single off day looks identical to a real stall — exactly the case this whole design exists to exclude. The check needs at least three real logged sessions (two comparisons) in the block before it's allowed to flag anything.

## What I'm deliberately NOT building in this pass

You asked whether holding the weight flat is even the right response, since a real coach seeing a genuine stall often does more — changes the exercise variation, shifts the rep range, or works in a deload before rebuilding. You're right that holding flat is the minimum, safe response, not the ideal one. I'm recommending we ship the minimum first and prove it's correct before reaching for a bigger lever, for two reasons: a wrong "hold" is easy to recover from (you just log more weight next time and it corrects itself), but a wrong "this exercise isn't working, let's change it" is a much bigger, harder-to-undo decision to get from an automated check. Once this is live and trustworthy, a second pass could add a stronger response for a stall that persists across two blocks in a row, not just one.

Also out of scope for this pass, and why:
- **Missed-session volume pull-back** ("you missed a third of your sessions, so the next block's volume won't step up as scheduled") — the signal already exists (the app's streak-tracking logic already knows how to spot a missed day), but there's no existing lever to pull a whole block's volume down from outside the generator today; wiring one in is a second, separable piece of work.
- **Rewarding someone who consistently beats every target** — the vision calls this out too, but rewarding it risks encouraging someone to chase reps past good form. That's a coaching-judgment question worth its own conversation, not a default I should quietly build in.

## How it works

1. **A small, pure "did this exercise actually improve" check.** For every main exercise trained during a just-finished block, look at the real sessions logged for it (skip anything not logged — see above). Compare each pair of consecutive real sessions: did the second one show more weight, or the same-or-more weight with more reps? That's genuine progress, reusing the app's own existing definition of a working weight (the heaviest real set logged that session) rather than inventing a new one. If most of those real comparisons show no improvement, the exercise is flagged as stalled for that block. Needs at least three real logged sessions (two comparisons) before it can flag anything — with only two sessions (one comparison), a single off day would look identical to a real stall, exactly the case this is meant to exclude. Fewer than three real sessions in the whole block: not enough data to say anything, skipped, not flagged either way.
2. **Missed sessions are tracked, but kept separate.** The app already has a clean, tested way to count missed training days for a stretch of time. This pass reuses it only to decide whether there's *enough real data* to run the stall check at all — not to itself change anything in the plan yet (see "not building" above).
3. **When a stall is found, the fix is applied directly, the same way an exercise swap already works today.** The app already has a mechanism for recalculating one exercise's starting weight when it gets swapped mid-plan. This reuses that exact mechanism to hold the stalled exercise's starting weight in the *next* block at what you actually last lifted, instead of the formula's usual step-up. Nothing else about that block changes.
4. **This check runs once, the first time you open the app after moving into a new block** — the app already knows what week/block you're on; there's no way to run something the moment a block "ends" in the background, so this checks on your next visit instead, the same way a couple of other periodic checks in the app already work.
5. **The explanation reuses UI that's already built.** The load display on an exercise already shows a small note under the number (today: "held at Xkg — didn't hit the reps last time" style text, from the existing single-session progression check). This pass feeds that exact same display a new note when a block-level hold applies, plus a short coach-voice chat message and a small "new from your coach" nudge on the dashboard.

## Critical files

- `src/lib/progression-engine.ts` — has the exact building blocks to reuse: `maxWorkingWeight` (the "heaviest real set" definition) and the shape of `getDoubleProgressionRecommendation`'s note/recommendation object. The new block-level stall check is a new function here or in a new sibling file, built from these, not a rewrite of them.
- `src/lib/streak.ts` — `computeStreak` already does correct missed-session detection; reused as-is to gate the stall check, not modified.
- `src/lib/mesocycle-edit.ts` — has the existing "patch this exercise's stored weeks with a recalculated starting weight" mechanism (used today for exercise swaps); the new block-boundary hold reuses this same patching approach rather than touching the generator itself.
- `src/components/exercise/LoadChip.tsx` and `src/components/exercise/TodayPanel.tsx` — already have a working `progressionNote` display; the new block-level note flows through this same existing prop, no new UI component needed.
- `src/App.tsx` — has the existing "check something once per app-open, after restoring state" pattern (used today for injury-adaptation expiry checks); the new block-boundary check follows the same shape.
- `src/lib/exercise-plan.ts` — read-only reference for exactly how a block's formula-driven starting weight is currently computed (`generateMesocycle`), so the patch this plan adds produces a number in the same units/format, without needing to modify this file.

## How I'll prove it actually worked

- Confirm the stall check correctly treats "more reps, same weight" as real progress, not a stall — this was your specific correction, so it gets its own direct test, not just a general check.
- Confirm a block with several missed sessions but too little real data doesn't get flagged as a stall either way.
- Confirm the held weight actually shows up correctly on the exercise the next time it's trained, with the right note, and that logging a different (heavier) weight than the hold suggests works exactly like it does today — nothing blocks it.
- Run the app's full existing safety/correctness check suite unchanged — this must never touch equipment, injury, or exercise-selection logic, only one exercise's starting weight in one specific, narrow case.
- Reproduce a real profile with a genuinely stalled exercise's logged history and confirm, end to end, that the next block actually holds steady with the right explanation — not just that a function returns the right value in isolation.

## Model and effort

**Sonnet 5, high effort.** This is the most architecturally significant of the four steps so far — it's the first thing that reads real logged history back into what gets prescribed, and it touches load prescription, which is explicitly safety-adjacent. Worth the extra thinking time to get the "what counts as real progress" logic exactly right, the same bar as Step 1's scoring design.

---

*Status: approved 2026-08-14. Ready to build.*
