// ---------------------------------------------------------------------------
// EDITING ONE SESSION'S EXERCISE LIST — remove, and reorder.
//
// Ashley, 11 Sep 2026, from the must-have audit: an exercise could be swapped
// or banned and nothing else. Banning rewrites every week of every block
// (mesocycle-edit.ts:353), so "not today" did not exist; neither did moving
// one earlier or later.
//
// THE CONSTRAINT THAT SHAPES THIS FILE. Of the passes that keep a generated
// day sane, some are reachable from outside generateMesocycle and some are
// welded inside it. Reachable, and therefore RE-ASSERTED here after every
// edit: enforceSetHierarchy (exported for this), enforceOneWeightPerPrescription,
// enforceLoadCoherence — in that order, which is the order generateMesocycle
// itself documents (exercise-plan.ts:6893-6895). Not reachable, because they
// need the candidate pool and the whole generation context:
// enforceWeeklyPatternBalance (push:pull, chest:back) and
// balanceWeeklyStructure (six-pattern coverage). Re-running the generator to
// get them would discard every other edit the person has made, so this file
// does not try. session-balance-cost.ts MEASURES what those passes would have
// objected to, read-only, so the app can SAY it on the confirm card instead of
// breaking it silently.
//
// The precedent is volume-adjust.ts — the one production path that already
// mutates a session outside generation. It touches sets only, clamps through
// the generator's own bounds, and refuses rather than overrun the time cap.
// This file extends that shape; it does not invent one.
//
// Scope vocabulary is mesocycle-edit's, deliberately: 'today' patches one
// (week, day), 'permanent' the rest of THIS block. A third meaning would be a
// third thing for someone to get wrong.
// ---------------------------------------------------------------------------
import type { MesocycleWeek, Exercise, UserProfile, WorkoutDay } from './types'
import { getExerciseEntry } from './exercise-db'
import {
  enforceSetHierarchy,
  enforceLoadCoherence,
  enforceOneWeightPerPrescription,
} from './exercise-plan'
import { buildWarmup, getWarmupReserveSeconds } from './warmup'
import { getDurationBudgetSeconds } from './session-duration'
import { clearOrphanedSupersetLabels, type SwapScope } from './mesocycle-edit'

/**
 * The fewest exercises a session may be reduced to. The same floor
 * sizeBlockToRestBudget's phase B already keeps (exercise-plan.ts:5472-5493) —
 * stated once here rather than guessed at a second time.
 */
export const MIN_EXERCISES_PER_SESSION = 3

export interface SessionEditResult {
  mesocycle: MesocycleWeek[]
  /** True when the edit actually changed something. False leaves the input untouched. */
  changed: boolean
  /** Why nothing happened, in words a person can read. Empty when `changed`. */
  refusal?: string
}

/** Which weeks a scope reaches — mesocycle-edit's own rule, kept identical. */
function targetWeekNumbers(mesocycle: MesocycleWeek[], weekNumber: number, scope: SwapScope): number[] {
  if (scope === 'today') return [weekNumber]
  const current = mesocycle.find(w => w.week_number === weekNumber)
  if (!current) return [weekNumber]
  return mesocycle
    .filter(w => w.block_number === current.block_number && w.week_number >= weekNumber)
    .map(w => w.week_number)
}

/**
 * THE SHARED TAIL. Everything that must hold after a day's exercise list
 * changes shape, applied to one week in the order generation applies it.
 *
 * The warm-up rebuild is the part a swap never got: buildWarmup derives the
 * session's preparation FROM its exercises (exercise-plan.ts:4666-4700), and
 * nothing re-derived it after an edit, so a day whose squat was swapped out
 * kept ramping for a squat. Removing an exercise makes that worse — an orphan
 * ramp for a lift that is no longer there. Rebuilt here, and each surviving
 * exercise's own `ramp_up` re-stamped from it.
 */
