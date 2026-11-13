// ---------------------------------------------------------------------------
// WHAT THE COACH SAID UNPROMPTED, AND WHETHER HE ANSWERED — his strategy of 13 Nov 2026, slice 1 "Measurement"
// (docs/plans/measurement.md). One row per unprompted message in `coach_moment_log`, kept apart from the chat so
// "Clear chat" cannot take it. Everything here is BEST-EFFORT and never blocks the chat: before the migration the table
// is missing, and each call warns once and does nothing.
// ---------------------------------------------------------------------------
import { supabase } from './supabase'

export type MomentSurface = 'chat' | 'phone'
export type MomentAnswer = 'replied' | 'tapped'

/** How long after a moment the next thing he sends still counts as answering it. */
export const ANSWER_WINDOW_MS = 12 * 3600 * 1000

export interface MomentLogRow {
  id: string
  moment: string
  surface: MomentSurface
  chat_message_id: string | null
  sent_at: string
  answered_at: string | null
  answer: MomentAnswer | null
}

/**
 * WHICH MOMENT A MESSAGE OF HIS ANSWERS: the newest one of the last 12 hours, and only if it is still unanswered.
 * A moment with a newer one after it is never answered late: he is replying to the newer one.
 */
export function answerTarget(rows: Pick<MomentLogRow, 'id' | 'sent_at' | 'answered_at'>[], nowMs: number): string | null {
  const newest = [...rows].sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at))[0]
  if (!newest || newest.answered_at) return null
  const age = nowMs - Date.parse(newest.sent_at)
  return age >= 0 && age <= ANSWER_WINDOW_MS ? newest.id : null
}

let warned = false
function warnOnce(what: string, error: unknown) {
  if (warned) return
  warned = true
  console.warn(`moment log: ${what} failed (the measurement table may not exist yet); the chat carries on`, error)
}

/** A moment the coach just sent, on the chat or a phone. */
export async function recordMomentSent(profileId: string, entry: { moment: string; surface: MomentSurface; chatMessageId?: string | null; sentAt?: string }): Promise<void> {
  if (!profileId) return
  try {
    const { error } = await supabase.from('coach_moment_log').insert({
      user_id: profileId, moment: entry.moment, surface: entry.surface,
      chat_message_id: entry.chatMessageId ?? null, ...(entry.sentAt ? { sent_at: entry.sentAt } : {}),
    })
    if (error) warnOnce('recording a sent moment', error)
  } catch (e) { warnOnce('recording a sent moment', e) }
}

/**
 * He answered. 'replied': the next thing he sends answers the newest unanswered moment of the last 12 hours.
 * 'tapped': a tap on a reminder's shortcut answers THAT moment, by its chat row.
 */
export async function markMomentAnswered(profileId: string, how: MomentAnswer, chatMessageId?: string | null, nowMs: number = Date.now()): Promise<void> {
  if (!profileId) return
  try {
    const at = new Date(nowMs).toISOString()
    if (how === 'tapped' && chatMessageId) {
      const { error } = await supabase.from('coach_moment_log').update({ answered_at: at, answer: 'tapped' })
        .eq('user_id', profileId).eq('chat_message_id', chatMessageId).is('answered_at', null)
      if (error) warnOnce('marking a moment tapped', error)
      return
    }
    const since = new Date(nowMs - ANSWER_WINDOW_MS).toISOString()
    const { data, error } = await supabase.from('coach_moment_log').select('*')
      .eq('user_id', profileId).gte('sent_at', since).order('sent_at', { ascending: false }).limit(1)
    if (error) { warnOnce('reading the moments', error); return }
    const id = answerTarget((data ?? []) as MomentLogRow[], nowMs)
    if (!id) return
    const { error: upd } = await supabase.from('coach_moment_log').update({ answered_at: at, answer: how }).eq('id', id).eq('user_id', profileId)
    if (upd) warnOnce('marking a moment answered', upd)
  } catch (e) { warnOnce('marking a moment answered', e) }
}
