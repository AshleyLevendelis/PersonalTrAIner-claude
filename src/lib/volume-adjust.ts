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
import { estimateDaySeconds, getSessionMaximumSeconds, yieldFillerTo, isMovementPrepRow } from './session-duration'
import type { WorkoutDay, Exercise, UserProfile } from './types'

export type VolumeDirection = 'lighter' | 'heavier'

export interface VolumeAdjustResult {
  day: WorkoutDay
  /** True when at least one exercise actually moved. */
  changed: boolean
  setsBefore: number
  setsAfter: number
  /** Exercises that could not move because a bound stopped them — named so the receipt can say so. */
  blocked: { name: string; reason: 'at the minimum' | 'down to one set' | 'at the maximum for its role' | 'no room in the session' | 'not one the app knows' }[]
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
    if (isMovementPrepRow(ex)) return ex
    const wanted = direction === 'lighter' ? current - 1 : current + 1
    // A NAME THE CATALOGUE CANNOT RESOLVE has no role to bound it, so it is left alone, and SAID (the lead's review:
    // stepping it silently, or skipping it silently, both left the receipt wrong about what moved).
    if (!role) { blocked.push({ name: ex.name, reason: 'not one the app knows' }); return ex }
    // ONE STEP, THE RIGHT WAY (28 Nov 2026, found by fix 7): a day already under its role's floor (a step under it,
    // below) was clamped back UP by a "lighter" step, and a "heavier" one jumped it to the floor in one go. Lighter
    // never adds a set; heavier adds one at most, and still brings a count over its role's ceiling back inside it.
    const bounded = clampToVolumeRole(wanted, role, isLongSession)
    const clamped = direction === 'lighter' ? Math.min(current, bounded) : Math.min(bounded, current + 1)

    if (clamped === current) {
      // Distinguish the two reasons, because they mean different things to
      // somebody reading the receipt: one says "this is as light as it goes",
      // the other says "this is as much as this exercise should ever do".
      blocked.push({
        name: ex.name,
        reason: direction === 'lighter' && current <= getRoleSetFloor(role)
          ? 'at the minimum'
          : 'at the maximum for its role',
      })
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

/**
 * Whether a LASTING ("from now on") volume change reaches this week. Deload weeks are reduced on purpose, and a standing
 * change does not cancel the planned recovery week. A change for ONE DAY in a deload goes through
 * adjustDayVolumeAdvised instead, which says so and does it (advise, then allow, fix 7).
 */
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
}

/** MOVEMENT PREP IS NOT VOLUME (CSCS, mine): a warm-up move is never stepped, either way. One definition app-wide. */
const isMovementPrep = isMovementPrepRow

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
  opts: { deload: boolean; sayDay: string; scope: 'today' | 'ongoing' },
): AdvisedVolumeChange {
  const advice: string[] = []
  if (opts.deload) {
    advice.push(direction === 'lighter'
      ? "This is already a lighter week, built to let you recover. Easing off more is fine if you're run down."
      : "This is a lighter week on purpose, so you recover before the next block. Adding sets back cuts into that; fine if you feel fresh, but the next block may feel harder.")
  }
  const result = adjustDayVolume(day, direction, profile)
  // UNDER THE FLOOR IS A ONE-DAY ANSWER ONLY: a lasting change below the plan's own floor would be the habit the
  // advice itself warns against, so the ongoing scope stops at the floor as it always did.
  if (result.changed || direction === 'heavier' || opts.scope !== 'today') return { result, advice }

  // At (or already under) the floor: one set off every training exercise holding more than one.
  // Training work the app knows: warm-up moves are never stepped, and a name it cannot resolve is left alone here as
  // in the ordinary step (and named), so the two steps cannot treat one exercise differently.
  const roleOf = (ex: Exercise) => { const e = getExerciseEntry(ex.name); return e ? getVolumeRole(e) : null }
  const steppable = (ex: Exercise) => !isMovementPrep(ex) && roleOf(ex) !== null
  const training = day.exercises.filter(steppable)
  const unknown = day.exercises.filter(ex => !isMovementPrep(ex) && roleOf(ex) === null)
  const exercises = day.exercises.map(ex => (steppable(ex) && (ex.sets ?? 0) > 1 ? { ...ex, sets: (ex.sets ?? 0) - 1 } : ex))
  const under: WorkoutDay = { ...day, exercises }
  const sum = (list: Exercise[]) => list.reduce((n, ex) => n + (ex.sets ?? 0), 0)
  const setsBefore = sum(day.exercises)
  const setsAfter = sum(exercises)
  if (setsAfter === setsBefore) return { result, advice }
  // THE COUNT IS OF TRAINING WORK, warm-up moves left out, and it says "under" once the day is already below the floor.
  const alreadyUnder = training.some(ex => { const r = roleOf(ex); return !!r && (ex.sets ?? 0) < getRoleSetFloor(r) })
  const count = `${sum(training)} working sets across ${training.length} exercises`
  advice.push(alreadyUnder
    ? `${opts.sayDay}'s session is already under the fewest sets the plan uses (${count}). Taking more off is fine for a day when you're run down; it trains less, so it's not one to repeat every week.`
    : `${opts.sayDay}'s session is already at the fewest sets the plan uses (${count}). Going under that is fine for a day when you're run down; it trains less, so it's not one to repeat every week.`)
  // Its own reason (the lead's review): "at the minimum" is the plan's floor; this is one set, under it.
  const left = [
    ...training.filter(ex => (ex.sets ?? 0) <= 1).map(ex => ({ name: ex.name, reason: 'down to one set' as const })),
    ...unknown.map(ex => ({ name: ex.name, reason: 'not one the app knows' as const })),
  ]
  return { result: { day: under, changed: true, setsBefore, setsAfter, blocked: left }, advice }
}
