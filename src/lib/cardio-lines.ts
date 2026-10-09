// ---------------------------------------------------------------------------
// A CARDIO LOG, AS THE LINE EVERY SCREEN SHOWS FOR IT — H7 / H21 / M14,
// 9 Oct 2026.
//
// The READER is cardio-log-store's `readCardioLogs`: one function for every
// surface that shows cardio. This is what those surfaces do with a row once
// they have it — the same three small decisions, made once:
//
//   - what a log reads as            "Brisk walk · 30 min · Easy"
//   - which logs a planned row keeps, and which are "something else I did"
//   - what a day replaced by another activity says it was replaced by
//
// Each was already written once, inside the rest-day card and the planned
// cardio row. The training day, the finish card, session history, Home and the
// programme view had none of them, which is how a saved log came to appear
// nowhere. They are lifted here rather than re-derived so that the six
// surfaces cannot give six answers.
//
// A LEAF: types and the effort phrasebook only, so Home can import it without
// pulling the exercise screens into first paint.
// ---------------------------------------------------------------------------
import { cardioReadback } from './cardio-effort'
import type { CardioLog } from './types'

/**
 * "Rowing Intervals — 6 rounds of 20s hard / 40s easy" → the name and the
 * protocol. An en/em dash or a spaced hyphen, because the catalogue uses more
 * than one. (Moved here from CardioSetRow, which re-exports it.)
 */
export function splitActivity(activity: string): { name: string; protocol: string | null } {
  const m = /^(.*?)\s+[—–-]\s+(.+)$/.exec(activity.trim())
  return m ? { name: m[1], protocol: m[2] } : { name: activity.trim(), protocol: null }
}

type Loggish = Pick<CardioLog, 'activity_name' | 'duration_minutes' | 'intensity_rpe'>

/** One log as its line. The short name: a protocol is an instruction for doing it, not a record of having done it. */
export function cardioLine(log: Loggish): string {
  return cardioReadback({ activity: splitActivity(log.activity_name).name, minutes: log.duration_minutes, rpe: log.intensity_rpe })
}

/**
 * THE LOGS NO PLANNED ROW HAS CLAIMED — what a day lists as "something else I
 * did".
 *
 * A planned row (the finisher, the optional close-out, the walk that IS the
 * day) reads itself back by its plan's own activity string, and takes the
 * FIRST log with that name. So each planned name claims exactly one log here
 * too: a second walk on a walking day is still shown, and a finisher is never
 * drawn twice — once in its own row and once as a receipt under it.
 */
export function unclaimedCardio<T extends { activity_name: string }>(logs: readonly T[], claimed: readonly (string | null | undefined)[]): T[] {
  // The first match per name, exactly as PlannedCardioRow takes it — two rows
  // that prescribe the same activity both read back the same log, so they
  // claim the same one here and a second log is still shown.
  const taken = new Set(claimed.map(name => (name ? logs.find(l => l.activity_name === name) : undefined)))
  return logs.filter(l => !taken.has(l))
}

/**
 * WHAT A SWAPPED DAY WAS SWAPPED FOR, with its minutes and effort when the
 * person gave them: "Football · 60 min · Hard". Just the name when they did
 * not — the app never invents a duration — and null on a day that was not
 * swapped at all.
 */
export function swappedActivityLine(activity: string | null | undefined, dayLogs: readonly Loggish[]): string | null {
  const name = activity?.trim()
  if (!name) return null
  const log = dayLogs.find(l => l.activity_name.trim().toLowerCase() === name.toLowerCase())
  return log ? cardioLine(log) : name
}
