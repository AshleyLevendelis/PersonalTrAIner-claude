// ---------------------------------------------------------------------------
// Pure derivations shared by useActiveSession and (from P2 onward) the
// today-first session UI. Nothing here reads localStorage or Supabase — every
// function takes its inputs explicitly so it can be unit-tested without a
// store and reused identically by the hook and by test:session-derive.
//
// LAYOUT-DESIGN.md §5.2 designates `setsFor` as the SOLE source for
// checkmarks, counts, isComplete, progress, and off-plan detection — no
// component may filter `logs` itself. This file is where that filter lives.
// ---------------------------------------------------------------------------

import { getExerciseEntry } from './exercise-db'
import { isMalformedZeroWeight } from './set-log-store'
import { loadingMode, roundToPlate, getEquipmentFloorKg } from './load-prescription'
import type { Exercise, ExerciseSetLog } from './types'

/**
 * The rows that count as "this exercise's logged sets" for every derived
 * fact on the session view. Matches on `exercise_id` when the row has one
 * (every row written through set-log-store does); falls back to name only
 * for pre-C0 legacy rows. Excludes warm-up rows (ramp ticks are UI-only and
 * never written here, but a dev-seeded or chat-logged warmup row must not
 * inflate a completion count) and malformed zero-weight rows (a save that
 * failed validation but slipped through before the guard existed).
 */
