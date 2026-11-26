// ---------------------------------------------------------------------------
// WHAT A SESSION'S HEART RATE LOOKED LIKE (his words 26 Nov 2026, on the first watch card: "too simple, doesn't add any
// real value", with Garmin's heart-rate graph and time-in-zones and Apple's workout details beside it).
//
// Three things a summary can draw from the readings a watch wrote for a session's own time. No imports, so a card can
// use it without pulling anything else into its download.
//
//   1. THE LINE: the readings as a short series for a graph (bucketed, so a watch writing every second and one writing
//      every few minutes draw the same shape).
//   2. TIME IN ZONES: how long the heart sat in each of five heart rate zones (below).
//   3. PACE: minutes a kilometre, when the watch gave a distance.
//
// THE MAXIMUM IS AN ESTIMATE, AND THE SCREEN SAYS SO: 208 minus 0.7 times age (Tanaka, Monahan and Seals 2001), raised
// to the highest reading in the session when he went above it. its error is about ten beats either way, so the zones
// are "about". It is DESCRIPTION, after the fact: nothing here is a target, and no session is prescribed by heart
// rate (his 24 Nov ruling stands).
//
// NOT FOR EVERYONE: medication can hold a heart rate down, so with a health condition ticked, or pregnant, the zones
// are not drawn at all (his 14 Nov ruling: effort in words for them, never a heart rate). The caller decides that;
// with no age there is no estimate and no zones either.
// ---------------------------------------------------------------------------

export interface HeartReading { bpm: number; at: string }
export interface SeriesPoint { /** 0 at the start of the session, 1 at its end. */ t: number; bpm: number }

const believable = (bpm: number) => Number.isFinite(bpm) && bpm >= 30 && bpm <= 230

/** The readings inside the window, oldest first, unbelievable ones dropped. */
function inWindow(samples: readonly HeartReading[], start: Date, end: Date): { ms: number; bpm: number }[] {
  const a = start.getTime(), b = end.getTime()
  return samples
    .map(s => ({ ms: Date.parse(s.at), bpm: s.bpm }))
    .filter(s => Number.isFinite(s.ms) && s.ms >= a && s.ms <= b && believable(s.bpm))
    .sort((x, y) => x.ms - y.ms)
}

/** A graph needs a shape, not every beat: at most `maxPoints` points, each the average of its slice of the session. */
export function heartSeries(samples: readonly HeartReading[], start: Date, end: Date, maxPoints = 60): SeriesPoint[] {
  const span = end.getTime() - start.getTime()
  const rows = inWindow(samples, start, end)
  if (!(span > 0) || rows.length < 3) return []
  const buckets: { sum: number; n: number }[] = Array.from({ length: maxPoints }, () => ({ sum: 0, n: 0 }))
  for (const r of rows) {
    const i = Math.min(maxPoints - 1, Math.floor(((r.ms - start.getTime()) / span) * maxPoints))
    buckets[i].sum += r.bpm; buckets[i].n++
  }
  return buckets
    .map((b, i) => (b.n ? { t: (i + 0.5) / maxPoints, bpm: Math.round(b.sum / b.n) } : null))
    .filter((p): p is SeriesPoint => p !== null)
}

/** The lowest and highest reading of the session itself (the true readings, not the graph's averaged points). */
export function heartRange(samples: readonly HeartReading[], start: Date, end: Date): { low: number; high: number } | null {
  const rows = inWindow(samples, start, end)
  if (rows.length < 3) return null
  return { low: Math.round(Math.min(...rows.map(r => r.bpm))), high: Math.round(Math.max(...rows.map(r => r.bpm))) }
}

/** Tanaka's estimate of maximum heart rate, or null with no usable age. */
export function estimatedMaxHeartRate(age: number | null | undefined): number | null {
  const a = Number(age)
  if (!(a >= 13 && a <= 100)) return null
  return Math.round(208 - 0.7 * a)
}

