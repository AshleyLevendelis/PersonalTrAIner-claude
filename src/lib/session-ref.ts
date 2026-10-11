// ---------------------------------------------------------------------------
// WHICH PLAN ROW IS THIS SESSION — the one answer every EDIT takes.
//
// 9 Oct 2026 (H15, H19). `sessionForDate` has answered "what runs on this
// date" for every screen that SHOWS a day since 8 Sep, and every screen that
// CHANGES a day went on passing today's weekday name instead of the row that
// resolver returned. After Monday's Chest & Triceps was moved to Friday the
// app drew the session on Friday and then told its owner:
//
//   "Friday is a rest day — there's nothing on it to swap."
//   "There's no session on Friday to shorten."
//   "I couldn't find that exercise on that day."
//
// and the on-screen swap changed nothing and closed as if it had. About twenty
// call sites, one substitution: the weekday being LOOKED AT where the plan row
// being RUN was needed.
//
// So an edit no longer takes a weekday name. It takes a SessionRef:
//
//   date        the date the person is looking at
//   sayDay      the weekday that date falls on — the ONLY name a sentence may use
//   planDayName the plan row that session lives in — the ONLY key an edit may write
//
// On an ordinary day the two names are the same word. On the receiving end of
// a move they are not ("Friday" / "Monday"), and that difference is the bug.
//
// Days swapped for another activity, rested on purpose or marked missed go
// through the same lookup and come back as a refusal in words, because the
// plan's row for that weekday still holds a full lifting session and an edit
// would happily rewrite work the person has said they are not doing.
//
// PURE. No clock, no database: the caller hands in the seven cells the week
// strip is drawn from (useTrainingWeek), so an edit and the strip cannot
// disagree about which day holds a session.
// ---------------------------------------------------------------------------
import type { WorkoutDay } from './types'

/** Just enough of useTrainingWeek's cell — structural, so the gate can use literals. */
export interface SessionRefCell {
  date: string
  dayName: string
  state: string
  session?: WorkoutDay | null
  movedTo?: { date: string; dayName: string } | null
  movedFrom?: { date: string; dayName: string } | null
  swappedForActivity?: string | null
  markedMissed?: boolean
  deliberateRest?: boolean
}

export type SessionRefKind =
  /** A session runs here — the plan's own, or one moved in. */
  | 'session'
  /** Nothing to lift here: no row, or a rest / cardio-only row. */
  | 'rest'
  /** This weekday's session is being run on another date this week. */
  | 'moved_away'
  /** "I did something else instead." */
  | 'swapped'
  /** Rested on purpose, and said so. */
  | 'rest_chosen'
  /** Said missed. */
  | 'missed'

