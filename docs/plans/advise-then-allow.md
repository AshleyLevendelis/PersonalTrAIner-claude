# Advise, then allow: every training change (his ruling, 28 Nov 2026)

> **UPDATE, Builder B, later 28 Nov 2026:** the lead's review fixed (one hard-stop rule, read at the last day a change
> reaches); Builder D's five context blocks wired (branch contains D at 61a354d); D's lift-effort route built
> (`propose_lift_effort`). **D's other four routes need ONE prop each from App (Builder A's file) before the coach can
> act, because each screen save does more than write the profile:** meals cooked for me: the single
> `makeMealsElsewhereController({ read, save })` App builds for Profile, passed to ChatAssistant; freestyle a day:
> `useMealDays`' FreestyleController (Nutrition has it), passed to ChatAssistant; cardio days: Profile's save of
> `plan.patch` plus the rebuild offer's confirm (as the running goal), passed as one callback; macro split:
> `handleMacroSplitChange` (it recomputes the day's targets as well as saving), passed as `onMacroSplitChange`. Also
> from App: `chosenMeals` for the meal-markers block. Each then takes the coach about one card's work.

> **STATUS, Builder B (coach half), 28 Nov 2026, branch `claude/builder-b-coach`:** DONE 20 (any past day), 17 (swap
> for anything; named swaps now meet the hard stops, machine versions and from-28-weeks included), 13 start and plan
> (`propose_own_workout`), 21 first part (prompt refusals that were not hard stops). All need the `chat-gemini` deploy
> except 20 (client only). **Waiting on Builder A:** 13's log-afterwards (lift `OwnWorkoutSheet.saveAfter` into a
> library); 21's rest and the two-sessions ruling's coach cards (move into next week / onto a day with a session,
> volume below its floor, train-today on a training day) need the move, volume and train-today libraries to allow
> them first; items 7-12, 15, 16, 18, 19 wait for their shared functions. **Also for A (parity, found here):** the
> screen's swap and own-workout pickers let injury, pregnancy and never-again moves through with a warning (his
> decision 2); the coach's add (fix 4) misses machine versions and the from-28-weeks list (`swapHardStop` fits).


His words: "users can add or remove or change workouts, days' workouts, single exercises, whatever they want, and we
just guide them and tell them the whys, why not ... if somebody wants to train on the day they weren't supposed to,
they should be able to add it and log it in the app." Then: "fix everything one by one and keep the hard stops".

**The four hard stops (kept, his):** pain triaged sharp / one-sided / worsening; an exercise his injuries list
excludes; the load ceilings; the pregnancy exercise rules. Everything else that refuses becomes advice, then allow.

The list below comes from a read-only audit of every training path on both surfaces (28 Nov 2026). Each item is
fixed on its own, with its checks mutation-tested, and ticked here with the commit. Items marked **HIS** reverse an
earlier ruling of his and wait for his word.

## Fix list, in order

