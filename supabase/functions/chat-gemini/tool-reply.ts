// ---------------------------------------------------------------------------
// THE COACH'S OWN WORDS AFTER A TOOL RUNS — chat-gemini's second pass.
//
// chat-gemini makes exactly one model call per turn. When that call is a
// functionCall, the handler runs the tool and the reply the user sees is
// whatever server English the handler was written with: "Done — that day is
// marked as Muay Thai instead of lifting, and the session is logged." /
// "**Rice cakes** is roughly 0 kcal (P: 0g, C: 0g, F: 0g)". Ashley, 8 Sep
// 2026: "still not the right tone." The tone is not the model's; the model
// never got to speak.
//
// This is the protocol's own answer to that: feed the tool's real result
// back as a functionResponse and let the model write the sentence — the
// same chain onboarding-chat/reply-resolver.ts has run since the reply
// guarantee shipped, with two differences for a tool turn:
//
//   1. The round trip runs with TOOLS REMOVED. chat-gemini's executor runs
//      one call per turn; a second call from the round trip could not be
//      executed and would be dropped, and onboarding measured roughly a
//      third of tools-on round trips re-calling and saying nothing.
//   2. The floor is TODAY'S TEMPLATE, and two deterministic guards decide
//      whether the model's sentence may replace it: `mustContain` (the kcal
//      figure, the kg — a number the user asked for has to be in the
//      answer) and `forbid` (/\blogged\b/ when nothing was logged). A reply
//      that fails either falls to the floor, so the worst case is exactly
//      what ships today.
//
// Cost: zero extra calls when the model already spoke alongside the call
// (preferFirstLegText), one round trip otherwise, one retry on a transport
// failure only. Never more than two.
//
// Deno-free: imported by index.ts (Deno) and by scripts/test-tool-reply.ts
// (Node/tsx), which runs every measured failure shape against a mocked model.
// ---------------------------------------------------------------------------
import {
  callsOf,
  sanitizeReply,
  textOf,
  type GeminiLegCaller,
  type GeminiPart,
} from "../_shared/gemini-parts.ts";

export const TOOL_TURN_NUDGE =
  "(System: the app has done exactly what the result says and nothing else. Write your message as their coach texting: one to three short sentences, no lists, no bold, no field names. Say only what the result says happened — if activity_logged is false do not say logged. Never mention assumptions, tools, or what you couldn't do. At most one specific question. Plain text only on this attempt — tool calls are unavailable and anything that looks like one will be discarded.)";

/**
 * For log_meal's advice arm: they asked what to eat; nothing was computed.
 *
 * This and EVALUATION_NUDGE are QUESTION turns, so they carry §1's relaxed
 * length rule — say the thing and say why. TOOL_TURN_NUDGE and NUMBERS_NUDGE
 * are confirmations and stay at one to three sentences. Keeping all four
 * identical is what made the second pass write to the old ceiling even after
 * the prompt moved.
 */
export const ADVICE_NUDGE =
  "(System: they asked what to eat — nothing was computed and nothing was recorded. Answer as their coach texting: name one or two concrete options, when to have them, and briefly WHY that works for what they are about to do. A short paragraph is fine; stop when you would start repeating yourself. No numbers, no macros, no lists, no bold. Plain text only on this attempt — tool calls are unavailable and anything that looks like one will be discarded.)";

/** For log_meal's evaluation arm: they asked whether the food they named was a good choice. */
export const EVALUATION_NUDGE =
  "(System: they asked whether that food was a good choice. Give your honest verdict as their coach texting — the verdict first, then the reason in plain words, then what you'd do next time if anything. A short paragraph is fine; stop when you would start repeating yourself. Quote the numbers in the result only if they help; never invent others. No lists, no bold, no field names; never mention assumptions or the database. Plain text only on this attempt — tool calls are unavailable and anything that looks like one will be discarded.)";

/** For log_meal's numbers arm: the figure has to come back in a form the guard can see. */
export const NUMBERS_NUDGE =
  "(System: the app computed these numbers from its own food database; nothing was recorded. Answer as their coach texting — one to three short sentences. Quote the calories exactly as they appear in the result, as the number followed by 'kcal' (for example '61 kcal'); the other macros only if they help. No lists, no bold, no field names; never mention assumptions or the database, and never say anything was logged. Plain text only on this attempt — tool calls are unavailable and anything that looks like one will be discarded.)";

export interface ToolOutcome {
  name: string;
  args: Record<string, unknown>;
  /** The machine-readable result — what actually happened, in fields the nudge can point at. */
  response: Record<string, unknown>;
}

export interface ToolReplyOptions {
  /** The transcript the first leg was called with (system prompt excluded). */
  contents: unknown[];
  /** The first leg's parts — the functionCall and any text beside it. */
  firstParts: GeminiPart[];
  callGemini: GeminiLegCaller;
  outcome: ToolOutcome;
  /** Replaces TOOL_TURN_NUDGE when a tool needs to steer the sentence (e.g. "answer whether it was a good choice"). */
  nudge?: string;
  /** Today's server-authored template. Always non-empty; always the last resort. */
  floor: string;
  /** Use the model's own text from the first leg when it wrote some — zero extra calls. */
  preferFirstLegText?: boolean;
  /** Every one of these must appear in the reply (case-insensitive) or it falls to the floor. */
  mustContain?: string[];
  /** None of these may match the reply or it falls to the floor. */
  forbid?: RegExp[];
  log?: (...args: unknown[]) => void;
}

