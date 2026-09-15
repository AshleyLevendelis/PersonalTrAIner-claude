// ---------------------------------------------------------------------------
// THE COACH'S OWN WORDS — one voice, in the sentences the app writes itself.
//
// A large share of what a person reads as "the coach" never touches the model:
// every proposal card lead, every receipt title, every refusal, every save
// failure is a string in this repo. `docs/audits/the-coachs-own-words-2026-09-15.md`
// measured that surface before any of it was changed and found six things,
// of which two matter most:
//
//   - 18 proposal builders, 9 leads. Half the cards said NOTHING — including
//     the exercise swap, the most-used verb in the app.
//   - The nine that spoke used THREE grammars for one job: "I can X:" on
//     exercise edits, "I'll X. Shall I?" on day verbs, and "Want me to X?" on
//     the quick-reply chips for those very same day verbs, 945 lines away in
//     the same file. A person marking a rest day met two of them in one minute.
//
// ASHLEY'S RULING, 15 Sep 2026, from three options: **"Want me to X?"** — over
// "I'll X. Shall I?" and over "I can X:". It is the warmest of the three and
// reads least like an app, and it has a second effect she did not have to
// choose: the chips already spoke this way, so the card and the chip now agree
// instead of contradicting each other.
//
// WHY THE VERB PHRASE STAYS AT THE CALL SITE. This module does not hold 18
// finished sentences. It holds the SHAPE — `ask()` — and each builder passes
// the phrase describing its own change. A lookup table of whole sentences
// would drag every builder's facts (day names, exercise names, minute counts)
// into one file that knows nothing about them, and the first slot that did not
// fit would be written inline again, which is exactly how the drift above
// started.
//
// WHY THIS FILE STAYS CHEAP TO IMPORT. `tradeoff-shape.ts:1-22` records what a
// careless import here costs: pulling `edit-tradeoff` into the nutrition sheet
// dragged the 5,000-line exercise catalogue and the plan scorer into the main
// chunk and tripped `test:bundle`. This module is imported by BOTH the chat
// client and the nutrition sheet, so it must not become that seam again.
//
// The property is TRANSITIVE WEIGHT, not "no imports" — a rule of "type-only
// imports, nothing else" would be easy to state, easy to check and wrong, since
// the one runtime re-export below (`edit-reason`, itself a leaf that imports a
// single type) costs nothing and prevents a second copy of the safety text.
// `test:coach-voice` §1 walks the runtime import graph from here and fails if
// it reaches the exercise catalogue, the plan scorer, or the Supabase client.
//
// WHAT IS DELIBERATELY NOT HERE, each for its own reason:
//   - `edit-reason.ts` — already the right shape, and its safety text
//     (HURT_KINDS, RED_FLAG_ADVICE) is re-exported below BY REFERENCE, never
//     re-worded. Pain wording is Ashley's ruling of 15 Sep and copying it
//     would create a second version to drift.
//   - `accountability.ts` — third person, written for the MODEL to read.
//   - `tool-reply.ts`'s *_NUDGE constants — instructions to the model.
//   - `coach-tips.ts` — dashboard tiles, a different medium from a chat bubble.
// ---------------------------------------------------------------------------

import type { FitnessGoal } from './types'

// ---------------------------------------------------------------------------
// ASKING
// ---------------------------------------------------------------------------

/**
 * `ask('take **Lateral Raises** out of Monday')`
 *   → `'Want me to take **Lateral Raises** out of Monday?'`
 *
 * Pass a bare verb phrase: no leading capital, no trailing punctuation. Both
 * are added here, so a caller cannot half-apply the house style.
 *
 * The opener is inlined rather than held in an exported constant. A constant
 * would have been the obvious way to let a gate compare the chips against the
 * cards — but nothing in the app would have imported it, and `test:no-dead-code`
 * is right to call that out: an export no caller reads is how GOAL_NOUN ended up
 * written and dead. A gate can call ask('x') and read the prefix off the result,
 * which is a stronger check anyway because it exercises the function.
 */
export function ask(verbPhrase: string): string {
  const trimmed = verbPhrase.trim().replace(/[.?!:]+$/, '')
  return `Want me to ${trimmed}?`
}

/**
 * "Which exercise did you want to take out?" — the five hand-written variants
 * of this question the audit found, as one shape.
 *
 * The verb is the caller's because it is the only part that differs, and
 * because a generic "which one did you mean?" is worse coaching: it makes the
 * person remember what they just asked for.
 */
export function whichOne(noun: string, verbPhrase: string): string {
  return `Which ${noun} did you want to ${verbPhrase}?`
}

// ---------------------------------------------------------------------------
// WHEN IT CANNOT
// ---------------------------------------------------------------------------

