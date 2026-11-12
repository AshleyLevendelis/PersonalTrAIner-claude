# Handoff: Exercise tab — today, logging a set, and the week view

Approved by Ashley on 12 Nov 2026 in the design project (page *Exercise Week*). **Exercise tab only.** It's the companion to `design_handoff_nutrition_week`: same visual language, same row style, same week view.

Build exactly the three screens in `Exercise Week.dc.html`:

| Id | Screen | What it is |
|---|---|---|
| **X1** | Today, not started | Just the day's workout: strip, Today card, exercises as set-bar rows |
| **X1b** | Today, mid-session | One exercise opened into its sets for logging |
| **XW3** | Week view | Every day of the training week on one screen, shown **only** when the `Week` pill is tapped |

Open the file in a browser with `support.js` beside it. It's a **design reference built in HTML**, not production code. Recreate it in the existing React + Tailwind code using the app's tokens, lucide icons and theme system, so all nine themes keep working. The hex values below are the default dark theme as drawn.

**Fidelity: high** for layout, sizes and copy. All sessions, weights, set counts and dates are **sample data**; every real value comes from the existing plan, logs and readers (see "Data: nothing new").

---

## His decisions, 12 Nov 2026 (record them in CLAUDE.md and BACKLOG)

- Exercise follows the new Nutrition style, screen for screen.
- **No rings on the Today card.** He removed them: "remove the ring and the three lines of text here and leave the rest". The Today card is the kicker, the time, the session name and Start session.
- **The week list appears only when you ask for it:** "this should be only when you select to view the week, otherwise show just the day's workout". X1 never shows the week list.
- He chose XW3 for the weeks ahead ("I like this way of seeing the upcoming week's sessions"). XW1 (a separate tapped-day card) was **not** chosen. Tapping a day in the strip keeps today's behaviour (the existing peek of that day), with the rows restyled as below.

---

## Shared tokens (default dark theme)

- **Page and cards:** page `#1A1636`, card `#221C48`, hairline `rgba(245,243,255,.10)`.
- **Hero card:** `#221C48` with `radial-gradient(120% 90% at 100% 0%, rgba(91,233,194,.20), transparent 55%)`, border `1px rgba(91,233,194,.30)`, radius 24, padding 20.
- **Ink:** `#F5F3FF`, secondary `#C2BCE8`, muted `#9A93C9`.
- **Accent colours:**
  - Mint `#5BE9C2`: lifting, working sets, done, now.
  - Violet `#B4A9FF` (track `#8B7BFF`): warm-up sets and active recovery. His 4 Nov ruling: active recovery wears the rest day's violet.
  - Blue `#6FB7FF`: the weight swatch.
  - Rest: grey moon icon.
- **Type:** Space Grotesk; numbers in `ui-monospace` where noted.
- **Tap targets:** at least 44 × 44.
- **Swatches:** every number on a row has an 8 px square swatch, radius 3, in front of it, the same rule as Nutrition's macros and calories.

---

## The exercise row (used on X1, X1b and inside XW3)

The Exercise version of Nutrition's M2 meal row:

1. **Top line:**
   - On the left, the existing status circle or tick (X1 and X1b; none on browse/future days).
   - Then the tag (10.5 uppercase): `Main lift` in mint, `Warm-up move`, `Superset A1`, etc.; none for plain accessories.
   - Then the name, 15.5/600.
   - **On the right, the load:** a blue swatch plus the weight in mono 17/700 with its unit (`37.5 kg`), and the qualifier underneath in 10 px uppercase (`each hand`, `one side`). For a bodyweight move it shows `BW` with `bodyweight` underneath. A number never reaches the screen without its unit, and per-hand or per-side loads keep the existing load-display wording.
2. **Set bar:**
   - One rounded 8 px segment per set, with a 3 px gap.
   - Warm-up sets first, in violet, then a 6 px space, then working sets.
   - Working segments are dim mint `rgba(91,233,194,.25)` until logged and solid mint once logged.
   - This is the existing ramp/working-track colour pair (`--working-track-done` / `--working-track-pending`).
3. **Legend line:**
   - A violet swatch and `2 warm-up` (only when the exercise has warm-ups).
   - A mint swatch and `3 × 11–13 working`; a warm-up move shows `2 × 8 easy` instead.
   - Numbers 14/700 white, words 13 `#C2BCE8`.
4. **Keep every existing control:**
   - The ⋮ menu holding swap, move, remove and ban. His 14 Sep ruling is "all of them behind the ⋮".
   - The plate calculator on the row.
   - "Why this exercise / weight".
   - The superset grouping.

## X1 — Today (not started)

- **Header:**
  - Kicker `Week 2 of 16 · B1`, title `Exercise`.
  - On the right, two pills: `Program ›` (the existing Program screen, unchanged) and **`Week ▾`** (opens XW3).
- **Day strip:**
  - Seven days, Monday to Sunday, using his 15 Oct ruling that every "this week" count runs Monday to Sunday.
  - Today is outlined mint, a done day has a mint tick, a session day has a dot, and a rest day has a dash. His 1 Nov "Dash on both" ruling holds.
- **Today card:**
  - Kicker `Today · Wednesday`, with a clock icon and `~48 min` on the right.
  - Session name 28/700, the last word mint with glow.
  - The mint `Start session` button.
  - Nothing else: no rings, no counts.
- **Below the card:**
  - `TODAY'S EXERCISES`, then the exercise rows.
  - Then the existing warm-up row, finisher, `Add exercise` and `I also did…`, unchanged.
- **Done and rest days** keep their existing cards (session summary, `RestDayCard`), restyled only where they meet these tokens.

