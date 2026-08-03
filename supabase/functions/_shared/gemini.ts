// Shared across every edge function that calls the Gemini API
// (chat-gemini, macro-calibration, generate-meals) — gemini-2.5-flash was
// retired for new API keys (404: "no longer available to new users"), so
// this is the one place to bump when Google retires the next one.
export const GEMINI_MODEL = "gemini-3.5-flash";
