import {
  ONBOARDING_SLOTS,
  getSlotDef,
  isSlotApplicable,
  numericGroupFor,
  type OnboardingSlotValues,
  type SlotKey,
} from './onboarding-slots'

// ---------------------------------------------------------------------------
// WHICH CARD, IF ANY, BELONGS UNDER THIS COACH MESSAGE.
//
// Seen on a phone, 9 Oct 2026 (test log H14): the coach asked "how old are
// you, and what are your current height and weight?" and the chips under it
// read 2 meals / 3 meals / 4 meals.
//
// Nothing was broken in the usual sense. The words and the chips come from
// the model separately — often from two different calls, because a turn that
// records an answer comes back with tool calls and no prose, and a second
// call writes the sentence. The prompt asks the model to keep them aligned
// ("options under the wrong question are worse than none") and nothing held
// it to that. The client stapled whichever chips were asked for onto
// whichever sentence arrived.
//
// So the app now reads the sentence itself. A card is shown only when the
// QUESTION IN THE MESSAGE asks for that card's answer:
//
//   1. the model asked for chips, and the message asks that same question
//      → show them;
//   2. the model asked for chips for something else, and the message plainly
//      asks exactly one other open question → show THAT question's card
//      (the H14 turn gets the age / height / weight boxes);
//   3. anything else → no card. The typing box still works. Missing chips
//      cost one typed answer; wrong chips record a wrong answer.
//
// The patterns are deliberately question-shaped ("which days", "how long")
// rather than topic words ("days", "time"): a coach reacts to the last answer
// in the same breath as asking the next thing, so "three days is plenty — how
// long have you got?" mentions days and asks about minutes.
//
// THIS CAN HIDE CHIPS ON A CORRECTLY ASKED QUESTION whose wording none of
// these anticipate. That is the accepted direction of error, it is logged to
// the console every time it happens, and the corpus in
// scripts/test-onboarding-chip-match.ts is where a missed phrasing gets added.
// ---------------------------------------------------------------------------

/** Matches when the text asks this slot's question. A pair is [asks, unless]. */
type Asks = RegExp | readonly [RegExp, RegExp]

const ASKS: Record<SlotKey, Asks> = {
  displayName: /call you|your name/i,
  fitnessGoal: /\bgoals?\b|aiming (at|for)|what are you (actually |really |mainly )?after|what do you want (to get )?(out of|from)|what brings you|hoping to (get|achieve)/i,
  trainingExperience: /how (much|long) (training|lifting)|how long have you (been|trained|lifted)|\bexperience\b|new to (this|it|training|lifting|the gym)|(trained|lifted) before|where are you at with/i,
  activityLevel: /how active|day[- ]to[- ]day|on your feet|\bdesk\b|outside (of )?(training|the gym|your sessions)/i,
  equipment: /equipment|\bkit\b|where (do|will|would) you (train|be training|work ?out)|access to|gym or (at )?home|home or (the |a )?gym|what (have|do) you (got|have) to (train|work) with/i,
  startPreference: /where (do|would) you (want|like) to start|ease in|straight in/i,
  injuries: /injur|niggle|bother|\bache|\bpain|work(ing)? around|play(s|ing)? up|dodgy/i,
  knowsWorkingLifts: /know (your|what you).{0,40}(numbers|lifts|weights|squat|bench|dead)|working (lifts|weights)|your numbers/i,
  knownSquatKg: /squat|working weights?/i,
  knownBenchKg: /bench/i,
  knownDeadliftKg: /dead\s?lift/i,
  trainingDays: /(which|what) days?|days (a|per|each) week|how many (days|times|sessions)|times a week|week look like/i,
  sessionDuration: [
    /how long|how much time|minutes|\bmins?\b|\bhour\b|session length/i,
    // "How long have you been training?" is experience; "how much time do you
    // want to spend cooking?" is cooking. Neither is session length.
    /cook|kitchen|\bmeals?\b|\beat|how long have you (been|trained|lifted)|been (training|lifting)|stuck with/i,
  ],
  trainingStyle: /\bstyle\b|(like|prefer|want) to train|kind of training (do )?you (like|enjoy|prefer)/i,
  conditioningPreference: /cardio|conditioning/i,
  recoveryCapacity: /recover|sleep|stress|well rested/i,
  dislikedExercises: /exercises? (you|to)\b.{0,30}(never|avoid|skip|hate|rather)/i,
  age: /how old|\bage\b/i,
  heightCm: /how tall|\bheight\b/i,
  weightKg: [
    /\bweigh\b|\bweight\b|bodyweight/i,
    // A TARGET weight is a different question from what they weigh today.
    /goal|target|\baim|toward|get (down |up )?to|starting[- ]weight|working weight/i,
  ],
  gender: /\bsex\b|\bgender\b|male or female|female or male|which should i use for/i,
  mealsPerDay: /how many meals|meals (a|per|each) day|times a day|how often (do|would) you (like to |want to )?eat|\b(two|three|four|2|3|4) meals/i,
  dietaryPreferences: /dietar|\bdiet\b|allerg|intoleran|vegetarian|vegan|restriction/i,
  dislikedFoods: /won'?t eat|rather i left out|leave (out|off)|foods? (you|to)\b.{0,20}(hate|dislike|avoid|can'?t stand)/i,
  cookingTime: /cook|kitchen/i,
  includeSnacks: /snack/i,
  favoriteCuisines: /cuisine|kinds? of food|food do you (like|love|enjoy)/i,
  breakfastStyle: /breakfast/i,
  maxDumbbellKg: /heaviest dumbbell|dumbbells? go (up )?to/i,
  maxSingleImplementKg: /heaviest kettlebell/i,
  maxImprovisedKg: /bag\b.{0,20}\bhold/i,
}

