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

createRoot(document.getElementById('root')!).render(
  <StrictMode><ConversationalOnboarding onComplete={() => {}} /></StrictMode>,
)
