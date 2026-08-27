import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Dumbbell, Send, Check } from 'lucide-react'
import { useViewportInset } from '@/hooks/useViewportInset'
import { SlotChipsCard } from './SlotChipsCard'
import { SlotNumericCard } from './SlotNumericCard'
import {
  ONBOARDING_SLOTS,
  getSlotDef,
  buildSlotCatalog,
  missingRequiredSlots,
  unconfirmedOptionalSlots,
  isSlotRequired,
  isSlotApplicable,
  canDeclineSlot,
  NEVER_BLOCKING_SLOTS,
  assembleProfile,
  toggleValue,
  numericGroupFor,
  initialSlotValues,
  isStartingFromNothing,
  detectAllergenTags,
  isStuckMessage,
  DIETARY_OPTIONS,
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
// THE onboarding. Ashley's call: one way in, the conversation — the
// step-by-step questionnaire and the chooser that offered it are gone.
//
// The cost of being the only door, stated plainly because it is now load-
// bearing: if onboarding-chat or Gemini is unreachable, a NEW user cannot
// create a profile at all. There is no second path to fall back to. The
// composer stays live and says so on failure, but a sustained outage means
// no new signups. Existing users are unaffected — they already have a
// profile and never see this screen.
//
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
//     generate-then-insert pipeline.
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

// Shown on resume, and NEVER persisted — see toDraftMessages.
const RESUME_BANNER = "Welcome back — picking up right where we left off. Say anything and we'll carry on."

/**
 * The transcript as it should be SAVED.
 *
 * The resume banner is generated fresh on every mount, so persisting it meant
 * each refresh saved the previous one and appended a new one — five refreshes
 * left five "Welcome back" bubbles stacked in the conversation, permanently,
 * because the draft carried them forward. Filtering on the way out also heals
 * drafts that already accumulated them, since a loaded transcript is written
 * straight back on the next save.
 */
function toDraftMessages(messages: ChatMsg[]): DraftMessage[] {
  return messages
    .filter(m => m.content.trim().length > 0 && m.content !== RESUME_BANNER)
    .map(({ role, content, slotCard, slotCardResolved, slotCardEditing }) => ({ role, content, slotCard, slotCardResolved, slotCardEditing }))
}

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
 * The app's own key vocabulary is camelCase; the model sometimes emits
 * snake_case (present_slot('recovery_capacity') was observed live, and got
 * silently dropped — getSlotDef found nothing, so the chips just never
 * rendered). Cheap, safe recovery: try the camelCase conversion before giving
 * up. Never invents a match that isn't in the catalog.
 */
function normalizeSlotKey(rawKey: string): string {
  if (getSlotDef(rawKey)) return rawKey
  const camel = rawKey.replace(/_([a-zA-Z])/g, (_, c: string) => c.toUpperCase())
  return getSlotDef(camel) ? camel : rawKey
}

/**
 * Live transcripts repeatedly showed the model failing to call set_slot for
 * text that matched a just-shown chip's label character-for-character —
 * "Functional / Athletic", "Getting By", "Not For Me" — even after reacting
 * to it in prose. The conversation then re-asked the same question, several
 * times in some transcripts, because nothing was ever recorded.
 *
 * This is the one case the app can resolve with total certainty without the
 * model's help: if what they typed is EXACTLY one of the options already on
 * screen, record it — same guarantee a tap gives, just typed instead. Bails
 * (returns undefined) on anything short of an exact match; ambiguous free
 * text still goes to the model, same as always.
 */
function tryExactLabelMatch(def: SlotDef, raw: string, labelOnly = false): unknown {
  const trimmed = raw.trim()
  if (!trimmed || !def.options) return undefined
  const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  // labelOnly drops the raw-value branch — used for volunteered capture
  // below, where there's no on-screen question to make a bare internal
  // value like "2" or "true" an obviously confident answer the way it is
  // when a matching chip card is actually pending.
  const findOption = (text: string) => def.options!.find(o => sameText(o.label, text) || (!labelOnly && sameText(String(o.value), text)))

  if (def.control === 'single') {
    const hit = findOption(trimmed)
    return hit ? coerceSlotValue(def, String(hit.value)) : undefined
  }

  if (def.control === 'multi') {
    // An unambiguous skip is a real answer, same as the model-facing coercion.
    if (/^(none|no|nothing|none of these|n\/a)$/i.test(trimmed)) return []
    const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean)
    if (parts.length === 0) return undefined
    const values: string[] = []
    for (const part of parts) {
      const hit = findOption(part)
      if (!hit) return undefined // any unmatched part — don't guess, let the model interpret the whole thing
      values.push(String(hit.value))
    }
    return values
  }

  return undefined
}

/**
 * Ashley's ruling: if someone volunteers a value before the app has asked
 * for it, capture it rather than dropping it and asking again later — the
 * questionnaire behavior the conversation exists to escape.
 *
 * Scoped deliberately narrow: only closed-set slots (numeric/text slots
 * have no confident deterministic mapping — that's still the model's job),
 * only slots that are currently APPLICABLE (isSlotApplicable respects
 * requiredIf — this never fills a slot that doesn't apply to this person's
 * plan yet, e.g. a known-lift number before the app even knows they'll be
 * lifting barbells) and not yet confirmed, and label-only (see
 * tryExactLabelMatch's labelOnly param above).
 *
 * If more than one eligible slot's label matches the same text, that's
 * genuinely ambiguous, not confident — bail and let the model use real
 * conversational context instead. Two real collisions exist in this
 * catalog today: "Mediterranean" is both a diet type and a cuisine, and
 * "none"/"nothing" is a valid empty-answer for four different multi-selects
 * (trainingDays, injuries, dietaryPreferences, favoriteCuisines) — both are
 * exactly the shape of thing this must refuse to guess at.
 *
 * That cross-slot check alone isn't enough, though: it only catches a
 * SHARED label, not a single slot's label coincidentally being a plausible
 * answer to some OTHER, un-carded question. The prompt groups two asks per
 * turn with only one getting a chip card ("at most ONE of them gets chips;
 * ask the other in plain text" — onboarding-chat's SLOT MECHANICS) — a bare
 * "Quick" typed in reply to an un-carded "how long are your sessions?"
 * matches cookingTime's label uniquely in the catalog and would otherwise
 * get silently captured there instead, with sessionDuration left unanswered.
 * cookingTime's labels ("Quick", "Moderate") are common generic English
 * adjectives with exactly that risk profile; excluded here for that reason
 * — still fully capturable the safe way, once its own card is actually on
 * screen (tier 1, above).
 */