/**
 * The part of a coach message that ASKS something: every sentence with a
 * question mark, or the last sentence when there is none ("Tell me which days
 * work."). The reaction to the previous answer is left out on purpose.
 */
export function questionPartOf(text: string): string {
  const sentences = (text.match(/[^.!?]+[.!?]*/g) ?? []).map(s => s.trim()).filter(Boolean)
  const questions = sentences.filter(s => s.includes('?'))
  return (questions.length > 0 ? questions : sentences.slice(-1)).join(' ')
}

function asksOne(key: SlotKey, question: string): boolean {
  const a = ASKS[key]
  return a instanceof RegExp ? a.test(question) : a[0].test(question) && !a[1].test(question)
}

/**
 * Does this question ask for this slot's answer? A grouped card (age, height
 * and weight; the three lifts) is one question, so any member counts.
 */
export function questionAsksSlot(key: SlotKey, question: string): boolean {
  return numericGroupFor(key).some(k => asksOne(k, question))
}

/** The question names one of the slot's own options ("you picked Advanced — which one is you?"). */
function questionNamesAnOption(key: SlotKey, question: string): boolean {
  const q = question.toLowerCase()
  return (getSlotDef(key)?.options ?? []).some(o => o.label.length >= 5 && q.includes(o.label.toLowerCase()))
}

export interface CardChoiceInput {
  /** The coach message the card would sit under. Undefined when the turn produced no words at all. */
  hostText: string | undefined
  /** Slots the model asked to show a card for this turn, most trusted first. */
  requested: readonly string[]
  /** Slots with an unanswered card further up the conversation. */
  liveCards: readonly string[]
  values: OnboardingSlotValues
  confirmed: ReadonlySet<string>
  /** Slots this turn changed from one answer to another — the one case an answered question may be re-offered. */
  corrected: ReadonlySet<string>
  /** Slots that already have a card among this turn's new messages. */
  cardedThisTurn: readonly string[]
}

/**
 * The slot whose card belongs under this message, or undefined for none.
 * Never returns a card for a question the message does not ask.
 */
export function chooseCard(input: CardChoiceInput): SlotKey | undefined {
  const { hostText, values, confirmed, corrected, cardedThisTurn } = input
  const open = (key: string): key is SlotKey => {
    const def = getSlotDef(key)
    // An answered slot is refused, so the model cannot re-ask what it already
    // knows — unless this turn corrected it (Ashley, 30 Aug 2026: "tapping is
    // how the wrong answer got in and it should be how it gets out").
    return !!def
      && (!confirmed.has(key) || corrected.has(key))
      && isSlotApplicable(def, values)
      && !cardedThisTurn.includes(key)
  }
  const hasCard = (key: SlotKey) => getSlotDef(key)?.control !== 'text'
  // The card's key is the first member of its group still unanswered, so the
  // card resolves when that member is saved.
  const cardKeyFor = (key: SlotKey): SlotKey => numericGroupFor(key).find(open) ?? key

  const requested = input.requested.filter(open)
  // A question with a real control beats one that only steers the typing box.
  requested.sort((a, b) => Number(hasCard(b)) - Number(hasCard(a)))

  if (requested.length > 0 && hostText === undefined) return cardKeyFor(requested[0])
  if (hostText === undefined) return undefined
  const question = questionPartOf(hostText)

  // ANY request counts here, including one for a slot that turned out to be
  // answered or unknown: the model wanted chips under this sentence.
  if (input.requested.length > 0) {
    const agreed = requested.find(k => questionAsksSlot(k, question))
    if (agreed) return cardKeyFor(agreed)
    // The model asked for chips, but for a different question than the one it
    // wrote. If the words plainly ask exactly one open question, that is the
    // card to show.
    const others = new Set<SlotKey>()
    for (const s of ONBOARDING_SLOTS) {
      if (hasCard(s.key) && open(s.key) && asksOne(s.key, question)) others.add(cardKeyFor(s.key))
    }
    if (others.size === 1) return [...others][0]
    if (others.size === 0) {
      const named = requested.find(k => hasCard(k) && questionNamesAnOption(k, question))
      if (named) return cardKeyFor(named)
    }
  }

  // No usable request — but a card for this very question is still sitting
  // unanswered further up. The coach has asked again, so the card comes too.
  const stillLive = new Set<SlotKey>()
  for (const k of input.liveCards) {
    if (open(k) && hasCard(k) && questionAsksSlot(k, question)) stillLive.add(cardKeyFor(k))
  }
  return stillLive.size === 1 ? [...stillLive][0] : undefined
}
