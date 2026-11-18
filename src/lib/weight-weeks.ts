// ---------------------------------------------------------------------------
// WEIGHT, WEEK BY WEEK (his request 18 Nov 2026, from another app's screen: "Add all three"). A weigh-in history read
// as weeks: each week's average and how it moved from the week before, the days under it, and the points a graph
// needs (every weigh-in, and one weekly-average point per week). A week is Monday to Sunday, the app's one rule for
// "a week" (his 15 Oct ruling). Pure and date-string based (no instants, so no clock-change day is lost).
// ---------------------------------------------------------------------------

export interface WeighInPoint { date: string; kg: number }

export interface WeightWeek {
  /** The Monday, YYYY-MM-DD. */
  start: string
  /** The Sunday. */
  end: string
  /** Mean of the weigh-ins inside the week, to two decimals. */
  avgKg: number
  /** This week's average less the week before's, to two decimals; null for the first week or after a week with none. */
  changeKg: number | null
  /** The week's weigh-ins, newest first. */
  days: WeighInPoint[]
}

export type WeightRange = '3M' | '6M' | '1Y'
export const WEIGHT_RANGE_DAYS: Record<WeightRange, number> = { '3M': 91, '6M': 182, '1Y': 365 }

const ms = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
export function shiftDate(d: string, days: number): string { return iso(ms(d) + days * 86_400_000) }
/** The Monday on or before a date. */
export function mondayOf(d: string): string { const dow = new Date(ms(d)).getUTCDay(); return shiftDate(d, -((dow + 6) % 7)) }
const r2 = (n: number) => Math.round(n * 100) / 100

/** One weigh-in a day (the last one given for a date wins), inside [from, to], oldest first. */
export function cleanWeighIns(raw: readonly WeighInPoint[], from: string, to: string): WeighInPoint[] {
  const byDate = new Map<string, number>()
  for (const w of raw) if (w && /^\d{4}-\d{2}-\d{2}$/.test(w.date) && Number.isFinite(w.kg) && w.kg > 0 && w.date >= from && w.date <= to) byDate.set(w.date, w.kg)
  return [...byDate.entries()].map(([date, kg]) => ({ date, kg })).sort((a, b) => a.date.localeCompare(b.date))
}

/** The weeks that hold a weigh-in, newest first; a week's change is against the calendar week just before it. */
export function weightWeeks(points: readonly WeighInPoint[]): WeightWeek[] {
  const byWeek = new Map<string, WeighInPoint[]>()
  for (const p of points) { const k = mondayOf(p.date); byWeek.set(k, [...(byWeek.get(k) ?? []), p]) }
  const avgOf = (k: string) => { const ds = byWeek.get(k); return ds ? ds.reduce((s, p) => s + p.kg, 0) / ds.length : null }
  return [...byWeek.keys()].sort().reverse().map(start => {
    const avg = avgOf(start)!
    const prev = avgOf(shiftDate(start, -7))
    return {
      start, end: shiftDate(start, 6), avgKg: r2(avg),
      changeKg: prev == null ? null : r2(avg - prev),
      days: [...byWeek.get(start)!].sort((a, b) => b.date.localeCompare(a.date)),
    }
  })
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** "Sep" for any date in September. Written out, never the browser's words (one browser says "Sept"). */
export function monthShort(d: string): string { return MONTHS[+d.slice(5, 7) - 1] }

/** "9-15 Nov", or "28 Oct - 3 Nov" across a month. */
export function weekLabel(start: string, end: string): string {
  const day = (d: string) => String(+d.slice(8, 10))
  return monthShort(start) === monthShort(end) ? `${day(start)}-${day(end)} ${monthShort(end)}` : `${day(start)} ${monthShort(start)} - ${day(end)} ${monthShort(end)}`
}

/** "Sat, 14 Nov". */
export function dayLabel(d: string): string {
  return `${WEEKDAYS[new Date(ms(d)).getUTCDay()]}, ${+d.slice(8, 10)} ${monthShort(d)}`
}

/** "0.39 kg ↓", "0.43 kg ↑", "no change"; null when there is nothing to compare. */
export function changeLabel(changeKg: number | null): string | null {
  if (changeKg == null) return null
  if (Math.abs(changeKg) < 0.005) return 'no change'
  return `${Math.abs(changeKg).toFixed(2)} kg ${changeKg < 0 ? '↓' : '↑'}`
}
