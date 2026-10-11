// ---------------------------------------------------------------------------
// THE FINISH CARD, KEPT FOR THE DAY — design handoff 2a, 10 Oct 2026.
//
// The summary a person sees when they tap Finish was React state inside the
// Exercise tab, so it existed until that tab unmounted: leave for Home and
// "View summary" was greyed out for the rest of the day, and Home's new Done
// panel ("Summary ›") had nothing to open. It is written here at the moment
// it is computed and read back by both screens.
//
// THIS PHONE, THIS DAY. Local storage, keyed by profile and date — the card
// is a receipt of what was computed when she tapped Finish, not a record the
// server holds (the sets themselves are). A finish on another device simply
// has no card here, and the screens say nothing rather than invent one.
// ---------------------------------------------------------------------------
import type { SessionSummaryData } from '@/components/exercise/SessionSummaryDialog'

const KEY = 'fitplan_session_summary_v1:'

export function saveSessionSummary(profileId: string, date: string, data: SessionSummaryData): void {
  try { localStorage.setItem(`${KEY}${profileId}`, JSON.stringify({ date, data })) } catch { /* full or blocked: the card still shows now */ }
}

/** Today's card, or null — a card from another day is never handed back. */
export function readSessionSummary(profileId: string | undefined, date: string | undefined): SessionSummaryData | null {
  if (!profileId || !date) return null
  try {
    const raw = localStorage.getItem(`${KEY}${profileId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { date?: string; data?: SessionSummaryData }
    return parsed?.date === date && parsed.data?.summary ? parsed.data : null
  } catch {
    return null
  }
}
