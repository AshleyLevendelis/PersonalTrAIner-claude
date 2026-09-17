// ---------------------------------------------------------------------------
// THE ONE THING THE COACH SAYS FIRST.
//
// Built 2 Sep 2026 from Ashley's "build it with your recommendations", after
// reviewing a generic chat blueprint against this codebase. The blueprint's
// reminders, rest-day briefings and missed-session follow-ups mostly collapse
// into one mechanism the app already has: the accountability check-in's rule
// that the coach gets AT MOST ONE observation, picked deterministically from
// real data, said once. This module is that rule applied to the OPENER — the
// first bubble in a fresh conversation, which is composed client-side and
// never touches the model.
//
// Deterministic, like accountability.ts and coach-tips.ts, for the same
// reason: the model is never asked whether there is something to raise. It
// receives one line or nothing. The chips are keyed to the KIND so a chip
// can only ever open a conversation the coach's existing tools can finish.
//
// ASHLEY'S RULING, kept: no chips under the how-did-it-feel question. Chips
// are buttons wearing a different hat, and under that question people would
// tap instead of answer, which loses the sentence — the whole point of asking
// in chat. Every other kind may carry chips.
//
// Pure. No I/O, no dates read here — `hour`, `cutoffHour` and every "which
// day" fact come in from the caller's app clock.
// ---------------------------------------------------------------------------

export type OpenerKind =
  | 'check_in'
  | 'noticed'
  | 'session_feel'
  | 'missed_yesterday'
  | 'training_done_today'
  | 'training_today'
  | 'rest_day'
  | 'session_moved'
  | 'plan_unknown'

export interface OpenerSession {
  focus: string
  /** First few exercise names, already trimmed by the caller. */
  movements: string
}

export interface OpenerInput {
  /** Local hour, from the app clock. */
  hour: number
  /** The hour past which "today's session" reads as done rather than upcoming — per preferred_time. */
  cutoffHour: number
  /** The most recent finished session with no `felt` yet (session-feel.ts), or null. */
  awaitingFeel: { date: string; day?: string | null; isToday: boolean } | null
  /** Yesterday's session, if it was scheduled and nothing was logged, swapped or rested on purpose. */
  missedYesterday: { dayName: string; focus: string } | null
  /**
   * Whether the plan has arrived at all.
   *
   * SEPARATE FROM todaySession BEING NULL, and that conflation is the whole
   * reason this field exists. On 7 Sep 2026 Ashley opened the chat on her
   * phone and was told it was a rest day on a day she was due to train: the
   * plan had not finished loading, todaySession was therefore null, and null
   * meant "rest day" to every reader of this type. A slow network became a
   * confident statement about her training.
   *
   * False means we do not know yet, and the opener must claim nothing about
   * today. It never means "no plan": a trainee without one cannot reach this
   * screen.
   */
  planKnown: boolean
  /** Today's session from the LIVE week. Null on a rest day OR when planKnown is false — check that first. */
  todaySession: OpenerSession | null
  /**
   * Set when today's session has been MOVED to another day ("I'll do it
   * tomorrow"), with the day it went to.
   *
   * A THIRD reason todaySession can be null, and the opener has to tell it
   * apart from the other two for the same reason planKnown exists: "it's a
   * rest day on your plan" is a claim, and on a day she moved herself it is a
   * false one. Ranked above the rest-day fallback below.
   */
  movedTo?: { dayName: string } | null
  /** Any set logged today — so a fresh chat mid-session is not asked "feeling good for it?". */
  todayLogged: boolean
  /** The next scheduled session after today, from the live week, or null. */
  tomorrowSession: { dayName: string; focus: string; lead: string | null } | null
  /**
   * ONE THING WORTH NOTICING about this person right now, in the coach's own
   * words — a lift that moved, a run of weeks, something real. Supplied by the
   * caller so this module keeps its promise of reading nothing itself.
   *
   * Null when there is genuinely nothing, and the rotation below simply skips
   * it. A "noticed" line invented to fill a slot would be the app making
   * small talk about a fact it does not have.
   */
  noticed?: { text: string; chips?: string[] } | null
  /**
   * WHICH ORDINARY OPENER WAS USED LAST TIME, so the next one differs.
   *
   * Ashley, 17 Sep 2026, after raising it more than once: *"All it does is
   * tell me every time I speak to it about an upcoming workout. Thats not what
   * a coach does."* She was right, and the cause was here rather than in the
   * model's persona — five of this module's seven openers led with the
   * session, and the rest-day one swung round to tomorrow's. Her ruling, from
   * four options: KEEP IT VARIED.
   *
   * Undefined on a first-ever chat, which starts the rotation at its first
   * entry — a check-in, not the session.
   */
  lastOrdinaryKind?: OrdinaryKind | null
}

