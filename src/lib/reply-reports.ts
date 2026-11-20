// ---------------------------------------------------------------------------
// REPORTING A COACH REPLY (20 Nov 2026, his choice "1, build it", for Google Play's rule on AI-generated content: a
// reply can be reported or flagged without leaving the app). One write, one table (coach_reply_reports). The reply's
// words are copied in, so a report survives "Clear chat". A write that fails says so and keeps the sheet open; nothing
// is queued for later, because a report the person thinks was sent and was not is the worse failure.
// ---------------------------------------------------------------------------
import { supabase } from './supabase'

export type ReportReason = 'wrong' | 'unsafe' | 'offensive' | 'other'

/** The four reasons, in the order the sheet shows them. */
export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'wrong', label: 'Wrong or misleading' },
  { key: 'unsafe', label: 'Unsafe advice' },
  { key: 'offensive', label: 'Offensive or inappropriate' },
  { key: 'other', label: 'Something else' },
]

/** The longest reply or note kept, so one report can never be enormous. */
const MAX_CHARS = 4000

export async function reportCoachReply(input: {
  profileId: string
  messageId: string | null
  replyText: string
  reason: ReportReason
  note: string
}): Promise<{ ok: true } | { ok: false }> {
  const reply = input.replyText.trim().slice(0, MAX_CHARS)
  if (!input.profileId || !reply) return { ok: false }
  const note = input.note.trim().slice(0, MAX_CHARS)
  // A message id the app made locally (not a database id) is not sent: the column holds real chat rows only.
  const messageId = input.messageId && /^[0-9a-f-]{36}$/i.test(input.messageId) ? input.messageId : null
  try {
    const { error } = await supabase.from('coach_reply_reports').insert({
      user_id: input.profileId,
      chat_message_id: messageId,
      reply_text: reply,
      reason: input.reason,
      note: note || null,
    })
    return error ? { ok: false } : { ok: true }
  } catch {
    return { ok: false }
  }
}
