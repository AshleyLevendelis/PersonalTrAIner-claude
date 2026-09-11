# What happened to today's session

**Status: plan approved in shape, 10 Sep 2026 — the one behaviour question is answered below. Report only. Nothing built; waiting on "build it", and on her word for the migration.**
Picked by her from the must-have audit's MISSING list as the first piece to
plan: *"What happened to today's session (Recommended)"*.

## Context

The must-have contract (CLAUDE.md) says a person must be able to say, of one
workout: I missed it / I did it, not in the app / move it / make it a rest
day / I did something else instead — from the screen AND the coach. Measured
10 Sep 2026: four of the five exist as coach tools only, and "missed" exists
nowhere — it is a guess the week strip makes once the date has passed
(`useTrainingWeek`: nothing recorded + date in the past → `missed`).

That guess is wrong in exactly the ways a person notices. Someone who trained
at a friend's gym reads "missed". Someone who skipped and knows it cannot say
so; the only offer, from the coach's opener, is *"call yesterday a rest day"*
— which writes `deliberate_rest` and quietly rewrites a missed session as a
chosen one. `useTrainingWeek`'s own header refuses "the tidier calendar";
this chip draws it.

Everything this needs already exists on the coach's side of the house. The
job is to give the screen the same five verbs, through the same functions,
so the two surfaces cannot disagree.

## What exists, measured

| Verb | Storage | Client write | Coach tool | Screen today |
|---|---|---|---|---|
| Move it | `workout_sessions.moved_to_date` | `setSessionMove` (daily-tracking) | `propose_session_move` | can only UNDO ("Do it today" on the moved-day card) |
| Rest day | `workout_sessions.deliberate_rest` | `setDeliberateRest` | `propose_rest_day` | — |
| Something else instead | `workout_sessions.swapped_for_activity` + a `cardio_logs` row | **none** — only the edge function writes it | `swap_session_for_activity` | shows "You swapped today for …"; cannot do it |
| Did it, not in the app | `exercise_set_logs` | `writeHistoricalSession` (needs real sets) | `log_history` | — |
| Missed it | **no column** | — | — (the opener offers rest-day instead) | inferred |

Two rulings shape where this lives. Home's week strip is the RECORD — "no
handler, no cursor, not a button" (BACKLOG, week-strip vocabulary); the
Exercise tab's strip is the NAVIGATOR, tap to peek a day. And "the coach asks
how the session went — in chat, not a button" (Ashley, task 112): that was
about *feel*, which stays in chat. This is about *facts*.

## The design

### One sheet, five verbs, on the Exercise tab

The day card's existing "⋮" menu (which already holds *Session history*)
gains **What happened?** It opens a bottom sheet for the day on screen — today,
or a past day reached through the week navigator. A future day gets only
*Move it* and *Rest day*; a day already logged as done gets nothing (there is
nothing to explain).

The sheet lists what applies:

1. **I did it, not in the app** → opens that day's session for logging, exactly
   as today's is logged: the grid, the plan's numbers as placeholders, a tick
   per set. No shortcut that marks a day done with nothing in it — Ashley's
   3 Sep ruling (an empty finished session is not done) and the
   `log-correction` rule (no number is ever invented) both forbid one. If she
   did the session, the sets take thirty seconds to tick.
2. **I missed it** → records the fact (see storage below), then offers, on
   the same sheet: *Move it to <next free day>* or *Leave it*. The week counts
   it as missed either way; moving it changes where the work is owed, not
   whether the day was missed.
3. **Move it to another day** → the free days of this week, computed by the
   same resolver the coach uses (`resolveMoveTarget`), including its edge
   cases — a session that was already moved here once, and a week with no
   free day, both already handled and gated. One tap → `setSessionMove`.
4. **Make it a rest day** → `setDeliberateRest(date, true)`. Distinct from
   missed on purpose: this says "I chose not to".
5. **I did something else instead** → activity name and minutes, then the
   same two writes the coach makes: the swap on the session row and a cardio
   log. Needs one new client function beside the other two in
   `daily-tracking` (`setSwappedForActivity`), because today only the server
   writes that column.

