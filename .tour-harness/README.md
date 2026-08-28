# Tour harness — the tour, driven in a real browser

`npm run verify:tour`

## Why this exists

`AppTour` is almost entirely effects: it measures elements, cuts a hole in a
scrim, waits for a real tap, and advances on DOM changes. **None of that is
reachable by the other gates.** `test:app-tour` checks the wiring is present
and the strings line up; `render:screens` uses `renderToStaticMarkup`, so
effects never fire at all. Between them, a tour that compiles, passes every
gate, and does nothing on a phone was entirely possible.

It earned its place immediately — the first run found two real defects that
every static check had passed:

1. **A logged set was mistaken for a rest day.** The tour detects "the set
   saved" by the `data-tour="setrow"` attribute disappearing, and detected
   "today is a rest day" by *the same absence*. Logging the set therefore
   skipped the stop the user had just completed, and renumbered the tour to
   "of 9" behind them.
2. **A fixed target was scrolled to.** `bringIntoView` tried to bring the tab
   bar to 130px from the top. Being fixed, it did not move — the whole page
   scrolled 650px underneath it instead.

A third finding was the harness's own fault and is worth recording, because it
looked exactly like a real bug: with the vite root set to this folder, Tailwind
never scanned `src/`, so `inset-0` and `z-[60]` were missing from the bundle
and the overlay rendered unpositioned. **A harness has to be built the way the
app is or its verdict is about the harness.** The config roots at the repo for
that reason.

## What it does not cover

No Supabase, no real profile, no real plan. The targets are stubs carrying the
real `data-tour` keys, so this proves the tour's *behaviour* — measuring,
gating, blocking, persistence, resume, finish — not that the keys are attached
to the right things in the real screens. `test:app-tour` covers that half, and
neither replaces a look on Ashley's phone.

Uses the pre-installed Chromium over CDP with Node's built-in WebSocket, so it
adds no dependency to the project.

## Walking the screens (`npm run verify:screens`)

The same real components, without the tour: Dashboard, Nutrition, Exercise and
Tools at 390×844 with **effects running**, plus a full-page screenshot of each
in `screen-*.png`.

`render:screens` renders the real components too, but through
`renderToStaticMarkup` — its own header says so — which means `useEffect`
never fires and every component is frozen in its initial state. Anything that
appears only after data loads is invisible to it. That is most of what a user
looks at.

**Hard checks** (no defensible design produces these): sideways scroll, an
element past the right edge, a leaked `NaN`/`undefined`/`[object Object]`, and
anything still saying "Loading" once things settle.

**Observations**, printed and never failed: one- or two-character labels, tap
targets under 40px, text under 11px. The first version of this file FAILED on
all three, and every single hit was deliberate design — "ml" and "kg" are
units, "M T W T F S S" is the week strip, "BW" is the bodyweight badge, and
9–10px is the micro-label scale. A check that cries wolf every run gets muted
within a week, which costs more than it ever catches. They are here to be read
next to the screenshot, not to gate a commit.

### What it found on its first walk

**Half the load numbers in a plan are per-hand, and nothing says so.**
`ExerciseLine.tsx` renders `· ${ex.suggested_load_kg}kg` for every exercise,
but `loadingMode()` checks `equipment.includes('dumbbells')` FIRST, so any
dumbbell-capable movement is priced PER HAND. Measured across
full_gym/home_gym/minimalist × beginner/intermediate/advanced:
**1126 of 2356 prescriptions (47.8%)** show a per-hand number in the same bare
format as a total one.

    Barbell Squats       · 42.5kg     42.5kg total
    Romanian Deadlifts   · 14kg       14kg PER HAND — 28kg total
    Walking Lunges       ·  8kg        8kg PER HAND — 16kg total

Sitting in one list, a reader takes the RDL for a third of the squat when it is
two-thirds. `LoadChip` already knows how to say "per hand"; the collapsed line
does not use it.

Recorded, not fixed: load prescription gets a plan before a build.
