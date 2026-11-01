// ---------------------------------------------------------------------------
// THE COACH MAY NOT DESCRIBE A DAY THAT IS NOT HERS (1 Nov 2026).
//
// Ashley, Sunday 11:22, a rest day with nothing logged, tapped "What should I
// focus on for the rest of today?" and the coach answered: "Since it's late in
// the evening and you've just wrapped up your workout, your main focus for the
// rest of tonight should be ..." Every fact the coach was sent was right: the
// prompt said "Sunday 11:21 AM (morning)" and "Workout Logged Today: No". The
// model wrote over both, almost certainly from the prompt's own examples (an
// evening "what should I eat?" and a "just finished deadlifts"), and nothing
// between the model and her screen compared the sentence with the facts.
//
// plan-claim.ts already refuses one false claim ("I've swapped your session")
// on a turn that changed nothing. This is its sibling for the two claims about
// the DAY ITSELF that the app knows for certain:
//
//   1. WHAT PART OF THE DAY IT IS. Only a sentence that says it IS that time
//      ("since it's late in the evening", "good evening", "the rest of
//      tonight") is refused when the clock says otherwise. Talking ABOUT a
//      later time ("have the bolognese tonight") is advice and passes.
//   2. THAT SHE HAS TRAINED TODAY, when nothing was trained or logged today:
//      "you've just wrapped up your workout", "since you've trained", "great
//      session today". A conditional ("once you've finished your session,
//      eat ...") and a question ("did you get it in?") pass.
//
// Both facts are given by the caller; a fact it does not have is null and its
// check is skipped, so a missing field can only let a sentence through, never
// refuse a true one.
//
// TWO COPIES, LIKE plan-claim: src/lib/today-claim.ts (the client, last thing
// before the screen, and the only copy running between a frontend merge and a
// chat-gemini deploy) and supabase/functions/_shared/today-claim.ts (the server,
// which can retry the model). KEEP THEM IDENTICAL — test:today-claim compares
// them and fails if they drift.
// ---------------------------------------------------------------------------

export type DayPart = 'morning' | 'afternoon' | 'evening'

export interface TodayFacts {
  /** The part of the day on her own clock (partOfDay's three words), or null when unknown. */
  partOfDay: string | null
  /** Anything trained or logged today (working sets, a finished or swapped session, cardio), or null when unknown. */
  trainedToday: boolean | null
  /** "Sunday", for the retry and the floor. */
  dayName?: string | null
  /** "11:21 AM", for the retry. */
  clock?: string | null
  /**
   * What she said this turn. When it talks about training at all ("I just did a 5k", "finished legs"), the
   * coach acknowledging it is not a false claim, even before anything is saved: the trained-today check
   * steps aside. The time-of-day check never does.
   */
  userMessage?: string | null
}

/** Her message is about training she did or is doing. Deliberately broad: a missed refusal is cheaper than a wrong one. */
const SHE_TALKS_TRAINING = /\b(?:train(?:ed|ing)?|work(?:ed)?\s*out|workout|session|gym|lift(?:ed|ing)?|weights|ran|run(?:ning)?|jog(?:ged|ging)?|walk(?:ed|ing)?|swim|swam|cycl(?:e|ed|ing)|ride|rode|bike|class|game|match|played|football|yoga|pilates|hiit|cardio|sets?|reps?|squats?|deadlifts?|bench|legs|push|pull)\b/i

export interface TodayClaim {
  kind: 'part_of_day' | 'trained_today'
  sentence: string
  /** For part_of_day: the part the sentence claimed. */
  claimed?: DayPart
}

/** "night" and "tonight" are evening on the app's three-part clock (partOfDay: 17:00 onwards). */
function asPart(word: string): DayPart {
  const w = word.toLowerCase()
  if (w === 'morning') return 'morning'
  if (w === 'afternoon') return 'afternoon'
  return 'evening'
}

/**
 * Sentences that SAY what time it is now. Each pattern's first capture is the
 * part of the day claimed.
 */
