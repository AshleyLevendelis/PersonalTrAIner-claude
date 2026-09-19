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
| `propose_custom_meal` | EXCEPTION | Coach-only. NARROWED 14 Sep 2026: the "no free-text entry" half of this reason is gone — the food search built for `propose_meal_food_add` could serve here too. What is left is the real reason: a custom meal is an open-ended list of foods AND a dish name AND a decision about what the rest of the day does around it, which is a screen someone has to design, not a control to bolt onto a row. |
| `propose_equipment_adaptation` | SCREEN | Profile → Equipment. |
| `propose_exercise_add` | SCREEN | The session's "Add an exercise" row. Both surfaces since 13 Sep 2026. |
| `propose_exercise_remove` | SCREEN | The exercise row's menu. Both surfaces ask why first since 15 Sep 2026, with the same four answers. |
| `propose_exercise_reorder` | SCREEN | The exercise row's menu. |
| `propose_exercise_swap` | SCREEN | "Swap exercise" on the row. Both surfaces ask why first since 15 Sep 2026 — a different four, because a swap and a removal have different reasons. |
| `propose_injury_adaptation` | SCREEN | Profile → Injuries. |
| `propose_injury_as_lasting` | SCREEN | Profile → Injuries. |
| `propose_injury_recovered` | SCREEN | Profile → Injuries. |
| `propose_meal_addition` | EXCEPTION | Coach-only. Asking for a dish BY NAME and having the app work out its ingredients is a model call, not a lookup — there is no list of dishes to search the way there is a list of foods. The screen offers the verified pool and "find more options" instead. |
| `propose_meal_food_add` | SCREEN | The meal row's "Add food" control, since 14 Sep 2026. The old exception said this needed free-text entry the screen does not have. That reason was too strong: the foods the app can cost are a KNOWN LIST, so the screen SEARCHES it — strictly more honest than free text, because a food that cannot be costed is never offered rather than typed and then refused. |
| `propose_meal_food_remove` | SCREEN | The food row's menu, since 12 Sep 2026. |
| `propose_meal_food_replace` | SCREEN | The food row's menu, since 12 Sep 2026. |
| `propose_meal_food_resize` | SCREEN | The food row's menu, since 12 Sep 2026. |
| favourite a meal | BOTH, since 19 Sep 2026 | The coach has written `favorite_meals` since July and the screen could not add to it — the coach knew your favourites and the Nutrition tab had no way to name one. A heart on the meal row now marks it, through the same `markFavourite` the coach calls, so the two cannot drift. A favourite survives a regenerate, like a meal asked for by name. |
| `propose_meal_move` | SCREEN | The meal row's Move control, since 14 Sep 2026. Same day only on BOTH surfaces alike: no screen renders another day's meals, so a cross-day move would change something nobody can see. |
| `propose_meal_refit` | SCREEN | Nutrition → the "Resize them" offer above the meal list, since 17 Sep 2026. Ashley's two rulings that day: tell her and offer to refit, and stay quiet until the drift is real. **The strongest parity row in this table, and by construction rather than by inspection**: App computes the verdict ONCE and hands the same object to the Nutrition tab and to the coach, and both confirm through one function. The coach cannot offer a resize the screen would not offer, cannot state a number the screen would not state, and cannot write by a different path — there is one answer and one write, read twice. |
| `propose_meal_swap` | SCREEN | The meal row's swap control. |
| `propose_missed_session` | SCREEN | The day menu → "What happened?". |
| `propose_rest_day` | SCREEN | The day menu → "What happened?". |
| `propose_schedule_change` | SCREEN | Profile → training days. |
| `propose_session_move` | SCREEN | The day menu → "What happened?". |
| `propose_cardio_session` | SCREEN | "Make this a cardio day" on the rest / recovery card, since 15 Sep 2026. Same executor as the coach confirm, so both write the rest of the block. |
| `propose_session_shorten` | SCREEN | The day menu, since 13 Sep 2026. |
| `propose_session_length` | SCREEN | Profile → "Session length". Both surfaces since 16 Sep 2026, and **both rebuild** — Ashley's ruling that day, from three options: rebuild the rest of the block around the new length, over trimming what is already there and over waiting for the next block. The screen half had to change too: `session_duration_preference` was not in `PLAN_INVALIDATING_FIELDS`, so setting it wrote the number and left every session at the old length. Distinct from `propose_session_shorten`, which is TODAY only — the time scope is the whole difference and both carry a figure in minutes. |
| `propose_session_rebuild` | SCREEN | The day menu, since 16 Sep 2026 — "Give me a different session". Ashley's ruling that day: the main lift is kept, everything else rebuilt around it. |
| `propose_style_change` | SCREEN | Profile → training style. |
| `propose_goal_change` | SCREEN | Profile → "Goal", first row of Training setup. Both surfaces since 17 Sep 2026, and until then it was on NEITHER — the last setup answer with no way to change it, when every piece of machinery for it already existed (`fitness_goal` was already in `PLAN_INVALIDATING_FIELDS`, `detectPlanInvalidation` already had the branch, `macro-calculator` already read the goal for the deficit). Nothing wrote the field. **Ashley's ruling that day, from three options: training AND food, from this week** — the block rebuilds AND the calorie and macro targets move, over asking about food separately and over waiting for the next block. It is the only tool here whose confirm also rebuilds the meals, and the only one whose card has a food line. Distinct from `propose_style_change`: goal is WHAT you train for, style is HOW. |
| `propose_volume_change` | SCREEN | The workout card's volume control. |
| `record_context_fact` | SCREEN | Profile → Memory. |
| `record_fact` | SCREEN | Profile → Memory. |
| `record_goal` | SCREEN | Profile → Goals. |
| `record_session_feel` | EXCEPTION | Coach-only by Ashley's ruling, 8 Sep 2026: how a session felt is asked in chat, not collected by a button. |
| `set_display_name` | SCREEN | Profile → Name. |
| `propose_session_activity_swap` | SCREEN | The day menu → "What happened?" → "I did something else instead". Both surfaces now ask before writing (Ashley, 15 Sep 2026); the coach's card and the sheet call the same writer. |

