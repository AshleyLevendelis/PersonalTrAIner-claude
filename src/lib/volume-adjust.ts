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
import { estimateDaySeconds, getSessionMaximumSeconds, yieldFillerTo } from './session-duration'
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
    // MOVEMENT PREP IS NOT VOLUME (28 Nov 2026, CSCS, mine; found by fix 7's floor check): a warm-up move has no
    // role, so nothing bounded it and "make it easier" took a one-set primer to NO sets, a row of zero on the card.
    // A tired day still needs its warm-up, and a harder one does not need a longer one: it is left alone both ways.
    if (!role) return ex
    const wanted = direction === 'lighter' ? current - 1 : current + 1
    // LIGHTER NEVER ADDS A SET (28 Nov 2026, found by fix 7): a day already under its role's floor (a step under it,
    // below) was clamped back UP by a "lighter" step. Heavier keeps its clamp as it was, which also brings a count
    // over its role's ceiling back inside it.
    const bounded = clampToVolumeRole(wanted, role, isLongSession)
    const clamped = direction === 'lighter' ? Math.min(current, bounded) : bounded

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
  // Optional filler yields to real work first (yieldFillerTo): "no room in
  // the session" is only true once the padding has already gone.
  const overBudget = (() => {
    try {
      if (direction === 'heavier') candidate = yieldFillerTo(candidate, maxSeconds)
      return estimateDaySeconds(candidate) > maxSeconds
    } catch { return true }
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

// ---------------------------------------------------------------------------
// ADVISE, THEN ALLOW (his ruling 28 Nov 2026, fix 7 of docs/plans/advise-then-allow.md): a lighter day in a deload
// week, a lighter day already at the plan's set floor, and a heavier day in a deload are DONE, with the reason said
// first. None of the four hard stops is involved: weights never move here, so the load ceilings cannot be reached.
//
// CSCS, mine, the basis: the role floors (main 3, accessory 2, conditioning 4) are what a GENERATED session needs to
// train each exercise over a block; one session under them is a deliberate dip for fatigue, which a coach gives on a
// bad day, so below the floor the step is one set off every exercise holding more than one, never under one set (an
// exercise with no sets is a removal, which has its own road). A deload is already reduced on purpose: easing it
// further serves its job (recovery); adding sets back cuts into it, so it is said, then done, one set at a time.
// The floors themselves are unchanged for generation and for every ordinary step (question 4 of the review).
// ---------------------------------------------------------------------------

export interface AdvisedVolumeChange {
  result: VolumeAdjustResult
  /** The reasons, said before the change: empty when the step is an ordinary one. */
  advice: string[]
  /** True when the plan's own floor was gone under, so the caller can mark it. */
  belowFloor: boolean
}

const totalSets = (d: WorkoutDay) => d.exercises.reduce((n, ex) => n + (ex.sets ?? 0), 0)

/**
 * One step lighter or heavier, past the limits that used to refuse, with the advice for each. `deload` is the week's
 * own flag; `sayDay` is the day as he sees it ("Today", "Thursday"). The caller shows `advice` before the tap.
 * `result.changed` is false only when nothing can move at all (every exercise at one set, or a heavier step the
 * session's own time or the role ceilings stop): a no-op, never a refusal of something possible.
 */
export function adjustDayVolumeAdvised(
  day: WorkoutDay,
  direction: VolumeDirection,
  profile: UserProfile,
  opts: { deload: boolean; sayDay: string },
): AdvisedVolumeChange {
  const advice: string[] = []
  if (opts.deload) {
    advice.push(direction === 'lighter'
      ? "This is already a lighter week, built to let you recover. Easing off more is fine if you're run down."
      : "This is a lighter week on purpose, so you recover before the next block. Adding sets back cuts into that; fine if you feel fresh, but the next block may feel harder.")
  }
  const result = adjustDayVolume(day, direction, profile)
  if (result.changed || direction === 'heavier') return { result, advice, belowFloor: false }

  // At the floor: one set off every exercise holding more than one.
  const hasRole = (ex: Exercise) => { const entry = getExerciseEntry(ex.name); return !!entry && getVolumeRole(entry) !== null }
  const exercises = day.exercises.map(ex => (hasRole(ex) && (ex.sets ?? 0) > 1 ? { ...ex, sets: (ex.sets ?? 0) - 1 } : ex))
  const under: WorkoutDay = { ...day, exercises }
  const setsBefore = totalSets(day)
  const setsAfter = totalSets(under)
  if (setsAfter === setsBefore) return { result, advice, belowFloor: false }
  advice.push(`${opts.sayDay}'s session is already at the fewest sets the plan uses (${setsBefore} across ${day.exercises.length} exercises). Going under that is fine for a day when you're run down; it trains less, so it's not one to repeat every week.`)
  return { result: { day: under, changed: true, setsBefore, setsAfter, blocked: [] }, advice, belowFloor: true }
}
