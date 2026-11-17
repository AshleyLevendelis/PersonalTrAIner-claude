# The coach reaches everything, and the app checks everything it does

Ashley, 17 Nov 2026: *"Rather than patching individual issues we find can we not make the chat be able to access and
have knowledge about everything in the app so it can change anything or do anything in the app"*, then "Plan it".
**Stage 1 built 17 Nov 2026 (his "Build stage 1"); stages 2, 3 and 4 built the same day (his "start step 2 then 3 then 4"). What each did and did not do is in BACKLOG.**

## Where it stands (measured 17 Nov 2026)

- **What the coach can DO: nearly everything already.** 58 tools in `supabase/functions/chat-gemini/index.ts`: meals
  (13), exercises and sessions (24), plan-wide changes (goal, style, days, length, kit, injuries, pause, restart,
  running), logging (sets, sessions, cardio, meals, weight, water, steps, feel) and memory. `docs/coach-screen-parity.md`
  (held by `test:coach-parity`) lists every one against a screen control; two meal tools are coach-only by design, and a
  handful of settings are screen-only (freestyle, show-numbers, macro mode, warm-up and drop sets, meals cooked for him).
- **What the coach can SEE: a lot, assembled by hand.** `chat-plan-context.ts` (887 lines) and five siblings build the
  facts each turn, one by one. Each new feature has to remember to add its line; when one forgets, the coach is blind
  to it or describes it differently from the screen.
- **What the app CHECKS before an offer reaches him: some tools, each its own way.** Hedged cardio is refused off a
  phrase list (`definite-mention.ts`); a few tools need his own words quoted (`message-evidence.ts`); a one-off class is
  refused since today (`one-off-sport.ts`); every card is re-checked against the day at the tap (`offer-still-holds.ts`).
  Most of the 58 have no check of their words at all: if the coach reaches for the wrong tool, the card is built.
- **What TESTS the coach: an exam that has run three times**, on his machine, with a key this session cannot hold. The
  coach has changed many times since its last run. So model mistakes reach his phone before any test sees them.

The last three weeks of reports split cleanly: some were the coach choosing wrongly (a one-off read as weekly; a save
with no words), some were app bugs a screen tap hits too (the rebuild). **More access fixes neither.** What fixes the
first kind is a check between the coach and the card; what fixes both is testing the way he uses it, before he does.

## The four stages, in the order I recommend

### Stage 1: every offer passes one checkpoint (recommended first)
One function between the coach's tool call and the card, the same for all 58 tools:
1. **His words license it.** Each tool states what his message must contain: a one-off vs a standing change (today /
   this week vs from now on), a definite vs a hedge, the exercise or meal he named, a day that exists. A tool with no
   rule fails the gate, so a new tool cannot ship unchecked (the `coach-parity` pattern).
2. **The app's state allows it.** The day, exercise or meal exists; it is not already trained, eaten or done; the change
   is not already in place. Today's at-the-tap check, run before the card too.
3. **Scope matches.** A "today" ask cannot become a whole-block card and the reverse; the existing time-scope rule for
   shorten vs session length, applied to every tool that has both.
4. **When it fails, nothing is built**, and he gets an answer instead of a wrong card (his decision below).
Cost: about 3-4 build sessions, family by family (meals, exercises, plan-wide, logging). Each family has gates already;
each rule gets a mutation-tested check, and one browser driver per family drives a wrong offer and sees it refused.

### Stage 2: test the coach the way he uses it, before he does
1. **Every report becomes an exam case** the same day it is fixed (today's: "this evening" must get no rebuild offer).
2. **A real-day suite**: the browser drives a full day through the chat (morning hello, a swap, a meal, a log, an
   evening question) with the model stubbed to make each known kind of mistake; every stage-1 check must catch its one.
3. **The exam runs after every coach deploy**, as part of the handover prompt, scores pushed back here.
4. **Refusals are counted** (no message content, just which tool and which check): a tool the coach keeps misusing is
   a prompt to fix, found from data instead of from his phone.
Cost: 2 sessions here, plus his machine running the exam (about 15 minutes per run).

### Stage 3: one picture of his situation, for the screens and the coach alike
The coach's facts are built from the same readers the screens draw from (today's session, the week strip's counts,
Nutrition's day, the targets), in one structured snapshot, instead of 887 lines of hand-written sentences. A gate
compares the numbers the coach is given with the numbers the screens show, so "the coach said 1,983 kcal left while the
screen said 1,950" cannot happen. New features appear to the coach by being on a screen.
Cost: 3-4 sessions; risk is moderate (the coach's prompt changes shape, so the exam must run after it).

### Stage 4: one master list of actions
Each action defined once: what it is called to the coach, its screen control, its builder, its stage-1 checks, its
Undo. The coach's tool list and the parity document are generated from it. A screen feature then reaches the chat by
being added once. The largest change (58 tools to move, family by family behind the existing gates); worth doing only
after 1-3, because it reorganises what those stages make safe.
Cost: 5+ sessions.

## What this will not do
- Make the model judge perfectly. Stage 1 blocks a wrong change; it cannot make the coach's advice good. That is the
  exam's job (stage 2), and it needs his machine.
- Let the coach change things without his tap. Every change stays an offer he confirms; that rule is his and stays.

## Decisions that are his (asked one at a time when the stage starts)
1. **When the app refuses a coach offer, what does he see?** (a) The app's own short sentence, as today's one-off fix
   ("I've left your plan as it is..."); (b) the coach is asked to answer again in its own words, with the app's sentence
   as the fallback (warmer, a second model call, slightly slower); (c) the offer as a question ("Just tonight, or every
   Tuesday?"). Recommendation: (b), the pattern the empty-reply fix already uses.
2. **Counting refusals** (stage 2.4) stores which tool was refused and why, never what he said. Recommendation: yes.
3. **Order.** Recommendation: 1, then 2, then 3; 4 only if 1-3 leave gaps.

## How "done" is known per stage
- Stage 1: every one of the 58 tools has a rule (gate fails on one without); each rule mutation-tested; a driver per
  family shows a wrong offer refused and a right one built.
- Stage 2: every report since 1 Nov has an exam case; the real-day suite catches each stubbed mistake; an exam run on
  his machine after the deploy, scores in the repo.
- Stage 3: the number gate passes for every figure the coach is given; the exam re-run shows no drop.
- Stage 4: the tool list and parity doc are generated; `test:coach-parity` passes with no hand-written rows.
