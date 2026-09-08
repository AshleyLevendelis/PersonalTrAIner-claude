# "I'll do it tomorrow"

Roadmap 8/12. Written before the build, because this adds a fact to the
database and a fourth way a day can differ from the plan — the two things
this repo has learned to plan first.

## What happens today, measured

`classifyDay` (src/hooks/useTrainingWeek.ts), Tuesday's Push & Press seen from
Wednesday morning:

| what the app knows | state | counts against her week |
|---|---|---|
| nothing recorded | `missed` | **yes** |
| a session row with no marks | `missed` | **yes** |
| as if she had said "rest day" | `rest_chosen` | no |
| as if she had said "Muay Thai instead" | `swapped` | no |

And Wednesday still resolves to its own `Pull & Hinge`; the session she said
she would move appears on no day at all.

So saying "I'll do it tomorrow" is strictly worse than saying nothing useful:
the coach has no tool for it (the prompt's rule 6 says so in as many words —
"INTENTIONS ARE NOT APPOINTMENTS. Nothing in this app stores 'I'll train
tomorrow morning'"), the day is marked missed the next morning, and the two
tools that WOULD clear the mark both record that she is not doing the session.

## Ashley's ruling, 8 Sep 2026

Offered three shapes — land it on the next free day; put it on tomorrow
regardless and let that day hold two sessions; or don't move it and merely
stop the black mark — she chose the first:

> **"Put it on the next free day, and say so."**

So: never two sessions on one day. When tomorrow is free the move just lands
on tomorrow. When it is not, the coach names the day that is free and asks.

## The fact

One column, on the ORIGIN row:

```sql
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS moved_to_date date;
```

Presence means "the session prescribed for THIS date is being run on that
date instead". The target day is derived, not stored — the same
one-fact-one-home rule `add_swapped_for_activity` and `add_deliberate_rest`
both state, and the same reason: two writers of one fact is how two screens
come to disagree, which this repo has now found four times.

`workout_sessions` is already one row per `(profile_id, date)` with a UNIQUE
constraint on the pair, so it IS the record for a date and the fact belongs
here rather than in a third table. Absence means exactly what it means today,
so nothing needs backfilling.

## Where a move may land

Two constraints, and the second is the one that is easy to miss.

1. **The target weekday has no session prescribed.** That is Ashley's ruling
   above, and it is what keeps the load prescription honest: the plan never
   intended a bench day and a deadlift day to be the same day.

2. **The target must fall in the same mesocycle week as the origin.** The plan
   repeats weekly, so Tuesday's Push & Press exists again next Tuesday.
   Moving this week's copy into next week would put the same session on the
   calendar twice, at two different prescribed loads. Keeping the move inside
   its own week also means the prescription that travels with it is
   unambiguous: it is that week's.

When no free day is left in the origin's week, there is nowhere honest to put
it. The coach says so and offers what it can do — record the day as a rest
she chose, so it stops counting against her — rather than inventing a slot.

## What each day then shows

- **Origin**: a new `DayGlyphState` of `'moved'`. Ranked exactly where
  `'swapped'` and `'rest_chosen'` are — below the logged-work checks (someone
  who said they would move it and then trained anyway has earned the `done`)
  and above the date judgement, because not being called `missed` is the whole
  point. Excluded from `countsTowardWeekTally`.
- **Target**: runs the origin's `WorkoutDay`, and is classified exactly as a
  training day is. It therefore COUNTS toward the tally — which is what keeps
  the week's total unchanged by a move. One session owed, one session owed.

**Revised the same evening (8 Sep 2026, 22:16).** The first build kept the
origin day's full session on screen under a banner — "You moved today's
session to Wednesday. It's still here if you want it today" — copying the
swapped-day precedent. Ashley, from her phone: *"it didnt move my workout."*
So the origin day now shows the moved state and nothing of the session
(`MovedDayCard` on the Exercise tab; `status: 'moved'` on Home), with one way
back, **"Do it today instead"**, which UNMAKES the move — the same write as the
chat's Undo — rather than borrowing the session onto a day that still records
it as elsewhere (that would have counted it twice: the origin's tick from
logged work, and the target still owing it). And the bubble above the move
card now carries the app's own sentence naming the day (`diff.lead`, written
by the client builder that resolved it — D1 intact, the model never writes it):
*"Wednesday's free, so I'll put Tuesday's Push & Press there and Tuesday won't
count as missed. Shall I?"*

## The readers

`useTrainingWeek` is already the single reader of `workout_sessions` for the
week, and already has all seven days' rows in hand, so it can resolve both
ends of a move without a second query. Its three callers are exactly the three
surfaces that answer "what is today's session":

- `TodayPanel` (the Exercise tab — the screen that must actually let her start
  the moved session). It already reads the swap fact from `weekTrain` rather
  than re-reading the row, with a comment recording why; the move follows the
  same path.
- `Dashboard` (Home's hero and the Start button).
- `ChatAssistant` (the opener, the unprompted message, and the coach's own
  context — all three of which currently say "today's session is X" from
  `liveWeekDays.find(...)` alone).

A pure module, `src/lib/session-move.ts`, holds the rules — which date a move
may land on, and how a day resolves once one exists — so the whole thing is
gateable without a browser and no surface can invent its own version.

## The tool

`propose_session_move` in chat-gemini, matching every other plan-changing
tool: it PROPOSES, the app renders a card, nothing is written until she taps
Confirm. The card shows the two days and says what changes. Reversible —
clearing `moved_to_date` puts it back.

The server never picks the date. It reports what the user asked for; the
client resolves it against the LIVE plan (the same discipline
`buildRestDayProposal` already applies: "resolves the date against the LIVE
plan rather than trusting the model's args"), and when the requested day is
busy the card is built for the next free day with the reason said out loud.

## Deploy

The tool half is an edge-function change, so it reaches her only through the
`chat-gemini` deploy already outstanding for roadmap 12 — the same deploy the
macro-question fix is waiting on. The migration is hers to run
(`npm run db:push-both`, TEST first, then production, both behind the typed
phrase). Everything else ships on a frontend push.
