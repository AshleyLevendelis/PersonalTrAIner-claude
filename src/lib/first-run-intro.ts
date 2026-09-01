/**
 * The first four messages a brand-new user ever sees in the coach chat, and
 * the starter chips under them.
 *
 * Lives here rather than inline in ChatAssistant for one reason: this is the
 * only screen state in the app that is pure content — no session, no plan, no
 * model — and pulling it out is what lets `render:screens` show the real
 * strings at phone width instead of a replica that drifts from them. The
 * component still owns the rendering; this owns the words.
 */

/**
 * The three starter chips a brand-new user sees under their first message.
 *
 * These are things the USER says — handleQuickReply puts the text in the
 * composer and sends it — so each one has to be a sentence that genuinely
 * works, not a label for a feature. That is the point: a chip cannot
 * overstate a capability the way a description can, because tapping it
 * immediately demonstrates the real thing.
 *
 * One of each KIND, rather than three of the same:
 *   explain   — the coach answers from the plan it built
 *   change    — propose_exercise_swap; a card the user confirms
 *   remember  — record_fact; a preference that outlives the conversation
 *
 * NOT offered, deliberately: anything about the schedule or the volume.
 * adjust_volume and update_workout_schedule are stubs that reply "I can't
 * safely make plan changes yet" (chat-gemini/index.ts:1996, :1572). A chip is
 * a suggestion in the app's own voice, so one that gets declined teaches a new
 * user, in their first interaction, that the coach says no to obvious asks.
 * scripts/test-coach-promises.ts §6 holds that line: every chip has to name
 * the tool it lands on, and that tool has to be one that acts.
 *
 * Kept to three: they sit under a message that already asks a question, and
 * a fourth starts reading as a menu rather than an invitation. Note they
 * already stack one per row at 412px — quick replies render inside the
 * message's max-w-[80%] and behind the pl-9 avatar offset, leaving ~294px,
 * which no two of these fit in. See `render:screens` / first-run-chat.
 */
/**
 * The same three, for someone whose first session is NOT today.
 *
 * Only the first differs, and it has to: "Talk me through today" under a
 * message that just said day one is Monday is the app contradicting itself in
 * the space of one screen. Same destination — both are answered from context
 * with no tool call — so the promise the list makes is unchanged.
 */
export const FIRST_RUN_QUICK_REPLIES_AHEAD = [
  'Talk me through day one',
  'Swap an exercise',
  "There's a food I won't eat",
]

export const FIRST_RUN_QUICK_REPLIES = [
  'Talk me through today',
  'Swap an exercise',
  "There's a food I won't eat",
]

/**
 * An activity-only plan has no exercises, so "Swap an exercise" offers a
 * thing that does not exist in it — the same class of untruth as the
 * working-weights sentence above, in a button. The other two still hold.
 */
const FIRST_RUN_QUICK_REPLIES_ACTIVITY = [
  'Talk me through today',
  'How long should it feel?',
  "There's a food I won't eat",
]
const FIRST_RUN_QUICK_REPLIES_ACTIVITY_AHEAD = [
  'Talk me through day one',
  'How long should it feel?',
  "There's a food I won't eat",
]

export interface FirstRunMessage {
  content: string
  quickReplies?: string[]
  /** The slot this message asks about, when it asks about one. */
  asksSlot?: string
}

/**
 * What day one actually is, for the opener to talk about.
 *
 * The FACTS are gathered by ChatAssistant, which holds the plan; the WORDS
 * live here. Same split as the rest of this file, and it is what lets
 * `render:screens` show the real opener instead of a replica.
 */
/**
 * The SHAPE of the whole programme, for the one sentence that describes it.
 *
 * Ashley, on reading the opener: it names day one and nothing else, so
 * someone who reads it and closes the app never learns the plan HAS a shape.
 * The coach does explain it — buildCoachPhaseBrief's "plan is new" branch
 * asks for a high-level walkthrough — but only once the user says something.
 * This is the half that lands before they speak.
 *
 * Every field is read off the generated mesocycle, never assumed: a plan with
 * no weeks in it produces no sentence rather than a confident "16 weeks".
 * That is the same rule the day-one half already follows (`session: null`
 * invents no session) and it exists because a number in the app's first line
 * is the worst possible place for a guess to sit.
 */