## Things the screen can do that the coach cannot

**Four screen-only, as of 17 Sep 2026** — the pre-session tightness check,
macro mode, macro split, and logging a build-up set. The calorie target below
is a fifth entry but a different kind: it is on NEITHER surface and cannot be,
because it is derived rather than set.

**THE COUNT IS RE-DERIVED FROM THE BULLETS, NEVER CARRIED FORWARD.** It has
been wrong twice — "None" while tightness shipped, then "One" while three more
sat listed underneath it. Both times somebody edited a bullet and left the
header alone. Count what is below before trusting what is here.

- **Saying something feels tight before a session.** Eight areas as taps on the
  Exercise screen; up to three mobility drills go into today's warm-up. There
  is no coach path. CORRECTED 15 Sep 2026: this section said "None, as of 14
  Sep 2026" and stayed saying it while the tightness feature shipped
  screen-only THE NEXT DAY — the doc's own closing instruction ("if a screen
  control is added without a coach path, it belongs here with a reason") was
  not followed by the person adding it, which was me.
  **The reason recorded in CLAUDE.md for having no coach path was wrong**, and
  is corrected there too: it said the answer "lives in a store the edge
  function cannot reach". The edge function reaches no store on this rail —
  every `propose_*` tool returns an intent and the BROWSER writes, and the
  coach is already inside that same store via `declareOffPlan`. The real
  obstacles are smaller and different: the answer can only ever be TODAY (the
  record is keyed to one date), a coach-set answer would silently open a
  session (`patchRecord` defaults `status: 'running'`), and the pain boundary
  is enforced only on the screen today.
  **`test:coach-parity` STRUCTURALLY CANNOT catch this class.** §1 derives its
  universe from tools DECLARED in the edge function, so a screen feature with
  no tool is invisible to it, and §4 only checks this section is non-empty —
  `**None,` satisfies it forever. That hole is named, not fixed.

**THE COUNT IN THIS SECTION WAS WRONG, and the hole named above is exactly
why.** Corrected 16 Sep 2026: it opened "One, as of 15 Sep 2026" and listed
only the pre-session tightness check, while CLAUDE.md's own must-have list had
said "Session length — `screen only`; targets and macro mode — `screen only`"
the whole time. Three more, in one file, contradicted by another file, and
`test:coach-parity` could not see any of them because none has a declared tool
to derive a row from. Two documents, one of them right, and the gate blind to
the difference.

