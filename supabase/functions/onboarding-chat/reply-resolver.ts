// ---------------------------------------------------------------------------
// The reply guarantee for onboarding-chat: whatever the model does — answers
// with bare tool calls, returns an empty candidate, leaks tool-call syntax as
// text, or fails an HTTP leg — the resolved turn ALWAYS carries non-empty
// reply text. The client's dead-air fallback (printing a slot's raw form
// question) still exists as defense in depth, but nothing the model can emit
// reaches it any more.
//
// Why this is code and not prompt: a previous session measured that the
// prompt's "react every turn" rule was the only thing keeping the model
// emitting text at all — loosening it for voice made 4 of 7 turns come back
// with zero text. The rule was load-bearing for RELIABILITY, not tone. This
// module carries that load instead, so the prompt is free to stop demanding
// a graded reaction to every answer (see docs/PLAN-guaranteed-reply-text.md).
//
// This file is imported by index.ts (Deno) AND by
// scripts/test-onboarding-reply-guarantee.ts (Node/tsx), which is the whole
// point of it being a separate module: the recovery chain is gate-tested
// against every measured failure shape with a mocked model, something the
// Deno.serve handler can't be. Keep it free of Deno APIs and jsr imports.
// ---------------------------------------------------------------------------

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}
export type GeminiPart = { text?: string; functionCall?: GeminiFunctionCall };
export interface ClientAction {
  name: string;
  args: Record<string, unknown>;
}

