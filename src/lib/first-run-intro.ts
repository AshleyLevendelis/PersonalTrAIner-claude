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
export function buildFirstRunIntro(
  greeting: string,
  session: FirstRunSessionBrief | null,
): FirstRunMessage[] {
  const opener = (() => {
    if (!session) {
      // No plan day to point at. Say the true thing rather than inventing a
      // session — this is the branch a broken plan lands in, and a confident
      // "day one starts now" there would be the app lying on its first line.
      return `${greeting} — welcome aboard. Your plan's built and waiting. Have a look around, and tell me anything you need.`
    }
    // The movements list already ends in an ellipsis when it was truncated,
    // and a full stop after one reads as a typo ("Dumbbell Press….").
    const stop = session.movements.endsWith('…') ? '' : '.'
    const brief = `${session.focus} — ${session.movements}${stop}`
    if (session.when === 'today') {
      return `${greeting} — welcome aboard. Day one starts today: ${brief} Give it a proper go and we'll build from there.`
    }
    if (session.when === 'whenever') {
      // A training day, but past the hour they said they train. "Starts right
      // now" would be pushing someone into a session at 10pm.
      return `${greeting} — welcome aboard. Day one is ready when you are: ${brief} Tonight or tomorrow, your call.`
    }
    return `${greeting} — welcome aboard. Day one is ${session.when}: ${brief} Rest up and come in ready for it.`
  })()

  // The chips go on this message because it is the last one — getQuickReplies-
  // ForLastMessage reads messages[messages.length - 1].quickReplies and
  // nothing else. With one message that is trivially true; it was not before,
  // and attaching them anywhere else was a silent no-op.
  const dayOneIsToday = session?.when === 'today' || session?.when === 'whenever'
  return [{
    content: opener,
    quickReplies: dayOneIsToday ? FIRST_RUN_QUICK_REPLIES : FIRST_RUN_QUICK_REPLIES_AHEAD,
  }]
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
