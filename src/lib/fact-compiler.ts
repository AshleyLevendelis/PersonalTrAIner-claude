// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §1.0 — "memory is a compiler, not a mutator." Pure
// functions only: every export here reads a list of ACTIVE facts (already
// fetched by the caller) and emits exactly the argument shapes the existing
// pure generators accept. No function here writes anything, imports
// memory-store, or calls Supabase — that keeps this module trivially
// testable and structurally incapable of becoming a second write path.
//
// Only kind='food_preference'/'exercise_preference'/'timing_rule'/
// 'hard_constraint' facts (class is implicit — user_context_facts is a
// separate table this module never imports, so tone is structurally
// unreachable here) and status='active' rows should be passed in; callers
// are expected to have already filtered via memory-store's getActiveFacts.
// ---------------------------------------------------------------------------

import { searchExerciseCatalog } from './exercise-db'
import type { UserFactRow, UserGoalRow } from './memory-store'
import type { TrainingDay } from './types'

// ---------------------------------------------------------------------------
// Exercise resolution (write-time, called before createFact)
// ---------------------------------------------------------------------------

export type ExerciseTargetResolution =
  | { resolution: 'resolved'; resolvedRefs: string[] }
  | { resolution: 'unresolved' }

/**
 * A plain substring match against the full catalog, deliberately not exact-
 * only: "lunges" must expand to every lunge variant (a family match), not
 * fail to resolve because no exercise is literally named "Lunges". Reuses
 * `searchExerciseCatalog`'s existing prefix/substring ranking rather than a
 * parallel matcher — same resolution semantics the swap dialog already uses.
 */
export function resolveExerciseTarget(phrase: string): ExerciseTargetResolution {
  const trimmed = phrase.trim()
  if (!trimmed) return { resolution: 'unresolved' }
  const matches = searchExerciseCatalog(trimmed, 50)
  if (matches.length === 0) return { resolution: 'unresolved' }
  return { resolution: 'resolved', resolvedRefs: matches.map(m => m.name) }
}

/**
 * Food resolution deliberately does NOT try to match a catalog entry —
 * meal-generation.ts's existing `dislikedFoods` filter (verifyProposal,
 * :267-274) is already a plain lowercase substring match against parsed
 * ingredient names, not a lookup against food-db's ingredient table. Storing
 * anything more structured here would create a second resolution concept
 * for the same filter to disagree with.
 */
export function resolveFoodTarget(phrase: string): string[] {
  const trimmed = phrase.trim().toLowerCase()
  return trimmed ? [trimmed] : []
}

// ---------------------------------------------------------------------------
// Compilation (read-time, called before generation)
// ---------------------------------------------------------------------------

function preferenceFacts(facts: UserFactRow[], kind: UserFactRow['kind'], polarity: 'like' | 'dislike', hardness: 'hard' | 'soft'): UserFactRow[] {
  return facts.filter(f => f.kind === kind && f.polarity === polarity && f.hardness === hardness)
}

/** Hard exercise dislikes → the existing exclusions channel (getConstrainedPool/generateExercisePlan's exact-name filter). */
export function compileExerciseExclusions(facts: UserFactRow[]): string[] {
  const hard = preferenceFacts(facts, 'exercise_preference', 'dislike', 'hard')
  return [...new Set(hard.flatMap(f => f.resolved_refs ?? []))]
}

/** Soft exercise likes/dislikes → NOT the exclusions channel. Scoped to swap-candidate ranking only (mesocycle-edit.getReplacementCandidates's `soft` parameter), per the vision doc's §1.2 resolution — rotation itself is unaffected. This claim was untrue for a while: the consumer it names did not exist, so the function was compiled and read by nothing. */
export function compileSoftExercisePreferences(facts: UserFactRow[]): { liked: string[]; disliked: string[] } {
  const liked = preferenceFacts(facts, 'exercise_preference', 'like', 'soft')
  const disliked = preferenceFacts(facts, 'exercise_preference', 'dislike', 'soft')
  return {
    liked: [...new Set(liked.flatMap(f => f.resolved_refs ?? []))],
    disliked: [...new Set(disliked.flatMap(f => f.resolved_refs ?? []))],
  }
}

