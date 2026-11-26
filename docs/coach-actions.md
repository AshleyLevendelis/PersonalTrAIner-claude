# Everything the coach can do

GENERATED from the master list in `src/lib/offer-rules.ts` (`COACH_ACTIONS`) by `npm run gen:coach-actions`.
Do not edit by hand: `test:coach-actions` fails when this file and the list differ. The reasons behind each
screen counterpart are in `docs/coach-screen-parity.md`.

## Meals (13)

| Action | On the screen too | Arrives as | His words must... |
|---|---|---|---|
| `propose_custom_meal` | coach only | a card (`propose_custom_meal`) | (no words rule: a meal he describes; the builder costs and checks every line) |
| `propose_eating_out` | yes | a card (`propose_eating_out`) | (no words rule: one meal on one day; the size is asked by the app) |
| `propose_meal_addition` | coach only | a card (`propose_meal_addition`) | (no words rule: asked-for meals only; a question gets the app-sized answer (answer-first)) |
| `propose_meal_day_move` | yes | a card (`propose_meal_day_move`) | (no words rule: two named days within the week; the trial shows every knock-on) |
| `propose_meal_food_add` | yes | a card (`propose_meal_food_add`) | (no words rule: one food in one meal; the food must be in the food list) |
| `propose_meal_food_remove` | yes | a card (`propose_meal_food_remove`) | (no words rule: one food he named; the builder finds it in the meal) |
| `propose_meal_food_replace` | yes | a card (`propose_meal_food_replace`) | (no words rule: one food he named; swaps are checked against his diet) |
| `propose_meal_food_resize` | yes | a card (`propose_meal_food_resize`) | (no words rule: one food he named; the builder finds it in the meal) |
| `propose_meal_move` | yes | a card (`propose_meal_move`) | (no words rule: two meals on one day; the card shows both sizes) |
| `propose_meal_rebalance` | yes | a card (`propose_meal_rebalance`) | (no words rule: the app asks how much before the card) |
| `propose_meal_refit` | yes | a card (`propose_meal_refit`) | (no words rule: offered off the app's own drift verdict, not his words) |
| `propose_meal_swap` | yes | a card (`propose_meal_swap`) | (no words rule: one meal on one day; the card names the day) |
| `propose_meal_top_up` | yes | a card (`propose_meal_top_up`) | (no words rule: offered off the app's own short-pool verdict) |

## One exercise (5)

| Action | On the screen too | Arrives as | His words must... |
|---|---|---|---|
| `ban_exercise` | yes | a card (`propose_exercise_ban`) | never off one occasion |
| `propose_exercise_add` | yes | a card (`propose_exercise_add`) | (no words rule: the card offers Just today or Whole block; he picks the scope) |
| `propose_exercise_remove` | yes | an instant save | (no words rule: the card offers Just today or Whole block; he picks the scope) |
| `propose_exercise_reorder` | yes | an instant save | (no words rule: one day's order; a superset moves together) |
| `propose_exercise_swap` | yes | a card (`propose_exercise_swap`) | (no words rule: the card offers Just today or Whole block; he picks the scope) |

## One day's session (9)

| Action | On the screen too | Arrives as | His words must... |
|---|---|---|---|
| `propose_cardio_session` | yes | a card (`propose_cardio_session`) | never off a maybe |
| `propose_missed_session` | yes | a card (`propose_missed_session`) | (no words rule: a past day only; offer-still-holds refuses a trained day) |
| `propose_rest_day` | yes | a card (`propose_rest_day`) | never when asked "from now on" |
| `propose_session_activity_swap` | yes | a card (`propose_session_activity_swap`) | never when asked "from now on"; never off a maybe |
| `propose_session_kind_today` | yes | a card (`propose_session_kind_today`) | never when asked "from now on" |
| `propose_session_length` | yes | a card (`propose_session_length`) | never off one occasion |
| `propose_session_move` | yes | a card (`propose_session_move`) | never when asked "from now on" |
| `propose_session_rebuild` | yes | a card (`propose_session_rebuild`) | never when asked "from now on" |
| `propose_session_shorten` | yes | a card (`propose_session_shorten`) | never when asked "from now on" |

## The whole plan (13)

| Action | On the screen too | Arrives as | His words must... |
|---|---|---|---|
| `propose_concurrent_activity` | yes | a card (`propose_concurrent_activity`) | never off one occasion; never off a maybe |
| `propose_equipment_adaptation` | yes | a card (`propose_equipment_adaptation`) | never when asked to hold or pause |
| `propose_goal_change` | yes | a card (`propose_goal_change`) | (no words rule: a goal is lasting by nature; "instead" is not an occasion) |
| `propose_injury_adaptation` | yes | a card (`propose_injury_adaptation`) | (no words rule: pain is triaged first (edit-reason); a sharp one changes nothing) |
| `propose_injury_as_lasting` | yes | a card (`propose_injury_as_lasting`) | never off one occasion |
| `propose_injury_recovered` | yes | a card (`propose_injury_recovered`) | (no words rule: ends a change he has; nothing new is added) |
| `propose_kit_change` | yes | a card (`propose_kit_change`) | never off one occasion |
| `propose_plan_pause` | yes | a card (`propose_plan_pause`) | (no words rule: a pause asked for or offered after a red flag; resume is one tap) |
| `propose_plan_restart` | yes | a card (`propose_plan_restart`) | (no words rule: offered only after a long break the app measured) |
| `propose_running_goal` | yes | a card (`propose_running_goal`) | never off one occasion |
| `propose_schedule_change` | yes | a card (`propose_schedule_change`) | never off one occasion |
| `propose_style_change` | yes | a card (`propose_style_change`) | never off one occasion |
| `propose_volume_change` | yes | a card (`propose_volume_change`) | never off one occasion |

## Logging what was done (11)

| Action | On the screen too | Arrives as | His words must... |
|---|---|---|---|
| `log_meal` | yes | a card (`propose_meal_log`) | (no words rule: a food that cannot be counted is asked about before any card) |
| `log_steps` | yes | an instant save | (no words rule: always a card, confirmed by his tap) |
| `log_water` | yes | an instant save | (no words rule: an amount in his words; Undo on the receipt) |
| `log_weight` | yes | a card (`propose_weigh_in`) | (no words rule: a surprising weigh-in is asked about first (weigh-in-check)) |
| `log_workout` | yes | an instant save | (no words rule: sets in his words; the exercise must be named or on today's log) |
| `log_workout_session` | yes | an instant save | (no words rule: a session he says he did; written with an Undo) |
| `log_workout_set` | yes | an instant save | (no words rule: sets in his words; odd reps are asked about once) |
| `move_logged_sets` | yes | an instant save | (no words rule: the sets come from today's own log; the exercise he did must be in his words) |
| `propose_cardio_log` | yes | a card (`propose_cardio_log`) | (no words rule: past-tense cardio in his words (message-evidence)) |
| `propose_cardio_remove` | yes | a card (`propose_cardio_remove`) | (no words rule: a log already made; the card names the log before Apply) |
| `propose_circuit_log` | yes | a card (`propose_circuit_log`) | (no words rule: built only from rounds, times and effort in his words (message-evidence)) |

## What the coach remembers (5)

| Action | On the screen too | Arrives as | His words must... |
|---|---|---|---|
| `record_context_fact` | yes | an instant save | (no words rule: his verbatim quote must be in his message) |
| `record_fact` | yes | an instant save | (no words rule: his verbatim quote must be in his message) |
| `record_goal` | yes | an instant save | (no words rule: his verbatim quote must be in his message) |
| `record_session_feel` | coach only | an instant save | (no words rule: his verbatim quote must be in his message) |
| `set_display_name` | yes | an instant save | (no words rule: his verbatim quote must be in his message) |

## The shopping list (4)

| Action | On the screen too | Arrives as | His words must... |
|---|---|---|---|
| `add_day_to_grocery_list` | yes | an instant save | (no words rule: an instruction, not a statement (imperative classifier)) |
| `add_to_grocery_list` | yes | an instant save | (no words rule: an instruction, not a statement (imperative classifier)) |
| `check_off_grocery_item` | yes | an instant save | (no words rule: an instruction, not a statement (imperative classifier)) |
| `remove_from_grocery_list` | yes | an instant save | (no words rule: an instruction, not a statement (imperative classifier)) |
