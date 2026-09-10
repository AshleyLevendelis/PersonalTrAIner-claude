# Must-have audit — 10 September 2026

The measurement behind the "What the app must have" section of CLAUDE.md.
Report only; nothing built. Every mark in that section traces to a row here.

## How it was measured, and what it was not

- **Gates:** every `test:` and `verify:` script's header line was read and
  mapped onto the contract lines it guards (185 scripts). A line marked with
  gate names means those checks exist and were green on the full sweep of
  10 Sep 2026 (159/159 fast gates; `audit` 0 failures / 17,423; `quality`
  11.56/12, 0 below the 7.2 floor). A gate name is evidence the property is
  checked — not that the check is strong; that is what mutation-testing is
  for, and this audit did not re-mutate existing gates.
- **Existence:** capability by capability, in code — the exercise-plan edit
  module, the session-move module, the set-log store, the meal modules, the
  Profile screen's fields, the coach's 31 tool declarations, the App
  handlers, and the onboarding slot keys.
- **Surfaces:** "screen" means a control a person can tap without the chat;
  "coach" means a declared tool the chat can call. Screen paths were settled
  from component source and, for today's session screens, the screenshots
  taken by `verify:calibration-search` earlier today.
- **Not measured in the browser:** parity table entries were confirmed in
  code, not by tapping each one. The verify: drivers named in the section
  are the browser evidence that exists; nothing new was driven for this
  audit.
- **Not measured at all:** the quality of the coach's advice. Nothing in the
  repo grades it; that absence is itself the finding (Promise 3).

## Parity table — measured 10 Sep 2026

### Coach tools (31) and their screen path

| Coach tool | Screen path | State |
|---|---|---|
| propose_exercise_swap | Swap dialog on the exercise row | both |
| ban_exercise | "Ban exercise" in the row's menu | both |
| log_workout_set | Set grid | both |
| log_workout / log_workout_session | Start / Finish session | both |
| log_history (a past session) | — | **coach only** |
| propose_session_move | — | **coach only** |
| propose_rest_day | — (Home shows the state) | **coach only** |
| swap_session_for_activity | — (Exercise shows "You swapped today") | **coach only** |
| propose_volume_change | Volume toggle on the workout card | both |
| propose_schedule_change | Profile → training days | both |
| propose_style_change | Profile → training style | both |
| propose_equipment_adaptation | Profile → equipment | both |
| propose_injury_adaptation / _as_lasting / _recovered | Profile → injuries | both |
| propose_concurrent_activity | Profile → other activities | both |
| record_goal | "Save this goal" | both |
| record_fact / record_context_fact | "Save this note" (memory) | both |
| record_session_feel | — (the coach asks; by design) | coach only, deliberate |
| set_display_name | Profile → name | both |
| propose_meal_swap | Swap / regenerate / more options on the meal | both |
| propose_meal_addition | — | **coach only** |
| propose_meal_food_add | — | **coach only** |
| propose_custom_meal | — | **coach only** |
| log_meal | Tick on the meal | both |
| add_to_grocery_list / check_off_grocery_item | Grocery list | both |
| log_steps / log_water / log_weight | Home "Today so far" | both |

### Screen actions with no coach path

| Screen action | Where | Coach | State |
|---|---|---|---|
| New Plan (start again) | Profile footer | no tool; 0 mentions | **screen only** |
| Session length | Profile | no tool (3 context mentions) | **screen only** |
| Targets / macro mode / macro split | Nutrition "How it's set" | no tool | **screen only** |
| Meals per day, snacks | Profile | 0 mentions | **screen only** |
| Cuisines, cooking time | Profile | context only, no tool | **screen only** |
| Daily step target | Profile | 0 mentions | **screen only** |
| Age, height | Profile | 0 mentions | **screen only** |
| Appearance, export data, delete data, sign-in | Profile / Tools | none | screen only — likely deliberate exceptions, **but no exceptions list exists to say so** |

Seven coach-only, seven screen-only, before any exceptions list. VISION.md
says the two are "equal paths, not a primary and a fallback". Today they are
two different apps that overlap in the middle.