// ---------------------------------------------------------------------------
// FIVE HEART RATE ZONES (his ruling 26 Nov 2026, "heart rate zones is better than the 3 options for effort", on the
// first version's Easy / Steady / Hard bands; it REPLACES them on the summary). Each zone is a tenth of his estimated
// maximum, the split every watch uses, so the numbers match what his watch shows: zone 1 under 60%, zone 2 60-70%,
// zone 3 70-80%, zone 4 80-90%, zone 5 90% and over. Each carries the app's own effort word beside its number (CSCS,
// mine), so a zone reads against the plan, which prescribes effort in words: zones 1 and 2 are Easy, 3 is Steady,
// 4 and 5 are Hard. Zones DESCRIBE a finished session. Nothing is prescribed by zone or by heart rate (his 24 Nov
// ruling stands for what the plan and the coach ask of him).
// ---------------------------------------------------------------------------
export const ZONES = [
  { zone: 1, from: 0, word: 'Very easy', effort: 'easy' },
  { zone: 2, from: 0.6, word: 'Easy', effort: 'easy' },
  { zone: 3, from: 0.7, word: 'Steady', effort: 'steady' },
  { zone: 4, from: 0.8, word: 'Hard', effort: 'hard' },
  { zone: 5, from: 0.9, word: 'All out', effort: 'hard' },
] as const
/** A reading stands for the time until the next one, but never for more than this: a gap is not effort. */
const LONGEST_HOLD_MS = 5 * 60 * 1000

/** Which zone (1 to 5) a heart rate sits in, against a maximum. */
export function zoneOf(bpm: number, max: number): 1 | 2 | 3 | 4 | 5 {
  const share = bpm / max
  let z: 1 | 2 | 3 | 4 | 5 = 1
  for (const def of ZONES) if (share >= def.from) z = def.zone
  return z
}

export interface HeartZones {
  /** Minutes in zones 1 to 5, in that order. */
  minutes: [number, number, number, number, number]
  /** The lowest heart rate of each zone, in beats; zone 1 has none (everything under zone 2). */
  floors: [number, number, number, number, number]
  /** The maximum the zones were drawn from. */
  maxUsed: number
}

/**
 * Minutes with the heart in each zone. Null when it cannot be said honestly: no estimate, too few readings, or
 * readings covering under half the session (a watch that dropped out for most of it shows nothing rather than a
 * confident chart built from ten minutes).
 */
export function heartZones(samples: readonly HeartReading[], start: Date, end: Date, estimatedMax: number | null): HeartZones | null {
  if (estimatedMax == null) return null
  const rows = inWindow(samples, start, end)
  const span = end.getTime() - start.getTime()
  if (rows.length < 3 || !(span > 0)) return null
  const maxUsed = Math.max(estimatedMax, ...rows.map(r => r.bpm))
  const ms = [0, 0, 0, 0, 0]
  rows.forEach((r, i) => {
    const until = i + 1 < rows.length ? rows[i + 1].ms : end.getTime()
    ms[zoneOf(r.bpm, maxUsed) - 1] += Math.min(Math.max(0, until - r.ms), LONGEST_HOLD_MS)
  })
  if (ms.reduce((a, b) => a + b, 0) < span * 0.5) return null
  const mins = (x: number) => Math.round(x / 60000)
  // A session too short for any zone to reach a minute has nothing to chart: five rows of "0 min" say nothing.
  if (ms.every(x => mins(x) === 0)) return null
  return {
    minutes: [mins(ms[0]), mins(ms[1]), mins(ms[2]), mins(ms[3]), mins(ms[4])],
    floors: [0, Math.ceil(maxUsed * 0.6), Math.ceil(maxUsed * 0.7), Math.ceil(maxUsed * 0.8), Math.ceil(maxUsed * 0.9)],
    maxUsed,
  }
}

/** The zone the heart spent longest in, or null with none. A tie goes to the lower zone (never overstated). */
export function mostlyZone(z: HeartZones | null): 1 | 2 | 3 | 4 | 5 | null {
  if (!z || z.minutes.every(m => m <= 0)) return null
  let best = 0
  z.minutes.forEach((m, i) => { if (m > z.minutes[best]) best = i })
  return (best + 1) as 1 | 2 | 3 | 4 | 5
}

/** "8:05" for minutes a kilometre, or null when there is no distance to divide by (or the answer is not a pace). */
export function pacePerKm(minutes: number, km: number | null | undefined): string | null {
  if (!(minutes > 0) || !(Number(km) > 0)) return null
  const secs = Math.round((minutes * 60) / Number(km))
  // Slower than half an hour a kilometre or faster than two minutes is a bad distance, not a pace.
  if (secs < 120 || secs > 1800) return null
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

/**
 * Every row full: tiles go three to a row, and what is left over goes two to a row (or one across), never a lone tile
 * beside two empty spaces. Returned as each tile's width out of six.
 */
export function rowSpans(count: number): number[] {
  const rows: number[] = []
  let left = count
  while (left > 0) {
    const take = left === 1 ? 1 : left === 2 || left === 4 ? 2 : 3
    rows.push(take); left -= take
  }
  return rows.flatMap(n => Array.from({ length: n }, () => 6 / n))
}
