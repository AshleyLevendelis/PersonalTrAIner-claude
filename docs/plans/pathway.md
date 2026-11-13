# The pathway: walks, then short home strength (strategy slice 3, 13 Nov 2026)

His strategy of 13 Nov 2026, slice 3, and his rulings that day ("go with your recommendations"):

- **Ruling 1: strength joins the walking pathway from week 3, as short home sessions.**
- **Collision (d), answered "Setup asks, optional"**: setup asks what he enjoys, optionally.
- The prompt: read the age band; swim or ride can replace a walk; two 10-15 minute home strength sessions from week 3;
  balance from 65; the coach proposes the pathway and offers the gym instead; age only adds safeguards and never
  downgrades; keep the single doctor line and no screening; four personas added to the grid, first 4 weeks read.

## What exists (measured 13 Nov 2026)

- The pathway is the existing starting-out plan (`starting-out.ts`): a beginner whose day is sedentary, whose goal is
  not muscle or functional strength, and who chose "Get moving first". Every training day is a walk: 20 minutes in
  block 1, +5 a block, RPE 3. Nothing else, for all 16 weeks.
- No screen draws a day that has both an activity and exercises: every surface branches on "has exercises". A day
  with exercises can already carry a cardio block after it (the goal's cardio), drawn and logged as a cardio row.
- Age is read in one place only: the starting-weight GUESS for a lift with no history tapers gently after 40
  (a population strength standard, floor 70%). Logged weights and calibration always win over it. Nothing is capped.
- The doctor line: one sentence at the end of setup. No screening questions.

## What is built

### 3a. Home strength from week 3 (the pathway only)

- From week 3, **two** of the week's walk days become **strength + walk** days: a short home circuit first, then the
  walk. With one walk day a week, that one. The two are spread through the week (never back to back when the week
  allows it). The other walk days stay walks.
- **The circuit**, all bodyweight, at home, chosen in code from the catalogue, one per pattern:
  - squat: Box Squat (Bodyweight) — a sit-to-stand onto a chair; with a sore knee, Wall Sit (a knee-friendly hold)
  - push: Incline Push-Ups (hands on a worktop); left out if the shoulder or wrist rules it out
  - pull: Towel Row
  - hinge: Glute Bridge
  - Every move goes through the same injury filter and exercise bans the plan uses. A move ruled out is replaced by
    the pattern's knee-friendly option where one exists, else left out, and the day's note says which.
- **Dose** (CSCS, basis below): two sets of each move, 8-12 reps (a hold 20-30 s) in weeks 3-8 and 12-15 (30-40 s)
  from week 9 (more reps before more sets keeps it inside 10-15 minutes); RPE 5-6, two to four left in the tank;
  45 s between sets (never 30: his 18 Sep 2026 rest ruling). About 15 minutes by the app's own session clock
  (16 from week 9 as the reps rise), up to 2 more with the balance hold.
- **The walk on a strength day** keeps the block's minutes unless the day would run past the session length he chose;
  then the walk is shortened to fit, never under 15 minutes.

### 3b. Age band (safeguards only)

- `ageBand(age)`: under 50, 50 to 64, 65 and over, from the age the app already holds.
- **65 and over: balance.** On the pathway, a Single-Leg Balance Hold (a hand near a counter) joins the circuit,
  one hold of 20-30 s a leg. On an ordinary plan, the same hold (two a leg) joins the warm-up of every training day,
  ADDED AFTER the day is sized, so it takes nothing away and the session runs about two minutes longer (his 13 Sep
  2026 ruling for additions). Measured: built into the warm-up's time instead, it cost a 68-year-old's plan sets in
  31 places. Nothing is removed, lightened or swapped for anyone because of age.
- **The older first-weight age taper, named.** For a lift with no history, the starting GUESS tapers after 40
  (0.7% a year, floor 70%). It is kept: it is an estimate of an untested person's strength from population
  standards, the calibration week replaces it with what he actually lifts, and a stated working weight bypasses it.
  It is not new and not part of this slice, but it does move a no-history 68-year-old's plan in 23 places against
  the same person at 40 (mostly rep ranges, through the hold-the-weight-climb-the-reps rule), and the gate prints
  that count on every run so it is never hidden.
- The age band changes no exercise, set, rep, rest or weight. Gate: the 68-year-old persona's plan is the same plan
  as the same person at 40, plus the balance hold.

### 3c. Swim or ride in place of a walk

- Setup gains one optional question, asked only of someone who chose the pathway: "Besides walking, do you enjoy
  swimming or cycling?" (Swimming / Cycling, multi, skippable). Profile has the same row.
- In each week, one walk-only day becomes a Swim or a Cycle at the same minutes and effort, with a line saying why.
  With both, they alternate weeks. A strength day keeps its walk (the walk is the easy finish at home).
- Stored as a profile column (`enjoyed_activities`, migration NOT run). Before the migration the setup answer is not
  kept (the insert retries without it) and Profile's row says it is not switched on yet.

### 3d. The coach proposes the pathway and offers the gym instead

- The setup option is reworded: "Walks, then home strength" — "Walks to start; two short home strength sessions
  join from week 3." The other stays "Straight into training". The setup coach's instruction says the same and
  that the gym is always the alternative. Needs the `onboarding-chat` deploy for the coach's half.

### 3e. Personas (the grid)

Seeded, first 4 weeks printed (`measure:pathway-personas`) and held by `test:pathway`:

1. 62, never exercised, sore knee, fat loss, home, 3 days: pathway; weeks 1-2 walks; weeks 3-4 two strength + walk
   days with Wall Sit (not Box Squat).
2. 50, desk job, beginner, fat loss, gym, 3 days: pathway (the same rule as anyone); no balance.
3. 45, returning runner (intermediate, lightly active, conditioning): ordinary plan, untouched by any of this.
4. 68, lifting three times a week (intermediate, full gym, muscle): ordinary plan, identical to the same person at
   40 apart from the balance hold in each warm-up.

## CSCS review

1. **Training effect**: the walk keeps the aerobic dose; two short sessions add the muscle-strengthening work every
   guideline asks for (twice a week, all major muscle groups), at an effort a novice can recover from. Balance from
   65 is the WHO "multicomponent" recommendation for older adults (fall prevention).
2. **What it takes away**: on a strength day, possibly a few walking minutes when his session length is short; the
   weekly walk total drops by at most that. Nothing else.
3. **Fundamentals**: squat, push, pull and hinge are all covered twice a week; progression is reps (8-12 to 12-15)
   alongside the walk's own block steps; recovery is two non-consecutive days; specific to "get moving, then get stronger".
4. **Floors and ceilings**: none redefined. The walk's 20-minute start, +5 a block and RPE 3 are unchanged; no load
   is prescribed (bodyweight).
5. **Scope**: no screening, no diagnosis, no rehab beyond the existing knee-friendly choice; the doctor line stays.
   Basis: ACSM's guidelines (2-3 days a week, 1-2 sets of 8-12 for novices, RPE 5-6), WHO 2020 physical activity
   guidelines (muscle strengthening 2+ days; balance for 65+).

## Not built

- The coach's own control for the enjoy answer (screen and setup only; named in the parity list).
- A third balance day for 65+ on the pathway (two strength days carry it; walks have no exercise list to hold it).
- Strength sessions in a gym for the pathway (it is home by his ruling; "Straight into training" is the gym route).
