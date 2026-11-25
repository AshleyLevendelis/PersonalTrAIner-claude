// ---------------------------------------------------------------------------
// WHICH ONE THING IS WORTH INTERRUPTING SOMEONE FOR
//
// Ashley chose notifications on 17 Sep 2026 as the thing pulling her toward a
// real mobile app, and ruled on the scope in her own words: "Everything but
// the user should be able to toggle notifications on or off to reduce noise."
// All seven of the coach's proactive moments, each switchable, all on to
// begin with.
//
// THIS IS THE HALF THAT IS THE SAME EITHER WAY. The coach's seven moments are
// decided in the browser, during a render, which is why it can only speak
// when the app is open — and that is the opposite of accountability for the
// person who needs it most. What a server needs is not a second brain: it is
// the same decision, asked with facts it gathered itself. So this module is
// pure, holds no I/O, and takes every fact as an argument.
//
// IT DOES NOT REPLACE THE SEVEN MODULES, and that is deliberate. They decide
// what to SAY on screen, with all the context a screen has. This decides what
// is worth a buzz in someone's pocket, which is a different and much smaller
// question — and answering it here means the browser's behaviour does not
// change at all while it gains a second caller.
//
// NO CLOCK OF ITS OWN. `today` and `localHour` arrive as arguments, because a
// check must give the same answer on a Tuesday and because the server's clock
// is not the person's. See `.tour-harness/anchor.mjs` and test:harness-clock.
// ---------------------------------------------------------------------------

import { coachMessage, coachMessageShortcut, coachMessageChips } from './coach-voice'

/**
 * Every moment that can reach a phone, in the order they outrank each other.
 * The order IS the behaviour: at most one notification goes out at a time, so
 * the first live moment wins and the rest wait for their own day.
 */
export const MOMENT_KEYS = [
  'session_feel',
  'comeback',
  'door_open',
  'load_clash',
  'workout_today',
  'session_not_logged',
  'missed_yesterday',
  'pattern_spotted',
  'week_review',
  'plan_week',
  'meal_not_logged',
  'protein_short',
  'block_review',
  'beat_target',
] as const
export type MomentKey = typeof MOMENT_KEYS[number]

/**
 * THE FACTS, ALREADY GATHERED. Booleans and numbers, never stores or
 * promises — so this compiles and runs identically in the browser and in a
 * Deno edge function, and a gate can hand it any day it likes.
 */
export interface MomentFacts {
  /** The person's own local hour, 0-23. Theirs, not the server's. */
  localHour: number
  /** A session finished and nobody has asked how it went. */
  awaitingFeel: boolean
  /** Today is a training day, it is late enough to notice, and nothing is logged. */
  plannedToday: boolean
  loggedToday: boolean
  /** Yesterday was scheduled and nothing happened, and they have not said why. */
  missedYesterday: boolean
  /** Days since anything at all was logged. Null when they have never logged. */
  daysSinceAnyLog: number | null
  /**
   * WEEKLY RHYTHM (his strategy, 13 Nov 2026, slice 2). The person's own weekday (0 Sunday to 6 Saturday), and this
   * week's sessions so far, Monday to Sunday as the strip counts them. Optional: a caller without them raises neither
   * the review nor the plan-the-week message.
   */
  weekday?: number
  weekSessionsDone?: number
  weekSessionsPlanned?: number
  /** A block ended and its review has not been shown. */
  blockJustEnded: boolean
  /** The accelerator offer is waiting and has not been answered. */
  beatTargetPending: boolean
  /**
   * FOOD (4 Nov 2026, Ashley: "remind them to hit their protein goal or log a
   * meal"). Meals accounted for today — eaten, or said to be skipped — and
   * whether she logs meals at all (anything in the fortnight before today).
   * Optional, so a caller that knows nothing about food raises nothing about it.
   */
  mealsAccountedToday?: number
  logsMeals?: boolean
  /** Protein logged as eaten today, and today's target. A target of 0 is unknown. */
  proteinEatenToday?: number
  proteinTargetG?: number
  /**
   * WORDS ONLY, never a decision (6 Nov 2026, her "like a text from your
   * coach"): the name the coach uses for her, and when the session it asks
   * about finished. Neither changes WHETHER a moment is live.
   */
  name?: string | null
  finishedWhen?: 'this morning' | 'this afternoon' | 'this evening' | 'yesterday' | null
  /**
   * WHAT IS COMING UP (25 Nov 2026, his "not proactive enough"): today's session by name and main lift, a hard class
   * or sport against a heavy leg day, and one pattern worth raising. Words and two decisions (the clash, the pattern);
   * read off the days Home sent ahead (aheadFacts). Absent on a caller that knows none of it.
   */
  todaySession?: { name: string; lift: string | null; weight: string | null } | null
  clash?: { activity: string; when: 'today' | 'yesterday'; lift: string | null } | null
  pattern?: PatternFact | null
  /** Days since the pattern message was last said, or null when never: it is said at most once a week. */
  daysSincePatternSaid?: number | null
  /** This week's bests, Monday to Sunday, as Home last counted them: the review's "what moved". */
  weekBests?: { lift: string; best: string }[]
}

