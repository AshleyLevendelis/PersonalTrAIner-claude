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

// ---------------------------------------------------------------------------
// THE NOTE A SAVE LEAVES (7 Nov 2026, her "fix the save note wording too").
//
// The note under a save showed the coach's own label for what it kept, and on
// the exam's disordered-eating turn that label read "Compensatory exercise
// pattern ... & extreme restriction (600 kcal rest day)": a clinical verdict
// about her, on her screen and her Profile. The coach is now told to write the
// label in plain, kind words; and because that is a model's choice, the app
// checks it: a label that diagnoses, judges or names a disorder is replaced by
// HER OWN WORDS, which can never be a verdict about her. A better source, not a
// weaker rule.
// ---------------------------------------------------------------------------

/** Words that make a label a clinical or judging verdict about her, rather than a note of what she said. */
const VERDICT_WORDS = /\b(?:disorder\w*|disordered|compensat\w*|restrict\w*|extreme\w*|binge\w*|purg\w*|starv\w*|patho\w*|obsess\w*|compulsi\w*|depress\w*|anxiety|anxious disorder|low mood|symptom\w*|diagnos\w*|unhealthy|dangerous|problem(?:atic)?|issue with|addict\w*|self[- ]harm\w*|pattern|behaviou?r)\b/i

const MAX_NOTE = 80

/** The text a context save keeps and shows: the coach's label when it is a plain note, else her own words. */
export function contextNoteText(displayText: string, rawPhrase: string): string {
  const label = displayText.trim()
  if (label && !VERDICT_WORDS.test(label)) return label
  const said = rawPhrase.trim().replace(/\s+/g, ' ')
  const short = said.length > MAX_NOTE ? `${said.slice(0, MAX_NOTE - 1).replace(/\s+\S*$/, '')}…` : said
  return `“${short}”`
}
