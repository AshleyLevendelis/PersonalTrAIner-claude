// ---------------------------------------------------------------------------
// A MISSED DAY SAYS SO, WITH THE COACH'S THREE CHOICES (run 7, 15 Oct 2026, M52).
//
// Sam missed Monday and Tuesday. The strip drew a small warning dot (gone the moment the day was tapped), and
// the day itself showed its planned session exactly like one still to come. The coach, meanwhile, says "it
// didn't happen — run it today, mark it missed, or was it a rest day?". This is the screen's half of the same
// three, decided here so a gate can ask it.
//
// "Do it today" goes through the move resolver every other move uses, so it obeys the same rule: a session
// runs on a day that is free. When today already has its own session the choice becomes the next free day in
// that training week (decided as a CSCS coach: two full sessions stacked in one day is not "catching up", it
// is a worse version of both). With no free day left, it says so and offers nothing it cannot do.
// ---------------------------------------------------------------------------
import { resolveMoveTarget, type SessionMove } from './session-move'
import type { WorkoutDay } from './types'
import type { TrainingWeekDay } from '@/hooks/useTrainingWeek'

export type MissedRunIt =
  | { kind: 'move'; date: string; dayName: string; isToday: boolean; remapFrom?: string }
  | { kind: 'none'; message: string }

export interface MissedDayView {
  /** The sentence at the top of the day. */
  lead: string
  runIt: MissedRunIt
  /** "Mark it missed" is offered only until she has said it. */
  canMark: boolean
}

export function missedDayView(input: {
  cell: TrainingWeekDay
  today: string
  plan: WorkoutDay[]
  weekOf: (date: string) => number
  moves: SessionMove[]
}): MissedDayView | null {
  const { cell, today, plan, weekOf, moves } = input
  if (cell.state !== 'missed') return null
  const what = cell.session?.focus ? `${cell.dayName}'s ${cell.session.focus}` : `${cell.dayName}'s session`
  const lead = cell.markedMissed ? `You marked ${what} as missed.` : `${what} didn't happen.`
  const r = resolveMoveTarget({ fromDate: cell.date, requestedDate: today, todayDate: today, plan, weekOf, existing: moves })
  const runIt: MissedRunIt = r.ok
    ? { kind: 'move', date: r.date, dayName: r.dayName, isToday: r.date === today, remapFrom: r.remapFrom }
    : { kind: 'none', message: r.message }
  return { lead, runIt, canMark: !cell.markedMissed }
}

/** The first button's words: today when today is free, else the day it would actually go to. */
export function runItLabel(runIt: Extract<MissedRunIt, { kind: 'move' }>): string {
  return runIt.isToday ? 'Do it today' : `Do it ${runIt.dayName}`
}
