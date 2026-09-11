// ---------------------------------------------------------------------------
// WHAT AN EDIT COSTS THE WEEK — measured, never enforced.
//
// The passes that keep a week balanced (enforceWeeklyPatternBalance for
// push:pull and chest:back, balanceWeeklyStructure for six-pattern coverage)
// are private to exercise-plan.ts and need the candidate pool and the whole
// generation context. Re-running the generator to get them back would discard
// every other change the person has made to their plan, so an edit made from
// the app cannot re-assert them.
//
// The honest alternative, and CLAUDE.md's own rule ("when a request would
// break the bar, the app says so and offers the nearest thing that keeps
// it"): measure what those passes would have objected to, and SAY it before
// the tap. This module only reads. It never changes a plan and never refuses
// one — a person is allowed to make their week lopsided on purpose.
//
// The bands are the SCORER's, not the enforcer's (0.6–1.6 push:pull,
// quality-score.ts:967; 1.25 chest:back, exercise-plan.ts:3868). Deliberately
// the looser pair: this sentence exists to warn about a real imbalance, not to
// nag about every set that moves.
// ---------------------------------------------------------------------------
import type { MesocycleWeek, MesocycleMovementPattern } from './types'

// THE PLANNED exercise's vocabulary, not the catalogue's. `Exercise
// .movement_pattern` is a MesocycleMovementPattern — the coarse 'push' /
// 'pull' / 'hinge' / 'squat' set that mapMovementPattern
// (exercise-plan.ts:4948) collapses the catalogue's fifteen patterns into.
// Reading it as though it held 'horizontal_push' would count zero sets on
// every week and report perfect balance forever. quality-score.ts:726 does
// exactly this, for exactly this reason.
const PUSH: ReadonlySet<MesocycleMovementPattern> = new Set(['push'] as MesocycleMovementPattern[])
const PULL: ReadonlySet<MesocycleMovementPattern> = new Set(['pull'] as MesocycleMovementPattern[])

/** The scorer's band — outside this, a week reads as imbalanced. */
const PUSH_PULL_MIN = 0.6
const PUSH_PULL_MAX = 1.6

export interface WeekBalance {
  pushSets: number
  pullSets: number
  /** null when either side is zero — a ratio against nothing says nothing. */
  ratio: number | null
  inBand: boolean
}

export function weekBalance(week: MesocycleWeek | undefined): WeekBalance {
  let pushSets = 0
  let pullSets = 0
  for (const day of week?.days ?? []) {
    for (const ex of day.exercises) {
      if (ex.movement_pattern && PUSH.has(ex.movement_pattern)) pushSets += ex.sets
      if (ex.movement_pattern && PULL.has(ex.movement_pattern)) pullSets += ex.sets
    }
  }
  if (pushSets === 0 || pullSets === 0) {
    return { pushSets, pullSets, ratio: null, inBand: pushSets === 0 && pullSets === 0 }
  }
  const ratio = pushSets / pullSets
  return { pushSets, pullSets, ratio, inBand: ratio >= PUSH_PULL_MIN && ratio <= PUSH_PULL_MAX }
}

/**
 * The sentence to show before the tap, or null when there is nothing to say.
 *
 * Only speaks when the edit MOVES the week out of band, or pushes an
 * already-out-of-band week further out. A week that was lopsided before and is
 * no worse after gets silence: the person did not cause that here, and saying
 * it on every edit is how a warning becomes wallpaper.
 */
export function describeBalanceCost(
  before: MesocycleWeek | undefined,
  after: MesocycleWeek | undefined,
): string | null {
  const b = weekBalance(before)
  const a = weekBalance(after)
  if (a.ratio == null) {
    // The edit removed one whole side of the week.
    if (b.ratio != null && a.pullSets === 0) return 'That leaves nothing pulling this week — your back and biceps get no work.'
    if (b.ratio != null && a.pushSets === 0) return 'That leaves nothing pushing this week — your chest and shoulders get no work.'
    return null
  }
  if (a.inBand) return null
  const worse = b.ratio == null || !b.inBand ? Math.abs(Math.log(a.ratio)) > Math.abs(Math.log(b.ratio ?? 1)) : true
  if (!worse) return null
  const heavy = a.ratio > PUSH_PULL_MAX ? 'push-heavy' : 'pull-heavy'
  return `That leaves your week ${heavy} — ${a.pushSets} pushing sets to ${a.pullSets} pulling. Still fine to do; worth balancing later.`
}