Every state the sheet can set, it can unset: a day that is marked missed,
resting, swapped or moved shows its state at the top of the sheet with
*Undo*. The moved-day card's existing "Do it today" is that undo for moves
and stays where it is.

Writes go through the same functions the coach's confirm cards call, and the
week strip re-reads afterwards — the pattern the moved-day card already
follows (`weekTrain.refresh(); onLogsUpdated?.()`), so Home, the chat and the
Exercise tab agree.

### "Missed" becomes a fact — and the coach stops softening it

- **Storage:** one boolean, `workout_sessions.marked_missed`, with the same
  partial index the other two flag columns have. **A migration**, so it
  needs Ashley's explicit word before it is pushed, through
  `npm run db:push-both`, and both projects checked with
  `test:schema-parity` from her machine.
- **Reading it:** `dashboard-data`'s per-day session select must name the new
  column (the same column-by-column trap CLAUDE.md warns about for profiles),
  and `useTrainingWeek` ranks it: logged work still outranks it (someone who
  marked Tuesday missed and then trained has earned the done), it sits with
  the other declared states above the date judgement, and it reads `missed`
  on the day it was set even if that day is today.
- **The coach:** a new tool, `record_missed_session`, behind a confirm card
  like every other write; the opener's and the nudge's chips change from
  *"Call yesterday a rest day"* to two honest ones — *"Mark it missed"* and
  *"Call it a rest day"* — plus the existing *"I'll do it today"*. One
  function deploy (`chat-gemini`).

### What does NOT change
- Home's week strip stays a record. The glyph vocabulary is unchanged; a
  marked-missed day draws the same mark an inferred one does, because it IS
  missed — the difference is that the person said so.
- Session *feel* stays in chat.
- Nothing here edits the plan. Adding, removing or reordering exercises is
  the next item on the list, not this one.

## The question that was hers — answered

**When someone says "I missed it", what should the week show?** Put to
Ashley 10 Sep 2026 with three options: (A) it shows as missed and stays
missed, with the offer to move the session to a free day; (B) missing it and
choosing rest are the same thing — today's behaviour plus a screen path;
(C) missed, but the coach asks why before it counts.

**Ashley chose A**, the recommendation: an honest record, the plan still owing
the work if she wants it, and the coach able to coach to a real pattern. So
`marked_missed` is its own fact, never folded into `deliberate_rest`; the
sheet offers the move after recording it; and the coach's opener and nudge
stop offering rest as the only alternative to training.

## The guarantee

New `test:what-happened` (source + pure) and `verify:what-happened` (real
Chromium, 390×844, the dev-clock-pinned Monday), every check mutation-tested:
- the sheet offers exactly the verbs that apply to the day's state — five for
  an unlogged past or present training day, two for a future one, none for a
  logged one;
- each verb writes through the SAME function the coach's confirm path uses —
  pinned as a property (one writer per column), not as a line;
- "missed" ranks above the date judgement and below logged work in
  `useTrainingWeek`; a marked-missed day today reads missed; undo clears it;
- the move picker only offers days the resolver would accept, and a
  moved-here session is handled the way `moved-session-stuck` already pins;
- swap-for-activity from the screen leaves the same two rows the coach's tool
  leaves;
- the opener and nudge offer "Mark it missed" and no longer offer rest as the
  only alternative to training — `coach-opener`, `coach-nudge` extended;
- browser: open the sheet on the pinned Monday; mark missed → the strip's
  glyph and Home's agree; undo; rest day; move to Wednesday → Monday reads
  moved and Wednesday carries it; something else → "You swapped today for
  …"; screenshots read.

Existing gates touched: `training-week`, `session-move`, `one-today`,
`home-week-strip`, `one-day-one-look`, `coach-opener`, `coach-nudge`,
`chat-actions`, `coach-promises`.

## Costs

- **Migration** (one column) — her word, `db:push-both`, parity check.
- **One function deploy** — `chat-gemini`, for the new tool and the chips.
- **Frontend** on merge.

## Not in this plan, named
- Marking a session done without sets. Deliberately not offered (see verb 1).
- Editing what is IN today's session — the next MISSING item.
- A missed-WEEK follow-up from the coach (the audit's Promise 3 gap) — this
  plan gives it the fact it would need; the follow-up itself is separate.
