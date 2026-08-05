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