## X1b — Today, mid-session (logging)

- **Today card, in progress:**
  - Kicker `Today · in progress`, with `4 of 18 sets` on the right, using the existing sets-done count (working sets only, his 1 Nov "Sets done" ruling).
  - The session name.
  - A 4 px mint progress bar.
- **Finished exercises** collapse to ticked rows with full set bars. **Later exercises** wait below as normal rows.
- **The open exercise** is a card with radius 20 and a mint border at `.40`:
  - **Header:** `Now`, the name 17/700, `3 × 11–13 · rest 75s`, the blue-swatched load on the right, and the set bar.
  - **Warm-ups folded into one 44 px row:**
    - A violet tick, `WARM-UP 2 of 2 done · not counted`, and a chevron.
    - Tapping it opens the labelled warm-up boxes (Warm-up 1, 2…) with the existing **`Log all N warm-ups`** button. These are his 17 Sep "a box for every set" and 2 Nov "one tap for all" rulings.
    - Default: open until the warm-ups are done, then collapsed. This matches the approved 2a handoff.
  - **Set rows,** in a grid of `28px | 1fr | 72px | 44px`:
    - The set number.
    - A weight box (mono 17/700, `kg`, with the plate button inside it).
    - A reps box.
    - A 44 × 44 tick, mint filled once logged.
  - **"Last time" numbers:** a set's own last-time numbers show in grey with the existing **"last time"** marker (his 18 Sep ruling), so one tap logs them as written. Use the marker and phrasebook the app already has (`lastTime` in `coach-voice`); the caption in the mock is illustrative.
  - **Rest timer:** ticking a working set puts the existing inline rest timer directly under that set (`REST 0:52`, `−15`, `+15`, `Skip`). Use the existing session-dock rest engine; don't create a second timer.
- **Keep the running `Log set N · …` button** (his 10 Oct ruling) and `Finish session`, unchanged.

## XW3 — Week view (only when `Week` is tapped)

- **Opening and closing:** the `Week ▾` pill opens it. The pill reads **`Week ▴`** here and closes it, returning to X1. `Program ›` stays.
- **Header:** kicker is the training week's date range (`14 – 20 September`), title `Exercise`.
- **Under the header:** `2 of 5 sessions done` on the left and `B1 · Building a base` on the right. The count uses the existing week reader (Monday to Sunday, `readTrainingWeeks`, where a walk or planned activity is a session, `dayHasSession`); the phase uses the existing short phase label.
- **One row per day,** Monday to Sunday:
  - **Session day:** min 64 px, radius 18, fill `rgba(245,243,255,.04)`.
    - A 44 px ring with an icon inside (dumbbell for lifting, a walking figure for active recovery). The ring is **full and shows a tick when the session is done**, and empty otherwise.
    - The title: `Mon 14 · Squat & Carry`, or `Today · …` in mint.
    - A second line with the main lift and its weight (`Barbell Squats · 47.5 kg`).
    - On the right, a swatch plus the minutes (mono 14/700, `min`).
    - Then `Done` in mint, or a chevron.
  - **Today's row** has a mint tint and border.
  - **Rest day:** a quiet 48 px line with a moon icon, `Thu 17 · Rest day`.
  - **Swapped or missed days** keep their existing labels from the day verbs (moved, missed, swapped to an activity), which this design doesn't change.
- **Tap a session row to open it in place.** Only one day is open at a time. The open day:
  - Gets a violet border.
  - Its header shows `17 sets · Front Squat 37.5 kg`.
  - Lists its first three exercises as exercise rows, then `N more exercises ›`, which opens that day's existing read-only day view.
  - Future days are read-only, as browse is today. Their ⋮ menu keeps whatever browse allows now.

---

## Data: nothing new

Everything shown already exists. This is **presentation only**:

- **Today and the week:** today's session and the training week (`useTrainingWeek`, `readTrainingWeeks`, `dayHasSession`).
- **Sessions and loads:** the stored `MesocycleWeek` rows (sets, reps, loads, warm-ups, supersets, minutes).
- **Logging:** the existing `SetGrid` logging, last-time and rest engine.
- **Phase:** the existing phase label.

No new action is added, so coach/screen parity is unaffected. If the coach's description of the Exercise tab mentions the old strip or layout, update it so it never describes a control that isn't there (`test:chat-app-reality`).

## Gates (per CLAUDE.md)

**Likely to need deliberate updates, never silencing:**
- `test:exercise-2a`, `test:exercise-layout`
- `verify:warmup-rows`, `verify:warmups-one-tap`, `verify:ramp-readonly`, `verify:one-number`
- `test:home-week-strip`, `verify:missed-day`
- `test:one-page`, `verify:one-page`
- `verify:session-edit` (the ⋮ menu)
- `test:tab-ownership`, `test:app-tour`, `verify:tour-real` (the tour's `data-tour` keys on the Exercise tab must stay attached)
- `verify:tap-targets`
- `test:chat-app-reality`

**New: a `verify:` driver for X1, X1b and XW3** at 390 × 844, with every check **mutation-tested**. It should check that:
- X1 shows no week list;
- `Week` opens XW3 and closes it again;
- only one XW3 day is open at a time;
- a done day's ring is full;
- the set bar has one segment per set, with logged working sets filled;
- ticking a set puts the rest timer under that set;
- every load on screen carries its unit;
- the ⋮ menu is still on every row that had one.

## Files

- `Exercise Week.dc.html`: X1, X1b and XW3.
- `support.js`: the runtime needed to open it.
- `README.md`: this file.
