// ---------------------------------------------------------------------------
// IS THIS A WEIGHT THIS PERSON COULD ACTUALLY HAVE LIFTED?
//
// lift-plausibility.ts guards the weights someone STATES in onboarding.
// load-prescription.ts guards the weights the app PRESCRIBES. Nothing guarded
// the weights someone LOGS, which is the number that outlives both: it becomes
// a PR, it becomes next week's target, and it is the one figure here a user
// can produce with a single mistyped keystroke.
//
// Measured live, 7 Sep 2026, on a novice profile that had just told the app
// its heaviest dumbbells are 24kg per hand: typing 500 into a Dumbbell Floor
// Press set saved without a murmur, the session summary announced "NEW PRS —
// Dumbbell Floor Press 500kg", Home repeated it, and the plan's next-session
// note read "Held at 500kg — didn't hit 11 reps on every set last time." A
// "10" typed as "100" would do the same thing far more quietly.
//
// Ashley's ruling, 7 Sep 2026, given the four options: ASK ONCE, THEN TRUST
// THEM. Chosen over marking the set unverified (a genuine PR would be
// withheld without the user knowing) and over refusing the save outright
// (which calls someone a liar about their own workout). It is the same ruling
// she made for stated lifts — ask once, do not nag.
//
// DELIBERATELY NARROW, for the same reason lift-plausibility is. The ceiling
// used here is effectiveLoadingCeilingKg: the lower of what the implement can
// physically hold (a table that already carries ~25% headroom over the
// heaviest legitimate value — see test:load-ceiling-units) and what this
// trainee has said they own. It is the app's own answer to "what could be
// loaded here", so a weight above it is not a judgement about strength; it is
// a weight that does not fit on the equipment. Nothing else fires.
//
// NO SECOND COPY OF THE NUMBERS. This calls effectiveLoadingCeilingKg rather
// than re-deriving a ceiling, so a load cannot be judged one way when it is
// prescribed and another way when it is logged — the same divergence the
// ceiling-reconcile and almond-butter fixes were both about.
// ---------------------------------------------------------------------------

import { getExerciseEntry } from './exercise-db'
import { categorize, effectiveLoadingCeilingKg } from './load-prescription'
import type { UserProfile } from './types'

/**
 * The ceiling a logged weight should be questioned above, or null when there
 * is nothing to check it against.
 *
 * Null — never a number — when the exercise is not in the catalogue (an
 * off-plan or chat-logged movement has no implement to reason about) or when
 * there is no profile yet. A caller treating null as "no opinion" is the
 * honest reading: silence here has never meant the weight is sensible.
 */
export function loggedLoadCeilingKg(
  exerciseName: string,
  profile: UserProfile | null | undefined,
): number | null {
  if (!profile) return null
  const entry = getExerciseEntry(exerciseName)
  if (!entry) return null
  // categorize() rather than a category threaded down from the caller: the
  // two places that special-case a ceiling (leg press, calf machine) key off
  // it, and a caller passing null for convenience would silently price a leg
  // press against the generic stack ceiling.
  const ceiling = effectiveLoadingCeilingKg(entry, categorize(entry), profile)
  return Number.isFinite(ceiling) && ceiling > 0 ? ceiling : null
}

/**
 * True when a logged weight is above what could be loaded on this movement.
 *
 * `isBodyweight` short-circuits: a bodyweight row stores 0kg, and an
 * added-load row (a weighted chin-up) is asking a different question of the
 * same field, so neither is measured against an implement ceiling.
 */
export function isImplausibleLoggedLoad(
  weightKg: number,
  ceilingKg: number | null,
  isBodyweight: boolean,
): boolean {
  if (isBodyweight || ceilingKg == null) return false
  return Number.isFinite(weightKg) && weightKg > ceilingKg
}
