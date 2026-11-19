// ---------------------------------------------------------------------------
// "I'M GOING TO DROP YOUR VOLUME" WITH NOTHING BEHIND IT.
//
// plan-claim.ts beside this file refuses "I've moved your session" on a turn
// that called no tool. This is its twin in the future tense, found on the
// exam run of 18 Nov 2026: "I'm going to drop the set volume across your
// workouts for now" — no tool, no offer on screen, nothing to tap. He reads a
// promise, waits, and nothing changes. The coach's instructions forbid it;
// the model wrote it anyway.
//
// So on a turn that called no tool, a sentence in which the coach says it WILL
// change his plan, his day or his food, with no condition on it, is sent back
// once to be said as an offer he can say yes to. An offer ("want me to...",
// "I can...", "if you like...") and a question are never refused.
//
// Server only: unlike a false "done", a promise is not yet an untruth on his
// screen, so the client keeps no copy.
// ---------------------------------------------------------------------------

/** What a coach does TO a plan. */
const CHANGE_VERB =
  'drop|cut|reduce|lower|trim|lighten|ease|swap|switch|replace|move|shift|reschedule|remove|take out|add|' +
  'update|change|adjust|rebuild|shorten|pause|reset|restart|put|set up|mark|log|bump|raise|increase'

/** The thing changed has to be his, and has to be something the app holds. */
const THEIR_THING = new RegExp(
  "\\b(?:your|the|that|those|these|today's|tomorrow's|this week's|next week's|every|each)\\s+(?:[\\w'-]+\\s+){0,4}?" +
  '(?:sessions?|workouts?|training|lifts?|exercises?|weights?|volume|sets?|reps?|days?|week|schedule|plan|programme|program|' +
  'block|meals?|breakfast|lunch|dinner|snacks?|targets?|calories|macros|protein|shopping list|grocery list)\\b',
  'i',
)

/** A named lift or meal changed for another: "swap your squat for a leg press". The name is his, so no list can hold it. */
const ONE_FOR_ANOTHER = /\b(?:swap|switch|replace)\s+(?:your|the|today's|tomorrow's)\s+[\w' -]{2,40}?\s+(?:for|with|to)\b/i

/** "I'm going to drop", "I'll move", "let me swap", "we're going to cut". */
const WILL_DO = new RegExp(
  "\\b(?:i'm|i am|we're|we are)\\s+(?:just\\s+)?going to\\s+(?:go ahead and\\s+)?(?:" + CHANGE_VERB + ')\\b' +
  "|\\b(?:i'll|i will|we'll|we will|let me)\\s+(?:just\\s+|now\\s+|go ahead and\\s+)*(?:" + CHANGE_VERB + ')\\b',
  'i',
)

/** An offer, a condition or a hand-over to the offer on screen: what the coach SHOULD be saying. */
const OFFERED = new RegExp(
  '\\b(?:want me to|shall i|would you like|do you want|if you|once you|when you|as soon as|i can|i could|we can|we could|' +
  'say the word|tap|confirm|before i|should i|happy to|can i|let me know|unless)\\b',
  'i',
)

function sentences(text: string): string[] {
  return text
    .replace(/\[(?:QUICK_REPLIES|ACTION|LESSON):?[^\]]*\]/g, ' ')
    .split(/(?<=[.!?])\s+|\n+|\[BREAK\]/)
    .map(t => t.trim())
    .filter(Boolean)
}

/** The sentence in which the coach promises a change it has not offered, or null. */
export function detectPlanPromise(text: string): string | null {
  for (const s of sentences(text ?? '')) {
    if (s.endsWith('?')) continue
    if (OFFERED.test(s)) continue
    if (WILL_DO.test(s) && (THEIR_THING.test(s) || ONE_FOR_ANOTHER.test(s))) return s
  }
  return null
}

/** The retry: say it as an offer. */
export const PLAN_PROMISE_NUDGE =
  "(System: your last turn told them you are GOING TO change their plan, their day or their food. You called no tool, " +
  "so nothing is on their screen to tap and nothing will change. Answer them again now, in your own voice as their " +
  "coach texting. Keep what you said about THEM and the reason. Turn the change into an OFFER they can say yes to, as " +
  "one short question at the end (\"Want me to take a set off each lift this week?\"), with a [QUICK_REPLIES] line of " +
  "two short answers under it. Never say you will, are going to, or have changed anything. Plain text, no headers, no bold.)"

/**
 * The last resort when the retry promised again: the app's own sentence. It
 * owns nothing it did not do and leaves him one tap from saying what he wants.
 * The first two buttons each hold a verb classifyImperative accepts, so the
 * tap routes to a real offer (test:coach-tics runs them through it).
 */
export const PLAN_PROMISE_FLOOR =
  "Nothing has changed yet. Tell me what you'd like changed and I'll show it to you before anything is saved.\n" +
  '[QUICK_REPLIES: "Reduce this week\'s sets" | "Cut today\'s session short" | "Leave it as it is"]'
