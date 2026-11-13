// ---------------------------------------------------------------------------
// WEEKLY CONSISTENCY, IN PLACE OF THE STREAK — his ruling of 13 Nov 2026 ("Replace", confirmed after being told it
// reverses his 17 Oct "12 in a row" pill), from his strategy of that day (docs/plans/coach-rhythm.md §2a). A broken
// streak pushes people away; a count of weeks keeps the motivating part and never shows a broken run.
//
// A WEEK IS ON PLAN when at least three quarters of its planned sessions are done, rounded up (2 of 2, 3 of 3, 3 of 4,
// 4 of 5, 5 of 6). CSCS basis (BACKLOG): the dose that matters is weekly, and the twice-a-week-per-muscle frequency the
// plans are built on survives one missed session in four or more; one missed of two or three halves the week.
// Planned rest and moved sessions never count against a week (tallyWeek already leaves them out), a week with nothing
// planned (or before the plan began) is not counted either way, and the week still running is never judged.
// ---------------------------------------------------------------------------

/** How many of a week's planned sessions make it a week on plan. */
export function sessionsForOnPlan(planned: number): number {
  return Math.ceil(planned * 0.75)
}

export function weekIsOnPlan(done: number, planned: number): boolean {
  return planned > 0 && done >= sessionsForOnPlan(planned)
}

/** How far back the count looks: the last 12 finished weeks, the strategy's "9 of the last 12 weeks on plan". */
export const WEEKS_LOOKED_BACK = 12

export interface WeeksOnPlan {
  /** Finished weeks that were on plan. */
  onPlan: number
  /** Finished weeks that had something planned, up to 12. 0 means nothing to show yet. */
  of: number
}

/**
 * From each finished week's tally, newest first (the week still running is NOT passed). Weeks with nothing planned are
 * skipped, never counted as off plan.
 */
export function weeksOnPlan(finishedWeeks: { sessionsDone: number; sessionsPlanned: number }[]): WeeksOnPlan {
  const counted = finishedWeeks.filter(w => w.sessionsPlanned > 0).slice(0, WEEKS_LOOKED_BACK)
  return { onPlan: counted.filter(w => weekIsOnPlan(w.sessionsDone, w.sessionsPlanned)).length, of: counted.length }
}
