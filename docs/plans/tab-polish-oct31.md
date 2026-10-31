# Five-tab polish (design_handoff_tab_polish), 31 Oct 2026

Ashley uploaded the handoff (Home 2c, Nutrition 3a+3b, Exercise 2a, Tools 2a, Chat 2b) and, asked whether to build it
as drawn or keep her earlier rulings where they clash, said **"build, keep my rulings"**. Presentation and layout
only: no data rule changes, nothing the app can do is removed (her 17 Oct "nothing removed" and 30 Oct "Move things").

Design files: the handoff's `.dc.html` files and README (unpacked from her upload). Rendered pictures of each approved
option are the reference to compare against at 390px. The handoff's hex values are the default dark theme: map every
colour to the existing CSS tokens (`--primary`, `--primary-2`, `--glow-rgb`, `--hairline`, `--surface-raised`,
`--role-ai-*`, `--chart-*`, `--text-tertiary`, `--muted-foreground`…) so the other themes keep working.

## Shared, built first (on the branch before the tabs)
- Bottom nav: an 18×3 mint marker above the active tab's icon, label bold (`BottomTabBar.tsx`).
- The coach line: `TrainerNudge` with `line` (mint avatar, "TRAINER" label, no box, chips under it via `prompts`).

## Rulings kept where the design clashes (her "keep my rulings")
- **Name on screen**: "Trainer" / "Personal TrAIner", never "Coach" (10 Oct). The chat header keeps its 26 Sep form.
- **Streak**: "N in a row", never "days" (17 Oct; `STREAK_PILL_WORDS`).
- **No sleep ring**: the app records no sleep. Nothing is drawn that the app does not have.
- **Rings live on Home only** (17 Oct): Home keeps its four rings (calories, protein, water, steps), drawn in the
  design's ring-row style; steps logs from Home (her "Tap the steps ring"); water logs from Nutrition's water row.
  Nutrition's top card is the design's legend with per-macro bars (calories, protein, carbs, fat, water), no rings.
- **Nutrition's day strip stays on top** (17 Oct).
- **Chat bubbles**: yours plain (28 Sep), the coach's the soft tint (16 Oct), not the design's solid teal.
- **Coach offers are text + small buttons** (20 Oct): the design's bubble + one-line preview + reply pills fits it.
  Buttons keep the 44px tap floor.
- **No voice notes** until she answers that question.
- **Every change to an exercise lives in the ⋮ menu** (14 Sep); the plate calculator, which changes nothing, may sit in
  the weight box as drawn.
- **A box for every set, labelled** (17 Sep): the ramp-up rows stay loggable inside the folded ramp row.
- **"Last time" marker** on boxes filled from her last session (18 Sep) stays.
- **Every line the app writes is true that day** (CLAUDE.md): the Exercise coach line's "probe" wording only in a
  calibration week; otherwise sentences built from the plan's own numbers, never an invented judgement ("moved well").
- Home: the weight trend and weigh-in, the latest PR and the training volume stay one tap away (30 Oct "Move things").
- Nutrition: the planned-day line and its verdict (H24), the allergy line, Targets & plan settings, the resize and
  top-up offers, Regenerate all and "Log something else" all stay reachable.
- Tools: her 14 Sep ruling (no round card at rest, a list not tiles for the utilities) as the design already keeps.

## Per tab, the files
Home: `Dashboard.tsx`, `HomeWeekStrip.tsx`. Nutrition: `NutritionDisplay.tsx`, `MealPlan.tsx`, `nutrition/*`.
Exercise: `exercise/TodayPanel.tsx`, `exercise/WeekContextRow.tsx`, `exercise/ExerciseRow.tsx`, `exercise/SetGrid.tsx`
and neighbours. Tools: `ToolsTab.tsx`, `timers/*`, `PlateCalculator`. Chat: `ChatAssistant.tsx`, `chat/*`.

## Checks
Each tab: the gates that read its files (derived from the diff), the browser drivers for its screen, new checks for
the new layout (mutation-tested), and a 390px screenshot compared with the design. Then all five together.
