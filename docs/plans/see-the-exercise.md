# Seeing the exercise — Ashley's ruling, 5 Sep 2026

## Context

Ashley, with two reference screenshots: *"we need to be able to demonstrate how
to do an exercise in the app. currently the app can give you form cues or
generate a YouTube link which is great but users should also be able to see in
the app similarly to the images attached."* One image showed a video
demonstration; the other showed an exercise screen with Summary / History /
How to tabs, an anatomical figure with the working muscles highlighted, and a
progress chart.

**She had asked once before, and only half of it was built.** Her earlier words
are preserved verbatim in `ExerciseDetailDialog.tsx` and again in
`test-exercise-detail.ts`: *"I want there to be exercise demonstrations in the
app and form cues, currently the chat can link to a YouTube video but there's
nowhere in the app to see an exercise."* The form-cue half shipped as the "How
to do it" panel. The demonstrations half was never started, and no document
anywhere recorded a decision to drop it — so it was not a rejected idea, it was
a dropped one.

Where the app started from: **no image or video anywhere** (the only files in
`public/` are launcher icons), **no media field** on any catalogue entry, and a
service worker that by design never caches cross-origin content — so anything
hosted elsewhere is blank on a gym floor with no signal. That last point is the
objection `BACKLOG.md` already recorded against the existing YouTube link:
*"leaves the app and needs signal in a gym."*

Put to her as one question with four options. **She chose: a muscle map on
every exercise, plus a video on the ones we have checked.**

## What was built

**One screen, three tabs** (`ExerciseDetailDialog.tsx`). Her second reference
was mostly already built and split in two: cues in one dialog, chart / PRs /
sessions in another (`ExerciseHistoryDialog`), reached from two menu items that
knew nothing about each other. Merged into one dialog with Summary · History ·
How to; `ExerciseHistoryDialog.tsx` deleted, its content absorbed unchanged.
Both menu items survive and open the same dialog at the tab they name.

**The program view gained technique**, reversing a pinned decision. The gate
used to assert the program view offered history and *not* technique, because it
had no detail dialog wired and "a menu item that opens nothing is worse than an
absent one". That reason expired at the merge: one dialog now serves both, the
program view already opened it for history, so withholding the technique item
would have hidden a tab the user could already reach — on the one screen where
you browse lifts you have not yet performed.

**The muscle map** (`MuscleMap.tsx`, `muscle-map.ts`). Hand-rolled inline SVG,
no dependency and no asset file, following `ExerciseStrengthChart`'s own
precedent ("no charting library… for one chart"). Drawn in the bundle, so it
works with no signal.

Coverage was measured before building, not assumed: of 199 live exercises,
**198 paint and 1 does not** — Burpees, whose muscles are "cardiovascular
system, full body", which is true and is not a place on a drawing. It gets a
sentence instead of an unlit body, because an unlit body reads as a rendering
failure. Zero of the 62 distinct muscle spellings in the catalogue are
unrecognised, and the gate has no budget for one appearing.

**The video** (`demo_video_id`, `demo_video_credit`). A bare YouTube id rather
than a URL, so the field cannot carry another host. The **Watch demonstration**
button renders only where an id is set; no id, no control at all. The player
embeds `youtube-nocookie.com`, and says plainly that it needs a connection and
that the cues and the map do not.

**Seeded with nothing, deliberately.** A video teaches a lift correctly or it
teaches someone to hurt themselves, and I cannot watch one. Under VISION.md's
"never claim a capability it doesn't have", putting the app's name to coaching
nobody checked would be exactly that. The mechanism and its gates are built;
every id added means a person watched it through. The gate asserts the ids are
well-formed and the button conditional, and deliberately requires **no minimum
count** — demanding a number would be pressure to add a video nobody had seen.

## Deliberate deviations from the reference images

- **Mint, not red, for the working muscles.** Red already means danger on this
  exact panel — "Avoid with" renders contraindicated joints in
  `--role-warn-text`. Lighting the muscles you are about to train in the colour
  that elsewhere means "don't" would collide. Flagged for Ashley to overrule.
- **Static, not animated.** Per-exercise animation means 200 distinct
  movements, which is the licensed-library option she did not choose. Nothing
  moves, so there is nothing for `prefers-reduced-motion` to suppress.
- **No chart selectors.** The reference offers four (Heaviest Weight / One Rep
  Max / Best Set Volume / Session Volume). The app derives one trend, top-set
  e1RM. Four selectors over one computed value is the "only offer what's built"
  failure. Left in BACKLOG as a candidate.
- **No "Primary: <muscle>" line**, though the reference has one and the first
  draft copied it. Caught by looking at the rendered screen: the catalogue has
  one muscle field and no secondary, so every name in `primary_muscles` is
  primary, and labelling the first one "Primary" invents a ranking the data
  does not hold. Harmless-looking on Deadlifts, nonsense on Burpees ("Primary:
  Cardiovascular system"). Removed; the map's caption lists them all.

## The honest limits, stated on the screen

The map shows what a lift trains, not how to perform it. A borrowed video is
someone else's coaching. The line that shipped with the cues carries more
weight now, not less, and survived the rebuild verbatim: *"These are reminders,
not coaching. If a movement is new to you, start light and get eyes on it.
Anything that hurts is a reason to stop, not to push."*

## Verification

`tsc`, `npm run build`, and the gate sweep — `test:exercise-demo` (new),
`test:exercise-detail` (re-anchored), `test:exercise-history`, `test:a11y`,
`test:muscle-balance`, `test:one-day-one-look`, `test:no-dead-code`,
`test:bundle`. Bundle grew 869 → 876 kB, well under the 950 kB budget.

Rendered at phone width through `npm run render:screens`, which photographs the
REAL panel: the dialog body was split into `ExerciseDetailPanel` precisely so
the harness would not need a hand-copied replica, which that harness's own
header records as the way screens quietly stop being of the app. Four screens
added: Summary, How to, empty History, and the nothing-to-paint case.

**Not provable from the sandbox:** tapping a tab, and a video actually playing.
Both need a browser and a live profile.

**Seven mutations, each confirmed to apply.** One is worth recording: adding a
twelfth group to `MUSCLE_GROUPS` — the denominator for weekly per-muscle volume
— left **`test:muscle-balance` green**. Only the new gate catches it. The
display vocabulary is kept in `muscle-map.ts` and never touches the measurement
one for exactly this reason.
