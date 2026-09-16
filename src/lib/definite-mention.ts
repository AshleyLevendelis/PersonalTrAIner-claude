/**
 * DID THEY SAY THEY ARE DOING IT, OR THAT THEY MIGHT?
 *
 * Ashley's ruling, 15 Sep 2026, from three options: when somebody mentions
 * doing something on a day, the coach offers to put it in their plan **only
 * when they sound definite**. She chose the coach judging over asking every
 * time, and over never offering.
 *
 * THE HONEST SHAPE OF THAT RULING, and why this file exists rather than a
 * prompt bullet on its own. The judgement is the model's, and the model has
 * been measured ignoring prompt rules it was given four times. So the
 * judgement is split in two:
 *
 *   - Staying QUIET when it should have spoken is a miss. It costs nothing on
 *     the plan and nothing can enforce it, because there is no turn to inspect
 *     — the coach simply said something else. That half is Ashley's accepted
 *     cost and is graded by the coach exam, not blocked by code.
 *   - Putting a session on somebody's plan off "I might" is a WRITE, and that
 *     half is enforced here. `isHedged` runs on the client before the card is
 *     built, and a hedged message never produces one.
 *
 * That asymmetry is deliberate: the app blocks the direction that costs
 * something and grades the direction that costs nothing.
 *
 * ONE LIST, so the prompt cannot drift from the code. The prompt has to teach
 * the model the same words this file refuses on, and `test:cardio-session`
 * derives them from HERE and asserts the prompt names every one — rather than
 * a second Deno copy nothing executes. (`plan-claim.ts` has a real twin
 * because the SERVER runs it too; nothing server-side runs this one.)
 *
 * A LEAF MODULE: it imports nothing, for the reason `tradeoff-shape.ts`
 * records — a phrasebook that reaches into the plan engine drags the exercise
 * catalogue into the main chunk.
 */

/**
 * Words and phrases that make a mention conditional rather than a commitment.
 *
 * Deliberately PHRASES where a bare word would be ambiguous: "may" alone
 * catches the month, and "could" alone catches "could you add", which is a
 * request and about as definite as it gets.
 */
export const HEDGE_PHRASES: readonly string[] = [
  'might',
  'maybe',
  'perhaps',
  'possibly',
  'probably',
  'thinking about',
  'thinking of',
  'considering',
  'i could',
  'i may',
  'we may',
  'hoping to',
  'hope to',
  'not sure',
  'if i',
  'if i can',
  'depends',
  'we will see',
  "we'll see",
  'at some point',
  'one of these days',
]

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Built once. `\b` on both ends so "might" does not fire on "mighty" and
 * "if i" does not fire on "notify"; apostrophes inside a phrase are escaped
 * rather than living in a character class, which is the bug that truncated
 * two separate matches on 15 Sep 2026.
 */
const HEDGE_RE = new RegExp(`\\b(?:${HEDGE_PHRASES.map(escape).join('|')})\\b`, 'i')

/**
 * Does this message hedge?
 *
 * PASS THE WHOLE MESSAGE, not the tool's `origin_verbatim_quote`. The quote is
 * a substring the model chose, so a model that quotes "a bike ride Wednesday"
 * out of "I might do a bike ride Wednesday" would strip the hedge and pass a
 * check that only read the quote. The quote still has its own job — proving
 * the words were said at all — and this is the separate question of whether
 * they were said as a plan.
 */
export function isHedged(message: string): boolean {
  return HEDGE_RE.test(String(message ?? ''))
}
