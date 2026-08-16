import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Dumbbell, Send, Check } from 'lucide-react'
import { SlotChipsCard } from './SlotChipsCard'
import {
  ONBOARDING_SLOTS,
  getSlotDef,
  buildSlotCatalog,
  missingRequiredSlots,
  unconfirmedOptionalSlots,
  isSlotRequired,
  isSlotApplicable,
  assembleProfile,
  toggleValue,
  initialSlotValues,
  type OnboardingSlotValues,
  type SlotKey,
  type SlotDef,
} from '@/lib/onboarding-slots'
import {
  loadOnboardingDraft,
  saveOnboardingDraft,
  emptyDraft,
  type OnboardingDraft,
  type DraftMessage,
  type PendingContextFact,
  type PendingGoal,
} from '@/lib/onboarding-draft-store'
import type { UserProfile } from '@/lib/types'

// ---------------------------------------------------------------------------
// Conversational intake — same coverage as the questionnaire, different feel.
// The contract with onboarding-chat mirrors the app's established "the edge
// function describes, the client executes" shape:
//
//   - EVERY value the model maps from free text is re-validated here against
//     the slot definition before it's recorded. A value outside the closed
//     set is never stored — the user gets the real chips instead (fail loud;
//     the precedent is the almond-crusted-cod qualifier drop documented in
//     chat-gemini's allergen block, where silent resolution lost meaning).
//   - Every value the model MAPS from free text renders a visible receipt
//     line — never a silent write. A tapped chip gets no receipt: nothing was
//     mapped, and the user's own message bubble already states the value. See
//     applySlot.
//   - Every slot write persists the draft, so a refresh at slot 7 of 20
//     resumes with slots 1-6 intact. Context facts / goals volunteered
//     mid-conversation queue in the draft; App.tsx flushes them after the
//     profile insert produces an id.
//   - Completion is client-gated: complete_onboarding is refused (with a
//     visible list of what's missing) until every required slot validates
//     and every ask-anyway slot — injuries above all — was explicitly
//     answered or skipped. Only then does the review card render, and only
//     its button calls onComplete → the SAME atomic generate-then-insert
//     pipeline the questionnaire uses.
//
// State-threading note: slot writes and the follow-up request to the model
// happen in the same tick (a chip tap records the value AND sends the turn),
// so everything works on an explicit working copy (WorkingState) that is
// committed to React state once — the state the model receives always
// includes the value that was just recorded, never one render behind.
// ---------------------------------------------------------------------------

interface ChatMsg extends DraftMessage {
  /** Local-only marker for the small "✓ Recorded" receipt rows. */
  isReceipt?: boolean
}

interface WorkingState {
  values: OnboardingSlotValues
  confirmed: Set<string>
  pendingContextFacts: PendingContextFact[]
  pendingGoals: PendingGoal[]
  newMessages: ChatMsg[]
  openReview: boolean
  resolveCards: Set<string>
}

const RECEIPT_PREFIX = '✓ '

const COMPLETE_MESSAGE = "That's everything I need. Here's what I've got — have a look, and if it's right I'll build your plan."

function displayValueFor(def: SlotDef, values: OnboardingSlotValues): string {
  const v = values[def.key]
  if (v === null || v === undefined || v === '') return '—'
  if (Array.isArray(v)) {
    if (v.length === 0) return 'none'
    if (!def.options) return v.join(', ')
    return v.map(x => def.options!.find(o => String(o.value) === String(x))?.label ?? String(x)).join(', ')
  }
  if (def.options) {
    const opt = def.options.find(o => String(o.value) === String(v))
    if (opt) return opt.label
  }
  return String(v)
}