1. [x] **A day marked rested, missed, swapped or moved away can be trained after all.** `editTarget`
   (session-ref.ts) refuses every exercise edit there on both surfaces ("X is down as a rest day you chose, so
   there's no session on it to change"). DONE 28 Nov 2026: the edit goes through, with a note first on the coach's card
   ("Thursday is down as a rest day you chose. This changes its session in case you train it after all; log a set and
   it counts as a session again."). No write clears the mark: a logged set already outranks it. A session moved away
   is edited where it now sits. `test:session-ref` §4 (4/4 mutations), `verify:what-happened` 11b2-11b6 (1/1).
2. [x] **"Train anyway" on every kind of day, and a session already done this week can be repeated.** The screen
   offers it only on a plain rest day and drops trained sessions (the coach already repeats one, with advice).
   DONE 28 Nov 2026: one shared control on the rest, recovery/cardio and moved-away cards; opened, it says what training
   today costs (the coach card's first line, train-today.ts) above the week's sessions; a done one is last, "done,
   repeat it". `test:train-today` §5 (4/5 by logic, the fifth by `verify:rest-day` 12a-12e).
3. [x] **Removing an exercise below three is allowed, with advice** (session-edit.ts floor; both surfaces). DONE
   28 Nov 2026: "That leaves Friday with 2 exercises. A short session still counts, but Friday loses that work;
   swapping it for something easier keeps it." on the screen's sheet and the coach's card; only the LAST exercise is
   redirected (that is a rest day). `test:session-edit`, `test:session-ref` §5 (4/4), `verify:moved-edit` §5.
4. [x] **The coach can add any catalogue exercise, warned for kit, style and skill** (the screen's search already
   does). Injury and pregnancy exclusions stay stops. DONE 28 Nov 2026 (`resolveAdditionAnywhere`, card and confirm):
   the screen search's warning on the card; injury, pregnancy and never-again refuse in words. `test:exercise-add`
   (7/7). **Found on the way, HIS:** the screen's add and swap searches let him pick a move his injuries list rules
   out, with a warning (his 13 Sep "show everything, warn me"), which is not the hard stop he kept on 28 Nov.
5. [x] **A paused plan can still take a session today, with advice** (the screen already allows it; the coach
   refuses). DONE 28 Nov 2026: the card says "Your plan is paused: this session is one of your own, nothing else
   becomes due, and the pause carries on." `verify:train-today` D (1/1).
6. [x] **Shortening past its floors** (main lift, three exercises): say what is lost, then allow. DONE 28 Nov 2026: measured, 10-20 minutes
   asked gave 27-31; now the session keeps its warm-up and main lift (every set, his 13 Sep ruling) and says what
   waits and the real minutes (~23 for 15 asked). "Shortest version" keeps its three-exercise definition. 15 minutes
   added to the screen's choices. `test:today-only` (4/4), `verify:shorten-today`. OPEN, HIS: cutting main-lift sets
   when even that is over the time (reverses 13 Sep).
7. [ ] **Volume change and "make it lighter" in a deload week or at a set floor**: say which limit, then allow.
8. [ ] **A different kind of session on any day this week**, not only today; a started session takes an added block.
9. [ ] **An exercise added to a rest day makes it a training day** (session-edit.ts: "Make it a training day
   first").
10. [ ] **A past or future day's exercises have the full menu** (swap, remove, move, add), and a swap that cannot
    happen says why instead of doing nothing (TodayPanel peek).
11. [ ] **"Add exercise" on any day**, including a rest or recovery day.
12. [ ] **Change an exercise's sets, reps or weight** for today or the block, on the row and by the coach. Weight
    stays under the ceilings. Missing on both surfaces.
13. [~] **The coach can start, plan or log a workout of his own** (the screen can). START and PLAN DONE 28 Nov 2026
    (Builder B): new coach action `propose_own_workout`, mode start (now, today) or plan (saved to "My workouts", on a
    day if named); the card lists his exercises with his numbers (none given: 3 x 8-10, the screen's default) and says
    the plan's session stays when today has one; Apply writes through the screen's own store (`saveOwnWorkout`,
    `saveOwnPlan`, `workoutFromPlan`, set numbers after today's), Undo removes it only while nothing is ticked. Hard stops
    by `swapHardStop`; kit or level outside his plan is a warning. `test:own-workout-offer` (40, 18/18 mutations over two rounds),
    `verify:own-workout-chat` (26, 1/1). Review follow-up: a name that fits several is asked about by name; his reps
    are kept as said ("AMRAP", "45s"), a number that cannot be right is asked, never replaced; a day that is not a
    date is asked, never dropped; cardio that is a known move (burpees) meets the stops; Undo leaves a saved workout he
    has changed since; a start card tapped after midnight is refused; set numbers run after the plan's own sets of the
    lift today; "set me up a workout" with no exercises gets a suggestion in words first. **Decided, mine (CSCS): his
    own stated weight is not held to the load ceilings** (they bound what the APP prescribes; the screen's own workout
    takes his number too). **For Builder A (screen, parity):** the screen's own-workout picker lets an injury-,
    pregnancy- or never-again-excluded move in with a warning (`OwnWorkoutSheet`), and the from-28-weeks list is not
    checked there; its Start numbers own sets from 1 when the plan's lift is not yet logged, so ticking them fills the
    plan's row; an open sheet re-saves a workout the chat's Undo removed. Needs the `chat-gemini` deploy. **LOG (after the fact, as its own workout)
    waits on Builder A:** the screen's past-day save lives in `OwnWorkoutSheet.saveAfter` (a component); lift it into
    a library function (e.g. `saveOwnWorkoutAfter(profileId, workout, ...)` in own-workout.ts) and the coach will call
    it. Until then the coach logs what he did on that day with `log_workout` (sets and history, not grouped).
14. [ ] **A weights session on a future rest day, as part of the plan**, from either surface.
15. [ ] **Move a session into next week** (session-move.ts keeps a move inside its own week).
16. [ ] **A cardio session on one day only** (both surfaces write it for every week of the block).
17. [x] **Swap for anything**: the coach's "must be the same movement pattern" becomes advice. DONE 28 Nov 2026
    (Builder B): the tool and prompt now say a replacement HE names is proposed whatever its pattern (the coach's own
    pick stays the swap list's first); the card says what changes ("That puts a squat (Goblet Squats) where Tuesday's
    session had a lunge or split squat (Walking Lunges): the session keeps the work but trains a different movement.
    Fine if that's what you want; a like-for-like swap keeps the plan's balance."; into or out of the warm-up or
    conditioning it says the session "does a different job there"), and any kit, style or level warning. FOUND: a
    replacement he named was never checked against his hard stops on the coach's path. Now `swapHardStop`
    (swap-advice.ts) refuses, at the card and again at confirm, a move his injuries or a running ease-off rule out, the
    pregnancy rules (early AND from 28 weeks, which until now only generation applied) and his never-again list (a
    version answers as its parent). It reads the ENTRY: the review found the add lookup returns nothing for the 477
    machine versions, which would have waved "45-Degree Hyperextension Bench" through for a bad back. `test:swap-for-
    anything` (28, 16/16 mutations over two rounds), `verify:swap-request` 4e0-4g2 (4/4). Needs the `chat-gemini`
    deploy for the tool and prompt words; the card and stops are client side.
    **Left, not mine:** (a) HIS decision 2: the SCREEN's swap search lets an injury- or pregnancy-ruled-out move
    through with a warning, so chat and screen now answer differently; (b) the coach's ADD lookup (fix 4) still says
    "I couldn't find X" for a machine version and misses the from-28-weeks list, the same two holes; `swapHardStop`
    could serve it; (c) `executeExerciseSwap`'s stops are optional, so other callers skip them.
18. [ ] **The same exercise twice on a day**: advise "add sets instead", then allow.
19. [ ] **Edits beyond this week** (next week's sessions), for one day or the block.
20. [x] **The coach's logging windows** (cardio and circuits 7 days; taking a log off 14 days; sessions 14 days)
    widen to any past day; a future day stays refused (it cannot have happened). DONE 28 Nov 2026 (Builder B): all
    four ask one function (`logDayFor`, chat-log-date.ts); a day a week or more back is named by its date ("Wednesday
    26 Aug", with its year in another year) so a mistyped date shows where it went. `test:chat-log-date` (6/6
    mutations), `verify:chat-log-words` 7 (1/1), `verify:extra-cardio` C (2/2). Needs the `chat-gemini` deploy: no
    (client only). Review follow-up, same day: a written date is read as sent (a bad one is refused, never today);
    a day before the plan began is refused like the screen's "No session was planned" (it would file under week 1,
    and it is the floor that keeps a wrong year off the no-Undo session log); the knee question asks only about an
    ease-off begun by the run's day; "I can't see anything logged" (a failed read falls back to 60 days on the phone);
    a circuit said "instead" that cannot count says so. `test:chat-log-date` (60, +6/6), `verify:chat-log-words`
    7f-7h (1/1), `verify:extra-cardio` C5 (1/1).
    **For Builder A (screen half, parity):** the screen still stops at 14 days for another day's optional cardio
    (`LOG_BACK_DAYS`, activity-day.ts); the chat no longer does. **Older, now reaching further (not built):** a past
    cardio log is stamped `completed_at` now (cardio-log-store.ts), so readers sorting by it treat an old run as the
    newest; a cardio/circuit Undo deletes every same-named log on that day; the missed-session card keeps its own
    7-day window and a bare weekday.
21. [~] **The coach's prompt**: every "do not call it for..." that is a training refusal becomes "offer it with the
    reason"; the "point them at the right screen" fallback is only for what no tool does. PART DONE 28 Nov 2026
    (Builder B): read every refusal in the prompt and tool descriptions; most are routing ("not this tool, that one"),
    and pain, injuries, pregnancy, the load limits and "a started session is not redrawn" stay. Changed: the screen
    fallback is now only for what no tool does, with the hard stops listed; a class day's cardio or finisher, the
    sport's volume notch and a climber's finger loading are no longer "never" but "not unasked; asked, offer it with
    the reason". `test:coach-advise-not-refuse` (8, 5/5 mutations). Needs the `chat-gemini` deploy and an exam run.
    **Waits on Builder A's libraries** (the words must not promise what the app still refuses): the session move's
    "a day that already has a session cannot take a second one" and "this week" (fixes 15 and the two-sessions ruling),
    the volume change's "will not go below the floor" (fix 7), train-today's "when today is a rest day".

## Ruled 28 Nov 2026

- **Two sessions on one day: his "Allow, with a warning"** (reverses 8 Sep). Coach half (Builder B): the train-today,
  move and cardio-session cards allow a day that already has a session, leading with the recovery cost. Screen half:
  Builder A.

## HIS (each reverses an earlier ruling)

- [x] **Two sessions on one day** (his 8 Sep ruling: "a day never holds two sessions"). Needed for: moving a session
  onto a day that has one, training on a day that already has a session, cardio in addition to a session.
  **ANSWERED 28 Nov 2026: "Allow, with a warning"** (over cardio only, and over keeping one a day). It REVERSES his
  8 Sep ruling: a day may hold two sessions; the card says the recovery cost first, then lets him. Unblocks fixes 8,
  14, 15 and moves onto a busy day.
- [x] **Near-copies prescribable** (his 3 Nov "Searchable, log-only"): adding or swapping in a version of an exercise
  priced from its parent, with advice. **ANSWERED 28 Nov 2026: "Yes, with a note"** (over keeping log-only): he may add
  or swap one in, priced from its parent, the card naming the plan's own choice; the generator still never picks one.
- [x] **The screen's injury stop** (found in fix 4; his 13 Sep "show everything, warn me"). **ANSWERED 28 Nov 2026:
  "Stop it on the screen too"** (over the warning only): a move his injuries list excludes stays visible in the add
  and swap searches, greyed with the reason, and cannot be picked, as the coach already refuses.
- [x] **Shortening when warm-up + main lift alone is over the time** (fix 6). **ANSWERED 28 Nov 2026: "Keep it whole,
  say the real time"** (over cutting main-lift sets): his 13 Sep "protect the main lift" stands; nothing to build.

## Kept, not refusals

His 15 Sep "offer a cardio session only when he sounds definite" (a maybe is not a request); a plan with no training
day at all; a day already trained or a session in progress never redrawn by a rebuild (data safety); duplicate bans
and no-op changes; the impossible-set ask-once (already advise-then-allow).