export interface FirstRunPlanShape {
  /** Weeks in the generated mesocycle. */
  totalWeeks: number
  /** Distinct block_numbers across those weeks. 0 or 1 = don't mention blocks. */
  blocks: number
  /** Week 1 is a calibration week — capped on purpose, and it has to be said. */
  startsLight: boolean
  /**
   * The plan prescribes activities (walks) and no lifting at all — the
   * starting-out prescription. Every sentence about working weights and
   * climbing loads is false for it, and this is the app's FIRST message, so
   * getting it wrong is the worst possible place to be wrong.
   *
   * MEASURED, 2 Sep 2026: a sedentary beginner's welcome read "You'll start
   * light on purpose while we find your working weights, then the loads
   * climb" above a sixteen-week plan containing no weights whatsoever.
   */
  activityOnly: boolean
}

export interface FirstRunSessionBrief {
  /** The session's focus, e.g. "Full Body Power". */
  focus: string
  /** Its first few movements, already joined and truncated. */
  movements: string
  /**
   * `today`   — a training day, and their training window has not passed.
   * `whenever`— a training day, but past the hour they usually train.
   * anything else — how to refer to the next one: "tomorrow", "Monday".
   */
  when: 'today' | 'whenever' | string
}

/**
 * The FIRST message a brand-new user ever sees in the coach chat — and, since
 * Ashley's call, the only one.
 *
 * IT USED TO BE FOUR. Who I am, what to say to me, what I won't do without
 * asking, then today's session. She read it on a real phone and cut it to one:
 * "we dont need to say that much and it could be 1 message."
 *
 * Three of those four went for a reason, not just for length:
 *
 *   "I'm your coach. Good to meet you."     the header says who is talking,
 *                                           permanently. This said it again.
 *   "Talk to me like you'd talk to a person" HER OBJECTION, and it is the
 *                                           right one: "as far as the user is
 *                                           concerned it is a person, so I
 *                                           dont like this wording." Naming
 *                                           the thing it is pretending not to
 *                                           be breaks it. The three chips
 *                                           underneath demonstrate what to say
 *                                           without a sentence explaining it.
 *   "Nothing moves without your say-so"     already said, minutes earlier, in
 *                                           the onboarding opener. Saying it
 *                                           twice made it read as a disclaimer
 *                                           rather than a promise.
 *
 * WHAT REPLACED THEM IS MOMENTUM, and it has to be true of THIS user. Ashley's
 * sketch was "Day one starts right now with {session}" — which is wrong for
 * anyone whose first training day is not today, and the old code was worse
 * there: it fell through to "it's a rest day on your plan. How's the recovery
 * going?", asking a brand-new user how they are recovering from nothing. So
 * the opener branches on when day one actually is, and says so.
 */
/**
 * Read the shape off a generated mesocycle.
 *
 * Pure, and here rather than in ChatAssistant, so it can be tested against
 * real plans instead of by grepping the component for the right string. The
 * first version of its gate did exactly that and stayed green while the
 * function was mutated to a hardcoded 16 — the string it searched for also
 * appears in unrelated wiring 400 lines away.
 */
export function planShapeFromMesocycle(
  mesocycle: {
    week_number?: number
    block_number?: number
    isCalibrationWeek?: boolean
    days?: { exercises?: unknown[]; plannedActivity?: unknown }[]
  }[],
): FirstRunPlanShape | null {
  if (mesocycle.length === 0) return null
  const blocks = new Set(
    mesocycle.map(w => w.block_number).filter((n): n is number => typeof n === 'number'),
  ).size
  // week_number is 1-indexed, but fall back to array order rather than giving
  // up on a plan whose numbering is missing — the calibration flag is the
  // thing being read, and it sits on the first week either way.
  const weekOne = mesocycle.find(w => w.week_number === 1) ?? mesocycle[0]
  // Asked of the plan's OWN days: a week that schedules activities and no
  // exercises anywhere is an activity plan, whoever it was built for. Read
  // from the plan rather than from the profile for the same reason
  // isLoadlessWeek is — the thing being described is what got generated.
  const daysSeen = mesocycle.flatMap(w => w.days ?? [])
  const activityOnly = daysSeen.length > 0
    && daysSeen.every(d => (d.exercises?.length ?? 0) === 0)
    && daysSeen.some(d => d.plannedActivity != null)

  return {
    totalWeeks: mesocycle.length,
    blocks,
    startsLight: weekOne?.isCalibrationWeek === true,
    activityOnly,
  }
}


