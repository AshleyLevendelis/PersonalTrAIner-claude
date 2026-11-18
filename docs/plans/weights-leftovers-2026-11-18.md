# Four weight-progression gaps (traced 18 Nov 2026, before any build)

Load prescription is safety-adjacent, so this is the plan first. Source: `docs/plans/too-easy-weights.md` D and E and the
14 Sep edit report's #1b, all listed in `docs/audits/artifact-leftovers-2026-11-18.md`. Traced read-only end to end;
the line numbers are the trace's and are leads until each change is made. Decisions are training decisions (mine under
his 18 Sep delegation) except where marked his.

## 1. A deload as heavy as its loading weeks (CONFIRMED defect; build first)
- `block-review.ts` (a stalled main lift is held at its last weight) and `load-suggestions.ts` `confirmLoadSuggestion`
  (a confirmed "start heavier") each price ONE load off the block's first week and write it into EVERY week of the new
  block. Neither has an `is_deload` branch. The generator's deload is 70% (`DELOAD_LOAD_FRACTION`).
- Then `cardLoadFor`'s deload branch shows the printed number under "Deload week: lighter on purpose" to someone who
  lifted last week's number exactly: the full weight under those words.
- Both also copy week 1's per-set ladder onto weeks whose reps differ.
- **Decision:** a deload week takes the deload share of the block's last loading week, on every writer. The block
  review writes the held weight to loading weeks and the deload share to the deload; the confirmed suggestion goes
  through `patchBlockFromLiftedKg`, which already has the deload rule. Basis: a deload exists to drop load and volume
  so fatigue clears while the pattern is kept (NSCA: a planned reduction in load/volume before the next block); a
  deload at full load is not one.
- **The suggestion's sentence** says "You've consistently hit the top of your range" while its trigger
  (`didExerciseOverachieveInBlock`) only checks that most sessions improved. The words are a claim the app does not
  test. Mine to make TRUE (mechanical: the sentence must match the trigger): "You've been improving on X most
  sessions". HIS if he wants different words.
- **Check:** after the block review and after a confirmed suggestion, the new block's deload `suggested_load_kg` is at
  most 0.7x its last loading week (rounded to the implement) and below it; the sentence makes no top-of-range claim.

## 2. A lift away for weeks while training went on (gap; build second)
- `layoffStatus` is only ever fed the ANY-lift last date. `getLastSessionSets` reads a lift's last session with no age
  limit; `rec.lastDate` exists and is used only to find the plan week. `cardLoadFor`'s `keptUp` can then raise the
  card to THIS week's printed number, which climbed through weeks the lift was never trained (50 kg in week 2, back in
  week 6 at 57.5).
- **Decision:** the same bands, asked per lift: from that lift's own last working session, under 10 days nothing;
  10-20 repeat, no step; 3-6 weeks about 90%; 6 weeks or more about 80%; never the "kept up" raise while stale. The
  stronger of the whole-training easing and the per-lift easing applies, never both stacked. No restart offer (that is
  a whole-plan thing). Basis: strength is retained well for about two to three weeks without a stimulus and declines
  beyond it, and it is specific to the pattern trained (the 8 Oct layoff entry's basis, applied to one lift). The note
  on the card reuses the layoff phrase family ("eased: you haven't done this one for N weeks"); wording his to change.
- **Check:** other lifts logged daily, this one last logged 30+ days ago at 50 kg: today's card is at most 45
  (eased), never this week's higher printed number; logged 5 days ago it behaves as now.

## 3. Far more reps than asked at the same weight (gap; build third)
- Card: `hitTopOnAllSets` gives one implement step whatever the margin. Calibration anchor
  (`calibrationAnchorsFor`) compares weight only, so 40 x 20 against a printed 40 anchors nothing. Over 3x the top of
  the range the set counts as "not at top" and the weight is HELD (40 x 40 is treated worse than 40 x 20; that is the
  odd-reps guard and stays).
- Two converters exist and differ by about 3%: `referenceWeightFromSet` (refuses over 15 reps) and
  `carriedForRepRange` (e1RM back to the top of the target range, no cap).
- **Decision:** when every working set reaches at least the top of the range PLUS HALF THE RANGE'S WIDTH again, and
  at least 3 reps over (8-12 asked: 14 or more), the next weight is the larger of one step and the weight
  `carriedForRepRange` gives for the worst set, CAPPED at +10% of the last weight (one session), rounded down to the
  implement. Same rule in the calibration anchor, so the printed plan moves too. Never applied to a set the odd-reps
  guard distrusts, never in a deload, never past a stated kit limit. Basis: the "2-for-2" rule (NSCA) raises load when
  the top of the range is beaten by two or more reps; a 10% ceiling per session is the same ceiling the
  find-your-weight search uses (`findWeightStartKg`), so one rule bounds both.
- **Check:** 3 x 20 at 40 kg against 8-12 gives 44 (the 10% cap), not 42.5; 3 x 12 gives exactly one step; 3 x 40 is
  held; the calibration anchor writes week 2 above 40 for 40 x 20.

## 4. Only the Finish button anchors a testing week (gap; build fourth)
- `applyCalibrationAnchors` has ONE caller (Finish). "I did it, not in the app", the coach's logs, a session closed by
  the 6-hour window, a red-flag park and a set added after Finish never anchor; the printed plan stays on the estimate.
- **Decision:** a sweep when the plan loads: every calibration-week date that has logged working sets is anchored (the
  anchor is upward-only and safe to re-run), so every writer is covered, server-side ones included. Basis: mechanical
  (one rule, every writer); the anchoring rule itself is unchanged.
- Also found, mechanical: the coach's `log_workout` takes a `date` and the client drops it, so the coach cannot log a
  past day (parity doc says it can). Named; separate fix.
- **Check:** a calibration-week day logged only through the sheet rewrites week 2's printed number exactly as Finish
  does; a second load changes nothing.

## Also found, named, not in this build
- At a block boundary the load suggestion (raw last weight) and the beat-target offer (rep-converted) can offer the
  SAME lift two different numbers. One offer should win; which is a product call (his).
- The whole progression effect on today's card ends in `.catch(() => {})`: any throw silently shows plan figures.

## CSCS review (the five questions), for all four
1. Training effect: deloads unload; a stale lift restarts where it can be done well; a clearly outgrown weight moves
   in one session rather than twelve; the testing week counts however it was logged.
2. What it takes away: weight on a deload after a hold or a confirmed raise (intended); weight on a returning lift
   (intended); nothing else. Counted in the checks above.
3. Fundamentals: overload improves (3, 4); recovery improves (1, 2); coverage and specificity untouched.
4. Existing floors and ceilings: the deload share, the layoff bands, the 10% search step and the kit limit keep their
   meanings; each new rule reuses one of them rather than adding a number.
5. Scope: programming only.
