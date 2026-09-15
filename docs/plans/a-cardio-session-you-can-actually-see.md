# A cardio session you can actually see

Plan, not a build. Written 15 Sep 2026 because this prescribes training —
duration and effort — and the standing rule is that load prescription gets a
plan first.

## What Ashley asked for

Three things, from a live report and the conversation after it:

1. *"I want the app chat to be smart. It should be able to have proper
   conversation and know when to suggest adding a session and when something is
   mentioned in passing."*
2. *"when it adds a session like a cardio session that it's actually a useful
   card like other workouts not empty"*
3. And earlier, the shape of the ask: *"you tell the coach 'Wednesday is my
   cardio day' and the chat says 'OK do you want me to add that into your
   plan?' No card yet. If you say yes a card appears."* Plus: the card must
   carry the detail already discussed — *"we had already spoken about how I
   should do 30-40mins of zone2 cardio on a treadmill or bike, so it should add
   it in the plan with those details."*

## What is actually there, measured

**The data shape already exists and already carries her detail.**
`PlannedActivity` (`src/lib/types.ts:482`) is `{ activity, duration, targetRpe?,
reason? }` — exactly "35 minutes, zone 2, treadmill or bike, here's why". A day
can hold one: `WorkoutDay.plannedActivity` (`:510`).

**One generator produces them**: `src/lib/starting-out.ts:136`, the walking
plan. The type's own comment still says *"no generator produces these as of
slice one"* — stale, and corrected by this plan.

**They are read by the coach's context** (`chat-plan-context.ts:131`,
`ChatAssistant.tsx:425-433`), **the week note** (`week-note.ts:80`), the
first-run intro and the audit.

**NO SCREEN COMPONENT READS `plannedActivity`. Not one.** Measured by grepping
`src/components/` for it: every hit is the coach's own context builder.

### So there is a live defect, not just a missing feature

`TodayPanel.tsx:526` decides `isActiveRecovery = workout.exercises.length === 0`
and renders `ActiveRecoveryCard` (which lives in `RestDayCard.tsx`). That card
offers **"Log a walk or other activity"** — a blank activity box and a blank
duration box.

So a day whose whole prescription IS an activity shows **an empty form asking
what you did, instead of the thing you were told to do**. The starting-out
walking plan has this today: the plan says walk, the screen asks what you
walked. It is Ashley's "empty card", already shipped, and it is the reason
adding a cardio session would land empty.

The week list hides it too: `TodayPanel.tsx:599` and `:594` filter on
`exercises.length > 0`, so an activity day is absent from both the upcoming list
and tomorrow's preview.

**By contrast `recommendedCardio` — a cardio FINISHER bolted to a lifting day —
is rendered in three places** (`TodayPanel.tsx:1084` via `FinisherRow`,
`ProgramBrowse.tsx:411,539`, `RestDayCard.tsx:300`). That is the template to
copy: the app already knows how to show "activity · minutes · effort".

**No tool adds one.** 25 `propose_*` tools; none puts a cardio session on a day.
The nearest, `propose_concurrent_activity`, is explicitly for a sport done
*OUTSIDE* this plan, which it records and then rebuilds the lifting around. That
is a different thing and must not be dressed up as this one.

---

## The build, in the order that keeps each step honest

### 1. Render a prescribed activity day (fixes the live defect) — **BUILT 15 Sep 2026**

The only step that is purely a bug fix, and the one everything else depends on:
**a card that cannot be rendered must not be offered.**

- A day with `plannedActivity` renders its prescription — activity, minutes,
  effort target, and the coach's reason — in the shape `FinisherRow` already
  uses, so an activity day reads like the rest of the app rather than a
  special case.
- The logging form stays, BELOW the prescription, pre-filled with the
  prescribed activity and duration. Today it is the whole card; it becomes the
  bottom of one.
- `ProgramBrowse` and the week strip stop filtering it out: an activity day is
  a scheduled day (`WorkoutDay` already carries the flag that says so — the
  field added precisely because "scheduled" was being inferred from
  `exercises.length > 0`).
- **This alone fixes the starting-out walking plan**, which is shipping the
  empty card now.

**AS BUILT**, with the differences from the sketch above, because they matter:

- The shared decisions live in `src/lib/activity-day.ts` (a leaf module) rather
  than being repeated in each component: `isScheduledDay`, `prescriptionLine`,
  `dayDetail`. That also collapsed two phrasings of one fact — the card said
  "20m · RPE 4" and the week list said "20 min @ RPE 4".