function coerceSlotValue(def: SlotDef, raw: string): unknown {
  if (def.control === 'multi') {
    const trimmed = raw.trim()
    if (trimmed === '' || /^(none|no|nothing)$/i.test(trimmed)) return []
    return trimmed.split(',').map(s => s.trim()).filter(Boolean)
  }
  if (def.key === 'knowsWorkingLifts' || def.key === 'includeSnacks') return raw.trim() === 'true'
  if (def.key === 'mealsPerDay') return Number(raw)
  return raw.trim()
}

/**
 * Validate + record one slot into the working copy. Returns false when the
 * value is rejected.
 *
 * `showReceipt` is what keeps "never a silent write" true without making the
 * conversation read like a form. The rule it encodes: a receipt is owed when a
 * MAPPING happened — the user said "just some dumbbells at home" and the app
 * stored `minimalist`, which they must be able to see and correct. When they
 * tapped a chip, no mapping happened: they picked the value, and their own
 * message bubble already says exactly what was recorded. A tick-row echoing
 * the question back at them there added nothing but checklist.
 */
function applySlot(
  ws: WorkingState,
  key: SlotKey,
  coerced: unknown,
  prior: OnboardingSlotValues,
  showReceipt = true,
): boolean {
  const def = getSlotDef(key)
  if (!def || !def.validate(coerced)) return false
  const alreadySame = JSON.stringify(prior[key]) === JSON.stringify(coerced) && ws.confirmed.has(key)
  ws.values = { ...ws.values, [key]: coerced } as OnboardingSlotValues
  ws.confirmed = new Set(ws.confirmed).add(key)
  ws.resolveCards.add(key)
  if (showReceipt && !alreadySame) {
    ws.newMessages.push({
      // Short noun, not the question — "Equipment — Home Gym" reads as the
      // coach noting something down; the full question read as a form field.
      role: 'assistant',
      content: `${RECEIPT_PREFIX}${def.shortLabel} — ${displayValueFor(def, ws.values)}`,
      isReceipt: true,
    })
  }
  return true
}

