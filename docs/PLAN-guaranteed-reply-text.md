# PLAN — Guarantee the coach always says something, then let it stop grading

Written 2026-08-22, before building, per the "plan it before building — it's
an edge function change" instruction.

## The finding this plan is built on

The onboarding coach grades every answer ("Solid goal!", "Advanced —
impressive!") because the system prompt's REACT BEFORE YOU ASK rule demands a
reaction to every single answer. A previous session loosened that rule: the
grading voice disappeared completely — and the model returned empty text on
4 of 7 turns, tripping the client's dead-air guard, which prints the slot's
raw form wording. The attempt was reverted.

Conclusion: **"react every turn" is load-bearing for RELIABILITY, not
voice.** It is currently the only thing that makes the model emit any text
at all on tool-calling turns. So the fix is to move the reliability
guarantee into code — the edge function must never return empty reply text —
and only then loosen the prompt.

## Where the empty text gets through today

`supabase/functions/onboarding-chat/index.ts` already has a recovery chain
(follow-up function-response leg, then a forced-text leg with tools
removed), but it has four holes:

1. **No-actions silence.** The chain only runs inside
   `if (!reply && actions.length > 0)`. A turn where the model emits
   *nothing at all* — no text, no calls (an empty candidate, a safety stop,
   a "nothing worth saying" judgement under a loosened prompt) — skips every
   leg and ships `reply: ""`.
2. **Sanitize-after-the-legs.** `sanitizeReply` runs after the chain. A
   reply that is leak-shaped (bare tool-call JSON) is non-empty, so it skips
   the legs, *then* gets stripped to `""` — shipped empty.
3. **The forced-text leg is allowed to fail.** If it returns empty text or
   the HTTP call fails, the code explicitly accepts dead air ("costs voice,
   not the flow"). That acceptance is exactly what this change removes.
4. **No floor.** There is no deterministic last resort; the "guarantee" is
   probabilistic.

## The build

All in the edge function (plus one extracted module so it can be gate-tested
from Node):

1. **Extract the reply-resolution chain** into
   `supabase/functions/onboarding-chat/reply-resolver.ts` — no Deno APIs, no
   jsr imports, so `tsx` can import it. `index.ts` passes it the first leg's
   parts, the conversation contents, a `callGemini` closure, the catalog and
   `remaining`.
2. **Run recovery whenever reply is empty after sanitizing**, actions or
   not. With actions: the existing function-response round trip first (the
   protocol's own answer, kept). Without actions: straight to the
   forced-text leg with a nudge that fits that case.
3. **Sanitize per leg**, so a leak-shaped reply from any leg triggers the
   next leg instead of shipping as `""`.
4. **Forced-text leg retried once on transient (non-ok) failure** — not on
   ok-but-empty, where a same-input retry just repeats the silence. Its
   nudge drops the "call present_slot" sentence: with tools removed that
   instruction can only produce the leak shape as text, and the existing
   chip-recovery leg downstream already covers chips.
5. **Deterministic floor, in code.** If every model leg comes back empty:
   - a `present_slot` action already in this turn → a short human lead-in on
     that slot's canonical question (chips will attach to it);
   - otherwise, next `remaining` slot → same lead-in + its question, and a
     server-appended `present_slot` when the slot renders chips;
   - `remaining` empty → a wrap-up line plus `complete_onboarding` (the
     client re-validates and refuses it if anything is actually missing, so
     this can't skip a question — it preserves the client's "finish is
     always reachable" property, which the guarantee would otherwise mask by
     making `producedVisible` always true).
   The floor's voice is one warm clause + the canonical question — near-form,
   deliberately: it is reached only when three model legs have all failed,
   and it must not depend on the model. It logs when it fires, so the
   Supabase function logs measure how often the guarantee is actually earning
   its keep.
6. **Gate test** `scripts/test-onboarding-reply-guarantee.ts`
   (`npm run test:reply-guarantee`): mocked `callGemini` injecting every
   measured failure shape — calls-only turns, calls-only twice, empty
   candidates, leak-shape replies, HTTP failures on each leg, all-legs-empty
   — asserting reply is always non-empty, actions survive and dedupe, and
   the number of extra model calls stays bounded (≤3 per turn).
7. **Only then, the prompt.** Replace REACT BEFORE YOU ASK with a rule that
   reacts when an answer actually changes something and explicitly bans
   grading routine answers; keep the mechanical "every turn contains reply
   text" line (it costs nothing voice-wise and keeps the recovery legs
   rare); reword the follow-up nudge, which currently re-injects "react to
   what they just told you" into every recovered turn.

## Measurement protocol

`scripts/probe-onboarding-tone.mts` against the **deployed TEST** function,
with the committed persona `scripts/probe-personas/warmth-measure.json`
(7 turns, deliberately heavy on routine answers — numerics, "no injuries",
"no restrictions" — where the grading voice shows). The probe builds
`state.filled` from actually-confirmed slots exactly as the client does;
never probe with a hand-built `{}` state — an empty `filled` alone silences
the model and fakes this exact defect. The probe gains a printed summary:
turns with empty reply / total.

- BEFORE (current deployed prompt): expect ~0 empty turns; count
  graded-answer turns by reading the transcript.
- AFTER (this change deployed): empty turns must be 0 — now by guarantee —
  and graded-answer turns should drop to ~0.
- Deploy: `npx supabase functions deploy onboarding-chat` (TEST is the
  linked default; this function is not shipped by the Vercel push).
