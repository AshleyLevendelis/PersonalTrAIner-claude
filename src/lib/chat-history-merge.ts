// ---------------------------------------------------------------------------
// WHAT THE SERVER WROTE INTO THE CHAT WHILE SHE WAS AWAY, folded into what the
// phone already shows (6 Nov 2026, her "like a WhatsApp notification").
//
// Since that day the coach's SERVER writes chat messages too: a reminder is a
// real coach message in the chat, and a reply that arrived after she left the
// app is saved there. The chat used to read the server once per app start and
// to keep its own copy whenever the server returned fewer messages than the
// screen held, so a message written by the server could simply never appear.
//
// THE RULE: never take away what the screen shows (its cards, chips and
// receipts exist only on this phone), add what is new, and fill in a reply the
// server finished while this phone was waiting on it.
// ---------------------------------------------------------------------------
import type { ChatMessage, PlanAction } from './types'

export interface ChatRow {
  id: string
  role: string
  content: string
  action_data?: unknown
  status?: string | null
  created_at?: string
}

/** A coach reminder's marker, written by the server into action_data. */
interface ReminderMarker {
  source: 'reminder'
  moment: string
  shortcut: 'exercise' | 'nutrition' | null
}

function reminderOf(actionData: unknown): ReminderMarker | null {
  if (!actionData || typeof actionData !== 'object') return null
  const a = actionData as Record<string, unknown>
  if (a.source !== 'reminder' || typeof a.moment !== 'string') return null
  const shortcut = a.shortcut === 'exercise' || a.shortcut === 'nutrition' ? a.shortcut : null
  return { source: 'reminder', moment: a.moment, shortcut }
}

function isPlanAction(a: unknown): a is PlanAction {
  return !!a && typeof a === 'object' && typeof (a as Record<string, unknown>).type === 'string'
}

/** One stored row as a chat message. A reminder's marker is its own field, never mistaken for a plan action. */
export function rowToMessage(row: ChatRow): ChatMessage {
  const reminder = reminderOf(row.action_data)
  return {
    id: row.id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    status: (row.status || 'complete') as ChatMessage['status'],
    // A plan action always names its type. Anything else stored there (a
    // lesson's record, coach-lessons.ts) is never drawn as an action.
    action: reminder || !isPlanAction(row.action_data) ? undefined : row.action_data,
    ...(reminder ? { reminder: { moment: reminder.moment, shortcut: reminder.shortcut } } : {}),
    created_at: row.created_at,
  }
}

/**
 * THE SCREEN PLUS WHAT IS NEW, never less.
 *
 * - A row this phone already shows is kept as the phone has it (its card or
 *   receipt is only here), except a reply still waiting here that the server
 *   has finished: that takes the server's words.
 * - A COACH row this phone has never seen, written after the newest message
 *   the phone and the server BOTH have, is added at the end: a reminder, or a
 *   reply saved while she was away. "After" is read on the server's clock
 *   alone: a message this phone added stamps its own time, and a phone clock
 *   running a few minutes fast would otherwise hide every new server message
 *   (found by verify:coach-texts-you, 6 Nov 2026).
 * - Her own rows are never added here: every one she sent from this phone is
 *   already on screen, without the id the server gave it, and adding it again
 *   would show it twice.
 *
 * Returns `prev` itself when nothing changed, so a re-read costs no redraw.
 */
export function addServerMessages(prev: ChatMessage[], loaded: ChatMessage[]): ChatMessage[] {
  const byId = new Map(loaded.filter(m => m.id).map(m => [m.id as string, m]))
  let changed = false
  const next = prev.map(m => {
    const server = m.id ? byId.get(m.id) : undefined
    if (server && m.status === 'pending' && server.status === 'complete' && server.content) {
      changed = true
      return { ...m, content: server.content, status: 'complete' as const, created_at: m.created_at ?? server.created_at }
    }
    return m
  })
  const shown = new Set(prev.map(m => m.id).filter(Boolean))
  // THE NEWEST MESSAGE BOTH SIDES HAVE, at the time the SERVER gave it. With
  // none in common there is nothing to place a new row after, so nothing is
  // added: a guess here would put a week-old message at the bottom.
  const shared = loaded.filter(m => m.id && shown.has(m.id) && m.created_at).map(m => m.created_at as string).sort()
  const newestShared = shared.length ? shared[shared.length - 1] : null
  const fresh = newestShared === null ? [] : loaded.filter(m =>
    !!m.id && !shown.has(m.id) && m.role === 'assistant' && m.status === 'complete' && !!m.content
    && !!m.created_at && m.created_at > newestShared)
  if (fresh.length === 0 && !changed) return prev
  return [...next, ...fresh]
}
