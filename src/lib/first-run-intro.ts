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
export const FIRST_RUN_QUICK_REPLIES = [
  'Talk me through today',
  'Swap an exercise',
  "There's a food I won't eat",
]

/**
 * The two middle messages — the ones carrying "what does this actually do".
 *
 * STILL NOT A FEATURE LIST, and that restraint is deliberate. A brand-new
 * user does not need an inventory of 22 tools; they need to know what KIND of
 * thing to type. So these describe the shape of the relationship — say it in
 * plain words, I act, I remember, nothing moves without your yes — and the
 * how-to-use-it half is carried by the chips rather than by prose.
 *
 * TWO messages, not one, and that is a `render:screens` finding rather than a
 * preference: as a single paragraph this ran to NINE lines at 412px, which is
 * the block of text the three-message split existed to avoid in the first
 * place. Split at the natural seam — what you say, then what I'll do with it
 * — and each half lands in three to six lines.
 *
 * "Anything that changes your plan, I'll show you first" is not a flourish:
 * six of the highest-value tools are propose-only and render a card the user
 * confirms. Saying so up front is what makes the first proposal card read as
 * designed rather than as the app hesitating.
 */
export const FIRST_RUN_WHAT_TO_SAY =
  "Your plan's built and ready. Talk to me like you'd talk to a person — how a session went, a food you can't stand, a shoulder that's grumbling. I'll sort it, and I'll remember it."

export const FIRST_RUN_THE_PROMISE =
  "Anything that changes your plan, I'll show you first — nothing moves without your say-so."

export interface FirstRunMessage {
  content: string
  quickReplies?: string[]
}

/**
 * Short messages instead of one block: who this is, what to say to it, what
 * it will and won't do without asking, then one real opening question.
 *
 * The chips go on the LAST message and only the last: getQuickRepliesFor-
 * LastMessage reads messages[messages.length - 1].quickReplies and nothing
 * else, so attaching them anywhere earlier is a silent no-op.
 *
 * @param greeting        e.g. "Morning, Ashley" — already name-aware.
 * @param detailSentence  the specific-today line, already capitalised.
 */
export function buildFirstRunIntro(greeting: string, detailSentence: string): FirstRunMessage[] {
  return [
    { content: `${greeting} — I'm your coach. Good to meet you.` },
    { content: FIRST_RUN_WHAT_TO_SAY },
    { content: FIRST_RUN_THE_PROMISE },
    { content: detailSentence, quickReplies: FIRST_RUN_QUICK_REPLIES },
  ]
}
