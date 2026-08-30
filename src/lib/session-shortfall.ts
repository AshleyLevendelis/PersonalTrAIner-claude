// ---------------------------------------------------------------------------
// WHEN A SESSION IS SHORTER THAN THE ONE SOMEBODY ASKED FOR — audit §6.5.
//
// Measured (npm run report:timefit-recovery): 2.3% of combinations have a
// training day more than 10% under the minimum requested, worst case 21%
// under — 35 minutes against a 45-60 request. Nothing runs OVER.
//
// The cause is concentrated rather than general: 5 of the 6 failing
// combinations are minimalist equipment and 5 of 6 are novice. The pool of
// exercises that person's equipment supports is too thin to fill the time.
//
// SO THE FIX IS NOT MORE WORK. The engine cannot invent exercises the
// equipment does not support, and padding with repeats of what is already
// there would be volume for the sake of a number. What it can stop doing is
// printing "~35 min" beside a request for 45-60 with no explanation, leaving
// somebody to conclude the app ignored them.
//
// This module decides only whether to say something, and what. It changes no
// prescription — deliberately, because the alternative is inflating a session
// to hit a target, which is the shape of fabrication this codebase refuses
// everywhere else.
// ---------------------------------------------------------------------------

import { getSessionMinimumSeconds } from './session-duration'
import type { SessionDuration } from './types'

/**
 * Under by more than this and it is worth a sentence. Below it, a session
 * that runs a few minutes short is normal variance and saying so every time
 * would be noise.
 */
const MATERIAL_SHORTFALL = 0.10

export interface SessionShortfall {
  /** Whole minutes the day is estimated at. */
  actualMinutes: number
  /** What they asked for, as they chose it. */
  requested: SessionDuration
  /** 0.21 for "21% under". */
  fraction: number
  /** One sentence, ready to show. */
  note: string
}

/**
 * Is this day materially shorter than the length they asked for, and if so,
 * what should it say?
 *
 * Returns null for a session that fits, for one that runs LONG (a different
 * problem, and one the engine already avoids), and for a deload — a recovery
 * week is meant to be shorter, so flagging it would be telling somebody their
 * plan is broken for working correctly.
 */
export function describeSessionShortfall(
  estimatedSeconds: number,
  requested: SessionDuration | undefined,
  options: { isDeload?: boolean; lowRecovery?: boolean } = {},
): SessionShortfall | null {
  if (!requested) return null
  // A deload is short on purpose.
  if (options.isDeload) return null
  // So is a low-recovery week: computeDurationTopUp gives that profile zero
  // top-up deliberately, so its shorter sessions are the setting working, not
  // the engine failing. Flagging them would contradict the app's own choice.
  if (options.lowRecovery) return null

  const minimum = getSessionMinimumSeconds(requested)
  if (estimatedSeconds >= minimum) return null

  const fraction = (minimum - estimatedSeconds) / minimum
  if (fraction <= MATERIAL_SHORTFALL) return null

  return {
    actualMinutes: Math.round(estimatedSeconds / 60),
    requested,
    fraction,
    // Says WHY, and does not apologise for it. The session is the right
    // amount of work for the equipment available; it is the silence that was
    // wrong, not the length.
    note:
      `This one runs shorter than the ${requested} you asked for — there is only so much ` +
      `your equipment can be worked through in a session. Add time with the extra-work ` +
      `button if you want it.`,
  }
}
