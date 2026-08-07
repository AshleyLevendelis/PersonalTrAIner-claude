// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §2.6, D2 — server-side imperative classification.
// The incident this exists to prevent: "I didn't train today" is a
// substring of itself, so a bare verbatim-quote check is a null gate. This
// is the deterministic classifier behind that quote — closed verb list plus
// interrogative/negation heuristics, no model cooperation required. A
// non-imperative quote downgrades a propose_* tool call to an `offer`
// (D3): no Confirm button, no pending_actions row, no write.
//
// Pure, sync, no I/O — same shape as set-parse.ts. Deliberately conservative:
// on any doubt this errs toward `imperative: false` (an offer), never toward
// a proposal, since the cost of a missed offer is one extra tap and the
// cost of a false proposal is the exact incident this framework prevents.
// ---------------------------------------------------------------------------

export type ClassificationResult =
  | { imperative: true }
  | { imperative: false; reason: 'not_verbatim' | 'interrogative' | 'negation' | 'no_imperative_verb' }

/**
 * Closed list — the tool call must be triggered by one of these, spoken as
 * the quote's main verb. Memory & goals (VISION-ARCHITECTURE.md §1)
 * extended this list beyond the original plan-mutation verbs: a stated
 * preference is naturally phrased as "I hate X" / "I dislike Y" / "I
 * prefer Z", not as a command verb like swap/ban — reusing this same
 * classifier for record_fact/record_goal (deliberately, per §1 Part 2's
 * "conservative capture, same bar as plan mutations") needed the verb list
 * widened to actually recognize that phrasing, or every naturally-worded
 * preference statement would silently downgrade to an offer forever.
 * Same reasoning added 'ease'/'rest' for propose_injury_adaptation /
 * propose_equipment_adaptation — those flows are deliberately conversational
 * ("let's ease off it for a week"), not command syntax. This still never
 * accepts a bare "yes" (no real verb in the quote) — that invariant is
 * intentional, see test-pending-actions.ts's regression test for why.
 */
export const IMPERATIVE_VERBS = [
  'swap', 'replace', 'change', 'switch', 'move', 'cut', 'remove', 'add',
  'ban', 'avoid', 'set', 'adjust', 'reduce', 'increase', 'log', 'record',
  'hate', 'dislike', 'love', 'prefer', 'want', 'need', 'exclude',
  'ease', 'rest',
] as const

const INTERROGATIVE_LEAD_RE = /^\s*(what|why|how|when|where|which|who|can|could|should|would|is|are|do|does|did)\b/i

const NEGATION_RE = /\b(didn'?t|did not|couldn'?t|could not|won'?t|will not|not able|skipped|missed|forgot|never)\b/i

const IMPERATIVE_VERB_RE = new RegExp(`\\b(${IMPERATIVE_VERBS.join('|')})\\b`, 'i')

/**
 * `verbatimQuote` is what the model claims triggered the tool call — asserted
 * against `fullUserMessage` first (a paraphrase is not a valid trigger), then
 * run through the negation/interrogative/verb checks.
 */
export function classifyImperative(verbatimQuote: string, fullUserMessage: string): ClassificationResult {
  const quote = verbatimQuote.trim()
  if (!quote) return { imperative: false, reason: 'no_imperative_verb' }

  if (!fullUserMessage.toLowerCase().includes(quote.toLowerCase())) {
    return { imperative: false, reason: 'not_verbatim' }
  }

  if (quote.endsWith('?') || INTERROGATIVE_LEAD_RE.test(quote)) {
    return { imperative: false, reason: 'interrogative' }
  }

  if (NEGATION_RE.test(quote)) {
    return { imperative: false, reason: 'negation' }
  }

  if (!IMPERATIVE_VERB_RE.test(quote)) {
    return { imperative: false, reason: 'no_imperative_verb' }
  }

  return { imperative: true }
}