export function filterLoggableSets(
  logs: ExerciseSetLog[],
  exerciseId: string,
  exerciseName?: string,
): ExerciseSetLog[] {
  return logs.filter(l => {
    const matches = l.exercise_id ? l.exercise_id === exerciseId : l.exercise_name === exerciseName
    if (!matches) return false
    if (l.is_warmup) return false
    if (isMalformedZeroWeight(l)) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// Ramp display (LAYOUT-DESIGN.md §1.5/§1.6/§7.5) — moved from ExercisePlan.tsx
// so both the legacy stand-in and the new SetGrid/RampStrip can share the
// exact same logic. Three shapes now instead of one nullable array: the
// original kg list, a rep-only variant for bodyweight compounds (the
// percentage block this replaces used to be the only surface for these —
// deleting it without this branch would silently drop the ramp), and a
// stale-name fallback so a mid-rotation exercise never renders nothing.
// ---------------------------------------------------------------------------

export type RampDisplay =
  | { kind: 'kg'; sets: { setNumber: number; kg: number; reps: number }[] }
  | { kind: 'bodyweight'; sets: { setNumber: number; reps: number }[] }
  | { kind: 'stale' }

/**
 * Percent-based (RampSet.load_percent is relative to THIS week's
 * suggested_load_kg, not a stored absolute), so this recomputes fresh every
 * call rather than trusting a cached kg value — correct automatically as
 * suggested_load_kg changes week to week. Every kg step is floored at the
 * equipment's real loadable minimum so "0% of working weight" never
 * displays as an unsafe 0kg.
 */
export function formatRampSets(ex: Exercise): RampDisplay | null {
  if (!ex.ramp_up) return null
  if (ex.ramp_up.exercise !== ex.name) return { kind: 'stale' }
  const entry = getExerciseEntry(ex.name)
  if (!entry) return null
  if (ex.suggested_load_kg == null) {
    return { kind: 'bodyweight', sets: ex.ramp_up.sets.map(s => ({ setNumber: s.set_number, reps: s.reps })) }
  }
  const mode = loadingMode(entry)
  const floor = getEquipmentFloorKg(entry)
  return {
    kind: 'kg',
    sets: ex.ramp_up.sets.map(s => ({
      setNumber: s.set_number,
      kg: roundToPlate(Math.max((ex.suggested_load_kg! * s.load_percent) / 100, floor), mode),
      reps: s.reps,
    })),
  }
}

// ---------------------------------------------------------------------------
// Superset grouping (§3.4) — partitions a day's exercise list into singles
// and fused superset groups, preserving each member's ORIGINAL array index.
// mesocycle-edit's swapExerciseInMesocycle addresses exercises positionally
// (currentWeekNumber, dayName, exIndex) — grouping must never lose that.
// ---------------------------------------------------------------------------

export type ExerciseGroup =
  | { kind: 'single'; ex: Exercise; exIndex: number }
  | { kind: 'superset'; label: string; members: { ex: Exercise; exIndex: number }[] }

export function groupExercises(exercises: Exercise[]): ExerciseGroup[] {
  const groups: ExerciseGroup[] = []
  const consumed = new Set<number>()

  exercises.forEach((ex, exIndex) => {
    if (consumed.has(exIndex)) return

    if (!ex.superset_label) {
      groups.push({ kind: 'single', ex, exIndex })
      consumed.add(exIndex)
      return
    }

    // superset_label is 'A1'/'A2'-shaped (exercise-plan.ts) — the leading
    // letter identifies the pair; the trailing digit orders them.
    const letter = ex.superset_label[0]
    const members: { ex: Exercise; exIndex: number }[] = []
    exercises.forEach((candidate, candidateIndex) => {
      if (consumed.has(candidateIndex)) return
      if (candidate.superset_label?.[0] === letter) {
        members.push({ ex: candidate, exIndex: candidateIndex })
        consumed.add(candidateIndex)
      }
    })
    members.sort((a, b) => (a.ex.superset_label ?? '').localeCompare(b.ex.superset_label ?? ''))

    if (members.length >= 2) {
      groups.push({ kind: 'superset', label: letter, members })
    } else if (members.length === 1) {
      // An orphaned single-member label — clearOrphanedSupersetLabels
      // (mesocycle-edit.ts) normally strips this after a swap breaks a
      // pair, but render defensively as a single rather than a one-member
      // "superset" if it's ever seen mid-transition.
      groups.push({ kind: 'single', ex: members[0].ex, exIndex: members[0].exIndex })
    }
  })

  return groups
}

// ---------------------------------------------------------------------------
// Calibration cue anchor (§1.6.4) — resolves to exactly one exercise row per
// calibration-week day, with a three-step fallback so a known_weight or
// all-bodyweight day still gets the instruction instead of it silently
// disappearing.
// ---------------------------------------------------------------------------

export function resolveCalibrationAnchorIndex(exercises: Exercise[]): number | null {
  if (exercises.length === 0) return null
  const estimateIdx = exercises.findIndex(
    ex => ex.suggested_load_kg != null && (ex.load_source ?? 'estimate') === 'estimate'
  )
  if (estimateIdx !== -1) return estimateIdx
  const anyLoadedIdx = exercises.findIndex(ex => ex.suggested_load_kg != null)
  if (anyLoadedIdx !== -1) return anyLoadedIdx
  return 0
}

// ---------------------------------------------------------------------------
// Set-row numbering (§3.3) — never renumber. The rendered row list is the
// prescribed baseline plus whatever has actually been logged or explicitly
// added, minus anything explicitly removed. `removedSetNumbers` is not
// populated by anything in P2 (the inline today-view grid has no "Remove
// this set" affordance yet — that lands with P3's active mode); the
// parameter exists now so the function's contract already matches what P3
// needs, rather than changing shape later.
// ---------------------------------------------------------------------------

export function computeSetRowNumbers(
  prescribedSets: number,
  loggedSetNumbers: number[],
  extraSetNumbers: number[],
  removedSetNumbers: number[] = [],
): number[] {
  const removed = new Set(removedSetNumbers)
  const rows = new Set<number>()
  for (let i = 1; i <= prescribedSets; i++) {
    if (!removed.has(i)) rows.add(i)
  }
  for (const n of loggedSetNumbers) {
    if (!removed.has(n)) rows.add(n)
  }
  for (const n of extraSetNumbers) {
    if (!removed.has(n)) rows.add(n)
  }
  return Array.from(rows).sort((a, b) => a - b)
}

/**
 * The next number `+ Add set` appends — always past the highest number
 * EVER used for this exercise today, including removed ones, so a removed
 * set's number is never reissued to a different set (the store's
 * natural-key upsert would silently merge them).
 */
export function nextExtraSetNumber(
  prescribedSets: number,
  loggedSetNumbers: number[],
  extraSetNumbers: number[],
): number {
  const everUsed = [
    ...Array.from({ length: prescribedSets }, (_, i) => i + 1),
    ...loggedSetNumbers,
    ...extraSetNumbers,
  ]
  return (everUsed.length > 0 ? Math.max(...everUsed) : prescribedSets) + 1
}

// ---------------------------------------------------------------------------
// Off-plan work union (§1.7 H) — the union of user-declared names and
// detected off-plan logs (chat-logged, swapped-away work). Detected entries
// have no remove affordance; declared entries with zero logged sets can be
// removed by the caller.
// ---------------------------------------------------------------------------

export interface OffPlanWorkItem {
  exerciseId: string
  name: string
  source: 'declared' | 'logged'
}

export function computeOffPlanWork(
  declaredNames: string[],
  logs: ExerciseSetLog[],
  plannedIds: Set<string>,
  getExerciseId: (name: string) => string,
): OffPlanWorkItem[] {
  const byId = new Map<string, OffPlanWorkItem>()
  for (const name of declaredNames) {
    const id = getExerciseId(name)
    byId.set(id, { exerciseId: id, name, source: 'declared' })
  }
  for (const log of logs) {
    const id = log.exercise_id ?? getExerciseId(log.exercise_name)
    if (plannedIds.has(id)) continue
    if (!byId.has(id)) byId.set(id, { exerciseId: id, name: log.exercise_name, source: 'logged' })
  }
  return Array.from(byId.values())
}
