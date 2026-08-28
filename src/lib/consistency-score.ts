// ---------------------------------------------------------------------------
// A consistency score — and the name is the point.
//
// Ashley asked for a "Readiness or Recovery Score ... combining workout
// consistency, sleep/rest days, and nutrition compliance". Two of those three
// are real. THE APP HAS NEVER ASKED HOW ANYONE SLEPT: the only sleep signal
// that exists is `recovery_capacity`, one self-reported answer at onboarding
// ("Poor sleep, high stress" / "Decent sleep most nights") that never changes
// again. A daily-adapting readiness score built on it would be two-thirds
// measured and one-third invented — and the invented third is exactly what
// makes it a READINESS score rather than a consistency one.
//
// That distinction is not pedantry here. A readiness number tells someone
// whether to train hard today. This codebase already carries a whole round of
// work (the assumed-body fix) that exists because the app was quietly filling
// in a measurement nobody gave it.
//
// So: consistency, named for what it measures, from things the app genuinely
// knows. Ashley's call when the choice was put to her.
//
// SAME DOCTRINE AS coach-tips.ts: if there is nothing true to say, say
// nothing. A score with no components returns null rather than 0%, because a
// zero would read as "you have been terrible this week" to someone whose plan
// simply has not scheduled anything yet.
// ---------------------------------------------------------------------------

export interface ConsistencyComponent {
  /** Shown to the user — plain words, not a field name. */
  label: string
  done: number
  outOf: number
}

export interface ConsistencyScore {
  /** 0-100, rounded. The average of each component's ratio, not of the raw counts — three sessions out of three and one protein day out of six should not let the sessions drown out the protein. */
  percent: number
  components: ConsistencyComponent[]
}

/**
 * WATER IS DELIBERATELY ABSENT. It is a fair component and the app has the
 * data — but only for TODAY without seven more reads, and dashboard-data.ts
 * carries an explicit read-cost discipline ("fetch once per mount"). A
 * one-day component sitting beside two week-long ones would also be quietly
 * mis-weighted. Better absent and explained than present and wrong.
 */
export function computeConsistency(components: ConsistencyComponent[]): ConsistencyScore | null {
  const usable = components.filter(c => c.outOf > 0)
  if (usable.length === 0) return null
  const percent = Math.round(
    (usable.reduce((sum, c) => sum + Math.min(1, c.done / c.outOf), 0) / usable.length) * 100,
  )
  return { percent, components: usable }
}
