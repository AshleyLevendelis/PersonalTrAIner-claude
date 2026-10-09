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

if (state === 'review') {
  // Everything the plan needs is answered, so the review opens by itself —
  // the component's own effect, not a flag set here.
  const all = {
    ...SAM_SO_FAR, recoveryCapacity: 'moderate', age: '31', heightCm: '178', weightKg: '82',
    gender: 'male', mealsPerDay: 3, dietaryPreferences: ['nut-free'], dislikedFoods: 'mushrooms',
    maxDumbbellKg: '24',
  }
  seed(draft(
    [
      { role: 'assistant', content: 'Hi — what should I call you?', asksSlot: 'displayName' },
      { role: 'user', content: 'Sam' },
      { role: 'assistant', content: 'Anything else you would rather I left out?' },
      { role: 'user', content: 'mushrooms' },
    ],
    all,
    Object.keys(all),
  ))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConversationalOnboarding onComplete={p => { w.__onbCompleted = p }} />
  </StrictMode>,
)
