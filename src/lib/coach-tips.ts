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
