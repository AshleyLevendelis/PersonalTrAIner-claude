# Running: walk-run to a half marathon (strategy slice 6, PLAN ONLY, 13 Nov 2026)

His strategy of 13 Nov 2026, slice 6, and ruling 4 ("the first sport is running"). REPORT ONLY: nothing here is built
until he says "build it". Ruling 5 (watch / Strava import) is later and not in this plan.

## What exists today (measured 13 Nov 2026)

- A run can be LOGGED (cardio row: activity, minutes, effort Easy / Steady / Hard, distance since 22 Oct) but never
  PRESCRIBED as a progression. The only prescribed activity is the starting-out walk (+5 minutes a block).
- Running someone already does is "another sport" (setup or the coach): it moves sessions off those days and, if hard or
  twice a week, takes the lifting plan one recovery notch down. It never plans the running itself.
- A run while a knee, ankle or hip ease-off is running is asked about once, never blocked.
- The pathway (slice 3) already draws a day that is a timed activity, and a day that is strength plus a timed activity
  after it, so a run day needs no new kind of screen.

## The proposal

### Who gets it, and how they get there

- A RUNNING GOAL, set in setup ("what do you enjoy?" gains Running) or by telling the coach ("I want to run a half").
  The target is one of: run 20 minutes non-stop, 5 km, 10 km, a half marathon (21.1 km), with an optional race date.
- Lifting stays. Running joins as its own days, and the strength plan keeps two sessions a week (one for a half), so
  the legs are trained, not only used.

### The ladder (time and effort, never pace)

| Stage | What a week holds | Moves on when |
|---|---|---|
| 1 Walk-run | 3 sessions: 8 x (1 min run, 90 s walk), to 4 x (5 min run, 1 min walk) | two weeks of all three done at Easy |
| 2 Continuous | 3 easy runs of 20-30 min | 30 min non-stop at Easy, twice |
| 3 5 km | 2 easy runs + 1 longer run to 35-40 min; from week 3 of the stage one session of strides | the long run reaches 40 min |
| 4 10 km | easy, one steady (tempo) session, long run to 70 min | the long run reaches 70 min |
| 5 Half | easy, one steady or interval session, long run to 2 h 15 | race week, or two long runs over 2 h |

- Effort words are the app's own (Easy / Steady / Hard). About four in five running minutes are Easy.
- THE SAFETY RULE, from the prompt and enforced in code: a planned long run is never more than 10% longer than the
  longest run he logged in the past 30 days (time, or distance where logged). With nothing logged, the stage's first
  number stands. Weekly running time also rises by no more than 10% a week.
- BLOCK BY BLOCK, like the lifting: every fourth week is lighter (about 70% of the time), and the next block's numbers
  are set from what he actually logged, not from the calendar. A missed long run is not made up; a missed week repeats
  that week.
- A race date counts back: the plan starts the stage that reaches the target with a two-week taper; if it cannot be
  reached safely by that date, the app says so and proposes the nearest target that can.

### How it sits beside the other rules

- Age adds safeguards only: from 65 the walk-run stage lasts at least four weeks and a balance hold stays in every
  warm-up (slice 3); nothing is taken away.
- Pain: the existing triage (niggle eases off, lasting goes on the list, sharp names a professional and changes
  nothing). A knee or ankle ease-off turns the next runs into walk-run at the same minutes rather than removing them.
- Strength days are never the day before the long run or the hard session (CSCS: leg soreness spoils both).
- The coach can move a run, swap it for a ride or swim at the same minutes, shorten it to the floor (slice 2), or log
  one done elsewhere, all with the existing tools plus one new one (set or change the running goal).

## CSCS review (mine, recorded so it can be checked)

1. Training effect: aerobic base first (time at Easy), then specificity (steady and long runs) for the distance.
2. What it takes away: lifting frequency drops to two sessions a week (one for a half). Leg volume on lifting days
   is reduced in the run-heavy weeks rather than run days being cut.
3. Fundamentals: progressive overload by time with a 10% cap; recovery by a lighter fourth week and no hard
   back-to-back days; specificity to the stated distance.
4. No existing floor or ceiling changes meaning.
5. Scope: no diagnosis, no rehab beyond the existing ease-off.
Basis: the walk-run method used by beginner programmes (run/walk intervals building to continuous running), the
widely used 10% rule for weekly increase, and polarised (about 80/20) intensity distribution for endurance work.

## Questions that are his (to be asked one at a time before building)

1. What the goal is called on screen and whether a race date is asked for in setup or only by the coach.
2. Whether running days replace lifting days or are added to them (my recommendation: replace down to two lifting
   days, because recovery is the limit for a new runner).
3. Whether the app ever shows pace (my recommendation: no, minutes and effort only, until watch import exists).

## How it would be built (slices, each with its own gates)

- R1: the running goal (setup answer, profile, coach tool), stored with a migration; the ladder as pure functions;
  `test:running-ladder` (stage moves, the 10% long-run cap off logged runs, the lighter fourth week, race-date maths).
- R2: run days in the plan (generator places them; strength days kept off the eve of the long or hard run); the
  pathway's activity day reused; `verify:running-day` at 390x844.
- R3: block-by-block adjustment from the log (what was run sets the next block); the coach's context and tool.
- R4: personas in the grid (a 45-year-old returning runner aiming at a half; a 30-year-old couch to 5 km; a
  68-year-old to 20 minutes non-stop), first 8 weeks printed.

Needs, when built: one migration (the running goal), the `chat-gemini` and `onboarding-chat` deploys.