/**
 * THE ORDINARY DAY'S ROTATION, in order.
 *
 * DETERMINISTIC, NOT RANDOM, and that is the codebase's own answer to "give
 * me a different one" — `nextPoolOption` in meal-store rotates rather than
 * draws, so N-1 asks show N-1 different things and a gate can prove it. A
 * random opener would be varied and untestable, and `chosen-not-shuffled`
 * exists because this repo has already paid for a coin flip once.
 *
 * The session is LAST, which is the whole point: it is one of three things
 * the coach might open with rather than the thing it always opens with, and
 * it can never come up twice running.
 */
export const ORDINARY_ROTATION = ['check_in', 'noticed', 'session'] as const
export type OrdinaryKind = typeof ORDINARY_ROTATION[number]

/**
 * A warm opening that is not about the plan at all.
 *
 * THREE, BY TIME OF DAY, rather than one repeated every third conversation —
 * and by the hour rather than by a counter, so it needs no state and is right
 * about the day as well as different from last time.
 */
function checkInText(hour: number): string {
  if (hour < 12) return `how's the morning going?`
  if (hour < 18) return `how's the day been so far?`
  return `how are you doing this evening?`
}

export interface Opener {
  kind: OpenerKind
  /** The sentence after the greeting — lower-case start, the caller prefixes the name. */
  text: string
  /** Tappable full-sentence replies; each is SENT as the user's message, so each must stand alone. */
  chips: string[]
  /**
   * True when the opener is about something that wants an answer — an
   * unreviewed session, a missed day — as opposed to the ordinary
   * "here is today". Drives the dot on the chat tab, and nothing else.
   */
  attention: boolean
}

/**
 * WHAT THE COACH SAYS WHEN IT DOES NOT KNOW WHAT TODAY HOLDS.
 *
 * Exported because there are TWO first bubbles, not one, and until 8 Sep 2026
 * only this one knew the difference. ChatAssistant seeds a synchronous
 * greeting into `useState` before any read has resolved, and that greeting
 * composed its own sentence from an `exercisePlan` that is `[]` on every cold
 * load (App.tsx:111) — so it said "it's a rest day on your plan" while this
 * module was carefully not saying it. Same screen, same second, opposite
 * conclusions. One string now, read by both.
 */
export const PLAN_UNKNOWN_TEXT = `how's it going?`

