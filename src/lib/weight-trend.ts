// ---------------------------------------------------------------------------
// VISION-ARCHITECTURE.md §5.4 — "7-day rolling average with direction and
// rate... never a raw daily reading as the headline... honest empty state
// until enough weigh-ins exist." Pure function — the caller (dashboard-
// data.ts) fetches daily_metrics history and an optional body_weight_kg
// goal; this only does the math.
// ---------------------------------------------------------------------------

export interface WeighIn {
  /** YYYY-MM-DD */
  date: string
  weightKg: number
}

export interface WeightTrendResult {
  /** Mean of weigh-ins within the last 7 days. */
  rollingAvgKg: number
  /** How many weigh-ins fed the rolling average — surfaced so the UI can caveat a thin sample (e.g. 1-2 entries) without hiding it outright. */
  sampleCount: number
  /** Change in rolling average vs the PRIOR 7-day window, per week. Null when there's no prior window to compare against (fewer than 8 days of history) — a single week of data has a level, not yet a rate. */
  ratePerWeekKg: number | null
  /** Null when there's no body_weight_kg goal, or no rate yet to judge against one. */
  onTrackForGoal: boolean | null
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86_400_000)
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length
}

/**
 * `weighIns` may be in any order and may contain duplicate dates (a
 * same-day correction) — the LAST entry per date wins, matching
 * daily_metrics' own upsert-on-(profile_id,date) semantics.
 * `todayStr` anchors the two 7-day windows.
 */
export function computeWeightTrend(
  weighIns: WeighIn[],
  todayStr: string,
  goal: { targetKg: number; baselineKg: number } | null,
): WeightTrendResult | null {
  const byDate = new Map<string, number>()
  for (const w of weighIns) byDate.set(w.date, w.weightKg)
  const entries = [...byDate.entries()].map(([date, weightKg]) => ({ date, weightKg }))
  if (entries.length === 0) return null

  const last7 = entries.filter(e => { const d = daysBetween(todayStr, e.date); return d >= 0 && d <= 6 })
  if (last7.length === 0) return null // no weigh-in in the last week — honest empty state, not a stale number

  const rollingAvgKg = mean(last7.map(e => e.weightKg))

  const prev7 = entries.filter(e => { const d = daysBetween(todayStr, e.date); return d >= 7 && d <= 13 })
  const ratePerWeekKg = prev7.length > 0 ? rollingAvgKg - mean(prev7.map(e => e.weightKg)) : null

  let onTrackForGoal: boolean | null = null
  if (goal && ratePerWeekKg != null && Math.abs(ratePerWeekKg) >= 0.05) {
    const goalDirection = Math.sign(goal.targetKg - goal.baselineKg) // negative = trying to lose, positive = trying to gain
    const actualDirection = Math.sign(ratePerWeekKg)
    onTrackForGoal = goalDirection !== 0 && goalDirection === actualDirection
  }

  return { rollingAvgKg, sampleCount: last7.length, ratePerWeekKg, onTrackForGoal }
}

const oneDecimal = (n: number) => Math.round(n * 10) / 10

/**
 * The line under the weigh-in box: what the targets follow, and how much is
 * behind the average quoted.
 *
 * It said "Targets recalculate from your latest weigh-in · 7-day avg 62 kg"
 * (test log, 9 Oct 2026). Both halves were untrue: targets follow the 7-day
 * AVERAGE and only when it has moved a kilo, and that "7-day avg" was the mean
 * of however many rows existed — one. So the first half states the rule, and
 * the second calls the figure an average of N weigh-ins until there are three.
 * Same trend the targets are computed from, so the two cannot disagree.
 */
export function weighInAverageLine(trend: WeightTrendResult | null): string {
  const rule = 'Targets follow your 7-day average'
  if (!trend) return rule
  const avg = `${oneDecimal(trend.rollingAvgKg)} kg`
  return trend.sampleCount >= 3
    ? `${rule} · 7-day avg ${avg}`
    : `${rule} · avg of ${trend.sampleCount} weigh-in${trend.sampleCount === 1 ? '' : 's'} ${avg}`
}

/**
 * Kilograms gained or lost SINCE THE STARTING WEIGHT, or null when there is
 * nothing honest to show.
 *
 * Home said "-0.2 kg since week 1" for someone 1.0 kg down (test log L31): it
 * subtracted the first of the last 14 weigh-in rows. Two things were wrong.
 * The sign-up weight is stored as a weigh-in dated that day, so a weigh-in the
 * same day REPLACES it and the start is gone from the series; and after
 * fourteen weigh-ins "the first" is fourteen entries ago, not the start. The
 * starting weight is its own fact (the weight given at sign-up) and is passed
 * in. `weighIns` is oldest first.
 *
 * Null when only the sign-up weight exists — "0.0 kg since you started" on
 * day one is noise, not progress.
 */
export function changeSinceStart(startKg: number | null | undefined, weighIns: readonly { kg: number }[]): number | null {
  if (startKg == null || !Number.isFinite(startKg) || weighIns.length === 0) return null
  const latest = weighIns[weighIns.length - 1].kg
  if (weighIns.length === 1 && latest === startKg) return null
  // To the one decimal the screen prints, and never "-0.0".
  const change = oneDecimal(latest - startKg)
  return change === 0 ? 0 : change
}
