// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §5 — "one specific, data-derived observation per
// day... If nothing specific and true can be said, show nothing — never
// generic wellness filler." Deterministic rule set, no AI call (cost,
// latency, reliability) — exactly like plan-signals.ts was meant to be for
// the (out-of-scope-this-round) recommendations row.
//
// Pure function — no I/O. The caller (dashboard-data.ts) assembles
// CoachTipContext from existing sources (meal_events for protein
// adherence, known_*_kg + PR cache for lift progress, exercise_set_logs
// for session pace, daily_metrics + goals for weight trend) and passes it
// in; nothing here is a new source of truth, and nothing here decides
// what's true — it only decides, among the rules that ARE true today,
// which ONE to show.
// ---------------------------------------------------------------------------

import { seededRngFromKey } from './seeded-random'

export interface CoachTipContext {
  /** YYYY-MM-DD, used only to seed rotation — never a data source itself. */
  today: string
  /** Consecutive days (most recent first, not including an in-progress today) the user hit their protein target. 0 if unknown/broken/insufficient data. */
  proteinAdherenceStreakDays: number
  /** Positive kg deltas from onboarding's known_*_kg baseline to the current PR-cache max, for squat/bench/deadlift only (the only lifts with a real baseline to compare against). */
  knownLiftProgress: { name: string; deltaKg: number }[]
  /** Distinct trained dates so far in the current plan week vs the same span (same number of days into the week) last plan week. */
  sessionsThisWeekSoFar: number
  sessionsLastWeekSameSpan: number
  /** Scheduled training days so far this plan week (up to and including today, only counting days that have passed or today if already logged) and how many of those were actually trained. */
  scheduledSoFarThisWeek: number
  loggedOfScheduledSoFarThisWeek: number
  /** null when there's not enough weigh-in history for a rolling trend yet. */
  weightTrend: { ratePerWeekKg: number; towardGoal: boolean | null } | null
  /** PRs set within the last 7 days, from the PR cache. */
  recentPRs: { exerciseName: string; weightKg: number }[]
  /**
   * Water so far today and the day's target, plus the LOCAL hour — the only
   * time-of-day-sensitive rule here, and the reason the hour is passed in
   * rather than read: this file is a pure function and `new Date()` inside it
   * would make the same context produce different answers at different times,
   * which is untestable and unseeded.
   */
  waterMl: number
  waterTargetMl: number
  /** 0-23, local. */
  hourOfDay: number
}

interface Rule {
  key: string
  evaluate: (ctx: CoachTipContext) => string | null
}

