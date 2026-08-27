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
