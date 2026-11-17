// ---------------------------------------------------------------------------
// EVERY OFFER PASSES ONE CHECKPOINT: STAGE 1 OF HIS PLAN (docs/plans/coach-reaches-everything.md, his "Build stage 1",
// 17 Nov 2026). The coach chooses which change to offer; this decides, from HIS words, whether that kind of change is
// one his message can license. "Im doing myay thai this evening" reached the sixteen-week rebuild; that kind of slip is
// what this stops, for every tool at once instead of one report at a time.
//
// Every tool the coach has carries a rule here (test:offer-rules fails on one without, so a new tool cannot ship
// unchecked):
//   standing  a lasting change. Not offered when his message is about ONE occasion and says nothing regular.
//   today     a change for one day. Not offered when he asked for it FROM NOW ON (that is a different change).
//   definite  something done on a day. Not offered off a hedge ("I might", "maybe"); his 15 Sep 2026 ruling.
//   none      no words rule, with the reason: what checks it instead.
// A rule can be several. When one fails nothing is built: the coach answers what he said in its own words (his ruling
// 17 Nov 2026, "Coach answers"), the app's sentence below being the fallback.
//
// No imports: the coach's server reads a synced copy (scripts/sync-shared-code.mjs). The hedge list lives in
// definite-mention.ts (also synced); the caller passes its answer in.
// ---------------------------------------------------------------------------

export type WordsRule = 'standing' | 'today' | 'definite'
export type OfferRule = { words: readonly WordsRule[] } | { none: string }

const S: OfferRule = { words: ['standing'] }
const T: OfferRule = { words: ['today'] }
const none = (why: string): OfferRule => ({ none: why })

export const OFFER_RULES: Record<string, OfferRule> = {
  // Lasting changes to the plan.
  propose_concurrent_activity: { words: ['standing', 'definite'] },
  propose_schedule_change: S,
  propose_style_change: S,
  propose_goal_change: S,
  propose_session_length: S,
  propose_running_goal: S,
  propose_injury_as_lasting: S,
  propose_volume_change: S,
  propose_kit_change: S,
  ban_exercise: S,
  // One day's changes.
  propose_session_shorten: T,
  propose_session_kind_today: T,
  propose_session_rebuild: T,
  propose_rest_day: T,
  propose_session_move: T,
  propose_session_activity_swap: { words: ['today', 'definite'] },
  propose_cardio_session: { words: ['definite'] },
  // Every other tool, and what holds it instead.
  propose_meal_swap: none('one meal on one day; the card names the day'),
  propose_meal_addition: none('asked-for meals only; a question gets the app-sized answer (answer-first)'),
  propose_custom_meal: none('a meal he describes; the builder costs and checks every line'),
  propose_meal_food_add: none('one food in one meal; the food must be in the food list'),
  propose_meal_food_remove: none('one food he named; the builder finds it in the meal'),
  propose_meal_food_replace: none('one food he named; swaps are checked against his diet'),
  propose_meal_food_resize: none('one food he named; the builder finds it in the meal'),
  propose_meal_move: none('two meals on one day; the card shows both sizes'),
  propose_meal_day_move: none('two named days within the week; the trial shows every knock-on'),
  propose_meal_refit: none('offered off the app\'s own drift verdict, not his words'),
  propose_eating_out: none('one meal on one day; the size is asked by the app'),
  propose_meal_rebalance: none('the app asks how much before the card'),
  propose_meal_top_up: none('offered off the app\'s own short-pool verdict'),
  propose_plan_pause: none('a pause asked for or offered after a red flag; resume is one tap'),
  propose_plan_restart: none('offered only after a long break the app measured'),
  propose_exercise_swap: none('the card offers Just today or Whole block; he picks the scope'),
  propose_exercise_remove: none('the card offers Just today or Whole block; he picks the scope'),
  propose_exercise_add: none('the card offers Just today or Whole block; he picks the scope'),
  propose_exercise_reorder: none('one day\'s order; a superset moves together'),
  propose_injury_adaptation: none('pain is triaged first (edit-reason); a sharp one changes nothing'),
  propose_injury_recovered: none('ends a change he has; nothing new is added'),
  propose_equipment_adaptation: none('a temporary kit change, seven days, stated on the card'),
  propose_missed_session: none('a past day only; offer-still-holds refuses a trained day'),
  propose_circuit_log: none('built only from rounds, times and effort in his words (message-evidence)'),
  propose_cardio_log: none('past-tense cardio in his words (message-evidence)'),
  log_workout_session: none('a session he says he did; written with an Undo'),
  log_workout: none('sets in his words; the exercise must be named or on today\'s log'),
  log_weight: none('a surprising weigh-in is asked about first (weigh-in-check)'),
  log_meal: none('a food that cannot be counted is asked about before any card'),
  log_workout_set: none('sets in his words; odd reps are asked about once'),
  record_fact: none('his verbatim quote must be in his message'),
  record_goal: none('his verbatim quote must be in his message'),
  record_context_fact: none('his verbatim quote must be in his message'),
  set_display_name: none('his verbatim quote must be in his message'),
  record_session_feel: none('his verbatim quote must be in his message'),
  add_to_grocery_list: none('an instruction, not a statement (imperative classifier)'),
  add_day_to_grocery_list: none('an instruction, not a statement (imperative classifier)'),
  check_off_grocery_item: none('an instruction, not a statement (imperative classifier)'),
  remove_from_grocery_list: none('an instruction, not a statement (imperative classifier)'),
  log_water: none('an amount in his words; Undo on the receipt'),
  log_steps: none('always a card, confirmed by his tap'),
}

