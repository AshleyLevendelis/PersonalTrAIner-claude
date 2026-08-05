// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §1 Part 2 — "surface the conflict and ask rather
// than silently overwriting." Pure functions only (no I/O), called by
// ChatAssistant.tsx BEFORE writing a new fact/goal through memory-store.
//
// Two shapes handled, matching the two examples in the brief:
//   1. A same-domain preference stated with the opposite polarity of an
//      existing active fact ("I love salmon" after an existing "dislike
//      salmon" fact) — a direct contradiction, always surfaced.
//   2. A goal whose number is *related to but not identical with* existing
//      profile data (the concrete case: onboarding says 90kg working bench,
//      the user later states a 115kg 1RM — both can be true at once, ~78%
//      is a normal working:1RM ratio). This is not a contradiction to
//      reject, it's a relationship to confirm — the check computes the
//      ratio and asks only when it's implausible, otherwise the receipt
//      states the relationship explicitly rather than silently stacking
//      two numbers that were never checked against each other.
// ---------------------------------------------------------------------------

import type { UserFactRow, UserGoalRow } from './memory-store'

export interface ReconciliationResult {
  needsConfirmation: boolean
  message: string
}

const NO_CONFLICT: ReconciliationResult = { needsConfirmation: false, message: '' }

export function checkFactConflict(
  newFact: { kind: UserFactRow['kind']; polarity?: 'like' | 'dislike'; resolvedRefs?: string[] },
  existingFacts: UserFactRow[],
): ReconciliationResult {
  if (!newFact.polarity || !newFact.resolvedRefs || newFact.resolvedRefs.length === 0) return NO_CONFLICT
  const opposite = newFact.polarity === 'like' ? 'dislike' : 'like'
  const targetSet = new Set(newFact.resolvedRefs.map(r => r.toLowerCase()))

  const conflicting = existingFacts.find(f =>
    f.kind === newFact.kind &&
    f.polarity === opposite &&
    (f.resolved_refs ?? []).some(r => targetSet.has(r.toLowerCase()))
  )
  if (!conflicting) return NO_CONFLICT
  return {
    needsConfirmation: true,
    message: `I already have you down as "${conflicting.display_text}" — that's the opposite of what you just said. Want me to replace it, or did I misunderstand?`,
  }
}

/** Working:1RM ratio outside this band is implausible enough to ask about rather than silently accept (typical is 70-90% for a 3-8 rep working set). */
const PLAUSIBLE_WORKING_TO_1RM_MIN = 0.5
const PLAUSIBLE_WORKING_TO_1RM_MAX = 0.97

export interface KnownLifts {
  known_squat_kg?: number | null
  known_bench_kg?: number | null
  known_deadlift_kg?: number | null
}

const LIFT_TO_KNOWN_FIELD: Record<string, keyof KnownLifts | undefined> = {
  'barbell back squat': 'known_squat_kg',
  'barbell bench press': 'known_bench_kg',
  'deadlifts': 'known_deadlift_kg',
}

export function checkGoalConflict(
  newGoal: { metric: UserGoalRow['metric']; metricRef?: string; baselineValue?: number },
  existingGoals: UserGoalRow[],
  knownLifts: KnownLifts,
): ReconciliationResult {
  // Same metric+ref already tracked with a materially different baseline —
  // ask which is current rather than silently superseding. metricRef is
  // legitimately absent for a metric like body_weight_kg (nothing to
  // qualify), so this compares refs when either side has one and treats
  // "both absent" as a match too — not "only fires when a ref exists".
  if (newGoal.baselineValue != null) {
    const existing = existingGoals.find(g =>
      g.metric === newGoal.metric &&
      (g.metric_ref?.toLowerCase() ?? null) === (newGoal.metricRef?.toLowerCase() ?? null) &&
      g.baseline_value != null
    )
    if (existing && existing.baseline_value != null && Math.abs(existing.baseline_value - newGoal.baselineValue) / existing.baseline_value > 0.1) {
      return {
        needsConfirmation: true,
        message: `You already told me your ${newGoal.metricRef ? newGoal.metricRef + ' ' : ''}baseline was ${existing.baseline_value} — now you're saying ${newGoal.baselineValue}. Which is right?`,
      }
    }
  }

  // The concrete case: a stated 1RM against a known WORKING weight for the
  // same lift. Not a contradiction — both numbers can be true — but the
  // relationship should be checked and named, not silently stacked.
  if (newGoal.metric === 'lift_1rm_kg' && newGoal.metricRef && newGoal.baselineValue != null) {
    const field = LIFT_TO_KNOWN_FIELD[newGoal.metricRef.toLowerCase()]
    const knownWorking = field ? knownLifts[field] : null
    if (knownWorking != null && knownWorking > 0) {
      const ratio = knownWorking / newGoal.baselineValue
      if (ratio < PLAUSIBLE_WORKING_TO_1RM_MIN || ratio > PLAUSIBLE_WORKING_TO_1RM_MAX) {
        return {
          needsConfirmation: true,
          message: `Your working ${newGoal.metricRef} is ${knownWorking}kg — a ${newGoal.baselineValue}kg 1RM would put that at ${Math.round(ratio * 100)}% of max, which isn't typical. Can you confirm the 1RM number?`,
        }
      }
    }
  }

  return NO_CONFLICT
}
