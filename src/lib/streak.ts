// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §5.1/§5.3 — streak, defined exactly per spec: "a
// day counts if any set or cardio was logged; rest days are transparent
// (they neither count nor break); the streak breaks on a scheduled
// training day with nothing logged; one make-up token per plan week."
//
// Pure function — no I/O. The caller assembles StreakDayInput[] from
// existing sources (exercise_set_logs/cardio_logs for `logged`, the
// current mesocycle's day-of-week pattern for `scheduled`) and a
// per-date plan-week resolver for the make-up-token bucket; nothing here
// is a new source of truth.
//
// Scope decision (documented): the vision doc's full spec freezes
// "was this day scheduled" per-session (a `was_scheduled` column on
// workout_sessions) so a later plan edit can't retroactively rewrite
// streak history. That freeze isn't built this round (see the dashboard
// migration's own comment) — `scheduled` here is resolved against the
// CURRENT mesocycle's day-of-week pattern for every historical date,
// which the vision doc itself names as the known limitation of this
// simpler approach ("a plan change retroactively rewrites history").
// make-up-token buckets key on planWeekOf(date) — the actual plan week
// via getActiveMesocycleWeek, not ISO week, per the vision doc's explicit
// "must key on the plan week... or they straddle plan boundaries" rule.
// ---------------------------------------------------------------------------

export interface StreakDayInput {
  /** YYYY-MM-DD, local calendar date. */
  date: string
  /** Was this date a scheduled training day per the (current) mesocycle's day-of-week pattern? */
  scheduled: boolean
  /** Was any set or cardio session logged on this date? */
  logged: boolean
  /** The plan week this date falls in (getActiveMesocycleWeek(planCreatedAt, date, totalWeeks)) — used only to bucket the one-make-up-token-per-plan-week rule. */
  planWeek: number
}

export interface StreakResult {
  /** Consecutive count ending at the most recent day in the input, per the spec above. */
  currentStreak: number
  /** True if the walk stopped because a scheduled day was missed with no make-up token left for that plan week. */
  brokenByMissedDay: boolean
}

/**
 * `days` must be ordered oldest-first, ending on the most recent day to
 * count. Walks BACKWARD from the end so "current streak" always means
 * "the run ending most-recently", matching how a user reads a streak —
 * not the longest run anywhere in the window.
 *
 * Caller's responsibility, not this function's: if TODAY is a scheduled
 * day the user hasn't logged yet, the day isn't over — that's "not done
 * YET", not a miss. Omit today from `days` entirely in that case (the
 * dashboard shows today's own not-started/in-progress/done status
 * separately); only include today once it's either logged or the day
 * has genuinely passed with nothing logged.
 */
export function computeStreak(days: StreakDayInput[]): StreakResult {
  const usedMakeUpToken = new Set<number>()
  let streak = 0
  let brokenByMissedDay = false

  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i]
    if (!day.scheduled) {
      // Rest day — transparent. Neither counts nor breaks; walk continues.
      continue
    }
    if (day.logged) {
      streak++
      continue
    }
    // Scheduled and nothing logged — a miss. One make-up token per plan
    // week: the FIRST such miss encountered for a given plan week (walking
    // backward, so this is the most RECENT miss in that week) is forgiven
    // — the streak continues past it without incrementing. A second miss
    // in the same plan week breaks the streak.
    if (!usedMakeUpToken.has(day.planWeek)) {
      usedMakeUpToken.add(day.planWeek)
      continue
    }
    brokenByMissedDay = true
    break
  }

  return { currentStreak: streak, brokenByMissedDay }
}
