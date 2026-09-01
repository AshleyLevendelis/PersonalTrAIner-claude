import type { UserProfile, WorkoutDay, PlannedActivity } from '@/lib/types'

// ---------------------------------------------------------------------------
// "Starting out" — the coaching call that a given day should be a WALK rather
// than a set-and-rep session.
//
// There is no separate kind of plan. A plan is a plan: same 16 weeks, same
// blocks, same days, same everything downstream. The only thing that differs
// is what's prescribed INSIDE a day — an exercise list, or an activity and a
// duration. That's why this file is small and sits beside the generator
// rather than forking it, and why nothing here creates a second plan type.
//
// WHO THIS IS FOR, and why it reads two existing answers rather than asking a
// new question: someone who says they're a beginner AND that their day-to-day
// is sedentary has told us, in their own words, that they aren't currently
// exercising. Handing that person a barbell programme is the failure the
// broadened vision exists to fix. Someone who is a beginner but on their feet
// all day has real work capacity and doesn't need this; someone experienced
// but currently sedentary is returning, not starting. Both keep the normal
// plan. The user is never asked to classify themselves into a category —
// they answer the same questions everyone answers, and the coach decides.
//
// NUMBERS BELOW ARE A COACHING DECISION, gathered in one place on purpose.
// They're deliberately conservative and build toward the widely-cited ~150
// minutes a week of moderate activity: three days at 20 minutes is 60, and
// the ramp reaches ~135 by the end of a 16-week plan without ever jumping.
// Ashley should sanity-check these; changing them is changing these four
// constants and nothing else.
// ---------------------------------------------------------------------------

export const STARTING_OUT_PRESCRIPTION = {
  /** Minutes in block 1. Short enough that a genuinely deconditioned person finishes it. */
  startMinutes: 20,
  /**
   * Added per four-week BLOCK, not per week. A first-timer's progression is
   * turning up, not adding minutes — holding one dose for a month and then
   * stepping once is what a coach actually does. (Stepping weekly was tried
   * and rejected: it raced to the ceiling by week 6 and then flatlined for
   * ten weeks, which reads as "the plan stopped caring".)
   */
  blockIncrementMinutes: 5,
  /**
   * Ceiling per session. Past this, more minutes stops being the useful
   * progression — pace or frequency is the next lever, and neither is built
   * yet. Over a 16-week plan the ramp lands at 35, well inside this.
   */
  capMinutes: 45,
  /**
   * Effort target on the app's usual 1-10 scale. 3 is a conversational pace:
   * you can talk in full sentences. Deliberately low — the aim of these first
   * blocks is turning up regularly, not getting out of breath.
   */
  targetRpe: 3,
} as const

/**
 * Does this person's own answers say they aren't exercising yet?
 *
 * Reads two questions they already answer. Nothing new is asked, and no
 * question exists whose only purpose is to route them.
 */
export function isStartingOut(profile: UserProfile): boolean {
  return profile.training_experience === 'beginner' && profile.activity_level === 'sedentary'
}

/** Minutes for a given four-week block (1-indexed), never above the cap. */
export function startingOutMinutes(blockNumber: number): number {
  const { startMinutes, blockIncrementMinutes, capMinutes } = STARTING_OUT_PRESCRIPTION
  const stepped = startMinutes + Math.max(0, blockNumber - 1) * blockIncrementMinutes
  return Math.min(stepped, capMinutes)
}

function reasonFor(blockNumber: number, minutes: number): string {
  if (blockNumber <= 1) {
    return 'Starting where you are — a walk you can hold a conversation through. Turning up is the whole job for now; everything else builds on it.'
  }
  return `${minutes} minutes now, five more than last block. Same easy pace — the only thing changing is how long you're out.`
}

/**
 * Turn one generated training day into a walk. Keeps the day itself — its
 * weekday, its place in the week, the fact that it's scheduled — and replaces
 * only what's prescribed in it.
 */
/**
 * The whole walk prescription for a block — minutes AND the sentence that
 * explains them, which must move together.
 *
 * Exported because generateMesocycle re-prescribes each block's walks and was
 * patching only `duration`, leaving block 1's "Starting where you are" text
 * attached to a week-13 walk. Two callers each building the activity by hand
 * is what let the two halves drift; there is now one builder and no way to
 * update the number without the words.
 */
export function startingOutActivity(blockNumber: number): PlannedActivity {
  const minutes = startingOutMinutes(blockNumber)
  return {
    activity: 'Walk',
    duration: minutes,
    targetRpe: STARTING_OUT_PRESCRIPTION.targetRpe,
    reason: reasonFor(blockNumber, minutes),
  }
}

export function toStartingOutDay(day: WorkoutDay, blockNumber = 1): WorkoutDay {
  const activity = startingOutActivity(blockNumber)
  return {
    day: day.day,
    focus: 'Walk',
    exercises: [],
    is_scheduled: true,
    plannedActivity: activity,
    // Warm-up, conditioning notes and gap notes all belong to exercise
    // selection — none of them apply to a walk, so they're dropped rather
    // than carried through meaninglessly.
  }
}

/**
 * Apply the starting-out prescription across a generated week.
 *
 * Only days that were REAL TRAINING DAYS become walks. Days the conditioning
 * pass appended (a rest-day cardio suggestion, which carries no exercises)
 * are dropped entirely: the walk already IS this person's cardio, and keeping
 * them turned a chosen three-day week into five sessions — precisely the
 * overload someone starting from nothing must not be handed.
 */
export function applyStartingOut(days: WorkoutDay[], blockNumber = 1): WorkoutDay[] {
  return days
    .filter(d => d.exercises.length > 0)
    .map(d => toStartingOutDay(d, blockNumber))
}
