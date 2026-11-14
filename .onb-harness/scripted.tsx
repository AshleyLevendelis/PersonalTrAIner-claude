// Mounts the REAL ConversationalOnboarding with the coach SCRIPTED.
//
// Why this page exists: the other onboarding pages seed a state and read it.
// None of them can show what happens when a turn comes BACK, because
// `*.supabase.co` is unreachable from the sandbox — so the two defects that
// only exist on a reply (chips under the wrong question; a re-asked question
// whose chips stay on the older message) had no check at all, and were found
// by a person on a phone.
//
// The door is `fetch`, the same one the component already goes through: a
// request to onboarding-chat is answered from a queue the DRIVER fills, in
// the edge function's own `{ reply, actions }` shape. Everything after that —
// validating set_slot, choosing which message hosts the chips, moving a card,
// the review, the edit rows — is the component's real code, not a replica.
//
// An unscripted request is counted and answered 500, so a driver that forgot
// to queue a turn reads as "Connection hiccup" plus a non-zero counter rather
// than as a pass.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConversationalOnboarding } from '@/components/onboarding/ConversationalOnboarding'
import { COMPLETE_MESSAGE } from '@/lib/onboarding-completion'
import { ONBOARDING_SLOTS } from '@/lib/onboarding-slots'
import '@/index.css'

type Scripted = { reply?: string; actions?: Array<{ name: string; args: Record<string, unknown> }> }
const w = window as unknown as {
  __err?: string
  __onbQueue: Scripted[]
  __onbRequests: unknown[]
  __onbUnscripted: number
  __onbCompleted?: unknown
}
window.addEventListener('error', e => { w.__err = String(e.message) })
w.__onbQueue = []
w.__onbRequests = []
w.__onbUnscripted = 0
// Every typing hint the box can show, for verify:setup-qa3's fit check (read only).
;(window as unknown as { __inputHints: string[] }).__inputHints = ONBOARDING_SLOTS.map(d => d.inputHint).filter((h): h is string => !!h)

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!url.includes('/functions/v1/onboarding-chat')) return realFetch(input, init)
  w.__onbRequests.push(JSON.parse(String(init?.body ?? '{}')))
  const next = w.__onbQueue.shift()
  if (!next) {
    w.__onbUnscripted++
    return new Response('{}', { status: 500 })
  }
  return new Response(JSON.stringify(next), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

const state = new URLSearchParams(location.search).get('state') ?? 'fresh'
// `keep` is a RELOAD: the draft the last page saved is left exactly as it is,
// which is the door a refreshed or resumed conversation really comes through.
if (state !== 'keep') localStorage.removeItem('fitplan_onboarding_draft')

const draft = (messages: unknown[], values: Record<string, unknown>, confirmedSlots: string[]) => ({
  version: 1, values, confirmedSlots, messages, pendingContextFacts: [], pendingGoals: [],
})
const seed = (d: unknown) => localStorage.setItem('fitplan_onboarding_draft', JSON.stringify(d))

// SAM, the tester's persona, at the moment H14 was seen: everything up to
// recovery answered, a home trainer on the no-barbell tier (so the working-
// lifts questions never apply), and the recovery card live.
const SAM_SO_FAR = {
  displayName: 'Sam', fitnessGoal: 'fat_loss', trainingExperience: 'intermediate',
  activityLevel: 'moderate', equipment: 'minimalist', injuries: [],
  trainingDays: ['Mon', 'Wed', 'Fri'], sessionDuration: '30-45',
  trainingStyle: 'functional', conditioningPreference: 'tolerate',
  // His answer to the kit ticks (18 Oct 2026), shown once to every home trainer: dumbbells and a flat bench.
  kitTicks: ['dumbbells', 'bench'],
}

if (state === 'h14') {
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Sam' },
      { role: 'assistant', content: "And how's your sleep and stress at the moment — are you recovering well between sessions?", slotCard: 'recoveryCapacity' },
    ],
    SAM_SO_FAR,
    Object.keys(SAM_SO_FAR),
  ))
}

