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

import { notification } from './coach-voice'

/**
 * Every moment that can reach a phone, in the order they outrank each other.
 * The order IS the behaviour: at most one notification goes out at a time, so
 * the first live moment wins and the rest wait for their own day.
 */
export const MOMENT_KEYS = [
  'session_feel',
  'session_not_logged',
  'missed_yesterday',
  'week_gone_quiet',
  'streak_at_risk',
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
}

/** Which moments this person has left switched on. Absent means on — see DEFAULT_MOMENT_SWITCHES. */
export type MomentSwitches = Partial<Record<MomentKey, boolean>>

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
export const QUIET_AFTER_HOUR = 21

/** The session-not-logged nudge waits until the day is genuinely getting on. */
export const NOT_LOGGED_AFTER_HOUR = 18

/** A week is "gone quiet" at this many days with nothing logged at all. */
export const QUIET_WEEK_DAYS = 7

export interface CoachMoment {
  key: MomentKey
  /** What the phone says. From the phrasebook, never written at a call site. */
  text: string
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
  }
}

/**
 * The one thing to say, or nothing.
 *
 * AT MOST ONE, EVER. Three buzzes in a row is how a person learns to swipe
 * notifications away without reading them, and the two that mattered go with
 * the one that did not. The order in MOMENT_KEYS decides which wins.
 */
export function momentToRaise(
  facts: MomentFacts,
  switches: MomentSwitches = {},
): CoachMoment | null {
  if (facts.localHour < QUIET_BEFORE_HOUR || facts.localHour > QUIET_AFTER_HOUR) return null
  for (const key of MOMENT_KEYS) {
    // ABSENT MEANS ON. A profile written before these columns existed has no
    // answer stored, and the honest reading of that is the default rather
    // than silence — a person who has never been asked has not said no.
    if (switches[key] === false) continue
    if (isLive(key, facts)) return { key, text: notification(key, facts.streakDays) }
  }
  return null
}

/**
 * EVERY MOMENT THAT IS LIVE, not just the winner. For the switches screen,
 * which needs to say what each one would do, and for a gate that wants to
 * prove the ordering rather than infer it from one sample.
 */
export function liveMoments(facts: MomentFacts): MomentKey[] {
  return MOMENT_KEYS.filter(k => isLive(k, facts))
}