/** One pattern worth a message (days-ahead.ts PatternAhead, the same shape). */
export type PatternFact =
  | { kind: 'stuck_lift'; lift: string; weight: string; sessions: number }
  | { kind: 'too_hard'; times: number }
  | { kind: 'low_protein'; days: number }

/** The pattern message is said at most once in this many days. */
export const PATTERN_EVERY_DAYS = 7
/** The pattern message waits for the afternoon: never in front of the morning's session. */
export const PATTERN_FROM_HOUR = 12

/** The Monday of a date's Monday-to-Sunday week (the one "this week" every screen counts). */
function mondayOf(date: string): string {
  // 2026-11-23 is a Monday: whole days from it, modulo 7, is the weekday from Monday.
  const back = ((dayNumber(date) - dayNumber('2026-11-23')) % 7 + 7) % 7
  return dateShift(date, -back)
}
function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
}
/** A calendar date stepped by whole days: pure arithmetic on the date's own numbers, no clock and no timezone. */
function dateShift(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  // Days from the civil date (Howard Hinnant's algorithm), stepped, and back.
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  const z = era * 146097 + doe + n
  const era2 = Math.floor(z / 146097)
  const doe2 = z - era2 * 146097
  const yoe2 = Math.floor((doe2 - Math.floor(doe2 / 1460) + Math.floor(doe2 / 36524) - Math.floor(doe2 / 146096)) / 365)
  const doy2 = doe2 - (365 * yoe2 + Math.floor(yoe2 / 4) - Math.floor(yoe2 / 100))
  const mp = Math.floor((5 * doy2 + 2) / 153)
  const day = doy2 - Math.floor((153 * mp + 2) / 5) + 1
  const month = mp < 10 ? mp + 3 : mp - 9
  const year = yoe2 + era2 * 400 + (month <= 2 ? 1 : 0)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
function text(v: unknown, max = 80): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}
function count(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 && n < 100 ? Math.round(n) : null
}

/**
 * THE DAYS HOME SENT AHEAD, read for one local date (days-ahead.ts writes them). Every field is checked, because the
 * server reads what a phone wrote: anything malformed is simply absent. The clash rule is mine (CSCS, basis in
 * BACKLOG): a session built around a heavy lower-body lift, with a hard leg-taxing class the same day or the day before.
 * A pattern is trusted for two days after Home worked it out.
 */