export interface SlotCatalogEntry {
  key: string;
  question: string;
  control: string;
  required: boolean;
  /** True when this slot can never hold a plan up. See the client-side
   *  SlotCatalogEntry in src/lib/onboarding-slots.ts for why it exists. */
  neverBlocks?: boolean;
  values?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

/** One Gemini call, already unwrapped: parts on success, status/errorText on failure. */
export interface GeminiLegResult {
  ok: boolean;
  status?: number;
  parts: GeminiPart[];
  errorText?: string;
}
export type GeminiLegCaller = (turns: unknown[], withTools: boolean) => Promise<GeminiLegResult>;

export const textOf = (parts: GeminiPart[]) =>
  parts.filter((p) => typeof p.text === "string").map((p) => p.text).join("").trim();
export const callsOf = (parts: GeminiPart[]) =>
  parts.filter((p) => p.functionCall).map((p) => p.functionCall!);

/**
 * Defense in depth against two leak shapes measured live: a trailing
 * parenthetical explaining the model's own slot logic to itself ("(Note: the
 * user didn't specify days, so I need to present the training days
 * option.)"), and a reply that IS bare tool-call/JSON syntax instead of the
 * functionCall part it should have been. Neither belongs in a text message a
 * real coach would send. The prompt says not to do either (see "NEVER LEAK
 * YOUR OWN REASONING"); this is the deterministic backstop for when it does
 * anyway. It runs on EVERY leg's output, inside the chain — a reply
 * sanitized to empty triggers the next recovery leg rather than shipping as
 * silence (which is exactly what it used to do when this ran once, after
 * the legs).
 */
export function sanitizeReply(text: string): string {
  const stripped = text.replace(/\s*\((?:note|internal|system)\s*[:\-][^)]*\)\s*$/i, "").trim();
  if (/^\{[\s\S]*"(?:name|actions|slot_key|functionCall)"/.test(stripped)) return "";
  return stripped;
}

const RECORDED_NUDGE =
  "(System: those are recorded and the app has already shown the user a confirmation for each. Now write your actual turn to them — pick the conversation up and carry it forward. Two to four sentences, one paragraph, no lists, no \"let me know\" ending, and do not repeat the recorded values back at them. If your turn asks a closed-set question, call present_slot for it in this same turn so the chips render.)";

// The text-only leg has no tools, so a "call present_slot" sentence could
// only be obeyed by leaking call syntax as text — these say the opposite.
// Chips are recovered downstream by index.ts's chip-recovery leg. Two
// variants because the leg is reached from two different situations: after
// a round trip whose calls are already confirmed to the user, or after a
// first turn that carried nothing at all.
const TEXT_ONLY_RECORDED_NUDGE =
  "(System: plain text only on this attempt — tool calls are unavailable and anything that looks like one will be discarded. Anything you already recorded has been confirmed to the user by the app. Write your turn to them now: pick the conversation up and carry it forward. Two to four sentences, one paragraph, no lists, and do not repeat recorded values back at them.)";

const TEXT_ONLY_EMPTY_NUDGE =
  "(System: your last turn came back empty — the user is looking at silence. Plain text only on this attempt: tool calls are unavailable and anything that looks like one will be discarded. Write your turn to them now — pick the conversation up and carry it forward. Two to four sentences, one paragraph, no lists.)";

const FLOOR_LEADS = [
  "Right, next thing I need —",
  "Let's keep going —",
  "One more for you —",
] as const;

/** Rotates the floor's opener so consecutive fallbacks don't read as a stuck record. */
const floorLead = (seed: number) => FLOOR_LEADS[Math.abs(seed) % FLOOR_LEADS.length];

/**
 * The deterministic floor: composes a reply from state alone, for the turn
 * where every model leg came back empty or failed. One warm clause plus the
 * slot's canonical question — near-form voice, deliberately: it must not
 * depend on the model, and it is reached only after three model attempts.
 *
 * The slot it asks about is pinned by any present_slot already collected
 * this turn (its chips will attach to this text — asking a DIFFERENT
 * question would put chips under the wrong words, which is worse than no
 * chips). Failing that, the first still-remaining slot, with present_slot
 * appended when that slot renders chips. With nothing left to ask, a
 * wrap-up line plus complete_onboarding — the client re-validates and
 * refuses an early completion, so this cannot skip a question; it exists
 * because a guaranteed-non-empty reply makes the client's own
 * "nothing-visible → finish anyway" branch unreachable, and finish must
 * stay reachable.
 */
export function floorReply(
  catalog: SlotCatalogEntry[],
  remaining: string[],
  actions: ClientAction[],
  variantSeed = 0,
): { reply: string; extraActions: ClientAction[] } {
  const entryOf = (key: unknown) =>
    typeof key === "string" ? catalog.find((c) => c.key === key) : undefined;
  const lead = floorLead(variantSeed);

  const presented = actions.find((a) => a.name === "present_slot");
  const presentedEntry = presented ? entryOf(presented.args?.slot_key) : undefined;
  if (presentedEntry) {
    return { reply: `${lead} ${presentedEntry.question}`, extraActions: [] };
  }

  const nextEntry = remaining.map(entryOf).find(Boolean);
  if (nextEntry) {
    const chippable = nextEntry.control === "single" || nextEntry.control === "multi";
    return {
      reply: `${lead} ${nextEntry.question}`,
      extraActions: chippable ? [{ name: "present_slot", args: { slot_key: nextEntry.key } }] : [],
    };
  }

  const alreadyCompleting = actions.some((a) => a.name === "complete_onboarding");
  return {
    reply: "That's everything I needed — let's take a look at what we've got.",
    extraActions: alreadyCompleting ? [] : [{ name: "complete_onboarding", args: {} }],
  };
}

/**
 * Resolves the first Gemini leg's parts into a { reply, actions } pair whose
 * reply is guaranteed non-empty. At most 3 further model calls, in order:
 *
 *   1. Function-response round trip (only when the first leg made calls) —
 *      the protocol's own answer to a tool-calling turn with no prose:
 *      feed the calls' results back and let the model produce its
 *      natural-language turn. The calls are pure client instructions here
 *      (this function owns no state), so every response is simply
 *      "recorded" — the point of the round trip is the prose, not the
 *      payload. Further calls it makes are merged in (deduped — a repeated
 *      present_slot renders a second copy of the same question).
 *   2. Text-only leg, tools removed — given tools, the model can answer
 *      with calls again and still say nothing (measured at roughly a third
 *      of round-trip turns). Taking the tools away removes the option.
 *   3. One retry of the text-only leg, ONLY on a transport/HTTP failure —
 *      an ok-but-empty response is a model choice a same-input retry just
 *      repeats, so that is not retried.
 *
 * Then the deterministic floor. Every leg's text passes through
 * sanitizeReply before it counts as a reply, so a leak-shaped answer keeps
 * the chain going instead of shipping as silence.
 */
export async function resolveReply(opts: {
  firstParts: GeminiPart[];
  contents: unknown[];
  callGemini: GeminiLegCaller;
  catalog: SlotCatalogEntry[];
  remaining: string[];
  /** Varies the deterministic floor's opener between turns — pass the turn count. */
  variantSeed?: number;
  log?: (...args: unknown[]) => void;
}): Promise<{ reply: string; actions: ClientAction[] }> {
  const { firstParts, contents, callGemini, catalog, remaining, variantSeed = 0 } = opts;
  const log = opts.log ?? (() => {});

  // Unlike chat-gemini's per-tool dispatch, every functionCall here is a
  // pure instruction for the client (which owns validation and all writes)
  // — so the whole set passes through in order, alongside any text.
  let reply = sanitizeReply(textOf(firstParts));
  const actions: ClientAction[] = callsOf(firstParts).map((c) => ({
    name: c.name,
    args: c.args ?? {},
  }));
  if (reply) return { reply, actions };

  const firstCalls = callsOf(firstParts);
  const mergeCalls = (parts: GeminiPart[]) => {
    for (const c of callsOf(parts)) {
      // Drop what an earlier leg already asked for. A repeated present_slot
      // is the damaging one — it renders a second copy of the same
      // question — so identical (tool, slot) pairs never merge twice.
      const dup = actions.some(
        (a) => a.name === c.name && a.args?.slot_key === (c.args ?? {}).slot_key,
      );
      if (!dup) actions.push({ name: c.name, args: c.args ?? {} });
    }
  };

  // The transcript the recovery legs continue from. With calls: the round
  // trip described above, then the with-tools leg. Without calls there is
  // nothing to resolve and nothing to round-trip — the model returned an
  // entirely empty turn (empty candidate, safety stop, or a "nothing to
  // say" judgement), which used to skip recovery altogether and ship "" —
  // so it goes straight to the text-only leg, with a nudge that says so.
  const baseTurns: unknown[] = firstCalls.length > 0
    ? [
      ...contents,
      { role: "model", parts: firstCalls.map((functionCall) => ({ functionCall })) },
      {
        role: "user",
        parts: firstCalls.map((c) => ({
          functionResponse: { name: c.name, response: { status: "recorded" } },
        })),
      },
    ]
    : [...contents];
  const withNudge = (nudge: string): unknown[] => [
    ...baseTurns,
    { role: "user", parts: [{ text: nudge }] },
  ];

  if (firstCalls.length > 0) {
    const followUp = await callGemini(withNudge(RECORDED_NUDGE), true);
    if (followUp.ok) {
      reply = sanitizeReply(textOf(followUp.parts));
      mergeCalls(followUp.parts);
    } else {
      log("onboarding-chat: follow-up leg failed", followUp.status, followUp.errorText);
    }
  }

  if (!reply) {
    const forcedTurns = withNudge(
      firstCalls.length > 0 ? TEXT_ONLY_RECORDED_NUDGE : TEXT_ONLY_EMPTY_NUDGE,
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      const forced = await callGemini(forcedTurns, false);
      if (forced.ok) {
        reply = sanitizeReply(textOf(forced.parts));
        break; // ok-but-empty is a model choice, not a fault — no retry.
      }
      log("onboarding-chat: text-only leg failed", forced.status, forced.errorText);
    }
  }

  if (!reply) {
    const floor = floorReply(catalog, remaining, actions, variantSeed);
    reply = floor.reply;
    actions.push(...floor.extraActions);
    // Loud on purpose: every firing means three model legs produced nothing.
    // If this line shows up often in the function logs, the model or the
    // prompt has regressed and the floor is papering over it.
    log("onboarding-chat: deterministic reply floor used", {
      hadCalls: firstCalls.length > 0,
      remainingCount: remaining.length,
    });
  }

  return { reply, actions };
}
