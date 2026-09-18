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

import type { FitnessGoal, MacroTargets } from './types'

// ---------------------------------------------------------------------------
// TARGETS THAT MOVED ON THEIR OWN
// ---------------------------------------------------------------------------

/** Deterministic thousands separator. toLocaleString would read the machine's
 *  locale, and a gate that gives a different answer on a different machine is
 *  not a gate — the same rule as the harness clock, one level down. */
const grouped = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** Every target that can move, in the order a person reads them. */
const TARGET_FIELDS: ReadonlyArray<{ key: keyof MacroTargets; label: string; unit: string }> = [
  { key: 'calories', label: 'calories', unit: '' },
  { key: 'protein', label: 'protein', unit: 'g' },
  { key: 'carbs', label: 'carbs', unit: 'g' },
  { key: 'fat', label: 'fat', unit: 'g' },
]

/**
 * WHAT CHANGED AND WHAT IT CHANGED FROM, when the app retunes daily targets
 * off a moved weight trend. Returns null when nothing actually moved, so a
 * caller cannot announce a change that did not happen.
 *
 * WHY IT NAMES THE OLD NUMBER. The two hand-written copies this replaces said
 * "Your calorie target updated to 2,400 kcal" — a figure with nothing to
 * measure it against. Ashley's ruling on the implement ceilings (13 Sep 2026)
 * generalises: if the app quotes a number, it says where that number sits, or
 * she cannot go and look at it.
 *
 * WHY IT NAMES MORE THAN CALORIES. Protein, carbs and fat are derived from the
 * same weight and move in the same instant. Announcing only the calorie change
 * tells someone tracking protein that nothing happened to their protein.
 *
 * WHY IT IS ONE SENTENCE AND NOT A LIST. This renders as a coach nudge on
 * Home, in the same strip as every other thing the coach says. A four-row
 * table there would read as a report, not as a trainer mentioning something.
 */
/**
 * WHY THE CAUSE IS AN ARGUMENT, added 17 Sep 2026 after shipping this broken.
 *
 * The sentence used to end with a hardcoded "moved with your recent weigh-ins",
 * and on 16 Sep this function gained a fourth caller: the effect that recomputes
 * targets when the GOAL, age, height, activity level or macro mode changes.
 * So switching from fat loss to muscle growth told somebody their weigh-ins had
 * done it. Nobody had weighed in.
 *
 * A single sentence with one cause baked into it is safe exactly until it gets
 * a second caller, and nothing about adding that caller makes the problem
 * visible — the sentence still reads perfectly. Any phrasebook line that
 * ASSERTS WHY should take the why from the caller that knows it.
 */
export type TargetMoveCause = 'weigh_in' | 'goal' | 'settings' | 'unknown'

const CAUSE_CLAUSE: Record<TargetMoveCause, string> = {
  // Named in the person's own terms, never the field that changed. "Recent"
  // rather than "your weigh-in" because the anchor moves on a seven-day
  // average, so no single reading is the one responsible.
  weigh_in: 'with your recent weigh-ins',
  goal: 'with your new goal',
  // The honest catch-all: age, height, activity level and macro mode all land
  // here, and naming them individually would be a list nobody reads. It still
  // says a CHANGE caused it rather than implying the app moved on its own.
  settings: "now you've changed your details",
  // A COLD START KNOWS NOTHING, and must not guess. restoreSession compares
  // today's targets against the last stored snapshot, which could have moved
  // for any reason, on any day, possibly on another device. Every other clause
  // here asserts a cause; this one asserts only elapsed time, which is the one
  // thing that path can actually stand behind.
  unknown: 'since you were last here',
}

export function targetsMoved(
  before: MacroTargets,
  after: MacroTargets,
  cause: TargetMoveCause,
): string | null {
  const moved = TARGET_FIELDS
    .filter(f => Math.round(before[f.key]) !== Math.round(after[f.key]))
    .map(f => `${f.label} ${grouped(before[f.key])}${f.unit} to ${grouped(after[f.key])}${f.unit}`)
  if (moved.length === 0) return null
  const list = moved.length === 1
    ? moved[0]
    : `${moved.slice(0, -1).join(', ')} and ${moved[moved.length - 1]}`
  // FALLBACK, NOT DECORATION. src/ is typechecked so every real caller passes
  // a cause — but scripts/ is not (tsconfig is include: ["src"]), and a gate
  // calling the old two-argument signature produced the user-facing sentence
  // "Your daily targets moved undefined — calories 2,200 to 2,400." while
  // still passing, because its assertions read the list and not the clause.
  // Measured 17 Sep 2026. A sentence that reaches a screen can never be
  // allowed to contain the word undefined; the gate below pins the clause so
  // this fallback cannot quietly become the normal path.
  return `Your daily targets moved ${CAUSE_CLAUSE[cause] ?? CAUSE_CLAUSE.unknown} — ${list}.`
}

