# The coach can log what you ate

**Plan, 7 Sep 2026. Not built. Ashley asked "how do we fix meal logging" and
ruled on the one design question; this is the answer written down before any
code, per the standing rule for anything that writes into nutrition data.**

---

## What is actually wrong

`log_meal`'s handler used to insert into **`daily_food_logs`** — a table that
appears in **no migration** and has never existed on the live database. Every
log attempt since the tool shipped failed. Rather than keep a write pointing
into a void, it was retired to an honest decline, and that decline is the
message Ashley has been reading:

> "Meal logging arrives in the next update — I can't record **Greek yoghurt
> with honey** yet."

So this is not broken plumbing. It is plumbing that was never connected.

## What already works

`meal_events` (`supabase/migrations/20260803120000_create_meal_pools_and_events.sql`)
is the real ledger. It is what the Nutrition tab writes on every Log tap, what
`getTodayLedger` reads, and what today's dashboard protein query reads. Its
`source` column already permits **`'chat'`** — the table was built expecting
this exact feature. Nobody pointed the coach at it.

`recordMealEvent` (`src/lib/meal-store.ts:~200`) is the client's write path and
already carries everything a new one would have to reinvent: an offline pending
queue, idempotency by `client_id` (a duplicate insert is swallowed as `23505`),
dead-lettering for permanently rejected rows, a synchronous listener notify so
the number moves on screen before any promise settles, and `voidMealEvent` for
undo.

## The landmine, found while tracing

`log_meal`'s schema tells the model its slots are
**`breakfast, lunch, dinner, snack_1, snack_2`**.

The database CHECK constraint accepts **`breakfast, lunch, dinner, snack`**.
`MealSlotName` in `src/lib/meal-store.ts:36` is the same four.

So a naive wiring rejects every snack log on arrival, with a constraint
violation. The same mismatch is why `snack_1` was appearing in Ashley's replies.
**Fix the schema's slot list first**; it is wrong today regardless of this
feature.

## Ashley's ruling

Asked whether a meal should log straight away with an Undo, or ask first: she
chose **ask first, log when you tap confirm.** Nothing touches her numbers
until she taps.

That also settles the architecture. The coach must NOT write server-side: the
write has to happen on the client, after the tap, through `recordMealEvent`, or
it loses the offline queue, the duplicate protection, the instant on-screen
update and the undo — and the confirm card would be claiming a write that
happened somewhere she cannot see.

## The build

**Edge function** (`supabase/functions/chat-gemini/index.ts`)

1. Fix `log_meal`'s `meal_slot` description to the four real slots. Independent
   of everything else here, and wrong today.
2. `intent: 'logging'` (added this morning) stops returning prose and returns a
   **proposal** instead — same envelope `propose_meal_addition` already uses:
   the computed macros, the food name, the resolved slot, the assumptions, and
   `rawArgs` for the client to execute from. `intent: 'question'` is untouched
   and still answers with the numbers.
3. The handler still performs **no write of any kind**. `test-meal-addition.ts`
   already asserts that shape for its own tool and the new one should be held
   to it identically.

**Client** (`src/components/ChatAssistant.tsx`)

4. A new proposal kind `propose_meal_log`, alongside the eleven that exist.
   Card copy in the same place as the others (`:1422-1441`), something like
   *"Log **Greek yoghurt with honey** to your snack?"* with the macros beneath.
5. Confirm executes `recordMealEvent({ profileId, date, slot, eventType:
   'confirmed', mealName, macros, source: 'chat' })` and nothing else. The
   receipt reports exactly what that returned — the framework exists because a
   receipt once claimed a swap the Nutrition tab never showed.
6. Decline does nothing at all, and says so in one line.

## Gates

- **The slot list and the database agree.** A check that parses the CHECK
  constraint out of the migration and the slot enum out of the tool schema and
  asserts they are the same set. This is the landmine above, made impossible to
  reintroduce — and it would have caught today's `snack_1` before a user did.
- A `question` never produces a proposal; a `logging` intent always does.
- The edge handler performs no HTTP write on this path (same shape as
  `test-meal-addition.ts:175`).
- Confirm writes exactly one event, with `source: 'chat'`, through
  `recordMealEvent` and not a bare `supabase.from('meal_events')`.
- The receipt names the food and the slot actually written, never the model's
  own text.
- Every new check mutation-tested.

## Verification

`verify:six`-style browser run: ask a question (no card), state a meal (card
appears, nothing logged), decline (still nothing), state it again and confirm
(one event, Nutrition tab total moves by exactly the stated macros, and a
second confirm cannot double-log).

## Deliberately not in scope

- **Allergen checking on a logged meal.** Recording what someone ate is not
  endorsing it, and refusing to log a real meal would leave her day wrong.
  Whether the coach should *flag* a conflict afterwards is a separate question,
  and a safety-adjacent one. Recorded, not decided.
- Editing or re-slotting a logged meal from chat. Undo already exists; a full
  edit surface is its own piece of work.

## Deployment

This lives in the edge function, so it does not reach the coach on a merge — it
needs `npm run deploy:functions:prod -- chat-gemini`, which only Ashley can run.
**It should ship in the same deploy as this morning's `intent` fix**, which is
also still undeployed. One typed phrase, both changes.

Note the deploy hazard already established: production is running v69 from
6 Sep 17:15 UTC, which is *older* than the merge two minutes before it. The
deploy must pull first and be verified by string, not by exit code.
