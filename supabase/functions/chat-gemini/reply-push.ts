// ---------------------------------------------------------------------------
// THE COACH'S REPLY, SAVED IN THE CHAT AND TEXTED TO HER PHONE.
//
// Ashley, 6 Nov 2026: "even when you're having a back and forth chat with the
// coach just like a normal text or WhatsApp conversation notification. And
// when you open it, it's the same message in the chat." The page used to be
// the only thing that saved a reply, so leaving the app mid-reply could lose
// it, and nothing told her one had come.
//
// So once a reply is ready, the function:
//   1. writes a PLAIN reply into the chat row the app made for it (the same
//      words the app would show: app markers removed, see reply-text.ts);
//   2. texts it to her phones, titled with the coach's name. The phone shows
//      it only if she is not looking at the app (public/sw.js), so an answer
//      she is watching arrive never pops up over itself.
//
// WHAT IT WILL NOT DO, and why each matters:
//   - Write anywhere but THAT row. The function cannot see who is asking (the
//     app calls it with the public key), so the row the app created a moment
//     ago — its id, her profile id, a coach row, minutes old — is the proof the
//     reply is hers. No such row, no write and no push.
//   - Write a CARD turn's words. On a turn with a card, the app writes the
//     bubble itself (the model's own text is never shown, D1), so the server
//     leaves the row alone and the push says only that a reply is waiting.
//   - Count against her daily reminders. She asked; the coach is answering.
//     It obeys only her "Message me when the coach replies" switch.
//
// Everything that touches the world is handed in, so test:coach-texts-you
// drives this exact code with fakes; index.ts wires the real ones.
// ---------------------------------------------------------------------------
import { cleanReplyText } from '../_shared/reply-text.ts'
import { COACH_SENDER, type PushPayload, type PushSubscriptionRow } from '../_shared/reach-out.ts'
import { REPLY_WAITING, type NotificationSettings } from '../_shared/coach-moments.ts'

/** How old the app's row may be: a reply comes within the request's 45 seconds, so ten minutes is generous. */
export const ROW_FRESH_MS = 10 * 60_000

/** How much of a long reply the notification carries. The chat has the rest. */
export const PREVIEW_CHARS = 180

/** The keys on a reply that mean the app, not the model, writes this turn's bubble. */
const APP_AUTHORED = ['action', 'proposal', 'receipt', 'offer', 'logWorkout', 'memoryIntent', 'groceryIntent', 'waterIntent', 'feelIntent'] as const

export interface ReplyRow { id: string; profile_id: string; role: string; created_at: string }

export interface ReplyPushDeps {
  now: Date
  /** The row by id AND profile, or null. */
  loadRow(id: string, profileId: string): Promise<ReplyRow | null>
  /** Fill the row with the finished reply. */
  completeRow(id: string, profileId: string, content: string): Promise<void>
  loadSettings(profileId: string): Promise<NotificationSettings>
  listSubscriptions(profileId: string): Promise<PushSubscriptionRow[]>
  send(sub: PushSubscriptionRow, payload: PushPayload): Promise<'ok' | 'gone' | 'failed'>
  dropSubscription(id: string): Promise<void>
}

export type ReplyPushOutcome =
  | 'no_row' | 'not_a_reply' | 'not_hers' | 'switched_off' | 'no_phone' | 'sent' | 'not_delivered'

/** The text a phone shows: the reply's first sentences, cut at a word, never mid-word. */
export function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= PREVIEW_CHARS) return flat
  const cut = flat.slice(0, PREVIEW_CHARS)
  const space = cut.lastIndexOf(' ')
  return `${(space > 80 ? cut.slice(0, space) : cut).trim()}…`
}

/**
 * ONE FINISHED REPLY: save it in its row and text it to her phone.
 * `request` is the body the app sent; `reply` is the response body going back.
 */
export async function deliverReply(
  request: unknown,
  reply: unknown,
  status: number,
  deps: ReplyPushDeps,
): Promise<ReplyPushOutcome> {
  const req = (request && typeof request === 'object' ? request : {}) as Record<string, unknown>
  const placeholderId = typeof req.placeholder_id === 'string' ? req.placeholder_id : null
  const context = (req.context && typeof req.context === 'object' ? req.context : {}) as Record<string, unknown>
  const profileId = typeof context.profile_id === 'string' ? context.profile_id : null
  if (!placeholderId || !profileId) return 'no_row'
  if (!/^[0-9a-f-]{36}$/i.test(placeholderId) || !/^[0-9a-f-]{36}$/i.test(profileId)) return 'no_row'

  const body = (reply && typeof reply === 'object' ? reply : {}) as Record<string, unknown>
  if (status !== 200 || typeof body.reply !== 'string') return 'not_a_reply'

  // THE PROOF IT IS HERS: the app's own fresh coach row, by id and profile.
  const row = await deps.loadRow(placeholderId, profileId)
  if (!row || row.profile_id !== profileId || row.role !== 'assistant') return 'not_hers'
  const age = deps.now.getTime() - Date.parse(row.created_at)
  if (!(age >= -60_000 && age <= ROW_FRESH_MS)) return 'not_hers'

  const appWritesIt = APP_AUTHORED.some(k => body[k] != null)
  const words = appWritesIt ? '' : cleanReplyText(body.reply)
  if (words) await deps.completeRow(placeholderId, profileId, words)

  const settings = await deps.loadSettings(profileId)
  if (settings.coach_reply === false) return 'switched_off'
  const devices = await deps.listSubscriptions(profileId)
  if (devices.length === 0) return 'no_phone'

  const payload: PushPayload = {
    title: COACH_SENDER,
    body: words ? preview(words) : REPLY_WAITING,
    moment: 'coach_reply',
    url: '/#/tab/chat',
    messageId: placeholderId,
  }
  let delivered = false
  for (const device of devices) {
    const outcome = await deps.send(device, payload)
    if (outcome === 'ok') delivered = true
    else if (outcome === 'gone') await deps.dropSubscription(device.id)
  }
  return delivered ? 'sent' : 'not_delivered'
}
