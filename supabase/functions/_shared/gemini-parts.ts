// ---------------------------------------------------------------------------
// The Gemini response vocabulary the reply-recovery modules share.
//
// Lifted out of onboarding-chat/reply-resolver.ts on 8 Sep 2026 when
// chat-gemini grew its own second pass (tool-reply.ts). Both functions bundle
// _shared, so one copy of "what is a part, what is a leg, what is a leak"
// serves both — the alternative was a second sanitizeReply that would drift
// from the first the next time a leak shape was measured.
//
// Deno-free on purpose: imported by tsx gates as well as by both functions.
// ---------------------------------------------------------------------------

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}
export type GeminiPart = { text?: string; functionCall?: GeminiFunctionCall };

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
 * parenthetical explaining the model's own logic to itself ("(Note: the user
 * didn't specify days, so I need to present the training days option.)"),
 * and a reply that IS bare tool-call/JSON syntax instead of the functionCall
 * part it should have been. Neither belongs in a text message a real coach
 * would send. The prompts say not to do either; this is the deterministic
 * backstop for when the model does anyway. It runs on EVERY leg's output,
 * inside the recovery chains — a reply sanitized to empty triggers the next
 * leg rather than shipping as silence.
 */
export function sanitizeReply(text: string): string {
  const stripped = text.replace(/\s*\((?:note|internal|system)\s*[:\-][^)]*\)\s*$/i, "").trim();
  if (/^\{[\s\S]*"(?:name|actions|slot_key|functionCall)"/.test(stripped)) return "";
  return stripped;
}
