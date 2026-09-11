// ---------------------------------------------------------------------------
// THE COACH SPEAKS FIRST, MID-CONVERSATION.
//
// Built 7 Sep 2026 from Ashley: "i want the chat to start conversation
// unprompted based off events such as a completed workout or upcoming workout,
// etc."
//
// WHAT WAS ACTUALLY MISSING. The coach already had one way to speak first —
// coach-opener.ts, the first bubble — but that effect refuses to run unless the
// conversation is exactly one untouched greeting (ChatAssistant.tsx), and
// loadChatHistory restores the last twenty messages with no date filter. So
// from the second conversation onward the chat opened on the old thread and the
// coach added nothing new, ever, until the chat was cleared. The button could
// glow (chat-unread.ts) with no message behind it.
//
// This module is the opener's rule applied to an ONGOING thread: at most one
// observation, picked deterministically from real data, said once. The model is
// never asked whether there is something to raise — same reason as
// accountability.ts and coach-tips.ts, which is that if it were asked it would
// invent one.
//
// ASHLEY'S TWO RULINGS, 7 Sep 2026:
//   - IN THE APP, not the lock screen. Phone notifications were offered with
//     their real cost (a server that decides and sends; the app installed to
//     her home screen before iOS allows it at all) and deliberately not chosen.
//     Nothing here assumes a notification will ever exist.
//   - TRAINING AND WINS. The five events below, and not the evening protein and
//     water shortfalls or the stale weigh-in, which accountability.ts can
//     already produce and which would make this close to daily. Her reason is
//     the one BottomTabBar.tsx already records in its own words: a button that
//     is always glowing stops meaning anything.
//
// THE KEY IS THE EVENT, NOT THE KIND. `pr:Bench Press:2026-09-07:80` is not the
// same thing as `pr:Squat:2026-09-09:100`. A key is burnt when it is spoken, so
// a personal best is congratulated exactly once and a second PR on a different
// lift is still its own message. Nothing expires: an event outranked today is
// said tomorrow instead of lost.
//
// Pure. No I/O, no dates read here — every "which day" fact comes in from the
// caller's app clock, exactly as coach-opener.ts takes them.
// ---------------------------------------------------------------------------

export type NudgeKind =
  | 'session_feel'
  | 'missed_yesterday'
  | 'personal_best'
  | 'streak_milestone'
  | 'session_due'

/**
 * Streak lengths worth a word. A judgement, not a measured threshold — written
 * here so it is one line to change. Spaced widely on purpose: the streak is a
 * day count with rest days transparent (streak.ts), so on four sessions a week
 * these land roughly fortnightly at the start and then rarely.
 */
export const STREAK_MILESTONES = [7, 14, 30, 60, 100]

export interface NudgeSession {
  focus: string
  /** First few exercise names, already trimmed by the caller. */
  movements: string
}

export interface NudgeInput {
  /** Today, YYYY-MM-DD, from the app clock. */
  today: string
  /** Local hour, from the app clock. */
  hour: number
  /** The hour past which today's session reads as done rather than upcoming — per preferred_time. */
  cutoffHour: number
  /**
   * Whether the plan has arrived at all. False means we do not know yet, never
   * "no plan" — see the same field on OpenerInput for the morning this
   * distinction was learned the hard way.
   */
  planKnown: boolean
  /** The most recent finished session with no `felt` yet (session-feel.ts), or null. */
  awaitingFeel: { date: string; day?: string | null; isToday: boolean } | null
  /** Yesterday, when it was scheduled and nothing was logged, swapped or rested on purpose. */
  missedYesterday: { date: string; dayName: string; focus: string } | null
  /** The most recent personal best inside the dashboard's own recent window, or null. */
  recentPR: { exerciseName: string; weightKg: number; date: string } | null
  /** Consecutive-day training streak (streak.ts). */
  streak: number
  /** Today's session from the LIVE week. Null on a rest day OR when planKnown is false. */
  todaySession: NudgeSession | null
  /** Any set logged today. */
  todayLogged: boolean
}

export interface CoachNudge {
  kind: NudgeKind
  /**
   * Every event this one message speaks for. Burnt together, so a PR folded
   * into the how-did-it-feel question is never also congratulated on its own.
   */
  keys: string[]
  /**
   * The message, whole. Unlike the opener this lands in the middle of an
   * existing conversation, so it carries no greeting and no name — it is a
   * sentence the coach says, not the top of a page.
   */
  text: string
  /** Tappable full-sentence replies; each is SENT as the user's message. */
  chips: string[]
}

