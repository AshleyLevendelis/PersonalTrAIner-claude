# Does the coach know what the app knows? (28 Nov 2026, Builder D, report first)

Ashley, 28 Nov 2026: "the chat is aware of what's in the rest of the app and can make changes to plans."

**Method.** The coach is told only what `buildContext` in `ChatAssistant.tsx` sends in each request (read at
`21ab2c2`, lines 2220-2530), and every field it sends was checked to be READ by `chat-gemini/index.ts` (all 52 are; none
is sent and ignored). Each screen fact below was then looked for in those fields, or in the text builders behind them
(`formatLogsForAI`, `formatCardioLogsForAI`, `buildCoachMealSummary`, `buildFeelBrief`, the profile block). A mark is a
reading of the code on that day, not a measurement of the live coach: whether the coach USES a fact it is given is model
behaviour, unproven until Ashley runs the exam after a `chat-gemini` deploy.

Ranked by how often a real user would hit it: daily facts first, rare setup answers last.

## (a) Facts a screen shows that the coach is not told

| # | Fact (screen) | Coach today | How often hit |
|---|---|---|---|
| 1 | **How each lift felt**, Too easy / About right / Too hard (Exercise, once per lift; kept as the effort on its last working set) | Workout history prints weight x reps only; the effort is dropped. "That felt easy, should I go up?" is answered blind, and the coach cannot see he said "too easy" three sessions running | every session |
| 2 | **His own workouts**: one started today, ones planned on a day, the saved list (Exercise, Start a workout / Plan a workout) | Nothing. Its sets reach the coach as ordinary sets, with no sign they were his own session and not the plan's | weekly for anyone who uses it |
| 3 | **Which meals are cooked for him, on which days** (Profile, Meals cooked for me; Nutrition shows "Lunch cooked for you", badged Assumed) | Not told the standing answer. Today's meal names it by name only ("Lunch cooked for you"), with no "this is an assumption, not a dish" marker | daily for those who set it |
| 4 | **A meal marked as eating out / an estimate, and a freestyle day** (Nutrition, "Eating out", "Estimate", "Freestyle · ...") | Today's meal list gives a name and macros for each; nothing says which are estimates or his own one-day choice, so the coach can treat an estimate as a planned dish | weekly |
| 5 | **Setup answers that steer the plan**: recovery capacity, how much he likes cardio, cardio days a week, how long he wants to cook, meal variety (Profile) | None sent. The coach can be asked "why only 3 lifting days?" and not know he chose 2 cardio days | weekly |
| 6 | **Pregnancy due date and weeks pregnant** (Profile, under Pregnant; drives the 28-week rules and the pause at the due date) | Only `pregnant: true`. The coach cannot tell week 12 from week 34, so it cannot say why face-down work left the plan | daily for the few it applies to; safety-adjacent |
| 7 | **A workout the watch recorded, waiting to be logged** (Home, From your watch) | Not told (named as NOT BUILT in the parity doc) | every watch session |
| 8 | **A recorded walk or run's steps and calories burned** (the session summary) | Cardio history carries minutes, effort, distance, heart rate; steps and calories are dropped (named as NOT BUILT in the parity doc) | every recorded walk |
| 9 | **What he said feels tight before today's session** (Exercise, the eight areas; drills added to the warm-up) | Not told. "Why is there a hip drill in my warm-up?" cannot be answered | some sessions |
| 10 | **The macro split he picked** (Profile, How your targets are set) | Only the resulting macros. "Why is my fat so low?" cannot name his own choice | rare |

Already carried, checked and fine: today's session and sets (one count with the screens), calories left (the screen's
own words), the week strip's state of each day, plan pause, allergies and the pen, health conditions, kit, injuries and
ease-offs, steps, water, weight trend and change since start, personal bests, weeks on plan, sleep, heart rate, session
effort 1-10, how sessions felt, the next six days' meals, the shopping list, likes, running goal and race day, phase and
deload.

## (b) Changes a screen can make that the coach cannot

From `docs/coach-screen-parity.md` (screen-only list, 13 entries, re-derived 28 Nov) and `docs/plans/advise-then-allow.md`.
Items 13, 17, 20 and 21 of that fix list are Builder B's and are left out here.

