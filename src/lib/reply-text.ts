// ---------------------------------------------------------------------------
// THE COACH'S REPLY AS SHE READS IT: the markers the coach's model writes for
// the app ([ACTION: …], [QUICK_REPLIES: …], [BREAK]) taken out, so what is
// left is the sentence on screen.
//
// One definition for two readers since 6 Nov 2026: the chat (ChatAssistant)
// and the coach's server, which now saves a reply into the chat and sends it
// to her phone when she has left the app. A copy lives in
// supabase/functions/_shared/reply-text.ts (no edge function imports src/),
// held equal by test:coach-texts-you.
// ---------------------------------------------------------------------------

export const ACTION_TAG_RE = /\[ACTION:\s*.*?\]/gi
export const QUICK_REPLIES_RE = /\[QUICK_REPLIES:\s*(.*?)\]/gi
const BREAK_TAG_RE = /^[ \t]*\[BREAK\][ \t]*$/gim

/** A [BREAK] line is a paragraph break, never a word. */
export function applyMessageBreaks(text: string): string {
  return text.replace(BREAK_TAG_RE, '\n')
}

/** The reply with every app marker removed, trimmed. */
export function cleanReplyText(text: string): string {
  return applyMessageBreaks(text).replace(ACTION_TAG_RE, '').replace(QUICK_REPLIES_RE, '').trim()
}
