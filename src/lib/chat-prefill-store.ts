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

export function setChatPrefill(text: string): void {
  try { sessionStorage.setItem(KEY, text) } catch { /* private mode — the tab change still happens */ }
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