/**
 * THE MEALS NO LONGER ADD UP TO THE TARGET, said once, with both numbers.
 *
 * Ashley's ruling, 17 Sep 2026: tell her and offer to refit — not silently,
 * not automatically. This is the telling half, and it deliberately asserts NO
 * CAUSE. targetsMoved above names why the target moved because its caller
 * knows; this one is reached from a drift that accumulated over weeks out of
 * every input at once, so "your meals no longer match" is the whole of what
 * the app can stand behind.
 *
 * Calories only, and that is a choice rather than an omission. The protein,
 * carb and fat bands are part of the same verdict, but four numbers against
 * four other numbers is a table, and the card's rows already carry the detail
 * for anyone who wants it.
 */
export function mealsDrifted(mealCalories: number, targetCalories: number): string {
  return `Your meals add up to ${grouped(mealCalories)} calories against a ${grouped(targetCalories)} target. I can resize them — same meals, different amounts.`
}

/**
 * WHAT A NOTIFICATION SAYS, and it is the coach saying it.
 *
 * Ashley chose notifications on 17 Sep 2026. These live here rather than beside
 * the sending code for the reason every other card lead does: a notification is
 * the coach speaking, and a second place to write the coach's words is a second
 * voice. `test:coach-voice` and the coach exam can only grade what is in the
 * phrasebook.
 *
 * SHORT, because a phone truncates. Lower case and no exclamation marks, which
 * is the house voice everywhere else — a notification that shouts is a
 * different personality arriving in someone's pocket.
 *
 * NO NUMBERS EXCEPT THE STREAK, deliberately. A notification is read on a lock
 * screen, out of context, possibly days late; a figure quoted there is one the
 * app cannot promise is still true when it is read. The streak is the
 * exception because it IS the subject of its own line.
 */
export function notification(key: string, streakDays = 0): string {
  switch (key) {
    case 'session_feel': return 'how did that session actually feel?'
    case 'session_not_logged': return "today's session is still waiting — got twenty minutes?"
    case 'missed_yesterday': return 'yesterday got away from you. want to move it or let it go?'
    case 'week_gone_quiet': return "it's been a quiet week. shall we pick something small to start again?"
    case 'streak_at_risk': return `${streakDays} days in a row so far — today would keep it going.`
    case 'block_review': return "that's a block done. come and see what moved."
    case 'beat_target': return "you're beating the weights I set you. want them raised?"
    // A KEY WITH NO SENTENCE IS NOT A SENTENCE. Returning something generic
    // here would let a new moment ship with placeholder words nobody wrote,
    // which is exactly how a screen ends up speaking in a voice no one chose.
    default: return ''
  }
}

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
/**
 * A PERSONAL BEST, WITH ITS UNIT ATTACHED. One function, because the three
 * places that show a PB — the badge on the set row, the end-of-session
 * summary and Home's recent list — each used to print `${newWeight}kg` and
 * would have rendered a 12-rep best as "12kg". A number in the wrong unit
 * is worse than no number: it looks right.
 *
 * Ashley's ruling, 16 Sep 2026: at bodyweight the record is the most reps
 * in one set; once a belt goes on, the record is the added weight. Hers of
 * 17 Sep added a fourth: a best the estimate found shows the whole SET. So
 * the readings are four sentences, not one sentence with a variable.
 */
export type BestReading =
  | { kind: 'load'; weightKg: number }
  | { kind: 'added_load'; addedKg: number }
  | { kind: 'reps'; reps: number }
  /**
   * A best the ESTIMATE found, not the bar. You lifted less weight for more
   * reps and worked harder for it — real progress that a heaviest-ever record
   * cannot see. It shows the whole set, because the alternative is what this
   * used to do: fire on the estimate and then print the lighter weight on its
   * own, so someone whose best is 100kg read "95kg" labelled as a best.
   * Ashley's ruling, 17 Sep 2026, from three options.
   */
  | { kind: 'best_set'; weightKg: number; reps: number }

/**
 * ONE ARGUMENT, NOT A METRIC AND A LOOSE NUMBER. The old signature was
 * (metric, value) and every one of its three call sites re-derived `value`
 * with its own ternary over four fields — which is the bug surface, not the
 * renderer. A caller that picked the wrong field passed a valid number for
 * the wrong kind and this function had no way to know.
 */
export function personalBest(reading: BestReading): string {
  if (reading.kind === 'reps') return `${reading.reps} reps`
  if (reading.kind === 'added_load') return `+${reading.addedKg}kg`
  if (reading.kind === 'best_set') return `${reading.weightKg}kg × ${reading.reps}`
  return `${reading.weightKg}kg`
}

/**
 * The words that go beside a best_set reading, so both screens that show one
 * say the same thing. Kept here rather than written twice: two copies of a
 * four-word qualifier is two things to drift, and the drifted one is the one
 * nobody re-reads.
 */
