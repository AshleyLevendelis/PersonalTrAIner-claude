// ===========================================================================
// GENERATED FILE — DO NOT EDIT.
//
// This is src/lib/offer-rules.ts, copied here by scripts/sync-shared-code.mjs so the edge
// functions (Deno, which cannot import from src/) run the SAME code the app
// does. Change the source, then run:
//
//     npm run sync:shared
//
// A hand edit here is overwritten by the next sync, and test:food-db-parity
// fails for as long as this file differs from what the script would write.
// ===========================================================================

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
//   kit       training with different kit for a while. Not offered when he asked to HOLD or PAUSE his training
//             (exam, 18 Nov 2026: "can you hold everything until I'm home?" got a fortnight of bodyweight sessions).
//   none      no words rule, with the reason: what checks it instead.
// A rule can be several. When one fails nothing is built: the coach answers what he said in its own words (his ruling
// 17 Nov 2026, "Coach answers"), the app's sentence below being the fallback.
//
// No imports: the coach's server reads a synced copy (scripts/sync-shared-code.mjs). The hedge list lives in
// definite-mention.ts (also synced); the caller passes its answer in.
// ---------------------------------------------------------------------------

export type WordsRule = 'standing' | 'today' | 'definite' | 'kit'
export type OfferRule = { words: readonly WordsRule[] } | { none: string }

const S: OfferRule = { words: ['standing'] }
const T: OfferRule = { words: ['today'] }
const none = (why: string): OfferRule => ({ none: why })

/** Where an action lives, for the master list's readers (and the parity document's grouping). */
export type ActionFamily = 'meals' | 'exercise' | 'day' | 'plan' | 'logging' | 'memory' | 'shopping'

/**
 * THE MASTER LIST OF EVERYTHING THE COACH CAN DO: stage 4 of docs/plans/coach-reaches-everything.md (17 Nov 2026).
 * Each action is defined ONCE, here: its family, whether a screen control does the same (`screen`, held equal to
 * docs/coach-screen-parity.md), the card the app receives when it is an offer (`card`, absent for an instant save),
 * and the words rule every offer passes (stage 1). OFFER_RULES and CARD_KIND_TOOL below are DERIVED from it, and
 * test:coach-actions holds it equal to the coach's declared tools, its handlers, the cards it returns, the cards the
 * app handles and the parity document, so none of those can gain or lose an action without this list changing.
 * NOT DONE, by decision: the coach's tool DESCRIPTIONS (the words the model reads) are still written in chat-gemini;
 * generating them from here would move 58 long texts and needs an exam run to prove it changed nothing.
 */
export interface CoachAction {
  family: ActionFamily
  screen: 'screen' | 'exception'
  card?: string
  rule: OfferRule
}

