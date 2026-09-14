# What the coach can do, what the screen can do, and where they differ

Ashley's second promise: *"everything that can be done within the app is able to
be done by the user or by asking the ai chat."* This file is the written record
that promise is checked against — CLAUDE.md's rule 4 says parity is checked both
ways *against the written exceptions list once it exists*, and that **until it
exists, every one-sided capability counts as a gap**. This is that list.

`test:coach-parity` reads this file. A coach tool that is not in the table below
fails the check, so a new tool cannot be added without someone deciding what its
screen counterpart is. A row claiming a tool that does not exist fails too.

**Measured 14 Sep 2026.** Method: the tool list is read from
`supabase/functions/chat-gemini/index.ts`; each screen counterpart was found by
following the control that performs the same change. Marks are facts about that
day, not promises — re-measure before relying on one, and correct it here when
it is wrong.

## Every coach tool, and the control that does the same thing

`SCREEN` = a control exists that makes the same change.
`EXCEPTION` = deliberately coach-only, with the reason on the row.

| Tool | Screen counterpart | Notes |
|---|---|---|
| `add_to_grocery_list` | SCREEN | Tools → Grocery list, the add row. |
| `ban_exercise` | SCREEN | The exercise row's menu. Wired to chat 14 Sep 2026; it was the last screen-only capability. |
| `check_off_grocery_item` | SCREEN | Tapping an item on the grocery list. |
| `log_meal` | SCREEN | Nutrition → the meal's log control. |
| `log_steps` | SCREEN | Home → Today so far. |
| `log_water` | SCREEN | Home → Today so far. |
| `log_weight` | SCREEN | Home → the weigh-in row. |
| `log_workout` | SCREEN | Exercise → the set grid. |
| `log_workout_session` | SCREEN | Exercise → finish session. |
| `log_workout_set` | SCREEN | Exercise → the set grid's tick. |
| `propose_concurrent_activity` | SCREEN | Profile → other sports. |
| `propose_custom_meal` | EXCEPTION | Coach-only. Building a meal from what is in the fridge is a conversation — the screen has no free-text food entry, and adding one is a design question, not a wiring one. |
| `propose_equipment_adaptation` | SCREEN | Profile → Equipment. |
| `propose_exercise_add` | SCREEN | The session's "Add an exercise" row. Both surfaces since 13 Sep 2026. |
| `propose_exercise_remove` | SCREEN | The exercise row's menu. |
| `propose_exercise_reorder` | SCREEN | The exercise row's menu. |
| `propose_exercise_swap` | SCREEN | "Swap exercise" on the row. |
| `propose_injury_adaptation` | SCREEN | Profile → Injuries. |
| `propose_injury_as_lasting` | SCREEN | Profile → Injuries. |
| `propose_injury_recovered` | SCREEN | Profile → Injuries. |
| `propose_meal_addition` | EXCEPTION | Coach-only. Asking for a dish by name and having it re-portioned to the slot's targets needs a name and a description; the screen offers the verified pool instead. |
| `propose_meal_food_add` | EXCEPTION | Coach-only. Same reason as `propose_custom_meal` — there is no free-text food entry on the screen. The three food EDIT tools below are on the row menu; only ADDING a food is not. |
| `propose_meal_food_remove` | SCREEN | The food row's menu, since 12 Sep 2026. |
| `propose_meal_food_replace` | SCREEN | The food row's menu, since 12 Sep 2026. |
| `propose_meal_food_resize` | SCREEN | The food row's menu, since 12 Sep 2026. |
| `propose_meal_swap` | SCREEN | The meal row's swap control. |
| `propose_missed_session` | SCREEN | The day menu → "What happened?". |
| `propose_rest_day` | SCREEN | The day menu → "What happened?". |
| `propose_schedule_change` | SCREEN | Profile → training days. |
| `propose_session_move` | SCREEN | The day menu → "What happened?". |
| `propose_session_shorten` | SCREEN | The day menu, since 13 Sep 2026. |
| `propose_style_change` | SCREEN | Profile → training style. |
| `propose_volume_change` | SCREEN | The workout card's volume control. |
| `record_context_fact` | SCREEN | Profile → Memory. |
| `record_fact` | SCREEN | Profile → Memory. |
| `record_goal` | SCREEN | Profile → Goals. |
| `record_session_feel` | EXCEPTION | Coach-only by Ashley's ruling, 8 Sep 2026: how a session felt is asked in chat, not collected by a button. |
| `set_display_name` | SCREEN | Profile → Name. |
| `swap_session_for_activity` | SCREEN | The day menu → "What happened?". |

## Things the screen can do that the coach cannot

**None, as of 14 Sep 2026.** Banning an exercise was the last one and closed
that day. This section exists so the answer stays written down rather than
recounted from scratch each time; if a screen control is added without a coach
path, it belongs here with a reason.

## Deliberately on neither surface

- **Moving a meal to another day or slot.** A dinner dropped into a breakfast
  slot does not fit breakfast's budget, and whether the app should refuse,
  refit or rescale is a coaching decision, not a wiring one. Named in CLAUDE.md
  as Ashley's call and still open.
- **Rebuilding today's session from scratch.** Nothing regenerates below a whole
  week, and a rebuilt day loses the progression thread on the main lift — also
  a coaching call.