const VOLUNTEERED_CAPTURE_EXCLUDED: SlotKey[] = ['cookingTime']

function tryVolunteeredCapture(
  values: OnboardingSlotValues,
  confirmed: ReadonlySet<string>,
  trimmed: string,
): { def: SlotDef; value: unknown } | undefined {
  const matches: { def: SlotDef; value: unknown }[] = []
  for (const def of ONBOARDING_SLOTS) {
    if (
      !def.options ||
      VOLUNTEERED_CAPTURE_EXCLUDED.includes(def.key) ||
      !isSlotApplicable(def, values) ||
      confirmed.has(def.key)
    ) continue
    const matched = tryExactLabelMatch(def, trimmed, true)
    if (matched !== undefined) matches.push({ def, value: matched })
  }
  return matches.length === 1 ? matches[0] : undefined
}

// How many turns the stuck-slot breaker below tolerates with no confirmed
// answer anywhere before forcing a question regardless of how many times
// (if any) that specific slot has been asked.
const STALL_TURN_LIMIT = 4


// How many times the app will force the SAME question before treating it as
// one this person isn't going to answer right now and moving to a different
// one. Nothing is skipped — an unanswered required slot still blocks
// completion — it just stops being the only thing on offer. Measured need:
// ten unusable answers in a row produced the goal question three times over,
// which reads as a form that won't let you past.
const MAX_FORCED_ASKS_PER_SLOT = 2

/**
 * Which question the app should put in front of someone when it has to step
 * in. Not simply the first unanswered slot: a slot already forced
 * MAX_FORCED_ASKS_PER_SLOT times is passed over in favour of one they
 * haven't been stuck on, and a tappable question beats a typed one when
 * somebody is plainly struggling. Canonical order breaks remaining ties, so
 * required things still surface first among equals.
 */
function pickSlotToForce(
  openSlots: SlotKey[],
  values: OnboardingSlotValues,
  askCount: (key: SlotKey) => number,
  hasLiveCard: (key: SlotKey) => boolean,
): SlotKey | undefined {
  const candidates = openSlots.filter(k => {
    const def = getSlotDef(k)
    // A question already on screen unanswered doesn't need a second copy —
    // that stacking IS the defect this guard exists to stop.
    return def && isSlotApplicable(def, values) && !hasLiveCard(k)
  })
  if (candidates.length === 0) return undefined
  const notExhausted = candidates.filter(k => askCount(k) < MAX_FORCED_ASKS_PER_SLOT)
  const pool = notExhausted.length > 0 ? notExhausted : candidates
  const tappable = pool.filter(k => {
    const c = getSlotDef(k)?.control
    return c === 'single' || c === 'multi'
  })
  return (tappable.length > 0 ? tappable : pool)[0]
}

/**
 * What the app says when it steps in. Varied deliberately: the same sentence
 * every time is what made a stuck conversation read like a machine repeating
 * itself. `movedOn` covers the rotation case, where saying so out loud is
 * the difference between "it's ignoring me" and "fine, we'll do this later".
 */
const STAY_LEADS = [
  "Let's lock this one in —",
  "Easiest if you just tap one here —",
  "Pick whichever is closest and we'll move on —",
] as const
const MOVE_ON_LEADS = [
  "Let's leave that one for now and come back to it.",
  "We'll park that one — no rush on it.",
  "Skipping ahead a bit; we can circle back.",
  "That one can wait.",
] as const

/**
 * Every phrasing the app itself can open a forced ask with. Counting these in
 * the transcript is how the next one knows to say something different, so the
 * list and the counter can never drift apart.
 */
const FORCED_ASK_MARKERS: readonly string[] = [...STAY_LEADS, ...MOVE_ON_LEADS]

function forcedAskLead(timesSteppedIn: number, movedOn: boolean): string {
  const leads = movedOn ? MOVE_ON_LEADS : STAY_LEADS
  // Cycle, don't clamp: clamping to the last variant meant every step-in
  // after the first said the same sentence, which is the exact repetition
  // these variants exist to avoid.
  return leads[timesSteppedIn % leads.length]
}

/**
 * Turns since ANY slot last got confirmed — not since the conversation
 * started, and not specific to one slot. The stuck-slot breaker's own
 * priorAsks count only starts once a slot has actually been asked; a slot
 * the model never brings up at all keeps priorAsks at 0 forever, so nothing
 * previously forced it in. This is the floor for that case: real standstill
 * (nothing confirmed in a while) forces progress; steady work through a
 * long slot list — new confirmations arriving turn after turn, even on
 * different slots — never trips it, because the count keeps resetting.
 */
function turnsSinceLastConfirmation(msgs: ChatMsg[]): number {
  let count = 0
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m.role !== 'assistant') continue
    if (m.isReceipt || (m.slotCard && m.slotCardResolved)) return count
    count++
  }
  return count
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

