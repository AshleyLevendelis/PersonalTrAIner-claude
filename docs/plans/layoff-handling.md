# What the app does when somebody stops training (RULED B and BUILT, 8 Oct 2026)

Ashley, 8 Oct 2026: *"What happens if the user doesn't train for a few days or weeks or doesn't
log anything in the app? Does the app progress on its own? Do the weights ramp up? What happens
when the user checks back in?"* Then: *"Yes, plan the layoff handling."*

**HER RULING, 8 Oct 2026, from three options: B** — after twelve weeks or more, OFFER to start
the plan again from week 1 with a calibration week, one tap, never automatic; over easing the
weights only, and over restarting automatically. **BUILT the same day**; what was built, measured
and left is in BACKLOG.md. Two deviations from the plan below, both named: the first session back
keeps the plan's rep target rather than dropping to the low end of the range (the eased weight
already leaves reps in reserve, and a second number moving on the same row is a second thing to
explain), and the restart offer sits on the training-day card, so a rest day shows the coach's
welcome back but not the button.

Tags: **READ** = read the code, did not run it. **MINE** = a CSCS decision under her 18 Sep
delegation, an assertion with a stated basis, not a measurement. **HERS** = what the app says
or asks.

## What happens today (READ, from a traced report; nothing was run)

- The plan week runs by calendar date and ignores logging (`calculations.ts`
  `getActiveMesocycleWeek`). The deload (week 4 of a block) and the calibration week are fixed at
  generation. The printed weekly ramp is a formula (`exercise-plan.ts` ~7471-7477), not read from logs.
- Today's card weight comes from the last logged session of that lift
  (`TodayPanel.tsx:621` → `getDoubleProgressionRecommendation`, `progression-engine.ts:331` →
  `getLastSessionSets`, `set-log-store.ts:954`). Every top-rep set adds one increment. **That
  lookup has no age limit.** A session from eight weeks ago counts like yesterday's.
- With no history the printed (calendar-ramped) weight stands, so somebody who never logged a lift
  and returns in week 3 is prescribed week 3's weight.
- A missed day is marked missed and the opener asks about yesterday only
  (`coach-opener.ts`, `missed_yesterday`). The "quiet week" phone notification
  (`coach-moments.ts` `week_gone_quiet`) is built and not live.
- Block-end sweeps (stall, beat-target, load suggestions, attendance hold) run only if the app is
  opened in week 1 of a block, need 3 logged sessions, and are never retried.
- **Nothing** detects a layoff: no reduction, no ramp-back, no re-calibration, no plan pause, no
  welcome-back message. Not checked: the coach's system prompt for a return-from-break rule; the
  missed-week chat prefill CLAUDE.md mentions (not found).

## The problem, in the coach's terms (MINE)

The person returning after a break is told to lift last time's weight **plus an increment** (or,
unlogged, a weight that kept ramping while they were away). A qualified coach would do the
opposite: a short break costs little, a longer one costs real strength and, above all, tolerance
to the work (the soreness and joint load of the first session back, not the 1RM). The first session
back is where people get hurt or put off.

## Proposal

### 1. One measured fact: days since the last logged working session
Person-level, local date on the app clock (`getAppNow` / `getLocalDateString`, never UTC — see the
6 Oct lessons). Working sets only (warm-ups and drops excluded, as everywhere else). Computed from
the same store the progression engine reads. No new column, no migration.

### 2. Four bands (MINE; the numbers are judgement, recorded here so they can be changed)
| Days since last session | What the card does for the FIRST session back |
|---|---|
| 0-9 | Nothing. Normal training and normal progression. |
| 10-20 | Hold: the last weight, **no increment** even if every set hit the top. Say so in one line. |
| 21-41 | **Ease back: about 90% of the last working weight**, rounded to the lift's own loading step, reps at the low end of the range. |
| 42-83 | **About 80%**, reps at the low end, plus the ease-back week below. |
| 84+ | Treat as a restart (see 4). |

Basis (an assertion, not a measurement): trained lifters hold most strength for roughly three
weeks off and lose it progressively after that, while regaining it much faster than it was first
built; returning at about 90% (3-6 weeks) and 80-85% (6+ weeks) with reps in reserve is the usual
conservative return, and the real risk is unaccustomed volume rather than the bar weight. Rounding
to the lift's loading step, and never above the previous working weight, is part of the rule.

