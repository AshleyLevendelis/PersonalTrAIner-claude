// ---------------------------------------------------------------------------
// A question handed from another tab to the chat composer.
//
// Home's coach bubble offers two reply chips. Tapping one moves to the chat
// tab AND fills the composer — deliberately NOT sending it. The user gets to
// see, edit, or abandon the question before it becomes a message: a chip that
// fires a request the moment it is touched turns a suggestion into a command,
// and the whole point of the chips is that the follow-up is theirs to ask.
//
// sessionStorage rather than a module variable: the chat tab is a route away,
// and a hard reload between the tap and the arrival must not silently drop
// the text. Cleared on read, so a prefill is used once and never re-appears
// on a later visit.
// ---------------------------------------------------------------------------
const KEY = 'fitplan_chat_prefill_v1'

/**
 * THE CHAT IS ALWAYS MOUNTED (App forceMounts it), so "read once on mount"
 * read once per app open: a question handed over later sat in storage and
 * the box stayed empty. Found tracing Home's "Ask ↗" (design handoff 2a,
 * 10 Oct 2026). Setting one now also says so, and the chat takes it then.
 */
export const CHAT_PREFILL_EVENT = 'fitplan-chat-prefill'

export function setChatPrefill(text: string): void {
  try { sessionStorage.setItem(KEY, text) } catch { /* private mode — the tab change still happens */ }
  try { window.dispatchEvent(new Event(CHAT_PREFILL_EVENT)) } catch { /* no window (tests) */ }
}

/** Reads and CLEARS. Returns '' when nothing is waiting. */
export function takeChatPrefill(): string {
  try {
    const v = sessionStorage.getItem(KEY) ?? ''
    if (v) sessionStorage.removeItem(KEY)
    return v
  } catch {
    return ''
  }
}