const RULES: Rule[] = [
  {
    key: 'protein_streak',
    evaluate: ctx => (ctx.proteinAdherenceStreakDays >= 3
      ? `You've hit your protein target ${ctx.proteinAdherenceStreakDays} days running.`
      : null),
  },
  {
    key: 'lift_progress',
    evaluate: ctx => {
      const best = [...ctx.knownLiftProgress].sort((a, b) => b.deltaKg - a.deltaKg)[0]
      if (!best || best.deltaKg <= 0) return null
      return `${best.name} has moved ${best.deltaKg}kg since you started.`
    },
  },
  {
    key: 'session_pace',
    evaluate: ctx => {
      if (ctx.sessionsThisWeekSoFar === 0) return null
      if (ctx.sessionsThisWeekSoFar > ctx.sessionsLastWeekSameSpan) {
        return `${ordinal(ctx.sessionsThisWeekSoFar)} session this week — you're ahead of your usual pace.`
      }
      return null
    },
  },
  {
    key: 'weight_trend',
    evaluate: ctx => {
      if (!ctx.weightTrend) return null
      const { ratePerWeekKg, towardGoal } = ctx.weightTrend
      if (Math.abs(ratePerWeekKg) < 0.05) return null // flat — nothing specific to say
      const direction = ratePerWeekKg < 0 ? 'down' : 'up'
      const rate = Math.abs(ratePerWeekKg).toFixed(1)
      if (towardGoal === true) return `Weight trending ${direction} ${rate}kg/week — on track for your target.`
      if (towardGoal === false) return `Weight trending ${direction} ${rate}kg/week — slower than your target pace.`
      return `Weight trending ${direction} ${rate}kg/week.`
    },
  },
  {
    key: 'recent_pr',
    evaluate: ctx => {
      if (ctx.recentPRs.length === 0) return null
      const pr = ctx.recentPRs[0]
      return `New PR this week: ${pr.exerciseName} at ${pr.weightKg}kg.`
    },
  },
  {
    // ASHLEY'S OWN EXAMPLE: "You're 1,200 ml behind on water target for 12 PM."
    // It is arithmetic on a target the app set and a log the user made, so it
    // is a thing the app genuinely knows — unlike the energy/readiness line
    // beside it in the same request, which would have needed sleep data that
    // is never collected.
    //
    // PRO-RATA AGAINST A WAKING DAY, not the whole 24 hours: nobody drinks
    // at 3am, so measuring against midnight would call everyone behind every
    // morning. 08:00-22:00 is the window; before it starts there is nothing
    // to be behind on.
    //
    // The 60% threshold and the 250ml floor exist so this stays a nudge. Off
    // pace by a mouthful at 8:05 is not an observation worth spending the
    // day's one line on, and a rule that fires constantly is the "generic
    // wellness filler" this file's header rules out in a different costume.
    //
    // It joins the same seeded rotation as everything else rather than
    // jumping the queue. Being behind on water does not outrank a new PR,
    // and a rule that always won would be a daily nag.
    key: 'water_pace',
    evaluate: ctx => {
      const START = 8, END = 22
      // EVERY INPUT CHECKED FOR BEING A NUMBER AT ALL, not just for its value.
      // Written as `ctx.waterTargetMl <= 0`, this rule ran on a context that
      // carried no water fields — `undefined <= 0` is false, so it fell
      // through to the arithmetic and produced "You're about NaNml behind on
      // water for this time of day." A NaN in a sentence shown to a user, from
      // a rule whose entire job is to say only true things. Caught by the
      // existing coach-tip gate ("zero supporting data anywhere -> null"),
      // which is precisely what that check is for.
      const { waterMl, waterTargetMl, hourOfDay } = ctx
      if (![waterMl, waterTargetMl, hourOfDay].every(n => typeof n === 'number' && Number.isFinite(n))) return null
      if (waterTargetMl <= 0) return null
      if (hourOfDay < START + 2 || hourOfDay > END) return null
      const elapsed = Math.min(hourOfDay - START, END - START)
      const expected = waterTargetMl * (elapsed / (END - START))
      if (waterMl >= expected * 0.6) return null
      const behind = Math.round((expected - waterMl) / 50) * 50
      if (behind < 250) return null
      return `You're about ${behind}ml behind on water for this time of day.`
    },
  },
  {
    key: 'perfect_adherence',
    evaluate: ctx => {
      if (ctx.scheduledSoFarThisWeek === 0) return null
      if (ctx.loggedOfScheduledSoFarThisWeek === ctx.scheduledSoFarThisWeek && ctx.scheduledSoFarThisWeek >= 2) {
        return `Every planned session this week, done — ${ctx.scheduledSoFarThisWeek} for ${ctx.scheduledSoFarThisWeek}.`
      }
      return null
    },
  },
]

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/**
 * Evaluates every rule, then picks ONE among whichever are true today —
 * deterministically seeded by date, so the same day always shows the same
 * tip (stable across a re-render/reload) but different days rotate rather
 * than always favoring the first rule in the list. Returns null (render
 * nothing) when no rule has anything true and specific to say — never a
 * generic fallback message.
 */
export function selectCoachTip(ctx: CoachTipContext): string | null {
  const eligible = RULES.map(r => r.evaluate(ctx)).filter((s): s is string => s !== null)
  if (eligible.length === 0) return null
  const rng = seededRngFromKey(`coach-tip:${ctx.today}`)
  const index = Math.floor(rng() * eligible.length)
  return eligible[index]
}