- The logging form is NOT pre-filled. The prescription got its own one-tap
  "Log" (the shape `RecoveryFinisher` already used), so the form below is for
  something else you did, and says so: "Log something else you did".
- The card also stops calling a prescribed session "active recovery". It leads
  with the activity and the day, and says "This is today's session."
- **"Train anyway" was deliberately NOT switched to the flag.** It borrows
  another day's PRESCRIPTION to do today, and an activity day has no exercises
  to borrow — switching it would open a session with nothing in it, which is
  the defect this step exists to remove. Same for ProgramBrowse's expand tests.
- Held by `test:planned-activity` (28 checks, 12 mutations, 12 caught) and
  `verify:planned-activity` (screenshot read, not the tick trusted).

### 2. A tool that adds one, on the existing rail

`propose_cardio_session` — day, activity, minutes, effort, reason — going
through the same propose → confirm → execute → receipt rail every other day-verb
uses, with `ask()` for its lead and a `RECEIPTS` entry like the rest.

**It must validate at BUILD time, not confirm time.** That is the bug Ashley hit:
`buildIntentProposal` formats a label and never checks the args can be written,
so `record_fact` offered "Want me to remember Wednesday cardio?" and only
discovered at confirm that it had no home for it. Every other builder returns
`null` and shows no card. This one follows them.

### 3. The conversation judgment — ask in words, card only on yes

Ashley's ruling, and it is a rule about the app, not one tool: **a passing
mention gets a QUESTION, not a card.** The coach says "want me to put that in
your plan?" in plain text; only a yes fires the tool.

The machinery exists — `[QUICK_REPLIES:]` renders chips off a plain reply, and
`test:question-not-a-card` already guards the inverse (a question must not
produce a card). What is new is the prompt rule and its gate.

**The card must carry what the conversation already established.** In her
transcript the coach had already said 30-40 minutes, zone 2, treadmill or bike.
A card that then says "Wednesday: cardio" has thrown that away. The tool's
parameters are the place that detail survives, and the tool description has to
demand it rather than accept a bare name.

### 4. What it costs the week, stated before the tap

Non-negotiable and already the house rule for every other edit: adding a session
changes the week. It says so on the card — `session-balance-cost.ts` and
`edit-tradeoff.ts` already price a change and are reused, not re-implemented.

---

## What this deliberately does NOT do

- **It does not make the coach cleverer by asking it to be.** Twice on 15 Sep we
  measured the model ignoring prompt rules it had been given four times. The
  judgment in step 3 is enforced by the app refusing to render a card on a turn
  that should have asked — not by hoping.
- **It does not touch `propose_concurrent_activity`.** Muay Thai is a thing she
  does outside the plan; this is a thing the plan prescribes. Merging them would
  make both vaguer.
- **It does not invent a cardio progression.** Minutes and effort come from the
  conversation or from the `RecommendedCardio` the engine already computes.
  Progressing cardio week over week is a separate coaching question and is
  Ashley's to answer before anyone builds it.

## Verification

1. `test:planned-activity` — a day carrying one renders its prescription; the
   week list counts it; the logging form is pre-filled from it. Mutation-tested.
2. `verify:cardio-session` at 390×844 — drive the real chat: a passing mention
   produces NO card, a yes produces one carrying the discussed minutes and
   effort, confirm puts it on the day, and the Exercise tab shows it as a real
   session. **Screenshot read, not the tick trusted** — the whole complaint is
   about what the card looks like.
3. `verify:starting-out` or equivalent — the walking plan's day is no longer an
   empty form. This is the regression that proves step 1 was worth doing.
4. The existing gates that touch activity days: `test:starting-out`,
   `test:what-happened`, `test:training-week`, `test:coach-parity` (a new tool
   needs a screen counterpart or a written exception).
5. Full sweep before merge, watching the process not the log.

## Deploys

- **`chat-gemini`** — the new tool and its prompt rules are server-side. Ashley's.
- Frontend on merge to `main`. Ashley's.
- The coach's prompt and tools change, so **the coach exam goes staler**. It has
  still never been run.

## The one question this plan does not settle

Step 3 says a passing mention gets a question. **What counts as passing?**
"Wednesday is my cardio day" is a standing fact; "I might do a bike ride
Wednesday" is not. The safe default is to ASK in both cases — the cost of asking
is one tap, the cost of guessing wrong is an unwanted session on her plan — and
that is what this plan assumes unless Ashley says otherwise.