export function aheadFacts(ahead: unknown, localToday: string): Pick<MomentFacts, 'todaySession' | 'clash' | 'pattern' | 'weekBests'> {
  const out: Pick<MomentFacts, 'todaySession' | 'clash' | 'pattern' | 'weekBests'> = { todaySession: null, clash: null, pattern: null, weekBests: [] }
  if (!ahead || typeof ahead !== 'object') return out
  const a = ahead as { asOf?: unknown; days?: unknown; pattern?: unknown; week?: unknown }
  const days = a.days && typeof a.days === 'object' ? a.days as Record<string, unknown> : {}
  const day = (date: string) => {
    const d = days[date]
    if (!d || typeof d !== 'object') return null
    const r = d as Record<string, unknown>
    return {
      session: text(r.session),
      lift: text(r.lift),
      weight: text(r.weight, 30),
      heavyLegs: r.heavyLegs === true,
      hard: Array.isArray(r.hardActivities) ? r.hardActivities.map(x => text(x, 40)).filter((x): x is string => !!x) : [],
    }
  }
  const today = day(localToday)
  const yesterday = day(dateShift(localToday, -1))
  if (today?.session) {
    out.todaySession = { name: today.session, lift: today.lift, weight: today.lift ? today.weight : null }
    if (today.heavyLegs) {
      if (today.hard[0]) out.clash = { activity: today.hard[0], when: 'today', lift: today.lift }
      else if (yesterday?.hard[0]) out.clash = { activity: yesterday.hard[0], when: 'yesterday', lift: today.lift }
    }
  }
  const asOf = typeof a.asOf === 'string' ? a.asOf : null
  const fresh = !!asOf && asOf <= localToday && dateShift(asOf, 2) >= localToday
  const p = fresh && a.pattern && typeof a.pattern === 'object' ? a.pattern as Record<string, unknown> : null
  if (p?.kind === 'stuck_lift' && text(p.lift) && text(p.weight, 30) && count(p.sessions)) {
    out.pattern = { kind: 'stuck_lift', lift: text(p.lift)!, weight: text(p.weight, 30)!, sessions: count(p.sessions)! }
  } else if (p?.kind === 'too_hard' && count(p.times)) {
    out.pattern = { kind: 'too_hard', times: count(p.times)! }
  } else if (p?.kind === 'low_protein' && count(p.days)) {
    out.pattern = { kind: 'low_protein', days: count(p.days)! }
  }
  // THIS WEEK'S BESTS, trusted only for the Monday-to-Sunday week they were counted in.
  const w = a.week && typeof a.week === 'object' ? a.week as { monday?: unknown; bests?: unknown } : null
  if (w && w.monday === mondayOf(localToday) && Array.isArray(w.bests)) {
    out.weekBests = w.bests
      .map(b => (b && typeof b === 'object' ? { lift: text((b as Record<string, unknown>).lift), best: text((b as Record<string, unknown>).best, 30) } : null))
      .filter((b): b is { lift: string; best: string } => !!b?.lift && !!b.best)
      .slice(0, 2)
  }
  return out
}

/** Which moments this person has left switched on. Absent means on — see DEFAULT_MOMENT_SWITCHES. */
export type MomentSwitches = Partial<Record<MomentKey, boolean>>

/**
 * HOW OFTEN THE COACH REACHES OUT — Ashley's ruling, 6 Nov 2026, "Three
 * levels", over two levels and over a number picker, so nobody is overwhelmed:
 * Light is one a day, Normal up to three (the default, her 4 Nov "Up to 3,
 * spaced"), Lots up to five. Every level keeps the three-hour gap, the waking
 * hours and the per-message switches. Five fit the window: 8, 11, 14, 17, 20.
 */
export const REMINDER_FREQUENCIES = ['light', 'normal', 'lots'] as const
export type ReminderFrequency = typeof REMINDER_FREQUENCIES[number]
export const DEFAULT_FREQUENCY: ReminderFrequency = 'normal'
const DAILY_CAP: Record<ReminderFrequency, number> = { light: 1, normal: 3, lots: 5 }

/** The day's limit for a stored setting. Anything unknown or absent reads as Normal: never asked is not "less". */
export function dailyCap(frequency: unknown): number {
  return DAILY_CAP[(REMINDER_FREQUENCIES as readonly unknown[]).includes(frequency) ? frequency as ReminderFrequency : DEFAULT_FREQUENCY]
}

