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
7. [ ] **Volume change and "make it lighter" in a deload week or at a set floor**: say which limit, then allow.
8. [ ] **A different kind of session on any day this week**, not only today; a started session takes an added block.
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
20. [x] **The coach's logging windows** (cardio and circuits 7 days; taking a log off 14 days; sessions 14 days)
    widen to any past day; a future day stays refused (it cannot have happened). DONE 28 Nov 2026 (Builder B): all
    four ask one function (`logDayFor`, chat-log-date.ts); a day a week or more back is named by its date ("Wednesday
    26 Aug", with its year in another year) so a mistyped date shows where it went. `test:chat-log-date` (6/6
    mutations), `verify:chat-log-words` 7 (1/1), `verify:extra-cardio` C (2/2). Needs the `chat-gemini` deploy: no
    (client only). **For Builder A (screen half, parity):** the screen still stops at 14 days for another day's
    optional cardio (`LOG_BACK_DAYS`, activity-day.ts); the chat no longer does.
21. [ ] **The coach's prompt**: every "do not call it for..." that is a training refusal becomes "offer it with the
    reason"; the "point them at the right screen" fallback is only for what no tool does.

## Ruled 28 Nov 2026

- **Two sessions on one day: his "Allow, with a warning"** (reverses 8 Sep). Coach half (Builder B): the train-today,
  move and cardio-session cards allow a day that already has a session, leading with the recovery cost. Screen half:
  Builder A.

## HIS (each reverses an earlier ruling)

- **Two sessions on one day** (his 8 Sep ruling: "a day never holds two sessions"). Needed for: moving a session
  onto a day that has one, training on a day that already has a session, cardio in addition to a session.
- **Near-copies prescribable** (his 3 Nov "Searchable, log-only"): adding or swapping in a version of an exercise
  priced from its parent, with advice.

## Kept, not refusals

His 15 Sep "offer a cardio session only when he sounds definite" (a maybe is not a request); a plan with no training
day at all; a day already trained or a session in progress never redrawn by a rebuild (data safety); duplicate bans
and no-op changes; the impossible-set ask-once (already advise-then-allow).