function settleWeek(week: MesocycleWeek, dayName: string, profile: UserProfile): MesocycleWeek {
  const days = week.days.map(d => {
    if (d.day !== dayName) return d
    let exercises = enforceSetHierarchy(clearOrphanedSupersetLabels(d.exercises))
    return { ...d, exercises }
  })

  // Both of these take the whole week and mutate in place — the week's other
  // days are part of what they check (one weight per prescription is a WEEK
  // rule, and load coherence's fourth clamp spans the week too).
  enforceOneWeightPerPrescription(days)
  enforceLoadCoherence(days)

  return { ...week, days: days.map(d => (d.day === dayName ? rebuildWarmup(d, profile) : d)) }
}

/** The day's warm-up, re-derived from the exercises it now actually contains. */
function rebuildWarmup(day: WorkoutDay, profile: UserProfile): WorkoutDay {
  const entries = day.exercises
    .map(ex => ({ ex, entry: getExerciseEntry(ex.name) }))
    .filter((p): p is { ex: Exercise; entry: NonNullable<ReturnType<typeof getExerciseEntry>> } => !!p.entry)
  // An unresolvable exercise list means the warm-up would be derived from
  // less than the session really holds. Leaving the old one is the honest
  // failure: it is stale, but it was built from a real session.
  if (entries.length === 0 || entries.length !== day.exercises.length) return day

  const budgetSeconds = getDurationBudgetSeconds(profile.session_duration_preference)
  try {
    const warmup = buildWarmup({
      patterns: entries.map(p => p.entry.movement_pattern),
      compounds: entries.map(p => ({
        entry: p.entry,
        suggestedLoadKg: p.ex.suggested_load_kg ?? null,
        loadSource: p.ex.load_source,
      })),
      equipment: profile.equipment_access || 'full_gym',
      injuries: profile.injuries || [],
      experience: profile.training_experience || 'novice',
      budgetSeconds: getWarmupReserveSeconds(budgetSeconds),
    })
    const rampByName = new Map(warmup.ramp_ups.map(r => [r.exercise, r]))
    return {
      ...day,
      warmup,
      exercises: day.exercises.map(ex =>
        rampByName.has(ex.name) ? { ...ex, ramp_up: rampByName.get(ex.name) } : { ...ex, ramp_up: undefined },
      ),
    }
  } catch (err) {
    console.error('[session-edit] warm-up rebuild failed; keeping the previous one', err)
    return day
  }
}

export interface RemoveExerciseParams {
  mesocycle: MesocycleWeek[]
  profile: UserProfile
  weekNumber: number
  dayName: string
  exIndex: number
  scope: SwapScope
}

/**
 * Take one exercise out of a session, without banning it from the plan.
 *
 * Refuses rather than empties: a session below MIN_EXERCISES_PER_SESSION is
 * not a session. The superset partner it may orphan is repaired by
 * clearOrphanedSupersetLabels in the shared tail, which also undoes the
 * `rest: 'alternate'` that partner was carrying.
 */
export function removeExerciseFromSession(params: RemoveExerciseParams): SessionEditResult {
  const { mesocycle, profile, weekNumber, dayName, exIndex, scope } = params
  const week = mesocycle.find(w => w.week_number === weekNumber)
  const day = week?.days.find(d => d.day === dayName)
  const target = day?.exercises[exIndex]
  if (!week || !day || !target) {
    return { mesocycle, changed: false, refusal: "I couldn't find that exercise on that day." }
  }
  if (day.exercises.length - 1 < MIN_EXERCISES_PER_SESSION) {
    return {
      mesocycle,
      changed: false,
      refusal: `That would leave ${dayName} with fewer than ${MIN_EXERCISES_PER_SESSION} exercises. Take the whole day off instead, or swap this one for something easier.`,
    }
  }

  const weeks = new Set(targetWeekNumbers(mesocycle, weekNumber, scope))
  let changed = false
  const next = mesocycle.map(w => {
    if (!weeks.has(w.week_number)) return w
    const d = w.days.find(x => x.day === dayName)
    // Positional, and NAME-CHECKED — a later week may have rotated this slot
    // to a different exercise, and removing whatever happens to sit at index 3
    // is not what anyone asked for.
    const slot = d?.exercises[exIndex]
    if (!d || !slot || slot.name !== target.name) return w
    if (d.exercises.length - 1 < MIN_EXERCISES_PER_SESSION) return w
    changed = true
    const trimmed = { ...d, exercises: d.exercises.filter((_, i) => i !== exIndex) }
    return settleWeek({ ...w, days: w.days.map(x => (x.day === dayName ? trimmed : x)) }, dayName, profile)
  })
  return changed
    ? { mesocycle: next, changed: true }
    : { mesocycle, changed: false, refusal: "I couldn't find that exercise on that day." }
}