/**
 * WHAT YOU DID LAST TIME, said so it cannot be read as an instruction.
 *
 * Ashley, 17 Sep 2026, looking at her own dumbbell rows: *"Last sets
 * prescribed were sets of 11 reps. Is thay correct at the end of a
 * exercise?"* Nothing had prescribed 11. The faint numbers in the boxes were
 * her OWN last session — 9, 11, 11 — shown in the same grey the app uses for
 * a hint, with nothing saying which they were. She read her history as a
 * prescription, and it is the only reading the screen supported.
 *
 * Her ruling, 18 Sep 2026, from three options: **mark them "last time"** —
 * the numbers stay in the boxes where her thumb is, and the row says what
 * they are. She rejected moving them out of the boxes to a line above the
 * sets (history one glance further away mid-set) and emptying the boxes
 * entirely (a number to type on every set instead of a tap).
 *
 * ONE ARGUMENT OVER A UNION, the same shape as personalBest above and for the
 * same reason: a reps count and a kilo figure are different quantities, and a
 * caller holding a loose number must not be able to render it as either.
 */
export type LoggedSetReading =
  | { kind: 'loaded'; weightKg: number; reps: number }
  | { kind: 'bodyweight'; reps: number }
  | { kind: 'added_load'; addedKg: number; reps: number }

export function lastTime(reading: LoggedSetReading): string {
  // NEVER A BARE COUNT. "last time 9" beside a weight box reads as 9kg;
  // the kind travels with the number, same rule as personalBest.
  if (reading.kind === 'bodyweight') return `last time bodyweight × ${reading.reps}`
  if (reading.kind === 'added_load') return `last time +${reading.addedKg}kg × ${reading.reps}`
  return `last time ${reading.weightKg}kg × ${reading.reps}`
}

/**
 * The bridge from a stored set to the reading above, for the same reason
 * `bestReadingOf` exists: the caller must not rebuild it with a ternary.
 * That exact shape is what put "12 kg" on a reps record — three call sites,
 * each with its own ternary, two of them wrong.
 *
 * The order of the branches is the whole content of this function. A belted
 * dip carries `is_bodyweight: true` AND an added load, so added load must be
 * tested first or it renders as a plain bodyweight set with its belt lost.
 * And a row with no weight is a bodyweight row whether or not the flag was
 * set — the flag arrived later than the rows, so history predates it.
 */
export function loggedSetReading(log: {
  weight_kg: number
  reps_completed: number
  is_bodyweight?: boolean | null
  added_load_kg?: number | null
}): LoggedSetReading {
  if (log.added_load_kg != null && log.added_load_kg > 0) {
    return { kind: 'added_load', addedKg: log.added_load_kg, reps: log.reps_completed }
  }
  if (log.is_bodyweight || !(log.weight_kg > 0)) {
    return { kind: 'bodyweight', reps: log.reps_completed }
  }
  return { kind: 'loaded', weightKg: log.weight_kg, reps: log.reps_completed }
}

export const BEST_SET_QUALIFIER = 'best set'

/**
 * The bridge for callers that hold a PRMetric and its already-chosen number —
 * Home's recent list, which is built from the PR cache's heaviest-ever
 * figures and therefore can never be the estimate case.
 *
 * It exists so that caller does not rebuild a reading with a ternary, which
 * is exactly the shape that put "12 kg" on a reps record. There is no
 * 'best_set' branch here ON PURPOSE: a metric alone cannot express it, so a
 * caller holding only a metric must not be able to claim one.
 */
export function bestReadingOf(metric: 'load' | 'added_load' | 'reps', value: number): BestReading {
  if (metric === 'reps') return { kind: 'reps', reps: value }
  if (metric === 'added_load') return { kind: 'added_load', addedKg: value }
  return { kind: 'load', weightKg: value }
}

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
  propose_session_rebuild: { done: 'Rebuilt', failed: "I couldn't rebuild it" },
  propose_cardio_session: { done: 'Scheduled', failed: "I couldn't add that session" },
  propose_volume_change: { done: 'Adjusted', failed: "I couldn't adjust it" },
  propose_schedule_change: { done: 'Rescheduled', failed: "I couldn't change the schedule" },
  propose_session_length: { done: 'Sessions resized', failed: "I couldn't change your session length" },
  propose_style_change: { done: 'Restyled', failed: "I couldn't change the style" },
  // CAUGHT BY THIS FILE'S OWN GATE, 17 Sep 2026: my first title was "Rebuilt
  // for your new goal", a sentence where every sibling is a word or two, and
  // test:coach-voice failed it on the three-word ceiling. The ceiling is
  // right — a receipt says what happened, and the card above it already said
  // what that means.
  propose_goal_change: { done: 'Goal changed', failed: "I couldn't change your goal" },
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
  propose_meal_refit: { done: 'Resized', failed: "I couldn't resize your meals" },
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