/**
 * Record slots as ANSWERED with no value — the user declined them.
 *
 * This is the counterpart to applySlot, and the distinction it draws is the
 * whole point: `confirmed` means "we asked and got an answer", `values` means
 * "here is the answer". A decline is the first case without the second, and
 * until it existed the two were welded together, so a question the plan
 * didn't need could still hold onboarding open forever.
 *
 * The value is left untouched (null) rather than written as a sentinel, so
 * everything downstream — assembleProfile's numericOrUndefined, computeTargets
 * returning null, MissingBodyMetricsNotice — keeps working exactly as the
 * absence work built it. No receipt: the user's own message bubble says they
 * skipped it, the same reasoning that suppresses a receipt on a chip tap.
 */
function declineSlots(ws: WorkingState, keys: SlotKey[]): SlotKey[] {
  const declined: SlotKey[] = []
  for (const key of keys) {
    const def = getSlotDef(key)
    if (!def || !canDeclineSlot(def, ws.values)) continue
    // Write null EXPLICITLY rather than leaving the initial value in place.
    // Numeric slots start as '' and gender as null, so "confirmed but empty"
    // was not a reliable signal for a decline — age/height/weight read as
    // plain blanks. null is the fact, not an inference, and it lands in the
    // same absence handling ('' and null both become undefined in
    // assembleProfile's numericOrUndefined).
    ws.values = { ...ws.values, [key]: null } as OnboardingSlotValues
    ws.confirmed = new Set(ws.confirmed).add(key)
    ws.resolveCards.add(key)
    declined.push(key)
  }
  return declined
}

/** Confirmed, but holding no value — the user was asked and said no. */
function isDeclined(key: SlotKey, values: OnboardingSlotValues, confirmed: ReadonlySet<string>): boolean {
  return confirmed.has(key) && (values[key] === null || values[key] === undefined)
}

