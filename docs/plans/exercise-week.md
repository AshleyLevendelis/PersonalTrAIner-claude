# Exercise Week: the Exercise tab in the Nutrition style

His handoff, approved 12 Nov 2026: `docs/design/design_handoff_exercise_week/` (README and `Exercise Week.dc.html`).
Three screens: **X1** today, **X1b** logging a set, **XW3** the week view. Presentation only: no new data, action or
coach tool, so coach/screen parity is unchanged.

## His rulings (recorded in CLAUDE.md and BACKLOG)

- Exercise follows the new Nutrition style, screen for screen.
- No rings on the Today card: "remove the ring and the three lines of text here and leave the rest".
- The week list only when asked: "this should be only when you select to view the week, otherwise show just the
  day's workout".
- XW3 for the weeks ahead ("I like this way of seeing the upcoming week's sessions"); XW1 not chosen, so tapping a day
  in the strip keeps the existing peek.

## What was built

- **Header** (`WeekContextRow`): kicker, `Exercise`, `Program ›` and a new `Week ▾/▴` pill, the ⋯ menu kept. Week mode
  swaps the kicker for the week's dates and the strip for "N of M sessions done · B1 · <phase>".
- **Strip**: Monday to Sunday, day name over date over mark: a tick for a done day, a mint dot for a session to come,
  the warning dot for a missed day, the dash for a rest day (his 1 Nov "Dash on both" holds). Today outlined mint.
- **Today card** (`TodayPanel`): kicker, time, name, Start. Running: "Today · in progress", "4 of 18 sets" (the one
  shared count) and a 4px bar. Finished and reconnecting states unchanged. The shortfall note stays under the name.
- **Exercise rows** (`ExerciseLine`, `ExerciseRow`, new `ExerciseBar`): tag over the name, load on the right with a blue
  swatch, value, unit and qualifier (from the plan's own string, `exerciseLoadBadge`), the set bar (one segment per
  set, warm-ups violet then working mint, filled as logged), and the legend (warm-up count, dose, "working" or "easy",
  then the tempo). Every row keeps its ⋮.
- **Open card** (`SetGrid` on the card): "Warm-up" fold with "Log all N warm-ups", the `28 | 1fr | 72 | 44` grid, the
  plate button inside the weight box with its "kg", a reps box with "reps", a 44px tick. Last-time marker, inline rest
  under the logged set, "Log set N" and Finish unchanged.
- **Week view** (new `ExerciseWeekView`): one row per day from `useTrainingWeek` (the strip's own week), a 44px ring
  (full with a tick when done; violet for active recovery), title, main lift and weight, minutes, Done or chevron; rest
  days one quiet line; moved, missed and swapped days keep the day verbs' labels. One day open at a time; an open day
  is drawn by the shared read-only day list (`ReadOnlyDayList`, new `limit`), first whole groups only, with
  "N more exercises ›" to the existing peek.

## Changed from the design, and why

- The ⋯ day menu stays beside the pills (it holds What happened? and Session history; nothing else reaches them).
- The week notes line and its chevron stay, under the strip (his 3 Sep "the notes section doesn't populate").
- The real phase name is shown ("Anatomical adaptation"); "Building a base" is the mock's sample.
- Estimated loads keep their "~" (the plan's own string says it is an estimate).
- The open card has no status circle (the design has none); closed rows keep theirs.
- Warm-up rows stay labelled R1, R2 (the 28px column; the fold says "Warm-up").
- A finished row keeps its legend rather than a "✓ logged" summary (the bar and circle say done).
- The week view's open day uses the shared read-only list, so its rows carry section labels and the ⋮ (swap, ban)
  rather than eyebrows: one way to draw a day (`test:one-day-one-look`).
- The Today card's time keeps "+ N optional" when a day has optional mobility.
- The "Exercises · N of M done" heading stays (the design says "Today's exercises").

## Checks

- New: `verify:exercise-week` (X1, XW3, X1b and a finished day at 390x844), `test:exercise-week` (load wording, set
  bar, legend, week rows, whole groups).
- Re-anchored deliberately (same property, new place): `test:added-load`, `test:load-display`, `test:day-length`,
  `test:session-shortfall`, `test:one-day-one-look`, `test:one-today`, `test:exercise-2a`, `test:exercise-layout`,
  `test:exercise-today`, `test:home-week-strip`, `test:one-page`, `test:tab-ownership`.
- Copy: the app tour's Exercise stop and the coach's map of the tab now describe the Week view.
