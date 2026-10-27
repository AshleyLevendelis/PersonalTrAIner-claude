// ---------------------------------------------------------------------------
// WHICH ANSWERS "What happened?" OFFERS FOR A DAY — computed from the day's
// state, never a fixed list. Lifted out of WhatHappenedSheet on 9 Oct 2026 so
// a gate can ask it; the sheet draws exactly what this returns.
// ---------------------------------------------------------------------------

export type DayVerb = 'did_elsewhere' | 'missed' | 'move' | 'rest' | 'something_else' | 'shorten' | 'lighter' | 'rebuild' | 'kind'

export interface DayVerbInput {
  /** A logged day has nothing to explain. */
  isDone: boolean
  /** The plan holds a session for this date (after any move). */
  hasSession: boolean
  /** Already moved to another day — answered by its undo. */
  movedAway: boolean
  /**
   * The date is BEFORE THE PLAN BEGAN. Nothing was prescribed then, so nothing
   * can have been missed, swapped for something else, moved or rested — the
   * week strip already calls the day "before your plan started" and the streak
   * already ignores it. The tester marked such a day missed, and another
   * swapped, from this menu; the entries no longer scored (X2) but the menu
   * went on offering them. Today's plan row for that weekday is what made it
   * look like a session.
   */
  beforePlan: boolean
  isPast: boolean
  isToday: boolean
  declared: { missed: boolean; rest: boolean; swapped: boolean }
  /** The plan edits, offered only where the caller can make them. */
  canShorten: boolean
  canLighter: boolean
  canRebuild: boolean
  /** A different KIND of session today (session-kind.ts) — her 20 Oct ruling, "Drop it, today only". */
  canKind?: boolean
  /**
   * Working sets are already logged on this day (27 Oct 2026). The strip ranks logged work above every note on a
   * day, so "missed", "rest", "move" and "something else" on a part-trained day were writes the strip would never
   * show: Home said "moved" while the strip said part-done, and the day it was moved to was owed again. What still
   * applies is what acts on the rest of the session (shorten, lighter, rebuild) and, on a past day, logging the
   * rest of it.
   */
  partlyLogged?: boolean
  /**
   * The session is an activity (a walk, a planned cardio session), with no sets to log. "I did it, not in the app"
   * asks for sets, so it is not offered; logging the activity is the activity card's own job.
   */
  activityOnly?: boolean
}

/**
 * IS THERE A SESSION ON THIS DAY — exercises, OR a prescribed activity (27 Oct 2026). A walk on the starting-out
 * plan and a cardio session the coach put on a day carry no exercises, and every "is there a session?" that counted
 * exercises told her "No session was planned" on a day the strip was calling missed. types.ts says so on the field
 * itself: a reader deciding "is this a session?" must not count exercises.
 */
export function dayHasSession<T extends { exercises?: unknown[] | null; plannedActivity?: unknown }>(day: T | null | undefined): day is T {
  return !!day && ((day.exercises?.length ?? 0) > 0 || !!day.plannedActivity)
}

export function dayVerbs(d: DayVerbInput): DayVerb[] {
  if (d.isDone || !d.hasSession || d.movedAway || d.beforePlan) return []
  const out: DayVerb[] = []
  if (d.isPast && !d.activityOnly) out.push('did_elsewhere')
  if (!d.partlyLogged) {
    if ((d.isPast || d.isToday) && !d.declared.missed) out.push('missed')
    out.push('move')
    if (!d.declared.rest) out.push('rest')
    if ((d.isPast || d.isToday) && !d.declared.swapped) out.push('something_else')
  }
  // TODAY ONLY, and only while there is still a session to change. A past
  // day cannot be made shorter — it already happened — and a future one is
  // the ongoing volume change's job, not this one's. Both are also gated on
  // the caller supplying a handler, so a surface that cannot edit the plan
  // never shows a control that would do nothing.
  if (d.isToday && !d.declared.rest && !d.declared.missed && !d.declared.swapped) {
    if (d.canShorten) out.push('shorten')
    if (d.canLighter) out.push('lighter')
    // A STARTED SESSION IS NOT REDRAWN UNDERNEATH HER — the rule the different-kind tool already states and refuses
    // by ("You've already logged sets in today's session, so I'll leave it as it is"). Offering both and refusing
    // one in words was two answers; rebuilding had no refusal at all and would have dropped the lift she had
    // just logged from today's card. Shorter and lighter act on what is left, so they stay.
    if (d.canRebuild && !d.partlyLogged) out.push('rebuild')
    if (d.canKind && !d.partlyLogged) out.push('kind')
  }
  return out
}