// ONE OCCASION, AND NOTHING REGULAR: "this evening", "tonight", "today", "tomorrow", "instead".
const ONE_OCCASION = /\b(?:tonight|tonite|today|tomorrow|later(?:\s+on)?|this\s+(?:morning|afternoon|evening|eve|weekend|week)|right\s+now|instead)\b/i
// Plural weekdays and parts of the day ("Tuesday evenings", "on Saturdays") are habits; so are frequency words, a
// start ("starting today") and a history ("for weeks", "keeps"): a lasting injury said with "it hurt again today".
const REGULAR = /\b(?:every|each|weekly|fortnightly|usually|normally|always|regularly|twice|three\s+times|(?:starting|from|as\s+of|beginning)\s+(?:today|tomorrow|now|this\s+week)|for\s+(?:weeks|months|years|ages|a\s+while|a\s+long\s+time)|on\s+and\s+off|keeps|ongoing|(?:once|twice|\d+|two|three|four)\s+(?:times\s+)?(?:a|per)\s+week|(?:mon|tues|wednes|thurs|fri|satur|sun)days|mornings|afternoons|evenings|nights)\b/i
// FROM NOW ON: a schedule, not a day. Narrower than REGULAR on purpose ("my knee always hurts" is not a schedule).
const FOR_GOOD = /\b(?:from\s+now\s+on|going\s+forward|for\s+good|permanently|from\s+next\s+week(?:\s+on)?|for\s+the\s+rest\s+of\s+(?:the|my)\s+(?:plan|block|programme|program)|every\s+(?:week|session|(?:mon|tues|wednes|thurs|fri|satur|sun)day)|each\s+week|(?:mon|tues|wednes|thurs|fri|satur|sun)days)\b/i

/** True when the message speaks of a single occasion and nothing regular. */
export function isOneOffMention(message: string | null | undefined): boolean {
  const text = String(message ?? '')
  return ONE_OCCASION.test(text) && !REGULAR.test(text)
}

/** True when the message asks for something from now on, rather than for one day. */
export function saysForGood(message: string | null | undefined): boolean {
  return FOR_GOOD.test(String(message ?? ''))
}

export interface WordsProblem {
  rule: WordsRule
  /** For the coach's retry: what was wrong, in a clause. */
  why: string
  /** The app's own sentence, when the coach's retry is not used. */
  say: string
}

/** The first rule his words break for this tool, or null. Unknown tools pass (the gate keeps the list complete). */
export function offerWordsProblem(tool: string, message: string | null | undefined, opts: { hedged: boolean }): WordsProblem | null {
  const rule = OFFER_RULES[tool]
  if (!rule || !('words' in rule)) return null
  for (const w of rule.words) {
    if (w === 'standing' && isOneOffMention(message)) {
      return { rule: w, why: 'they told you about ONE occasion, not something every week, so nothing about their plan changes',
        say: "I've left your plan as it is. If it's every week, tell me which days and I'll build your week around it." }
    }
    if (w === 'today' && saysForGood(message)) {
      return { rule: w, why: 'they asked for this from now on, and the change you reached for only covers one day',
        say: "I've left your plan as it is: that change would only cover one day. Tell me it's from now on and I'll change the plan itself." }
    }
    if (w === 'definite' && opts.hedged) {
      return { rule: w, why: 'they only said they might, so nothing goes on their plan until they decide',
        say: "I've left your plan as it is. If you decide to do it, tell me and I'll put it in." }
    }
  }
  return null
}
