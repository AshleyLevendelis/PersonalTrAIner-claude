// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §2.6, D2 — server-side imperative classification.
// Deno-side copy of src/lib/imperative-classifier.ts: the edge function
// runtime can't import from src/lib (different module resolution/runtime —
// same reason slugifyExerciseName is duplicated in chat-gemini/index.ts
// rather than imported from exercise-db.ts). Keep the two in lockstep; the
// logic is intentionally tiny so drift is cheap to catch by inspection.
// ---------------------------------------------------------------------------

export type ClassificationResult =
  | { imperative: true }
  | { imperative: false; reason: 'not_verbatim' | 'interrogative' | 'negation' | 'no_imperative_verb' };

// Memory & goals (VISION-ARCHITECTURE.md §1) widened this list beyond the
// original plan-mutation verbs — see src/lib/imperative-classifier.ts's
// matching comment (keep the two files in lockstep).
export const IMPERATIVE_VERBS = [
  'swap', 'replace', 'change', 'switch', 'move', 'cut', 'remove', 'add',
  'ban', 'avoid', 'set', 'adjust', 'reduce', 'increase', 'log', 'record',
  'hate', 'dislike', 'love', 'prefer', 'want', 'need', 'exclude',
];

const INTERROGATIVE_LEAD_RE = /^\s*(what|why|how|when|where|which|who|can|could|should|would|is|are|do|does|did)\b/i;
const NEGATION_RE = /\b(didn'?t|did not|couldn'?t|could not|won'?t|will not|not able|skipped|missed|forgot|never)\b/i;
const IMPERATIVE_VERB_RE = new RegExp(`\\b(${IMPERATIVE_VERBS.join('|')})\\b`, 'i');

export function classifyImperative(verbatimQuote: string, fullUserMessage: string): ClassificationResult {
  const quote = (verbatimQuote || '').trim();
  if (!quote) return { imperative: false, reason: 'no_imperative_verb' };

  if (!fullUserMessage.toLowerCase().includes(quote.toLowerCase())) {
    return { imperative: false, reason: 'not_verbatim' };
  }
  if (quote.endsWith('?') || INTERROGATIVE_LEAD_RE.test(quote)) {
    return { imperative: false, reason: 'interrogative' };
  }
  if (NEGATION_RE.test(quote)) {
    return { imperative: false, reason: 'negation' };
  }
  if (!IMPERATIVE_VERB_RE.test(quote)) {
    return { imperative: false, reason: 'no_imperative_verb' };
  }
  return { imperative: true };
}