/** The event key for each thing that could be said right now, or null. */
export function nudgeKeys(input: NudgeInput): {
  feel: string | null
  missed: string | null
  pr: string | null
  streak: string | null
  due: string | null
} {
  const milestone = STREAK_MILESTONES.includes(input.streak) ? input.streak : null
  return {
    feel: input.awaitingFeel ? `feel:${input.awaitingFeel.date}` : null,
    missed: input.missedYesterday ? `missed:${input.missedYesterday.date}` : null,
    pr: input.recentPR
      ? `pr:${input.recentPR.exerciseName}:${input.recentPR.date}:${input.recentPR.weightKg}`
      : null,
    streak: milestone ? `streak:${milestone}` : null,
    // ONLY BEFORE THE CUTOFF. Past the hour she usually trains, "today's Push
    // & Press, feeling good for it?" is a question about a session that has
    // either already happened (and will come back as a feel question the
    // moment a set is logged) or has not (and comes back tomorrow as a missed
    // day). Both are better sentences than this one, so this one stays quiet.
    due: input.planKnown && input.todaySession && !input.todayLogged && input.hour < input.cutoffHour
      ? `due:${input.today}`
      : null,
  }
}

/**
 * Which event keys the OPENER has already spoken for, so the two mechanisms can
 * never say the same thing twice. Derived from the opener's own kind rather
 * than duplicated from its source: coach-opener.ts decides what the first
 * bubble is about, and this only reads that decision back.
 *
 * `prFolded` is the opener's PR line — it prepends one whenever there is a
 * recent PR, whatever kind it picked (ChatAssistant.tsx), so that key is burnt
 * on every kind and not just the training ones.
 */
export function keysCoveredByOpener(
  openerKind: string,
  keys: ReturnType<typeof nudgeKeys>,
  prFolded: boolean,
): string[] {
  const covered: (string | null)[] = [prFolded ? keys.pr : null]
  if (openerKind === 'session_feel') covered.push(keys.feel)
  if (openerKind === 'missed_yesterday') covered.push(keys.missed)
  if (openerKind === 'training_today' || openerKind === 'training_done_today') covered.push(keys.due)
  return covered.filter((k): k is string => k != null)
}

/**
 * The one thing worth saying unprompted right now, or null when nothing is.
 *
 * `said` is every key already spoken. Ranked by how actionable the thing is to
 * her right now, which is the same ordering rule accountability.ts uses and NOT
 * how pleased or alarmed the coach would sound saying it.
 */