/**
 * EVERYTHING ON THE REMINDERS SCREEN, as one stored object (the profile's
 * `notification_switches`): the per-message switches, the frequency, and
 * whether a coach REPLY pings (6 Nov 2026). Absent keys mean the defaults.
 */
export type NotificationSettings = MomentSwitches & {
  frequency?: ReminderFrequency
  /** A reply to a message she sent. Never held back by the frequency: she asked, the coach answers. */
  coach_reply?: boolean
  /** When the coach last turned itself down a level after going unanswered (his strategy, 13 Nov 2026). */
  frequency_dropped_at?: string
  /** After a red flag (his ruling 14 Nov 2026, "Park it, go quiet"): nothing unprompted until this time (ISO). */
  quiet_until?: string
  /** A plan pause (his ruling 14 Nov 2026, "Add a pause"): the date it began; while set, nothing unprompted is sent. Not a stored switch: read from the profile. */
  plan_paused_since?: string | null
}

/**
 * ALL ON, because that is what Ashley chose. The risk this accepts is being
 * ignored rather than being too quiet, and her answer to that risk was
 * switches that are easy to find — not fewer notifications.
 */
export const DEFAULT_MOMENT_SWITCHES: Record<MomentKey, boolean> =
  Object.fromEntries(MOMENT_KEYS.map(k => [k, true])) as Record<MomentKey, boolean>

/**
 * NOBODY IS BUZZED AT 3AM, and this is a default I chose rather than a ruling.
 * It is the one rule here that is not about coaching: a notification outside
 * waking hours is not accountability, it is a bad night's sleep. 8am to 9pm on
 * the PERSON'S clock, which is why localHour is an argument. Easy to move, and
 * named here so moving it is a decision rather than a discovery.
 */
export const QUIET_BEFORE_HOUR = 8
/** The first quiet hour: nothing from 9pm on, which is what the Reminders screen promises ("never ... after 9pm"). It
 * allowed the whole 9pm hour until 7 Nov 2026 (the whole-app QA walk saw "Got twenty minutes?" at 9:30pm). */
export const QUIET_AFTER_HOUR = 21

/** The session-not-logged nudge waits until the day is genuinely getting on. */
export const NOT_LOGGED_AFTER_HOUR = 18

/**
 * THE COMEBACK PATH (his strategy, 13 Nov 2026, slice 2, docs/plans/coach-rhythm.md §2b). After three quiet days one
 * message with one small step and no mention of what was missed; after two weeks one "the door is open", then SILENCE:
 * nothing unprompted at all until he logs something again. Each is said on the day the gap reaches it, once a lapse.
 */
export const COMEBACK_AFTER_DAYS = 3
export const DOOR_OPEN_AFTER_DAYS = 14

/** The weekly review on Saturday from noon, plan the week on Sunday from noon: the strategy's weekend lunchtime. */
export const WEEK_REVIEW_WEEKDAY = 6
export const PLAN_WEEK_WEEKDAY = 0
export const WEEKEND_FROM_HOUR = 12

/**
 * HOW CLOSE TOGETHER — Ashley's ruling, 4 Nov 2026, "Up to 3, spaced": at
 * least three hours apart, at every frequency. How MANY is `dailyCap`.
 */
export const MIN_HOURS_BETWEEN = 3

/**
 * THE MORNING REMINDER, 4 Nov 2026 (her "remind them of an upcoming
 * workout"): from the start of the day until this hour, on a training day
 * with nothing logged yet. Before lunch, because a reminder at 3pm is the
 * evening nudge arriving early. My default, flagged to her.
 */
export const WORKOUT_REMINDER_BEFORE_HOUR = 12

/**
 * THE FOOD NUDGES wait for the evening: a day's eating is not short at
 * lunchtime, it is unfinished. My default, flagged to her.
 */
export const FOOD_NUDGE_AFTER_HOUR = 19