if (state === 'm2') {
  // The session-length question is on screen WITH its chips, unanswered — the
  // state the tester was in when they typed a creatine question instead.
  const { sessionDuration: _a, trainingStyle: _b, conditioningPreference: _c, ...before } = SAM_SO_FAR
  void _a; void _b; void _c
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Sam' },
      { role: 'assistant', content: 'Three days is plenty to work with. How long have you realistically got on those days?', slotCard: 'sessionDuration' },
    ],
    before,
    Object.keys(before),
  ))
}

if (state === 'days') {
  // ASHLEY'S SETUP (7 Nov 2026): the days question with only a typing box, and
  // her typed answer naming her gym days AND her muay thai days. Everything up
  // to the kit answered; the days and what follows still open.
  const { trainingDays: _a, sessionDuration: _b, trainingStyle: _c, conditioningPreference: _d, ...before } = SAM_SO_FAR
  void _a; void _b; void _c; void _d
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Sam' },
      { role: 'assistant', content: 'Dumbbells and a bench, that works.' },
    ],
    before,
    Object.keys(before),
  ))
}

if (state === 'injuries') {
  // THE INJURIES CARD WITH THE HEALTH TAPS (his ruling 14 Nov 2026, "Fold into injuries"): goal, experience and
  // equipment answered; the injuries card is the app's next question.
  const { injuries: _i, trainingDays: _a, sessionDuration: _b, trainingStyle: _c, conditioningPreference: _d, kitTicks: _e, ...before } = SAM_SO_FAR
  void _i; void _a; void _b; void _c; void _d; void _e
  const b = { ...before, equipment: 'full_gym' }
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Sam' },
      { role: 'assistant', content: 'Anything that bothers you when you train, or anything a doctor has said to watch?', slotCard: 'injuries' },
    ],
    b,
    Object.keys(b),
  ))
}

if (state === 'kit-bodyweight') {
  // MARGARET'S CASE (his ruling 14 Nov 2026, "Nothing ticked"): "Bodyweight only" just answered; the ticks start empty.
  const { trainingDays: _a, sessionDuration: _b, trainingStyle: _c, conditioningPreference: _d, kitTicks: _e, ...before } = SAM_SO_FAR
  void _a; void _b; void _c; void _d; void _e
  const bw = { ...before, equipment: 'bodyweight' }
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Sam' },
      { role: 'assistant', content: 'Which of these do you have?', slotCard: 'kitTicks' },
    ],
    bw,
    Object.keys(bw),
  ))
}

if (state === 'kit') {
  // THE KIT TICKS (runs 7-10, H34, 18 Oct 2026): Sam has just picked "no barbell or bench" and said nothing more
  // about his kit; the app's own next question is the ticks. Equipment answered, the ticks not yet.
  const { trainingDays: _a, sessionDuration: _b, trainingStyle: _c, conditioningPreference: _d, kitTicks: _e, ...before } = SAM_SO_FAR
  void _a; void _b; void _c; void _d; void _e
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Sam' },
      { role: 'assistant', content: 'Which of these do you have?', slotCard: 'kitTicks' },
    ],
    before,
    Object.keys(before),
  ))
}

if (state === 'review' || state === 'review-card' || state === 'review-notes') {
  // Everything the plan needs is answered, so the review opens by itself —
  // the component's own effect, not a flag set here.
  const all = {
    ...SAM_SO_FAR, recoveryCapacity: 'moderate', age: '31', heightCm: '178', weightKg: '82',
    gender: 'male', mealsPerDay: 3, dietaryPreferences: ['nut-free'], dislikedFoods: 'mushrooms',
    // What he usually eats (asked since 11 Nov 2026): answered, or the review would not be open.
    usualFoods: 'porridge, chicken and rice',
    maxDumbbellKg: '24',
  }
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Sam' },
      // review-card: one optional question was asked and never answered, so
      // its card is still live above the summary — a second control on screen
      // while a summary row is being changed.
      ...(state === 'review-card'
        ? [{ role: 'assistant', content: 'How much time do you want to spend cooking?', slotCard: 'cookingTime' }]
        : []),
      { role: 'assistant', content: 'Anything else you would rather I left out?' },
      { role: 'user', content: 'mushrooms' },
      // The app's own closing line, as a finished conversation really has it.
      { role: 'assistant', content: COMPLETE_MESSAGE },
    ],
    all,
    Object.keys(all),
  ))
  // review-notes (7 Nov 2026): two notes the coach kept from the conversation,
  // the way record_context_fact leaves them, so the summary has something to show.
  if (state === 'review-notes') {
    const d = JSON.parse(localStorage.getItem('fitplan_onboarding_draft') || '{}')
    d.pendingContextFacts = [
      { rawPhrase: 'been doing muay thai about three years', displayText: 'Three years of Muay Thai, spars most weeks' },
      { rawPhrase: 'I work nights twice a week', displayText: 'Works two night shifts a week' },
    ]
    seed(d)
  }
}

