# Onboarding chip harness

`npx vite build --config .onb-harness/vite.config.ts && node .onb-harness/measure.mjs`

Renders the REAL `SlotChipsCard` for every question that has options, at 390px,
next to the same options as chat-style pills — and prints the heights.

## Why

Ashley said the onboarding options "sometimes come up and sometimes they don't",
and that when they did they were too big. The first half was readable in the
prompt. The second half was not: "too big" is not actionable until it is a
number. This produced them:

| question | all-cards (before) | now |
|---|---|---|
| main goal | 213px | 213px — still a card, correctly |
| cardio | 260px | 260px — still a card |
| training days | 308px | 96px |
| injuries | 308px | 96px |
| **dietary** | **771px** | **223px** |

771px of an 844px screen for one question, before the coach's message above it
or the keyboard below. That measurement is what turned "make them smaller" into
a rule with a defensible line in it — a card when the options carry a
description, pills when they do not.

## What it does not cover

No model, no conversation. `*.supabase.co` is unreachable from the sandbox, so
nothing here exercises whether the coach actually asks for the options on every
turn — which is the other half of Ashley's complaint and is still unmeasured.
This is layout only.

Same rooting lesson as `.tour-harness`: the vite root is the REPO, not this
folder, or Tailwind never scans `src/` and the components render unstyled.

## The composer harness (`npm run verify:composer`)

Added after Ashley photographed the composer describing a *different question*
than the one on screen. This one mounts the **real `ConversationalOnboarding`**
— not a replica — and reads `input.placeholder` in Chromium at 390px. Three
states, all reached by seeding the draft store, which is the same door a
resumed conversation comes through:

| on screen | before | after |
|---|---|---|
| the opener, asking for a name | `Tell me your goal…` | `Your name…` |
| a live chip card for training style | `Where are you at?` | `How do you like to train?` |
| card answered, nothing else pending | `Which days?` | `Which days?` |

The first row could never have been right: `displayName` is in
`NEVER_BLOCKING_SLOTS`, so it appears in neither open-slot list, so on the very
first question of the app the hint was **guaranteed** to name a different one.

No model here either — the states are seeded, not conversed into. What this
cannot tell you is whether the coach asks the question the card belongs to;
that is the deployed prompt's job.

One fixture of mine was wrong before the component was: the third case
originally left `fitnessGoal` unanswered and then expected "Which days?".
"Tell me your goal…" was the correct answer to the question the fixture
actually asked.