export function buildFirstRunIntro(
  greeting: string,
  session: FirstRunSessionBrief | null,
  shape: FirstRunPlanShape | null = null,
): FirstRunMessage[] {
  // ---- 1. Welcome, and what they now have. ------------------------------
  //
  // The plan's size is the first concrete thing said, because it is the
  // thing they just spent an onboarding earning and cannot see yet. Drops to
  // a plain welcome when there is no mesocycle to describe — an invented
  // "16 weeks" in the app's first line is the worst place for a guess.
  const size = shape && shape.totalWeeks >= 2
    ? `${shape.totalWeeks} weeks${shape.blocks >= 2 ? ` in ${shape.blocks} blocks` : ''}`
    : ''
  const welcome = size
    ? `${greeting} — welcome aboard. Your plan's built: ${size}, and it's yours to change whenever it stops fitting.`
    : `${greeting} — welcome aboard. Your plan's built, and it's yours to change whenever it stops fitting.`

  // ---- 2. How it is structured, and how it begins. -----------------------
  //
  // Every clause here is a claim about THIS plan, so each one is gated on the
  // plan actually having that shape. A single-block plan is not told its
  // blocks have jobs; a plan with no deload is not promised an easier week.
  // The calibration clause only appears for someone who is genuinely getting
  // a capped first week — that is the one most worth saying, because an
  // unexplained easy week reads as the app getting it wrong.
  const structureParts: string[] = []
  if (shape && shape.blocks >= 2) structureParts.push('Each block has a job.')
  if (shape?.activityOnly) {
    // No weights in this plan, so nothing about weights. What is actually
    // true of it: the dose steps up a block at a time, at the same effort.
    structureParts.push("It starts where you are and builds a little at a time — the same easy effort throughout, just a bit longer as the blocks go on.")
  } else if (shape?.startsLight) {
    structureParts.push("You'll start light on purpose while we find your working weights, then the loads climb, and every block ends with an easier week so the work actually sticks.")
  } else if (shape && shape.blocks >= 2) {
    structureParts.push('The loads climb through each one, and every block ends with an easier week so the work actually sticks.')
  }
  // THE PROMISE ON ITS OWN IS NOT A MESSAGE. When the plan has no blocks to
  // describe — a short plan, or one that failed to generate — everything
  // above is skipped and this line would ship as a lonely one-clause bubble
  // between two full ones. It folds into the welcome instead, and the intro
  // is two messages rather than three. Ashley chose three for the plan she
  // has; three is not a quota to pad out for a plan that has less to say.
  const hasStructure = structureParts.length > 0
  structureParts.push("I'll tell you each time it changes — you won't have to go looking.")
  const structure = structureParts.join(' ')

  // ---- 3. Day one, and the open door. ------------------------------------
  //
  // Day one keeps all four branches it already had — today, past their usual
  // hour, a named day ahead, and no session at all. Ashley's sketch was "day
  // one starts right now", which is wrong for anyone whose first training day
  // is not today, and the code this replaced was worse there: it asked a
  // brand-new user how their recovery was going.
  const dayOne = (() => {
    if (!session) return "Your plan's waiting whenever you want a look."
    // The movements list already ends in an ellipsis when it was truncated,
    // and a full stop after one reads as a typo ("Dumbbell Press….").
    // A day with no exercise list — a walk — has no movements to name, and
    // "Walk — ." was what shipped: a dangling dash and a full stop. The
    // focus alone is the whole prescription there.
    const stop = session.movements.endsWith('…') ? '' : '.'
    const brief = session.movements.trim()
      ? `${session.focus} — ${session.movements}${stop}`
      : `${session.focus}${/[.!?…]$/.test(session.focus) ? '' : '.'}`
    if (session.when === 'today') return `Day one is today: ${brief}`
    // A training day, but past the hour they said they train. "Starts right
    // now" would be pushing someone into a session at 10pm.
    if (session.when === 'whenever') return `Day one is ready when you are: ${brief}`
    return `Day one is ${session.when}: ${brief}`
  })()

  // THE OPEN DOOR, and the reason it is here rather than left to the tour.
  // The tour's last step says almost exactly this — but the tour is skippable
  // and says so in its own first step, so someone who skips gets none of it.
  //
  // DELIBERATELY NOT A FEATURE LIST. That was one of the messages Ashley cut,
  // and the reasoning still holds: the tour demonstrates each capability on
  // the real screen at the moment it makes sense, which a paragraph cannot.
  // This names the KIND of thing worth saying, not the tools that handle it.
  //
  // "food" here means what they will and won't eat — never logging a meal.
  // log_meal is the one coach tool that still declines, so an invitation to
  // log one would fail on the first thing a new user tried.
  const openDoor = "And anything you're wondering about — training, food, sleep, a niggle that won't shift — just ask."

  // The chips go on the LAST message and only there — getQuickRepliesFor-
  // LastMessage reads messages[messages.length - 1].quickReplies and nothing
  // else, so attaching them anywhere above is a silent no-op. This was safe
  // by accident while the intro was a single message; with three it is a real
  // constraint again, which is why test:coach-promises pins it.
  const dayOneIsToday = session?.when === 'today' || session?.when === 'whenever'
  const last = {
    content: `${dayOne} ${openDoor}`,
    quickReplies: shape?.activityOnly
      ? (dayOneIsToday ? FIRST_RUN_QUICK_REPLIES_ACTIVITY : FIRST_RUN_QUICK_REPLIES_ACTIVITY_AHEAD)
      : (dayOneIsToday ? FIRST_RUN_QUICK_REPLIES : FIRST_RUN_QUICK_REPLIES_AHEAD),
  }
  return hasStructure
    ? [{ content: welcome }, { content: structure }, last]
    : [{ content: `${welcome} ${structure}` }, last]
}

