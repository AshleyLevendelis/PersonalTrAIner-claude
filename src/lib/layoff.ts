import { daysBetween } from './session-move'
import { loadingMode, roundToPlate } from './load-prescription'
import type { ExerciseEntry } from './exercise-db'

// ---------------------------------------------------------------------------
// COMING BACK AFTER A BREAK (8 Oct 2026; plan: docs/plans/layoff-handling.md).
//
// Ashley asked what happens when somebody stops training for days or weeks. The
// answer was: the plan keeps running by date and the first session back is
// prescribed last time's weight PLUS an increment (the last-session lookup has no
// age limit). This module is the one place that turns "how long since the last
// working session" into what the first session back does.
//
// THE BANDS ARE A CSCS JUDGEMENT, not a measurement (CLAUDE.md, her 18 Sep
// delegation). Basis, recorded in the plan and BACKLOG: trained lifters keep most
// strength for about three weeks off and lose it progressively after; they regain
// it faster than they built it; the risk on return is unaccustomed work (soreness,
// joints), not the bar weight. So: under 10 days nothing changes; 10-20 days repeat
// last time with no increase; 3-6 weeks about 90%; 6-12 weeks about 80%; 12 weeks
// or more 80% and the offer to start the plan again (her ruling B, 8 Oct 2026).
//
// TODAY-ONLY AND DERIVED. Nothing is stored: the input is the last working session
// BEFORE today, so it switches itself off the day after the first session back and
// stays on through today's own session (a set logged today does not end it mid-way).
// It never edits the plan, the week or history, and it never raises a number.
// ---------------------------------------------------------------------------

export type LayoffBand = 'none' | 'hold' | 'ease90' | 'ease80' | 'restart'

export interface LayoffStatus {
  band: LayoffBand
  /** Whole days from the last working session to today; 0 when there is none to count from. */
  daysAway: number
  /** What the first session back's weights are multiplied by (1 = unchanged). */
  factor: number
}

/** Lowest day count of each band, heaviest band last. */
const BANDS: { from: number; band: LayoffBand; factor: number }[] = [
  { from: 10, band: 'hold', factor: 1 },
  { from: 21, band: 'ease90', factor: 0.9 },
  { from: 42, band: 'ease80', factor: 0.8 },
  { from: 84, band: 'restart', factor: 0.8 },
]

export const NO_LAYOFF: LayoffStatus = { band: 'none', daysAway: 0, factor: 1 }

/**
 * The band for a gap. `lastSessionDate` is the date of the last WORKING session before
 * today (local YYYY-MM-DD), or null when nothing was ever logged — a person who has
 * never trained in the app has no break to come back from, and the plan's own
 * calibration week is what finds their weights.
 */
export function layoffStatus(lastSessionDate: string | null, today: string): LayoffStatus {
  if (!lastSessionDate) return NO_LAYOFF
  const daysAway = daysBetween(lastSessionDate, today)
  if (!Number.isFinite(daysAway) || daysAway <= 0) return NO_LAYOFF
  let hit: (typeof BANDS)[number] | null = null
  for (const b of BANDS) if (daysAway >= b.from) hit = b
  return hit ? { band: hit.band, daysAway, factor: hit.factor } : { ...NO_LAYOFF, daysAway }
}

/** True when the first session back's weights are reduced (not merely held). */
export function easesWeights(s: LayoffStatus): boolean {
  return s.factor < 1
}

/**
 * A working weight for the first session back: scaled by the band's factor, rounded to
 * something the lift can actually be loaded with, and NEVER above where it started. An
 * eased number is one the app invents, so it is plate-rounded (roundToPlate's own job);
 * the cap makes sure rounding up can never hand back more than last time.
 */
export function easeWeightKg(kg: number, s: LayoffStatus, entry: ExerciseEntry | null | undefined): number {
  if (!easesWeights(s) || !(kg > 0)) return kg
  const raw = kg * s.factor
  const rounded = entry ? roundToPlate(raw, loadingMode(entry)) : Math.round(raw * 2) / 2
  return Math.min(kg, rounded)
}

/** Added weight (a belt) for the first session back: one plate pair is 2.5kg, rounded down, never below zero. */
export function easeAddedKg(kg: number, s: LayoffStatus): number {
  if (!easesWeights(s) || !(kg > 0)) return kg
  return Math.max(0, Math.floor((kg * s.factor) / 2.5) * 2.5)
}

/**
 * What the progression engine's answer becomes on the first session back. In every band
 * the increment is gone (a session that earned one before a break is not evidence about
 * today); in the easing bands the weight is reduced from LAST time's weight, not from the
 * already-increased one.
 */
export function layoffWeightFrom(lastWeightKg: number, s: LayoffStatus, entry: ExerciseEntry | null | undefined): number {
  return s.band === 'none' ? lastWeightKg : easeWeightKg(lastWeightKg, s, entry)
}
