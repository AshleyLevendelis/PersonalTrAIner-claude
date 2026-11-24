# The testing week sets next week's weight both ways

Ashley, 24 Nov 2026, in week 2 of his plan: *"Week 2 and some prescribed sets are too light while others are too
heavy."* CSCS decision, mine (exercise load, calibration and re-anchoring are in the delegation).

## What was wrong (traced, then run)

Week 2 is printed at the testing week's guess plus one step (2 kg a dumbbell, 5 kg a bar or stack). Only a HEAVIER
logged set could move it, and the card then pushed toward the printed number. So:

- **Too heavy.**
  - A guess he found too heavy still went UP a step. This covered a set he called Hard, a set short of the range, and a lighter weight he chose. Run: `cardLoadFor` with a Hard 40 kg session and 45 printed returned 45, "done as planned".
  - The Hard answer to "How was set 1 at 40 kg?" lived on screen only, so nothing could read it.
  - A heavy set for few reps was copied straight into a week of more reps. Example: 34 kg x 8 into a 10-12 week.
  - The heaviest set was taken even when he had called it Hard.
- **Too light.**
  - The same weight for a few reps over the top of the range moved nothing: 10% at most, and only from a wide margin. The step already printed usually swallowed it.

## What changed

1. **The answer is kept on the set it is about.**
   - Easy, About right and Hard are stored as an effort of 5, 7 and 9.5, which read back as the same words. The testing week's own hints are "5 or more reps left", "3 or 4" and "2 or fewer".
2. **One estimate from every set.**
   - Each set is turned into an estimated one-rep max (Epley, the formula every record here uses), using the reps he had left. A set with no answer is read as taken to the limit, the app's standing safe read.
   - That estimate is carried to the top of NEXT week's range, the block carry's own rule.
   - The result is capped at 10% over the heaviest weight lifted.
3. **Up** (as before, but read properly). Week 2 takes the highest of:
   - the heaviest weight done for next week's reps that he did not call Hard;
   - the "outgrown" step (18 Nov);
   - what the sets support.

   A heavy triple is no longer copied in, and a Hard set is not taken as a working weight. A heavier set done for the reps still sets week 2 at that weight, as his 10 Sep ruling says.
4. **Down (new).** When the sets say the guess was too heavy, and what they support is under next week's printed number, every later week of the testing week's block is scaled by the same ratio. Too heavy means any of: a set he called Hard, a set short of the range, or a heaviest set lighter than printed.
   - The block keeps its climb.
   - The deload stays lighter than the week before it.
   - Nothing is raised by this path.
   - Evidence is used once.
5. **The card.** In the week after the testing week, the plan's number wins when the plan was set from those sets. Before, the card read them again, held a weight he could not do the reps at, or pushed a Hard one up.
6. **The sentence.** It says "Week 2 now starts Bench Press at 37.5kg, from how your sets went — not the guess it was printed with."

## CSCS review

1. **Training effect.** Week 2 starts near his real working weight in both directions, so the reps printed are reachable at the intended effort.
2. **What it takes away.** The automatic step after a Hard or short testing week, and copying a heavy low-rep set into a higher-rep week.
3. **Fundamentals.** Progressive overload is kept: the block still climbs and the deload is still lighter. Movement patterns and exercises are untouched.
4. **Floors redefined.** "Never downward" now has one exception, confined to the testing week's own block. The accelerator and block review are unchanged.
5. **Scope.** Load prescription, inside the delegation.

## Not done (named)

- **The last set of each lift is never rated.** The question is asked about the set above the next box, and there is no next box after the last. So the heaviest set is usually read as taken to the limit, which is the safe side. Asking about it would mean switching on the "how did it feel" question in the testing week, which also switches on the set nudge there. That is a separate change.
- **His own plan is not rewritten until the app reads the testing week again.** That happens on every open until his plan leaves block 1. Answers he gave in his own week 1 were never saved, so they cannot be read now. His week 2 moves only on sets that were short, lighter, or heavier for the reps.
- **Later blocks keep the guess** (BACKLOG); the block-2 carry offer is unchanged.

## Checks

- `test:testing-week-both-ways` (33 checks; 17 mutations, 16 caught, 1 equivalent: "a scaled-down weight never rounds up past where it started").
- `verify:calibration-search` 10c: the stored answer is effort 5. The mutation is caught.
- `verify:testing-week-sweep`: its fixture now does the reps of next week's range.
- 62 gates that read the changed files pass.
