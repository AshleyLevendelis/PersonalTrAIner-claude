import type { MesocycleWeek, WorkoutDay } from './types'

// ---------------------------------------------------------------------------
// THE WEEK DELTA CHIP — one line saying why this week differs from the last.
//
// Ashley, 1 Sep 2026: the first version compared set counts and nothing
// else, so it read "+0 sets vs last week" on three weeks out of every four
// (volume holds flat inside a block while LOAD ramps) and "+27 sets vs last
// week" on the first week of a block — because the week before it was a
// deload, a deliberately easy week, so a normal week next to it looks like
// an explosion.
//
// Her ruling: say "Same sets, heavier weights". TWO THINGS FOLLOW, and the
// second is why this is a module with a test rather than a ternary:
//
//   1. "Heavier weights" is a CLAIM ABOUT THE PLAN, so it is measured, never
//      assumed. Not every goal ramps load — a reps-emphasis or bodyweight
//      block deliberately holds weight flat and climbs reps, and telling
//      that trainee their weights got heavier would be a plain untruth on
//      the one line whose whole job is explaining the week. Load is compared
//      across the exercises the two weeks SHARE; reps are the fallback
//      reading; when neither moved there is no chip rather than a hollow one.
//   2. A block's first week is compared against the last week that was not a
//      deload, and SAYS SO ("vs W7", not "vs last week"), because a
//      comparison the label misdescribes is worse than no comparison.
// ---------------------------------------------------------------------------

export interface WeekDelta {
  text: string
  /** Deload weeks render in --role-warn; everything else in --primary. */
  warn: boolean
}

const daySets = (d: WorkoutDay): number => d.exercises.reduce((s, ex) => s + ex.sets, 0)

export function weekSetTotal(week: Pick<MesocycleWeek, 'days'>): number {
  return week.days.reduce((s, d) => s + daySets(d), 0)
}

/** Midpoint of a rep prescription ('9-11' -> 10, '8' -> 8); null when it isn't a rep count. */
function repMidpoint(reps: string): number | null {
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(reps.trim())
  if (range) return (parseInt(range[1], 10) + parseInt(range[2], 10)) / 2
  const single = /^(\d+)$/.exec(reps.trim())
  return single ? parseInt(single[1], 10) : null
}

/**
 * How the two weeks differ on the exercises they SHARE, compared PER
 * EXERCISE rather than as weekly tonnage.
 *
 * The distinction is the whole correctness of the chip, and the gate caught
 * me getting it wrong: the first version summed load x sets, so a bodyweight
 * plan reported "heavier weights" when the backpack had stayed at 8kg all
 * along and the only change was Loaded Backpack Walk appearing on two days
 * instead of one. Tonnage answers "how much work", which the set count
 * already covers. "Heavier weights" is a claim about the number on the
 * implement, so it is read off the implement.
 *
 * Comparing only the shared movements matters too: two weeks in different
 * blocks hold different exercises, and comparing all of them would report a
 * change at every block boundary that is really just a change of programme.
 */
function sharedMovement(
  a: Pick<MesocycleWeek, 'days'>,
  b: Pick<MesocycleWeek, 'days'>,
): { heavier: number; lighter: number; moreReps: number; fewerReps: number } {
  // The working weight and rep target for a movement in a week — the
  // heaviest entry, when a movement appears on more than one day.
  const index = (w: Pick<MesocycleWeek, 'days'>) => {
    const m = new Map<string, { load: number | null; reps: number | null }>()
    for (const d of w.days) {
      for (const ex of d.exercises) {
        const prev = m.get(ex.name)
        const load = ex.suggested_load_kg ?? null
        const reps = repMidpoint(ex.reps)
        m.set(ex.name, {
          load: load == null ? (prev?.load ?? null) : Math.max(load, prev?.load ?? load),
          reps: reps == null ? (prev?.reps ?? null) : Math.max(reps, prev?.reps ?? reps),
        })
      }
    }
    return m
  }
  const ai = index(a)
  const bi = index(b)
  let heavier = 0, lighter = 0, moreReps = 0, fewerReps = 0
  for (const [name, av] of ai) {
    const bv = bi.get(name)
    if (!bv) continue
    if (av.load != null && bv.load != null) {
      if (av.load > bv.load) heavier++
      else if (av.load < bv.load) lighter++
    }
    if (av.reps != null && bv.reps != null) {
      if (av.reps > bv.reps) moreReps++
      else if (av.reps < bv.reps) fewerReps++
    }
  }
  return { heavier, lighter, moreReps, fewerReps }
}

/**
 * @param week      the week being browsed
 * @param earlier   every week before it, in any order — the comparison week is
 *                  chosen from these (the previous week, or the most recent
 *                  non-deload one when the previous is a deload)
 */
export function weekDelta(
  week: Pick<MesocycleWeek, 'days' | 'week_number' | 'is_deload'>,
  earlier: Pick<MesocycleWeek, 'days' | 'week_number' | 'is_deload'>[],
): WeekDelta | null {
  const before = earlier
    .filter(w => w.week_number < week.week_number)
    .sort((a, b) => b.week_number - a.week_number)
  if (before.length === 0) return null

  const previous = before[0]
  const sets = weekSetTotal(week)

  // A deload is measured against the week it is stepping down FROM, which is
  // always the one immediately before it.
  if (week.is_deload) {
    const prevSets = weekSetTotal(previous)
    const pct = prevSets > 0 ? Math.round((1 - sets / prevSets) * 100) : 0
    return {
      text: pct > 0 ? `Deload · ${pct}% fewer sets than W${previous.week_number}` : 'Deload · lighter on purpose',
      warn: true,
    }
  }

  // Everything else is measured against the last week that was real training.
  const comparison = before.find(w => !w.is_deload) ?? previous
  const label = comparison.week_number === week.week_number - 1
    ? 'vs last week'
    : `vs W${comparison.week_number}`

  const delta = sets - weekSetTotal(comparison)
  if (delta !== 0) return { text: `${delta > 0 ? '+' : ''}${delta} sets ${label}`, warn: false }

  // Volume held. Say what DID move — and only when it moved one way. A week
  // where some lifts went up and others came down has no honest one-liner,
  // so it gets no chip rather than a cherry-picked one.
  const { heavier, lighter, moreReps, fewerReps } = sharedMovement(week, comparison)
  if (heavier > 0 && lighter === 0) return { text: `Same sets, heavier weights ${label}`, warn: false }
  if (moreReps > 0 && fewerReps === 0) return { text: `Same weights, more reps ${label}`, warn: false }
  return null
}
