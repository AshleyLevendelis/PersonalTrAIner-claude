# A different KIND of session today — cardio, functional, or another style

**Ashley, live test 19 Oct 2026** (finding 15 of `docs/audits/live-test-2026-10-19-findings.md`):
*"I didn't want to do the workout prescribed today but I would have to go in and swap every single exercise. I want
to be able to request a different workout. Or different type of workout easily. For example, if I cant do weights
today I should easily be able to say something like 'lets do a cardio workout today' to change the entire day or
'give me a functional workout today that includes sled push, box jumps and other similar style exercises'."*

**Her ruling, 20 Oct 2026: "Drop it, today only."** A request for a different KIND of session replaces the WHOLE day,
main lift included, for today only. The main lift comes back the next time it is due, at the weight it would have
had, because nothing about her history changes. Her 16 Sep "keep the main lift and rebuild around it" still holds for
"a different session" of the same kind (`propose_session_rebuild`, `rebuildDayAroundMainLift`), untouched.

This touches injury and kit filtering and load prescription, so this plan comes before the build.

## What existed, measured

| Exists | Changes today's kind? |
|---|---|
| Rebuild today (screen and coach) | No. Keeps the main lift, swaps the rest like for like |
| "I did something else instead" / activity swap | No. Records what she did, prescribes nothing |
| `propose_cardio_session` | Refuses a day that already has a session |
| Circuit log | Records a finished circuit |
| `propose_style_change` | Lasting, rebuilds the block. The prompt tells the coach never to use it for one day (§3f) |

**Why generation cannot simply be re-run with the style changed.** Measured on a seeded profile: one full-body day
generated with `training_style: 'functional'` is a lifting session (Deadlifts 3x8-9, Neutral-Grip Dumbbell Press,
Lat Pulldown, Chest-Supported Row, Landmine Press). In this app "functional" is a lifting style. And the generator's
own "Conditioning & Core" day, built for a combat week, held Farmer's Walk, Hanging Leg Raises, Bird Dog, Romanian
Deadlifts, Battle Ropes and Lat Pulldown: ONE cardio exercise in seven, because the week's top-up and balance passes
fill it with strength work. Neither is what "a cardio workout" or "sled push, box jumps and similar" means.

So the session is COMPOSED, from generation's own parts, by one new pure module.

## The builder — `src/lib/session-kind.ts`

`planSessionKindToday({ mesocycle, profile, weekNumber, dayName, kind, moves, exclusions, loggedSets })`

1. **Refuses** a day with no session (rest day, a planned walk), a day with working sets already logged ("a session
   you have started is not a session to redraw underneath you", the rebuild plan's own rule), a style kind equal to
   her own style (that is the rebuild, which keeps her main lift), and a pool that cannot make the kind (fewer than
   two working exercises once kit, injuries and avoids are applied). Every refusal is a sentence.
2. **Starts from the planned day, always.** If today already carries a different kind (she asked for cardio, then
   changed her mind to functional), the original planned day is the base, so the main lift, the Undo and the second
   request all refer to the session that was planned.
3. **The pool is hers.** `getConstrainedPool` with the KIND's style in place of hers (style is the one stage allowed
   to change, `stageStyleFilter`'s own comment: "style is a preference, not a safety constraint"). Equipment and
   her kit list, injuries (the profile it is handed is the pool profile, so a running ease-off is in it), the avoid
   list and skill all still remove. Cardio has no style, so its pool skips the style stage.
4. **Ranked by the app's own ranker** (`orderCandidates`, seeded per date and kind so the trial and the confirm are
   the same session), with this week's other days counted as already used so it does not repeat tomorrow's work,
   and today's planned main lift excluded outright (it is the thing coming back next time).
5. **Priced the way generation prices that style and phase**: reps from `repRangeForIncomingExercise` with the kind's
   style, intervals, holds and carries from `fixedUnitPrescription`, sets from the style's own set table scaled by
   experience and the phase's sets multiplier (and halved on a deload, generation's 0.5x), rest from
   `unbudgetedRestSeconds` with the phase's own shift and the main-lift floor, and every weight through
   `buildReplacementSlot` (`recomputeLoad`: her logged history where she has it, the calibration week's caution, a
   deload at 70%).
6. **Sized to her session length**: blocks are added in priority order while the day, with its warm-up, stays inside
   the length she set (`getDurationBudgetSeconds`, never past `getSessionMaximumSeconds`). Rest is never cut to fit:
   her 18 Sep "protect the rest, do less" ruling, so a block is left out instead.
7. **Named moves are not invented.** Each move she names is resolved against the catalogue with the logging
   resolver (`resolveExerciseName`, aliases first). In the catalogue and allowed: it goes in, in the block of its
   own pattern, and is never sized out ("you asked for it, you get it", 13 Sep). In the catalogue and not allowed:
   the reason is said, by the stage that removed it (kit, injury, avoid list, level). Not in the catalogue at all
   (sled push): said plainly ("There's no sled push in the app's exercise list"), and where the job it does has a
   real stand-in in her pool, the stand-in is named ("so Farmer's Walk does the loaded carrying").
8. **The shared tail** (`settleWeek`) runs on the result: set hierarchy, one weight per lift, load coherence and a
   warm-up built from what the day now holds, and only TODAY takes its result. AS BUILT, a change from this plan,
   decided as a CSCS coach after measuring it: the week's OTHER days are not rebalanced around a one-off. Run as an
   ordinary edit, the balance pass answered a cardio Monday by cutting Friday's presses 4→2 and Wednesday's 3→2,
   work she can still do, to square a push:pull ratio over a week that has simply lost a session. A missed day or
   an activity swap leaves the week alone for the same reason.
