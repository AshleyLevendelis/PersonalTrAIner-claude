// ---------------------------------------------------------------------------
// A PLAN PAUSE (his ruling 14 Nov 2026, "Add a pause"; docs/plans/plan-pause.md). From the day it starts until he
// resumes: no session is due and none is missed, no workout reminder or cheerful nudge is sent, meals carry on. The
// plan's rows are not touched, so the plan waits; on resume the "coming back after a break" easing applies by itself
// (it reads only the last logged session).
//
// ONE PLACE TO ASK. The profile's `plan_paused_since` (a local date, null when not paused) is mirrored here by App, so
// the week strip, today's card, the tallies, the coach's missed-yesterday and the chat's unprompted messages all read
// the same answer without each being handed the profile.
// ---------------------------------------------------------------------------

import { shortDate } from './day-labels'

const pausedSince = new Map<string, string | null>()

/** App mirrors the profile's answer here on load and on every change. */
export function setPlanPausedSince(profileId: string, since: string | null | undefined): void {
  pausedSince.set(profileId, since ?? null)
}

/** The local date the pause began, or null when the plan is running. */
export function planPausedSince(profileId: string | null | undefined): string | null {
  return profileId ? pausedSince.get(profileId) ?? null : null
}

/**
 * THE ONE PAUSE FUNCTION, reachable from any screen (15 Nov 2026: the sharp-pain step offers "Pause my plan", his
 * ruling "Add Pause"). App registers its handlePlanPause here, the same function Profile and the coach confirm through.
 */
let pauseHandler: { profileId: string; run: (pause: boolean) => Promise<string | null> } | null = null
export function setPlanPauseHandler(profileId: string, run: (pause: boolean) => Promise<string | null>): void {
  pauseHandler = { profileId, run }
}
/** A pause can be offered: the handler is there and the plan is running. */
export function canOfferPause(): boolean {
  return !!pauseHandler && !planPausedSince(pauseHandler.profileId)
}
/** Pause through App's handler. Null when done, else the sentence to show. */
export async function requestPlanPause(): Promise<string | null> {
  return pauseHandler ? pauseHandler.run(true) : PAUSE_WORDS.notLive
}

/** Is this date inside a pause that began on `since`? Every day from the start on, until he resumes. */
export function isPausedOn(date: string, since: string | null | undefined): boolean {
  return !!since && date >= since
}

/** The app's words about a pause. */
export const PAUSE_WORDS = {
  pause: 'Pause my plan',
  resume: 'Resume my plan',
  // A day he would say ("Sun 15 Nov"), never the stored "2026-11-15" (15 Nov 2026, browser test).
  paused: (since: string) => `Plan paused since ${shortDate(since)}. Nothing is due and nothing counts as missed. Meals carry on.`,
  card: 'Plan paused',
  // "Eased in" only after a real break: the easing starts at 10 days away (15 Nov 2026, browser test: a few-minute
  // pause, no easing, while these words promised it).
  cardLine: 'Nothing is due while your plan is paused. If you\'re away 10 days or more, your first session back is eased in.',
  notLive: "Pausing isn't switched on yet.",
  done: 'Your plan is paused. Nothing is due and I won\'t send workout reminders until you resume. Meals carry on.',
  resumed: 'Welcome back. Your plan is running again. If you\'ve been away 10 days or more, your first session back is eased in.',
  offerPause: 'Pause your plan from today? Nothing will be due or count as missed, and no workout reminders until you resume.',
  offerResume: 'Start your plan again from today? If you\'ve been away 10 days or more, your first session back is eased in.',
  unchanged: 'Your meals, history and settings stay as they are.',
  alreadyPaused: (since: string) => `Your plan is already paused, since ${shortDate(since)}.`,
  notPaused: "Your plan isn't paused, so there's nothing to resume.",
}