// NONE-LEFT (8 Nov 2026, QA round 3): everything answered but the foods to leave out (a typed question, on screen)
// and favourite cuisines, the one open question a bare "none" could match. Typed to the foods question, "none" was
// filed under cuisines with a tick. INPUT only: which questions are answered, and which one is being asked.
if (state === 'none-left') {
  const answered = {
    ...SAM_SO_FAR, recoveryCapacity: 'moderate', age: '31', heightCm: '178', weightKg: '82',
    gender: 'male', mealsPerDay: 3, dietaryPreferences: ['nut-free'], includeSnacks: true, cookingTime: 'moderate',
    // Already answered, so Foods to avoid is still the ONE question left, which is what this state is for.
    breakfastStyle: 'cooked', usualFoods: '',
  }
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Sam' },
      { role: 'assistant', content: "Anything else you'd rather I left out?", asksSlot: 'dislikedFoods' },
    ],
    answered,
    Object.keys(answered),
  ))
}

// ?state=usual — "WHAT DO YOU USUALLY EAT?" IS THE QUESTION ON SCREEN (his ruling, 11 Nov 2026, "My usual meals
// first"). Everything else is answered, and the app has just asked it. INPUT only: what is recorded from the reply,
// by the coach or by the app when the coach records nothing, is the component's doing.
if (state === 'usual') {
  const answered = {
    ...SAM_SO_FAR, recoveryCapacity: 'moderate', age: '31', heightCm: '178', weightKg: '82',
    gender: 'male', mealsPerDay: 3, dietaryPreferences: ['nut-free'], dislikedFoods: 'mushrooms',
  }
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Sam' },
      { role: 'assistant', content: 'What do you usually eat? A few meals or foods you have most weeks.', asksSlot: 'usualFoods' },
    ],
    answered,
    Object.keys(answered),
  ))
}

// ?state=freehand-food — QA round 3 (9 Nov 2026): the body questions still open, the conversation on food, and the
// coach's latest question in its own words (no slot named). The header said "Body" here, the first unanswered slot.
if (state === 'freehand-food') {
  const answered = { ...SAM_SO_FAR, mealsPerDay: 3, dietaryPreferences: ['nut-free'] }
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Sam' },
      { role: 'assistant', content: 'Any diet I should know about?', asksSlot: 'dietaryPreferences' },
      { role: 'user', content: 'nut-free' },
      { role: 'assistant', content: 'Noted. Is there anything you just never want to see on your plate?' },
    ],
    answered,
    Object.keys(answered),
  ))
}

// JO, a gym lifter at the working-lifts question — the state Ashley was in on
// 19 Oct 2026 when "I know my numbers" asked her nothing. Barbell-capable and
// not a beginner, so the question applies; its card is live.
const JO_SO_FAR = {
  displayName: 'Jo', fitnessGoal: 'hypertrophy', trainingExperience: 'intermediate',
  activityLevel: 'moderate', equipment: 'full_gym', injuries: [],
}
if (state === 'lifts') {
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Jo' },
      { role: 'assistant', content: 'Nothing to work around, good. Do you know your current working weights for squat, bench and deadlift?', slotCard: 'knowsWorkingLifts' },
    ],
    JO_SO_FAR,
    Object.keys(JO_SO_FAR),
  ))
}
if (state === 'review-lifter') {
  // Everything answered, "Not sure" on the working lifts: the summary opens.
  const all = {
    ...JO_SO_FAR, knowsWorkingLifts: false, trainingDays: ['Mon', 'Wed', 'Fri'], sessionDuration: '45-60',
    trainingStyle: 'functional', conditioningPreference: 'tolerate', recoveryCapacity: 'moderate',
    age: '34', heightCm: '170', weightKg: '70', gender: 'female', mealsPerDay: 3,
    dietaryPreferences: [], dislikedFoods: 'none', usualFoods: '',
  }
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Jo' },
      { role: 'assistant', content: COMPLETE_MESSAGE },
    ],
    all,
    Object.keys(all),
  ))
}

