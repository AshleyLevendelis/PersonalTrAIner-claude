# How did that feel?

*Plan before build, per CLAUDE.md — this adds a coach question, a database
column and a signal that can lead to a volume change. Written 2 Sep 2026,
straight after Ashley's answer.*

## Where this came from

Ashley shared a research document, "The Coach's Decision Stack", and asked
three things in sequence: how close the app comes to it, how much I trust it,
and then **"take what is good from the document and implement in the app."**

The trust answer matters, because it is the filter. The document tiers its own
claims (Established / Convention / Contested), which is rare and is the best
signal of its quality. But its central thrust — few training variables matter,
most structure is convention — is a *position* in a contested field, and it is
conveniently the position that makes an app's job easier. So what is taken
here is only what I would bet on independently of the document, and the
largest item on that list is this one:

**Affect during exercise predicts return, more reliably than any programming
variable.** Two thirds of people drop out inside the first month. The app has
no way to tell someone quietly hating it from someone who is fine — it reads
attendance and load, and both of those only move *after* a person has already
begun to leave. By the time `block-consistency.ts` sees a missed session, the
thing worth catching has happened.

## The decision, and how it was reached

Put to her as one question with four options: ask and let the coach offer to
back off (recommended); ask and only record it; ask and adjust automatically;
don't ask.

**She answered: "Ask but I would like to maybe implement the chat asking
rather than a button. After all the app is centered around the chat."**

So: no control on the session summary dialog. The coach asks, in
conversation, and a tool records the answer.

That is the better design and not only because it is hers. Free text into a
bucket beats four buttons: *"brutal but good"* and *"just miserable"* are the
same bucket and not the same sentence, and the second half is what makes the
coach's next reply worth reading. A button throws that away.

**One assumption flagged, per the standing rule.** The option she answered had
the coach *offering* to reduce volume after a bad run, never changing anything
silently. She changed the delivery, not that behaviour, so the offer is built.
If she wanted record-only, the offer branch comes out and nothing else moves.

## What was built

- **Migration** `20260902140000_add_session_feel.sql` — `felt` (CHECK'd to
  four values) and `felt_note` on `workout_sessions`, shaped exactly like
  `add_deliberate_rest`. Absent means NEVER ASKED, not "fine"; nothing is
  backfilled and no existing row changes meaning.
- **`src/lib/session-feel.ts`** — the pure decision logic (`feelRun`,
  `buildFeelBrief`) and the write (`recordSessionFeel`). No UI.
- **`record_session_feel`** in `chat-gemini`, gated on a verbatim quote, a
  known bucket and a well-formed date, forwarding an intent and writing
  nothing itself (I1: `workout_sessions` keeps one writer).
- **Prompt section 1e** — when to ask, once, and to drop it if ignored.
- **`ChatAssistant.tsx`** — loads the context the way `proactiveData` is
  loaded, sends `feel_brief`, and writes on the returned intent.

### Three rules that are mine, not the document's

The document names none of these thresholds, because no study has them. They
are stated here so they are one line each to change:

1. **The back-off rule.** Two or more of the last three answered sessions came
   back `rough`, OR all three were `hard` or worse. Two roughs deliberately,
   not one: a single awful session is a bad day, and an app that reacts to
   every bad day teaches people to stop answering honestly.
2. **`ASK_WITHIN_DAYS = 3`.** Someone asked on Friday about Monday does not
   remember Monday well enough for the answer to mean anything, and being
   asked reads as the app not knowing what day it is.
3. **A hard session is not a bad session.** Hard is usually the target; the
   bucket records how they felt about it, not how heavy it was. Written into
   the prompt because a coach that treats every `hard` as a problem would talk
   people out of the work that is supposed to feel like that.

### What it is not allowed to do

Nothing here changes a plan. A bad run makes the coach *offer*, through
`propose_volume_change`, which already exists and already routes through an
explicit confirm — the same posture as `beat-target-offer.ts`. A plan that
quietly shrank because of one tap given in a bad mood would be worse than one
that asks.

No receipt card either, deliberately: every other immediate write in
`ChatAssistant` renders one because it changed something the user would have
to go and find. This changes nothing, and a card confirming *"you said it was
rough"* would turn a coach asking how you are into a form you filled in.

## Gate

`npm run test:session-feel` — 40 checks in four sections: the back-off rule
fires on a real run and stays quiet on a bad day (10 cases, weighted to the
quiet ones); the brief is silent when there is nothing to say, which is also
the only thing stopping a second question; the tool is gated and the server
writes nothing; the rules reach the model and the answer reaches the database.

Mutations, all confirmed red against a real check (not a crash):

| mutation | result |
|---|---|
| back-off fires on a single rough | red — 1 failed |
| verbatim-quote gate removed | red — 1 failed |
| `feel_brief` no longer interpolated into the prompt | red — 1 failed |
| the unreviewed line leaks into an answered brief (the double-ask guard) | red — 1 failed |
| prompt loses "a hard session is not a bad session" | red — 1 failed |

The fourth mutation was rewritten once: the first version (`if (awaiting)` →
`if (true)`) exited non-zero by throwing on a null dereference, not by failing
a check. A crash is not a red gate, and recording it as one would have been
exactly the "guard, not proof" error this repo has logged before.

## What is NOT verified, and cannot be from here

The whole path runs through a live model, and this sandbox cannot reach
Supabase. The gate proves the tool is declared, gated and wired, and that the
decision logic is right. It does NOT prove the coach actually asks, that a
prose answer maps to a sensible bucket, or that it stops asking once answered.
**That needs a real run on TEST and it is handed over, not claimed.**

## Deliberately not taken from the document

- **The pain rule (≤5/10 settling overnight).** From supervised tendon rehab,
  where a clinician sets the load. Ours is unsupervised and the person
  answering wants to train. Safety-adjacent; not on this document's authority.
- **Dropping mandated deloads, phases or tempo.** Weak evidence *for* is not
  evidence *against*; deleting structure on that basis is its own unsupported
  claim.
- **Removing the streak.** Genuinely contested, and ours is already softened.
- **Open goals, older-adult power/balance work, pregnancy and hypertension
  paths.** The first is weakly supported for our case; the rest are scope
  decisions about who the app serves, which are Ashley's.
