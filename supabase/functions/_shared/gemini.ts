// Shared across every edge function that calls the Gemini API
// (chat-gemini, macro-calibration, generate-meals) — gemini-2.5-flash was
// retired for new API keys (404: "no longer available to new users"), so
// this is the one place to bump when Google retires the next one.
export const GEMINI_MODEL = "gemini-3.5-flash";

/**
 * ONE SHORT LINE FROM THE COACH: a reminder or the chat opener (her ruling
 * 6 Nov 2026, "Coach writes, app checks"). Null on any failure, a slow answer
 * or no key, never a throw: the caller sends its fixed sentence instead, and
 * reminder-writer.ts checks every word of whatever comes back.
 */
export async function coachShortLine(prompt: string, timeoutMs = 8000): Promise<string | null> {
  const key = Deno.env.get("GEMINI_KEY") || Deno.env.get("VITE_GEMINI_KEY");
  if (!key) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          // A short text: thinking off so it cannot eat the small budget (generate-meals' finding).
          generationConfig: { temperature: 0.9, maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 } },
        }),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p: { text?: string }) => p.text ?? "").join("").trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
