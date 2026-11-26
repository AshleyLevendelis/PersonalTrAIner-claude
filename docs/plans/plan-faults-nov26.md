# Plan faults found by a coach's read of the scorer, 26 Nov 2026

His request: "Do a review of all the best use cases for fable right now and get to work ... at least 5 to 10 actions
to improve or fix the app." No question was his to answer: every decision below is training science (CSCS delegation)
or mechanical. Nothing here is merged to `main`.

## How it was found

The plan-quality scorer ran on `main` (45ed71c) during the walk-recorder merge. Its tracked report was eleven days old
(15 Nov), and five rules had moved a long way since without anyone reading them, because the gate only fails on the
7.2 floor. Each rule that moved was traced through the generator before anything was changed, then measured on a
999-plan sample (every 37th plan of the 9,216 grid, so every level, goal, kit and injury is in it).

| Rule (plans tripping it, of 999) | main | after |
| --- | --- | --- |
| a band or improvised move where a loadable one was in the kit | 188 | 0 |
| low recovery not given clearly less work | 181 | 93 |
| conditioning days not matching the goal | 58 | 0 |
| a lighter lift priced against the main lift | 34 | 3 |
| trunk work ahead of the main lift | 10 | 0 |
| pull-heavy week | 3 | 2 |
| average score, of 12 | 11.59 | 11.79 |

The full 9,216 grid is in `quality-report.txt` (regenerated with this work; the numbers are in BACKLOG).

## What changed, and the coaching reason for each

1. **The session set cap follows recovery.** A beginner's 18 sets and a bad back's 22 were absolute, so on a long
   session a low-recovery beginner trained 16.2 working sets a day against a high-recovery beginner's 17.4 (93%;
   30-45 minutes gave 78%). Low recovery is built at three quarters of the work everywhere else in the app, so the cap
   takes the same three quarters: 14 and 17. It only ever lowers, so his "at most 18" holds. After: 74-79% at every
   session length.
2. **A compound added to balance the week goes after the day's compounds.** The 23 Nov rule placed it "before the
   first move that is not a compound", and on a day with an injury that move is the rehab drill sitting straight after
   the warm-up. So a press landed ahead of the Bird Dog and ahead of the bench press it was meant to follow (101 of
   9,216 plans, all with a back or hip flagged). It is now counted from the day's first compound.
3. **No late pass lifts an accessory over the main lift.** The set hierarchy was enforced once as a day was built;
   four later passes (chest's four sets, back's four, the thigh balance, the light day taking sets) each added a set
   and asked only the role's ceiling. Seven plans shipped a row or front squat at 4 sets beside a main lift at 3. A set
   those passes want now goes to an exercise still under its main lift, or is not added.
4. **Real kit before a band or a backpack.** The ranker only docked a band eight points, and the filters in front of
   it remove whatever was used earlier in the week, so once the dumbbell versions were taken the band was the only
   candidate and won unopposed. 71 of 201 home and minimalist plans held one in week 1, and the days read "Lateral
   Raises, Front Raises, Backpack Front Raise". A band cannot be loaded a notch at a time; a coach repeats the
   dumbbell move on another day. It is now filtered out of every slot pick (a required slot with nothing else may
   still take one), and the weekly balance pass, which picked "first in catalogue order", sees real kit first.
5. **The cap keeps a press a pull-heavy week needs.** The cap's "which set goes" rule only knew a week that presses
   too much. A bad back's week is the opposite, and it lost a press from a week already pulling 16 sets to 7. Past the
   same 1.5x band, a pull goes first and a press the week needs goes last.
6. **The scorer says what was decided** (three rules):
   - conditioning: a beginner or low recovery gets none on a rest day (his ruling "B", 14 Nov) and, in a 20-45 minute
     session, one session of its own (CSCS, 22 Nov). The rule expected the full dose and fired on 520 plans built as
     decided. It now has that ceiling and floor; a beginner given none at all still fails.
   - recovery: it summed every row, so warm-ups, rehab drills and conditioning rounds (the same in both plans) pulled
     the ratio toward 1. It counts working sets now, and prints the threshold it compares (it said "15%" for a 23% bar).
   - load coherence: a lift already at the lightest its implement goes (an empty-bar landmine press beside an
     empty-bar bench) is not "too heavy"; the same lift above the bar still is.

**These change what three rules measure**: `recovery_volume_not_reduced`, `conditioning_frequency_mismatch` and
`load_incoherent` counts before 26 Nov 2026 are not comparable.

## The five-question review

1. Training effect: each change moves the plan toward what the number was for (less work on low recovery, the main
   lift first and biggest, loadable resistance).
2. What it takes away: low-recovery beginners lose up to four accessory sets on a long day (the time goes to optional
   mobility); long home-gym days lose a duplicate band move. `time_fit` did not rise on the sample (0 before, 0 after).
3. Fundamentals: pattern floors are untouched (the cap's own rules protect them); overload improves (band to weight).
4. Redefined floors: the beginner cap now reads 14 for low recovery. Recorded here, on the why sheet and in CLAUDE.md.
5. Scope: nothing clinical.

## Found, not changed

- **Moderate and high recovery get the same work.** The 0.9 multiplier rounds away on 3-set exercises (13.8 against
  13.7 working sets a day for beginners; the same at every level), so "High" only differs through the long-session
  top-up. Changing it would move every moderate plan, which wants its own measurement first.
- **93 of 999 low-recovery plans** still sit a little over the scorer's bar (0.77): at a 2-set floor the three
  quarters cannot be reached by whole sets. Rounding, not a pass adding work back.
- **2 of 999** bad-back minimalist weeks are still 0.57 push:pull (the band starts at 0.6).
- `frozen_week` (333 of 999 plans, one slot pair in about 75) is unchanged and already explained (19 Sep).

## Checks

`test:plan-faults-nov26` (37 checks; mutations in BACKLOG). Fixtures are the profiles the broken code named, seeded
with the measurement's own key, plus constructed inputs for each mechanism.