const IT_IS_NOW: RegExp[] = [
  // "since it's late in the evening", "it's getting late in the evening", "now that it's evening", "it is morning"
  /\b(?:it'?s|it\s+is|it\s+being)\s+(?:now\s+)?(?:already\s+)?(?:getting\s+)?(?:late|early|mid)?[\s-]*(?:in\s+the\s+)?(morning|afternoon|evening|night)\b/i,
  // "good evening", "good morning"
  /\bgood\s+(morning|afternoon|evening)\b/i,
  // A greeting opening the sentence: "Evening —", "Morning!", "Afternoon, Ashley"
  /^(morning|afternoon|evening)\s*[,!—–-]/i,
  // "the rest of tonight", "the rest of the evening", "for the rest of this morning"
  /\brest\s+of\s+(?:the\s+|this\s+|your\s+)?(tonight|morning|afternoon|evening|night)\b/i,
  // "at this time of night", "this late at night"
  /\b(?:this\s+time\s+of|this\s+late\s+at)\s+(night|evening)\b/i,
]

/** "you've just wrapped up your workout", "you finished today's session". */
const YOU_FINISHED = new RegExp(
  "\\byou(?:'ve|\\s+have)?\\s+(?:just\\s+|already\\s+|now\\s+)?" +
    '(?:wrapped\\s+up|finished|completed|smashed|crushed|nailed|got\\s+through|knocked\\s+out|done)\\s+' +
    "(?:your|today'?s|the|that|this)\\s+(?:\\w+\\s+){0,2}(?:workout|session|training|lift|lifting|gym\\s+session|weights)\\b",
  'i',
)

/** "since you've trained", "now that you've worked out", "you've trained today". */
const YOU_TRAINED = new RegExp(
  "\\b(?:since|now\\s+that|as|given\\s+that)\\s+you(?:'ve|\\s+have)?\\s+(?:just\\s+|already\\s+)?(?:trained|worked\\s+out|lifted|been\\s+to\\s+the\\s+gym)\\b" +
    "|\\byou(?:'ve|\\s+have)\\s+(?:just\\s+|already\\s+)?(?:trained|worked\\s+out|lifted)\\s+today\\b",
  'i',
)

/** "great session today", "nice work on today's workout", "post-workout ... tonight". */
const PRAISED_TODAY = new RegExp(
  "\\b(?:great|good|nice|solid|strong|brilliant)\\s+(?:work|job|session|workout|effort|lifting)\\s+(?:today|this\\s+(?:morning|afternoon|evening)|tonight)\\b" +
    "|\\bwell\\s+done\\s+on\\s+(?:your|today'?s|that|the)\\s+(?:\\w+\\s+){0,2}(?:workout|session|training)\\b" +
    "|\\bpost[\\s-]?workout\\b[^.?!]*\\b(?:tonight|today|now)\\b" +
    "|\\b(?:tonight|today|now)'?s?\\b[^.?!]*\\bpost[\\s-]?workout\\b" +
    "|\\bafter\\s+(?:your|today'?s)\\s+(?:workout|session|training)\\s+(?:today|tonight|this\\s+(?:morning|afternoon|evening))\\b",
  'i',
)

/**
 * A conditional or a plan: talking about a session that may happen, not one that did. Read two ways,
 * because "Once you've finished your session, eat ..." and "If you train tonight, a post-workout meal ..."
 * put the condition in different places: at the start of the sentence, or right before the claim.
 */
const OPENS_CONDITIONAL = /^(?:if|once|when|whenever|as\s+soon\s+as|after|before|until|in\s+case|whether)\b/i
const JUST_BEFORE_CONDITIONAL = /\b(?:if|once|when|whenever|as\s+soon\s+as|after|until|in\s+case)\s+$/i
const FUTURE = /\b(?:you'll|you\s+will|going\s+to|gonna|plan(?:ning)?\s+to)\b/i

function trainedClaimIn(s: string): boolean {
  if (OPENS_CONDITIONAL.test(s) || FUTURE.test(s)) return false
  for (const re of [YOU_FINISHED, YOU_TRAINED, PRAISED_TODAY]) {
    const m = re.exec(s)
    if (!m) continue
    if (JUST_BEFORE_CONDITIONAL.test(s.slice(Math.max(0, m.index - 30), m.index))) continue
    return true
  }
  return false
}

/** Sentence-ish, the same split plan-claim uses: the claim and its hedge live in one sentence. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(t => t.trim())
    .filter(Boolean)
}

/**
 * The first sentence that describes her day wrongly, or null. Returns the
 * sentence (not a boolean) so the caller can log what it refused: a false
 * positive nobody can read is one nobody can tune.
 */
export function detectTodayClaim(text: string, facts: TodayFacts): TodayClaim | null {
  const now = facts.partOfDay ? asPart(facts.partOfDay) : null
  for (const s of sentences(text ?? '')) {
    if (now) {
      for (const re of IT_IS_NOW) {
        const m = re.exec(s)
        if (!m) continue
        // "if it's evening when you train" is a hypothetical about the clock, not a claim.
        if (/\b(?:if|when|whenever|once|by\s+the\s+time)\b/i.test(s.slice(0, m.index))) continue
        const claimed = asPart(m[1])
        if (claimed !== now) return { kind: 'part_of_day', sentence: s, claimed }
      }
    }
    if (facts.trainedToday === false && !SHE_TALKS_TRAINING.test(facts.userMessage ?? '')) {
      if (!s.endsWith('?') && trainedClaimIn(s)) return { kind: 'trained_today', sentence: s }
    }
  }
  return null
}

/** The facts in one plain line, for the retry. */
function factLine(facts: TodayFacts): string {
  const when = [facts.dayName, facts.partOfDay].filter(Boolean).join(' ')
  const clock = facts.clock ? ` (${facts.clock})` : ''
  const trained = facts.trainedToday === false
    ? ' Nothing has been trained or logged today.'
    : facts.trainedToday === true ? ' Something has been logged today.' : ''
  return `Right now it is ${when || 'today'}${clock}.${trained}`
}

/**
 * THE RETRY. Names the wrong claim and the facts, so the same sentence does
 * not come straight back: "you said something untrue" with no facts invites a
 * different untrue sentence.
 */
export function todayClaimNudge(claim: TodayClaim, facts: TodayFacts): string {
  const wrong = claim.kind === 'part_of_day'
    ? `your last message said it is ${claim.claimed === 'evening' ? 'evening or night' : claim.claimed}. It is not.`
    : 'your last message said they have trained or finished a workout today. They have not.'
  return `(System: ${wrong} ${factLine(facts)} Answer their message again now, in your own voice, from those facts: never describe the time of day as anything else, and never say or imply they have trained, finished or wrapped up a workout today. No lists, no bold, plain text only.)`
}

/**
 * WHAT TO SAY WHEN THE RETRY GETS IT WRONG TOO. Owns the slip in one clause,
 * states the day as it is, and hands the turn back: a dead end would be its
 * own defect, and a third model call would only cost more of the same.
 */
export function todayClaimFloor(facts: TodayFacts): string {
  const when = [facts.dayName, facts.partOfDay].filter(Boolean).join(' ')
  const trained = facts.trainedToday === false ? " and there's nothing logged yet today" : ''
  return `Scratch that, I had your day wrong. It's ${when || 'today'}${trained}. Ask me that again and I'll answer from where you actually are.`
}
