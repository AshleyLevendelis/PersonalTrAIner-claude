// ---------------------------------------------------------------------------
// EDITING ONE SESSION'S EXERCISE LIST — remove, and reorder.
//
// Ashley, 11 Sep 2026, from the must-have audit: an exercise could be swapped
// or banned and nothing else. Banning rewrites every week of every block
// (mesocycle-edit.ts:353), so "not today" did not exist; neither did moving
// one earlier or later.
//
// THE TAIL MOVED OUT, 13 Sep 2026. Everything that must hold after a day's
// exercise list changes shape now lives in settle-week.ts, because this file
// was the only caller and every OTHER in-place edit — swap, ban, volume —
// re-ran none of it. See that file's header for what each edit was missing.
//
// CORRECTED AT THE SAME TIME, and worth knowing because the wrong version was
// written down here and in the must-have list: this header used to say
// enforceWeeklyPatternBalance was unreachable "because it needs the candidate
// pool and the whole generation context". It does not. Its signature is
// (days: WorkoutDay[]) => void — the same shape as the two passes already
// called here. Only balanceWeeklyStructure genuinely needs the pool and the
// trace, and it swaps exercise IDENTITIES, which would overwrite the edit
// somebody just made. The reachable half is now part of the tail.
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
import type { MesocycleWeek, Exercise, UserProfile } from './types'
import { settleWeek } from './settle-week'
import { type SwapScope } from './mesocycle-edit'

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
    return settleWeek({ ...w, days: w.days.map(x => (x.day === dayName ? trimmed : x)) }, dayName, profile).week
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
    // THE SHARED TAIL, 13 Sep 2026, replacing a warm-up-only rebuild.
    //
    // The old comment here argued the coherence passes had nothing to say
    // because no load or volume changed, and on its own terms that is right.
    // But the must-have list stated that moving re-ran them, no check would
    // have noticed either way, and "this particular edit happens not to need
    // three of the four" is a claim that has to stay true as both sides change.
    // The passes preserve order (enforceSetHierarchy is a map, not a sort) and
    // are no-ops on a week they have nothing to fix, so running them costs the
    // move nothing and makes one rule true of every edit instead of most.
    return settleWeek({ ...w, days: w.days.map(x => (x.day === dayName ? { ...d, exercises: reordered } : x)) }, dayName, profile).week
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