export function ConversationalOnboarding({
  onComplete,
  onSwitchToForm,
}: {
  onComplete: (profile: UserProfile) => void
  onSwitchToForm: () => void
}) {
  const [draftLoaded] = useState<OnboardingDraft | null>(() => loadOnboardingDraft())
  const [values, setValues] = useState<OnboardingSlotValues>(() => draftLoaded?.values ?? initialSlotValues())
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set(draftLoaded?.confirmedSlots ?? []))
  const [pendingContextFacts, setPendingContextFacts] = useState<PendingContextFact[]>(() => draftLoaded?.pendingContextFacts ?? [])
  const [pendingGoals, setPendingGoals] = useState<PendingGoal[]>(() => draftLoaded?.pendingGoals ?? [])
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    if (draftLoaded && draftLoaded.messages.length > 0) {
      return [
        ...draftLoaded.messages.map(m => ({ ...m, isReceipt: m.role === 'assistant' && m.content.startsWith(RECEIPT_PREFIX) })),
        { role: 'assistant', content: "Welcome back — picking up right where we left off. Say anything and we'll carry on." },
      ]
    }
    return [
      {
        role: 'assistant',
        content:
          "Hey — I'm your coach. Before I build your plan I want to actually get to know you a bit: what you're after, what's worked, what hasn't. Takes a few minutes, and you can type or tap. First things first — what should I call you?",
      },
    ]
  })
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const missing = useMemo(() => missingRequiredSlots(values), [values])
  // requiredIf-aware: the denominator shrinks the moment an activity format is
  // chosen, so the tracker never counts gym-only questions this profile will
  // never be asked.
  const requiredCount = useMemo(() => ONBOARDING_SLOTS.filter(s => isSlotRequired(s, values)).length, [values])
  const answeredCount = requiredCount - missing.length

  // Persist the draft after every state change — this is the whole
  // "a dropped connection never loses answered slots" guarantee.
  useEffect(() => {
    const draft: OnboardingDraft = {
      ...emptyDraft(),
      values,
      confirmedSlots: Array.from(confirmed),
      messages: messages
        .filter(m => m.content.trim().length > 0)
        .map(({ role, content, slotCard, slotCardResolved }) => ({ role, content, slotCard, slotCardResolved })),
      pendingContextFacts,
      pendingGoals,
    }
    saveOnboardingDraft(draft)
  }, [values, confirmed, messages, pendingContextFacts, pendingGoals])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy, reviewOpen])

  // Completion is the CLIENT's call, never the model's. The moment every
  // required slot validates and every ask-anyway slot has been answered, the
  // review appears — whether or not the model ever calls complete_onboarding.
  //
  // This exists because it once didn't: the conversation went silent on the
  // final answer and stayed silent, and because onboarding owns the whole
  // screen (no tab bar until a profile exists) that was a dead end with no
  // way out. A stall here is uniquely costly, so it gets a guard that no
  // request path can route around.
  useEffect(() => {
    if (busy || reviewOpen) return
    if (missingRequiredSlots(values).length > 0) return
    if (unconfirmedOptionalSlots(confirmed, values).length > 0) return
    setMessages(prev =>
      prev.some(m => m.content === COMPLETE_MESSAGE)
        ? prev
        : [...prev, { role: 'assistant', content: COMPLETE_MESSAGE }],
    )
    setReviewOpen(true)
  }, [values, confirmed, busy, reviewOpen])

  const makeWorkingState = (): WorkingState => ({
    values,
    confirmed,
    pendingContextFacts,
    pendingGoals,
    newMessages: [],
    openReview: false,
    resolveCards: new Set(),
  })

  const commitWorkingState = (ws: WorkingState) => {
    setValues(ws.values)
    setConfirmed(ws.confirmed)
    setPendingContextFacts(ws.pendingContextFacts)
    setPendingGoals(ws.pendingGoals)
    if (ws.newMessages.length > 0 || ws.resolveCards.size > 0) {
      setMessages(prev => [
        ...prev.map(m => (m.slotCard && ws.resolveCards.has(m.slotCard) && !m.slotCardResolved ? { ...m, slotCardResolved: true } : m)),
        ...ws.newMessages,
      ])
    }
    if (ws.openReview) setReviewOpen(true)
  }

  const buildState = (ws: WorkingState) => {
    const filled: Record<string, string> = {}
    for (const def of ONBOARDING_SLOTS) {
      if (ws.confirmed.has(def.key)) filled[def.key] = displayValueFor(def, ws.values)
    }
    return {
      slotCatalog: buildSlotCatalog(ws.values),
      filled,
      remaining: [...missingRequiredSlots(ws.values), ...unconfirmedOptionalSlots(ws.confirmed, ws.values)],
    }
  }

  const executeActions = (ws: WorkingState, actions: Array<{ name: string; args: Record<string, unknown> }>) => {
    for (const action of actions) {
      if (action.name === 'set_slot') {
        const key = String(action.args.slot_key ?? '') as SlotKey
        const def = getSlotDef(key)
        if (!def) {
          console.warn('onboarding: set_slot with unknown slot_key', action.args.slot_key)
          continue
        }
        const coerced = coerceSlotValue(def, String(action.args.value ?? ''))
        if (!applySlot(ws, key, coerced, values)) {
          // Fail LOUD: the mapped value didn't validate — never store it,
          // re-ask with the real chips instead.
          ws.newMessages.push({
            role: 'assistant',
            content: 'I didn’t quite catch that one — tap the option that fits:',
            slotCard: key,
          })
        }
      } else if (action.name === 'present_slot') {
        const key = String(action.args.slot_key ?? '')
        const def = getSlotDef(key)
        if (!def) {
          console.warn('onboarding: present_slot with unknown slot_key', action.args.slot_key)
          continue
        }
        if (ws.confirmed.has(key)) continue
        // Attach the chip card to the model's own turn when it produced text
        // this round; otherwise render the slot's canonical question.
        //
        // Search BACKWARDS past confirmation lines rather than looking only at
        // the last message. A turn that both records an answer and asks the
        // next question emits [coach text, ✓ confirmation], so a last-only
        // check found the confirmation, gave up, and printed the slot's raw
        // form question underneath the coach's own words — the questionnaire
        // voice reappearing directly below the conversational one.
        const host = [...ws.newMessages]
          .reverse()
          .find(m => m.role === 'assistant' && !m.isReceipt && !m.slotCard && m.content.trim())
        if (host) {
          host.slotCard = key
        } else {
          ws.newMessages.push({ role: 'assistant', content: def.question, slotCard: key })
        }
      } else if (action.name === 'record_context_fact') {
        const displayText = String(action.args.display_text ?? '').trim()
        const rawPhrase = String(action.args.raw_phrase ?? '').trim()
        if (displayText && rawPhrase && !ws.pendingContextFacts.some(f => f.displayText === displayText)) {
          ws.pendingContextFacts = [...ws.pendingContextFacts, { rawPhrase, displayText }]
        }
      } else if (action.name === 'record_goal') {
        const displayText = String(action.args.display_text ?? '').trim()
        const rawPhrase = String(action.args.raw_phrase ?? '').trim()
        if (displayText && rawPhrase && !ws.pendingGoals.some(g => g.displayText === displayText)) {
          ws.pendingGoals = [
            ...ws.pendingGoals,
            {
              metric: action.args.metric === 'body_weight_kg' ? 'body_weight_kg' : 'directional',
              baselineValue: typeof action.args.baseline_value === 'number' ? action.args.baseline_value : undefined,
              targetValue: typeof action.args.target_value === 'number' ? action.args.target_value : undefined,
              rawPhrase,
              displayText,
            },
          ]
        }
      } else if (action.name === 'complete_onboarding') {
        const stillMissing = missingRequiredSlots(ws.values)
        const stillUnasked = unconfirmedOptionalSlots(ws.confirmed, ws.values)
        if (stillMissing.length > 0 || stillUnasked.length > 0) {
          // The model jumped early — refuse, visibly. Injuries especially
          // must never be skipped past into generation.
          const names = [...stillMissing, ...stillUnasked].map(k => getSlotDef(k)?.question ?? k).slice(0, 4)
          ws.newMessages.push({
            role: 'assistant',
            content: `Almost — a couple of things I still need before I can build this properly: ${names.join(' · ')}`,
          })
        } else {
          ws.openReview = true
        }
      }
    }
  }

  /**
   * One round-trip. `preRecorded` carries a working state that already holds a
   * chip tap's slot write, so the request reflects it and the model never
   * sees an already-answered slot as remaining.
   */
  const sendMessage = async (text: string, preRecorded?: WorkingState) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setBusy(true)
    const ws = preRecorded ?? makeWorkingState()
    const priorMessages = messages
    // User bubble first, THEN the tap's receipt — the transcript reads in
    // the order things actually happened.
    setMessages(prev => [...prev, { role: 'user', content: trimmed }])
    if (preRecorded) commitWorkingState(ws)
    try {
      const history = priorMessages
        .filter(m => !m.isReceipt && m.content.trim())
        .slice(-24)
        .map(m => ({ role: m.role, content: m.content }))
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 45000)
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onboarding-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: trimmed, history, state: buildState(ws) }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (!response.ok) throw new Error(`Request failed (${response.status})`)
      const result: { reply?: string; actions?: Array<{ name: string; args: Record<string, unknown> }> } =
        await response.json()
      const responseWs: WorkingState = {
        ...ws,
        newMessages: [],
        openReview: false,
        resolveCards: new Set(),
      }
      if (result.reply && result.reply.trim()) {
        responseWs.newMessages.push({ role: 'assistant', content: result.reply.trim() })
      }
      if (Array.isArray(result.actions) && result.actions.length > 0) {
        executeActions(responseWs, result.actions)
      }
      // Dead-air guard: a turn of bare tool calls (receipts only, no text,
      // no chip card, review not opening) would stall the conversation —
      // deterministically ask the next unanswered slot's canonical question
      // with its chips instead of leaving silence.
      const producedVisible = responseWs.newMessages.some(m => !m.isReceipt) || responseWs.openReview
      if (!producedVisible) {
        const next = [...missingRequiredSlots(responseWs.values), ...unconfirmedOptionalSlots(responseWs.confirmed, responseWs.values)][0]
        const nextDef = next ? getSlotDef(next) : undefined
        if (nextDef) {
          responseWs.newMessages.push({
            role: 'assistant',
            content: nextDef.question,
            slotCard: nextDef.control === 'single' || nextDef.control === 'multi' ? nextDef.key : undefined,
          })
        } else {
          // Nothing left to ask AND the model said nothing — it simply didn't
          // call complete_onboarding. Finish anyway: the client decides when
          // the tracker is complete, never the model. (Without this the
          // conversation went permanently silent on the last answer, with the
          // tab bar hidden because onboarding owns the whole screen — a dead
          // end with no way forward. Found by Ashley in real use.)
          responseWs.newMessages.push({ role: 'assistant', content: COMPLETE_MESSAGE })
          responseWs.openReview = true
        }
      }
      commitWorkingState(responseWs)
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Connection hiccup on my end — say that again and we’ll keep going.' },
      ])
    } finally {
      setBusy(false)
    }
  }

  // --- chip interactions -------------------------------------------------

  const handleToggleMulti = (key: SlotKey, value: string) => {
    setValues(v => ({ ...v, [key]: toggleValue((v[key] as string[]) ?? [], value) } as OnboardingSlotValues))
  }

  const handleResolveSingle = (key: SlotKey, value: string) => {
    const def = getSlotDef(key)
    if (!def) return
    const ws = makeWorkingState()
    // false: a tap is not a mapping — see applySlot's note.
    if (!applySlot(ws, key, coerceSlotValue(def, value), values, false)) return
    const label = def.options?.find(o => String(o.value) === value)?.label ?? value
    void sendMessage(label, ws)
  }

  const handleResolveMulti = (key: SlotKey) => {
    const def = getSlotDef(key)
    if (!def) return
    const selected = (values[key] as string[]) ?? []
    const ws = makeWorkingState()
    if (!applySlot(ws, key, selected, values, false)) {
      // Belt-and-braces: SlotChipsCard disables Done for a required-empty
      // multi, but a validation miss must still be LOUD, never a no-op.
      setMessages(prev => [...prev, { role: 'assistant', content: 'I need at least one there — tap the ones that work for you.' }])
      return
    }
    const labels = selected.length > 0
      ? selected.map(v => def.options?.find(o => String(o.value) === v)?.label ?? v).join(', ')
      : 'none'
    void sendMessage(labels, ws)
  }

  const handleGenerate = () => {
    if (missing.length > 0) return
    // Stamp the draft as a chat-path completion BEFORE handing off: App.tsx
    // flushes queued context facts/goals only for a completing draft, so a
    // draft abandoned for the questionnaire can never attach its facts to a
    // form-built profile.
    saveOnboardingDraft({
      ...emptyDraft(),
      values,
      confirmedSlots: Array.from(confirmed),
      messages: messages
        .filter(m => m.content.trim().length > 0)
        .map(({ role, content, slotCard, slotCardResolved }) => ({ role, content, slotCard, slotCardResolved })),
      pendingContextFacts,
      pendingGoals,
      completing: true,
    })
    onComplete(assembleProfile(values))
  }

  // --- render ------------------------------------------------------------

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2 max-w-md w-full mx-auto">
        <div className="flex items-center gap-2">
          <Dumbbell className="size-5 text-primary" />
          <h1 className="text-base font-bold tracking-tight">Personal TrAIner</h1>
        </div>
        <button onClick={onSwitchToForm} className="text-xs text-muted-foreground underline underline-offset-2">
          Quick questionnaire instead
        </button>
      </div>
      {/* Progress without a form's scorekeeping: a hairline that fills as
          the conversation goes. "12 of 18 answered" told the user they were
          working through a list, which is exactly the feel we're removing —
          but dropping progress entirely leaves an open-ended chat with no
          sense of how long it runs, so the reassurance stays, wordlessly. */}
      <div className="px-4 pb-3 max-w-md w-full mx-auto">
        <div className="h-0.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary/60 transition-all duration-500"
            style={{ width: `${requiredCount > 0 ? Math.round((answeredCount / requiredCount) * 100) : 0}%` }}
          />
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="max-w-md w-full mx-auto space-y-3">
          {messages.map((msg, i) =>
            msg.isReceipt ? (
              <div key={i} className="flex items-center gap-1.5 pl-1">
                <Check className="size-3 shrink-0 text-primary" />
                <p className="text-xs text-muted-foreground">{msg.content.slice(RECEIPT_PREFIX.length)}</p>
              </div>
            ) : (
              <div key={i}>
                <div
                  className={
                    msg.role === 'user'
                      ? 'ml-auto max-w-[85%] w-fit rounded-2xl rounded-br-md bg-primary/15 px-3.5 py-2 text-sm'
                      : 'mr-auto max-w-[85%] w-fit rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 text-sm'
                  }
                >
                  {msg.content}
                </div>
                {msg.slotCard && (
                  <SlotChipsCard
                    slotKey={msg.slotCard}
                    values={values}
                    resolved={!!msg.slotCardResolved}
                    busy={busy}
                    onToggleMulti={handleToggleMulti}
                    onResolveSingle={handleResolveSingle}
                    onResolveMulti={handleResolveMulti}
                  />
                )}
              </div>
            ),
          )}
          {busy && <p className="text-xs text-muted-foreground pl-1">…</p>}

          {/* Escape hatch: if the tracker says everything is answered, the
              Generate button is reachable from the composer area too, not only
              from the review card. Onboarding hides the tab bar (there's no
              profile yet), so any state where the user can see no way forward
              is a dead end — this makes "finish" always reachable. */}
          {!reviewOpen && missing.length === 0 && (
            <Button onClick={() => setReviewOpen(true)} className="w-full h-11">
              Review and build my plan
            </Button>
          )}

          {reviewOpen && (
            <Card className="bg-muted/50 border-dashed">
              <CardContent className="pt-4 text-sm space-y-1.5">
                {ONBOARDING_SLOTS
                  // Only what actually applies to this person: a "don't know
                  // my lifts" answer shouldn't leave three blank weight rows
                  // in the summary they're being asked to confirm.
                  .filter(s => isSlotApplicable(s, values))
                  .filter(s => isSlotRequired(s, values) || confirmed.has(s.key))
                  .map(def => (
                  <p key={def.key}>
                    <span className="font-medium text-foreground">{def.shortLabel}:</span>{' '}
                    <span className="text-muted-foreground">{displayValueFor(def, values)}</span>
                  </p>
                ))}
                <Button onClick={handleGenerate} disabled={missing.length > 0} className="w-full mt-3 h-12 text-base font-semibold">
                  Generate My Plan
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="border-t border-border/40 px-4 py-3">
        <div className="max-w-md w-full mx-auto flex items-center gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && input.trim() && !busy) {
                const text = input
                setInput('')
                void sendMessage(text)
              }
            }}
            placeholder="Say anything…"
            className="h-11"
            disabled={busy}
          />
          <Button
            size="icon"
            className="h-11 w-11 shrink-0"
            disabled={busy || !input.trim()}
            onClick={() => {
              const text = input
              setInput('')
              void sendMessage(text)
            }}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
