# One thing first

*Written 2 Sep 2026. Ashley asked for a view on a generic chat blueprint
(Gemini's) — post-workout check-ins, reminders, rest-day guidance, chips,
in-chat cards — and then: **"build it with your recommendations."** This is
what those recommendations were, what was built, and what was deliberately
left out.*

## The review, in one paragraph

Roughly half the blueprint already existed here: the check-in (built that
afternoon), in-chat Confirm/Decline cards, memory across sessions, a chip
mechanism, non-shaming missed-session handling, per-day macros in dynamic
mode. Its one genuinely new idea — notifications — rested on "schedule local
notifications", which browsers do not have; a web app needs server push, and
that is days of work plus an iPhone home-screen caveat. The real gap it
circled without naming: **the coach can only speak when someone opens the
chat tab.** So the recommendation was to make the coach proactive *inside*
the app first, cheaply, and prove people want to be spoken to before building
push.

## What was built — all client-side

No migration. No edge-function deploy. Everything ships with the frontend.

### 1. One thing said first — `src/lib/coach-opener.ts`

The first bubble of a fresh conversation is composed on the client and never
touched the model. It used to be the calendar alone: "today's X, feeling good
for it?" or "rest day, how's recovery?". Now it is picked from real state,
deterministically, the way `accountability.ts` picks its one observation:

1. **A finished session nobody asked about** → "how did Tuesday actually
   feel?" — no chips (see below).
2. **Yesterday was scheduled and nothing happened** → "yesterday's Legs
   didn't happen — no drama. Want to run it today, or call yesterday a rest
   day and pick up from here?" — with two chips.
3. Today's session, past the training hour → the old "how'd it go".
4. Today's session ahead → the old line, plus one chip: *"I'm short on time
   today — can you trim the session?"*
5. Rest day → the old line, **plus a preview of the next session and its
   lead lift** — the blueprint's "preview tomorrow", for free.

Exactly one thing. An opener that mentions two situations is a status report.

"Was yesterday missed" is read from the **week strip's own day states**, so
the chat and the strip can never disagree: a swap, a chosen rest, a partial
day and a pre-plan day all come back *not missed*. On a Monday, yesterday is
last week and is not judged — accepted rather than fetched around.

The model gets the same fact through the accountability check-in, ranked
below "you're mid-session and stalled" and above everything else, worded as
a fact with no verdict. The prompt's existing rule for a miss ("no drama,
then the useful part") and the existing tools (`propose_rest_day` takes a
date) do the rest. **That is why there is no prompt change and no deploy.**

### 2. Chips, keyed to the kind — and none under the question that wants a sentence

Chat messages already carried `quickReplies`; the first-run intro used them.
Now the opener does too. Each chip is a complete sentence because tapping one
**sends** it. Each is keyed to the opener's kind, so a chip can only open a
conversation the coach's existing tools can finish:

| kind | chips |
|---|---|
| unreviewed session | **none** — Ashley's ruling. Chips are buttons wearing a different hat; under this question people would tap instead of answer, and the sentence is the point. |
| missed yesterday | *I'll do it today* · *Call yesterday a rest day* |
| training day ahead | *I'm short on time today — can you trim the session?* (not mid-session) |
| rest day | *What's tomorrow looking like?* · *Any mobility work worth doing today?* |

**One chip left out on purpose.** The blueprint offered "move it to your next
day". The only schedule tool the coach has changes the weekly pattern
permanently, so that chip would open a conversation the coach could finish
only by rewriting their week. **A one-off reschedule is a named gap**, not
something to hide behind a chip.

### 3. A dot on the chat tab

`ChatAssistant` is force-mounted, so it already holds every input before the
tab is opened. It reports one boolean upward — *the coach has something that
wants an answer* — and `App` draws a small dot on the chat button. It lights
for exactly the two kinds that want an answer (unreviewed session, missed
day). **Not** for "today is a training day": that is every other day, and a
dot that is always on is a dot nobody sees. It clears the moment the chat is
opened, whether or not they answer, and re-arms only when the condition goes
away and a new one arrives. A nudge, not a demand.

Without this, everything proactive — including the afternoon's feel question
— fired only if they happened to open the chat.

## Deliberately not built

- **Push notifications.** The only item that reaches someone who has not
  opened the app, and the only one that can annoy. Server push, a
  subscription table, a sender, a scheduler, opt-in UI, iPhone caveat.
  After the in-app version has proven itself, not before.
- **A daily soreness scale.** Contradicts the same-day ruling (ask for the
  sentence, not the score), contradicts the research, and turns one question
  a session into one a day.
- **Rest-day carb cuts in standard mode.** A nutrition prescription change
  on weak evidence; Ashley's call, and the recommendation was against.
- **"Follow up immediately after two rough sessions."** Too trigger-happy;
  the two-of-three rule from `session-feel.ts` stands.
- **Rest-day mobility content.** Needs a ruling on what goes in the
  catalogue. Chip asks the question; the coach answers from what it knows.

## Gate

`npm run test:coach-opener` — six sections: priority and one-thing-only;
Ashley's no-chips ruling; every chip maps to an existing tool; attention
lights for exactly two kinds and the wiring carries it end to end;
`missedYesterdayFrom` reads only a real miss; the model-side check-in ranks
the fact where it belongs.

| mutation | result |
|---|---|
| chips added under the feel question | red — §2 |
| attention lit on an ordinary training day | red — §4 |
| a partial day counted as a miss | red — §5 |
| missed yesterday demoted below the streak line (check-in) | red — §6 |
| the dot no longer clears when the chat is opened | red — §4 wiring |
| a missed day ranked below today's session in the opener | red — §1 |

Each mutation was applied by exact replacement and the script asserts the
file actually changed before running the gate — a mutation that does not
apply is not a passing mutation test (the lesson from `test-muscle-balance`
earlier the same day).

## What is not verified from here

The gate proves the decision logic and the wiring by source. It does not
prove the dot renders, that the chip tap sends, or that the opener reads
right on a real account. Those three checks are in the handover for TEST.

Also every other gate this touches: `test:session-feel`,
`test:coach-promises`, `test:chat-app-reality`, `test:dashboard`,
`test:a11y`, `test:no-dead-code`, `test:reveal-timing`,
`test:onboarding-chips`, `test:pending-actions`, `test:memory` — all green,
and `npm run build` passes.
