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

/** Closed list — the tool call must be triggered by one of these, spoken as the quote's main verb. */
export const IMPERATIVE_VERBS = [
  'swap', 'replace', 'change', 'switch', 'move', 'cut', 'remove', 'add',
  'ban', 'avoid', 'set', 'adjust', 'reduce', 'increase', 'log', 'record',
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