9. **Today only.** One day of one week is written. The day carries a marker (`kind_today`) holding the planned day,
   so **Undo restores it exactly**, after a reload too, and refuses once working sets are logged against the new
   session. The marker and its sentence live in an import-free module (`session-kind-marker.ts`) so the Exercise
   tab can draw them without the builder in its first download; the builder is fetched when it is used.

`confirmSessionKindToday(mesocycle, offer)` writes the trialled week only if the live day is still the day the offer
was built from. `undoSessionKindToday(mesocycle, weekNumber, dayName)` restores. `buildSessionKindTodayProposal`
turns an offer into the words both surfaces show: a lead, the session line by line, and the notes (what she asked
for that is not possible and why, the main lift and when it is back, the length, today only).

## The CSCS call: what each session holds (Ashley's 18 Sep delegation)

Basis, the same for all four: a one-off session replacing a planned resistance session should (a) give a real
training effect of the kind asked for, (b) not take the planned main lift's place (it returns next time, so today
must not be a second, competing exposure), (c) stay inside the time she set, (d) cost tomorrow nothing it does not
have to. NSCA programme design: power before strength before conditioning within a session; plyometrics low in
reps with full recovery; conditioning intervals at work:rest near 1:1 for a general population; a deload cuts
volume about half.

- **Cardio.** Two to four conditioning blocks, each a different modality (substitution group) so no one tissue takes
  all the impact, lowest joint stress first and at most one high-impact block (burpees). Machines where her kit has
  them (rower, bike, treadmill, elliptical), bodyweight and rope intervals where it does not. Each block at the
  catalogue's own intervals (machine 45s on / 40s off, bodyweight 30s / 30s), rounds starting at 6 (experience
  scaled) and grown to the conditioning ceiling (8, or 10 at 90+ minutes) to fill the time, then a core finisher.
  On a deload, 3 rounds a block and no growth. Effort is the week's own effort label.
- **Functional / athletic** ("explosive and dynamic", the app's own label for the style). In order: one explosive
  move as the session's prep (box jumps, broad jumps, slams or swings, at the app's prep dose: they are prep-tier in
  the catalogue), a power hinge (kettlebell swing first), a squat or single-leg, a push, a pull, a loaded carry (the
  nearest real thing to a sled: loaded locomotion and bracing), a conditioning finisher, and core when there is
  room. Priority when time is short: hinge, squat, push, pull, finisher, carry, core.
- **Bodybuilding**: a full-body muscle session: squat, push, pull, hinge, shoulders, then arms and core when there is
  room, at bodybuilding's own rep, set and rest tables.
- **Hybrid**: strength with a conditioning finish: a main compound (squat or hinge), push, pull, conditioning
  finisher, single-leg, core.
- Combat is NOT offered: her August ruling took it out of every place a style can be chosen.

**Named, not built:** the catalogue holds box jumps only as a prep move, so they are prescribed at the prep dose
(2 sets, light) rather than as a working plyometric set (3-5 x 3-5, full rest). A working-tier box jump is a
catalogue change with its own review. There is no sled exercise at all.

## Both surfaces, one builder (the `meal-refit` pattern)

- **Screen**: the day menu (WhatHappenedSheet), "A different kind of session today" (today only, beside "Give me a
  different session"). Pick Cardio / Functional / Bodybuilding / Hybrid (her own style left out), with an optional
  "Any moves you want in it?" box. The offer is shown in the sheet before anything changes; "Use this session"
  writes it. TodayPanel then says what today is, what is back next time, and has "Put my planned session back".
- **Coach**: `propose_session_kind_today` (kind, moves, reason, quote), a courier like the rebuild. The client runs the
  same `planSessionKindToday`, the card's text comes from the same `buildSessionKindTodayProposal`, confirm runs the
  same `confirmSessionKindToday`, Undo the same `undoSessionKindToday`.
- **Prompt** §3d3 gains the distinction; §3f's "a bodybuilding-style session today … answer in text" line now routes
  here.

## Gates

- **new** `test:session-kind` — every refusal; the planned main lift gone today and unchanged next time; no other
  week written; each kind's content (cardio: only conditioning blocks and core, distinct modalities; functional:
  explosive prep, hinge, carry, finisher); kit and injury hold (a minimalist pool never gets a machine; a flagged
  knee gets no knee-contraindicated move); named moves (in, refused by kit with the reason, not in the catalogue with
  a stand-in); priced like generation (reps equal `repRangeForIncomingExercise` for the style; rest never under the
  style's own number); within the session's length; deterministic; the shared tail ran; confirm refuses a stale
  offer; Undo restores the week byte for byte. Mutation-tested.
- `test:coach-parity` (the doc row and the derived screen import), `test:what-happened` / `test:day-verbs` style
  checks if they pin the verb list.
- **new** `verify:session-kind` (screen) and `verify:chat-session-kind` (coach, model stubbed at fetch), each
  mutation-tested, screenshots read.
- A coach-exam case: "something different today" -> rebuild; "can't do weights, cardio today" -> this tool; "from now
  on bodybuilding" -> the style change.

## Deploys

Frontend on merge. `chat-gemini` for the coach's tool and prompt.
