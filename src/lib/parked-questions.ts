// ---------------------------------------------------------------------------
// QUESTIONS PARKED DURING SETUP, AND OWED AN ANSWER AFTER IT.
//
// Ashley's ruling, August 2026 (recorded in her notes; written into the repo
// here, 9 Oct 2026): "Off-topic mid-onboarding (e.g. 'what does creatine do'):
// prefer deferring with a reason — get to know you first, then come back to
// it — over answering in full", with the caution she accepted: "cap the
// deferrals so it doesn't feel like being handled".
//
// "Then come back to it" is the half a prompt cannot keep. The onboarding
// coach holds no state and is a different function from the coach in the app,
// so a deferral with nothing behind it is a promise the app forgets the
// moment the plan is built. This is what is behind it: the question is kept
// on the device and handed to the first coach message, where it appears as
// something to tap (see buildFirstRunIntro).
//
// On the device, not in the account: it is read once, minutes later, on the
// phone that asked. It deliberately does NOT go into the coach's remembered
// facts — "asked about creatine once" is not something to carry for months.
// ---------------------------------------------------------------------------

const KEY = 'fitplan_parked_questions'
/** Long enough for a real question, short enough to be a button. */
const MAX_LENGTH = 120

/**
 * Add a parked question, in the person's OWN words.
 *
 * The coach names the question it is parking, but what is kept is taken from
 * what the person actually typed: the coach's wording only when it is a piece
 * of their message, otherwise the message itself. The words come back later
 * as a button that is sent as THEIR message, so they must be theirs.
 */
export function addParkedQuestion(existing: readonly string[], coachSays: string, theyTyped: string): string[] {
  const typed = theyTyped.trim().replace(/\s+/g, ' ')
  const named = coachSays.trim().replace(/\s+/g, ' ')
  const question = (named && typed.toLowerCase().includes(named.toLowerCase()) ? named : typed).slice(0, MAX_LENGTH).trim()
  if (!question) return [...existing]
  if (existing.some(q => q.toLowerCase() === question.toLowerCase())) return [...existing]
  return [...existing, question]
}

export function saveParkedQuestions(questions: readonly string[]): void {
  try {
    if (questions.length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(questions))
  } catch {
    // Private mode or a full quota: the question is not shown again. Nothing
    // else depends on this.
  }
}

export function loadParkedQuestions(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === 'string' && q.trim().length > 0) : []
  } catch {
    return []
  }
}