// REVIEW-KNOWN-LIFTS (Sal/Margaret, 14 Nov 2026): everything answered, an intermediate lifter who gave his three sets,
// so the summary is open with them in it. INPUT only. The driver changes his experience to Beginner from the summary.
if (state === 'review-known-lifts') {
  const all = {
    ...JO_SO_FAR, knowsWorkingLifts: true, knownSquatKg: '100 kg x 5', knownBenchKg: '80 kg x 5', knownDeadliftKg: '120 kg x 5',
    trainingDays: ['Mon', 'Wed', 'Fri'], sessionDuration: '45-60',
    trainingStyle: 'functional', conditioningPreference: 'tolerate', recoveryCapacity: 'moderate',
    age: '34', heightCm: '170', weightKg: '70', gender: 'female', mealsPerDay: 3,
    dietaryPreferences: [], dislikedFoods: 'none', usualFoods: '',
  }
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Jo' },
      { role: 'assistant', content: COMPLETE_MESSAGE },
    ],
    all,
    Object.keys(all),
  ))
}

// HIS SETUP, 13 NOV 2026 (five screenshots: "Asking me questions about my background in lifting which is vague and no
// multiple choice ... it asked me working weights and I gave a number but it didn't clarify which exercise ... then it
// started asking multiple questions at once"). INPUT only: which answers are in and which question is on screen.
//   his-experience  name and goal answered; the coach has just asked whether he lifts, in words, no card.
//   his-lifts       a barbell lifter up to the working-lifts question; the coach asked what he lifts, in words, no card.
//   his-stalled     the working-lifts card has been put up three times and never answered (his session after "110kg"),
//                   then a later answer landed (a tick), so the conversation is moving but the counter is tripped.
const HIS_SO_FAR = {
  displayName: 'Ashley', fitnessGoal: 'hypertrophy', trainingExperience: 'intermediate',
  activityLevel: 'moderate', equipment: 'full_gym', injuries: [],
}
if (state === 'his-experience') {
  const answered = { displayName: 'Ashley', fitnessGoal: 'hypertrophy' }
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Ashley' },
      { role: 'assistant', content: 'Building muscle, good. Have you done any lifting before?' },
    ],
    answered,
    Object.keys(answered),
  ))
}
if (state === 'his-lifts') {
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Ashley' },
      { role: 'assistant', content: 'Nothing to work around, good. What sort of weights are you moving on the big lifts at the moment?' },
    ],
    HIS_SO_FAR,
    Object.keys(HIS_SO_FAR),
  ))
}
if (state === 'his-stalled') {
  const answered = { ...HIS_SO_FAR, trainingDays: ['Mon', 'Wed', 'Fri'] }
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Ashley' },
      { role: 'assistant', content: 'Do you know your working weights for squat, bench and deadlift?', slotCard: 'knowsWorkingLifts', slotCardSuperseded: true },
      { role: 'user', content: '110kg' },
      { role: 'assistant', content: 'Got it. Could you tell me your current working weights for the squat, bench press, and deadlift?', slotCard: 'knowsWorkingLifts', slotCardSuperseded: true },
      { role: 'user', content: 'Which exercise did I mean?' },
      { role: 'assistant', content: 'Was that 110kg for your back squat, bench press, or deadlift?', slotCard: 'knowsWorkingLifts' },
      { role: 'user', content: 'Mon, Wed, Fri' },
      { role: 'assistant', content: '✓ Training days — Mon, Wed, Fri', isReceipt: true },
      { role: 'assistant', content: 'Three days works. How long have you got for each session?' },
    ],
    answered,
    Object.keys(answered),
  ))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConversationalOnboarding onComplete={p => { w.__onbCompleted = p }} />
  </StrictMode>,
)
