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
      /**
       * Set only when the session being moved ARRIVED here by an earlier move.
       * The write must update THAT record — origin → the new day — rather than
       * chain a second move off the day it happens to be sitting on, or the
       * app can no longer say which day the session belongs to.
       */
      remapFrom?: string
    }
  | {
      ok: false
      /**
       * The day already holds a session that was MOVED here. Not a refusal —
       * a question. Ashley's ruling, 9 Sep 2026: offer both moving it on and
       * dropping it, and let her pick.
       */
      reason: 'moved_in'
      message: string
      /** The move that put the session here, so moving it on UPDATES this rather than stacking a second one. */
      arrivedBy: SessionMove
      /** The day it came from — what the session is actually called. */
      originDayName: string
      /** Where it would go if she moves it on, or null when the week has no free day left. */
      nextFree: { date: string; dayName: string } | null
    }
  | {
      ok: false
      /**
       * THE DAY NAMED IS THE ORIGIN of a move — its session lives elsewhere
       * now. Not a refusal since 11 Sep 2026: a question, like 'moved_in'.
       *
       * Ashley, from the live app: she moved Tuesday's Push & Press to
       * Wednesday, then on Friday asked to do it today and to move it to
       * Friday, and got "Tuesday's session is already moved to Wednesday."
       * twice, with nothing to tap. The only wording that worked was naming
       * WEDNESDAY — the day it had travelled to — which she had no way to
       * know. Asked with three options (move it straight away / say where it
       * is and then offer / keep refusing), she chose the middle: *"you
       * always know where the session actually is before deciding."*
       *
       * So this outcome names the session's current home and offers a day,
       * and the chips the client builds from it name that CURRENT home — a
       * chip that named the origin again would come straight back here, which
       * is the loop the 9 Sep ruling exists to prevent.
       */
      reason: 'already_moved'
      message: string
      /** Where the session actually lives now. */
      movedTo: { date: string; dayName: string }
      /** The day being offered — the one they named when it is free, else the next free one. Null when the week has none left. */
      nextFree: { date: string; dayName: string } | null
      /** Set only when they named a day that was NOT free, so the offer can say why it names another. */
      requestedDayName?: string
    }
  | { ok: false; reason: 'no_session' | 'no_free_day'; message: string }

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

// hasSessionOn USED TO LIVE HERE and is deliberately gone. It answered "does
// the plan prescribe lifting on this weekday" — true only for a day nothing has
// happened to — and resolveMoveTarget asking it is the whole of the 9 Sep 2026
// stuck-session bug. Everything now asks sessionForDate. Nothing exported from
// this file should tempt a caller back into the plan's raw row.

/**
 * Where this session may go.
 *
 * Scans forward from the day they named (or from tomorrow) to the end of the
 * origin's own mesocycle week, and returns the first date that is free — no
 * session of its own, and nothing already moved onto it. Never returns a date
 * in the past, and never the origin itself.
 */
