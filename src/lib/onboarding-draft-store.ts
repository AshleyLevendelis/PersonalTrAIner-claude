import { initialSlotValues, type OnboardingSlotValues } from '@/lib/onboarding-slots'

// ---------------------------------------------------------------------------
// In-progress conversational-onboarding state, persisted after EVERY slot
// write so a refresh/crash/connection drop at slot 7 of 20 never loses
// slots 1-6. Deliberately a DRAFT, not incremental writes to
// fitness_profiles: the profiles table has seven NOT NULL columns, the
// app's onboarding-vs-app gate can't distinguish a half-filled row from a
// done one, and a partial row would crash plan generation
// (profile.training_days.filter) or silently poison BMR math (null→0).
// The real row is inserted exactly once, at completion, through the same
// atomic pipeline the questionnaire uses.
//
// localStorage rather than a table: under the app's current identity model
// (no auth; the active profile itself is a localStorage id) a server-side
// draft would be keyed by a localStorage draft id anyway, so it survives
// exactly the same set of failures this does — and this needs no migration.
// When real auth lands, drafts should move server-side with it.
//
// Context facts and a stated goal can surface mid-conversation ("training
// for a wedding in June", "aiming for 12% body fat"), but user_context_facts
// and user_goals rows need a profile_id that doesn't exist until completion —
// so they queue here and App.tsx's handleOnboardingComplete flushes them
// right after the insert produces an id.
// ---------------------------------------------------------------------------

const DRAFT_KEY = 'fitplan_onboarding_draft'

export interface DraftMessage {
  role: 'user' | 'assistant'
  content: string
  /** Present when this assistant turn rendered a chip card; value = slot key. */
  slotCard?: string
  /** Chip card already answered/locked (so resume doesn't re-open it). */
  slotCardResolved?: boolean
  /**
   * This card was re-opened by the user to CHANGE an answer they already
   * gave, rather than asked for the first time.
   *
   * Persisted rather than kept local because SlotNumericCard hides fields
   * that are already confirmed — without this flag surviving a refresh, a
   * reload part-way through an edit would render the card with no inputs
   * in it at all.
   */
  slotCardEditing?: boolean
}

export interface PendingContextFact {
  rawPhrase: string
  displayText: string
}

export interface PendingGoal {
  metric: 'body_weight_kg' | 'directional'
  baselineValue?: number
  targetValue?: number
  targetDate?: string
  rawPhrase: string
  displayText: string
}

export interface OnboardingDraft {
  version: 1
  values: OnboardingSlotValues
  /** Slot keys explicitly answered or explicitly skipped — the tracker's "asked" set. */
  confirmedSlots: string[]
  messages: DraftMessage[]
  pendingContextFacts: PendingContextFact[]
  pendingGoals: PendingGoal[]
  /**
   * Stamped true by the conversational flow's Generate button just before it
   * hands off to App.tsx's completion pipeline. The flush of queued context
   * facts/goals onto the new profile runs ONLY for a completing draft — a
   * draft abandoned in favor of the questionnaire must never attach its
   * half-conversation's facts to a form-built profile.
   */
  completing?: boolean
  updatedAt: string
}

export function emptyDraft(): OnboardingDraft {
  return {
    version: 1,
    values: initialSlotValues(),
    confirmedSlots: [],
    messages: [],
    pendingContextFacts: [],
    pendingGoals: [],
    updatedAt: new Date().toISOString(),
  }
}

export function loadOnboardingDraft(): OnboardingDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as OnboardingDraft
    if (parsed?.version !== 1 || !parsed.values || !Array.isArray(parsed.confirmedSlots)) {
      localStorage.removeItem(DRAFT_KEY)
      return null
    }
    // Merge over fresh defaults so a draft written before a new slot was
    // added still loads with the new slot present (unanswered). The array
    // fields are individually hardened — a corrupted non-array member would
    // otherwise pass the spread and blow up the first .map()/.some() on it.
    return {
      ...emptyDraft(),
      ...parsed,
      values: { ...initialSlotValues(), ...parsed.values },
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      pendingContextFacts: Array.isArray(parsed.pendingContextFacts) ? parsed.pendingContextFacts : [],
      pendingGoals: Array.isArray(parsed.pendingGoals) ? parsed.pendingGoals : [],
    }
  } catch {
    localStorage.removeItem(DRAFT_KEY)
    return null
  }
}

export function saveOnboardingDraft(draft: OnboardingDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }))
  } catch {
    // Quota/private-mode failure: the conversation continues from React
    // state; only refresh-resume durability is lost.
  }
}

export function clearOnboardingDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // ignore
  }
}