export function pickNudge(input: NudgeInput, said: string[]): CoachNudge | null {
  const keys = nudgeKeys(input)
  const unsaid = (k: string | null): k is string => k != null && !said.includes(k)

  // 1. A finished session nobody has asked about. Outranks everything for the
  //    reason session-feel.ts records: affect during exercise predicts whether
  //    someone comes back, more reliably than any programming variable, and the
  //    answer goes stale within days. NO CHIPS — Ashley's ruling, kept from the
  //    opener: under this question people tap instead of answering, which loses
  //    the sentence that was the whole point of asking.
  if (unsaid(keys.feel) && input.awaitingFeel) {
    // A PR from THAT session folds in rather than queueing behind it. Dated to
    // the same session on purpose: a best set three days ago tacked onto
    // today's question reads as the app having lost track of when things
    // happened.
    const foldPR =
      unsaid(keys.pr) && input.recentPR != null && input.recentPR.date === input.awaitingFeel.date
    const lead = foldPR && input.recentPR
      ? `Nice PR on ${input.recentPR.exerciseName} at ${input.recentPR.weightKg}kg. `
      : ''
    const which = input.awaitingFeel.isToday
      ? 'that session'
      : input.awaitingFeel.day ? `${input.awaitingFeel.day}` : 'your last session'
    return {
      kind: 'session_feel',
      keys: [keys.feel, ...(foldPR && keys.pr ? [keys.pr] : [])],
      text: `${lead}How did ${which} actually feel?`,
      chips: [],
    }
  }

  // 2. Yesterday was scheduled and nothing happened. Ranked here because it
  //    changes what she does TODAY. Three chips since 10 Sep 2026, one per
  //    fact: run it, mark it missed, or it was a rest — the same three the
  //    opener offers, for the reason recorded there. No "move it" chip: a
  //    move is a conversation about WHICH day, which the coach can hold when
  //    asked, not a one-tap answer.
  if (unsaid(keys.missed) && input.missedYesterday) {
    return {
      kind: 'missed_yesterday',
      keys: [keys.missed],
      text: `Yesterday's ${input.missedYesterday.focus} didn't happen — no drama. Run it today, mark it missed, or was it a rest day?`,
      chips: ["I'll do it today", 'Mark it missed', 'Call it a rest day'],
    }
  }

  // 3. A personal best that has not been mentioned. The one event here that is
  //    not homework — Ashley chose "training + wins" over "training only" so
  //    that a glowing button does not always mean something is owed.
  if (unsaid(keys.pr) && input.recentPR) {
    return {
      kind: 'personal_best',
      keys: [keys.pr],
      text: `That's a PR — ${input.recentPR.exerciseName} at ${input.recentPR.weightKg}kg, the best you've logged on it.`,
      chips: ["What should I be lifting on that next time?"],
    }
  }

  // 4. A streak milestone. Below the PR because a streak is a fact about
  //    turning up and a PR is a fact about her, and only one of them is new
  //    information.
  if (unsaid(keys.streak)) {
    return {
      kind: 'streak_milestone',
      keys: [keys.streak],
      text: `${input.streak} days in a row now. That's the part most people don't manage.`,
      chips: ['How am I doing so far?'],
    }
  }

  // 5. Today's session, still ahead, nothing logged yet. Last because it is the
  //    only one she can also read off the Home tab. The chip is the one that
  //    maps cleanly onto a tool the coach already has (propose_volume_change,
  //    direction lighter).
  if (unsaid(keys.due) && input.todaySession) {
    return {
      kind: 'session_due',
      keys: [keys.due],
      text: `Today's ${input.todaySession.focus}: ${input.todaySession.movements}. Feeling good for it?`,
      chips: ["I'm short on time today — can you trim the session?"],
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// WHAT HAS ALREADY BEEN SAID, and when the last one was.
//
// localStorage rather than the database, deliberately. This is bookkeeping
// about one browser's conversation, exactly like chat-unread.ts's seen set and
// chat-cache.ts's mirror; a row per nudge would be a schema change, a migration
// and a read on every mount to prevent a duplicate message, which is not worth
// what it buys. The cost is stated: a new browser or a cleared store may repeat
// one nudge once.
// ---------------------------------------------------------------------------

const STORE_PREFIX = 'coach_nudge_'

/**
 * How long the coach waits between unprompted messages. Two things worth saying
 * at the same moment are still two interruptions, and nothing is lost by
 * waiting — a key stays unburnt until it is actually spoken, so the second one
 * is said next time rather than dropped.
 */
export const NUDGE_MIN_GAP_MS = 30 * 60 * 1000

/**
 * How many keys are kept. Only needs to outlive the events themselves: the
 * oldest thing in here is a PR or a missed day from a few weeks ago, and a key
 * falling off the end can at worst repeat a message about an event that is long
 * gone from the inputs anyway.
 */
const SAID_MAX = 60

export interface NudgeStore {
  said: string[]
  /** Epoch ms of the last unprompted message, or 0 when there has never been one. */
  lastAt: number
}

const EMPTY: NudgeStore = { said: [], lastAt: 0 }

export function loadNudgeStore(profileId: string): NudgeStore {
  try {
    const raw = localStorage.getItem(`${STORE_PREFIX}${profileId}`)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<NudgeStore>
    return {
      said: Array.isArray(parsed.said) ? parsed.said.filter(k => typeof k === 'string') : [],
      lastAt: typeof parsed.lastAt === 'number' ? parsed.lastAt : 0,
    }
  } catch {
    // Private browsing, a full store, or something that is not ours in the
    // slot. Saying a nudge twice is a far smaller failure than crashing the
    // chat, so this falls back to "nothing said yet".
    return EMPTY
  }
}

export function saveNudgeStore(profileId: string, store: NudgeStore): void {
  try {
    localStorage.setItem(`${STORE_PREFIX}${profileId}`, JSON.stringify(store))
  } catch {
    // ignore — the in-memory copy still governs this session.
  }
}

/** The store after speaking `keys` at `now`. Pure, so the caller owns the write. */
export function rememberNudge(store: NudgeStore, keys: string[], now: number): NudgeStore {
  const merged = [...store.said, ...keys.filter(k => !store.said.includes(k))]
  return {
    said: merged.slice(Math.max(0, merged.length - SAID_MAX)),
    lastAt: now,
  }
}

/**
 * Burns keys WITHOUT counting as having spoken. Used by the opener, which says
 * its one thing in the first bubble: that bubble is not an interruption — she
 * opened the chat herself — so it must not start the quiet period, but it must
 * still stop this module repeating what it just said.
 */
export function rememberWithoutSpeaking(store: NudgeStore, keys: string[]): NudgeStore {
  const merged = [...store.said, ...keys.filter(k => !store.said.includes(k))]
  return { said: merged.slice(Math.max(0, merged.length - SAID_MAX)), lastAt: store.lastAt }
}
