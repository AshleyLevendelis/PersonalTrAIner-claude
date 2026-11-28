// ---------------------------------------------------------------------------
// CARDIO DAYS A WEEK, FROM THE CHAT (28 Nov 2026, docs/audits/coach-awareness-2026-11-28.md (b) 6; the lead's order).
//
// Profile → Goal → "Cardio days" (his ruling 24 Nov 2026, "A, build it") sets 0-3 cardio sessions a week, and saving it
// raises the app's rebuild offer (plan-invalidation.ts). The coach could only put one cardio session on one day
// (propose_cardio_session); "give me two cardio days a week" had no route. The parity doc names the shape: the running
// goal's (one setting, rebuilt from the live week).
//
// PARITY BY CONSTRUCTION: the card's title and detail are detectPlanInvalidation's own, for the same patch, so the
// coach's offer and Profile's offer are one sentence; which days become cardio is cardioSplitFor's own answer for the
// new count, the function the plan builds from. The rebuild on Apply is the existing rebuild-offer road (no new one).
//
// Advise, then allow: any count 0-3 is allowed. What the app does differently is SAID, never refused: lifting keeps two
// days, so the count is lowered when there are too few training days (cardioDaysFrom); a running goal sets cardio days
// aside while it plans the runs. Over three is the setting's own limit (Profile offers 0-3), said with the nearest.
// ---------------------------------------------------------------------------
import { cardioDaysFrom, cardioDaysRequested, cardioSplitFor } from '../cardio-days'
import { detectPlanInvalidation } from '../plan-invalidation'
import type { UserProfile } from '../types'

type Profile = UserProfile

export type CardioDaysPlan =
  | { ok: true; requested: number; given: number; patch: Pick<Profile, 'cardio_days_per_week'>; title: string; detail: string; lines: string[]; row: { field: string; before: string; after: string } }
  | { ok: false; reason: string }

export const CARDIO_DAYS_REFUSALS = {
  count: 'How many cardio days a week: none, one, two or three?',
  same: (n: number) => (n === 0 ? 'You have no cardio days now.' : `You already have ${n} cardio day${n === 1 ? '' : 's'} a week.`),
  overThree: 'Three is the most the plan builds as their own sessions; any more and lifting would drop below two days. Want three?',
}

const NUMBER_WORDS: Record<string, number> = { none: 0, no: 0, zero: 0, one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }

/** The count his words give, or null; a number over three comes back as itself so the card can say so. */
export function readCardioDays(said: string | number): number | null {
  if (typeof said === 'number') return Number.isInteger(said) && said >= 0 ? said : null
  const s = said.trim().toLowerCase()
  const digit = /^(\d+)$/.exec(s)
  if (digit) return Number(digit[1])
  const first = s.split(/\s+/)[0]
  return first in NUMBER_WORDS ? NUMBER_WORDS[first] : null
}

const daysWord = (n: number) => `${n} cardio day${n === 1 ? '' : 's'}`
const cap = (d: string) => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase()

/** THE TRIAL. Pure: the live profile and his words in; the patch, the screen's offer words and the days out. */
export function planCardioDays(profile: Profile, said: string | number): CardioDaysPlan {
  const asked = readCardioDays(said)
  if (asked === null) return { ok: false, reason: CARDIO_DAYS_REFUSALS.count }
  if (asked > 3) return { ok: false, reason: CARDIO_DAYS_REFUSALS.overThree }
  const now = cardioDaysRequested(profile)
  const patch = { cardio_days_per_week: asked }
  // NO CHANGE IS PROFILE'S OWN ANSWER: its offer returns nothing for the same count, so the coach refuses exactly when
  // the screen would offer nothing (a separate equality test here was measured redundant by mutation and removed).
  const offer = detectPlanInvalidation(profile, patch)
  if (!offer) return { ok: false, reason: CARDIO_DAYS_REFUSALS.same(now) }

  const after = { ...profile, ...patch }
  const trainingDays = (profile.training_days ?? []).filter(d => d.available).length
  const given = cardioDaysFrom(asked, trainingDays)
  const lines: string[] = []
  if (profile.running_goal && asked > 0) {
    lines.push('Your running goal plans your runs, so these cardio days stay set aside until you take the running goal off.')
  } else if (asked > 0) {
    if (given < asked) lines.push(`You train ${trainingDays} day${trainingDays === 1 ? '' : 's'} a week and lifting keeps at least two, so the plan builds ${given === 0 ? 'no cardio days' : daysWord(given)}, not ${asked}.`)
    const split = cardioSplitFor(after)
    if (split && split.cardioDays.length > 0) {
      lines.push(`Cardio: ${split.cardioDays.map(c => `${cap(c.day)} ${c.kind === 'intervals' ? 'intervals' : 'steady'}`).join(', ')}.`)
      lines.push(`Lifting: ${split.liftDays.map(cap).join(', ')}.`)
    }
  }
  return {
    ok: true, requested: asked, given, patch,
    title: offer.title, detail: offer.detail, lines,
    row: { field: 'Cardio days a week', before: String(now), after: String(asked) },
  }
}
