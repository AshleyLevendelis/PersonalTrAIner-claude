// ---------------------------------------------------------------------------
// WHAT A SESSION'S HEART RATE LOOKED LIKE (his words 26 Nov 2026, on the first watch card: "too simple, doesn't add any
// real value", with Garmin's heart-rate graph and time-in-zones and Apple's workout details beside it).
//
// Three things a summary can draw from the readings a watch wrote for a session's own time. No imports, so a card can
// use it without pulling anything else into its download.
//
//   1. THE LINE: the readings as a short series for a graph (bucketed, so a watch writing every second and one writing
//      every few minutes draw the same shape).
//   2. TIME BY EFFORT: how long the heart sat in each of the app's three effort words, Easy / Steady / Hard.
//   3. PACE: minutes a kilometre, when the watch gave a distance.
//
// WHY THREE BANDS AND NOT FIVE ZONES (CSCS, mine). Every effort in this app is Easy, Steady or Hard (his 24 Sep
// ruling), so the heart rate is sorted into the same three words he taps, not a second vocabulary. The lines are
// shares of an estimated maximum: under 70% Easy, 70% to under 85% Steady, 85% and over Hard. Those sit on the usual
// intensity bands (ACSM: moderate to about 76% of maximum, vigorous from 77%, near-maximal from the mid 90s), drawn so
// that "Easy" is the conversational pace the plan means by it and "Hard" is work he could not hold for long.
//
// THE MAXIMUM IS AN ESTIMATE, AND THE SCREEN SAYS SO: 208 minus 0.7 times age (Tanaka, Monahan and Seals 2001), raised
// to the highest reading in the session when he went above it. Its error is about ten beats either way, so the bands
// are "about". It is DESCRIPTION, after the fact: nothing here is a target, and no session is prescribed by heart
// rate (his 24 Nov ruling stands).
//
// NOT FOR EVERYONE: medication can hold a heart rate down, so with a health condition ticked, or pregnant, the bands
// are not drawn at all (his 14 Nov ruling: effort in words for them, never a heart rate). The caller decides that;
// with no age there is no estimate and no bands either.
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

const STEADY_FROM = 0.7
const HARD_FROM = 0.85
/** A reading stands for the time until the next one, but never for more than this: a gap is not effort. */
const LONGEST_HOLD_MS = 5 * 60 * 1000

export interface EffortBands { easy: number; steady: number; hard: number; /** The maximum the lines were drawn from. */ maxUsed: number }

/**
 * Minutes with the heart in each band. Null when it cannot be said honestly: no estimate, too few readings, or
 * readings covering under half the session (a watch that dropped out for most of it shows nothing rather than a
 * confident bar built from ten minutes).
 */
export function effortBands(samples: readonly HeartReading[], start: Date, end: Date, estimatedMax: number | null): EffortBands | null {
  if (estimatedMax == null) return null
  const rows = inWindow(samples, start, end)
  const span = end.getTime() - start.getTime()
  if (rows.length < 3 || !(span > 0)) return null
  const maxUsed = Math.max(estimatedMax, ...rows.map(r => r.bpm))
  const ms = { easy: 0, steady: 0, hard: 0 }
  rows.forEach((r, i) => {
    const until = i + 1 < rows.length ? rows[i + 1].ms : end.getTime()
    const held = Math.min(Math.max(0, until - r.ms), LONGEST_HOLD_MS)
    const share = r.bpm / maxUsed
    ms[share >= HARD_FROM ? 'hard' : share >= STEADY_FROM ? 'steady' : 'easy'] += held
  })
  const covered = ms.easy + ms.steady + ms.hard
  if (covered < span * 0.5) return null
  const mins = (x: number) => Math.round(x / 60000)
  return { easy: mins(ms.easy), steady: mins(ms.steady), hard: mins(ms.hard), maxUsed }
}

/** "8:05" for minutes a kilometre, or null when there is no distance to divide by (or the answer is not a pace). */
export function pacePerKm(minutes: number, km: number | null | undefined): string | null {
  if (!(minutes > 0) || !(Number(km) > 0)) return null
  const secs = Math.round((minutes * 60) / Number(km))
  // Slower than half an hour a kilometre or faster than two minutes is a bad distance, not a pace.
  if (secs < 120 || secs > 1800) return null
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

/** The band the heart spent longest in, or null with no bands. A tie goes to the easier word (never overstated). */
export function mostlyBand(b: EffortBands | null): 'easy' | 'steady' | 'hard' | null {
  if (!b || b.easy + b.steady + b.hard <= 0) return null
  if (b.easy >= b.steady && b.easy >= b.hard) return 'easy'
  return b.steady >= b.hard ? 'steady' : 'hard'
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