export function pickOpener(input: OpenerInput): Opener {
  const { hour, cutoffHour, awaitingFeel, missedYesterday, planKnown, todaySession, todayLogged, tomorrowSession, movedTo, noticed, lastOrdinaryKind } = input

  // 1. A finished session nobody has asked about. Outranks everything: it is
  //    the one signal the research says predicts whether they come back, and
  //    it goes stale within days. NO CHIPS — see the header.
  if (awaitingFeel) {
    const which = awaitingFeel.isToday
      ? 'today'
      : awaitingFeel.day ? `${awaitingFeel.day}` : 'your last session'
    return {
      kind: 'session_feel',
      text: awaitingFeel.isToday
        ? `${todaySession ? `today was ${todaySession.focus}. ` : ''}how did it actually feel?`
        : `how did ${which} actually feel?`,
      chips: [],
      attention: true,
    }
  }

  // 2. Yesterday was scheduled and nothing happened. Ranked here because it
  //    changes what they do TODAY. The wording follows the prompt's own rule
  //    for a miss — acknowledge, no drama, then the useful part.
  //
  //    TWO chips, not three. The blueprint this came from offered "move it to
  //    your next day" as well; the only schedule tool the coach has changes
  //    the weekly pattern permanently, so that chip would open a conversation
  //    the coach can only finish by rewriting their week. A one-off reschedule
  //    is a named gap, not something to paper over with a chip.
  if (missedYesterday) {
    return {
      kind: 'missed_yesterday',
      // THREE CHIPS, THREE DIFFERENT FACTS. "Call yesterday a rest day" used
      // to be the only alternative to training, and it wrote deliberate_rest
      // — a skipped session quietly rewritten as a chosen one. Ashley's
      // ruling, 10 Sep 2026: a missed day stays missed. So the honest verb
      // is offered beside the other two, and each writes what it says.
      text: `yesterday's ${missedYesterday.focus} didn't happen — no drama. Run it today, mark it missed, or was it a rest day?`,
      chips: [
        "I'll do it today",
        'Mark it missed',
        'Call it a rest day',
      ],
      attention: true,
    }
  }

  // 3. THE PLAN HAS NOT ARRIVED. Everything below this line is a claim about
  //    today — you train, you trained, you rest — and every one of them needs
  //    the plan to be true. Above it, nothing does: an unreviewed session and
  //    a missed day come from logged sessions and the week strip's own states,
  //    which is why they are allowed to outrank this.
  //
  //    So the coach says the one thing it still knows, which is nothing about
  //    today. No apology, no "loading", no promise that it will be along in a
  //    moment — this bubble is composed once and never updates, so a promise
  //    here is the next bug. Just a warm question, and two chips that route to
  //    the coach, which reads its context fresh when a message is sent.
  if (!planKnown) {
    return {
      kind: 'plan_unknown',
      text: PLAN_UNKNOWN_TEXT,
      chips: [
        "What's on for today?",
        'How am I doing so far?',
      ],
      attention: false,
    }
  }

  // 3b. TODAY'S SESSION IS ON ANOTHER DAY, because she said so. Above every
  //     claim about today below it, and below plan_unknown because a move is
  //     a fact about a plan we have. Without this the opener falls through to
  //     the rest-day line, which is the same false claim step 7 removed —
  //     "it's a rest day on your plan" on a day she rescheduled herself.
  if (movedTo) {
    return {
      kind: 'session_moved',
      text: `today's session is on ${movedTo.dayName} now. Anything you want to sort out before then?`,
      chips: [
        `What's on ${movedTo.dayName}?`,
        'How am I doing so far?',
      ],
      attention: false,
    }
  }

  // 4. A SESSION ALREADY BEHIND THEM. Kept out of the rotation below and
  //    ranked above it, because this is not reciting a schedule — it is
  //    asking about something that happened, which is what a coach does. Past
  //    their usual hour with nothing awaiting a feel means either they logged
  //    nothing or never marked it finished; both want the same question.
  if (todaySession && hour >= cutoffHour) {
    return {
      kind: 'training_done_today',
      text: `today was ${todaySession.focus} (${todaySession.movements}). How'd it go?`,
      chips: [],
      attention: false,
    }
  }

  // ---------------------------------------------------------------------
  // 5. THE ORDINARY DAY, AND THE THING ASHLEY KEPT RAISING.
  // ---------------------------------------------------------------------
  // Everything above this line is a real event — an unreviewed session, a
  // missed day, a plan that has not loaded, a moved session. Below it there
  // is no event at all, and until 17 Sep 2026 the coach filled that silence
  // by reciting the plan: "today's Push: bench, rows. Feeling good for it?"
  // every single time, or on a rest day the same thing about tomorrow.
  //
  // Her words, having raised it more than once: "All it does is tell me every
  // time I speak to it about an upcoming workout. Thats not what a coach
  // does. Yes it should know about workouts but that's not all it should
  // bring up immediately."
  //
  // Her ruling, from four options: KEEP IT VARIED. So the session becomes one
  // of three things the coach might open with, rotated deterministically so
  // it can never come up twice running — and so a gate can prove that rather
  // than sample it.
  const sessionOpener = (): Opener => {
    if (todaySession) {
      return {
        kind: 'training_today',
        text: `today's ${todaySession.focus}: ${todaySession.movements}. Feeling good for it?`,
        chips: todayLogged ? [] : ["I'm short on time today — can you trim the session?"],
        attention: false,
      }
    }
    const ahead = tomorrowSession
      ? ` ${tomorrowSession.dayName === 'tomorrow' ? "Tomorrow's" : `${tomorrowSession.dayName}'s`} ${tomorrowSession.focus}${tomorrowSession.lead ? ` leads with ${tomorrowSession.lead}` : ''}.`
      : ''
    return {
      kind: 'rest_day',
      text: `it's a rest day on your plan. How's the recovery going?${ahead}`,
      chips: [
        tomorrowSession ? `What's ${tomorrowSession.dayName === 'tomorrow' ? 'tomorrow' : tomorrowSession.dayName} looking like?` : "What's my next session?",
        'Any mobility work worth doing today?',
      ],
      attention: false,
    }
  }

  const checkInOpener = (): Opener => ({
    kind: 'check_in',
    text: checkInText(hour),
    // CHIPS THAT ARE NOT THE SESSION. The point of this opener is that the
    // plan is not the headline; three buttons about the plan underneath it
    // would put it straight back.
    chips: ['How am I doing so far?', 'I could do with some advice'],
    attention: false,
  })

  const noticedOpener = (): Opener | null => noticed
    ? { kind: 'noticed', text: noticed.text, chips: noticed.chips ?? ['How am I doing so far?'], attention: false }
    : null

  // WHAT IS ACTUALLY AVAILABLE TODAY. `noticed` is absent whenever the caller
  // has no real fact, and the rotation skips it rather than inventing one.
  const build: Record<OrdinaryKind, () => Opener | null> = {
    check_in: checkInOpener,
    noticed: noticedOpener,
    session: sessionOpener,
  }

  // STEP FORWARD FROM WHERE WE WERE, the same rule nextPoolOption uses for
  // "give me a different one". Starting the search AFTER last time's entry is
  // what guarantees the session cannot open two conversations running while
  // anything else is available.
  const start = lastOrdinaryKind ? ORDINARY_ROTATION.indexOf(lastOrdinaryKind) + 1 : 0
  for (let i = 0; i < ORDINARY_ROTATION.length; i++) {
    const built = build[ORDINARY_ROTATION[(start + i) % ORDINARY_ROTATION.length]]()
    if (built) return built
  }
  // Unreachable in practice — sessionOpener always returns something — and a
  // fallback rather than a throw, because a first bubble that crashes is a
  // chat that does not open.
  return checkInOpener()
}

