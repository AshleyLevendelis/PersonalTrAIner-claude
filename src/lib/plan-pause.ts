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

const pausedSince = new Map<string, string | null>()

/** App mirrors the profile's answer here on load and on every change. */
export function setPlanPausedSince(profileId: string, since: string | null | undefined): void {
  pausedSince.set(profileId, since ?? null)
}

/** The local date the pause began, or null when the plan is running. */
export function planPausedSince(profileId: string | null | undefined): string | null {
  return profileId ? pausedSince.get(profileId) ?? null : null
}

/** Is this date inside a pause that began on `since`? Every day from the start on, until he resumes. */
export function isPausedOn(date: string, since: string | null | undefined): boolean {
  return !!since && date >= since
}

/** The app's words about a pause. */
export const PAUSE_WORDS = {
  pause: 'Pause my plan',
  resume: 'Resume my plan',
  paused: (since: string) => `Plan paused since ${since}. Nothing is due and nothing counts as missed. Meals carry on.`,
  card: 'Plan paused',
  cardLine: 'Nothing is due while your plan is paused. Your first session back will be eased in.',
  notLive: "Pausing isn't switched on yet.",
  done: 'Your plan is paused. Nothing is due and I won\'t send workout reminders until you resume. Meals carry on.',
  resumed: 'Welcome back. Your plan is running again, and your first session back is eased in.',
  offerPause: 'Pause your plan from today? Nothing will be due or count as missed, and no workout reminders until you resume.',
  offerResume: 'Start your plan again from today? Your first session back is eased in.',
  unchanged: 'Your meals, history and settings stay as they are.',
  alreadyPaused: (since: string) => `Your plan is already paused, since ${since}.`,
  notPaused: "Your plan isn't paused, so there's nothing to resume.",
}