| # | Change (screen) | Coach today | How often hit | Shape of the fix |
|---|---|---|---|---|
| 1 | **Change an exercise's sets, reps or weight** for today or the block | Neither surface (advise-then-allow 12) | every session | new shared planner, under the ceilings |
| 2 | **Say how a lift felt on a set already logged** | Screen only | every session | one write, the effort on the last working set |
| 3 | **Log a build-up (warm-up) set, or a drop set** | Screen only | every session | `log_workout_set` with the warm-up / drop flag |
| 4 | **Which meals are cooked for him on which days** | Screen only (the plan names a coach card on the kit card's shape) | once, then on change | shared planner: the new answer and its card lines |
| 5 | **Freestyle a day / back to the plan** | Screen only | weekly | shared controller already exists (`FreestyleController`); needs a card |
| 6 | **Cardio days a week** | Screen only (per-day half exists, `propose_cardio_session`) | on change | running-goal shape, rebuilds from the live week |
| 7 | **The pre-session tightness check** | Screen only; the obstacles are written down (today only, must not open a session, pain boundary) | some sessions | today-only planner that never opens a session |
| 8 | **"Show numbers" and "Meal variety"** | Screen only | rare | one profile write each |
| 9 | **Macro split** | Screen only | rare | goes with the rebuild-offer road |
| 10 | **Picking up a watch workout** | Screen only, by construction (the coach's server cannot read the phone's store); the coach can be TOLD one is waiting (a, 7) | every watch session | awareness only |

Kept screen-only by decision, not a gap: recording a walk (a physical Start and End), deleting a route (the coach is
never told where he went).

## What this branch built (28 Nov 2026), each a pure builder with its own mutation-tested check

Awareness (the coach is told): (a) 1 how each lift felt (`lift-feel-context.ts`); (a) 2 their own workouts
(`own-workouts-context.ts`); (a) 3, 5, 6, 10 the setup answers and the pregnancy week (`setup-answers-context.ts`);
(a) 7 a watch workout waiting, and its once-only daily mention (`watch-workout-context.ts`); (a) 9 what feels tight
today (`tightness-context.ts`). (a) 8, a recorded walk's steps and calories, is one line in Builder A's
`daily-tracking.ts` (sent). (a) 4 estimates and freestyle marked in today's meals (`meal-markers-context.ts`).

Routes (the coach can change it; one planner both surfaces use): (b) 2 how a lift felt (`coach-routes/lift-effort.ts`),
(b) 4 meals cooked for him (`coach-routes/meals-elsewhere.ts`), (b) 5 freestyle a day (`coach-routes/freestyle.ts`),
(b) 6 cardio days a week (`coach-routes/cardio-days.ts`), (b) 9 the macro split (`coach-routes/macro-split.ts`).
Left: (b) 1 sets/reps/weight (Builder A's advise-then-allow item 12), (b) 3 warm-up and drop sets, (b) 8 show numbers
and meal variety (next round). (b) 7 the tightness check from the chat stays screen-only: CLAUDE.md records why (it could open a
session silently; the pain boundary lives on the screen), and reversing it is Ashley's call.

NONE of it reaches the coach until Builder B wires the context fields, tools and cards (exact wiring sent per item),
and whether the coach uses it is unproven until the exam runs after a `chat-gemini` deploy.

## HIS (answered 28 Nov 2026, through the lead; recorded in CLAUDE.md)

- **Own workouts: "Comment, kindly"** — like any session, never a telling-off. In the own-workouts block's header.
- **Pregnancy week: "Say the week, plainly"** — it explains a plan change, nothing medical beyond it, midwife or GP for
  health. In the setup-answers block's pregnancy line.
- **Unlogged watch workout: "Mention it once, in its daily message"** — folded into the day's first unprompted message,
  within his limit, one-tap Log, never its own notification, never twice.
- Also his: the coach never mentions price.

The questions as asked:

- **Own workouts in the coach's view**: may the coach comment on a workout he did on his own (for example "that was a lot
  of pressing two days before your bench day"), or only note it? The training science says comment; what the coach is
  allowed to SAY about a session he chose is his.
- **Pregnancy weeks**: may the coach say the week of pregnancy back to her ("at 30 weeks, that's why..."), or only act
  on it? It is medical-adjacent wording.
- **Watch workout waiting**: should the coach mention an unlogged watch workout unprompted (a reach-out moment), or only
  when asked? When it speaks is his.