/**
 * Yesterday's missed session, derived from the week strip's own day states so
 * the chat can never disagree with the strip about whether a day was missed.
 * Reads 'missed' only — a swap, a chosen rest, a partial or a done day all
 * come back null, and so does a yesterday that predates the plan.
 *
 * Returns null when yesterday is not in `days` at all. The week hook returns
 * Monday-to-Sunday, so on a Monday yesterday is last week and is not judged
 * here; that is accepted rather than fetched around — a Sunday session is
 * rare, and the alternative is a second range read for one edge case.
 */
export function missedYesterdayFrom(
  days: { date: string; dayName: string; state: string; markedMissed?: boolean }[],
  yesterdayDate: string,
  livePlan: { day: string; focus: string }[],
): { dayName: string; focus: string } | null {
  const y = days.find(d => d.date === yesterdayDate)
  if (!y || y.state !== 'missed') return null
  // A miss the person already DECLARED is a fact on the record, not a
  // question to reopen every morning. The strip still draws it missed; the
  // coach just does not ask about something it has been told.
  if (y.markedMissed) return null
  const focus = livePlan.find(d => d.day === y.dayName)?.focus ?? 'session'
  return { dayName: y.dayName, focus }
}


// ---------------------------------------------------------------------------
// REMEMBERING WHICH ORDINARY OPENER WAS USED LAST, so the next one differs.
//
// Device-local, the same shape goal-proximity.ts and meal-refit.ts use for
// their dismissals, and for the same reason: this steers which friendly
// sentence appears, not a number the app computes. A second device
// occasionally repeating an opener is a shrug; it is not a correctness
// problem, and it is not worth a column and a migration.
// ---------------------------------------------------------------------------
const LAST_OPENER_KEY = 'fitplan_last_ordinary_opener_v1'

export function readLastOrdinaryKind(profileId: string): OrdinaryKind | null {
  try {
    const raw = localStorage.getItem(`${LAST_OPENER_KEY}:${profileId}`)
    // VALIDATED, NOT TRUSTED. A stale value from an older rotation would make
    // indexOf return -1, and -1 + 1 is 0 — which silently restarts at the
    // beginning rather than failing. Correct by luck is still by luck.
    return (ORDINARY_ROTATION as readonly string[]).includes(raw ?? '') ? (raw as OrdinaryKind) : null
  } catch {
    return null
  }
}

export function rememberOrdinaryKind(profileId: string, kind: OpenerKind): void {
  // ONLY THE THREE THAT ROTATE. An unreviewed session or a missed day is an
  // event, not a turn of the rotation, and letting one advance the cursor
  // would mean a real event quietly decided which small talk came next.
  const ordinary: OrdinaryKind | null =
    kind === 'check_in' ? 'check_in'
      : kind === 'noticed' ? 'noticed'
        : kind === 'training_today' || kind === 'rest_day' ? 'session'
          : null
  if (!ordinary) return
  try { localStorage.setItem(`${LAST_OPENER_KEY}:${profileId}`, ordinary) } catch { /* best-effort */ }
}