/** Hard food dislikes → the existing `dislikedFoods` hard filter (meal-generation.ts verifyProposal). */
export function compileFoodDislikes(facts: UserFactRow[]): string[] {
  const hard = preferenceFacts(facts, 'food_preference', 'dislike', 'hard')
  return [...new Set(hard.flatMap(f => f.resolved_refs ?? []))]
}

/** Soft food likes → a scoring bias hook (meal-generation.ts's candidate ranking); no consumer wired to bias yet, so this is exported for a future ranking pass rather than silently dropped. */
export function compileSoftFoodPreferences(facts: UserFactRow[]): string[] {
  const soft = preferenceFacts(facts, 'food_preference', 'like', 'soft')
  return [...new Set(soft.flatMap(f => f.resolved_refs ?? []))]
}

export interface CompiledTimingRule {
  subject: string
  relation: 'before' | 'after'
  anchor: 'training' | 'slot'
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null
}

/** Timing rules → a per-slot predicate consumed at meal pool assembly (meal-generation.ts's generateMealPools/verifyProposal), never at `assembleDay` render time — see meal-generation.ts's own comment at the consumption site. */
export function compileTimingRules(facts: UserFactRow[]): CompiledTimingRule[] {
  return facts
    .filter((f): f is UserFactRow & { timing_subject: string; timing_relation: 'before' | 'after'; timing_anchor: 'training' | 'slot' } =>
      f.kind === 'timing_rule' && f.timing_subject != null && f.timing_relation != null && f.timing_anchor != null)
    .map(f => ({ subject: f.timing_subject, relation: f.timing_relation, anchor: f.timing_anchor, slot: f.timing_slot }))
}

/**
 * Hard availability constraints → overrides `profile.training_days` before
 * `generateExercisePlan` runs (exercise-plan.ts:2599's `availableDays`
 * filter). A weekday marked unavailable by a fact wins over the profile's
 * own flag for that day — the fact is the more specific, more recent
 * statement (same "memory wins for future compilation" rule §1.3 states for
 * onboarding-vs-memory conflicts generally).
 */
export function compileTrainingDayOverrides(facts: UserFactRow[], trainingDays: TrainingDay[]): TrainingDay[] {
  const unavailableDays = new Set(
    facts.filter(f => f.kind === 'hard_constraint' && f.constraint_kind === 'availability' && f.weekday).map(f => f.weekday)
  )
  if (unavailableDays.size === 0) return trainingDays
  return trainingDays.map(d => (unavailableDays.has(d.day) ? { ...d, available: false } : d))
}

// ---------------------------------------------------------------------------
// Goals → known-lift anchoring (reuses known_squat_kg/known_bench_kg/
// known_deadlift_kg — the SAME columns onboarding writes, added by defect-6's
// migration — rather than a parallel goal-driven load path).
// ---------------------------------------------------------------------------

const LIFT_GOAL_COLUMN: Record<string, 'known_squat_kg' | 'known_bench_kg' | 'known_deadlift_kg' | undefined> = {
  'barbell back squat': 'known_squat_kg',
  'barbell bench press': 'known_bench_kg',
  'deadlifts': 'known_deadlift_kg',
}

export interface KnownLiftOverrides {
  known_squat_kg?: number
  known_bench_kg?: number
  known_deadlift_kg?: number
}

/**
 * A measurable lift goal's baseline is a MORE TRUSTWORTHY number than a
 * standards-table estimate once the user has actually stated or logged it —
 * seed it into the exact columns `exercise-plan.ts:3260-3262` already reads
 * for calibration-week anchoring, never a parallel "goal-implied load" path.
 * Only `lift_working_kg` goals seed this (a working weight, not a 1RM,
 * anchors the working-weight prescription these columns feed).
 */
export function compileKnownLiftOverrides(goals: UserGoalRow[]): KnownLiftOverrides {
  const overrides: KnownLiftOverrides = {}
  for (const g of goals) {
    if (g.metric !== 'lift_working_kg' || g.baseline_value == null || !g.metric_ref) continue
    const column = LIFT_GOAL_COLUMN[g.metric_ref.toLowerCase()]
    if (column) overrides[column] = g.baseline_value
  }
  return overrides
}
