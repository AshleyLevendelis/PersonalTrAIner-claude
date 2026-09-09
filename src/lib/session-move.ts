// ---------------------------------------------------------------------------
// "I'LL DO IT TOMORROW."
//
// The one answer the app had no way to hear. Saying it recorded nothing, so
// the day showed as MISSED the next morning and counted against the week
// (measured 8 Sep 2026 — see docs/plans/ill-do-it-tomorrow.md), while the two
// tools that WOULD have cleared the mark, propose_rest_day and
// swap_session_for_activity, both record that the session is not happening.
//
// ASHLEY'S RULING, 8 Sep 2026. Offered three shapes — land it on the next
// free day; put it on tomorrow regardless and let that day hold two sessions;
// or don't move it and merely stop the black mark — she chose the first:
// "put it on the next free day, and say so". So a day never ends up holding
// two sessions, and when the day she names is busy the coach names the one
// that is free instead of guessing.
//
// PURE. No dates read here, no I/O, no plan fetched: every "which week is
// that" answer comes in from the caller, so the rules are the same ones a
// gate can run and no surface can quietly grow its own version.
// ---------------------------------------------------------------------------
import type { WorkoutDay } from './types'

const DAY_MS = 86_400_000
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** YYYY-MM-DD → its weekday name, read at midday so no timezone can shift it. */
export function dayNameOf(date: string): string {
  return WEEKDAY_NAMES[new Date(`${date}T12:00:00`).getDay()]
}

/** YYYY-MM-DD plus n days, as YYYY-MM-DD. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Whole days from `a` to `b`, positive when b is later. */
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / DAY_MS)
}

/**
 * A move, as the database holds it: one column on the ORIGIN row. The target
 * end is derived everywhere rather than stored, so the two ends cannot drift.
 */
export interface SessionMove {
  /** The date the session was prescribed for. */
  fromDate: string
  /** The date it is being run instead. */
  toDate: string
}

export type MoveTarget =
  | {
      ok: true
      date: string
      dayName: string
      /** True when this is the day they actually named; false when their day was busy and this is the next free one. */
      asWanted: boolean
      /** Set when asWanted is false — the day they asked for, so the coach can say why it moved on. */
      requestedDayName?: string
    }
  | { ok: false; reason: 'no_session' | 'already_moved' | 'no_free_day'; message: string }

export interface MoveTargetInput {
  /** The day whose session is moving. */
  fromDate: string
  /** The day they named, already resolved to a date by the caller. Null means "as soon as possible". */
  requestedDate?: string | null
  /** Today, from the app clock — a session cannot be moved into the past. */
  todayDate: string
  /** The LIVE week's plan, as the weekday pattern it is. */
  plan: WorkoutDay[]
  /**
   * Which mesocycle week a date belongs to. Injected rather than computed:
   * the plan repeats weekly, so a move into next week would put the same
   * session on the calendar twice at two different prescribed loads — and
   * only the caller knows where the plan's own week boundaries fall.
   */
  weekOf: (date: string) => number
  /** Moves already recorded, so two sessions cannot land on one day. */
  existing?: SessionMove[]
}

/** Does the plan prescribe lifting on this weekday? */
export function hasSessionOn(plan: WorkoutDay[], dayName: string): boolean {
  const day = plan.find(d => d.day === dayName)
  return !!day && day.exercises.length > 0
}

/**
 * Where this session may go.
 *
 * Scans forward from the day they named (or from tomorrow) to the end of the
 * origin's own mesocycle week, and returns the first date that is free — no
 * session of its own, and nothing already moved onto it. Never returns a date
 * in the past, and never the origin itself.
 */
export function resolveMoveTarget(input: MoveTargetInput): MoveTarget {
  const { fromDate, requestedDate, todayDate, plan, weekOf, existing = [] } = input

  const fromDayName = dayNameOf(fromDate)
  if (!hasSessionOn(plan, fromDayName)) {
    return {
      ok: false,
      reason: 'no_session',
      message: `There's no session on ${fromDayName} to move — that day is already clear.`,
    }
  }
  if (existing.some(m => m.fromDate === fromDate)) {
    const already = existing.find(m => m.fromDate === fromDate)!
    return {
      ok: false,
      reason: 'already_moved',
      message: `${fromDayName}'s session is already moved to ${dayNameOf(already.toDate)}.`,
    }
  }

  const originWeek = weekOf(fromDate)
  // A day is free when the plan asks nothing of it AND nothing has been moved
  // onto it already. Both halves matter: the second is what stops two moved
  // sessions stacking on the one genuinely empty day of the week.
  const isFree = (date: string) =>
    !hasSessionOn(plan, dayNameOf(date))
    && !existing.some(m => m.toDate === date)
    && date !== fromDate

  // THE EARLIEST DAY IT COULD RUN: the day after the session was prescribed,
  // or today if that day has already gone. Yesterday's session CAN be run
  // today — that is the opener's own "I'll do it today" chip — but only under
  // the same rule as any other day: today must be free.
  const dayAfterOrigin = addDays(fromDate, 1)
  const earliest = daysBetween(todayDate, dayAfterOrigin) >= 0 ? dayAfterOrigin : todayDate
  // A day they named that has already gone is not worth refusing over — scan
  // from the earliest legal day and let the caller say which day it landed on.
  const start = requestedDate && daysBetween(earliest, requestedDate) >= 0 ? requestedDate : earliest

  const requestedDayName = requestedDate ? dayNameOf(requestedDate) : undefined
  for (let d = start; daysBetween(start, d) <= 7; d = addDays(d, 1)) {
    if (weekOf(d) !== originWeek) break
    if (!isFree(d)) continue
    const asWanted = !!requestedDate && d === requestedDate
    return {
      ok: true,
      date: d,
      dayName: dayNameOf(d),
      asWanted,
      ...(asWanted ? {} : { requestedDayName }),
    }
  }

  return {
    ok: false,
    reason: 'no_free_day',
    message: `There's no free day left this week to move ${fromDayName}'s session to — every day left already has a session on it.`,
  }
}