/**
 * The plan has not arrived yet. Five verbatim copies of this existed.
 *
 * NOT an apology: nothing is wrong, the data is in flight. An apology here
 * teaches people that the app is fragile.
 */
export const NOT_LOADED_YET = "Your plan hasn't loaded yet — give it a moment and ask me again."

/** The week specifically, which fails differently from the whole plan. */
export const WEEK_NOT_LOADED = "I can't see this week on your plan just now — give it a moment and ask me again."

/**
 * A write did not land. EIGHT wordings of this existed across 13 call sites —
 * "could not be saved", "didn't save", "Could not save this", with and without
 * a named subject and with three different tails.
 *
 * ONE SENTENCE, AND IT NAMES THE THING. Saying what failed matters more than
 * saying it warmly: a bare "that didn't save" leaves a person unsure which of
 * two taps to repeat.
 *
 * IT DELIBERATELY DOES NOT SAY "NOTHING HAS CHANGED", and that was a real bug
 * caught before it shipped. The first draft did, because it reads as reassuring
 * and is true at most call sites. It is false at
 * `pending-action-executor.ts:1025`: the shorten path pushes its result into
 * `landed` and returns the new mesocycle BEFORE attempting the save, so the
 * session on screen really is shorter and only the persistence failed. That
 * sentence would have contradicted the landed line printed directly beside it —
 * the app claiming a fact about its own state that its own receipt disproves,
 * which is the exact defect class the 15 Sep claim guard exists for.
 *
 * What is true at all 13 sites is only that the save failed. Whether anything
 * changed locally is knowable from the receipt's own `landed` list, so the
 * surface that has that list says it, and this sentence does not guess.
 */
export function didNotSave(thing: string): string {
  return `${thing} didn't save. Check your connection and give it another go.`
}

/**
 * The narrator. The audit found "I", "We", "Couldn't" and the passive in one
 * file; a coach is one person, and that person is "I".
 */
export function couldNot(verbPhrase: string): string {
  return `I couldn't ${verbPhrase.trim().replace(/[.?!]+$/, '')}.`
}

// ---------------------------------------------------------------------------
// HOW FAR A CHANGE REACHES
//
// Three meanings, previously written six ways between them. The distinction is
// real coaching information — "just today" and "just this week" are different
// promises — so the fix is one sentence each, not one sentence for all three.
// ---------------------------------------------------------------------------

export const SCOPE = {
  /** Today's session only; tomorrow is untouched. */
  today: (day: string) => `Just today — ${day} is back to normal next week.`,
  /** This week only; the block continues as planned. */
  thisWeek: (day: string) => `Just this week — ${day} is back to normal from next week.`,
  /** Every remaining week of the current block. */
  restOfBlock: 'For the rest of this block — every week from here, not just today.',
  /** Everything already recorded survives. Said wherever a rebuild is offered. */
  historyKept: "Anything you've already logged stays exactly as it is.",
} as const

// ---------------------------------------------------------------------------
// THE PER-GOAL VOCABULARY
//
// CLAUDE.md lists "the per-goal phrasebook as one graded file" as STILL TO
// BUILD. Half of it was built and DEAD: `edit-tradeoff.ts:174` defines
// GOAL_NOUN with exactly one use site, inside a `reason` string that every
// reader re-wraps and nothing renders. Those words had never reached a person.
//
// Revived here, live, and widened to the four clauses the cards actually need.
// The four goals are fat loss, hypertrophy, functional and conditioning —
// there is no "strength" goal, which is why the strength vocabulary keys off
// the PHASE elsewhere and not off this table.
// ---------------------------------------------------------------------------

export interface GoalTerms {
  /** What they are training for, as they would say it. */
  noun: string
  /** Why the volume for a muscle group matters, in this goal's own terms. */
  whyVolume: (group: string) => string
  /** Why protein matters here specifically. */
  whyProtein: string
  /** The direction that works against this goal, named plainly. */
  wrongWay: string
}

export const GOAL_TERMS: Record<FitnessGoal, GoalTerms> = {
  hypertrophy: {
    noun: 'building muscle',
    whyVolume: g => `${g} grows from the work you do for it`,
    whyProtein: 'muscle is built from it — under-eating protein wastes the training',
    wrongWay: 'less work for a muscle than the week before',
  },
  fat_loss: {
    noun: 'losing fat while keeping muscle',
    whyVolume: g => `that work is what keeps ${g} on you while you're eating less`,
    whyProtein: "it's what stops the weight you lose coming off your muscle",
    wrongWay: 'cutting training volume at the same time as calories',
  },
  functional: {
    noun: 'getting stronger and moving well',
    whyVolume: g => `${g} carries a lot of what you're training for`,
    whyProtein: 'strength work needs something to rebuild with',
    wrongWay: 'dropping the movements that carry the most',
  },
  conditioning: {
    noun: 'your conditioning',
    whyVolume: g => `it's work your week is built around, and ${g} does a lot of it`,
    whyProtein: 'it keeps the muscle you have while you work on the engine',
    wrongWay: 'losing the sessions that build the engine',
  },
}

