# The last third of the plan, where nothing changes

*Plan before build, per CLAUDE.md — this is load prescription. Written
5 Sep 2026 from a read-only sweep plus three traced trajectories. Nothing
built. Ashley asked for the plan after the whole-app audit; the one product
question this turns on is at the bottom and the build waits on it.*

## First: I quoted her a stale number, and the real one is different

I told Ashley this was *"6 in 10 plans contain a lift whose prescription never
changes — pull-ups stuck at 4-6 @ bodyweight, light isolation frozen at 8kg"*
and cited **61.7%**. That figure is from the 29 Aug audit and it has since been
worked three times (the Russian Twist tag fix, the hypertrophy floor, and
`when-the-bar-cannot-go-up.md`). Measured today on a 250-plan stride of the
same 9,216-plan grid:

| | then (29 Aug) | now |
|---|---|---|
| plans with at least one frozen pair | 61.7% | **41.6%** |
| bodyweight lifts frozen | "almost all" | **0.0%** |

**The bodyweight case is closed.** Not one frozen pair in the sample is a
bodyweight lift — the pull-ups example I gave her does not exist any more. I
recalled a headline from BACKLOG instead of re-running the measurement that
sits in the repo for exactly this purpose. The problem is real and still worth
doing; the description I gave was of last month's version of it.

## What is actually frozen

Every remaining frozen pair is a **loaded** lift, and they fall into three
buckets (`measure-frozen-exercises.ts`, 250-plan stride, 626 frozen pairs):

| cause | plans | pairs | what it is |
|---|---|---|---|
| `loaded_carry` | 20.4% | 43.6% | a carry whose weight stopped and whose distance did not move |
| `loaded:implement/capped` | 6.0% | 25.1% | a backpack at the heaviest a backpack goes |
| `loaded:ceiling/capped` | 7.6% | 21.7% | a barbell at the app's estimate of what you can lift |
| `loaded:nohold/band` | 12.4% | 7.2% | a band, where "heavier" is not a number |

Top offenders by pairs: Loaded Backpack Walk (189), Backpack Row (140),
Overhead Carry (55), Barbell Bench Press (30), Barbell Rows (27).

## Three traced trajectories

These are printed from real generated plans, with the generator's own reason
codes (`load_hold` / `rep_bump`) beside each week.

**1. A barbell main, and this is the one that matters.**
`full_gym / functional / beginner / 30-45 / hypertrophy` — Barbell Bench Press:

```
wk 5   3 x 8-10   @ 25kg    hold=-        bump=-
wk 6   3 x 8-10   @ 30kg    hold=ceiling  bump=-
wk 7   3 x 9-11   @ 30kg    hold=ceiling  bump=bought
wk 9   3 x 10-12  @ 30kg    hold=ceiling  bump=bought
wk10   3 x 11-13  @ 30kg    hold=ceiling  bump=bought
wk11   3 x 11-13  @ 30kg    hold=ceiling  bump=capped
wk13   3 x 11-13  @ 30kg    hold=ceiling  bump=capped
wk14   3 x 11-13  @ 30kg    hold=ceiling  bump=capped
wk15   3 x 11-13  @ 30kg    hold=ceiling  bump=capped
```

The weight stops at week 6 and never moves again. The rep bump buys three
reps and then hits `MAX_FROZEN_LOAD_REP_BUMP = 3`. **From week 11 to week 15
the card is character-for-character identical** — the last third of a
sixteen-week plan, on a *beginner*: the person most likely to actually be
getting stronger week to week, and least likely to know the app has stopped.

**2. A backpack, where the ceiling is real.**
`full_gym / combat / advanced` — Backpack Row, `hold=implement`:

```
wk 1   4 x 9-11   @ 25kg    bump=-
wk 2   4 x 10-12  @ 25kg    bump=bought
wk 3   4 x 11-13  @ 25kg    bump=bought
wk 5   3 x 9-11   @ 25kg    bump=bought     <- new block, range resets
wk 6   3 x 9-11   @ 25kg    bump=capped
wk 7   3 x 9-11   @ 25kg    bump=capped
```

25kg is as heavy as a backpack gets. That ceiling is honest — there is no
number to add. Note the range resets at each block boundary and is capped
again within two weeks.

**3. A carry, and a hypothesis I have not proven.**
`full_gym / combat / intermediate` — Trap Bar Carry:

```
wk13 Mon  2 x 40m @ 32.5kg     wk13 Tue/Thu/Fri  40m @ 27.5kg
wk14 Mon  2 x 40m @ 32.5kg     wk14 Tue/Thu/Fri  40m @ 32.5kg
wk15 Mon  2 x 40m @ 37.5kg     wk15 Tue/Thu/Fri  40m @ 37.5kg
```

Monday is frozen 13→14 while the other three days catch up to it. The
distance ramp (`+5m per frozen week`, capped at 3 steps) exists and did not
fire.

