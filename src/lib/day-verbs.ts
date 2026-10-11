// ---------------------------------------------------------------------------
// WHICH ANSWERS "What happened?" OFFERS FOR A DAY — computed from the day's
// state, never a fixed list. Lifted out of WhatHappenedSheet on 9 Oct 2026 so
// a gate can ask it; the sheet draws exactly what this returns.
// ---------------------------------------------------------------------------

export type DayVerb = 'did_elsewhere' | 'missed' | 'move' | 'rest' | 'something_else' | 'shorten' | 'lighter' | 'rebuild'

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
}

export function dayVerbs(d: DayVerbInput): DayVerb[] {
  if (d.isDone || !d.hasSession || d.movedAway || d.beforePlan) return []
  const out: DayVerb[] = []
  if (d.isPast) out.push('did_elsewhere')
  if ((d.isPast || d.isToday) && !d.declared.missed) out.push('missed')
  out.push('move')
  if (!d.declared.rest) out.push('rest')
  if ((d.isPast || d.isToday) && !d.declared.swapped) out.push('something_else')
  // TODAY ONLY, and only while there is still a session to change. A past
  // day cannot be made shorter — it already happened — and a future one is
  // the ongoing volume change's job, not this one's. Both are also gated on
  // the caller supplying a handler, so a surface that cannot edit the plan
  // never shows a control that would do nothing.
  if (d.isToday && !d.declared.rest && !d.declared.missed && !d.declared.swapped) {
    if (d.canShorten) out.push('shorten')
    if (d.canLighter) out.push('lighter')
    if (d.canRebuild) out.push('rebuild')
  }
  return out
}