/**
 * BEHIND ON PROTEIN means under 80% of the target AND at least 20g short, with
 * two or more meals logged. Under two meals the gap is far more likely an
 * unlogged meal than an uneaten one, and that has its own nudge. The 80% sits
 * well under the app's own on-target floor (95%), so the nudge is about a real
 * gap at the end of a day, not a rounding (CSCS, population-level nutrition).
 */
export const PROTEIN_SHORT_SHARE = 0.8
export const PROTEIN_SHORT_MIN_G = 20

export interface CoachMoment {
  key: MomentKey
  /** What the coach says, on the phone and in the chat alike. From the phrasebook, never written at a call site. */
  text: string
  /** The small button under the message in the chat, if it has one. */
  shortcut: 'exercise' | 'nutrition' | null
  /** The one-tap answers under the message in the chat (coachMessageChips); empty when it offers nothing. */
  chips: string[]
}

/** Is this moment live, on the facts alone? Switches and quiet hours are applied above. */
/**
 * A LAPSE HAS BEGUN at three quiet days (the comeback path): from then the coach stops reminding him of sessions and of
 * what was missed. The comeback (day 3) and the open door (day 14) are its only training messages, so each really is
 * the one message, not one more nag beside the daily reminders.
 */
function inLapse(f: MomentFacts): boolean {
  return f.daysSinceAnyLog !== null && f.daysSinceAnyLog >= COMEBACK_AFTER_DAYS
}

function isLive(key: MomentKey, f: MomentFacts): boolean {
  if ((key === 'workout_today' || key === 'session_not_logged' || key === 'missed_yesterday' || key === 'load_clash' || key === 'pattern_spotted') && inLapse(f)) return false
  switch (key) {
    case 'session_feel': return f.awaitingFeel
    // NOT "it is a training day" — "it is a training day, it is evening, and
    // nothing is logged". A nudge at 9am about a session someone intends to do
    // after work is a nag about nothing.
    case 'session_not_logged': return f.plannedToday && !f.loggedToday && f.localHour >= NOT_LOGGED_AFTER_HOUR
    case 'missed_yesterday': return f.missedYesterday
    case 'comeback': return f.daysSinceAnyLog === COMEBACK_AFTER_DAYS
    case 'door_open': return f.daysSinceAnyLog === DOOR_OPEN_AFTER_DAYS
    case 'week_review': return f.weekday === WEEK_REVIEW_WEEKDAY && f.localHour >= WEEKEND_FROM_HOUR && (f.weekSessionsPlanned ?? 0) > 0
    case 'plan_week': return f.weekday === PLAN_WEEK_WEEKDAY && f.localHour >= WEEKEND_FROM_HOUR
    case 'block_review': return f.blockJustEnded
    case 'beat_target': return f.beatTargetPending
    // NOT "today is a training day": a reminder after she has already logged
    // is a reminder about nothing, and one after lunch is the evening nudge early.
    // THE CLASH SAYS IT INSTEAD (25 Nov 2026): the same morning, the same session, and the clash is the thing worth saying.
    case 'workout_today': return f.plannedToday && !f.loggedToday && f.localHour < WORKOUT_REMINDER_BEFORE_HOUR && !(f.clash && f.todaySession)
    case 'load_clash': return !!f.clash && !!f.todaySession && f.plannedToday && !f.loggedToday && f.localHour < WORKOUT_REMINDER_BEFORE_HOUR
    // The Saturday review carries the pattern as its one change, so the pattern waits that afternoon.
    case 'pattern_spotted': return !!f.pattern && f.localHour >= PATTERN_FROM_HOUR && !isLive('week_review', f)
      && (f.daysSincePatternSaid == null || f.daysSincePatternSaid >= PATTERN_EVERY_DAYS)
    // ONLY SOMEONE WHO LOGS MEALS. Somebody who has never logged one is not
    // reminded every evening about a habit she does not have; that is a daily
    // nag, and the switch would be the only way out of it.
    case 'meal_not_logged': return !!f.logsMeals && (f.mealsAccountedToday ?? 0) < 2 && f.localHour >= FOOD_NUDGE_AFTER_HOUR
    case 'protein_short': {
      const target = f.proteinTargetG ?? 0
      const eaten = f.proteinEatenToday ?? 0
      return target > 0 && (f.mealsAccountedToday ?? 0) >= 2 && f.localHour >= FOOD_NUDGE_AFTER_HOUR
        && eaten < target * PROTEIN_SHORT_SHARE && target - eaten >= PROTEIN_SHORT_MIN_G
    }
  }
}

