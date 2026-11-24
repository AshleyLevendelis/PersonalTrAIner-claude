// ---------------------------------------------------------------------------
// A SHORT REST AFTER THE LAST WARM-UP, AND NONE BETWEEN THE OTHERS (24 Nov 2026).
//
// Ashley: "I noticed that warm up sets don't get rest timers. Why not?" They
// never had one, on purpose: a build-up set is followed by the next build-up,
// changing plates, not by the working rest. That is right BETWEEN warm-ups and
// wrong after the LAST one, where the next thing is the first heavy set. His
// "build it" the same day, on the shape below.
//
// CSCS basis (mine, recorded in BACKLOG): the last ramp set sits near the
// working weight, and the first working set should not be done short of breath
// from it. About a minute before ordinary work; 90 s before a main lift; two
// minutes before a heavy main lift (top of the range 6 reps or fewer), the
// load where incomplete phosphocreatine recovery costs reps. Never longer than
// the working rest the plan already prescribes for that lift.
//
// It only runs before the first working set: warm-ups logged after the work
// has started (logging late, or adding one) start nothing.
// ---------------------------------------------------------------------------

/** Seconds of rest after a warm-up set is ticked; 0 means no timer. */
export function restAfterWarmupSeconds(input: {
  /** The ticked row is the last warm-up row, the one directly above Set 1. */
  isLastWarmup: boolean
  /** Working sets of this lift already logged today. */
  workingSetsLogged: number
  /** The working rest the plan prescribes for this lift, in seconds (0 when unknown). */
  workingRestSeconds: number
  /** The day's main lift (tier 1). */
  isMainLift: boolean
  /** Top of the prescribed rep range, or null when it cannot be read. */
  repsHigh: number | null
}): number {
  if (!input.isLastWarmup || input.workingSetsLogged > 0) return 0
  const wanted = !input.isMainLift ? 60 : input.repsHigh != null && input.repsHigh <= 6 ? 120 : 90
  return input.workingRestSeconds > 0 ? Math.min(wanted, input.workingRestSeconds) : wanted
}
