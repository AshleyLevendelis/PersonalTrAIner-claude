// ---------------------------------------------------------------------------
// REPLY TO ONE MESSAGE, THE WHATSAPP WAY (his request 22 Nov 2026, "1, build it": swipe a message to the right, or
// press and hold it, to reply to that message).
//
// A reply carries a small quote of the message it answers: who said it and its first words. The quote is kept WITH
// the reply (in the reply's own saved row), so it still reads after a reload, and after the original has scrolled
// out of the loaded page.
//
// THE COACH IS TOLD WHICH MESSAGE, AND NEVER THROUGH HIS WORDS. The app checks what HE said before it builds some
// offers (a number he stated, "from now on", a maybe), so the quoted message is never pasted into his own turn: a
// coach sentence quoted there would read as his. Instead the turn he is answering is marked where it already sits in
// the conversation the coach is sent, and when it is older than that window it is put back at the start of it, at
// its own place in time.
//
// A "yes" sent as a reply answers the message it replies to: an open offer is confirmed only when the reply is to
// THAT offer (or to nothing). A yes to an older message goes to the coach, never to whichever offer is newest.
// ---------------------------------------------------------------------------

export type ReplyRole = 'user' | 'assistant'

export interface ReplyRef {
  /** The saved row's id, when the message has one (every saved message does). */
  id?: string
  role: ReplyRole
  /** Its first words, as the quote shows them. */
  excerpt: string
}

/** How long a quote may be, in characters, before it is cut at a word. */
export const EXCERPT_MAX = 120

/** The marker on the turn he is answering, in the conversation the coach is sent. */
export const REPLY_MARKER = '[↩ their new message replies to this one]'

/** A message's words as a quote shows them: no tags, no markdown marks, one line, cut at a word. */
export function replyExcerpt(content: string): string {
  const plain = (content ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= EXCERPT_MAX) return plain
  const cut = plain.slice(0, EXCERPT_MAX)
  const space = cut.lastIndexOf(' ')
  return `${(space > EXCERPT_MAX * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, '')}…`
}

/** The quote for a message on screen. */
export function replyRefFor(m: { id?: string; role: ReplyRole; content: string }): ReplyRef {
  return { ...(m.id ? { id: m.id } : {}), role: m.role, excerpt: replyExcerpt(m.content) }
}

/** The quote as saved with the reply (the reply row's action_data). */
export function replyActionData(ref: ReplyRef): { replyTo: ReplyRef } {
  return { replyTo: ref }
}

/** The quote back from a saved row, or null when the row is not a reply. */
export function replyRefOf(actionData: unknown): ReplyRef | null {
  if (!actionData || typeof actionData !== 'object') return null
  const r = (actionData as Record<string, unknown>).replyTo
  if (!r || typeof r !== 'object') return null
  const o = r as Record<string, unknown>
  if ((o.role !== 'user' && o.role !== 'assistant') || typeof o.excerpt !== 'string' || !o.excerpt.trim()) return null
  return { ...(typeof o.id === 'string' && o.id ? { id: o.id } : {}), role: o.role, excerpt: o.excerpt }
}

/** Is this message the one the quote names? By id when both have one, else by who said it and its words. */
function isReplyTarget(m: { id?: string; role: string; content: string }, ref: ReplyRef): boolean {
  if (ref.id && m.id) return m.id === ref.id
  return m.role === ref.role && replyExcerpt(m.content) === ref.excerpt
}

/** The newest message on screen the quote names, or -1 when it is not loaded. */
export function findReplyTarget(messages: Array<{ id?: string; role: string; content: string }>, ref: ReplyRef): number {
  for (let i = messages.length - 1; i >= 0; i--) if (isReplyTarget(messages[i], ref)) return i
  return -1
}

/**
 * Which open offer a free-text yes or no may answer. With no reply, the newest open offer (as before). As a reply,
 * only the offer it replies to, and only while that offer is still open: otherwise -1, and the words go to the coach.
 */
export function offerAnsweredBy(
  messages: Array<{ id?: string; role: string; content: string; pendingAction?: { status?: string } | null }>,
  ref: ReplyRef | null,
): number {
  if (!ref) {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].pendingAction?.status === 'pending') return i
    return -1
  }
  const i = findReplyTarget(messages, ref)
  return i !== -1 && messages[i].pendingAction?.status === 'pending' ? i : -1
}

/**
 * The conversation the coach is sent, with the turn he is answering marked. `window` is the turns as they would be
 * sent (each with the message it came from); `size` is the most the coach's server keeps. When the turn is in the
 * window it is marked where it is; when it is older, it is put back at the start (the oldest turn makes room, so the
 * server's own trim never drops it), carrying its own time stamp. When it cannot be found at all, its quote goes at
 * the start in its place.
 */
export function historyWithReply<M extends { id?: string; role: string; content: string }>(
  all: M[],
  window: Array<{ source: M; turn: { role: string; content: string } }>,
  ref: ReplyRef | null,
  size: number,
  stamp: (m: M) => string,
): Array<{ role: string; content: string }> {
  const turns = window.map(w => w.turn)
  if (!ref) return turns
  let idx = -1
  for (let k = window.length - 1; k >= 0; k--) if (isReplyTarget(window[k].source, ref)) { idx = k; break }
  if (idx !== -1) return turns.map((t, k) => (k === idx ? { ...t, content: `${REPLY_MARKER} ${t.content}` } : t))
  const at = findReplyTarget(all, ref)
  const earlier = { role: ref.role, content: `${REPLY_MARKER} ${at !== -1 ? stamp(all[at]) : ref.excerpt}` }
  const room = turns.length < size ? turns : turns.slice(turns.length - (size - 1))
  return [earlier, ...room]
}
