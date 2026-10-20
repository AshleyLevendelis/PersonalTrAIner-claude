// ---------------------------------------------------------------------------
// AN OFFER IS A TEXT, NOT A CARD — the facts of a coach's offer as lines of
// the coach's own message.
//
// Ashley's ruling, 20 Oct 2026, from three options: **"Text + small buttons
// always."** In her words: "I told it i dont have bands and it offered to swap
// but the cards dont feel like a real trainer offering a swap. A real trainer
// wouldn't immediately send a card. It should be just a text question and then
// a smaller button to approve the swap." It covers EVERY offer, a rebuild
// included, whose list of changes goes into the message. It reverses her
// 24 Sep line that kept the Apply cards for changes she asks for.
//
// WHAT DID NOT CHANGE: every fact the card showed is still shown before the
// tap (nothing changes silently; a cost is stated before the tap). The rows a
// builder writes are the same rows; this only says them as lines.
//
// ONE CHANGE, ONE LINE. A plan-wide change (kit, injury) repeats the same swap
// on day after day, which the card drew as a stack of struck-through rows. A
// text says it once and names the days: "Fri 18 Sep, Mon 21 Sep: Barbell
// Squats → Smith Machine Squat". Rows are grouped only when the change AND its
// note are identical, so nothing a row said is lost; past four days the line
// names the first three and counts the rest, the way the kit offer already
// counts days past its sixth ("…and 44 more days").
//
// Pure and import-light: the chat client reads it, and a gate calls it.
// ---------------------------------------------------------------------------

import type { DiffRow } from './pending-actions-store'

export interface OfferChange {
  /** Who or when: a day, "Your kit", "Calories". Several, joined, for a grouped change. */
  label: string
  /** What it was, or null when the row names no "before" worth saying. */
  from: string | null
  /** What it becomes, or null when the label already says it goes ("Taking out"). */
  to: string | null
  /** The row's "before" was a dash: nothing goes, this only comes in. */
  added?: boolean
  note?: string
}

/** How many labels one grouped line names before it counts the rest. */
export const OFFER_LABELS_NAMED = 3

const blank = (s: string | undefined | null) => s == null || s.trim() === '' || s.trim() === '—'

/** "a, b and c" — the shape the rest of the app's sentences use. */
function joinLabels(labels: string[]): string {
  if (labels.length <= OFFER_LABELS_NAMED + 1) {
    return labels.length <= 1 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
  }
  const shown = labels.slice(0, OFFER_LABELS_NAMED)
  return `${shown.join(', ')} and ${labels.length - shown.length} more`
}

/**
 * The rows of an offer as changes to say, in the order they first appear, with identical changes said once.
 */
export function offerChanges(rows: DiffRow[]): OfferChange[] {
  const groups: { rows: DiffRow[]; key: string }[] = []
  for (const row of rows) {
    // Only a CHANGE is said once for several labels: with nothing before it, a row is an item of a list (today's
    // session, block by block), and two items with the same dose are still two things, in their own order.
    const key = blank(row.before)
      ? JSON.stringify(['item', groups.length])
      : JSON.stringify([row.before ?? '', row.after ?? '', row.note ?? ''])
    const g = groups.find(x => x.key === key)
    if (g) g.rows.push(row)
    else groups.push({ key, rows: [row] })
  }
  return groups.map(({ rows: rs }) => {
    const r = rs[0]
    const labels = [...new Set(rs.map(x => x.field).filter(f => !blank(f)))]
    const before = blank(r.before) ? null : r.before
    // "— left out", "— removed (no safe alternative)": the dash is the card's strike-through, said in words already.
    const after = blank(r.after) ? null : r.after.replace(/^—\s+/, '')
    return {
      label: joinLabels(labels),
      // A row that names the same thing either side ("not scheduled" → "not scheduled") has only one thing to say.
      from: before != null && before !== after ? before : null,
      to: after,
      ...(r.before?.trim() === '—' && after != null ? { added: true } : {}),
      ...(r.note ? { note: r.note } : {}),
    }
  })
}

/**
 * One change as the plain sentence the bubble reads: "Mon: Band Pull-Aparts → Face Pulls (+1 set)".
 * A row whose "before" is a dash ADDS its "after"; one whose "after" is a dash leaves its label to say what goes.
 */
export function offerChangeText(c: OfferChange): string {
  const what = c.from && c.to ? `${c.from} → ${c.to}` : c.added && c.to ? `adds ${c.to}` : c.to ?? c.from ?? ''
  const head = c.label ? `${c.label}: ${what}` : what
  return c.note ? `${head} (${c.note})` : head
}