**Hypothesis, to confirm first thing in the build and not before:** the
distance ramp keys off `naturalKg` — the load *before* the
one-weight-per-lift-per-week levelling — while what the user sees is the
load *after* it. Monday's natural load kept climbing, so the ramp saw no
freeze, while the card showed the same 32.5kg twice. If that holds it is the
same shape as everything in the audit that just shipped: **the app checking
one number and displaying another.** It is cheap to confirm by logging both
values through one generation, and it should be confirmed before any of the
options below are built, because it may account for a large share of the 43.6%
without any product decision at all.

## What is NOT wrong here

Worth stating, because the temptation is to treat every flat week as a defect:

- **The ceiling itself is correct.** For someone who has never logged a set,
  prescribing past the strength estimate is inventing data — the same
  fabrication rule the rest of the app is built around. The prescription
  already carries an honest sentence for it (`rampArrived`: *"This is as far
  as the estimate goes… Log a set and the number can start moving again."*).
- **The rep cap is correct too.** `MAX_FROZEN_LOAD_REP_BUMP = 3` exists
  because a rep range carries its block's intent: let a strength block's 4-6
  climb far enough and it quietly becomes an endurance block. Raising the cap
  trades one dishonesty for another.
- **`test:frozen-weeks` shipped on its sixth attempt** and every rule in it is
  a previous failure turned into an assertion. Nothing below may weaken it.

So the residual is not a bug with an obviously right fix. It is a real
question about what the app should do when it has genuinely run out of things
to add — and that makes it Ashley's.

## The question, and four ways to answer it

**When a lift truly cannot get heavier — the bar is at what the app estimates
you can do without ever having watched you lift, or the backpack is full —
what should the app show you?**

**(a) Add sets.** Same weight, same reps, one more set. Sets are the one lever
nothing has touched, and the weekly volume-balance passes already move sets
around, so the machinery exists. Downside: more total work is a real training
change, and it collides with the session-length budget and the recovery-capacity
multiplier.

**(b) Rotate the exercise.** When a lift has been capped for two weeks, swap it
for another movement in the same pattern and tier. The catalogue is deep enough
now. Downside: you stop accumulating practice on the lift you were meant to be
progressing, and a beginner benefits from repetition more than variety.

**(c) Say so, and ask for one logged set.** Stop presenting a flat week as
progression: mark it on the card — *"at your estimated ceiling"* — and use the
moment to ask for a logged set, which is the one thing that lets the app
replace its guess with a real number. Downside: it changes nothing about the
training itself; it only stops the app implying something untrue.

**(d) Raise the caps.** More reps, more distance, smaller increments. Smallest
change, but it re-opens the exact rep-range drift that `MAX_FROZEN_LOAD_REP_BUMP`
was introduced to close.

### Ashley's ruling, 5 Sep 2026: **(c)**

Asked in the conversation, one question, four options with a recommendation.
She chose *"say it's at the ceiling, ask for one logged set"* — the
recommendation. (a) "add a set" is therefore a separate later piece and is not
authorised by this answer; (b) and (d) are declined.

**Recommendation as put to her: (c), then (a).** Because for the barbell case — the one on a
beginner's screen for a third of their plan — the lift is not really at a
ceiling. It is at *a guess about a ceiling*, made by an app that has never seen
this person lift anything. Presenting a guess as a wall, silently, is the same
family as the invented "10:00 PM" and the STEPS line that did not exist. (c)
makes the app honest immediately and cheaply; (a) then gives it something real
to offer, and it can be built and measured on its own once (c) is in.

(c) also has a second half already waiting in BACKLOG — *"make a logged set
re-anchor the weight"* — and it runs into Ashley's standing ruling that the app
never bumps load off logged performance without an explicit confirm.
Reconciling those two is its own piece of work and is deliberately **not** in
this plan.

## If she picks (c), what gets built

1. **Confirm the carry hypothesis first** (above). If the distance ramp is
   comparing the wrong two numbers, fix that before anything else — it is
   mechanical, it has a right answer, and it may remove the largest bucket.
2. **Surface the ceiling on the card.** `rampArrived` already exists on
   `LoadPrescription` and is already exposed; the Exercise tab does not render
   it. One line under the weight, and the same fact in the coach's context so
   it stops describing a flat week as progression.
3. **Gate it** — extend `test:frozen-weeks` with a section asserting that a
   capped lift is *labelled* capped, so a flat week can never again be shown
   as an unqualified prescription. Mutations on each new check.
4. **Re-measure** `measure-frozen-exercises` and both sweeps
   (`test:audit` 17,423/0 and `test:quality` 11.51/12 are the current
   baselines), and say plainly if the frozen count does not move — (c) is an
   honesty fix, not a count fix, and reporting it as if it reduced the number
   would be its own small lie.

## Verification for whichever option is chosen

`tsc`, `npm run build`, the full 129-gate suite, plus `test:audit` and
`test:quality` re-run and compared against the baselines above. Every new gate
check mutation-tested. No migration. No deploy unless the coach's context
changes, which (c) does — so (c) needs `deploy:functions:prod -- chat-gemini`.