## The MISSING list — does not exist on either surface

Exercise grain
1. Add an exercise to a session as part of the plan (extra work can be
   logged — "Additional work" — but it never joins the plan).
2. Remove an exercise from one session without banning it everywhere.
3. Move an exercise earlier or later within a session.

Workout grain
4. Say "I missed it" and have it recorded as fact. Today "missed" is
   inferred once the date passes (`useTrainingWeek`); Home offers a chat
   prefill ("I have missed some sessions — can we adjust the plan?") that
   starts a conversation, not a record. Cannot distinguish "missed" from
   "did it elsewhere" from "move it".
5. Shorten or lighten today only. The volume toggle rewrites the plan going
   forward (`adjustDayVolume`), it is not "make today 30 minutes".
6. Rebuild today's session as a whole for today only.

Meal grain
7. Remove or replace one food within a meal.
8. Move a meal to another slot or day.
9. Scale a portion as a user action (portioning exists internally in
   meal-addition and meal-food-add; nothing exposes it).

Whole plan
10. Eight onboarding answers cannot be changed afterwards from the Profile
    screen: known squat / bench / deadlift, disliked exercises, the three
    implement ceilings (dumbbell, single implement, improvised), and the
    starting preference (walks first vs train). Some are reachable by
    telling the coach (dislikes via memory; a volunteered implement weight
    is kept); none has a screen.

Keeping the bar
11. When a request would take the plan below the quality bar, the app says
    so and offers the nearest thing that keeps it.
12. A changed plan is re-scored the way a generated one is.

Parity
13. A written exceptions list — which one-sided capabilities are deliberate,
    with a reason each.

The coach
14. The coach exam — a fixed set of realistic conversations graded against a
    written rubric, run against the real model whenever the prompt, model or
    tools change, scores kept over time.

## The UNGUARDED list — exists, but no check would notice it break

- Ranking over shuffling in exercise selection (VISION's "choosing, not just
  filtering") — the quality scorer's selection dimension touches it; nothing
  pins that candidates are scored rather than picked.
- "Targets explained when they move" — the message exists in App; no gate.
- The meal-quality floor — `test:meal-quality` needs a live database and
  never runs in a cloud sweep; in practice the meal bar is unmeasured on
  every push.
- Adjustment keeps the bar — a single swap (`applyReplacement` →
  `recomputeLoad`) and the volume toggle re-run none of
  `enforceLoadCoherence`, `enforceSetHierarchy`,
  `enforceOneWeightPerPrescription` or the weekly pattern balance; only
  `slot-replacement-hygiene` guards the slot's own data. Full rebuilds
  regenerate and so are covered.
- Advice quality, "asks before prescribing", scope-holding and one voice —
  prompt rules kept in sync by `coach-rules-sync`; tone probes exist
  (`probe-coach-tone`, `compare-tone`); nothing grades whether any of it
  happens.

## What is solidly held — so the gaps are read in proportion

Generation is the strongest part of the app and the best guarded: two
whole-grid harnesses, load safety in six gates, injuries in four, time cap
in three. Logging is close behind — correction, plausibility, silent-write
and queue gates, with browser drivers. The coach's *mechanics* — acts rather
than instructs, proposes and confirms, never invents a control, sees the
plan's real numbers — are held by eleven gates. History permanence and
"nothing lost" are held. The gaps cluster in exactly two places: the finer
grains of editing (one exercise, one workout, one meal) and the two things
nobody has built a measure for (quality after a change; quality of advice).

## Corrections to earlier drafts of the contract

- Draft 2 marked "add a food to a meal" as *partial*. Measured: it is
  `coach only` and gated (`meal-food-add`) — better than partial on one
  surface, absent on the other.
- Draft 2 marked "activity-shaped plans" as *audit*. Measured: one exists —
  the starting-out walking plan behind the "Get moving first" onboarding
  option — and only that one is offered. Consistent with "only offer what is
  built".
- Draft 2 guessed the accelerator's offer, calibration's auto-apply and the
  logged re-anchor were gated. Confirmed: `beat-target-offer`,
  `calibration-search`, `logged-reanchor`.
