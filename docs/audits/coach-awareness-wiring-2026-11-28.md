# Coach awareness: the wiring still to do (28 Nov 2026, Builder D's handover)

Builder D built twelve pure builders on `claude/builder-d-coach-awareness` (audit:
`docs/audits/coach-awareness-2026-11-28.md`). None reaches the coach yet. This is every wiring step, in one place, for
whoever owns `ChatAssistant.tsx`, `chat-gemini/index.ts`, `App.tsx` and the parity docs. Each builder is tested and
mutation-tested; the wiring is not. Whether the coach USES any of it is unproven until the exam runs after a
`chat-gemini` deploy.

Pattern for every context block: compute it in the chat client, add one `buildContext` field, and have the server print
it as given when non-empty (each block is already headed in capitals and carries its own rule for the coach). Pattern
for every route: a `propose_*` tool returns intent; the client plans with the builder, shows lead + rows + Apply / Not
now, Apply goes through the named function, Undo where given. Each route needs a `COACH_ACTIONS` row
(`src/lib/offer-rules.ts`), a words rule, and its line moved out of "screen only" in `docs/coach-screen-parity.md`.

## Context (the coach is told)

| # | Field | Builder | Inputs, from where | Prompt line |
|---|---|---|---|---|
| 1 | `lift_feel` | `buildCoachLiftFeel(recent)` (`lift-feel-context.ts`) | `recent` = `getRecentLogsWithWarmups(...)` in the logs effect (~ChatAssistant 2175) | "When they ask whether to go up, quote their own answer from HOW EACH LIFT FELT; the app already moves the weight off it, so never promise a different number." |
| 2 | `setup_answers` | `buildCoachSetupAnswers(profile, today)` (`setup-answers-context.ts`) | the profile; today = `getSessionDateContext(profile.id).date` | "Explain a plan or meal choice from SETUP ANSWERS when it is the reason; never contradict those counts." |
| 3 | `own_workouts` | `buildCoachOwnWorkouts({ workouts: loadOwnWorkouts(id), plans: ownPlans(id), today })` (`own-workouts-context.ts`) | phone stores, client only | "A day in THEIR OWN WORKOUTS is not a rest day; its sets were their own choice, not the plan's." (his "Comment, kindly" is in the block) |
| 4 | `watch_waiting` | `buildCoachWatchWaiting(offers, today)` (`watch-workout-context.ts`) | `readWatchOffers(id, today)`, phone app with `isWatchWorkoutsConnected()` | none beyond the block (it says not to raise it) |
| 5 | `tightness_today` | `buildCoachTightness(tightAreas, tightnessWarmup(tightAreas, injuries, warmupNames, pregnant))` (`tightness-context.ts`) | the exact call TodayPanel.tsx makes (~505) | none beyond the block |
| 6 | `meal_markers` | `buildCoachMealMarkers(chosenMeals, eatenSlots)` (`meal-markers-context.ts`) | App's `chosenMeals` (behind `mealPlan`), passed to ChatAssistant; `slotsEatenToday()` | print right after the meal summary |

Plus, already done elsewhere: steps and calories of a recorded walk in the cardio line (Builder A, `daily-tracking.ts`)
and its prompt line (Builder B, 63a376a).

**His daily-message ruling for #4, "Mention it once, in its daily message":** where the day's first unprompted message
is picked, `watchDailyMention(offers, mentionedIds, today)` gives `{ line, ids, action: 'Log it' }` or null; append the
line, add a "Log it" shortcut to Home's watch offer, store the ids (e.g. localStorage `fitplan_watch_mentioned`). Never
its own notification, never twice.

## Routes (the coach can change it)

| # | Tool sketch | Builder | Apply | Undo | Words rule | Notes |
|---|---|---|---|---|---|---|
| 7 | `propose_meals_elsewhere { slot, days[], mode: set\|add\|remove }` | `makeMealsElsewhereController({ read, save })` (`coach-routes/meals-elsewhere.ts`): `plan`, `confirm(req, shown)`, `undo(receipt)` | the controller | the controller | never off one occasion | App builds ONE controller for Profile's grid and the coach (Builder A, after the merge) |
| 8 | `propose_lift_effort { lift, felt, date? }` | `planLiftEffort({ logs, lift, said, dayWords, prescribedSets?, deloadWeek? })` (`coach-routes/lift-effort.ts`) | `logSet` with the planned set and `plan.rpe` (SetGrid's `sayEffort`) | the same write with the old rpe | never off a maybe | pass a day's logs only for a date `logDayFor` accepts (Builder B: a day before the plan began is refused) |
| 9 | `propose_freestyle_day { day, want: freestyle\|plan }` | `planFreestyle`, `confirmFreestyle`, `undoFreestyle` (`coach-routes/freestyle.ts`) | useMealDays' `FreestyleController`, the one Nutrition has | its opposite call | never off a maybe | freestyle is the whole day; eating out is one meal |
| 10 | `propose_cardio_days { days }` | `planCardioDays(profile, days)` (`coach-routes/cardio-days.ts`) | Profile's save of `plan.patch` then the rebuild confirm (as the running goal) | the rebuild offer's own | never off one occasion | the card's title and detail are Profile's own offer; a running goal wins |
| 11 | `propose_macro_split { split }` | `planMacroSplit(profile, split)` (`coach-routes/macro-split.ts`) | Profile's save of `plan.patch` (MacroSplitCard's onChange) | save the previous three fields | never off a maybe | presets only; an exact gram figure is pointed at the custom slider on purpose |

## Why-sheet

`supabase/functions/_shared/app-decisions.ts` gained Builder A's fix-7 lines (bf1c734, bea2c6f). They anchor on
`adjustDayVolumeAdvised`, which is on `claude/builder-a-screens`: **merge A's branch before this one**, or
`test:app-decisions` fails its anchor check. The fix-8 "added block on a started session" line is waiting on A's
wording.

## Not wired, by decision

The tightness check FROM the chat stays screen-only (CLAUDE.md: it could open a session silently; the pain boundary is
on the screen). Reversing it is Ashley's call.
