// ---------------------------------------------------------------------------
// WHAT THE CHAT SHOWS WHEN THE COACH KEPT SOMETHING (7 Nov 2026).
//
// A save the coach makes as it answers ("it's been a rough few weeks") used to
// come back with an empty reply, so the message was the app's own receipt line
// ("Saved: ...") and the coach said nothing. The coach now answers alongside the
// save. Its words are the message; the save keeps its small note (the receipt)
// beneath it, so "no silent writes" still holds.
//
// The app's own words still win wherever they say something the coach's cannot:
// a save that did not happen and asks a question back ("What should I remember
// that about, specifically?") has no receipt, and that question is the message.
// ---------------------------------------------------------------------------

export function textBesideSave<T extends { text: string; receipt?: unknown }>(saved: T, coachSaid: string | null | undefined): T {
  const spoken = (coachSaid ?? '').trim()
  if (!spoken) return saved
  if (saved.receipt) return { ...saved, text: spoken }
  return saved.text.trim() ? saved : { ...saved, text: spoken }
}
