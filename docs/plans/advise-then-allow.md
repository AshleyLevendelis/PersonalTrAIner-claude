# Advise, then allow: every training change (his ruling, 28 Nov 2026)

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
7. [~] **Volume change and "make it lighter" in a deload week or at a set floor**: say which limit, then allow.
   SCREEN DONE 28 Nov 2026; COACH HALF OPEN (Builder B, below). The screen and the shared step: "Make it easier" takes its step in a deload week ("This is already a
   lighter week, built to let you recover..."), on a day already made lighter (one "Put the full session back" still
   restores the plan), and at the plan's set floor (one set off each, never under one; "...already at the fewest sets
   the plan uses (15 across 7 exercises). Going under that is fine for a day when you're run down..."). Only "one set
   of everything" is left as a no-op. Found on the way and fixed in the shared step: a warm-up move (no volume role)
   lost its last set (a row of zero), and a "lighter" step on a day under the floor pushed sets back UP to it.
   `test:lighter-today` §4, §6 (12/12), `test:sheet-manners`, `verify:shorten-today` §10 (2/2).
   REVIEW FOLLOW-UP (same day): a swap or ban between two steps is never thrown away by Undo (the second step
   starts afresh from the day as it stands); a third step says "already under"; the count is of working sets; a
   heavier step adds one set at most; an unknown exercise name never goes under one set; the "I'm wiped" chip opens
   the preview with the reasons instead of applying straight (`test:lighter-today` §7, 8/8; `verify:shorten-today`
   §11, 2/2). NOT done: `test:edit-keeps-the-bar` still re-scores only the ordinary step, not one under the floor.
   **Coach half: Builder B, call `adjustDayVolumeAdvised(day, direction, profile, { deload: week.is_deload, sayDay, scope })`**
   (src/lib/volume-adjust.ts) in `buildVolumeChangeProposal` (ChatAssistant) and `executeVolumeChange`
   (pending-action-executor): put its `advice` on the card first; for a TODAY scope in a deload week, keep that week
   (both filter deload weeks out with `isVolumeAdjustable`, so today in a deload is still a dead end there); a lasting
   ("from now on") change should still leave deload weeks alone (CSCS: a standing change does not cancel the planned
   recovery week), and the card already says so. Pass `scope: 'ongoing'` for a lasting change: it then stops at the
   floor (the library enforces it). The coach's tool description (chat-gemini) still says the change "never touches a
   deload week" and "will not go below the floor": true for a lasting change only. Builder D owns the why-sheet line
   (app-decisions.ts) that still says it is "refused in a deload week". A heavier step past the role ceiling or the session's time is not in
   this item (it moves nothing today and says why).
8. [~] **A different kind of session on any day this week**, not only today; a started session takes an added block.
   SCREEN DONE 28 Nov 2026; COACH HALF OPEN. A later session day in this week's view offers "A different kind of
   session on Thursday" from its peek, in that day's name ("Just this week"), saved in the plan week the day is in, with
   its line and "Put my planned session back" on the peek. A started session (sets logged) is never redrawn: "Add a
   different kind of block" adds about twenty minutes of the new kind after it (no second warm-up, no second heavy main
   lift, nothing already on the day), the reason first ("You've started today's session, so it stays as it is ...
   expect your next session to feel a little heavier"); "Take the added block off" works only while the day is still as
   the block left it and none of the block is logged. The library also lets a REST day take a different kind with the
   recovery cost first (the screen's rest-day card does not offer it: "Train anyway" is its road); a planned-activity
   day is replaced with "This replaces the planned activity on X". CSCS, mine: an added block on top of training done
   is ~20 min (a conditioning session's floor, the 27 Nov line), never a second heavy main lift. Reviewed
   independently; its seven findings fixed or named below. `test:session-kind` §15 (22 mutations, all caught after three misses each got a check that binds),
   `test:workout-scenarios`, `verify:session-kind` §7, §10 (4/4), `verify:workout-scenarios` A6b,
   `verify:live-run-5` C3 (re-anchored to fix 2). NOT done: the added block skips the settling tail (to leave logged
   lifts alone), so its lifts get no one-weight check against the rest of the week; the screen cannot prove the save
   lands in NEXT plan week's row (its harness plan starts on a Monday), only by reading the code.
   **Coach half: Builder B.** (1) `undoSessionKindToday(meso, week, day, loggedSets, loggedNames)`: pass the names of
   the exercises with working sets logged that day, or an added block can never come off by chat (pending-action-
   executor ~1500, ChatAssistant ~9123). (2) The coach's prompt (chat-gemini ~2851) still says the app refuses once a
   set is logged; it now adds a block: offer it with the reason. (3) The card's other words assume a replacement
   ("Here's today as a different kind of session", the "Today swapped" receipt, "Monday: Cardio session, N
   exercises"); `offer.added` says which, and `buildSessionKindTodayProposal` already words both. (4) Confirm a card
   built with nothing logged after sets ARE logged: rebuild the offer (it would now add a block) rather than replace the
   started session. (5) `planSessionKindToday` takes `sayDay` for a day other than today.
9. [ ] **An exercise added to a rest day makes it a training day** (session-edit.ts: "Make it a training day
   first").
10. [ ] **A past or future day's exercises have the full menu** (swap, remove, move, add), and a swap that cannot
    happen says why instead of doing nothing (TodayPanel peek).
11. [ ] **"Add exercise" on any day**, including a rest or recovery day.
12. [ ] **Change an exercise's sets, reps or weight** for today or the block, on the row and by the coach. Weight
    stays under the ceilings. Missing on both surfaces.
13. [ ] **The coach can start, plan or log a workout of his own** (the screen can).
14. [ ] **A weights session on a future rest day, as part of the plan**, from either surface.
15. [ ] **Move a session into next week** (session-move.ts keeps a move inside its own week).
16. [ ] **A cardio session on one day only** (both surfaces write it for every week of the block).
17. [ ] **Swap for anything**: the coach's "must be the same movement pattern" becomes advice.
18. [ ] **The same exercise twice on a day**: advise "add sets instead", then allow.
19. [ ] **Edits beyond this week** (next week's sessions), for one day or the block.
20. [ ] **The coach's logging windows** (cardio and circuits 7 days; taking a log off 14 days; sessions 14 days)
    widen to any past day; a future day stays refused (it cannot have happened).
21. [ ] **The coach's prompt**: every "do not call it for..." that is a training refusal becomes "offer it with the
    reason"; the "point them at the right screen" fallback is only for what no tool does.

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
  and swap searches, greyed with the reason, and cannot be picked, as the coach already refuses. BUILT 28 Nov 2026 (Builder A):
  `hardStopFor` greys injury and pregnancy stops in both searches, one predicate with the coach's add.
- [x] **Shortening when warm-up + main lift alone is over the time** (fix 6). **ANSWERED 28 Nov 2026: "Keep it whole,
  say the real time"** (over cutting main-lift sets): his 13 Sep "protect the main lift" stands; nothing to build.

## Kept, not refusals

His 15 Sep "offer a cardio session only when he sounds definite" (a maybe is not a request); a plan with no training
day at all; a day already trained or a session in progress never redrawn by a rebuild (data safety); duplicate bans
and no-op changes; the impossible-set ask-once (already advise-then-allow).
