# The coach's own words — what the app says when the model isn't speaking

Measured 15 Sep 2026, before a single sentence was changed. This is Stage A of
the voice work: **a measurement, not a rewrite.** Nothing here was fixed on the
way past.

## Why this exists

CLAUDE.md's Promise 3 carries **"One voice, every time — tone probes only;
`UNGUARDED`"**. That tag is accurate and understated, for a reason that only
shows up when you look at where the coach's sentences actually come from.

A large share of what a person reads as "the coach" is not the model. Every
proposal card lead, every receipt title, every refusal, every cost line, every
floor is a string in this repo. **Nothing measures those at all**, and the
things that *do* measure voice cannot run here:

| | measures | runs in a cloud session? |
|---|---|---|
| `scripts/probe-coach-tone.mts` | the model's voice | **no** — posts to the deployed `chat-gemini` |
| `scripts/probe-onboarding-tone.mts` | the model's voice | **no** — same, and costs money per run |
| `scripts/compare-tone.mts` (`tone:compare`) | two probe transcripts | yes, but only if a probe produced them |
| `docs/coach-exam-rubric.md` | the **advice**, not the voice | judge needs `ANTHROPIC_API_KEY` |
| *(nothing)* | **the app's own sentences** | — |

`.env.local` in this container says in its own header: *"LOCAL, GITIGNORED,
HARNESS-ONLY. Not credentials… The container's real .env.local was lost on
restart."* So the model half is unmeasurable from here and the app half has
never been measured by anyone. This document is the app half.

The exam's split is deliberate, not an oversight — `docs/coach-exam-rubric.md:7`
says so: *"The app has probes that measure the coach's voice… Nothing has ever
measured whether the advice was right."* Voice was assigned to the probes. The
probes only ever looked at the model.

## Method, and what it does and does not count

Two independent passes, because one counting method proves nothing about its
own blind spots.

1. **Mechanical.** `scratchpad/voice-extract.mjs` walks every `.ts`/`.tsx` under
   `src/`, blanks comments, and keeps quoted strings of 12–220 characters that
   read as prose and contain a first-person or second-person marker. Deliberately
   broad: a false positive costs a line in this report, a false negative hides
   the thing being looked for. **393 strings across 70 files.**
2. **By hand**, builder by builder and branch by branch. **~330–390 sentences
   across 24 files**, a floor rather than a count — it undercounts bare
   `return '…'` forms.

The two numbers are not comparable and neither is "the answer": the first is a
wide net with known false positives (enum labels, a few screen strings), the
second is a narrow hand count. They agree on the order of magnitude, which is
all this stage needs.

**A defect in the measurement, fixed mid-flight and worth recording.** The first
version of the extractor *deleted* comment lines before splitting, which
renumbered every line after them — the rest-day lead was reported ~900 lines
from where it lives. Caught by opening one citation rather than trusting the
tool. Comments are now blanked in place, and three citations were spot-checked
against the files afterwards. **A report whose citations cannot be opened is
worth less than no report**, because it gets believed.

**Deliberately excluded**, and each for its own reason:

- `src/lib/accountability.ts` — third person, written *for the model* to read
  (`"They're on a 3-day streak."`). Looks like coach voice at a glance; isn't.
- `supabase/functions/chat-gemini/tool-reply.ts`'s six `*_NUDGE` constants —
  instructions to the model, not text a person sees.
- `src/lib/coach-tips.ts` — telegraphic dashboard tiles, a different medium from
  a chat bubble. Arguably wants its own register on purpose; that is a question,
  not a defect.

---

## Finding 1 — half the proposal cards say nothing at all

**18 `build*Proposal` functions in `ChatAssistant.tsx`. 9 leads.**

    builders: 18
    leads:     9

The nine that are silent render a bare table of before/after rows with no
spoken line above them. Among them: **`buildExerciseSwapProposal`**
(`:1900-2038`) — the single most-used verb in the app. Also the two injury
builders, equipment, volume, schedule, style and concurrent activity.

This is not drift. It is the coach going quiet for exactly the changes that
alter the most.

## Finding 2 — the nine that do speak use three different grammars

For one job: *describe a pending change and ask for a tap.*

**The colon family** — a capability, no question:

    :2092  I can add **{exercise}** to {day}:
    :2199  I can stop giving you **{name}** for good:
    :2290  I can take **{exercise}** out of {day}:
    :2358  I can put **{exercise}** before **{other}**:
    :2747  I can cut {day} down to about {n} minutes:

**The "Shall I?" family** — a declaration with a question appended:

    :2805  I'll mark {day} as a rest day you chose, so it won't show as missed. Shall I?
    :2879  I'll mark {day} as {activity} instead of your lift, so it won't show as missed. Shall I?
    :2919  I'll mark {day}'s {focus} as missed — it stays on your record as a session that didn't happen. Shall I?

**The "Want me to…?" family** — used by the chips for *the same actions the
"Shall I?" cards perform*:

    :1860  Want me to mark that as a rest day?
    :1861  Want me to mark that session as missed?
    :1862  Want me to swap that day over?
    :1863  Want me to move that session?

So a person marking a rest day meets **"Want me to mark that as a rest day?"**
on the chip and **"I'll mark Monday as a rest day you chose… Shall I?"** on the
card. Same action, same screen, same minute, two voices — and they are 945 lines
apart in one file, which is why nobody noticed.

A fourth closer exists in `src/lib/weight-basis-offer.ts:127,129`: a bare
**"Want me to?"** with no verb at all.

## Finding 3 — the same sentence, written again

Each pair does one job. Neither reads as the same writer.

