# C · The coach chat and the edit tools acting on the wrong plan state (exercise side)

Tracer C, read-only. Bugs: H8, H15, H17, H19, H22, H23, M26, M27, M28, L22, L33.
Repo `/home/claude/app`. Nothing in the repo was edited.

**How to read this.** "VERIFIED" = I read the lines quoted or ran the real functions and
printed the result. "INFERRED" = the code makes it the likeliest explanation but the model's
actual tool call is not recorded anywhere I can read. One read-only probe was run
(`npx tsx` on a script in the scratchpad that imports the app's own pure functions, builds
Sam's profile, generates a seeded plan and prints). Its output is quoted where used.

**Headline.** Nine of eleven are confirmed in code. Two root causes carry most of it:

1. **A resolver for "what runs on this date" exists (`sessionForDate`) and every RENDER uses
   it, but every EDIT is addressed by today's weekday name instead of the row the resolver
   returned.** H15, H19, half of M26 and one third of H22.
2. **The edge function runs exactly one tool call per turn, and for 32 of the 42 tools that
   declare `origin_verbatim_quote` nothing checks that the quote is in the message just
   sent.** H22, the second half of L22, and the loop in H8.

---

## Question 1 · How a day move is stored, and who reads it

**Storage (VERIFIED).** One nullable column on the ORIGIN row: `workout_sessions.moved_to_date`
(`supabase/migrations/20260908120000_add_session_move.sql:45`). Written by `setSessionMove`
(`src/lib/daily-tracking.ts:217-258`), read both ends by `getSessionMovesInRange`
(`daily-tracking.ts:181-213`) into `SessionMove { fromDate, toDate }`. The plan itself
(`mesocycle[].days[]`, keyed by weekday name in `day.day`) is NOT changed by a move. So a
move is an overlay: "Monday's row is run on Friday's date".

**The resolver that already exists.** `sessionForDate({ date, plan, moves })`
(`src/lib/session-move.ts:372-394`). On the receiving date it returns the ORIGIN's row:

```ts
const onto = moves.find(m => m.toDate === date)
if (onto) {
  const source = plan.find(d => d.day === dayNameOf(onto.fromDate)) ?? null
  return { day: source, movedFrom: {...}, movedTo: null }
```

Probe output for Monday 5 Oct moved to Friday 9 Oct:
`resolved.day.day = Monday | focus = Chest & Triceps | movedFrom = { date: '2026-10-05', dayName: 'Monday' }`
and `plan row for Friday exists: true | exercises: 0`.

So the answer every edit needs, "which plan row do I write to", is `resolved.day.day`
("Monday"). Every edit instead passes the weekday of today ("Friday"), which is a real row
with no exercises. That one substitution produces all three sentences the tester quoted.

### Every reader of "what session is on day/date X"

| # | Reader | File:line | Applies the move overlay? |
|---|---|---|---|
| 1 | Exercise tab, today's card RENDER | `TodayPanel.tsx:282-292` (`todayCell.session`) | **Yes** |
| 2 | Exercise tab, week strip + glyphs | `useTrainingWeek.ts:119, 282` | **Yes** |
| 3 | Exercise tab, peek RENDER | `TodayPanel.tsx:764-768` | **Yes** |
| 4 | Program view RENDER | `ProgramBrowse.tsx:390-393` | **Yes** |
| 5 | Home | `dashboard-data.ts:205, 224` | **Yes** |
| 6 | Coach context header + week rows | `chat-plan-context.ts:270-273, 420-441`; `ChatAssistant.tsx:964, 1465-1471` | **Yes** |
| 7 | Coach "next session", opener, nudge | `chat-plan-context.ts:494-512` | **Yes** |
| 8 | Chat day tools: rest day, activity swap ("football instead"), missed, move | `ChatAssistant.tsx:3096, 3151, 3214, 3262-3323` (take a DATE, call `sessionForDate`) | **Yes** |
| 9 | "What happened?" sheet target | `WhatHappenedSheet.tsx:120` | **Yes** |
| 10 | **Screen: take out / drop** | `TodayPanel.tsx:367, 564` → `removeExerciseFromSession({ dayName: effectiveDayName })` | **No** |
| 11 | **Screen: shorten ("I'm short on time", day menu)** | `TodayPanel.tsx:389` → `shortenDayTo(week, effectiveDayName, …)` | **No** |
| 12 | **Screen: lighter ("I'm wiped today")** | `TodayPanel.tsx:454` `week?.days.find(d => d.day === effectiveDayName)` | **No** |
| 13 | **Screen: rebuild today** | `TodayPanel.tsx:414` | **No** |
| 14 | **Screen: move up / down** | `TodayPanel.tsx:485` | **No** |
| 15 | **Screen: add an exercise + its price/impact** | `TodayPanel.tsx:506, 520, 540-545` | **No** |
| 16 | **Screen: swap from today's card** | `TodayPanel.tsx:1153` (`dayName={effectiveDayName}`) → `ExerciseTab.tsx:111` → `App.tsx:2472` → `swapExerciseInMesocycle` | **No** |
| 17 | **Screen: swap from peek** | `TodayPanel.tsx:941` `onOpenSwap(peekDay, …)` | **No** |
| 18 | **Screen: swap from Program view** | `ProgramBrowse.tsx:570` `onOpenSwap({ weekNumber: browseWeek, dayName, … })` (list weekday, not `workout.day`) | **No** |
| 19 | **Screen: add cardio session** | `TodayPanel.tsx:351` (`dayName: todayName`) | **No** (and would treat a moved-in day as free) |
| 20 | **Screen: shorten choices in "What happened?"** | `WhatHappenedSheet.tsx:228` `plan.find(d => d.day === target?.dayName)` | **No** (offers no times on a moved-in day) |
| 21 | **Chat: swap** | `ChatAssistant.tsx:2068-2076` → `resolveSwapTarget({ days: week.days, todayName: activeSession.dayName })` | **No** |
| 22 | **Chat: remove** | `ChatAssistant.tsx:2410-2418` | **No** |
| 23 | **Chat: reorder** | `ChatAssistant.tsx:2484-2491` | **No** |
| 24 | **Chat: add** | `ChatAssistant.tsx:2203-2208` | **No** |
| 25 | **Chat: shorten** | `ChatAssistant.tsx:2875-2876` | **No** |
| 26 | **Chat: rebuild** | `ChatAssistant.tsx:2946-2947` | **No** |
| 27 | **Chat: volume lighter/heavier** | `ChatAssistant.tsx:2793` | **No** |
| 28 | **Chat: cardio session** | `ChatAssistant.tsx:3022-3027` | **No** (see H8) |
| 29 | **Chat: logging sets ("bench 3x8")** | `ChatAssistant.tsx:4410` `exercisePlan.find(d => d.day === activeSession.dayName)` | **No** (plan names, set counts and loads for today come back empty on a moved-in day) |
| 30 | Tools tab, today's conditioning | `ToolsTab.tsx:98` | **No** |
| 31 | Nutrition training/rest day type | `macro-calculator.ts:405-409` (`profile.training_days` by weekday) | **No** (out of my scope; listed so it is not lost) |
| 32 | Edge function `chat-gemini` | — | N/A. It never looks a day up; it forwards `args.day` (`index.ts:4142-4165`). The model is told the session is on Friday by reader 6 and passes "Friday". |

The split is clean: **everything that takes a DATE is overlay-aware; everything that takes a
WEEKDAY NAME is not.** Swapped ("football instead"), chosen-rest and missed days go through
the same `sessionForDate` for the day tools (row 8), but they are flags on
`workout_sessions`, not part of the overlay, so:

- the exercise-grain chat tools (rows 21-27) will still happily edit Tuesday's lifting session
  after Tuesday was marked as football, and
- **the coach's week rows do not say a day was swapped, rested or missed at all.**
  `CoachWeekRow` carries `session / movedTo / movedFrom` only (`chat-plan-context.ts:333-358`)
  and `rowFor` reads nothing else (`:416-442`), although the hook hands it `state`,
  `swappedForActivity`, `markedMissed`, `deliberateRest` (`useTrainingWeek.ts:22-48`). Sam's
  Tuesday reaches the model as "Tuesday: Back & Biceps - …" with no mention of football.

### The choke point, and the one resolver

There is no choke point on the edit side. `effectiveDayName` is used at eleven call sites in
`TodayPanel.tsx` and `activeSession.dayName` / the raw `day` argument at nine in
`ChatAssistant.tsx`. `session-move.ts:138-142` says of the old lookup: *"Everything now asks
sessionForDate. Nothing exported from this file should tempt a caller back into the plan's raw
row."* That is true of the reads and was never applied to the writes.

**Proposed: one pure module, `src/lib/session-ref.ts`, and edits take its output, not a string.**

```ts
export interface SessionRef {
  date: string                 // the date it is RUN on
  runsOnDayName: string        // "Friday"  -> for sentences shown to the person
  planDayName: string          // "Monday"  -> the ONLY key edits may write to
  weekNumber: number
  session: WorkoutDay | null   // null on a rest day or a move origin
  movedFrom: { date: string; dayName: string } | null
  movedTo:   { date: string; dayName: string } | null
  state: DayGlyphState         // due | done | partial | missed | swapped | rest_chosen | moved ...
  swappedFor: string | null
}
/** date in, ref out. Wraps sessionForDate + the dashboard row. */
export function sessionRefForDate(input): SessionRef
/** What the coach's tools call: 'today' | 'tomorrow' | weekday | prefix | ORIGIN weekday
 *  ("Monday's session" after it moved to Friday) -> the same ref, or a refusal sentence. */
export function sessionRefForDayArg(dayArg, { todayDate, weekDates, plan, moves, dashboard }): SessionRef | { refusal: string }
```

Then:
- `TodayPanel`: replace `effectiveDayName` in every edit with `ref.planDayName`
  (the minimal form is one line, `const planDayName = workout?.day ?? effectiveDayName`, and
  `onCalibrationSessionFinished?.({ date: today, dayName: workout.day })` at
  `TodayPanel.tsx:225` already does exactly this).
- `ProgramBrowse.tsx:570` and the peek (`TodayPanel.tsx:941`): pass `workout.day`.
- `swap-target.ts`: `resolveSwapTarget` takes the seven resolved cells (day label =
  `runsOnDayName`, exercises from `ref.session`, write key = `planDayName`) instead of
  `week.days`. All eight chat builders call the same function for their day.
- Sentences keep saying the day the person is standing in: every refusal in
  `session-edit.ts`, `session-rebuild.ts`, `exercise-plan.ts:6326-6376` interpolates the
  `dayName` it was called with, so after the fix they would say "Monday" to someone looking
  at Friday. Pass a display name alongside the write key.
- Edits refuse, in a sentence, on a ref whose `state` is `swapped` / `rest_chosen` / `missed`
  or whose session is already finished in the past (also the H11 "rewrote a completed
  session" door).
- `chat-plan-context.ts` rows gain the state ("Tuesday: Back & Biceps — not done, football
  instead"). Frontend only: `exercise_summary` is interpolated verbatim by the deployed
  function (`chat-plan-context.ts:258-264`).

---

### H15 · Chat can't see a session the user moved
- **Status:** CONFIRMED IN CODE.
- **Root cause.** The context builder tells the model the truth, "Friday (TODAY): Monday's
  Chest & Triceps, MOVED HERE - …" (`chat-plan-context.ts:436-440`), and the swap tool's `day`
  is described as *"The day of the week the exercise is on"* (`chat-gemini/index.ts:762-765`),
  so the model passes Friday. The client then looks Friday up in the raw plan:
  `resolveSwapTarget({ dayArg: dayArg || 'today', exerciseArg: oldItem, days: week.days, todayName: activeSession.dayName })`
  (`ChatAssistant.tsx:2068-2073`), and `swap-target.ts:131-134` answers
  `` `${dayName} is a rest day — there's nothing on it to swap.` `` because Friday's own row
  has no exercises. Probe, both spellings:
  `resolveSwapTarget(day=Friday)` and `(day=today)` → `"Friday is a rest day — there's nothing on it to swap."`;
  `(day=Monday)` → `{"ok":true,"dayName":"Monday","exIndex":2,…}`.
  The coach's prose "your Friday session (moved from Monday)" came from reader 6; the refusal
  came from reader 21. Two readers of one fact.
- **Prior rulings:** none on editing a moved session (grepped BACKLOG/CLAUDE/docs for
  `effectiveDayName`, "moved session" + edit, "moved-in"). The surrounding rule is explicit:
  CLAUDE.md:461 *"Move it to another day; it leaves today on every screen"*, and
  `session-move.ts:388-390` *"this IS that session, and calling it by the new weekday would
  quietly rename the work."*
- **Fix:** the resolver above; `resolveSwapTarget` over resolved cells. No edge change.
- **Class:** MECHANICAL.
- **Ships via:** frontend.
- **Gates:** existing `test:swap-target`, `test:session-move`, `test:moved-session-stuck`,
  `verify:moved-session`, `verify:swap-request`, `verify:coach-week-move` all pass today and
  none performs an edit on a moved-in day (grepped every `.tour-harness/*.mjs` and the three
  scripts). New: `test:session-ref` (pure; every tool's day argument × {ordinary day, move
  target, move origin, swapped day}) and one `verify:` driver that moves a session then swaps,
  removes, shortens and reorders on it, reading the plan row afterwards.
- **Risk:** the `scopeKey` of a swap card is `…:${day.day}:${exIndex}`
  (`ChatAssistant.tsx:2147`) and `App.tsx:2507` sweeps stale cards with the same key built
  from the screen's `dayName`. Both must use the plan row or a card and a tap on the same slot
  stop invalidating each other.
- **Confidence:** high (reproduced with the app's own functions).

### H19 · A moved session can't be edited from its own screen
- **Status:** CONFIRMED IN CODE. Same root as H15, screen side.
- **Root cause.** The card is drawn from the resolver
  (`TodayPanel.tsx:290-292`: `todayCell?.session ?? … liveWeekPlan.find(d => d.day === effectiveDayName)`)
  but `effectiveDayName = borrowedDayName ?? todayName` (`:278`) is what every edit passes.
  - "I'm short on time" → `shortenDayTo(week, effectiveDayName, profile, minutes)` (`:389`) →
    `exercise-plan.ts:6326` `` `There's no session on ${dayName} to shorten.` `` ✔ verbatim.
  - "Drop it → Today only" → `removeExerciseFromSession({ … dayName: effectiveDayName, exIndex, scope })`
    (`:367`) → `session-edit.ts:84-88` `"I couldn't find that exercise on that day."` ✔ verbatim.
  - **Swap is worse: it fails silently.** `swapExerciseInMesocycle` returns the plan unchanged
    when the slot is missing (`mesocycle-edit.ts:387` `if (!currentWeek || !oldSlot) return mesocycle`),
    and `App.tsx:2481-2506` then saves the unchanged week and clears the error. The dialog
    closes as if it worked. Probe: `returned the SAME array (silent no-op) = true`.
- **Prior rulings:** as H15.
- **Fix:** `planDayName` from the resolver at the eleven call sites; make the swap executor
  and `handleSwapExercise` report "nothing changed" when the returned plan is the same object
  (a write that changed nothing must not look like one that did; CLAUDE.md "Every write
  succeeds or says it did not").
- **Class:** MECHANICAL.
- **Ships via:** frontend.
- **Gates:** `verify:session-edit`, `verify:shorten-today`, `verify:session-rebuild`,
  `verify:exercise-add`, `verify:what-happened` all drive an ordinary day. New: the driver in H15.
- **Risk / what changes for the tester after the fix. Read this one.** Sam's moved session
  has three exercises. `MIN_EXERCISES_PER_SESSION = 3` (`session-edit.ts:44`), so once the
  lookup is right, "Drop it" on Band Tricep Kickback is REFUSED with
  *"That would leave Monday with fewer than 3 exercises. Take the whole day off instead, or
  swap this one for something easier."* (`session-edit.ts:90-94`; probe:
  `removeExerciseFromSession(Monday).changed: false`). That is correct behaviour for the floor
  and it names the wrong day. The underlying under-filled day is H4's (not mine). The fix
  for H19 therefore needs the display-name change in the same commit, or it trades one wrong
  sentence for another.
- **Confidence:** high.

---

### H8 · The coach loops when asked whether cardio got logged
- **Status:** CONFIRMED IN CODE (the loop and the missing path); the first mis-step is model
  behaviour.
- **Root cause, three layers.**
  1. *Which handler says it.* `buildCardioSessionProposal`, client:
     ```ts
     if (day.exercises.length > 0) {
       return { refusal: `${day.day} already has a session on it — do you want this instead of that one, or on a different day?` }
     ```
     (`ChatAssistant.tsx:3025-3027`). The model had called `propose_cardio_session`
     (courier at `chat-gemini/index.ts:4027-4052`).
  2. *Why it cannot add cardio alongside a session.* By design. The tool writes
     `plannedActivity`, which means "this activity is the WHOLE day"; BACKLOG.md:7072
     *"a day that already trains is refused, because `plannedActivity` means 'this activity
     is the WHOLE day'"*, and `test:cardio-session` pins it
     (`scripts/test-cardio-session.ts:174`). A lifting day's cardio lives in a different
     field, `recommendedCardio` (the finisher), and **no tool, on either surface, can set or
     change a finisher.** So "in addition" has nowhere to go.
  3. *Why it loops.* The refusal is plain text with no card and no chips. Neither of its two
     offered answers is what the user wants; "in addition" and "Yes, add it" both go back to
     the model (`confirmation-reply.ts` only intercepts a bare yes/no when a card is open),
     which calls the same tool with the same arguments and gets the same string. A fixed
     sentence that can only be answered by re-triggering itself is the loop shape the repo has
     removed three times before (`confirmation-reply.ts:1-10`, `index.ts:2853-2857`).
- **Is there a chat cardio-log tool?** Yes, inside `log_workout`. `parseWorkoutEntries` routes
  an activity to cardio and asks Easy / Steady / Hard when no effort was stated
  (`scripts/test-chat-cardio.ts:60-66`; write in `nl-logging-executor`, read back at
  `ChatAssistant.tsx:4457-4505`). "12 minutes of skipping rope" is loggable today.
- **Why "did that get logged?" routed to scheduling. Model tool choice, with two
  deterministic contributors:**
  - The logging section of the prompt has only lifting examples
    (`index.ts:2410` "Just did bench 3x8 at 90kg", "Finished my push day", …). Nothing says a
    finished walk or skip is `log_workout`.
  - §3g2 lists what `propose_cardio_session` is NOT (`index.ts:2271`) and omits
    "something they have ALREADY DONE". The message was also a QUESTION, and the handler
    forwards without `classifyImperative` (`index.ts:4027-4052`), which would have refused
    any quote from it: one ending in `?` is refused outright and the rest contains no
    instruction verb (`imperative-classifier.ts:47, 53`).
  - Separately, the coach could not have answered the question truthfully anyway: its
    `cardio_log_history` is re-read only when `dataVersion`, `ownWriteVersion` or the count of
    logged SETS changes (`ChatAssistant.tsx:861-867`), and neither cardio row on the Exercise
    tab bumps any of those (`TodayPanel.tsx:1178, 1182` render `<FinisherRow … />` with no
    `onLogged`; `:1222-1226` `<AddUnplannedWork … />` with no `onCardioLogged`). INFERRED
    consequence: cardio logged on the Exercise tab is invisible to the coach until the next
    set is logged or the app reloads. This overlaps H7/H21 (not mine).
- **Prior rulings:** CLAUDE.md:498-511, Ashley 15 Sep 2026: offer a cardio session only when
  definite; *"THE RULING IS ENFORCED IN ONE DIRECTION ONLY"*. BACKLOG.md:7072 (above).
  Neither covers work already done or work added beside a lift.
- **Fix.**
  - (a) MECHANICAL, edge: in the `propose_cardio_session` handler, read the user's own
    message with the helpers already imported: if `eventTiming(message, args.activity) === 'past'`
    and `statedDurationsMinutes(message)` contains the model's minutes, return a `logWorkout`
    envelope built from the user's words instead of a plan proposal. The client's existing
    path then asks effort and logs. Nothing the user did not say is written.
  - (b) MECHANICAL, client: the cardio rows call `onLogsUpdated` so the coach's history is
    current; and put the day's finisher on the lifting-day row of the coach's context
    (`chat-plan-context.ts:405-407` lists exercises only, so the coach does not know a
    30-minute walk is already prescribed after the lift).
  - (c) MECHANICAL, edge prompt: one cardio example in the logging section and one line in
    §3g2's "NOT THIS TOOL". Whether the model then obeys is the exam's to grade.
  - (d) OWNER DECISION, below: what the refusal offers.
  - (e) COACHING, if option B/C is chosen: cardio added to a lifting day goes AFTER the
    lifting, never before heavy compounds (the prompt's own rule, `index.ts:2676`); it
    replaces the day's existing finisher rather than stacking a second (a day holds one
    cardio block, CLAUDE.md "a day holds only one"); and on a fat-loss plan easy-to-steady
    work (RPE 3-6) of 10-30 minutes is the defensible range, because the interference cost of
    low-intensity cardio after lifting is small and the lifting stays the priority. It is
    counted in the time-cap label.
- **Class:** MECHANICAL (a-c) + OWNER DECISION (d) + COACHING (e).
  > **Question for Ashley.** When someone wants cardio on a day that already has a lifting
  > session, what should the coach offer?
  > A. Leave it: only "instead of the session, or another day" (today).
  > B. Three taps under the sentence: "Log it as done" · "Add it after my session" ·
  >    "A different day". "Add it after" makes it that day's finisher.
  > C. Never ask: something already done is logged, something planned becomes the finisher.
  > **Recommend B.** It ends the loop, keeps your ask-before-changing rule, and "Log it as
  > done" is the answer to what Sam actually asked.
- **Ships via:** edge function `chat-gemini` (a, c) + frontend (b, d). No migration.
- **Gates:** `test:cardio-session` (pins the refusal sentence; will need re-anchoring on the
  property "a lifting day is never overwritten by a cardio session", not on the string),
  `verify:cardio-session`, `test:chat-cardio`, `verify:chat-cardio`, `test:message-evidence`,
  exam case `cardio-asks-before-carding`. New: an exam case "I also did X after my workout —
  did that get logged?" with `oneOf: []` on plan cards; a `test:` check that a refusal
  offering a question always carries chips that route to a real tool.
- **Risk:** (a) must not fire on "I run on Tuesdays" (present habitual). `eventTiming` returns
  `unclear` for that, and unclear must stay on the plan path.
- **Confidence:** high on layers 1-3; medium on the stale-history contributor (code path
  verified, not observed live).

---

### H17 · Travel week is applied to the wrong week
- **Status:** CONFIRMED IN CODE. Three separate defects in one card.
- **Root cause.**
  1. *Date range.* The tool has no start date. `duration_days` is *"How many days this applies
     for, from today"* (`chat-gemini/index.ts:970-973`). The client turns it into whole plan
     weeks starting at the live week:
     ```ts
     const startWeek = activeSession.liveWeek
     const weekSpan = Math.max(1, Math.ceil(durationDays / 7))
     const weekNumbers = mesocycle.map(w => w.week_number).filter(n => n >= startWeek && n < startWeek + weekSpan)
     ```
     (`ChatAssistant.tsx:2709-2713`). "All next week" + "5 days" = `ceil(5/7) = 1` week = THIS
     week, every day of it including the days already trained. The card lead is hard-coded
     *"for the next ${durationDays} days"* (`:2738`). There is nowhere for "next week" to go.
  2. *It ignores the active knee adaptation.* The candidate pool is built from the saved
     profile with only the equipment changed:
     `const candidateProfile: UserProfile = { ...profile, equipment_access: equipmentTier }`
     (`plan-adaptations.ts:392`). A time-boxed injury adaptation is deliberately never written
     to `profile.injuries` (`plan-adaptations.ts:124-131`), and `getActiveAdaptations` has
     exactly one caller in the app, the New Plan dialog (`App.tsx:3285`). So nothing that
     picks an exercise knows an adaptation is running. Nor does the coach:
     `buildCoachInjuriesSummary` reads `profile.injuries` only (`injuries-context.ts:46-55`)
     and tells the model *"No injuries or sore areas currently on file"* during a 14-day knee
     adaptation.
  3. *Cross-pattern swaps.* Deliberate fallback, applied without its explanation.
     `getSmartReplacements` tries same pattern, then nearest pattern, then
     `CROSS_TRAINING_LAST_RESORT` (`exercise-db.ts:5146-5148, 5237-5240`). With a shoulder
     flag at bodyweight every press and every triceps move is gone, so stage three fires.
     `substituteSlots` then takes `candidates[0]` blind (`plan-adaptations.ts:97`) and
     `TouchedSlot` has no field for the note the swap list would have shown.
  - **Probe, Sam's profile, knee adaptation applied first, then travel at `bodyweight`,
    shoulder flag ON** (the function the card runs):
    ```
    Monday:   Dumbbell Floor Press [horizontal_push] -> Backpack Row [horizontal_pull]          <-- CROSS-PATTERN
    Monday:   Band Tricep Pushdown [isolation_tricep] -> Box Squat (Bodyweight) [knee_dominant] <-- CROSS-PATTERN
    Thursday: Spanish Squat [knee_dominant] -> Box Squat (Bodyweight) [knee_dominant]
    Saturday: Spanish Squat [knee_dominant] -> Box Squat (Bodyweight) [knee_dominant]
    ```
    That is the tester's card (his triceps slot held the kickback; same slot, same result).
    Box Squat is the exercise the knee adaptation had just removed. Re-run with the knee added
    to the candidate profile: `Spanish Squat -> Wall Sit`, `Romanian Deadlifts -> Bodyweight
    Hip Hinge to Wall`; the knee is respected. With the shoulder flag OFF the press stays a
    press (`Dumbbell Floor Press -> Deficit Push-Ups`), so the cross-pattern rows are the
    shoulder flag talking, not the travel tool.
- **Compared with `applyReplacement`.** The sweep does go through it
  (`plan-adaptations.ts:101`), and through `recomputeLoad`. Loads, units and primer handling
  are right. The defect is one step earlier, in WHO the candidates were filtered for, which
  is the same place the earlier swap/ban/adaptation bugs met.
- **Prior rulings:** `exercise-db.ts:5136-5139`, Ashley 30 Aug 2026 *"swap in different work"*
  for a pattern an INJURY has emptied; the same comment says the fallback *"Deliberately
  excludes … every isolation pattern: a small single-joint movement is not an honest stand-in
  for a compound slot"*. Nothing rules on the reverse (a compound filling an isolation slot),
  on a start date, or on two adaptations at once; `plan-adaptations-store.ts:155-157` says of
  overlap *"which the UI never lets happen today"*. It does: Sam had a knee and was offered
  travel on the same week.
- **Fix.**
  - (a) MECHANICAL: one function, `effectiveConstraintProfile(profile, activeAdaptations)`,
    that adds every active injury code and the active equipment override; used by
    `substituteForEquipment`, `substituteForInjury`, `getReplacementCandidates` callers, ban
    replacement, session rebuild and add. Same shape as the session resolver: one answer to
    "what is this person allowed right now".
  - (b) MECHANICAL: adaptations address (date → plan row) pairs, not whole weeks: skip dates
    before the start and any day already logged. This is the same door as H11's "rewrote a
    session I had finished".
  - (c) MECHANICAL + edge: optional `start_date` on `propose_equipment_adaptation`;
    `plan_adaptations.starts_at` already exists (`plan-adaptations-store.ts:33, 55-71`), so no
    migration. The card names the dates ("Mon 12 – Fri 16 Oct").
  - (d) COACHING, decided: **an isolation slot is never back-filled from another movement
    pattern.** If stages one and two find nothing for a tier-3 slot, drop it and say so. A
    third squat at 3×15-18 in place of a kickback adds knee-dominant volume the week did not
    programme, on a knee the person has just reported, and trains nothing the slot was for.
    For a compound slot the 30 Aug ruling stands (pull instead of an impossible press), and
    the card row must carry the reason. `ProposalCard` already renders `row.note`
    (`ProposalCard.tsx:94`).
  - (e) Not mine, flagged: `bodyweight` *"still assumes a pull-up bar and a weighted bag"*
    (`index.ts:968`), so "hotel room, no equipment" prescribes a Backpack Row. Equipment
    tracer's (H1-H3).
- **Class:** SAFETY-ADJACENT (injury filtering; needs a written plan before the build) with a
  COACHING decision (d) and one OWNER DECISION:
  > **Question for Ashley.** Someone says "I'm away next week". When should the travel plan
  > start?
  > A. Today, always (now).
  > B. On the day they name; if they don't name one, the coach asks "from when?".
  > C. On the day they name; if they don't name one, from today, with the dates on the card.
  > **Recommend C.** One fewer question, and the dates on the card make a wrong guess obvious
  > before the tap.
- **Ships via:** frontend (a, b, d) + edge function `chat-gemini` (c: one parameter and two
  prompt lines). No migration.
- **Gates:** `test:injury-adaptation-safety`, `test:enforcement-gaps`, `test:slot-replacement`,
  `test:edit-reason` (calls `substituteForEquipment`), `test:injury-rebuild`. New: "an
  adaptation applied on top of an active one never re-introduces a movement the first
  removed" (the probe above is that check; it fails today), and "no isolation slot is filled
  from another pattern".
- **Risk:** expiry restores whole weeks from `pre_image` (`plan-adaptations-store.ts:117-121`).
  With two overlapping adaptations, or a permanent swap made mid-adaptation (Sam banned the
  kickback during the knee adaptation), the later restore puts back what was changed in
  between. Past weeks only in Sam's case, so harmless there; a real hazard once (c) lets an
  adaptation sit in the future. Must be in the plan.
- **Confidence:** high (reproduced).

---

### H22 · The coach answers an older request instead of the one just asked
- **Status:** PARTLY. The mis-pick is model behaviour; four things that let it through are
  deterministic and confirmed.
- **How a request is carried between turns (VERIFIED).** It is not. There is no
  `pending_action` / `lastIntent` state in the conversation. The edge function is stateless:
  `const { message, history, context } = await req.json()` (`index.ts:1921`). `history` is the
  last 20 `chat_messages` rows of ANY date, text only
  (`ChatAssistant.tsx:1305-1314` *"Last 20 messages, no date filter"*; `:1856-1860`;
  `index.ts:2702-2709`). The only deterministic routing in the whole path is a bare
  yes / no while a card is still open (`ChatAssistant.tsx:5251-5265`,
  `confirmation-reply.ts:24-25`). **Everything else is the model choosing a tool.**
- **The four deterministic holes.**
  1. **History never says how a request ended.** Confirm, decline and expiry change the card's
     local state and nothing else (`ChatAssistant.tsx:6087-6100`, `:5520-5532`); the text sent
     back next turn is still the card's lead, *"Want me to …?"*. A refusal is saved as
     ordinary assistant text. So Thursday's *"I couldn't portion Mediterranean Lemon Herb
     Grilled Salmon…"* (`meal-addition.ts:127`) sits in Friday's window as an open problem,
     stamped only *"[said on Thursday evening, …]"* (`chat-plan-context.ts:244-256`).
  2. **The "quote must be from the CURRENT message" rule is enforced for 10 of the 42 tools
     that declare it.** Checked: `propose_meal_addition` (`index.ts:2848`), `record_fact`/
     `record_goal` (`:4260`), `record_context_fact`, `set_display_name`,
     `record_session_feel` (`:4288, 4312, 4343`), three grocery tools (`:4368`), `log_water`
     (`:4429`). Not checked: every other courier, e.g. `propose_custom_meal`
     (`:2976-2996`), `propose_meal_food_remove` (`:3032-3048`), `propose_exercise_swap`
     (`:4142-4165`, which does not even forward the quote, under a comment saying
     *"classification still runs"*; it does not).
  3. **One tool call per turn.** `const functionCallPart = parts.find(p => p.functionCall)`
     (`index.ts:2778`); the comment at `:2714-2719` names *"the single-call executor"*. A
     second call in the same reply is dropped without a word.
  4. **No check that the tool's subject belongs to this message or this domain.** The server
     has `userNamedFood` (`message-evidence.ts:74`) and the client has the "never write an
     exercise the user did not name" rule for LOGGING; neither is applied to the swap /
     remove / food-edit couriers.
- **The three incidents.**
  1. *"What did I do in today's session, and did the 30 minute walk count?" → salmon card.*
     The card text *"becomes your dinner for today"* exists in two builders
     (`meal-addition.ts:193`, `custom-meal.ts:111`). Only `custom-meal.ts:113` prints the quote
     as the card's reason (`rationale: rawArgs.origin_verbatim_quote`), and only
     `propose_custom_meal` has no server check, so INFERRED: the model, having been refused
     on Thursday by the tool that re-portions, retried Thursday's request with the tool that
     keeps portions, quoting Thursday's sentence. Hole 2 let it through; hole 1 is why it
     looked unfinished; `date` omitted defaults to today, hence "tomorrow's dinner" landing
     on today.
  2. *Two requests in one message → "I can't find Band Tricep Kickback in your breakfast. It
     has 200g non-fat Greek yoghurt…"* That sentence is `meal-food-edit.ts:149`. The model
     fused "didn't do the band kickbacks" and "breakfast" into ONE call,
     `propose_meal_food_remove(meal_slot: breakfast, food: Band Tricep Kickback)`. Hole 3
     means even a correct pair of calls would have lost the second; hole 4 means an exercise
     name was accepted as a food.
  3. *"Log my breakfast: …" → "Friday is a rest day — there's nothing on it to swap."* That
     sentence is `swap-target.ts:133`, reachable only from the exercise swap / remove /
     reorder builders. The kickback from the previous message, never dealt with, was acted on
     now (model), with nothing naming it in this message (hole 4), and it hit H15's wrong
     lookup on the way.
- **Deterministic vs model.**
  | | Deterministic (fixable and testable here) | Model behaviour (assertable only) |
  |---|---|---|
  | Stale request resurfaces | quote not in current message → refuse the call | choosing to revive it |
  | Closed things look open | outcome stamped on history turns | reading the stamp |
  | Two requests, one reply | run every call the model emits, in order | emitting two calls instead of fusing |
  | Exercise name in a meal tool | subject / domain evidence check | not doing it |
- **Fix.**
  - (a) Edge, MECHANICAL: **one gate before the `if (name === …)` chain.** For every tool
    that declares `origin_verbatim_quote`: the quote must be in `message`; if it is not, the
    call is not executed and the turn is answered through the existing second leg
    (`resolvePlainReply`, `index.ts:4500-4512`) with tools off. This would have stopped
    incident 1 outright. Not `classifyImperative` wholesale: that also rejects negations and
    questions, which is right for a write and wrong for "I'm not doing the lunges"
    (`index.ts:794` gives that as a valid trigger for remove).
  - (b) Edge, MECHANICAL: a subject check for the couriers that name a thing (`item`,
    `old_item`, `food`, `meal_name`, `activity`): its content words must appear in the
    current message, or, when the current message is a short answer (a chip, a few words),
    in the two turns before it. Stops incident 3. `contentTokens` is already there
    (`message-evidence.ts:42`).
  - (c) Client, MECHANICAL: history turns carry their outcome
    (`[applied]`, `[declined]`, `[timed out — closed]`, `[could not be done — closed]`),
    added in the one `.map` at `ChatAssistant.tsx:1860`. Outcome needs to survive a reload:
    `chat_messages.action_data` is an existing JSON column the client already writes
    (`:1953-1958`), so no migration.
  - (d) Edge + client: execute every function call the model returns (cap three), returned
    as a list the client processes in order. This is the larger piece; the client's
    `processResponse` returns one thing today. Also fixes L22's "log both".
  - (e) Client, MECHANICAL: when a food-edit's `food` resolves as an exercise, say that, not
    "I can't find it in your breakfast".
  - (f) Edge prompt + exam: a rule that a message with two requests gets two tool calls, and
    exam cases for all three incidents. `coach-promises` fails on any exam question pasted
    into the prompt (CLAUDE.md "AN EXAM QUESTION IN THE COACH'S PROMPT IS AN ANSWER KEY"), so
    the cases need their own wording.
- **Class:** MECHANICAL (a, b, c, e) + OWNER DECISION (d, how it reads):
  > **Question for Ashley.** One message asks for two things ("I skipped the kickbacks, and
  > log my breakfast"). How should the coach handle it?
  > A. Do the first, then say plainly what it has not done yet and offer it as one tap.
  > B. Do both, one after the other, each with its own card or receipt.
  > C. Ask which to do first.
  > **Recommend B**, with A as the fallback when the second cannot be done. It matches your
  > 24 Sep "one line per thing" ruling and nobody should have to repeat themselves.
- **Ships via:** edge function `chat-gemini` (a, b, d, f) — separate deploy, not type-checked
  by `tsc` — and frontend (c, d, e).
- **Gates:** `test:question-not-a-card`, `test:message-evidence`, `test:tool-reply`,
  `test:chat-actions`, `test:pending-actions`, `test:coach-parity`, `test:coach-promises`,
  `test:coach-rules-sync`; `test:coach-exam-fresh` goes stale the moment the prompt changes,
  so the exam must be re-run on Ashley's machine. New: a table-driven gate that loops every
  declared tool and asserts a stale quote is refused (same shape as `coach-parity` §3, so one
  forgotten tool fails rather than hides); a mocked-model gate that returns two function
  calls and asserts both run.
- **Risk:** (a)/(b) over-blocking a legitimate follow-up ("the other one", "do it for the
  block instead"). The short-reply window in (b) is the mitigation; false negatives must fall
  to a plain reply, never a dead end. A gate needs both the blocked twin and the allowed twin
  for each tool.
- **Confidence:** high on the four holes; medium on which meal tool produced the salmon card.

---

### H23 · The coach reports work that was never done
- **Status:** PARTLY. The claim is the model's, against an existing rule; the app hands it a
  sentence that says the same wrong thing.
- **What the model is given for "what did I do today" (VERIFIED). Both, unjoined.**
  - The PLAN: today's row with every prescribed exercise and its sets × reps
    (`chat-plan-context.ts:436-441`), so "Band Tricep Kickback (3x15-18)" is on the line
    tagged (TODAY).
  - The LOG: `workout_log_history`, 14 days, one line per date with every set
    (`daily-tracking.ts:625-656`), under a rule that already forbids exactly this:
    *"If a movement is not on these lines, it was not logged. Do not fill a gap with something
    plausible from their plan"* (`index.ts:2650`).
  - A HEADER written by the app that contradicts the log: for a moved-in day
    `` `…MOVED TO TODAY at their request${today.finished ? ', and it is ALREADY DONE' : …}` ``
    (`chat-plan-context.ts:273`), and for an ordinary day *"ALREADY DONE — finished and
    logged. There is nothing left to train today."* (`:279`). `finished` is only
    `activeSession.status === 'finished'` (`ChatAssistant.tsx:1490`). Sam finished at 7 of 9
    sets with one exercise untouched. The app told the coach the session was done.
  - `setsLogged: activeSession.logs.length` (`:1486`) counts every row, warm-ups and added
    exercises included, against `setsPlanned` from the plan row, so "N of M" is not
    like-for-like either.
- **Cardio / finisher.** Cardio logs are included (`cardio_log_history`,
  `daily-tracking.ts:680-700`), subject to the stale-read in H8. The day's PRESCRIBED finisher
  is not: on a lifting day the row lists exercises only (`chat-plan-context.ts:405-407`;
  `recommendedCardio` is described only for a day with no exercises, `:129-149`). The reply
  "already logged under your conditioning" echoes the section title *"CARDIO & CONDITIONING
  HISTORY"* (`index.ts:2661`), so INFERRED it was read from a real log row and is true; what
  is broken there is the summary and history screens (H21, not mine).
- **Is there a deterministic recap path?** No. Nothing in `src/` builds "what you did today"
  for the chat; the Session complete dialog builds its own for the screen.
- **Prior rulings:** the prompt rule above (5 Sep 2026, from Ashley's "it says I logged an
  exercise which i didn't"). CLAUDE.md:953, 24 Sep: *"A coach wouldn't send a card"* for
  things she did not ask to change, which rules out a recap card by default.
- **Fix.**
  - (a) MECHANICAL, frontend: the header says what is true: *"FINISHED with 7 of 9 planned
    sets logged. NOT DONE: Band Tricep Kickback (0 of 3)."* Counted from working sets on
    planned exercises (`filterLoggableSets`, which the session already uses).
  - (b) MECHANICAL, frontend: a short app-written block in `exercise_summary`,
    "TODAY, EXERCISE BY EXERCISE": each planned exercise with logged / planned sets and the
    weights, anything added, cardio logged today, and the finisher with done / not done. The
    model then reads the join instead of making it. Reaches the phone on a frontend push.
  - (c) Exam case: asked for a recap after a part-done session, every exercise named must be
    on the log lines; unlogged planned work is named as not done.
- **Class:** MECHANICAL. One COACHING note, decided: unlogged planned work is reported as
  "not logged", not "skipped". The app knows it has no record; it does not know the person
  did not do it, and the prompt's own rule is "their memory outranks this list".
- **Ships via:** frontend. The exam case needs a run on Ashley's machine.
- **Gates:** `test:coach-plan-context`, `test:context-is-read`, `test:log-correction` (pins
  that an empty plan yields exactly `''`; (b) must keep that), `verify:coach-week-move`. New:
  a `test:` that builds the header for finished-at-7-of-9 and asserts the unlogged exercise is
  named and the words "ALREADY DONE" are absent.
- **Risk:** prompt length; the block is one line per exercise for one day.
- **Confidence:** high on the context; the model's reason for ignoring the rule is not
  knowable from code.

---

### M26 · "Take out of this session" takes five steps and hides the real action
- **Status:** five parts; PARTLY (two mechanical defects, one H19 symptom, two deliberate).
- **Root cause, part by part.**
  1. *Five taps.* ⋮ → Take out → [reason chips] → "Drop it" / "Put something else there" →
     "Today only" / "Rest of block" (`RemoveExerciseSheet.tsx:106-146`). **DELIBERATE: three
     rulings stacked.** CLAUDE.md:449 (14 Sep) every change behind the ⋮; CLAUDE.md:415
     (11 Sep) removal *"asks whether to drop it or put something else there (her ruling)"*;
     CLAUDE.md:845-848 (15 Sep) *"Both surfaces ask 'what's going on with it?' before a swap
     or a removal … and 'just get on with it' always beside them."* Each was sensible alone;
     nobody counted them together.
  2. *The option that removes sits behind "Just get on with it".* DELIBERATE, same rulings.
     The side effect the tester met: the two time/energy chips do not remove THE exercise
     tapped. "I'm short on time" shortens the whole day to the bottom of the person's
     session-length band (`TodayPanel.tsx:441`); "I'm wiped today" takes a set off every
     exercise (`:442`). Routing table: `docs/how-the-app-talks-about-a-change.md:138-139`.
  3. *"I'm wiped today" → "Every exercise is already at its minimum."* On Sam's Friday this is
     H19 again: `lighterToday` looks up `effectiveDayName` (`TodayPanel.tsx:454`), finds
     Friday's empty row, `adjustDayVolume` changes nothing and blocks nothing, and the
     fallback sentence prints (`:458-461`). Probe:
     `adjustDayVolume(Friday row, lighter): changed = false | blocked = 0`. An empty day is
     reported as a day at its floor. On an ordinary day the sentence can be genuine.
  4. *Red error text stays through the next step.* CONFIRMED. `error` is set at
     `RemoveExerciseSheet.tsx:82` and cleared only at the start of the next `answer()` or
     `drop()` (`:69, :79`) or on close (`:66`). "Just get on with it" is
     `onSkip={() => setAsked(true)}` (`:112`) and "Drop it" is `setChoosing(true)` (`:119`);
     neither clears it, and it renders unconditionally at `:150`.
  5. *"Just this week, or the rest of the block?" over a button reading "Today only".*
     CONFIRMED, `:141-142`. The file's own header says the scope words are the swap dialog's
     *"to the letter ('Today only' / 'Rest of block')"*; the question above them was not.
- **Fix:** (3) falls out of H19; add `day.exercises.length === 0` → "There's no session here
  to lighten." (4) clear `error` on every step change. (5) the question uses the buttons'
  words: "Just today, or the rest of the block?". (1)-(2) are Ashley's.
- **Class:** MECHANICAL (3, 4, 5) + OWNER DECISION (1, 2):
  > **Question for Ashley.** Taking one exercise out of today's session is five taps, and the
  > tap that actually removes it is the small grey "Just get on with it".
  > A. Leave it (the reasons catch a sore shoulder before it is trained around).
  > B. Keep the reasons, but make the first screen lead with two plain buttons, "Take it out"
  >    and "Swap it instead", with the four reasons underneath as "or tell me why". Three taps
  >    for the plain case.
  > C. Remove → today or the block → done, and ask why only when it is a main lift.
  > **Recommend B.** The common case gets short, "It hurts" stays one tap away, and neither of
  > your two earlier rulings is dropped.
- **Ships via:** frontend.
- **Gates:** `test:edit-reason`, `verify:session-edit` §3c2-3c5, `verify:tradeoff` §4-6,
  `verify:hurts`. `verify:session-edit` will need its step count updated if B or C is chosen.
  New: a driver check that an error from one step is not on screen after the next tap.
- **Risk:** B/C touch a sheet three drivers walk.
- **Confidence:** high.

### M27 · "I don't like it — and not again" has no "never again"
- **Status:** CONFIRMED IN CODE. The design promises a ban; no screen delivers one.
- **Root cause.** The record says a dislike keeps the exercise out for good:
  `docs/how-the-app-talks-about-a-change.md:133` *"I don't like it | both | Drop or replace
  it, and keep it out from now on"*; `edit-reason.ts:104-112` `route: 'ban'`,
  `cardLine: "I'll keep it out of your plans from now on."`. But:
  - Swap dialog: `if (a.type === 'reason') { setAsked(true); return }`
    (`SwapDialog.tsx:148`). The answer is thrown away; "busy" and "don't like it" both just
    reveal the same list, then the same Today only / Rest of block step (`:347-368`).
  - Remove sheet: `if (a.type === 'reason' && a.reason === 'dislike') { setAsked(true); setChoosing(true); return }`
    (`RemoveExerciseSheet.tsx:78`), straight to the scope step, skipping even the
    drop-or-swap choice the comment above it says it keeps.
  - `routeFor` and `cardLineFor` have no caller in `src/`; their only caller is the gate
    (`scripts/test-edit-reason.ts:23, 134-143`). The route table is tested and unused: a
    check holding in place a promise nothing keeps.
  - *The three alternatives.* Probe, Sam's profile with the shoulder flag off (Friday's
    state): `Overhead Tricep Extension [dumbbell/cable]`, `Chair Dips [bodyweight]`,
    `Band Tricep Pushdown [resistance band]`. Exactly three, one a band. Skull Crushers need
    `['barbell', 'EZ bar']` (`exercise-db.ts:3404-3413`) and the catalogue has **no dumbbell
    kickback and no dumbbell skull crusher at all**. The band is offered because "Minimalist"
    includes bands (H1-H3, not mine).
- **Prior rulings:** the two quoted above; CLAUDE.md:397 ban is on both surfaces.
- **Fix.**
  - MECHANICAL: on a dislike, the scope question is not asked. Swap: apply the chosen
    replacement for the rest of the block, then record the ban (`onBanExercise`, which writes
    the `user_facts` row at `App.tsx:2424-2433`), and show the card line. Remove: keep the
    drop-or-swap step, then the same. A ban sweeps every block and auto-picks the top
    candidate elsewhere (`mesocycle-edit.ts:427-470`), so do the chosen swap first.
  - COACHING, decided: add **Dumbbell Tricep Kickback** and **Dumbbell Skull Crusher** to the
    catalogue. Both are standard triceps isolations for a dumbbell-and-bench trainee; without
    them the only loaded triceps option at Sam's kit is an overhead extension, which is the
    one position a sore shoulder rules out. Kickback: elbow at the side, shoulder neutral,
    not contraindicated for a shoulder flag (same reasoning as the band version,
    `exercise-db.ts:3359-3363`). Skull crusher: contraindicated elbow, loads shoulder, as the
    barbell version. Rep range and load from the existing tier-3 rules. A catalogue change is
    a full sweep, not a derived gate set (CLAUDE.md).
- **Class:** MECHANICAL + COACHING. No owner question: the design is already written down.
- **Ships via:** frontend.
- **Gates:** `test:edit-reason` (must start asserting the route is REACHED, with a `verify:`
  driver, because a `test:` gate cannot prove a branch runs), `test:food-dislike-is-a-ban` §7,
  `verify:session-edit`, `test:swap-style`. Catalogue: full sweep.
- **Risk:** a ban is the widest edit in the app; a mis-tap on "I don't like it" now has
  consequences beyond today. It needs the Undo the chat's ban card already has.
- **Confidence:** high.

### M28 · "It hurts" leads to a dead end
- **Status:** DELIBERATE DESIGN, with one wording gap that sits inside the ruling.
- **Root cause.** `EditReasonStep.tsx:67-78`: the red-flag answer shows `RED_FLAG_ADVICE` and
  one button, with the comment *"The only way out is 'leave it alone'. Offering 'do it
  anyway' here would put a plan change one tap from a symptom the app has just said it will
  not train around."* `TodayPanel.tsx:437`: `if (a.type === 'red_flag') return null`.
- **Prior rulings (binding).** CLAUDE.md:2314-2327, Ashley 15 Sep 2026: *"sharp, one-sided or
  worsening names a professional and changes nothing — not the plan, not the record."*
  `edit-reason.ts:272-281`: not recorded *"because a row in `injuries` would quietly reshape
  every future plan off a symptom description, which is a diagnosis this app is not allowed
  to make."* CLAUDE.md "Asking": *"The app's existing red-flag rule … is itself the CSCS
  answer and stays exactly as it is."*
- **Judged against it.**
  - "It never asks where it hurts": correct under the ruling. Asking would be collecting
    something the app has ruled it will not record or act on.
  - "Can't skip the exercise for today": correct under the ruling as written; a today-only
    removal is a plan change. **I am not proposing to change that.**
  - What still stands: the advice (`edit-reason.ts:282-283`) tells the person the plan is
    untouched and never tells them to stop. They arrived by tapping "take this out"; the
    exercise that hurts sharply is still on the card with its sets, and the only button reads
    "Leave my plan as it is". The screen is silent on the one thing a coach says first. Telling
    someone to stop a movement that produces sharp pain is inside a CSCS's scope; it is not a
    diagnosis, a plan change or a record.
- **Fix:** words only, nothing written anywhere: add to the advice that they should not do
  this exercise today and can leave its rows empty.
- **Class:** SAFETY-ADJACENT + OWNER DECISION (what the app says in the pain band):
  > **Question for Ashley.** Someone taps "It hurts" → "Sharp, one-sided or getting worse".
  > The app says see a physio and leaves the plan alone, which is your rule. It does not say
  > "don't do this one today".
  > A. Leave the message as it is.
  > B. Add one sentence: "Don't do this one today — leave it blank, you don't need to change
  >    anything here." Nothing is changed or recorded.
  > **Recommend B.** Your rule is kept exactly, and the app stops being silent about the
  > exercise it has just said needs looking at.
  > (A third option, letting the tap also skip the exercise for today, would change the plan
  > on that answer. That is the thing your 15 Sep rule forbids, so I am not putting it
  > forward.)
- **Ships via:** frontend (`RED_FLAG_ADVICE` is also rendered by `TightnessSheet.tsx:77`, so
  the sentence must read correctly there too, where no exercise is in hand).
- **Gates:** `verify:hurts` (checks both halves: what it says and that nothing changed),
  `test:edit-reason`, `test:coach-voice`, `verify:tightness`.
- **Risk:** none to the plan. The one real hole is elsewhere: closing the sheet and choosing
  "Just get on with it → Drop it" removes the exercise two taps later, so the block is a
  speed bump, not a wall. That is consistent with "never gated behind an answer" and I would
  leave it.
- **Confidence:** high.

---

### L22 · Chat input jumps 40 px; water asks again after "log both"
- **Status:** CONFIRMED IN CODE, two unrelated causes.
- **Root cause.**
  - *The jump.* The chat page's bottom edge is offset by the measured dock height plus 12 px
    (`ChatAssistant.tsx:6427-6430`). The session chip is `py-1.5` around one `text-xs` line,
    about 28 px (`BottomDock.tsx:175-183`). When the session ends the dock reports 0
    (`BottomDock.tsx:101-104`) and `bottom` drops by 28 + 12 = **40 px** in one frame. The
    offset itself is deliberate (`useBottomDockHeight.ts:6-11`: the timer had been covering
    the input); only the snap is unintended.
  - *"Log both".* H22's hole 3. Two things to log need two tool calls; `index.ts:2778` runs
    the first. Weight is written at once on the server (`:3380-3440`), water is dropped, and
    the next turn has to ask again.
- **Fix:** a short `transition` on the chat page's `bottom`; "log both" is H22 (d).
- **Class:** MECHANICAL. **Ships via:** frontend; edge for the second half.
- **Gates:** `verify:chat-shell`, `test:chat-page`, `test:composer-focus`. New: a driver check
  that the composer's position does not change by more than a few pixels between two frames
  when the dock unmounts.
- **Confidence:** high on the arithmetic (not driven in a browser).

### L33 · Expired offers look almost the same as live ones
- **Status:** CONFIRMED IN CODE.
- **Root cause.** A card lives ten minutes (`pending-actions-store.ts:88, 127`). The card's
  view model is `{ id, kind, status, diff }` (`ChatAssistant.tsx:5079`); `expires_at` never
  reaches the component, and nothing ticks. Expiry is discovered only by tapping
  (`claimPendingAction`, `pending-actions-store.ts:201-204`), after which the note appears
  (`ProposalCard.tsx:51`). The sweep that marks old rows runs on chat mount only
  (`ChatAssistant.tsx:869-881`) and updates the database, not the cards on screen, and the
  local cache restores cards as `pending`.
- **Prior rulings:** CLAUDE.md "It proposes and the user confirms" (`proposal-expiry`); the
  ten minutes itself is from VISION-ARCHITECTURE §2.5. Nothing on showing it.
- **Fix:** carry `expiresAt` on the view; one timer per open card flips it to the existing
  expired state when the time passes, and restored cards are checked on load. Whether to SAY
  the limit beforehand is hers:
  > **Question for Ashley.** A suggestion from the coach stops working after ten minutes.
  > A. Say nothing until it has timed out, then grey it and show the existing line
  >    (the fix above, no new words).
  > B. Also show a small "good for 10 minutes" under the buttons.
  > C. Make it last longer (an hour, or until the plan changes).
  > **Recommend A.** The card simply stops offering a button that cannot work, and no new
  > sentence is needed. C is worth a thought later: ten minutes is short for someone mid-set.
- **Class:** MECHANICAL + OWNER DECISION. **Ships via:** frontend.
- **Gates:** `test:proposal-expiry`, `test:pending-actions`. New: driver with the harness
  clock advanced past the window, asserting no Apply button is on screen before any tap.
- **Risk:** the 24 Sep lesson: a window about elapsed time is measured on the real clock, not
  the app's dev clock.
- **Adjacent, found while here:** confirm never re-checks the plan. The precondition check is
  `async () => true` (`ChatAssistant.tsx:5500`) under a comment calling it *"an interim
  placeholder"*, and `executeExerciseSwap` swaps by index without checking the slot still
  holds `oldExerciseName` (`pending-action-executor.ts:79-87`). A card built before a tap on
  the Exercise tab changed that slot would swap whatever sits there now, and report the old
  name as swapped. Stale cards are caught only when the tap goes through
  `sweepStaleForTarget`.
- **Confidence:** high.

---

## Question 6 · Where each fix ships

| Fix | Frontend | Edge `chat-gemini` (separate deploy, not type-checked) | Migration |
|---|---|---|---|
| Session resolver, all edit call sites (H15, H19, M26.3) | ✔ | | no |
| Coach rows say swapped / missed / rested; finisher on lifting rows; honest "finished" header; today-by-exercise block (H23, H8) | ✔ | | no |
| Cardio rows refresh the coach (H8) | ✔ | | no |
| Past-tense cardio → log, not plan (H8) | | ✔ | no |
| Lifting-day cardio offer (H8, after Ashley) | ✔ | prompt lines | no |
| Effective constraints incl. active adaptations; date-level adaptation; no cross-pattern isolation fill (H17) | ✔ | | no |
| Travel start date (H17, after Ashley) | ✔ | one parameter + prompt | no (`starts_at` exists) |
| Stale-quote gate, subject check (H22) | | ✔ | no |
| Outcome stamped on history (H22) | ✔ | | no (`action_data` exists) |
| More than one tool call per turn (H22, L22) | ✔ | ✔ | no |
| Dislike → ban; two dumbbell triceps entries (M27) | ✔ | | no |
| Sheet error / wording (M26.4, .5), red-flag sentence (M28), composer transition (L22), card expiry (L33) | ✔ | | no |

Every edge change makes the coach-exam scores stale (`test:coach-exam-fresh`) and needs the
exam re-run on Ashley's machine. None needs a migration.

---

## Shared choke points

1. **"Which plan row is this session?"** — H15, H19, M26 part 3, the third H22 incident, plus
   twenty readers in the table that nobody has hit yet (Program-view swap, peek swap, chat
   add / reorder / rebuild / volume / logging, the Tools tab's conditioning). One resolver,
   `SessionRef`, and edits that accept only its output. Fix once.
2. **"What is this person allowed right now?"** — H17 (and H11, not mine): active adaptations
   are invisible to every picker and to the coach's injury line. One
   `effectiveConstraintProfile`. Same family as the earlier `applyReplacement` choke point,
   one step upstream of it.
3. **"Is this tool call about the message just sent?"** — H22 (all three), L22b, and the
   question-gets-a-card half of H8. One gate in front of the dispatch chain, written as a loop
   over the tool declarations so a new tool cannot be forgotten.
4. **"One call per turn."** — H22.2, L22b. One executor change.
5. **"What does the coach know happened?"** — H23, H8, H22.1: outcomes of cards, what was
   logged against what was planned, cardio, swapped days. All of it is app-authored context
   built in two frontend files (`chat-plan-context.ts`, `ChatAssistant.buildContext`).
6. **The reason sheet** — M26, M27, M28 share `EditReasonStep` and the two sheets around it.

## Suggested build order

1. **Session resolver + every edit call site + display names** (frontend, MECHANICAL). Largest
   user-visible win, no decision needed, fully testable here. Ship with the driver that edits
   a moved session.
2. **Coach context truth** (frontend): finished-header, today-by-exercise block, day states on
   rows, finisher on lifting rows, cardio refresh, outcome stamps on history. No deploy; reaches
   the phone on a push. Removes most of what feeds H22 and H23 before any prompt work.
3. **Sheet fixes** that need no ruling: stale error, question wording, empty-day guard,
   composer transition, card expiry timer (L33 option A).
4. **Written plan for H17** (SAFETY-ADJACENT): effective constraints, date-level adaptations,
   expiry restore with overlaps, isolation rule. Build after the plan; start date after Ashley.
5. **Edge function, one deploy:** stale-quote gate, subject check, past-tense cardio → log,
   prompt lines, multi-call executor (with its client half). Then the exam, on her machine.
6. **After her answers:** lifting-day cardio offer (H8), the remove flow's shape (M26),
   red-flag sentence (M28), dislike → ban with the two catalogue entries (M27; catalogue means
   a full sweep).

## Owner decisions, in one place

1. Cardio on a lifting day: what the coach offers (H8). Recommend three taps.
2. "I'm away next week": when the travel plan starts (H17). Recommend the day they name, else today, dates on the card.
3. Two requests in one message (H22). Recommend do both.
4. Taking one exercise out: how many steps (M26). Recommend plain buttons first, reasons beneath.
5. Sharp pain: add "don't do this one today" (M28). Recommend yes; rule unchanged.
6. Expired suggestions: say the limit or just grey it (L33). Recommend just grey it.

## What I did not verify

- Which tool the model actually called in each H22 / H8 turn. No transcript is in the repo;
  each is inferred from a sentence that only one builder can produce.
- Anything in a browser. No `verify:` driver was run; the L22 pixel count is arithmetic.
- The live database: whether Sam's cardio rows exist in `cardio_logs` (decides whether "already
  logged under your conditioning" was true).
- The deployed edge function. Line numbers are the checkout's; the brief says the build is
  the same as `main`.