export interface ResolvedDay {
  /** The session to run on this date, or null when there is none. */
  day: WorkoutDay | null
  /** Set on the TARGET of a move — where this session came from. */
  movedFrom: { date: string; dayName: string } | null
  /** Set on the ORIGIN of a move — where this day's session went. */
  movedTo: { date: string; dayName: string } | null
}

/**
 * What runs on a date, once moves are taken into account.
 *
 * The one answer every surface asks for. Before this existed each of them ran
 * `plan.find(d => d.day === dayName)` itself — which is the right answer only
 * for a day nothing has happened to, and there are now four ways that can be
 * false.
 */
// ---------------------------------------------------------------------------
// THE PASSENGER. "I didn't train this morning but I'm going to Muay Thai
// tonight and will do this morning's session tomorrow" — Ashley, 8 Sep 2026 —
// is ONE move with an activity riding along. The server forwards the
// activity, a duration only when her message stated one, and the timing read
// from her words; these turn that into the card's row, its implication and
// the clause in the coach's sentence. Pure, so the gate can run them.
// ---------------------------------------------------------------------------
export type AlsoDoingTiming = 'past' | 'future' | 'unclear'

export interface AlsoDoing {
  activity: string
  /** Only when the message stated one; never the model's guess. */
  durationMinutes: number | null
  timing: AlsoDoingTiming
}

export function parseAlsoDoing(rawArgs: Record<string, unknown>): AlsoDoing | null {
  const activity = typeof rawArgs.also_doing_activity === 'string' ? rawArgs.also_doing_activity.trim() : ''
  if (!activity) return null
  const n = Number(rawArgs.also_doing_duration_minutes)
  const timing = rawArgs.also_doing_timing
  return {
    activity,
    durationMinutes: Number.isFinite(n) && n > 0 && n <= 600 ? Math.round(n) : null,
    timing: timing === 'past' || timing === 'future' ? timing : 'unclear',
  }
}

/** True when confirming the move should also write the activity: it has happened, and she said how long. */
export function alsoDoingIsLoggable(a: AlsoDoing): boolean {
  return a.timing !== 'future' && a.durationMinutes != null
}

export function alsoDoingRow(a: AlsoDoing): { field: string; before: string; after: string } {
  return {
    field: 'Also today',
    before: 'Nothing recorded',
    after: `${a.activity}${a.durationMinutes != null ? ` · ${a.durationMinutes} min` : ''}${a.timing === 'future' ? ' · later today' : ''}`,
  }
}

/** One implication per timing — what confirming will and will not record. */
export function alsoDoingImplication(a: AlsoDoing): string {
  if (a.timing === 'future') return `I'll count the ${a.activity} once you tell me how long it went — nothing is logged for it yet.`
  if (a.durationMinutes != null) return `${a.activity} goes in your log at ${a.durationMinutes} min when you confirm.`
  return `Tell me how long the ${a.activity} was and I'll log it — nothing is logged for it yet.`
}

/** The clause the coach's sentence gains, before its "Shall I?". */
export function alsoDoingLeadClause(a: AlsoDoing): string {
  if (a.timing === 'future') return ` ${a.activity} goes down for today too — tell me how long it went afterwards.`
  if (a.durationMinutes != null) return ` ${a.activity} goes in your log at ${a.durationMinutes} min.`
  return ` ${a.activity} goes down for today too.`
}

export function sessionForDate(input: {
  date: string
  plan: WorkoutDay[]
  moves: SessionMove[]
}): ResolvedDay {
  const { date, plan, moves } = input
  const own = plan.find(d => d.day === dayNameOf(date)) ?? null

  const away = moves.find(m => m.fromDate === date)
  if (away) {
    return { day: null, movedFrom: null, movedTo: { date: away.toDate, dayName: dayNameOf(away.toDate) } }
  }

  const onto = moves.find(m => m.toDate === date)
  if (onto) {
    const source = plan.find(d => d.day === dayNameOf(onto.fromDate)) ?? null
    // The day it came from, not the day it landed on: this IS that session,
    // and calling it by the new weekday would quietly rename the work.
    return { day: source, movedFrom: { date: onto.fromDate, dayName: dayNameOf(onto.fromDate) }, movedTo: null }
  }

  return { day: own, movedFrom: null, movedTo: null }
}
