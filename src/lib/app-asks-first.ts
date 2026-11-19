// ---------------------------------------------------------------------------
// WHEN THE APP ASKS A QUESTION INSTEAD OF SHOWING THE COACH'S OFFER.
//
// Three of his rulings are held on the phone, after the coach has answered:
//   - a meal he USUALLY eats, described with no amounts, is asked "how much of
//     each" before any offer (1 Sep and 11 Nov 2026);
//   - "I'm not a fan of X", said with no ask for a change, is asked "just this
//     meal, or never?" (14 Nov 2026, "Ask, and hold Tuesday");
//   - a race with no date is asked for its date (13 Nov 2026, "Coach only").
// In each the coach reached for an offer and the app showed a question.
//
// They lived inline in the chat, where nothing else could ask them. The coach
// exam of 18 Nov 2026 counted all three as the coach breaking a rule, because
// the exam sees only what the coach's server returned: three of its five
// "breaches" were turns on which he would have been asked, exactly as ruled.
// So the decision is ONE function, and the chat and the exam's marker both
// call it: the exam now marks the turn he would actually have seen.
// ---------------------------------------------------------------------------
import { foodDislikesToAsk, DISLIKE_ASK } from './food-exclusions'
import { raceDateMissing, RACE_DATE_QUESTION } from './running'

/** "Most weeknights I do…", "I usually have…": a meal he already eats, which is his to size. */
const USUAL_MEAL = /\b(?:usually|normally|typically|always|most (?:week)?(?:days|nights|mornings|evenings)|every (?:day|night|morning|evening|weekday)|my usual|my go-to)\b/i
/** The meal offers a bare "I'm not a fan of X" must not jump to (it is asked about first). */
const MEAL_CHANGE_KINDS = new Set(['propose_meal_swap', 'propose_meal_food_replace', 'propose_meal_food_remove', 'propose_meal_regenerate'])
/** Words that ask for the change itself, so a dislike said with them is a request, not a remark. */
const ASKS_FOR_A_CHANGE = /\b(?:swap|change|replace|switch|instead|something else|different|another|take (?:it|that|the \w+) (?:out|off)|remove|get rid)\b/i

const USUAL_MEAL_QUESTION = 'Happy to add that. How much of each do you usually have? Grams are best, or counts like "2 eggs".'

export interface AppAsk {
  why: 'usual_meal' | 'dislike' | 'race_date'
  /** The app's own question, shown in place of the offer. */
  text: string
}

/** The question the app asks in place of this offer, given what he said, or null when the offer is shown. */
export function appAsksFirst(kind: string, rawArgs: Record<string, unknown> | null | undefined, userSaid: string | null | undefined): AppAsk | null {
  const said = userSaid ?? ''
  if ((kind === 'propose_meal_addition' || kind === 'propose_custom_meal') && USUAL_MEAL.test(said) && !/\d/.test(said)) {
    return { why: 'usual_meal', text: USUAL_MEAL_QUESTION }
  }
  if (MEAL_CHANGE_KINDS.has(kind) && !ASKS_FOR_A_CHANGE.test(said)) {
    const toAsk = foodDislikesToAsk(said)
    if (toAsk.length > 0) return { why: 'dislike', text: DISLIKE_ASK.turn(toAsk) }
  }
  if (kind === 'propose_running_goal' && raceDateMissing(said, rawArgs?.goal, rawArgs?.race_date)) {
    return { why: 'race_date', text: RACE_DATE_QUESTION }
  }
  return null
}
