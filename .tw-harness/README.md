# Reveal-timing harness

`npm run verify:reveal`

Renders the real `TypewriterMarkdown` in Chromium and records, with a
MutationObserver, **when each word actually lands in the DOM** — the thing a
user sees, rather than the timer that was meant to cause it.

## Why

Ashley said the typewriter was "too slow and not smooth". Both were true and
they had *different* causes, which is why guessing would have fixed the wrong
one:

| | before | after |
|---|---|---|
| total reveal, 67-word reply | **8907ms** | **3681ms** |
| gap median | 110ms | 50ms |
| gap max | **491ms** | **133ms** |
| jitter (std dev) | **90ms** | **19ms** |
| gaps over 150ms | 4 | **0** |

The "slow" was the tick: 110ms per word. The "not smooth" was **not** timer
drift — min 110, median 110, p90 111, so the tick was rock steady. It was the
sentence-end pause: 380ms *on top of* the tick, four times a message. Steady,
steady, steady, stall.

## What it does not cover

Headless Chromium under no load has far more even timers than a phone
mid-scroll. So a steady median here means "this bench cannot see drift", not
"drift does not exist" — which is exactly why the fix moved to a frame loop
against an absolute clock rather than only retuning the numbers. That half is
protected by `test:reveal-timing`, not by this.

Same rooting rule as the other harnesses: the vite root is the REPO, or
Tailwind never scans `src/`.
