// ---------------------------------------------------------------------------
// Feature flags for capabilities that exist in the codebase but must not be
// offered to real users yet — VISION.md's "Only offer what's built": the app
// never offers a style, a mode, or an audience it cannot genuinely serve, and
// a picker listing an option the engine can't build is a promise the product
// doesn't keep.
//
// Deliberately localStorage-based and read at call time, mirroring the
// existing dev-mode idiom in dev-clock.ts (isDevAccount/enableDevMode) rather
// than inventing a second mechanism. No env var: these need to be flippable
// on a real device mid-session, not at build time.
// ---------------------------------------------------------------------------

const ACTIVITY_FORMAT_KEY = 'fitplan_ff_activity_format'

/**
 * Activity-shaped plans (walking/swimming, duration + frequency).
 *
 * OFF by default and for every real user. Slice one built the intake and
 * schema for this format but deliberately NOT the generator — so selecting
 * it would strand a user on a plan the engine cannot produce. The flag is
 * what keeps the onboarding option invisible until the generator lands.
 *
 * To turn it on for your own testing, run this in the browser console on the
 * app's own origin, then reload:
 *
 *     localStorage.setItem('fitplan_ff_activity_format', 'true')
 *
 * To turn it off again:
 *
 *     localStorage.removeItem('fitplan_ff_activity_format')
 */
export function isActivityFormatEnabled(): boolean {
  try {
    return localStorage.getItem(ACTIVITY_FORMAT_KEY) === 'true'
  } catch {
    // Private mode / storage disabled — fail CLOSED. An unavailable flag
    // store must never accidentally expose an unbuildable plan format.
    return false
  }
}

export function setActivityFormatEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(ACTIVITY_FORMAT_KEY, 'true')
    else localStorage.removeItem(ACTIVITY_FORMAT_KEY)
  } catch {
    // ignore — see above
  }
}