export type ToolReplySource = "first_leg" | "round_trip" | "floor";

export interface ToolReplyResult {
  reply: string;
  source: ToolReplySource;
  /** Model calls this resolution made beyond the first leg. 0, 1 or 2. */
  legs: number;
}

/** The two guards, applied identically to every candidate. Returns the reason a text is refused, or null. */
export function guardReason(text: string, mustContain: string[] = [], forbid: RegExp[] = []): string | null {
  const lower = text.toLowerCase();
  for (const needle of mustContain) {
    if (needle && !lower.includes(needle.toLowerCase())) return `missing "${needle}"`;
  }
  for (const re of forbid) {
    if (re.test(text)) return `matches ${re}`;
  }
  return null;
}

export async function resolveToolReply(opts: ToolReplyOptions): Promise<ToolReplyResult> {
  const { contents, firstParts, callGemini, outcome, floor } = opts;
  const log = opts.log ?? (() => {});
  const mustContain = opts.mustContain ?? [];
  const forbid = opts.forbid ?? [];
  let legs = 0;

  if (opts.preferFirstLegText) {
    const own = sanitizeReply(textOf(firstParts));
    if (own) {
      const why = guardReason(own, mustContain, forbid);
      if (!why) return { reply: own, source: "first_leg", legs };
      log("tool-reply: first-leg text refused", { tool: outcome.name, why });
    }
  }

  // The model's own call, then its result, then the nudge — three turns, the
  // shape onboarding-chat has run live since the reply guarantee shipped.
  const turns: unknown[] = [
    ...contents,
    { role: "model", parts: [{ functionCall: { name: outcome.name, args: outcome.args } }] },
    { role: "user", parts: [{ functionResponse: { name: outcome.name, response: outcome.response } }] },
    { role: "user", parts: [{ text: opts.nudge ?? TOOL_TURN_NUDGE }] },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    legs++;
    const leg = await callGemini(turns, false);
    if (!leg.ok) {
      // A transport/HTTP failure is retried once; an ok-but-empty answer is
      // a model choice a same-input retry just repeats, so that is not.
      log("tool-reply: round trip failed", { tool: outcome.name, status: leg.status, error: leg.errorText });
      continue;
    }
    const dropped = callsOf(leg.parts);
    if (dropped.length > 0) {
      // Tools were off; anything call-shaped here is a leak, never executed.
      log("tool-reply: round trip returned calls with tools off — dropped", dropped.map((c) => c.name));
    }
    const text = sanitizeReply(textOf(leg.parts));
    if (!text) {
      log("tool-reply: round trip said nothing", { tool: outcome.name });
      break;
    }
    const why = guardReason(text, mustContain, forbid);
    if (!why) return { reply: text, source: "round_trip", legs };
    log("tool-reply: round trip refused by guard", { tool: outcome.name, why });
    break;
  }

  return { reply: floor, source: "floor", legs };
}

// ---------------------------------------------------------------------------
// AND THE SAME GUARANTEE FOR A TURN WITH NO TOOL AT ALL.
//
// Everything above covers a turn where a tool ran. A plain question — "what
// should I eat before training", "why is this week lighter" — has no tool, no
// functionResponse and, until now, no second chance: if the model returned no
// text the handler shipped "I didn't quite catch that. Could you try
// rephrasing ...", which blames her for a turn the model simply skipped.
//
// THIS IS THE EXACT FAILURE THAT KILLED THE LAST TONE REWRITE. Commit fa683fc
// fixed the voice and simultaneously stopped the model replying on 4 of 7
// probed turns; it was caught only because onboarding-chat had a reply
// guarantee and a probe. The coach has had neither. Changing the persona
// without this first would be repeating that experiment with no instrument.
//
// One retry, tools off, then the floor. Zero extra calls in the normal case.
// ---------------------------------------------------------------------------
export const PLAIN_TURN_NUDGE =
  "(System: your last turn produced no message at all, so they are still waiting. Answer them now in your own voice as their coach texting — plain text, no lists, no bold. If you genuinely cannot tell what they meant, ask one short question about the specific thing that is unclear; never ask them to rephrase.)";

export interface PlainReplyOptions {
  contents: unknown[];
  firstParts: GeminiPart[];
  callGemini: GeminiLegCaller;
  /** Today's server-authored last resort. Always non-empty. */
  floor: string;
  log?: (...args: unknown[]) => void;
}

export async function resolvePlainReply(opts: PlainReplyOptions): Promise<ToolReplyResult> {
  const log = opts.log ?? (() => {});
  const own = sanitizeReply(textOf(opts.firstParts));
  if (own) return { reply: own, source: "first_leg", legs: 0 };

  let legs = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    legs++;
    const leg = await opts.callGemini(
      [...opts.contents, { role: "user", parts: [{ text: PLAIN_TURN_NUDGE }] }],
      false,
    );
    if (!leg.ok) {
      // Transport failure is retried once; an ok-but-silent answer is a model
      // choice that the same input would only repeat, so that is not.
      log("plain-reply: retry failed", { status: leg.status, error: leg.errorText });
      continue;
    }
    const dropped = callsOf(leg.parts);
    if (dropped.length > 0) log("plain-reply: retry returned calls with tools off — dropped", dropped.map((c) => c.name));
    const text = sanitizeReply(textOf(leg.parts));
    if (text) return { reply: text, source: "round_trip", legs };
    log("plain-reply: retry said nothing either");
    break;
  }
  return { reply: opts.floor, source: "floor", legs };
}
