// ---------------------------------------------------------------------------
// CHANGING A DAY'S VOLUME, WITHIN THE LIMITS THE ENGINE ALREADY OWNS.
//
// Audit §2.4. The coach's adjust_volume tool has been declared and declined
// on every call since it was written — its own description says "NOT SAFELY
// WIRED UP YET". It was unsafe for a specific reason: the original multiplied
// a day's sets by a model-chosen factor, respecting neither the per-role
// floors and ceilings nor the session's time budget, and could not be undone.
//
// THE MODEL PROPOSES A DIRECTION. THE APP DECIDES THE MAGNITUDE. A
// model-chosen 0.4x is a volume prescription made by something with no view
// of the floors — the same reasoning that keeps load prescription out of the
// prompt. Here it says "lighter" or "heavier" and this decides by how much.
//
// ONE STEP AT A TIME, and that is a deliberate ceiling on ambition: one set
// per eligible exercise. Someone who wants two can ask twice, and will see
// what the first one did before deciding. A single call that halves a day is
// a bigger swing than a conversation should make in one go.
//
// EVERY BOUND COMES FROM THE GENERATOR, not from a second copy of the rule
// written here — clampToVolumeRole is the same function plan generation uses,
// exported for this. A rule with two implementations has two behaviours.
// ---------------------------------------------------------------------------

import { clampToVolumeRole, getRoleSetFloor, getRoleSetCeiling } from './exercise-plan'
import { getExerciseEntry, getVolumeRole } from './exercise-db'
import { estimateDaySeconds, getSessionMaximumSeconds } from './session-duration'
import type { WorkoutDay, Exercise, UserProfile } from './types'

export type VolumeDirection = 'lighter' | 'heavier'

export interface VolumeAdjustResult {
  day: WorkoutDay
  /** True when at least one exercise actually moved. */
  changed: boolean
  setsBefore: number
  setsAfter: number
  /** Exercises that could not move because a bound stopped them — named so the receipt can say so. */
  blocked: { name: string; reason: 'at the minimum' | 'at the maximum for its role' | 'no room in the session' }[]
}

/**
 * Move a day's volume one step, and report what actually happened.
 *
 * A change that hits a bound is CLAMPED and NAMED, never silently reduced to
 * less than it claimed. "Took Tuesday from 16 sets to 14; two exercises were
 * already at their minimum" is a true sentence; "done" would not be.
 */
export function adjustDayVolume(
  day: WorkoutDay,
  direction: VolumeDirection,
  profile: UserProfile,
): VolumeAdjustResult {
  const isLongSession = (profile.session_duration_preference || '45-60') === '90+'
  const maxSeconds = getSessionMaximumSeconds(profile.session_duration_preference || '45-60')
  const blocked: VolumeAdjustResult['blocked'] = []

  const setsBefore = day.exercises.reduce((n, ex) => n + (ex.sets ?? 0), 0)

  const next: Exercise[] = day.exercises.map(ex => {
    const entry = getExerciseEntry(ex.name)
    const role = entry ? getVolumeRole(entry) : null
    const current = ex.sets ?? 0
    const wanted = direction === 'lighter' ? current - 1 : current + 1
    const clamped = clampToVolumeRole(wanted, role, isLongSession)

    if (clamped === current) {
      // Distinguish the two reasons, because they mean different things to
      // somebody reading the receipt: one says "this is as light as it goes",
      // the other says "this is as much as this exercise should ever do".
      if (role) {
        blocked.push({
          name: ex.name,
          reason: direction === 'lighter' && current <= getRoleSetFloor(role)
            ? 'at the minimum'
            : 'at the maximum for its role',
        })
      }
      return ex
    }
    return { ...ex, sets: clamped }
  })

  let candidate: WorkoutDay = { ...day, exercises: next }

  // THE TIME BUDGET, and only when going UP. Adding sets that push a
  // 45-minute session past its own maximum is not a favour — the person told
  // the app how long they have. Going DOWN never needs this check, and
  // applying it there would refuse to shorten an already-overrunning day.
  // estimateDaySeconds parses each exercise's `rest` string, and throws on a
  // slot that has none. A day the app generated always has one — but a volume
  // change is not the place to discover otherwise, and refusing to add sets
  // is the safe direction when the length cannot be established.
  const overBudget = (() => {
    try { return estimateDaySeconds(candidate) > maxSeconds } catch { return true }
  })()
  if (direction === 'heavier' && overBudget) {
    candidate = day
    for (const ex of day.exercises) {
      if (!blocked.some(b => b.name === ex.name)) blocked.push({ name: ex.name, reason: 'no room in the session' })
    }
  }

  const setsAfter = candidate.exercises.reduce((n, ex) => n + (ex.sets ?? 0), 0)
  return { day: candidate, changed: setsAfter !== setsBefore, setsBefore, setsAfter, blocked }
}

/**
 * The sentence shown on the receipt. Says the real numbers, and names what
 * did not move — a change that quietly did half of what it said is the defect
 * this whole area exists to avoid.
 */
export function describeVolumeChange(result: VolumeAdjustResult, dayName: string): string {
  if (!result.changed) {
    const why = result.blocked[0]?.reason ?? 'nothing could move'
    return `${dayName} is already where it should be — every exercise is ${why}.`
  }
  const base = `${dayName} goes from ${result.setsBefore} sets to ${result.setsAfter}.`
  if (result.blocked.length === 0) return base
  const n = result.blocked.length
  return `${base} ${n} ${n === 1 ? 'exercise was' : 'exercises were'} left alone — ${result.blocked[0].reason}.`
}

/** Deload weeks are already reduced on purpose; changing their volume fights the plan. */
export function isVolumeAdjustable(week: { is_deload?: boolean } | undefined): boolean {
  return !week?.is_deload
}

export { getRoleSetCeiling }
