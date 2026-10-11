// ---------------------------------------------------------------------------
// "TRAIN ANYWAY" ON A REST DAY — run 5 of the live test, 11 Oct 2026 (M45).
//
// Two defects on one control:
//
// 1. THE CHOICE WAS A BARE DAY NAME, days already trained included. "Tuesday"
//    says nothing about what Tuesday holds, and offering a session she did on
//    Tuesday is offering the same work twice in a week. Each option now
//    carries the session's name ("Tuesday · Pull & Hinge") and a day already
//    trained this week is left out — read off the week's own day states, the
//    ones the strip draws.
//
// 2. THE BORROW LIVED IN COMPONENT STATE, and the Exercise tab is not kept
//    mounted. Leave the tab and come back, and today was a rest day again with
//    the sets she had just logged nowhere on screen. It is remembered here, on
//    this phone, for TODAY'S DATE only: a borrow is "today only" by its own
//    label, so a new day starts clean without anyone clearing it.
//
// Local, not a column, for the reason shop-day-store gives: a device
// preference of this size does not earn a migration. Every read and write is
// guarded — a blocked storage loses the memory, never the screen.
// ---------------------------------------------------------------------------
import type { WorkoutDay } from './types'

const key = (profileId: string, date: string) => `fitplan_borrowed_day_v1:${profileId}:${date}`

/** The weekday whose session today borrowed, or null. */
export function readBorrowedDay(profileId: string | undefined, date: string | undefined): string | null {
  if (!profileId || !date) return null
  try {
    const v = localStorage.getItem(key(profileId, date))
    return v && v.trim() ? v : null
  } catch { return null }
}

/** Remember (or, with null, forget) the borrow for that date. */
export function writeBorrowedDay(profileId: string | undefined, date: string | undefined, dayName: string | null): void {
  if (!profileId || !date) return
  try {
    if (dayName) localStorage.setItem(key(profileId, date), dayName)
    else localStorage.removeItem(key(profileId, date))
  } catch { /* storage blocked — the borrow lasts as long as the screen does */ }
}

export interface TrainAnywayOption {
  /** The plan row's weekday — what the borrow is keyed by. */
  day: string
  /** "Tuesday · Pull & Hinge". */
  label: string
}

/** A day state that means the session was trained (done, or started and closed short). */
const TRAINED = new Set(['done', 'partial'])

/**
 * The sessions today may borrow: the live week's training days other than
 * today, each with its name, leaving out every session already trained this
 * week — trained on its own day, on the day it was moved to (the cell then
 * holds that session), or borrowed onto an earlier rest day (remembered by
 * `borrowedOn`).
 */
export function trainAnywayOptions(input: {
  plan: WorkoutDay[]
  todayName: string
  /** The week's days as the strip has them: weekday, state, and the session run there. */
  week: { date: string; dayName: string; state: string; session?: WorkoutDay | null }[]
  /** The borrow remembered for a date, if any. */
  borrowedOn?: (date: string) => string | null
}): TrainAnywayOption[] {
  const trained = new Set<string>()
  for (const cell of input.week) {
    if (!TRAINED.has(cell.state)) continue
    const borrowed = input.borrowedOn?.(cell.date) ?? null
    trained.add(cell.session?.day ?? borrowed ?? cell.dayName)
  }
  return input.plan
    .filter(d => d.exercises.length > 0 && d.day !== input.todayName && !trained.has(d.day))
    .map(d => ({ day: d.day, label: d.focus ? `${d.day} · ${d.focus}` : d.day }))
}
