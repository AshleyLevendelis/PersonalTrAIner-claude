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

## The whole-flow walker (`npm run verify:onboarding-walk`)

Every onboarding bug found on 28–29 Aug was found by Ashley, on her phone, one
screenshot at a time: the composer naming the wrong question, "100, 150"
landing on lifts nobody named, a grouped card labelled with its first field, a
card that could not hold 5'10, "New Plan" restoring the answers it was supposed
to clear. Every one of them was reachable by anyone who opened the app. She
should not be the thing that finds them.

This walks all 27 questions at 390×844 with the real components and asks four
things of each: can it be answered, can every control be hit, is anything
leaking a placeholder value, does the page scroll sideways.

### The one thing to understand before reading a failure

"Can it be answered" is not the same question for every slot, and its first
version got this wrong — it demanded a rendered control from all 27 and
reported three false failures. `displayName`, `dislikedExercises` and
`dislikedFoods` are `control: 'text'`, and a text slot renders **no card by
design**: `ConversationalOnboarding` sets `slotCard: undefined` for it in four
places, because the control is the shared composer at the foot of the screen.

So the check is split by control, and the free-text half is aimed at what
actually breaks for those slots. The only thing telling a user which question
the composer is answering is its placeholder — which is the exact bug Ashley
photographed. A text slot with a blank or duplicated `inputHint` is therefore
the same defect as a chips slot with no chips: the question is on screen with
no working way to answer it.

Mutations proven to turn it red: blanking `displayName`'s hint (1 check),
pointing `dislikedFoods` at another slot's hint (1 check), and emptying
`fitnessGoal`'s options (1 check). Each bit only its own assertion.

## What happens when a turn comes back (`npm run verify:onboarding-turns`)

Everything above seeds a state and reads it. None of it can show what happens
when the coach REPLIES, because the sandbox cannot reach the model — so the
defects that only exist on a reply were found by a person on a phone (test
log, 9 Oct 2026): meal-count chips under "how old are you?", a re-asked
question whose chips stayed on the older message off screen, and a tap on the
summary whose prompt opened above the card.

`scripted.tsx` mounts the **real `ConversationalOnboarding`** and answers its
`fetch` to `onboarding-chat` from a queue the driver fills, in the edge
function's own `{ reply, actions }` shape. Everything after the reply lands is
the component's own code: validating `set_slot`, choosing which message hosts
the chips, moving a card, the summary, the edit rows, the ticks. An unscripted
request is counted and answered 500, so a forgotten turn is a failure, not a
pass.

`?state=` picks the fixture (`h14`, `m2`, `review`); `?state=keep` is a RELOAD
— the draft the last page saved is left alone. `ONLY=4,7` runs a subset of the
sections.

What it cannot tell you is whether the model sends those turns. The scripted
replies are the shapes the tracer measured or the prompt now asks for; whether
the deployed coach produces them needs `scripts/probe-onboarding-tone.mts` on
a machine that can reach it.

### `own-browser.mjs` — read this before copying an older driver

The older drivers here start Chromium on a fixed debug port with the default
profile and stop it with `chrome.kill()`. On a machine running other checks at
the same time that stalled repeatedly, in ways that looked exactly like the
page hanging and were not: a dead browser's children still holding the port, a
killed run's browser still alive on it, and — measured — the browser itself
ended from outside mid-run. `own-browser.mjs` takes the first port in its
range that REFUSES a connection, gives the browser a throwaway profile, kills
it as a process group, puts a deadline on every call, and treats a browser
that went away as "NOT A RESULT" and starts the run again (three attempts)
rather than reporting it as failures of the app. `verify:onboarding-turns`,
`verify:style-picker` and `verify:parked-question` use it.