// ---------------------------------------------------------------------------
// RECEIPTS
//
// 44 titles across 20 confirm branches. The audit's finding was register
// collapse: bare verbs ('Swapped') beside a sentence ('Session shortened for
// today') beside a judgement ('Never again') — four lengths and two points of
// view in one column a person reads one row of at a time.
//
// THE RULE: a success is what HAPPENED, in one or two words, past tense. A
// failure is what DIDN'T, in the first person. The pairing is the point, which
// is why they live in one object and a gate can demand both.
// ---------------------------------------------------------------------------

export interface ReceiptTitles {
  /** Past tense, 1-3 words. What happened. */
  done: string
  /** First person. What didn't. */
  failed: string
}

export const RECEIPTS: Record<string, ReceiptTitles> = {
  propose_exercise_swap: { done: 'Swapped', failed: "I couldn't swap that" },
  propose_exercise_add: { done: 'Added', failed: "I couldn't add that" },
  propose_exercise_remove: { done: 'Removed', failed: "I couldn't remove that" },
  propose_exercise_reorder: { done: 'Reordered', failed: "I couldn't move that" },
  propose_exercise_ban: { done: 'Banned', failed: "I couldn't ban that" },
  propose_session_shorten: { done: 'Shortened', failed: "I couldn't shorten it" },
  propose_cardio_session: { done: 'Scheduled', failed: "I couldn't add that session" },
  propose_volume_change: { done: 'Adjusted', failed: "I couldn't adjust it" },
  propose_schedule_change: { done: 'Rescheduled', failed: "I couldn't change the schedule" },
  propose_style_change: { done: 'Restyled', failed: "I couldn't change the style" },
  propose_rest_day: { done: 'Marked as rest', failed: "I couldn't mark that day" },
  propose_missed_session: { done: 'Marked as missed', failed: "I couldn't mark that day" },
  propose_session_move: { done: 'Moved', failed: "I couldn't move that session" },
  propose_session_activity_swap: { done: 'Swapped', failed: "I couldn't swap that day" },
  propose_injury_adaptation: { done: 'Adapted', failed: "I couldn't adapt it" },
  propose_injury_as_lasting: { done: 'Saved', failed: "I couldn't save that" },
  propose_injury_recovered: { done: 'Cleared', failed: "I couldn't clear that" },
  propose_equipment_adaptation: { done: 'Adapted', failed: "I couldn't adapt it" },
  propose_concurrent_activity: { done: 'Added', failed: "I couldn't add that" },
  propose_meal_swap: { done: 'Swapped', failed: "I couldn't swap that meal" },
  propose_meal_move: { done: 'Moved', failed: "I couldn't move that meal" },
  propose_meal_addition: { done: 'Added', failed: "I couldn't add that meal" },
  propose_meal_food_add: { done: 'Added', failed: "I couldn't add that" },
  propose_meal_food_remove: { done: 'Removed', failed: "I couldn't remove that" },
  propose_meal_food_replace: { done: 'Replaced', failed: "I couldn't replace that" },
  propose_meal_food_resize: { done: 'Resized', failed: "I couldn't change the amount" },
  propose_custom_meal: { done: 'Saved', failed: "I couldn't save that meal" },
}

// ---------------------------------------------------------------------------
// SAFETY TEXT LIVES IN edit-reason.ts, AND THIS FILE DOES NOT TOUCH IT.
//
// Ashley's pain ruling of 15 Sep 2026 is a rule about the APP: every surface
// where somebody says something hurts asks the same three questions, and the
// third answer names a professional and changes nothing. A second copy of those
// words would be a second thing to drift, and the half that drifted would be
// the half nobody re-read.
//
// THIS FILE FIRST RE-EXPORTED HURT_KINDS AND RED_FLAG_ADVICE, and that was
// wrong twice over. Nobody imported them from here — both screens take them
// straight from edit-reason, as they always did — so the re-export was dead.
// And it was not free: it was this module's only runtime edge, and test:bundle
// caught the app's re-download tipping to exactly its ceiling. Ashley's ruling
// of 14 Sep on that number was to take weight OFF the first-paint path rather
// than raise the ceiling a second time, so it came off.
//
// The rule it was meant to serve is unchanged and now sits where it belongs:
// test:coach-voice §5 asserts this file holds no copy of the safety text at
// all. That was always the real property; the re-export was a mechanism for it.
// ---------------------------------------------------------------------------