- ~~**Session length.**~~ **CLOSED 16 Sep 2026** — it has a coach tool now and
  a row in the table above. It sat here for less than a day, which is the
  shortest an entry has lasted, and the note it carried is worth keeping: "the
  screen can do this" was itself only half true, because changing it had never
  rebuilt the plan. Closing it meant fixing the screen as well as adding the
  tool.
- **Macro mode** (Standard / Dynamic CSCS) and **macro split**. `screen only`.
  Both bypass the Profile screen's own writer and are applied from `App.tsx`
  with their own optimistic-apply and revert, so a coach path cannot simply
  reuse the profile-field executor.
- **Logging a build-up set.** `screen only`, added 17 Sep 2026 the same day the
  rows were built — written here BY the person adding it, which is the thing
  this section has twice failed at. Ashley's ruling that day gave every
  build-up step its own box in the grid; the coach's `log_workout_set` writes
  working sets and has no way to say a set was a warm-up. The reason it is not
  simply a parameter: the coach's own view of a session filters
  `is_warmup=eq.false`, so a coach that could WRITE a warm-up would immediately
  be unable to READ it back or correct it — a one-way door for the one surface
  whose whole job is conversation. Closing it means giving the coach the
  filtered-out half too, which is a bigger change than a flag.
- **Logging a DROP set.** `screen only`, added 19 Sep 2026 the day the rows
  were built, and written here by the person adding it rather than found later.
  It is the build-up entry above with one extra reason on top.
  The shared reason: the coach's `log_workout_set` writes a working set and has
  no way to say a row was a continuation of the one before it. The extra one is
  that a drop needs a PARENT — "I did a drop after squats" does not say after
  which set, so a coach path needs a clarification round-trip the screen gets
  for free by being tapped on the row itself.
  **What was closed instead, because it was the part that could do harm:** the
  coach's own "what did you last lift?" lookup took the most recent row by
  time, and a drop is logged immediately after its working set — so it would
  have won that query every time and had the coach answering "last time you did
  35kg" about a lift taken to 47.5, and resolving an unstated weight to the
  drop. That is the same class as the coach quoting a different weight from the
  plan, which this app has had once already. Held by `coach-plan-context` §7.
- **The calorie target itself.** On NEITHER surface, and not a gap that can be
  closed as written: there is no control because the number is derived by
  `computeTargets`, not stored as an intention. Changing "targets" means
  changing an input.
- ~~**The fitness goal.**~~ **CLOSED 17 Sep 2026** — a Goal row on Profile and
  `propose_goal_change` in chat, with a row in the table above. It had been on
  NEITHER surface while every piece of machinery for it existed, which is why
  it sat in this section rather than being caught by the gate.
  **AND THIS BULLET WAS LEFT STALE FOR A DAY BY THE PERSON WHO CLOSED IT** —
  me. I noticed it, said in the same message that I would fix it, and shipped
  without doing so; it went to `main` still claiming the goal was unreachable.
  That is the second time this file's own closing instruction has been ignored
  by whoever added the capability (the tightness entry, 15 Sep, was the first),
  and it is the same root cause both times: **nothing in the sweep reads this
  section**, so only the author's memory keeps it true. Noticing the rule is
  not following it.

Banning an exercise was the previous entry and closed 14 Sep 2026. This
section exists so the answer stays written down rather than
recounted from scratch each time; if a screen control is added without a coach
path, it belongs here with a reason.

## Deliberately on neither surface

- **Moving a meal to another DAY.** CORRECTED 14 Sep 2026: this bullet said "to
  another day or slot" and the slot half was already wrong when it was written
  — the row above records `propose_meal_move` as SCREEN the same day, and the
  coaching question it cited (refuse / refit / rescale) was answered by Ashley
  on 13 Sep ("resize it to fit") and again on 14 Sep ("they swap places"). What
  is genuinely on neither surface is the cross-DAY move, and for a different
  reason: no screen renders another day's meals, so the destination is
  somewhere she cannot see, check or undo by looking. It needs a future-day
  meal view first.
- **Rebuilding today's session from scratch.** Nothing regenerates below a whole
  week, and a rebuilt day loses the progression thread on the main lift — also
  a coaching call.
