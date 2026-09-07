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
  | 'session_feel'
  | 'missed_yesterday'
  | 'training_done_today'
  | 'training_today'
  | 'rest_day'
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
  /** Any set logged today — so a fresh chat mid-session is not asked "feeling good for it?". */
  todayLogged: boolean
  /** The next scheduled session after today, from the live week, or null. */
  tomorrowSession: { dayName: string; focus: string; lead: string | null } | null
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

export function pickOpener(input: OpenerInput): Opener {
  const { hour, cutoffHour, awaitingFeel, missedYesterday, planKnown, todaySession, todayLogged, tomorrowSession } = input

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
      text: `yesterday's ${missedYesterday.focus} didn't happen — no drama. Want to run it today, or call yesterday a rest day and pick up from here?`,
      chips: [
        "I'll do it today",
        'Call yesterday a rest day',
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
      text: `how's it going?`,
      chips: [
        "What's on for today?",
        'How am I doing so far?',
      ],
      attention: false,
    }
  }

  // 4. A training day, past the hour they usually train, nothing awaiting a
  //    feel (so either they logged nothing, or the session is not marked
  //    finished). The pre-existing line, unchanged.
  if (todaySession && hour >= cutoffHour) {
    return {
      kind: 'training_done_today',
      text: `today was ${todaySession.focus} (${todaySession.movements}). How'd it go?`,
      chips: [],
      attention: false,
    }
  }

  // 5. A training day still ahead. The pre-existing line, plus the one chip
  //    that maps cleanly onto an existing tool (propose_volume_change,
  //    direction lighter). Mid-session gets no chip: trimming a session
  //    they are already in is a different conversation.
  if (todaySession) {
    return {
      kind: 'training_today',
      text: `today's ${todaySession.focus}: ${todaySession.movements}. Feeling good for it?`,
      chips: todayLogged ? [] : ["I'm short on time today — can you trim the session?"],
      attention: false,
    }
  }

  // 6. A rest day. The pre-existing line, plus a look ahead when there is
  //    one — that is the blueprint's "preview tomorrow", and it costs nothing.
  //    Both chips are questions the coach can always answer from context.
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
  days: { date: string; dayName: string; state: string }[],
  yesterdayDate: string,
  livePlan: { day: string; focus: string }[],
): { dayName: string; focus: string } | null {
  const y = days.find(d => d.date === yesterdayDate)
  if (!y || y.state !== 'missed') return null
  const focus = livePlan.find(d => d.day === y.dayName)?.focus ?? 'session'
  return { dayName: y.dayName, focus }
}
