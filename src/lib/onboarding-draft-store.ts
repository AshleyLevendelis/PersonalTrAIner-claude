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
  version: 2
  values: OnboardingSlotValues
  /** Slot keys explicitly ANSWERED with a value that passed validation. */
  confirmedSlots: string[]
  /**
   * Slot keys the user was asked and explicitly declined. Separate from
   * confirmedSlots on purpose: a declined slot is settled (it must stop being
   * re-asked, and it must not block the plan) but it is NOT answered, so
   * nothing downstream may read a value for it. Merging the two sets would
   * re-create the fabrication this exists to prevent.
   *
   * Added in v2. A v1 draft has no skipped set; loadOnboardingDraft migrates
   * it to an empty one rather than discarding the draft, so someone mid-
   * conversation when this shipped keeps every answer they'd already given.
   */
  skippedSlots: string[]
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
    version: 2,
    values: initialSlotValues(),
    confirmedSlots: [],
    skippedSlots: [],
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
    // `version` widened to number on purpose: the literal type is the CURRENT
    // version, and this function's whole job is recognising older ones.
    const parsed = JSON.parse(raw) as Omit<OnboardingDraft, 'version'> & { version: number }
    // v1 and v2 are both loadable. v1 predates the skipped set and is
    // MIGRATED, not discarded — dropping it would throw away a real
    // conversation someone was part-way through when this shipped, which is
    // precisely what the draft exists to prevent. v1's confirmedSlots only
    // ever held answered slots (its only writer validated first), so an empty
    // skipped set is the correct reading of an old draft, not a guess.
    const version = parsed?.version
    if ((version !== 1 && version !== 2) || !parsed.values || !Array.isArray(parsed.confirmedSlots)) {
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
      version: 2,
      values: { ...initialSlotValues(), ...parsed.values },
      skippedSlots: Array.isArray(parsed.skippedSlots) ? parsed.skippedSlots : [],
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