export const COACH_ACTIONS: Record<string, CoachAction> = {
  propose_concurrent_activity: { family: 'plan', screen: 'screen', card: 'propose_concurrent_activity', rule: { words: ['standing', 'definite'] } },
  propose_schedule_change: { family: 'plan', screen: 'screen', card: 'propose_schedule_change', rule: S },
  propose_style_change: { family: 'plan', screen: 'screen', card: 'propose_style_change', rule: S },
  // A GOAL IS LASTING BY ITS NATURE (exam 17 Nov 2026: "start building muscle instead" read as a one-off because of
  // "instead", and the app refused the right card). No one-occasion reading applies to a change of goal.
  propose_goal_change: { family: 'plan', screen: 'screen', card: 'propose_goal_change', rule: none('a goal is lasting by nature; "instead" is not an occasion') },
  propose_session_length: { family: 'day', screen: 'screen', card: 'propose_session_length', rule: S },
  propose_running_goal: { family: 'plan', screen: 'screen', card: 'propose_running_goal', rule: S },
  propose_injury_as_lasting: { family: 'plan', screen: 'screen', card: 'propose_injury_as_lasting', rule: S },
  propose_volume_change: { family: 'plan', screen: 'screen', card: 'propose_volume_change', rule: S },
  propose_kit_change: { family: 'plan', screen: 'screen', card: 'propose_kit_change', rule: S },
  ban_exercise: { family: 'exercise', screen: 'screen', card: 'propose_exercise_ban', rule: S },
  propose_session_shorten: { family: 'day', screen: 'screen', card: 'propose_session_shorten', rule: T },
  propose_session_kind_today: { family: 'day', screen: 'screen', card: 'propose_session_kind_today', rule: T },
  propose_session_rebuild: { family: 'day', screen: 'screen', card: 'propose_session_rebuild', rule: T },
  propose_rest_day: { family: 'day', screen: 'screen', card: 'propose_rest_day', rule: T },
  propose_session_move: { family: 'day', screen: 'screen', card: 'propose_session_move', rule: T },
  propose_session_activity_swap: { family: 'day', screen: 'screen', card: 'propose_session_activity_swap', rule: { words: ['today', 'definite'] } },
  propose_cardio_session: { family: 'day', screen: 'screen', card: 'propose_cardio_session', rule: { words: ['definite'] } },
  propose_meal_swap: { family: 'meals', screen: 'screen', card: 'propose_meal_swap', rule: none('one meal on one day; the card names the day') },
  propose_meal_addition: { family: 'meals', screen: 'exception', card: 'propose_meal_addition', rule: none('asked-for meals only; a question gets the app-sized answer (answer-first)') },
  propose_custom_meal: { family: 'meals', screen: 'exception', card: 'propose_custom_meal', rule: none('a meal he describes; the builder costs and checks every line') },
  propose_meal_food_add: { family: 'meals', screen: 'screen', card: 'propose_meal_food_add', rule: none('one food in one meal; the food must be in the food list') },
  propose_meal_food_remove: { family: 'meals', screen: 'screen', card: 'propose_meal_food_remove', rule: none('one food he named; the builder finds it in the meal') },
  propose_meal_food_replace: { family: 'meals', screen: 'screen', card: 'propose_meal_food_replace', rule: none('one food he named; swaps are checked against his diet') },
  propose_meal_food_resize: { family: 'meals', screen: 'screen', card: 'propose_meal_food_resize', rule: none('one food he named; the builder finds it in the meal') },
  propose_meal_move: { family: 'meals', screen: 'screen', card: 'propose_meal_move', rule: none('two meals on one day; the card shows both sizes') },
  propose_meal_day_move: { family: 'meals', screen: 'screen', card: 'propose_meal_day_move', rule: none('two named days within the week; the trial shows every knock-on') },
  propose_meal_refit: { family: 'meals', screen: 'screen', card: 'propose_meal_refit', rule: none('offered off the app\'s own drift verdict, not his words') },
  propose_eating_out: { family: 'meals', screen: 'screen', card: 'propose_eating_out', rule: none('one meal on one day; the size is asked by the app') },
  propose_meal_rebalance: { family: 'meals', screen: 'screen', card: 'propose_meal_rebalance', rule: none('the app asks how much before the card') },
  propose_meal_top_up: { family: 'meals', screen: 'screen', card: 'propose_meal_top_up', rule: none('offered off the app\'s own short-pool verdict') },
  propose_plan_pause: { family: 'plan', screen: 'screen', card: 'propose_plan_pause', rule: none('a pause asked for or offered after a red flag; resume is one tap') },
  propose_plan_restart: { family: 'plan', screen: 'screen', card: 'propose_plan_restart', rule: none('offered only after a long break the app measured') },
  propose_exercise_swap: { family: 'exercise', screen: 'screen', card: 'propose_exercise_swap', rule: none('the card offers Just today or Whole block; he picks the scope') },
  propose_exercise_remove: { family: 'exercise', screen: 'screen', rule: none('the card offers Just today or Whole block; he picks the scope') },
  propose_exercise_add: { family: 'exercise', screen: 'screen', card: 'propose_exercise_add', rule: none('the card offers Just today or Whole block; he picks the scope') },
  propose_exercise_reorder: { family: 'exercise', screen: 'screen', rule: none('one day\'s order; a superset moves together') },
  propose_injury_adaptation: { family: 'plan', screen: 'screen', card: 'propose_injury_adaptation', rule: none('pain is triaged first (edit-reason); a sharp one changes nothing') },
  propose_injury_recovered: { family: 'plan', screen: 'screen', card: 'propose_injury_recovered', rule: none('ends a change he has; nothing new is added') },
  propose_equipment_adaptation: { family: 'plan', screen: 'screen', card: 'propose_equipment_adaptation', rule: { words: ['kit'] } },
  // A SESSION ON A REST DAY, TODAY ONLY (28 Nov 2026, his "Add a weight session just for today" and his ruling "the
  // app should be able to do whatever I ask it but give reasons or advise around it"): the rest day card's "Train
  // anyway", reached from the chat. Never off "from now on": a regular extra day is a change of training days.
  propose_train_today: { family: 'day', screen: 'screen', card: 'propose_train_today', rule: T },
  // HOW A LIFT FELT, TOLD IN THE CHAT (Builder D's route, wired 28 Nov 2026): the screen's Too easy / About right / Too
  // hard, on today's lift. Never off a maybe: a guess at how it felt is not his answer.
  propose_lift_effort: { family: 'logging', screen: 'screen', card: 'propose_lift_effort', rule: { words: ['definite'] } },
  // A WORKOUT OF HIS OWN (advise-then-allow fix 13, 28 Nov 2026): started now or saved for a day, through the screen's
  // own store. He names every exercise; the card lists them before Apply.
  propose_own_workout: { family: 'day', screen: 'screen', card: 'propose_own_workout', rule: none('only exercises he named or agreed to (the prompt); the card lists every one, and the day, before Apply') },
  propose_missed_session: { family: 'day', screen: 'screen', card: 'propose_missed_session', rule: none('a past day only; offer-still-holds refuses a trained day') },
  // A LOGGED ACTIVITY TAKEN OFF ITS DAY (27 Nov 2026, his "I accidentally added a walk today. Remove it"): a log
  // already made, named on the card before Apply; the screen's Remove on the same row does the same.
  propose_cardio_remove: { family: 'logging', screen: 'screen', card: 'propose_cardio_remove', rule: none('a log already made; the card names the log before Apply') },
  propose_circuit_log: { family: 'logging', screen: 'screen', card: 'propose_circuit_log', rule: none('built only from rounds, times and effort in his words (message-evidence)') },
  propose_cardio_log: { family: 'logging', screen: 'screen', card: 'propose_cardio_log', rule: none('past-tense cardio in his words (message-evidence)') },
  log_workout_session: { family: 'logging', screen: 'screen', rule: none('a session he says he did; written with an Undo') },
  log_workout: { family: 'logging', screen: 'screen', rule: none('sets in his words; the exercise must be named or on today\'s log') },
  log_weight: { family: 'logging', screen: 'screen', card: 'propose_weigh_in', rule: none('a surprising weigh-in is asked about first (weigh-in-check)') },
  log_meal: { family: 'logging', screen: 'screen', card: 'propose_meal_log', rule: none('a food that cannot be counted is asked about before any card') },
  log_workout_set: { family: 'logging', screen: 'screen', rule: none('sets in his words; odd reps are asked about once') },
  move_logged_sets: { family: 'logging', screen: 'screen', rule: none('the sets come from today\'s own log; the exercise he did must be in his words') },
  record_fact: { family: 'memory', screen: 'screen', rule: none('his verbatim quote must be in his message') },
  record_goal: { family: 'memory', screen: 'screen', rule: none('his verbatim quote must be in his message') },
  record_context_fact: { family: 'memory', screen: 'screen', rule: none('his verbatim quote must be in his message') },
  set_display_name: { family: 'memory', screen: 'screen', rule: none('his verbatim quote must be in his message') },
  record_session_feel: { family: 'memory', screen: 'exception', rule: none('his verbatim quote must be in his message') },
  add_to_grocery_list: { family: 'shopping', screen: 'screen', rule: none('an instruction, not a statement (imperative classifier)') },
  add_day_to_grocery_list: { family: 'shopping', screen: 'screen', rule: none('an instruction, not a statement (imperative classifier)') },
  check_off_grocery_item: { family: 'shopping', screen: 'screen', rule: none('an instruction, not a statement (imperative classifier)') },
  remove_from_grocery_list: { family: 'shopping', screen: 'screen', rule: none('an instruction, not a statement (imperative classifier)') },
  log_water: { family: 'logging', screen: 'screen', rule: none('an amount in his words; Undo on the receipt') },
  log_steps: { family: 'logging', screen: 'screen', rule: none('always a card, confirmed by his tap') },
}

