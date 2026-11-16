// A QUESTION GETS AN ANSWER, THEN THE OFFER — his ruling 16 Nov 2026, "Answer, then offer".
//
// His report: "it doesn't seem to understand the difference between me asking a question and a request." Measured:
// of the coach's change tools only four ask whether he asked or told, and every turn carrying an offer drops the
// coach's own words (D1: the client's copy is the only copy, so a model sentence can never claim a change that has
// not happened). So "should I swap squats for leg press?" came back as "I can swap ..." with Apply, and no answer.
//
// Now, on a turn where HE ASKED and the coach reached for an offer, a second short call (tools off) writes the answer:
// yes or no and the main reason, in a line or two. It goes above the app's own offer. The answer is checked before it
// is used and dropped (the old turn, offer only) when it fails: it may not say anything was done, may carry no number
// (the numbers are the card's, and two sources is how they come to disagree), may not ask a question (the offer IS
// the question), and must be short. An instruction ("swap it", "can you swap it?") still goes straight to the offer.

import { detectPlanClaim } from "../_shared/plan-claim.ts";

/** Polite requests are phrased as questions and are still requests. */
const POLITE_REQUEST = /^\s*(?:(?:can|could|will|would)\s+you\b|(?:would|do)\s+you\s+mind\b|please\b)|\bplease\b/i;
const QUESTION_LEAD = /^\s*(?:what|why|how|when|where|which|who|should|shall|can|could|would|will|is|are|am|do|does|did|was|were|has|have|any)\b/i;

/** Did he ASK something (a question to answer), rather than tell the coach to do something? */
export function askedAQuestion(message: string): boolean {
  const text = (message ?? "").trim();
  if (!text) return false;
  // Judged on the last sentence: "I've got a sore knee. Should I skip squats?" is a question.
  const last = text.split(/(?<=[.!?])\s+/).filter(Boolean).pop() ?? text;
  if (POLITE_REQUEST.test(last)) return false;
  return last.endsWith("?") || QUESTION_LEAD.test(last);
}

export const ANSWER_FIRST_NUDGE =
  "He ASKED a question; he did not ask you to do anything yet. Nothing has been changed. Answer his question in one " +
  "or two short sentences, the way a coach would text it: yes or no (or which), and the main reason, from what you " +
  "know about him and his plan. Do not say you have done, changed, added or swapped anything. Do not write any " +
  "number. Do not ask a question and do not offer to do it: the app shows him an offer with Apply and Not now right " +
  "under your answer.";

const DID_SOMETHING = /\b(?:i'?ve|i have|i'?ll|i will|i'?m going to|done|added|swapped|changed|moved|updated|logged|booked|scheduled)\b/i;

/** Why an answer may not be used, or null when it may. */
export function answerProblem(text: string): string | null {
  const t = (text ?? "").trim();
  if (!t) return "empty";
  if (t.length > 320) return "too long";
  if (/\d/.test(t)) return "carries a number";
  if (t.includes("?")) return "asks a question";
  if (DID_SOMETHING.test(t) || detectPlanClaim(t)) return "says something was done";
  return null;
}

export interface AnswerFirstDeps {
  message: string;
  contents: unknown[];
  firstParts: unknown[];
  name: string;
  args: unknown;
  callLeg: (turns: unknown[], withTools: boolean) => Promise<{ ok: boolean; parts: Array<{ text?: string }> }>;
  log?: (...a: unknown[]) => void;
}

/** A tool turn's response, with the answer put first when he asked and the turn is an offer with no words. */
export async function answerFirst(res: Response, d: AnswerFirstDeps): Promise<Response> {
  if (!askedAQuestion(d.message)) return res;
  const body = await res.clone().json().catch(() => null) as { reply?: unknown; proposal?: { rawArgs?: Record<string, unknown> } } | null;
  if (!body || !body.proposal || (typeof body.reply === "string" && body.reply.trim())) return res;
  // "How much should I have?" is already answered by the app's own words (his "App sizes it").
  if (body.proposal.rawArgs?.as_suggestion === true) return res;
  const turns: unknown[] = [
    ...d.contents,
    { role: "model", parts: d.firstParts.filter((p) => (p as { functionCall?: unknown }).functionCall) },
    { role: "user", parts: [{ functionResponse: { name: d.name, response: { result: "Nothing has been changed. The app will show him an offer under your answer." } } }] },
    { role: "user", parts: [{ text: ANSWER_FIRST_NUDGE }] },
  ];
  const leg = await d.callLeg(turns, false).catch(() => ({ ok: false, parts: [] as Array<{ text?: string }> }));
  const text = leg.ok ? leg.parts.map((p) => p.text ?? "").join("").trim() : "";
  const problem = answerProblem(text);
  d.log?.(`answer-first tool=${d.name} ${problem ? `dropped=${problem}` : "used"}`);
  if (problem) return res;
  return new Response(JSON.stringify({ ...body, reply: text, answer_first: true }), { status: res.status, headers: res.headers });
}