export interface MoveExerciseParams {
  mesocycle: MesocycleWeek[]
  profile: UserProfile
  weekNumber: number
  dayName: string
  fromIndex: number
  toIndex: number
  scope: SwapScope
}

/**
 * Move one exercise earlier or later in its session.
 *
 * SUPERSET PARTNERS MOVE TOGETHER. A superset's two halves must stay adjacent
 * — buildSupersetPairs goes out of its way to make them so
 * (exercise-plan.ts:1002-1018) and the scorer deducts for
 * `superset_not_adjacent`. Moving one half alone would break the thing the
 * label means, so the whole pair travels.
 *
 * Nothing here re-prices anything: order carries no load.
 */
export function moveExerciseInSession(params: MoveExerciseParams): SessionEditResult {
  const { mesocycle, profile, weekNumber, dayName, fromIndex, toIndex, scope } = params
  const week = mesocycle.find(w => w.week_number === weekNumber)
  const day = week?.days.find(d => d.day === dayName)
  const target = day?.exercises[fromIndex]
  if (!week || !day || !target) {
    return { mesocycle, changed: false, refusal: "I couldn't find that exercise on that day." }
  }
  if (toIndex < 0 || toIndex >= day.exercises.length) {
    return { mesocycle, changed: false, refusal: "That would put it outside the session." }
  }
  if (toIndex === fromIndex) {
    return { mesocycle, changed: false, refusal: `${target.name} is already there.` }
  }

  const weeks = new Set(targetWeekNumbers(mesocycle, weekNumber, scope))
  let changed = false
  const next = mesocycle.map(w => {
    if (!weeks.has(w.week_number)) return w
    const d = w.days.find(x => x.day === dayName)
    const slot = d?.exercises[fromIndex]
    if (!d || !slot || slot.name !== target.name) return w
    const reordered = reorderWithSupersets(d.exercises, fromIndex, toIndex)
    if (!reordered) return w
    changed = true
    // No load or volume changed, so the coherence passes have nothing to say —
    // but the warm-up lists its ramps in session order, so it is rebuilt.
    return {
      ...w,
      days: w.days.map(x => (x.day === dayName ? rebuildWarmup({ ...d, exercises: reordered }, profile) : x)),
    }
  })
  return changed
    ? { mesocycle: next, changed: true }
    : { mesocycle, changed: false, refusal: "I couldn't move that one." }
}

/**
 * The array move, with a superset's members travelling as one block. Returns
 * null when the move would change nothing.
 */
export function reorderWithSupersets(exercises: Exercise[], fromIndex: number, toIndex: number): Exercise[] | null {
  const target = exercises[fromIndex]
  if (!target) return null
  const letter = target.superset_label?.[0]
  const blockIdx = letter
    ? exercises.map((ex, i) => (ex.superset_label?.[0] === letter ? i : -1)).filter(i => i >= 0)
    : [fromIndex]
  const blockSet = new Set(blockIdx)
  const block = blockIdx.map(i => exercises[i])
  const rest = exercises.filter((_, i) => !blockSet.has(i))
  const restIdx = exercises.map((_, i) => i).filter(i => !blockSet.has(i))
  // Where the block lands among what remains. `toIndex` is a position in the
  // ORIGINAL list, so it is translated by counting how many of the survivors
  // belong in front of it. Moving DOWN, the destination slot is one the block
  // vacates on its way past, so the exercise now sitting AT toIndex stays in
  // front (<=); moving UP it does not (<). Getting this backwards lands a
  // downward move one short — the off-by-one the gate caught.
  const down = toIndex > fromIndex
  const at = restIdx.filter(i => (down ? i <= toIndex : i < toIndex)).length
  const next = [...rest.slice(0, at), ...block, ...rest.slice(at)]
  if (next.every((ex, i) => ex === exercises[i])) return null
  return next
}
