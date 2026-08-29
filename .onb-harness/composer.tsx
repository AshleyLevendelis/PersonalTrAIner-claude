// Mounts the REAL ConversationalOnboarding and lets the driver read the
// composer's placeholder. No model: every state below is reached by seeding
// the draft store, which is the same door a resumed conversation comes
// through, so nothing here is a replica of the component's own logic.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConversationalOnboarding } from '@/components/onboarding/ConversationalOnboarding'
import '@/index.css'

window.addEventListener('error', e => { (window as any).__err = String(e.message) })
const state = new URLSearchParams(location.search).get('state') ?? 'fresh'
localStorage.removeItem('fitplan_onboarding_draft')

const draft = (messages: unknown[], values: Record<string, unknown>, confirmedSlots: string[]) => ({
  version: 1, values, confirmedSlots, messages, pendingContextFacts: [], pendingGoals: [],
})

if (state === 'card') {
  // The coach asked about training style and rendered its chips — the exact
  // shape of Ashley's second screenshot, where the composer said "How active
  // is your day?" under a question about style and equipment.
  localStorage.setItem('fitplan_onboarding_draft', JSON.stringify(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?' },
      { role: 'user', content: 'Ashley' },
      { role: 'assistant', content: "Nice to meet you, Ashley. What are we aiming at?" },
      { role: 'user', content: 'Fat loss' },
      { role: 'assistant', content: "So — how do you like to train?", slotCard: 'trainingStyle' },
    ],
    { displayName: 'Ashley', fitnessGoal: 'fat_loss' },
    ['displayName', 'fitnessGoal'],
  )))
}

if (state === 'resolved') {
  // Same conversation one beat later: the card is answered, nothing else is
  // on screen, so the hint should fall back to the canonical next question.
  localStorage.setItem('fitplan_onboarding_draft', JSON.stringify(draft(
    // Everything up to trainingDays is answered, so the canonical next open
    // slot is unambiguous. (An earlier version of this fixture left
    // fitnessGoal unanswered and then expected "Which days?" — the component
    // was right and the fixture was wrong.)
    [
      { role: 'assistant', content: 'Hi — what should I call you?' },
      { role: 'user', content: 'Ashley' },
      { role: 'assistant', content: "So — how do you like to train?", slotCard: 'trainingStyle', slotCardResolved: true },
    ],
    {
      displayName: 'Ashley', fitnessGoal: 'fat_loss', trainingExperience: 'intermediate',
      activityLevel: 'moderate', equipment: 'bodyweight', injuries: [],
      trainingStyle: 'bodybuilding',
    },
    ['displayName', 'fitnessGoal', 'trainingExperience', 'activityLevel', 'equipment', 'injuries', 'trainingStyle'],
  )))
}

if (state === 'freehand') {
  // ASHLEY'S CASE, third time this placeholder said the wrong thing. The coach
  // asks for the three lift weights in prose — no chip card, no asksSlot — so
  // the "what is on screen" finder gets nothing and the canonical-next-slot
  // fallback used to run. That fallback cannot see the lift slots (they are
  // requiredIf-conditional), so it skipped them and answered "Which days?"
  // under a question about squat, bench and deadlift.
  localStorage.setItem('fitplan_onboarding_draft', JSON.stringify(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Ashley' },
      { role: 'assistant', content: 'Do you know your working weights?', slotCard: 'knowsWorkingLifts', slotCardResolved: true },
      { role: 'user', content: 'I know my numbers' },
      { role: 'assistant', content: "Since you know your numbers, let's get those logged — what are your current working weights for your squat, bench, and deadlift?" },
    ],
    { displayName: 'Ashley', fitnessGoal: 'fat_loss', trainingExperience: 'intermediate',
      activityLevel: 'moderate', equipment: 'full_gym', injuries: [], knowsWorkingLifts: true },
    ['displayName', 'fitnessGoal', 'trainingExperience', 'activityLevel', 'equipment', 'injuries', 'knowsWorkingLifts'],
  )))
}

if (state === 'liftcard') {
  // The same question WITH a card attached: the composer must now name that
  // slot rather than fall back to anything.
  localStorage.setItem('fitplan_onboarding_draft', JSON.stringify(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Ashley' },
      { role: 'assistant', content: 'What is your squat working weight?', slotCard: 'knownSquatKg' },
    ],
    { displayName: 'Ashley', fitnessGoal: 'fat_loss', trainingExperience: 'intermediate',
      activityLevel: 'moderate', equipment: 'full_gym', injuries: [], knowsWorkingLifts: true },
    ['displayName', 'fitnessGoal', 'trainingExperience', 'activityLevel', 'equipment', 'injuries', 'knowsWorkingLifts'],
  )))
}

if (state === 'bodygroup') {
  // ASHLEY'S CASE: the age/height/weight card on screen with age already
  // filled, and the composer reading "Your age…" — naming one of three
  // questions, and the one she had already answered.
  localStorage.setItem('fitplan_onboarding_draft', JSON.stringify(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Ashley' },
      { role: 'assistant', content: 'Could you tell me your age, height, and what you weigh right now?', slotCard: 'age' },
    ],
    { displayName: 'Ashley', fitnessGoal: 'fat_loss', trainingExperience: 'intermediate',
      activityLevel: 'moderate', equipment: 'full_gym', injuries: [], age: 37 },
    ['displayName', 'fitnessGoal', 'trainingExperience', 'activityLevel', 'equipment', 'injuries'],
  )))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><ConversationalOnboarding onComplete={() => {}} /></StrictMode>,
)
