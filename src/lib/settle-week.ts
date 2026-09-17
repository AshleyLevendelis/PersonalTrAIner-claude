import type { Exercise, MesocycleWeek, UserProfile } from './types'
import {
  enforceSetHierarchy,
  enforceLoadCoherence,
  enforceOneWeightPerPrescription,
  settleWeekBalance,
  type BalanceSettlement,
} from './exercise-plan'
import { rebuildWarmup } from './warmup'

// ---------------------------------------------------------------------------
// WHAT MUST HOLD AFTER ANY EDIT — one tail, every path.
//
// Ashley's first promise is one sentence and it contains a conjunction:
// plans "which can be adjusted to fit the user's needs WHILE STILL AIMING TO
// KEEP THE QUALITY". Adjustment and quality are one thing, not two. A change
// path that skips the checks generation runs is a defect, not a shortcut —
// CLAUDE.md's rule 3.
//
// This lived inside session-edit.ts and exactly one caller used it. Measured
// 13 Sep 2026, the other in-place edits ran:
//
//   swap                 nothing — and applyReplacement CLEARS the lift's ramp
//                        (mesocycle-edit.ts:243) with nothing to rebuild it, so
//                        a swapped day shipped ramp-less until the next full
//                        regeneration. Named as the next job in BACKLOG's
//                        11 Sep entry and left open since.
//   ban                  nothing
//   move within a day    the warm-up only — despite the must-have list saying
//                        it re-ran the three coherence passes
//   volume up/down       nothing, while changing the very set counts
//                        enforceSetHierarchy exists to police
//
// So it moved here and they all call it. One tail means one order, and the
// order is generation's own.
//
// WHY A DAY NAME AND A WHOLE WEEK. Two of the passes are WEEK rules, not day
// rules — one weight per prescription spans the week, and load coherence's
// fourth clamp does too. The day name says which day changed shape; the week
// is what the rules actually read.
// ---------------------------------------------------------------------------

/**
 * THE SHARED TAIL. Everything that must hold after a day's exercise list
 * changes shape, applied to one week in the order generation applies it
 * (exercise-plan.ts:6904 / :6908 / :6909).
 *
 * The warm-up rebuild is the part a swap never got: buildWarmup derives the
 * session's preparation FROM its exercises, and nothing re-derived it after an
 * edit, so a day whose squat was swapped out kept ramping for a squat.
 * Removing an exercise makes that worse — an orphan ramp for a lift that is no
 * longer there. Rebuilt here, and each surviving exercise's own `ramp_up`
 * re-stamped from it.
 */
export interface SettledWeek {
  week: MesocycleWeek
  /**
   * What the week-level balance pass moved on OTHER days, so the confirm card
   * can say it before the tap. Ashley's ruling, 13 Sep 2026: a change to one
   * day may touch another day to keep the week balanced, and the app says so.
   */
  balance: BalanceSettlement
}

export { rebuildWarmup }

export function settleWeek(week: MesocycleWeek, dayName: string, profile: UserProfile): SettledWeek {
  // EVERY DAY IS COPIED FIRST, INCLUDING THE ONES NOT BEING EDITED.
  //
  // The three passes below mutate in place — that is their contract, and it is
  // how generation uses them. Handing them the caller's own day objects makes
  // this function write through to the plan it was given, which is a quiet
  // disaster on the path that matters most: every confirm card runs the real
  // edit as a TRIAL against the live plan to work out what to say. A trial
  // that mutates its subject corrupts the plan before the person has tapped
  // anything, and makes the before/after diff compare an object with itself,
  // so the card then says nothing was affected.
  //
  // FOUND 13 Sep 2026 by a check that would not go green: the balancing
  // reported no changes on days it had visibly changed. The sharing itself
  // pre-dates today — one-weight-per-prescription and load coherence have
  // always mutated through — but they only write when they find something
  // wrong, so on a healthy plan it almost never showed. The week-level balance
  // pass touches other days as a matter of routine, which is what made it
  // visible.
  const days = week.days.map(d => ({
    ...d,
    exercises: (d.day === dayName
      ? enforceSetHierarchy(clearOrphanedSupersetLabels(d.exercises))
      : d.exercises
    ).map(e => ({ ...e })),
  }))

  // Both of these take the whole week and mutate in place — the week's other
  // days are part of what they check (one weight per prescription is a WEEK
  // rule, and load coherence's fourth clamp spans the week too).
  enforceOneWeightPerPrescription(days)
  enforceLoadCoherence(days)

  const settled: MesocycleWeek = {
    ...week,
    days: days.map(d => (d.day === dayName ? rebuildWarmup(d, profile) : d)),
  }

  // LAST, exactly as generation runs it — after the day's own passes and after
  // the warm-up exists, because the safety trim inside it prices the session
  // including its warm-up. It is also the only pass here that may change a day
  // OTHER than the one edited, which is why it returns what it did.
  const balance = settleWeekBalance(settled, profile)
  return { week: settled, balance }
}

/** A superset pair with one side removed/changed is no longer a pair — clears the label on whichever side is now alone rather than leaving it pointing at a partner that no longer matches. */
export function clearOrphanedSupersetLabels(exercises: Exercise[]): Exercise[] {
  const letterCounts = new Map<string, number>()
  for (const ex of exercises) {
    if (!ex.superset_label) continue
    const letter = ex.superset_label[0]
    letterCounts.set(letter, (letterCounts.get(letter) ?? 0) + 1)
  }
  return exercises.map(ex => {
    if (!ex.superset_label) return ex
    const letter = ex.superset_label[0]
    if ((letterCounts.get(letter) ?? 0) < 2) return { ...ex, superset_label: undefined, rest: ex.rest === 'alternate' ? '60s' : ex.rest }
    return ex
  })
}