export function resolveMoveTarget(input: MoveTargetInput, depth = 0): MoveTarget {
  const { fromDate, requestedDate, todayDate, plan, weekOf, existing = [] } = input

  const fromDayName = dayNameOf(fromDate)

  // ASK WHAT ACTUALLY RUNS HERE, not what the plan prescribes for this
  // weekday. This function used to call hasSessionOn(plan, fromDayName) — the
  // exact naive lookup sessionForDate (below) was written to replace, and the
  // one place that never adopted it.
  //
  // Ashley, 9 Sep 2026, from the live app: she moved Tuesday's Push & Press to
  // Wednesday, then on Wednesday said "I missed todays session" and got "There's
  // no session on Wednesday to move — that day is already clear." Three times.
  // The plan does say Wednesday is clear; the session that travelled there is
  // invisible to the plan's own row. So a moved session could never be moved
  // again, and she could not say she had missed it.
  const resolved = sessionForDate({ date: fromDate, plan, moves: existing })

  if (resolved.movedTo) {
    const home = resolved.movedTo
    // WHERE IT WOULD GO, asked of the day it actually sits on. That day is a
    // move's TARGET and never its origin, so this recurses exactly once; the
    // depth guard is for a corrupt pair (A->B and B->C) that should not exist
    // but must not spin if it ever does.
    const onward: MoveTarget = depth > 0
      ? { ok: false, reason: 'no_free_day', message: '' }
      : resolveMoveTarget({ ...input, fromDate: home.date }, depth + 1)
    const offered = onward.ok
      ? { date: onward.date, dayName: onward.dayName }
      : onward.reason === 'moved_in' ? onward.nextFree : null
    const wanted = requestedDate ? dayNameOf(requestedDate) : undefined
    // Named only when they asked for a day they cannot have — saying "Friday
    // already has a session" when they never mentioned Friday is noise.
    const blocked = wanted && offered && wanted !== offered.dayName ? wanted : undefined
    const where = `${fromDayName}'s session is on ${home.dayName} now.`
    return {
      ok: false,
      reason: 'already_moved',
      movedTo: home,
      nextFree: offered,
      ...(blocked ? { requestedDayName: blocked } : {}),
      message: offered
        ? blocked
          ? `${where} ${blocked} already has a session on it — want it on ${offered.dayName} instead, or shall we take ${home.dayName} off?`
          : `${where} Want it on ${offered.dayName} instead, or shall we take ${home.dayName} off?`
        : `${where} There's no free day left this week — shall we take ${home.dayName} off?`,
    }
  }

  if (!resolved.day || resolved.day.exercises.length === 0) {
    return {
      ok: false,
      reason: 'no_session',
      message: `There's no session on ${fromDayName} to move — that day is already clear.`,
    }
  }

  const originWeek = weekOf(fromDate)
  // A day is free when nothing runs on it once moves are counted, and nothing
  // has been moved onto it already. The first half asks sessionForDate rather
  // than the plan for the same reason the origin check above does; the second
  // is what stops two moved sessions stacking on the one genuinely empty day.
  const isFree = (date: string) => {
    const r = sessionForDate({ date, plan, moves: existing })
    // `day` is the plan's ROW, which exists for a rest day too and carries no
    // exercises — the same distinction hasSessionOn made and the first version
    // of this rewrite dropped, which made every rest day look occupied and
    // refused an ordinary move outright. Caught by the probe, not by reading.
    return (!r.day || r.day.exercises.length === 0)
      && !existing.some(m => m.toDate === date)
      && date !== fromDate
  }

  // THE EARLIEST DAY IT COULD RUN: the day after the session was prescribed,
  // or today if that day has already gone. Yesterday's session CAN be run
  // today — that is the opener's own "I'll do it today" chip — but only under
  // the same rule as any other day: today must be free.
  const dayAfterOrigin = addDays(fromDate, 1)
  const earliest = daysBetween(todayDate, dayAfterOrigin) >= 0 ? dayAfterOrigin : todayDate
  // A day they named that has already gone is not worth refusing over — scan
  // from the earliest legal day and let the caller say which day it landed on.
  const start = requestedDate && daysBetween(earliest, requestedDate) >= 0 ? requestedDate : earliest

  /** First free day from `from`, staying inside the origin's own week. */
  const firstFreeFrom = (from: string): string | null => {
    for (let d = from; daysBetween(from, d) <= 7; d = addDays(d, 1)) {
      if (weekOf(d) !== originWeek) break
      if (isFree(d)) return d
    }
    return null
  }

  // ALREADY MOVED ONCE, AND MISSED AGAIN — a question, not a refusal.
  // Ashley's ruling, 9 Sep 2026, asked as "should a twice-missed session move
  // again, or should the app offer to drop it": ask, and let her choose. The
  // move that brought it here rides along so moving it on can UPDATE that
  // record rather than stack a second one — two moves would leave the app
  // unable to say which day the session actually belongs to.
  //
  // NAMING A DAY IS THE ANSWER. The question below is only asked when she has
  // not said where it should go ("I missed today's session"). Once she says
  // "Friday" — by tapping the offer or typing it — that IS her choice, and
  // asking again would be the loop this whole fix exists to remove.
  if (resolved.movedFrom && !requestedDate) {
    const nextFreeDate = firstFreeFrom(daysBetween(todayDate, addDays(fromDate, 1)) >= 0 ? addDays(fromDate, 1) : todayDate)
    // "today" when it is today, which it usually is — she is standing in the
    // day. Naming the weekday to someone looking at that weekday reads like
    // the app talking about someone else's week.
    const sittingOn = fromDate === todayDate ? 'today' : fromDayName
    return {
      ok: false,
      reason: 'moved_in',
      originDayName: resolved.movedFrom.dayName,
      arrivedBy: { fromDate: resolved.movedFrom.date, toDate: fromDate },
      nextFree: nextFreeDate ? { date: nextFreeDate, dayName: dayNameOf(nextFreeDate) } : null,
      // DROPPING IS TAKING THE DAY OFF, and the sentence says so rather than
      // leaving "drop it" to mean whatever she reads into it. It is also what
      // the chips beside it do — ChatAssistant builds them from this outcome —
      // so the question and the two answers describe the same two things.
      message: nextFreeDate
        ? `That's ${resolved.movedFrom.dayName}'s ${resolved.day.focus} — you already moved it once. Want it on ${dayNameOf(nextFreeDate)} instead, or shall we drop it and take ${sittingOn} off?`
        : `That's ${resolved.movedFrom.dayName}'s ${resolved.day.focus} — you already moved it once, and there's no free day left this week. Shall we drop it and take ${sittingOn} off?`,
    }
  }

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
      ...(resolved.movedFrom ? { remapFrom: resolved.movedFrom.date } : {}),
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
