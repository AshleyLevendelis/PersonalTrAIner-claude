// ---------------------------------------------------------------------------
// THE APP IS FOR 16 AND OVER: his ruling 26 Nov 2026, "16+, setup stops younger" (from four options, over 18+, 13+
// and the policy saying it with no check). Setup takes a date of birth or an age; an answer under 16 stops setup on a
// screen of its own and no account is made. CSCS basis, mine: the app's calorie targets and loads are written for
// adults, and a coach would not hand an adult plan to a body that is still growing.
// One rule, read by setup (and by any later check), so the number lives in one place.
// ---------------------------------------------------------------------------

const MINIMUM_AGE = 16

/** True when an age has been given and it is under the minimum. A blank or unreadable age is not under it. */
export function isUnderMinimumAge(age: unknown): boolean {
  const n = typeof age === 'number' ? age : typeof age === 'string' && age.trim() !== '' ? Number(age) : NaN
  return Number.isFinite(n) && n < MINIMUM_AGE
}

/** What the stop screen says. No claim that nothing left the phone: setup's conversation goes to the coach's server. */
export const UNDER_AGE_TITLE = `This app is for ${MINIMUM_AGE} and over`
export const UNDER_AGE_LINES = [
  "Its calorie targets and weights are written for adults, and they aren't right for a body that's still growing.",
  'No account has been made.',
  'A PE teacher, a coach at a club, or your GP can help you train safely for your age.',
]
export const UNDER_AGE_FIX = 'I entered my birthday wrong'