export function ConversationalOnboarding({ onComplete }: { onComplete: (profile: UserProfile) => void }) {
  const [draftLoaded] = useState<OnboardingDraft | null>(() => loadOnboardingDraft())
  const [values, setValues] = useState<OnboardingSlotValues>(() => draftLoaded?.values ?? initialSlotValues())
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set(draftLoaded?.confirmedSlots ?? []))
  const [pendingContextFacts, setPendingContextFacts] = useState<PendingContextFact[]>(() => draftLoaded?.pendingContextFacts ?? [])
  const [pendingGoals, setPendingGoals] = useState<PendingGoal[]>(() => draftLoaded?.pendingGoals ?? [])
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    if (draftLoaded && draftLoaded.messages.length > 0) {
      return [
        ...draftLoaded.messages
          .filter(m => m.content !== RESUME_BANNER)
          .map(m => ({ ...m, isReceipt: m.role === 'assistant' && m.content.startsWith(RECEIPT_PREFIX) })),
        { role: 'assistant', content: RESUME_BANNER },
      ]
    }
    return [
      {
        role: 'assistant',
        content:
          "Hey — I'm your coach. Before I build your plan I want to actually get to know you a bit: what you're after, what's worked, what hasn't. Takes a few minutes, you can type or tap, and you can change any answer later. First things first — what should I call you?",
      },
    ]
  })
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  // Read here rather than down in the render block: BOTH the composer offset
  // and the auto-scroll below depend on it. See the composer's comment.
  const { insetPx, isKeyboardOpen } = useViewportInset()

  const missing = useMemo(() => missingRequiredSlots(values), [values])
  const unconfirmedOptional = useMemo(() => unconfirmedOptionalSlots(confirmed, values), [confirmed, values])
  // requiredIf-aware: the denominator shrinks the moment an activity format is
  // chosen, so the tracker never counts gym-only questions this profile will
  // never be asked.
  //
  // It counts every slot that can actually HOLD THE PLAN UP, not just the
  // required ones. The old denominator was required-only while
  // readyToGenerate (below) also waits on unconfirmedOptional — so the bar
  // filled completely with the whole ask-anyway set still to come, promising
  // an end and then carrying on. A required slot is never in
  // NEVER_BLOCKING_SLOTS, so "applicable and not never-blocking" is exactly
  // required + ask-anyway: the same set readyToGenerate gates on.
  const trackedSlots = useMemo(
    () => ONBOARDING_SLOTS.filter(s => isSlotApplicable(s, values) && !NEVER_BLOCKING_SLOTS.includes(s.key)),
    [values],
  )
  const requiredCount = trackedSlots.length
  // CONFIRMED, not values. `confirmed` is only ever set by applySlot (which
  // validates first) or declineSlots, so it means "we asked and got an
  // answer" — whereas values is written the instant a multi chip is tapped,
  // before Done (handleToggleMulti), which made merely touching one
  // training-day chip nudge the bar and drop the slot out of the missing
  // list. Counting confirmations fixes the honesty and that leak together.
  const answeredCount = trackedSlots.filter(s => confirmed.has(s.key)).length
  // What both the manual escape hatch and Generate gate on. Required-missing
  // alone was the wrong bar: it let "Review and build my plan" appear (and
  // Generate succeed) before injuries or dietary restrictions had ever been
  // asked, since neither is required — an unconfirmed injuries slot then
  // silently assembles into an empty array, indistinguishable from "no
  // injuries" the user actually gave. This is the same bar the auto-open
  // effect below already uses; the escape hatch existing on a looser one was
  // the gap.
  const readyToGenerate = missing.length === 0 && unconfirmedOptional.length === 0

  // Persist the draft after every state change — this is the whole
  // "a dropped connection never loses answered slots" guarantee.
  useEffect(() => {
    const draft: OnboardingDraft = {
      ...emptyDraft(),
      values,
      confirmedSlots: Array.from(confirmed),
      messages: toDraftMessages(messages),
      pendingContextFacts,
      pendingGoals,
    }
    saveOnboardingDraft(draft)
  }, [values, confirmed, messages, pendingContextFacts, pendingGoals])

  // KEEPING THE LATEST MESSAGE IN VIEW.
  //
  // This used to be `useEffect(..., [messages, busy, reviewOpen])` — scroll
  // once, when the message list changes. Reported from a real phone: "I have
  // to keep scrolling to the bottom of the chat."
  //
  // The message list is the wrong thing to watch, because in this screen the
  // height keeps growing AFTER it settles:
  //   - a question renders, THEN its SlotChipsCard renders the option grid
  //     below it, so the buttons that answer the question land off-screen
  //   - a multi-select grows as options are toggled, with no new message
  //   - the review card opens
  //   - the keyboard opens, which both shrinks the container (100dvh) and
  //     grows its padding (insetPx, just above) — neither is a message
  //
  // ChatAssistant already hit this and already fixed it; its own comment
  // reads "ResizeObserver-based scroll instead of setTimeout/useEffect
  // [messages]". Onboarding was still on the approach that was abandoned.
  // Same pattern here: watch the CONTENT BOX, not the data.
  const scrollToBottom = useCallback((force = false) => {
    if (!force && !isNearBottomRef.current) return
    // rAF so the scroll runs after layout, not against a height React has
    // mutated but the browser has not measured yet.
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'instant' as ScrollBehavior })
    })
  }, [])

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const observer = new ResizeObserver(() => scrollToBottom())
    observer.observe(content)
    return () => observer.disconnect()
  }, [scrollToBottom])

  // The container itself changes height when the keyboard opens (100dvh on
  // Android) — that resizes the viewport, not the content, so the observer
  // above never sees it.
  useEffect(() => { scrollToBottom() }, [isKeyboardOpen, insetPx, scrollToBottom])

  // Deliberate scroll-up is respected: nothing yanks the view back while
  // re-reading an earlier answer. 120px of slack so "near enough the bottom"
  // survives a rubber-band overscroll.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (el) isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }, [])

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
    if (!readyToGenerate) return
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
      // A declined slot must read as ANSWERED here. It is already out of
      // `remaining`, but a bare "—" invites the model to have another go at
      // it; saying so plainly is what stops the coach re-asking for a weight
      // the user just refused.
      if (ws.confirmed.has(def.key)) {
        filled[def.key] = isDeclined(def.key, ws.values, ws.confirmed)
          ? "not given — they'd rather not say, don't ask again"
          : displayValueFor(def, ws.values)
      }
    }
    return {
      slotCatalog: buildSlotCatalog(ws.values),
      filled,
      remaining: [...missingRequiredSlots(ws.values), ...unconfirmedOptionalSlots(ws.confirmed, ws.values)],
    }
  }

  const executeActions = (ws: WorkingState, actions: Array<{ name: string; args: Record<string, unknown> }>) => {
    // Caught by re-running the audit's personas against the deployed fixes:
    // the prompt says "one present_slot per turn" but the model still
    // sometimes calls it twice. The FIRST call correctly attaches to the
    // turn's own text; the second found no unclaimed host message and fell
    // through to the raw-canonical-question fallback below — spawning a
    // brand-new message in form voice, with its own duplicate chip card.
    // That fallback exists for the genuine dead-air case (a turn with NO
    // text at all); a second present_slot in an already-answered turn is a
    // different situation and should just be dropped, not treated as dead
    // air a second time.
    let presentedThisTurn = false
    for (const action of actions) {
      if (action.name === 'set_slot') {
        const key = normalizeSlotKey(String(action.args.slot_key ?? '')) as SlotKey
        const def = getSlotDef(key)
        if (!def) {
          console.warn('onboarding: set_slot with unknown slot_key', action.args.slot_key)
          continue
        }
        // A slot's requiredIf gate can close mid-conversation (equipment
        // changed away from barbell-capable after knowsWorkingLifts was
        // already asked, say) — never write into one that's no longer
        // applicable, model-driven or not. Confirmed live-reachable: this
        // exact gap let a stale exact-label match set skip_calibration_week
        // via knowsWorkingLifts after the plan no longer called for it.
        if (!isSlotApplicable(def, ws.values)) {
          console.warn('onboarding: set_slot for no-longer-applicable slot', key)
          continue
        }
        const coerced = coerceSlotValue(def, String(action.args.value ?? ''))
        // Compare against ws.values, not the outer (pre-turn) values: a slot
        // can already be recorded THIS turn — by the exact-label backstop's
        // immediate commit, or by an earlier action in this same list — and
        // the outer closure won't reflect that until the next render. Diffing
        // against the stale value made the model's own redundant set_slot
        // for something the backstop just caught print a second, duplicate
        // receipt (caught live: typing "Hybrid" against a pending style card
        // committed instantly, then the model's response echoed the same
        // set_slot and printed "✓ Style — Hybrid" a second time).
        if (!applySlot(ws, key, coerced, ws.values)) {
          // Fail LOUD: the mapped value didn't validate — never store it,
          // re-ask with the real chips instead.
          ws.newMessages.push({
            role: 'assistant',
            content: 'I didn’t quite catch that one — tap the option that fits:',
            slotCard: key,
          })
        }
      } else if (action.name === 'present_slot') {
        const key = normalizeSlotKey(String(action.args.slot_key ?? ''))
        const def = getSlotDef(key)
        if (!def) {
          console.warn('onboarding: present_slot with unknown slot_key', action.args.slot_key)
          continue
        }
        if (ws.confirmed.has(key)) continue
        if (!isSlotApplicable(def, ws.values)) continue
        // One live card per question. The model can ask for the same chips on
        // both legs of the round trip, and the second copy found the coach's
        // message already taken, so it fell through to the raw-question
        // fallback — the same question twice, the second time in form voice.
        const alreadyLive = [...messages, ...ws.newMessages].some(
          m => m.slotCard === key && !m.slotCardResolved && !ws.resolveCards.has(key),
        )
        if (alreadyLive) continue
        // A second present_slot in the same turn is a prompt-compliance miss
        // (see the comment above the loop), not a fresh instance of dead air
        // — drop it rather than spawning a duplicate form-voice message.
        if (presentedThisTurn) continue
        presentedThisTurn = true
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
      } else if (action.name === 'decline_slot') {
        const key = normalizeSlotKey(String(action.args.slot_key ?? '')) as SlotKey
        const def = getSlotDef(key)
        if (!def) {
          console.warn('onboarding: decline_slot with unknown slot_key', action.args.slot_key)
          continue
        }
        // canDeclineSlot inside declineSlots is the real guard: the model is
        // told not to decline anything required or safety-path, and this is
        // what makes that non-negotiable rather than a request. A refused
        // decline just leaves the slot open, so the coach asks again.
        if (declineSlots(ws, [key]).length === 0) {
          console.warn('onboarding: refused decline_slot for a slot the plan needs', key)
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
    // FORCED, overriding the near-bottom guard. The guard exists so someone
    // re-reading an earlier answer isn't yanked away — but they have just
    // answered, so the reply is the thing they are waiting for. Without this
    // a chip tapped while scrolled up leaves them stranded above the answer.
    scrollToBottom(true)

    // Typed-exact-label backstop (see tryExactLabelMatch): if this is raw
    // typed text — not already a chip tap — and it exactly matches an option
    // on the card currently showing, record it before the model even sees
    // the turn. Mirrors the tap path exactly (immediate commit, same
    // applySlot call) so the fix doesn't depend on Gemini for the one case
    // the app can already be certain about.
    let ws = preRecorded
    let immediateCommit = !!preRecorded
    if (!ws) {
      // Tier 1 — every still-unresolved card, most recent first. The model
      // can leave an older question's card pending while it asks a second
      // one (executeActions allows at most one live card per turn, so a
      // second present_slot either attaches to the same reply or waits for a
      // later turn) — an exact-label answer to that OLDER question was being
      // checked only against the NEWEST card's options, failing every time
      // even though it matched a card still on screen. Live re-runs caught
      // this identical mechanism dropping three different verbatim
      // chip-label answers ("Getting By", "Not For Me", "Full Gym") across
      // three separate personas.
      //
      // Trust the most-recently-shown matching card rather than requiring
      // catalog-wide uniqueness — a rendered, still-visible card IS strong
      // context (the user is almost certainly answering what's on screen),
      // and this exact "most-recent wins" shape was what caught all three
      // personas above; a stricter "only if no OTHER pending card also
      // matches" version was tried and adversarially found to regress it —
      // three different multi-select slots (injuries, dietaryPreferences,
      // favoriteCuisines) all accept the same "none"/"nothing" answer, so
      // whenever two of their cards were simultaneously pending the stricter
      // version silently captured nothing at all, reproducing the exact
      // failure this backstop exists to close.
      const pendingCards = [...messages].reverse().filter(m => m.role === 'assistant' && m.slotCard && !m.slotCardResolved)
      for (const pendingCard of pendingCards) {
        const pendingDef = getSlotDef(pendingCard.slotCard!)
        // A slot's requiredIf gate can close after its card was shown (an
        // earlier answer changed — equipment moved away from barbell-capable
        // after knowsWorkingLifts was already asked, say); never let a stale
        // card still resolve a write once that's happened.
        if (!pendingDef || !isSlotApplicable(pendingDef, values)) continue
        const matched = tryExactLabelMatch(pendingDef, trimmed)
        if (matched === undefined) continue
        const candidate = makeWorkingState()
        if (applySlot(candidate, pendingDef.key, matched, values)) {
          ws = candidate
          immediateCommit = true
        }
        break
      }

      // Tier 2 — volunteered capture (Ashley's ruling): only reached when no
      // pending card matched. See tryVolunteeredCapture's own comment for the
      // full rationale and its deliberate scope limits.
      if (!ws) {
        const volunteered = tryVolunteeredCapture(values, confirmed, trimmed)
        if (volunteered) {
          const candidate = makeWorkingState()
          if (applySlot(candidate, volunteered.def.key, volunteered.value, values)) {
            ws = candidate
            immediateCommit = true
          }
        }
      }
    }
    if (!ws) ws = makeWorkingState()

    // Deterministic allergen safety backstop — runs on every typed message,
    // independent of whatever slot is currently pending, because a serious
    // allergy can come up at any point in the conversation (confirmed live:
    // a "severe peanut allergy" disclosed in the very first message got a
    // reassuring reply and nothing else — no set_slot, so meal generation
    // never saw it). The model is told to do this too (coach-rules.ts), but
    // a missed allergy tag isn't something to shrug off as "the model had an
    // off turn" the way a missed trainingStyle answer is, so it doesn't rely
    // on the model at all.
    const allergenTags = detectAllergenTags(trimmed).filter(t => !ws.values.dietaryPreferences.includes(t))
    if (allergenTags.length > 0) {
      const merged = [...ws.values.dietaryPreferences, ...allergenTags]
      if (applySlot(ws, 'dietaryPreferences', merged, ws.values, false)) {
        const labels = allergenTags.map(t => DIETARY_OPTIONS.find(o => o.value === t)?.label ?? t).join(', ')
        ws.newMessages.push({
          role: 'assistant',
          content: `✓ Flagged as a hard restriction, not just a preference — ${labels} will be kept out of every meal.`,
          isReceipt: true,
        })
        immediateCommit = true
      }
    }

    // Captured before the round trip: the rescue below needs to know the
    // user said "I don't know" even after the model's reply has come back.
    const userWasStuck = isStuckMessage(trimmed)

    const priorMessages = messages
    // User bubble first, THEN the tap's receipt — the transcript reads in
    // the order things actually happened.
    setMessages(prev => [...prev, { role: 'user', content: trimmed }])
    if (immediateCommit) commitWorkingState(ws)
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
      // with its chips instead of leaving silence. Since the reply guarantee
      // landed server-side (onboarding-chat/reply-resolver.ts), a 200 with
      // empty reply text should no longer occur — this stays as defense in
      // depth, not as the mechanism that keeps the conversation moving.
      const producedVisible = responseWs.newMessages.some(m => !m.isReceipt) || responseWs.openReview
      if (!producedVisible) {
        const next = [...missingRequiredSlots(responseWs.values), ...unconfirmedOptionalSlots(responseWs.confirmed, responseWs.values)][0]
        const nextDef = next ? getSlotDef(next) : undefined
        if (nextDef) {
          responseWs.newMessages.push({
            role: 'assistant',
            content: nextDef.question,
            // Numeric slots get a card as well now — they used to fall through
            // to free text with no bounds check at the point of answering.
            slotCard: nextDef.control === 'text' ? undefined : nextDef.key,
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
      // THE STUCK-USER RESCUE — the deterministic half of "chips only when
      // you're stuck".
      //
      // The model is told to call present_slot when someone says they don't
      // know or asks what the options are. If it did, there is already a card
      // on screen and this does nothing. This is here for when it didn't,
      // because a user who has just said "I don't know" and been handed
      // another sentence of prose is worse off than they were before chips
      // were ever removed — that is the one case where a list genuinely helps
      // and withholding it is stubbornness, not conversation.
      //
      // Which slot: the canonical next open one. That is a guess about what
      // the coach just asked, and the prompt is right that chips under the
      // wrong question are worse than none — so the lead sentence names the
      // question out loud rather than silently attaching a grid, and the
      // guess is only made for a message that was NOTHING but "I don't know"
      // (see STUCK_SIGNAL), where there is no answer to lose.
      if (userWasStuck && !responseWs.openReview) {
        const openNow = [...missingRequiredSlots(responseWs.values), ...unconfirmedOptionalSlots(responseWs.confirmed, responseWs.values)]
        const target = openNow[0]
        const def = target ? getSlotDef(target) : undefined
        const alreadyHasCard = [...priorMessages, ...responseWs.newMessages].some(
          m => m.slotCard === target && !m.slotCardResolved && !responseWs.resolveCards.has(target as SlotKey),
        )
        // Only slots that genuinely HAVE a list. "I don't know" against age
        // or weight is a refusal, not someone needing options — that already
        // has a path (decline_slot, and the "Prefer not to say" button), and
        // a numeric card carries nothing to choose from anyway. Same pair the
        // server's own present_slot guard used.
        if (def && target && !alreadyHasCard && (def.control === 'single' || def.control === 'multi')) {
          responseWs.newMessages.push({
            role: 'assistant',
            content: `No problem — here are the options. ${def.question}`,
            slotCard: target,
          })
        }
      }

      // Stuck-slot breaker: several live transcripts showed the coach
      // re-asking the SAME still-unanswered question 6-8 times, reworded
      // each time, because a captured answer kept failing to register (the
      // capture backstops above cut this off much earlier now, but nothing
      // guarantees it to zero — this is the backstop for the backstops).
      // Once the canonical next slot has been shown 3 times without landing,
      // stop trusting the model's phrasing for it: ask it plainly, with the
      // guaranteed-correct chip key attached directly, on top of whatever
      // else this turn already said.
      //
      // priorAsks alone only catches a slot the model keeps TRYING and
      // failing at — it never starts counting for one the model just never
      // brings up at all, which has no guaranteed floor otherwise. Paired
      // with stalledTurns: how many turns have passed since anything last
      // actually got confirmed, anywhere — not specific to canonicalNext, so
      // legitimate steady progress through a long slot list never trips it,
      // only genuine standstill does.
      if (!responseWs.openReview) {
        const openSlots = [...missingRequiredSlots(responseWs.values), ...unconfirmedOptionalSlots(responseWs.confirmed, responseWs.values)]
        const canonicalNext = openSlots[0]
        const allMsgs = [...priorMessages, ...responseWs.newMessages]
        if (canonicalNext) {
          const priorAsks = priorMessages.filter(m => m.slotCard === canonicalNext).length
          const askedThisTurn = responseWs.newMessages.some(m => m.slotCard === canonicalNext)
          const stalledTurns = turnsSinceLastConfirmation(allMsgs)
          if ((priorAsks >= 3 || stalledTurns >= STALL_TURN_LIMIT) && !askedThisTurn) {
            // Which question to force is a choice, not just "the first one
            // still missing". Hammering one slot the user plainly can't or
            // won't answer produced the same question three times over with
            // a duplicate chip grid each time; rotating to something else
            // they haven't been stuck on keeps the conversation moving, and
            // nothing is skipped — an unanswered required slot still blocks
            // completion, so we come back to it.
            const askCount = (k: SlotKey) => allMsgs.filter(m => m.slotCard === k).length
            const hasLiveCard = (k: SlotKey) =>
              allMsgs.some(m => m.slotCard === k && !m.slotCardResolved && !responseWs.resolveCards.has(k)) ||
              responseWs.newMessages.some(m => m.slotCard === k)
            const target = pickSlotToForce(openSlots, responseWs.values, askCount, hasLiveCard)
            const def = target ? getSlotDef(target) : undefined
            if (def && target) {
              const timesSteppedIn = allMsgs.filter(m => FORCED_ASK_MARKERS.some(marker => m.content.startsWith(marker))).length
              const lead = forcedAskLead(timesSteppedIn, target !== canonicalNext)
              responseWs.newMessages.push({
                role: 'assistant',
                content: `${lead} ${def.question}`,
                slotCard: def.control === 'text' ? undefined : target,
              })
            }
          }
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
    // A tap on a stale card (its gate closed after an earlier answer
    // changed — the user scrolled back to it) must not write either; the
    // model-driven paths above got the same guard for the same reason.
    if (!isSlotApplicable(def, values)) return
    const ws = makeWorkingState()
    // false: a tap is not a mapping — see applySlot's note.
    if (!applySlot(ws, key, coerceSlotValue(def, value), values, false)) return
    const label = def.options?.find(o => String(o.value) === value)?.label ?? value
    void sendMessage(label, ws)
  }

  const handleResolveMulti = (key: SlotKey) => {
    const def = getSlotDef(key)
    if (!def) return
    if (!isSlotApplicable(def, values)) return
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

  /**
   * Save one card's worth of numeric answers. Mirrors the chip path: record
   * every value first, then send ONE turn carrying all of them, so the coach
   * never sees a half-filled state and never re-asks for a number just given.
   */
  const handleResolveNumeric = (entries: { key: SlotKey; raw: string }[]) => {
    if (entries.length === 0) return
    const ws = makeWorkingState()
    const saved: string[] = []
    for (const { key, raw } of entries) {
      const def = getSlotDef(key)
      if (!def) continue
      // false: they typed the value into a labelled field — nothing was
      // mapped, so no confirmation line is owed (see applySlot).
      if (applySlot(ws, key, coerceSlotValue(def, raw), values, false)) {
        saved.push(`${def.shortLabel.toLowerCase()} ${raw}`)
      }
    }
    if (saved.length === 0) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'That didn’t look right — check the numbers and try again.' }])
      return
    }
    void sendMessage(saved.join(', '), ws)
  }

  /**
   * The user tapped "Prefer not to say". Records the decline(s), then sends
   * ONE turn saying so in their own voice — the coach needs to hear it, or
   * its next turn asks the same question again.
   */
  const handleDecline = (keys: SlotKey[]) => {
    const ws = makeWorkingState()
    const declined = declineSlots(ws, keys)
    if (declined.length === 0) return
    const labels = declined.map(k => getSlotDef(k)?.shortLabel.toLowerCase() ?? k)
    void sendMessage(`I'd rather not say — skip ${labels.join(', ')}`, ws)
  }

  /**
   * Re-open one already-answered question so the user can change it.
   *
   * Deliberately does NOT clear the slot from `confirmed`. Clearing it would
   * flip readyToGenerate false, so anyone who opened a row and then changed
   * their mind would be left staring at a disabled Generate with nothing
   * telling them why — a brand-new dead end in the pass meant to remove
   * them. Leaving it confirmed costs nothing: applySlot has no
   * confirmed-guard on write, so answering the re-opened card simply
   * overwrites, and commitWorkingState marks every card carrying this slot
   * key resolved, this new one included.
   *
   * This is a USER action, so it bypasses the `confirmed.has(key)` guard in
   * executeActions — that guard stops the MODEL re-asking answered
   * questions, which is still exactly what we want.
   */
  const handleEditSlot = (key: SlotKey) => {
    if (busy) return
    const def = getSlotDef(key)
    if (!def || !isSlotApplicable(def, values)) return
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: def.control === 'text'
          // A text slot has no card to render, so the composer is the only
          // way to answer it — say so rather than leaving a dead prompt.
          ? `Sure — type what you'd like ${def.shortLabel.toLowerCase()} to be instead.`
          : `Sure — pick a different ${def.shortLabel.toLowerCase()}.`,
        slotCard: def.control === 'text' ? undefined : key,
        slotCardEditing: def.control === 'text' ? undefined : true,
      },
    ])
  }

  const handleGenerate = () => {
    if (!readyToGenerate) return
    // Stamp the draft as a chat-path completion BEFORE handing off: App.tsx
    // flushes queued context facts/goals only for a completing draft, so a
    // draft abandoned mid-conversation can never attach its facts to a
    // profile built by a later, separate run.
    saveOnboardingDraft({
      ...emptyDraft(),
      values,
      confirmedSlots: Array.from(confirmed),
      messages: toDraftMessages(messages),
      pendingContextFacts,
      pendingGoals,
      completing: true,
    })
    onComplete(assembleProfile(values))
  }

  // --- render ------------------------------------------------------------

  // THE COMPOSER MUST RIDE ABOVE THE SOFT KEYBOARD, and until now it was the
  // one screen in the app that didn't.
  //
  // Reported from a real phone: with the keyboard up, the text field sat
  // BELOW the fold and had to be scrolled to. On the very first screen a new
  // user ever sees, on the only control that moves the conversation forward.
  //
  // Cause: this wrapper was `min-h-screen` (100vh) with the composer as an
  // ordinary last flex child. 100vh is the viewport WITHOUT the keyboard, so
  // once the keyboard opened the layout stayed full height while the visible
  // area halved, pushing the composer off-screen. Android also counts the
  // collapsing URL bar in 100vh, which is why it could need a scroll even
  // before anything was focused.
  //
  // Fixed the way ChatAssistant already does it — fixed position plus
  // useViewportInset — rather than with 100dvh, because dvh alone does not
  // cover iOS Safari: it resizes the VISUAL viewport but not the LAYOUT
  // viewport, so a bottom-anchored element still ends up under the keyboard.
  // The hook's own doc comment records that; it is why the hook exists.
  //
  // Simpler than ChatAssistant's version: onboarding has no tab bar and no
  // BottomDock to clear, so the only offset is the keyboard itself.
  // (useViewportInset is called up with the refs — the scroll effects need it
  // too, and a hook cannot be read before it runs.)
  const composerBottomStyle = isKeyboardOpen
    ? { bottom: insetPx }
    : { bottom: 'env(safe-area-inset-bottom)' }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2 max-w-md w-full mx-auto">
        <div className="flex items-center gap-2">
          <Dumbbell className="size-5 text-primary" />
          <h1 className="text-base font-bold tracking-tight">Personal TrAIner</h1>
        </div>
      </div>
      {/* Progress without a form's scorekeeping: a hairline that fills as
          the conversation goes. "12 of 18 answered" told the user they were
          working through a list, which is exactly the feel we're removing —
          but dropping progress entirely leaves an open-ended chat with no
          sense of how long it runs, so the reassurance stays, wordlessly. */}
      <div className="px-4 pb-3 max-w-md w-full mx-auto">
        <div
          className="h-0.5 w-full rounded-full bg-muted overflow-hidden"
          // Wordless to the eye, but not to a screen reader — the bar was
          // previously invisible to one entirely.
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={requiredCount}
          aria-valuenow={answeredCount}
        >
          <div
            className="h-full bg-primary/60 transition-all duration-500"
            style={{ width: `${requiredCount > 0 ? Math.round((answeredCount / requiredCount) * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* The base pb-28 clears the now-fixed composer — without it the last
          chip card or the Generate button sits underneath it and cannot be
          tapped. The extra insetPx is for iOS: 100dvh above shrinks with the
          keyboard on Chrome Android, but iOS Safari leaves the LAYOUT
          viewport at full height, so there the container never gets shorter
          and the composer would ride up over the last message instead. */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 pb-28"
        style={isKeyboardOpen ? { paddingBottom: insetPx + 112 } : undefined}
      >
        <div ref={contentRef} className="max-w-md w-full mx-auto space-y-3">
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
                {msg.slotCard && getSlotDef(msg.slotCard)?.control === 'numeric' && (
                  <SlotNumericCard
                    slotKey={msg.slotCard}
                    values={values}
                    confirmed={confirmed}
                    resolved={!!msg.slotCardResolved}
                    busy={busy}
                    editing={!!msg.slotCardEditing}
                    onResolve={handleResolveNumeric}
                    onDecline={handleDecline}
                  />
                )}
                {msg.slotCard && (
                  <SlotChipsCard
                    slotKey={msg.slotCard}
                    values={values}
                    resolved={!!msg.slotCardResolved}
                    busy={busy}
                    onToggleMulti={handleToggleMulti}
                    onResolveSingle={handleResolveSingle}
                    onResolveMulti={handleResolveMulti}
                    onDecline={handleDecline}
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
              is a dead end — this makes "finish" always reachable.
              Gated on readyToGenerate, not just required-missing: required
              alone let this appear (and Generate succeed) before injuries or
              dietary restrictions had ever been asked — neither is required,
              so an unconfirmed injuries slot silently assembles into an empty
              array, indistinguishable from a real "no injuries" answer. */}
          {!reviewOpen && readyToGenerate && (
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
                  <button
                    key={def.key}
                    type="button"
                    onClick={() => handleEditSlot(def.key)}
                    disabled={busy}
                    className="w-full text-left min-h-[32px] rounded px-1 -mx-1 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
                    aria-label={`Change ${def.shortLabel}`}
                  >
                    <span className="font-medium text-foreground">{def.shortLabel}:</span>{' '}
                    <span className="text-muted-foreground">
                      {isDeclined(def.key, values, confirmed) ? 'Not given' : displayValueFor(def, values)}
                    </span>
                  </button>
                ))}
                <p className="text-[11px] text-muted-foreground/70 pt-1">Tap anything above to change it.</p>
                {/* Ashley's ruling: ask once more, at the point it matters.
                    Weight is optional and stays optional — this is not a
                    second attempt at the same question in the conversation,
                    where it would just read as nagging. It is here because
                    THIS is where the number is about to be used: weight is
                    what sets every starting weight in the plan, and until now
                    nothing told them that. Says what happens either way and
                    then gets out of the way. */}
                {!values.weightKg && (
                  <p className="text-xs text-muted-foreground border-t border-border/40 pt-2 mt-1">
                    Worth knowing before you build: your weight is what sets the
                    starting weight on every lift. Without it we start
                    everything deliberately light and let your logged sets
                    correct it — that works, it just takes a few sessions to
                    settle.{' '}
                    <button
                      type="button"
                      onClick={() => handleEditSlot('weightKg')}
                      disabled={busy}
                      className="underline underline-offset-2 font-medium text-foreground disabled:opacity-60"
                    >
                      Add it now
                    </button>
                    , or carry on without it.
                  </p>
                )}
                {/* VISION.md: "someone beginning exercise for the first time
                    is told, once, plainly and without alarm, to check with a
                    doctor before starting something new — at the point their
                    plan is set up, not buried in a disclaimer." Deterministic
                    and client-rendered rather than left to the model saying it
                    reliably — this is exactly that point. */}
                {isStartingFromNothing(values) && (
                  <p className="text-xs text-muted-foreground border-t border-border/40 pt-2 mt-1">
                    Quick note: if you have any health concerns, it's worth checking with a doctor before starting something new.
                  </p>
                )}
                {/* The button greys out whenever readyToGenerate flips false,
                    which an EDIT can now cause: changing equipment to a
                    barbell tier makes the working-lifts question newly
                    required. Silently disabling it leaves the user with no
                    idea what they did — so name what's outstanding, the same
                    way the early-complete refusal does. */}
                {!readyToGenerate && (
                  <p className="text-xs text-muted-foreground border-t border-border/40 pt-2 mt-1">
                    Still to answer: {[...missing, ...unconfirmedOptional]
                      .map(k => getSlotDef(k)?.shortLabel ?? k)
                      .slice(0, 4)
                      .join(' · ')}
                  </p>
                )}
                <Button onClick={handleGenerate} disabled={!readyToGenerate} className="w-full mt-3 h-12 text-base font-semibold">
                  Generate My Plan
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div
        className="fixed left-0 right-0 z-40 border-t border-border/40 bg-background px-4 py-3"
        style={composerBottomStyle}
      >
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
            // NOT `disabled` while busy: on a phone, disabling the focused
            // input dismisses the keyboard, so the user had to re-tap the
            // field on every single turn. Read-only keeps focus and the
            // keyboard up, and the Enter handler above already refuses to
            // send while busy — the same soft treatment the chips use
            // (pointer-events-none rather than a hard disable).
            readOnly={busy}
            aria-busy={busy}
            className={`h-11 ${busy ? 'opacity-60' : ''}`}
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
