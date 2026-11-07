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

import { coachMessage, coachMessageShortcut } from './coach-voice'

/**
 * Every moment that can reach a phone, in the order they outrank each other.
 * The order IS the behaviour: at most one notification goes out at a time, so
 * the first live moment wins and the rest wait for their own day.
 */
export const MOMENT_KEYS = [
  'session_feel',
  'workout_today',
  'session_not_logged',
  'missed_yesterday',
  'week_gone_quiet',
  'streak_at_risk',
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
  /** Days in the current streak, and whether today would break it. */
  streakDays: number
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

/** A week is "gone quiet" at this many days with nothing logged at all. */
export const QUIET_WEEK_DAYS = 7

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
}

/** Is this moment live, on the facts alone? Switches and quiet hours are applied above. */
function isLive(key: MomentKey, f: MomentFacts): boolean {
  switch (key) {
    case 'session_feel': return f.awaitingFeel
    // NOT "it is a training day" — "it is a training day, it is evening, and
    // nothing is logged". A nudge at 9am about a session someone intends to do
    // after work is a nag about nothing.
    case 'session_not_logged': return f.plannedToday && !f.loggedToday && f.localHour >= NOT_LOGGED_AFTER_HOUR
    case 'missed_yesterday': return f.missedYesterday
    case 'week_gone_quiet': return f.daysSinceAnyLog !== null && f.daysSinceAnyLog >= QUIET_WEEK_DAYS
    // A streak only counts as at risk once there IS one. Telling somebody on
    // day zero that their streak is in danger is the app inventing a stake.
    case 'streak_at_risk': return f.streakDays >= 3 && f.plannedToday && !f.loggedToday && f.localHour >= NOT_LOGGED_AFTER_HOUR
    case 'block_review': return f.blockJustEnded
    case 'beat_target': return f.beatTargetPending
    // NOT "today is a training day": a reminder after she has already logged
    // is a reminder about nothing, and one after lunch is the evening nudge early.
    case 'workout_today': return f.plannedToday && !f.loggedToday && f.localHour < WORKOUT_REMINDER_BEFORE_HOUR
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
  switches: MomentSwitches = {},
): CoachMoment[] {
  if (facts.localHour < QUIET_BEFORE_HOUR || facts.localHour >= QUIET_AFTER_HOUR) return []
  const out: CoachMoment[] = []
  for (const key of MOMENT_KEYS) {
    // ABSENT MEANS ON. A profile written before these columns existed has no
    // answer stored, and the honest reading of that is the default rather
    // than silence — a person who has never been asked has not said no.
    if (switches[key] === false) continue
    if (isLive(key, facts)) {
      out.push({
        key,
        text: coachMessage(key, { name: facts.name, streak: facts.streakDays, mealsLogged: facts.mealsAccountedToday ?? 0, finishedWhen: facts.finishedWhen }),
        shortcut: coachMessageShortcut(key),
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