**"Today only":**

    ChatAssistant.tsx:2652   Just this week — {day} is back to normal next week.
    ChatAssistant.tsx:2751   Just today — {day} is back to the full session next week.
    edit-reason.ts:152       Today only — back to normal next week.

**"Just today" as a chip note — one label, four notes:**

    edit-tradeoff.ts:338   { label: 'Just today', note: 'back to normal next week' }
    edit-tradeoff.ts:384   { label: 'Just today', note: 'nothing else changes' }
    edit-tradeoff.ts:432   { label: 'Just today', note: 'next week is unchanged' }
    meal-tradeoff.ts:134   { label: 'Just today', note: 'Tomorrow goes back to the plan' }

The meal one is also the only one written as a sentence — capital T, no
lower-case caption convention — because the food half does not import the
exercise half.

**The injury rebuild warning, twice, ~70 lines apart:**

    :2419  This rules out too much to patch exercise by exercise, so I'd rebuild these
           weeks around it rather than leave gaps — your original plan comes back
           automatically when it expires.
    :2489  This injury rules out too much of your current plan to patch it exercise by
           exercise — I'd rebuild the whole programme around it instead, keeping the
           same number of sessions and adding work that helps the joint.

**A save failing, four ways:**

    pending-action-executor.ts:104   The swap could not be saved — try again
    pending-action-executor.ts:192   That could not be saved — try again
    pending-action-executor.ts:555   The meal didn't save — try again
    ChatAssistant.tsx:4885           The swap didn't save — try again

**The opener, duplicated across two modules, differing by one capital letter:**

    coach-opener.ts:149   yesterday's {focus} didn't happen — no drama. Run it today, …
    coach-nudge.ts:205    Yesterday's {focus} didn't happen — no drama. Run it today, …

Byte-identical otherwise. Neither imports the other; the opener's caller
prefixes a name, so its copy starts lower-case. `coach-opener.ts:207` and
`coach-nudge.ts:242` are the same story.

## Finding 4 — three narrators in one file

`src/App.tsx` reports failures in first person, no person, and first person
plural:

    :811   I couldn't load your meals just then — that's a connection problem…
    :1208  We couldn't start your account, so there was nowhere to save your plan.
    :1705  Couldn't fit a new {slot} option — kept your existing one.
    :1512  Something went wrong while building your plan.

"I", "We", nobody, and the passive. A coach is one person.

## Finding 5 — the register collapses on receipts

44 receipt titles across 20 confirm branches, each a success/failure pair.
The successes:

    'Swapped'  'Added'  'Logged'  'Moved'  'Adjusted'  'Reordered'  'Taken out'
    'Never again'  'Plan built around it'  'Session shortened for today'
    'Injury saved'  'Volume adjusted'  'Schedule updated'  'Swapped over'

Bare past-tense verbs sit beside a three-word sentence and a judgement
(`'Never again'`). Four different lengths, two points of view, one column of a
table the user reads one row of at a time.

## Finding 6 — the per-goal phrasebook already exists and is dead

CLAUDE.md lists *"the per-goal phrasebook as one graded file"* as STILL TO
BUILD. Half of it is built and unreachable.

`src/lib/edit-tradeoff.ts:174` defines `GOAL_NOUN` — the four goals in plain
words (*"building muscle"*, *"losing fat while keeping muscle"*, *"getting
stronger and moving well"*, *"your conditioning"*). It has **exactly one use
site**, `:482`, inside a `free(...)` reason string.

That string is never rendered. Every read of a `Tradeoff.reason` across `src/`:

    tradeoff-shape.ts:200   re-wraps it into another reason

and nothing else. (`target.reason`, `edit.reason` and `out.reason` elsewhere are
different fields — checked.) So the app has a per-goal vocabulary written down,
and no person has ever read a word of it.

The one live per-goal clause is `whyVolumeMatters` (`:182`). `meal-tradeoff.ts`
does not import any of it and inlines its own
`goal === 'fat_loss' ? … : …` ternary at `:203`.

## What is already right, and should be promoted rather than rewritten

**`src/lib/edit-reason.ts:91` — `SPECS`.** One frozen object, six reasons ×
four fields (label, note, prompt, cardLine), and its own header states the
design rule the rest of the app does not follow: *"the codes are stable; the
wording is not, which is why every surface reads its words from here rather
than writing its own."*

It is the shape. It does not need rewriting; it needs the other 300 sentences
to join it.

## Three constraints on any fix, each already paid for once

1. **A phrasebook must be a leaf module.** `src/lib/tradeoff-shape.ts:1-22`
   records that importing `edit-tradeoff` from the nutrition sheet dragged the
   5,000-line exercise catalogue and the plan scorer into the main chunk and
   tripped `test:bundle`. So: pure string tables, importing nothing but types,
   and **not** placed inside `edit-tradeoff.ts`.
2. **The client and the server cannot share a file.** The edge function runtime
   cannot import from `src/lib`. `src/lib/plan-claim.ts:1-12` documents the
   established answer — a physical twin under `supabase/functions/_shared/`,
   kept in lockstep by a gate. Any server-side floors follow that pattern; the
   gate shape already exists in `test:coach-rules-sync`.
3. **Some strings belong where they are.** The three exclusions listed under
   Method. Sweeping them in would make the phrasebook incoherent.

## What this measurement does NOT establish

- **Whether any of it reads badly to a person.** This counts inconsistency, not
  quality. Ashley is the judge of the second.
- **Anything about the model's voice.** Unmeasurable here; unchanged by this
  work.
- **That fixing it improves the coach.** A consistent voice is a floor, not a
  ceiling. The exam grades advice and has still never been run.