After that first session back the normal rule resumes from the logged weight, so the app climbs back
with the person: an easy top-of-range session earns the next increment. Named limit: from 80% that
takes about three sessions to recover, which is deliberate.

### 3. It applies to the number the card shows, wherever it comes from
Both sources, or the fix leaves the second one wrong:
- **Logged lift:** scale the progression engine's answer (and suppress the bump in the 10-20 band).
- **Unlogged lift (printed weight stands):** a returner whose last session was long ago gets the
  same factor applied to the printed number, because the calendar ramp kept moving while they did not.
The reduction is **today-only, derived, and never edits the plan** (the same shape as "shorten
today"): once a session is logged the gap is zero and it switches itself off. No stored flag.
**One-weight coherence:** the warm-up ladder and every per-set number are rebuilt from the scaled
working weight, not left at the old one. Bodyweight movements are unchanged (nothing to scale);
added-load lifts scale the added load.

### 4. A long break (84+ days, 12 weeks): HERS to decide, see the question below
The calendar has moved on 12 weeks, the person may be in the last week of a plan and a deload that
fell during the break has been "used". Options are in the question.

### 5. The coach and the screen say the same thing
- The card carries one honest line ("Back after 3 weeks, so today is eased to 90% of last time").
- A new opener kind, `welcome_back`, for a layoff of 10 days or more: warm, one short question that
  earns its place (how did the break go: sick, injured, busy). **If injured or in pain, the existing
  triage applies unchanged** (niggle / lasting / sharp-or-worsening names a professional and
  changes nothing).
- The coach's context carries the same band and factor, so it never contradicts the card.
- The phone notification `week_gone_quiet` stays as it is (not live; hers).

### 6. What it must not do
- Never raise anything. Never go below the movement-pattern floors or the "never below three
  exercises" floor (it scales weight, not exercises). Never touch the plan, the week, the
  mesocycle or history. No diagnosis or rehab (scope question 5 of the CSCS review).

## CSCS review (the five questions, answered as a plan, not measured)
1. Training effect: protects the first session back and keeps the stimulus (reps at the low end,
   weights still real); progression resumes at once.
2. Takes away: up to a few sessions of ramp-back at the heaviest return. Counted, not hidden.
3. Fundamentals survive: pattern coverage and overload untouched; recovery respected; specificity kept.
4. Floors/ceilings: no existing floor or ceiling is redefined; the ceiling and plausibility checks
   still run on the scaled number. The "increment" rule gains one condition (recent session).
5. Scope: inside. Injury answers route to the existing red-flag rule.

## Build, in stages (after her answer)
- **L1** One pure function: days since last working session → band and factor. Gate `layoff`: every
  band edge (9/10, 20/21, 41/42, 83/84), dates across a clock change, `getAppNow`, rounding to the
  loading step, never above last weight, bodyweight and added-load, unlogged lift, warm-up rebuilt.
- **L2** The progression engine and the printed-weight path both call it (the second is the one
  easy to miss). `engine-tracer` before building: where else is a day's weight chosen (swap, add,
  rebuild-today, shorten-today, the coach's `log` reads) so none keeps the old number.
- **L3** The card line, the coach context, the `welcome_back` opener, the phrasebook sentences.
- **L4** Browser driver: a harness plan with a session N weeks old, one per band, screenshots read;
  coach-parity and the coach exam case for the welcome-back turn (needs a re-run on her machine).
- Every new check mutation-tested; derived gates plus `test:bundle` and `test:no-dead-code`; full
  sweep before any merge; BACKLOG and CLAUDE.md updated. **Frontend plus `chat-gemini` deploy** (the
  coach's context). No migration.

## Not in this plan (named)
Per-lift staleness for somebody who trains but skips one lift for months; changing the plan's
calendar or pausing the week (her 6 Oct ruling keeps weeks on the date); the block-end sweeps'
"only if opened in week 1" fragility (a separate lead); the quiet-week notification going live.

## The one question that is hers
What should the app do after a **very long** break (12 weeks or more) or when the plan has run
nearly out?
- **A. Ease the weights only**, and leave the plan where the calendar has put it.
- **B. Offer to restart from week 1 with a calibration week**, one tap, never automatic
  (**recommended**: it matches her "offer, don't surprise" rulings, and a calibration week is the
  honest way to find working weights again).
- **C. Restart automatically.**
Under every option the weights are eased as above; the question is only the restart.