export const OFFER_RULES: Record<string, OfferRule> = Object.fromEntries(Object.entries(COACH_ACTIONS).map(([tool, a]) => [tool, a.rule]))

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

/**
 * WHETHER AN OFFER STILL NEEDS ITS "Just today / Whole block" CHOICE (17 Nov 2026, the chat review): "swap squats for
 * today" got both buttons, one of them a question he had already answered. When his own words settle the scope the
 * offer keeps the scope the tool chose and drops the choice; when they do not, he is asked. Only the two scopes a
 * change to his plan can have are read here; any other choice on a card is left alone.
 */
export function scopeChoiceNeeded(scope: string, message: string | null | undefined): boolean {
  if (scope === 'today' && isOneOffMention(message) && !saysForGood(message)) return false
  if (scope === 'permanent' && saysForGood(message)) return false
  return true
}

/**
 * HE ASKED FOR HIS TRAINING TO BE HELD, NOT CHANGED: "pause my plan", "hold everything until I'm home", "put my
 * training on hold", "stop my workouts for a bit". One reader for the coach's checkpoint and for the app's own pause
 * offer (the chat calls this directly), so the two cannot disagree about what a pause sounds like.
 */
export function asksToPause(message: string | null | undefined): boolean {
  const t = String(message ?? '').toLowerCase()
  if (/\b(don'?t|do not|never)\s+(pause|hold|stop|freeze)\b/.test(t)) return false
  return /\bpause\s+(my|the)\s+(plan|training|program(me)?|workouts?|sessions?)\b/.test(t)
    || /\b(put|have)\s+(my|the)\s+(plan|training)\s+on\s+(hold|pause)\b/.test(t)
    || /\b(take|need)\s+a\s+break\s+from\s+(my|the)\s+(plan|training)\b/.test(t)
    || /\b(hold|pause|freeze|stop)\s+(everything|it\s+all|all\s+of\s+it)\b/.test(t)
    || /\bput\s+(everything|it\s+all)\s+on\s+(hold|pause)\b/.test(t)
    || /\b(hold|freeze|suspend)\s+(my|the)\s+(plan|training|program(me)?|workouts?|sessions?)\b/.test(t)
    || /\bstop\s+(my|the)\s+(plan|training|program(me)?|workouts)\s+(for|until|till|while)\b/.test(t)
}

export interface WordsProblem {
  rule: WordsRule
  /** For the coach's retry: what was wrong, in a clause. */
  why: string
  /** The app's own sentence, when the coach's retry is not used. */
  say: string
}

/** The first rule his words break for this tool, or null. Unknown tools pass (the gate keeps the list complete). */
/** THE CARD NAME IS NOT ALWAYS THE TOOL NAME (found 17 Nov 2026, stage 2). The coach's server answers a few tools
 *  with a card of a different name, and the app's backstop reads the CARD: `ban_exercise` arrives as
 *  `propose_exercise_ban`, so "I don't want squats today" turned into a ban was never checked on the app's side. Every
 *  such card names its tool here; test:offer-rules derives the card names from the server and fails on one with no
 *  rule. */
export const CARD_KIND_TOOL: Record<string, string> = Object.fromEntries(
  Object.entries(COACH_ACTIONS).filter(([tool, a]) => a.card && a.card !== tool).map(([tool, a]) => [a.card as string, tool]))

export function offerWordsProblem(tool: string, message: string | null | undefined, opts: { hedged: boolean }): WordsProblem | null {
  const rule = OFFER_RULES[tool] ?? OFFER_RULES[CARD_KIND_TOOL[tool] ?? '']
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
    if (w === 'kit' && asksToPause(message)) {
      return { rule: w, why: 'they asked you to HOLD or PAUSE their training while they are away, not to train with different kit; the pause is the change to offer',
        say: "I've left your plan as it is. I can pause it until you're back, so nothing counts as missed, or fit your sessions to whatever kit you'll have. Which would you like?" }
    }
    if (w === 'definite' && opts.hedged) {
      return { rule: w, why: 'they only said they might, so nothing goes on their plan until they decide',
        say: "I've left your plan as it is. If you decide to do it, tell me and I'll put it in." }
    }
  }
  return null
}