export interface SessionRef {
  /** The date being looked at. */
  date: string
  /** The weekday the person SEES this on. Sentences use this and nothing else. */
  sayDay: string
  /** The plan row this session lives in. Edits write here and nowhere else. */
  planDayName: string
  weekNumber: number
  /** What is run on this date, moves taken into account. Null when nothing is. */
  session: WorkoutDay | null
  kind: SessionRefKind
  movedFrom: { date: string; dayName: string } | null
  movedTo: { date: string; dayName: string } | null
  swappedFor: string | null
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** One week-strip cell in, the reference every edit takes out. */
export function sessionRefFromCell(cell: SessionRefCell, weekNumber: number): SessionRef {
  const movedTo = cell.movedTo ?? null
  const movedFrom = cell.movedFrom ?? null
  const session = movedTo ? null : cell.session ?? null
  // LOGGED WORK OUTRANKS A FLAG, exactly as classifyDay ranks them: someone
  // who said "football instead" and then lifted has a 'done' or 'partial'
  // cell, and that session is real and editable. So the flags are read off
  // the cell's STATE, which has already applied that ranking, and never off
  // the raw booleans alone.
  const kind: SessionRefKind = movedTo ? 'moved_away'
    : cell.state === 'swapped' ? 'swapped'
    : cell.state === 'rest_chosen' ? 'rest_chosen'
    : cell.state === 'missed' && cell.markedMissed ? 'missed'
    : session && session.exercises.length > 0 ? 'session'
    : 'rest'
  return {
    date: cell.date,
    sayDay: cell.dayName,
    // The row the session CAME from on a moved-in day; the weekday's own row
    // everywhere else (which is what a rest day's cardio is written to).
    planDayName: !movedTo && movedFrom ? (session?.day ?? movedFrom.dayName) : (session?.day ?? cell.dayName),
    weekNumber,
    session,
    kind,
    movedFrom,
    movedTo,
    swappedFor: cell.swappedForActivity ?? null,
  }
}

/**
 * A day looked at DIRECTLY in the plan, with no date behind it — "train
 * anyway" borrowing Wednesday's prescription on a rest day, and the programme
 * view browsing a week that is not the live one. A move is a fact about a
 * date, so there is nothing to resolve; this exists so those callers still
 * hand an edit a SessionRef rather than a bare string.
 */
export function sessionRefForPlanDay(input: { date: string; planDayName: string; session: WorkoutDay | null | undefined; weekNumber: number }): SessionRef {
  const session = input.session ?? null
  return {
    date: input.date,
    sayDay: input.planDayName,
    planDayName: input.planDayName,
    weekNumber: input.weekNumber,
    session,
    kind: session && session.exercises.length > 0 ? 'session' : 'rest',
    movedFrom: null,
    movedTo: null,
    swappedFor: null,
  }
}

export interface DayArgContext {
  /** Today's date, from the app's one clock. */
  todayDate: string
  /** The seven resolved cells of the live week. */
  cells: SessionRefCell[]
  weekNumber: number
  /**
   * What "Monday" means once Monday's session has moved to Friday.
   *   true  (default) — the SESSION: the same reference "Friday" gives. Every
   *         exercise-grain edit wants this; "swap the kickbacks on my Monday
   *         session" is about the work, wherever it is now run.
   *   false — the DAY: a reference of kind 'moved_away'. For the tools that
   *         are about the calendar slot (a cardio session for that weekday).
   */
  followMove?: boolean
}

/**
 * What the coach's tools call a day — 'today', 'tomorrow', a weekday, a
 * prefix ("Thurs"), or nothing at all (today) — as the same reference the
 * screen holds. A refusal comes back in words; nothing is guessed.
 */
export function sessionRefForDayArg(dayArg: string, ctx: DayArgContext): SessionRef | { refusal: string } {
  const a = norm(dayArg)
  const { cells, todayDate, weekNumber } = ctx
  const unknown = { refusal: a ? `I don't have a "${dayArg.trim()}" on your plan this week — which day did you mean?` : 'Which day did you want to change?' }
  const todayCell = cells.find(c => c.date === todayDate)

  let cell: SessionRefCell | undefined
  if (!a || a === 'today') {
    cell = todayCell
  } else if (a === 'tomorrow') {
    const i = todayCell ? WEEKDAYS.indexOf(norm(todayCell.dayName)) : -1
    if (i === -1) return unknown
    const d = new Date(`${todayDate}T12:00:00`)
    d.setDate(d.getDate() + 1)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    // Sunday's "tomorrow" is next week, which these seven cells do not hold.
    // The plan is a weekly pattern, so the same weekday's row is the honest
    // stand-in — and it is what this lookup did before it knew about dates.
    cell = cells.find(c => c.date === iso) ?? cells.find(c => norm(c.dayName) === WEEKDAYS[(i + 1) % 7])
  } else {
    cell = cells.find(c => norm(c.dayName) === a)
    if (!cell) {
      const prefixed = cells.filter(c => norm(c.dayName).startsWith(a) || a.startsWith(norm(c.dayName)))
      cell = prefixed.length === 1 ? prefixed[0] : undefined
    }
  }
  if (!cell) return unknown

  if (cell.movedTo && ctx.followMove !== false) {
    const landed = cells.find(c => c.date === cell!.movedTo!.date)
    if (landed) return sessionRefFromCell(landed, weekNumber)
  }
  return sessionRefFromCell(cell, weekNumber)
}

export type EditTarget =
  | { ok: true; planDayName: string; sayDay: string; weekNumber: number }
  | { ok: false; refusal: string }

/**
 * May this session be edited, and under which key?
 *
 * The ONLY door to `planDayName`. A rest day passes — the edits themselves
 * already refuse an empty day in their own words, and a rest day is exactly
 * what a cardio session is put ON — but a day the person has said they are
 * not lifting on does not, because its plan row still holds a full session.
 */
export function editTarget(ref: SessionRef): EditTarget {
  switch (ref.kind) {
    case 'moved_away':
      return { ok: false, refusal: `${ref.sayDay}'s session is on ${ref.movedTo?.dayName ?? 'another day'} this week, so there's nothing on ${ref.sayDay} to change.` }
    case 'swapped':
      return { ok: false, refusal: `${ref.sayDay} is down as ${ref.swappedFor || 'something else'} instead of your session, so there's nothing on it to change.` }
    case 'rest_chosen':
      return { ok: false, refusal: `${ref.sayDay} is down as a rest day you chose, so there's no session on it to change.` }
    case 'missed':
      return { ok: false, refusal: `${ref.sayDay}'s session is down as missed, so there's nothing on it to change.` }
    default:
      return { ok: true, planDayName: ref.planDayName, sayDay: ref.sayDay, weekNumber: ref.weekNumber }
  }
}

/**
 * Say the day the person SEES.
 *
 * Every edit in session-edit, session-rebuild, exercise-plan and the
 * executors writes its sentences with the key it was called with — rightly,
 * that is the only day it knows. Called with the plan row of a moved session
 * that key is "Monday", said to someone standing in Friday. This is the one
 * place the two are reconciled, so no edit has to learn about moves and no
 * sentence can be forgotten: whatever names the plan row comes out naming the
 * day on screen. A no-op on every ordinary day.
 */
export function sayDayIn(text: string, ref: Pick<SessionRef, 'planDayName' | 'sayDay'>): string
export function sayDayIn(text: null, ref: Pick<SessionRef, 'planDayName' | 'sayDay'>): null
export function sayDayIn(text: string | null, ref: Pick<SessionRef, 'planDayName' | 'sayDay'>): string | null
export function sayDayIn(text: string | null, ref: Pick<SessionRef, 'planDayName' | 'sayDay'>): string | null {
  if (text == null || !ref.planDayName || ref.planDayName === ref.sayDay) return text
  return text.replace(new RegExp(`\\b${ref.planDayName}\\b`, 'g'), ref.sayDay)
}
