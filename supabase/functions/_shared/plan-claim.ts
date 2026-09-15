// ---------------------------------------------------------------------------
// Deno-side copy of src/lib/plan-claim.ts. The edge function runtime cannot
// import from src/lib (different module resolution), the same reason
// imperative-classifier.ts is duplicated. KEEP THE TWO IN LOCKSTEP —
// test:no-false-claim compares them and fails if they drift.
//
// Both copies are needed, and not for symmetry: the SERVER copy refuses the
// model's sentence before it is ever sent, and the CLIENT copy is the last
// thing before the screen. They ship independently — the frontend merges on a
// push, the edge function is deployed by hand afterwards — so for the window
// between those two, the client copy is the only one running.
// ---------------------------------------------------------------------------

/** Things the coach can claim to have done to a plan. */
const AGENT_VERB =
  'swapped|switched|replaced|moved|shifted|rescheduled|marked|logged|recorded|' +
  'removed|added|updated|changed|cancelled|canceled|set|put|booked|scheduled|sorted'

/** A determiner, so a bare noun in ordinary advice does not qualify. */
const DET = "your|the|that|those|these|today's|tomorrow's|yesterday's|this week's|next week's"

/** The things in this app that a change would be a change TO. */
const NOUN =
  'session|sessions|workout|workouts|training|lift|lifting|weights|day|days|week|' +
  'schedule|plan|programme|program|meal|meals|breakfast|lunch|dinner|diary|log'

const DAY_WORD = 'today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday'

/** "I've swapped", "we moved", "I have already marked". */
const I_DID = new RegExp(
  `\\b(?:i|we)\\s*(?:'ve|'ve just|have|had)?\\s*(?:just |already |now |gone ahead and )?(?:${AGENT_VERB})\\b`,
  'i',
)

/** The object has to be theirs and has to be a plan thing. */
const PLAN_OBJECT = new RegExp(
  `\\b(?:${DET})\\s+(?:\\w+\\s+){0,2}(?:${NOUN})\\b|\\b(?:${DAY_WORD})\\b`,
  'i',
)

/** "that's done", "it's all sorted", "is now down as", a bare "Done —". */
const IT_IS_DONE = new RegExp(
  `\\b(?:that's|it's|this is|that is|it is)\\s+(?:all\\s+)?(?:been\\s+)?(?:${AGENT_VERB}|done|sorted)\\b` +
  `|\\b(?:is|are)\\s+now\\s+(?:down as|marked|set|logged|showing|a rest day)\\b` +
  `|^\\s*(?:done|all set|sorted|all done)\\b`,
  'im',
)

/** "your schedule is updated", "the session has been moved". */
const OBJECT_IS_DONE = new RegExp(
  `\\b(?:${DET})\\s+(?:\\w+\\s+){0,2}(?:${NOUN})\\s+(?:is|are|was|were|has been|have been)\\s+(?:now\\s+)?(?:${AGENT_VERB})\\b`,
  'i',
)

/**
 * The offer, the question and the conditional — everything the coach SHOULD be
 * saying instead. Vetoes its own sentence only.
 */
const HEDGE = new RegExp(
  `\\b(?:want me to|shall i|would you like|do you want|if you|once you|when you|` +
  `as soon as|i can|i could|i'll|i will|let me know|say the word|tap confirm|` +
  `confirm|before i|should i|happy to|can i)\\b`,
  'i',
)

/** Sentence-ish. Good enough: the claim and its hedge live in one sentence. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(t => t.trim())
    .filter(Boolean)
}

/**
 * The sentence in which the coach claims a change that already happened, or
 * null. Returning the SENTENCE rather than a boolean is deliberate: the caller
 * logs it, and a false positive we cannot read is a false positive we cannot
 * tune.
 */
export function detectPlanClaim(text: string): string | null {
  for (const s of sentences(text ?? '')) {
    if (s.endsWith('?')) continue
    if (HEDGE.test(s)) continue
    const agentClaim = (I_DID.test(s) || IT_IS_DONE.test(s)) && PLAN_OBJECT.test(s)
    if (agentClaim || OBJECT_IS_DONE.test(s)) return s
  }
  return null
}

/**
 * WHAT TO SAY INSTEAD — and it is not an apology with nowhere to go.
 *
 * A dead end here would be its own defect: she asked for something, and being
 * told "I can't do that" when the app plainly can is the shape of failure this
 * file's own history is full of. So the floor admits the mistake in one clause
 * and then offers the thing.
 *
 * THE CHIPS ARE LOAD-BEARING. Each one contains a verb classifyImperative
 * accepts, so her next tap routes to a real tool instead of asking the same
 * question again. test:no-false-claim runs them through the classifier.
 */
export const PLAN_CLAIM_FLOOR = {
  text: "I haven't actually changed anything — I got ahead of myself there. Tell me what you want me to put down and I'll show you the change before anything is saved.",
  chips: ['Swap today for something else', 'Mark today as a rest day', 'Move today to tomorrow'],
}

/** The floor as the client renders it: sentence, then the chips tag. */
export function planClaimFloorText(): string {
  return `${PLAN_CLAIM_FLOOR.text}\n[QUICK_REPLIES: ${PLAN_CLAIM_FLOOR.chips.map(c => `"${c}"`).join(' | ')}]`
}
