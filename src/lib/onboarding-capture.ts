import type { SessionDuration } from './types'
import type { PendingGoal } from './onboarding-draft-store'

// ---------------------------------------------------------------------------
// THREE THINGS SOMEONE SAYS IN PASSING THAT THE APP MUST NOT LEAVE TO THE MODEL
// (test log, 9 Oct 2026). Each was heard by the coach and then lost or blurred
// on the way to the screen, and each has a certain reading the app can take
// for itself — the same model-first, deterministic-behind shape as the
// allergen backstop.
//
//   L5  "3 meals and one snack" was ticked as "Meals a day — 3 meals". The
//       plan did include a snack, but only because snacks default to ON. The
//       mirror is the one that bites: "3 meals, no snacks" with the same
//       missed call gives a plan WITH a snack and nothing saying so.
//   L6  one sentence about body fat saved two near-identical goals.
//   M5  "40 minutes tops, hard stop" is stored as the 30-45 setting, whose
//       sessions may run to 45. The tick said "30-45 min" and nothing else.
//
// Pure functions, no React, so scripts/test-onboarding-receipts.ts can call
// them directly.
// ---------------------------------------------------------------------------

const NO_SNACKS = /\bno snacks?\b|\bwithout (any )?snacks?\b|\bmeals only\b|\b(don'?t|do not|never) snack\b|\bskip (the )?snacks?\b/i
const WITH_SNACKS = /(\band|\bplus|\bwith|\+|&)\s+(?:a |an |one |two |three |\d |some |a couple of )?snacks?\b|\bsnacks? (too|as well)(?=\s*(?:[,.!?]|$))/i

/**
 * Did they say whether they want snacks? true / false, or undefined when the
 * message does not say.
 *
 * Deliberately narrow, because this writes an answer without asking. A
 * message that mentions snacking more than once ("no snacks at work, but a
 * snack after training") or says both things is a conversation, not an
 * answer, and is left for the coach.
 */
export function snackAnswerIn(text: string): boolean | undefined {
  if ((text.match(/\bsnack/gi) ?? []).length !== 1 && !/\bmeals only\b/i.test(text)) return undefined
  const no = NO_SNACKS.test(text)
  const yes = WITH_SNACKS.test(text)
  return no === yes ? undefined : yes
}

const COUNT_WORDS: Record<string, 2 | 3 | 4> = { '2': 2, two: 2, '3': 3, three: 3, '4': 4, four: 4 }

/**
 * A stated number of meals — only when the message names exactly one.
 * "2 meals, sometimes 3 meals" is two numbers and so is not taken.
 */
export function mealCountIn(text: string): 2 | 3 | 4 | undefined {
  const found = new Set<2 | 3 | 4>()
  for (const m of text.matchAll(/\b([234]|two|three|four)\s+(?:main |proper |square |big )?meals?\b/gi)) {
    found.add(COUNT_WORDS[m[1].toLowerCase()])
  }
  return found.size === 1 ? [...found][0] : undefined
}

/**
 * What each session-length setting spans, in minutes. The ENGINE owns these
 * numbers (SESSION_MINIMUM_SECONDS / SESSION_MAXIMUM_SECONDS in
 * session-duration.ts); they are restated here only because importing that
 * module drags the whole exercise catalogue into the onboarding chunk. The
 * gate compares the two tables, so a drift is a red check, not a wrong claim.
 */
export const SESSION_BAND_MINUTES: Record<SessionDuration, readonly [number, number]> = {
  '30-45': [30, 45],
  '45-60': [45, 60],
  '60-90': [60, 90],
  '90+': [90, 120],
}

/**
 * When someone gave ONE exact length ("40 minutes tops") and it was recorded
 * as a setting that is not that number, the words that say so. Undefined when
 * there is nothing to add: no figure, several figures, or a figure that is
 * exactly the setting's upper limit (nothing runs past what they said). A
 * range is read by its top — "35-40 minutes" is a limit of 40.
 */
export function sessionLengthNote(setting: SessionDuration, userText: string): string | undefined {
  const band = SESSION_BAND_MINUTES[setting]
  if (!band) return undefined
  const text = userText.toLowerCase()
  const stated = new Set<number>()
  for (const m of text.matchAll(/\b(\d{1,3})\s*(?:min|mins|minutes)\b/g)) stated.add(Number(m[1]))
  if (/\bhalf an hour\b/.test(text)) stated.add(30)
  else if (/\b(an|1|one) hour\b/.test(text)) stated.add(60)
  if (stated.size !== 1) return undefined
  const n = [...stated][0]
  const [lo, hi] = band
  if (n === hi) return undefined
  return n >= lo && n < hi
    ? `the closest setting to ${n} minutes — sessions can run to ${hi}`
    : `the closest setting to ${n} minutes — sessions here run ${lo} to ${hi}`
}

// Words that carry no meaning of their own in a goal ("get to", "reach", "my").
const GOAL_FILLER = new Set(['a', 'an', 'the', 'to', 'my', 'i', 'want', 'get', 'reach', 'be', 'at', 'down', 'up', 'of', 'and', 'around', 'about', 'hit', 'from'])
const wordsOf = (s: string) =>
  new Set(s.toLowerCase().replace(/[^a-z0-9%. ]+/g, ' ').split(/\s+/).filter(w => w && !GOAL_FILLER.has(w)))
/** How much of the SMALLER set is also in the other: 1 when one says nothing the other does not. */
const shared = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) return 0
  let both = 0
  for (const w of a) if (b.has(w)) both++
  return both / Math.min(a.size, b.size)
}
const sharesANumber = (a: Set<string>, b: Set<string>) => [...a].some(w => /\d/.test(w) && b.has(w))
/** A goal the app can measure progress against beats one that only names a direction. */
const measurable = (g: PendingGoal) => g.metric === 'body_weight_kg' && typeof g.targetValue === 'number'

/**
 * Add a goal the coach noted, without saving the same goal twice.
 *
 * Two goals are the same goal when one says almost nothing the other does
 * not. The bar is lower when both came from the same sentence — which is how
 * one remark about body fat became two rows — and there a shared figure
 * ("80kg", "12%") is enough. A person has one target weight, so a second
 * measurable weight goal replaces the first.
 *
 * Of a matching pair the better record is kept: measurable over directional,
 * otherwise whichever says more. Two genuinely different goals from one
 * sentence ("lose 6kg and run a 5k", "build muscle and build endurance") do
 * not match and are both kept.
 */
export function mergePendingGoal(existing: readonly PendingGoal[], incoming: PendingGoal): PendingGoal[] {
  const words = wordsOf(incoming.displayText)
  const twin = existing.findIndex(g => {
    if (measurable(g) && measurable(incoming)) return true
    const theirs = wordsOf(g.displayText)
    const alike = shared(theirs, words)
    if (alike >= 0.8) return true
    const oneSentence = shared(wordsOf(g.rawPhrase), wordsOf(incoming.rawPhrase)) >= 0.8
    return oneSentence && (alike > 0.5 || sharesANumber(theirs, words))
  })
  if (twin === -1) return [...existing, incoming]
  const kept = existing[twin]
  const incomingIsBetter = measurable(incoming)
    || (!measurable(kept) && words.size > wordsOf(kept.displayText).size)
  if (!incomingIsBetter) return [...existing]
  const next = [...existing]
  next[twin] = incoming
  return next
}
