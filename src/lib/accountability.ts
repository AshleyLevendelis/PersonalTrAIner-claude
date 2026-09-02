// ---------------------------------------------------------------------------
// ACCOUNTABILITY CHECK-INS (chat round 2)
// ---------------------------------------------------------------------------
// "The coach has the data and doesn't use it to hold the user to anything."
// This picks AT MOST ONE check-in per conversation from real logged numbers,
// and returns null when nothing is genuinely worth saying.
//
// Deterministic on purpose, exactly like coach-tips.ts: the model is never
// asked to decide *whether* there's something to notice — if it were, it
// would invent one. It receives either a single concrete string (which it may
// re-word but not re-number) or nothing at all. That is what makes
// "specific-or-silent" structural rather than a prompt instruction the model
// can drift off.
//
// Ordering is by how ACTIONABLE the thing is to the person right now, not by
// how alarming it sounds — a missed session changes what they do today; a
// stale weigh-in mostly changes what the app can tell them later. One
// positive (a genuinely strong week) sits high enough that a consistent user
// isn't only ever met with shortfalls.
//
// Pure, sync, no I/O — same shape as streak.ts / coach-tips.ts.
// ---------------------------------------------------------------------------

export interface AccountabilityInput {
  /** Local hour 0-23. Macro/water shortfalls are meaningless before the day is mostly done. */
  hour: number
  proteinEaten: number
  proteinTarget: number
  caloriesEaten: number
  caloriesTarget: number
  waterMl: number
  waterTargetMl: number
  /** Consecutive-day training streak (streak.ts). */
  streak: number
  /** Days since the most recent weigh-in; null when they've never logged one. */
  daysSinceWeighIn: number | null
  /** True when today has a scheduled session and nothing has been logged for it yet. */
  sessionDueUnlogged: boolean
  /**
   * Yesterday's session, when it was scheduled and nothing was logged,
   * swapped or rested on purpose — from the week strip's own 'missed' state
   * (coach-opener.ts, missedYesterdayFrom), so this can never disagree with
   * the strip. Null on every other kind of yesterday.
   */
  missedYesterday?: { dayName: string; focus: string } | null
  /** Sets logged today, when a session is part-done (used for the stall case). */
  setsLoggedToday: number
  setsPlannedToday: number
  /** From weight-trend.ts — false only when there IS a goal and they're moving away from it. */
  onTrackForGoal: boolean | null
}

/** Below this fraction of target, a shortfall is worth mentioning; above it, it's noise. */
const SHORTFALL_FRACTION = 0.7
/** A weigh-in older than this is stale enough that the trend line stops meaning much. */
const STALE_WEIGH_IN_DAYS = 10
/** Only surface macro/water shortfalls once the day is genuinely nearly over. */
const EVENING_HOUR = 17

/**
 * Returns one check-in sentence, or null when the data supports nothing
 * specific. The string is written as an observation, NOT as finished coach
 * prose — the model re-words it in its own voice (it may not change the
 * numbers). Kept plain so a re-wording can't accidentally invert the meaning.
 */
export function pickAccountabilityCheckIn(input: AccountabilityInput): string | null {
  const {
    hour, proteinEaten, proteinTarget, caloriesEaten, caloriesTarget,
    waterMl, waterTargetMl, streak, daysSinceWeighIn, sessionDueUnlogged,
    setsLoggedToday, setsPlannedToday, onTrackForGoal, missedYesterday,
  } = input

  // 1. A session that's part-done and stopped. The most actionable thing
  //    there is — they're mid-workout right now.
  if (setsPlannedToday > 0 && setsLoggedToday > 0 && setsLoggedToday < setsPlannedToday) {
    return `They're part-way through today's session — ${setsLoggedToday} of ${setsPlannedToday} sets logged, and it's stalled there.`
  }

  // 2. Yesterday was scheduled and nothing happened — not logged, not
  //    swapped, not rested on purpose. Ranked above today's own unlogged
  //    session because it is the more actionable of the two: it changes what
  //    they do today (run it, or let it go), where "today's is still
  //    unlogged" only becomes a fact worth saying in the evening. The prompt's
  //    own rule for a miss applies — acknowledge, no drama, then the useful
  //    part — and the tools to act on it (propose_rest_day for a date,
  //    or simply training today) already exist.
  if (missedYesterday) {
    return `Yesterday's ${missedYesterday.focus} (${missedYesterday.dayName}) was scheduled and nothing was logged — they did not say they rested or swapped it either.`
  }

  // 3. Today's session scheduled and untouched, late enough that it matters.
  if (sessionDueUnlogged && hour >= EVENING_HOUR) {
    return `Today's session is scheduled and still unlogged.`
  }

  // 4. A genuinely strong run, acknowledged plainly. Sits above the
  //    shortfalls deliberately — a consistent person shouldn't only ever
  //    hear about what's missing. The streak IS the "strong week" signal;
  //    there's no separate sessions-done-this-week source wired into chat,
  //    and inventing a second one would just be a number that could disagree
  //    with the dashboard's.
  if (streak >= 5) {
    return `They're on a ${streak}-day streak.`
  }

  // 5. Protein — the macro that actually changes outcomes, so it outranks calories.
  if (hour >= EVENING_HOUR && proteinTarget > 0 && proteinEaten < proteinTarget * SHORTFALL_FRACTION) {
    const short = Math.round(proteinTarget - proteinEaten)
    return `They're ${short}g short of their protein target for today.`
  }

  // 6. Drifting away from a stated goal. Only fires when weight-trend.ts has
  //    enough weigh-ins to have computed a real direction.
  if (onTrackForGoal === false) {
    return `Their weight trend is currently moving away from their stated goal.`
  }

  // 7. Calories materially under, evening only.
  if (hour >= EVENING_HOUR && caloriesTarget > 0 && caloriesEaten < caloriesTarget * SHORTFALL_FRACTION) {
    const short = Math.round(caloriesTarget - caloriesEaten)
    return `They're about ${short} kcal under target for today.`
  }

  // 8. Water, evening only.
  if (hour >= EVENING_HOUR && waterTargetMl > 0 && waterMl < waterTargetMl * SHORTFALL_FRACTION) {
    const shortMl = Math.round(waterTargetMl - waterMl)
    return `They're ${shortMl}ml short on water today.`
  }

  // 9. Stale weigh-in — lowest priority: it limits what the app can tell
  //    them, but it doesn't change today.
  if (daysSinceWeighIn != null && daysSinceWeighIn >= STALE_WEIGH_IN_DAYS) {
    return `It's been ${daysSinceWeighIn} days since their last weigh-in.`
  }

  return null
}