/**
 * The one thing to say now, or nothing.
 *
 * AT MOST ONE AT A TIME. Three buzzes in a row is how a person learns to swipe
 * notifications away without reading them, and the two that mattered go with
 * the one that did not. The order in MOMENT_KEYS decides which wins.
 */
export function momentToRaise(
  facts: MomentFacts,
  switches: MomentSwitches = {},
): CoachMoment | null {
  return momentsToRaise(facts, switches)[0] ?? null
}

/**
 * EVERY MOMENT THAT MAY SPEAK NOW, best first: live, switched on, inside
 * waking hours. Since 4 Nov 2026 (her "Up to 3, spaced") a day can hold more
 * than one notification, so the sender walks this list and takes the first
 * that its own limits allow — the evening nudge already sent at 6pm must not
 * stand in front of the food nudge at 7pm for the rest of the evening.
 */
export function momentsToRaise(
  facts: MomentFacts,
  switches: NotificationSettings = {},
  nowMs?: number,
): CoachMoment[] {
  if (facts.localHour < QUIET_BEFORE_HOUR || facts.localHour >= QUIET_AFTER_HOUR) return []
  // QUIET AFTER A RED FLAG (his ruling 14 Nov 2026, "Park it, go quiet"): no cheerful message, no workout reminder.
  if (nowMs !== undefined && quietAfterRedFlag(switches, nowMs)) return []
  // PAUSED (his ruling 14 Nov 2026, "Add a pause"): no workout reminder, no cheerful nudge, no comeback message.
  if ((switches as NotificationSettings).plan_paused_since) return []
  // THEN SILENCE (the comeback path): after the door-open day, nothing unprompted until he logs something again.
  if (facts.daysSinceAnyLog !== null && facts.daysSinceAnyLog > DOOR_OPEN_AFTER_DAYS) return []
  const out: CoachMoment[] = []
  for (const key of MOMENT_KEYS) {
    // ABSENT MEANS ON. A profile written before these columns existed has no
    // answer stored, and the honest reading of that is the default rather
    // than silence — a person who has never been asked has not said no.
    if (switches[key] === false) continue
    if (isLive(key, facts)) {
      out.push({
        key,
        text: coachMessage(key, { name: facts.name, mealsLogged: facts.mealsAccountedToday ?? 0, finishedWhen: facts.finishedWhen, weekDone: facts.weekSessionsDone, weekPlanned: facts.weekSessionsPlanned, session: facts.todaySession ?? null, clash: facts.clash ?? null, pattern: facts.pattern ?? null, weekBests: facts.weekBests ?? [] }),
        shortcut: coachMessageShortcut(key),
        chips: coachMessageChips(key, { pattern: facts.pattern ?? null }),
      })
    }
  }
  return out
}

/**
 * EVERY MOMENT THAT IS LIVE, not just the winner. For the switches screen,
 * which needs to say what each one would do, and for a gate that wants to
 * prove the ordering rather than infer it from one sample.
 */
export function liveMoments(facts: MomentFacts): MomentKey[] {
  return MOMENT_KEYS.filter(k => isLive(k, facts))
}

/** A stored quiet after a red flag is still running (his ruling 14 Nov 2026, "Park it, go quiet"). */
export function quietAfterRedFlag(switches: MomentSwitches | NotificationSettings, nowMs: number): boolean {
  const until = (switches as NotificationSettings).quiet_until
  const t = typeof until === 'string' ? Date.parse(until) : NaN
  return Number.isFinite(t) && nowMs < t
}