// ---------------------------------------------------------------------------
// THE OTHER FIRST RUN — the one that actually comes first.
//
// Everything above fires in the main chat AFTER a plan exists. Ashley found
// the gap on a real phone: a brand-new user's genuine first message was the
// interview opener, which explains the QUESTIONS ("I want to get to know you a
// bit") and never once says what the app is for. You were asked your name by
// something you had no reason to trust yet.
//
// THE WORDS ARE ASHLEY'S, and that is a constraint, not a credit. She wrote
// the draft, rejected a capabilities-first restructure of it outright, ruled
// out any question count ("don't say dozen questions"), and picked each
// version verbatim from complete candidates. Editorial "improvements" here
// are how her decision gets quietly unmade — change this copy only on her
// say-so.
//
// CUT FROM THREE MESSAGES TO TWO, 88 words to 42, on her say-so — she read
// the opener as too long. The message that went was the capabilities pitch
// ("I'll log your workouts, swap what isn't working, plan around injuries…").
//
// It went because its job moved, not because it was bad. When it was written
// nothing else explained the app; the post-onboarding tour now demonstrates
// each of those four things on the real screen at the moment it makes sense,
// which an opening paragraph cannot do for someone who has not seen the app
// yet. Arguing for the app before showing it is the weaker half of that pair.
//
// "Nothing changes without your okay" was deliberately KEPT and moved to sit
// beside the name question. It is the one line that is reassurance rather
// than sales, and it is the promise the propose-then-confirm cards spend the
// rest of the app keeping.
//
// THE SPLIT POINT IS A MEASUREMENT, NOT A PREFERENCE. Ashley's approved copy
// was one 188-character opening bubble, and test:onboarding-conversational
// caps a message at 170 — about six lines at 412px, ~28 characters each. So
// it ran to seven lines, which is the wall of text this rewrite existed to
// remove. Split at its own comma, every word hers; "then build" became "Then
// I'll build" only because the clause became a sentence.
//
// Same honesty rule as the main-chat intro above: every claim maps to a
// shipped mechanism. Log workouts -> natural-language logging; swap what
// isn't working -> swap/addition proposals; plan around injuries -> the
// injury adaptation path; remember what matters -> user_facts; nothing
// changes without your okay -> propose-then-confirm cards; ask me anything
// -> the onboarding chat answers free questions. No capability the coach
// would then decline.
//
// Three short messages rather than one paragraph — two earlier drafts ran to
// a wall of text at 412px with the question below the fold. Checked with
// `render:screens`, not guessed.
// ---------------------------------------------------------------------------

export const ONBOARDING_INTRO_WHO =
  "Hi — I'm your personal trainer. I'll ask about your goals, what you've got to train with and what your week actually looks like."

export const ONBOARDING_INTRO_THE_ASK =
  "Then I'll build your training and your food around your answers. Nothing changes without your okay. First — what should I call you?"

/**
 * The messages a brand-new user sees before anything else in the app.
 *
 * Order is Ashley's: get to know you first, then what gets built, then the
 * first question. The name ask lands last because asking it first — which is
 * what this used to do — is a form opening with a field.
 *
 * No quick replies. Onboarding's whole redesign was that a coach waits for a
 * text reply rather than handing over buttons (chips are a rescue now, see
 * present_slot's description), so opening with chips would contradict the
 * screen it opens.
 */
export function buildOnboardingIntro(): FirstRunMessage[] {
  return [
    { content: ONBOARDING_INTRO_WHO },
    // asksSlot, not a chip card: this question ends in "what should I call
    // you?" and there is nothing to offer buttons for. It is what tells the
    // composer to say "Your name…" rather than describing the next question.
    { content: ONBOARDING_INTRO_THE_ASK, asksSlot: 'displayName' },
  ]
}
