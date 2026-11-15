// ---------------------------------------------------------------------------
// AFTER A RED FLAG, THE APP PARKS AND GOES QUIET (his ruling 14 Nov 2026, "Park it, go quiet"). Priya told the coach
// about a symptom, was rightly sent to her doctor, and the session banner stayed up and a cheerful "ready for set 3?"
// followed. Now, when what HE said names a symptom and the coach's reply sends him to a professional:
//   - the open workout ends where it stands (every set kept) and the rest banner goes;
//   - no unprompted cheerful message or workout reminder for 48 hours, in the chat or on the phone;
//   - the pause is offered (a "Pause my plan" button, which the coach answers with its pause card);
//   - the next time the chat opens it asks how he is, once.
// The detection reads HIS words and the coach's referral together, so neither a symptom answered with advice nor a
// referral about something else parks anything. What the coach SAYS about the symptom stays the coach's rule (§1c):
// sharp, one-sided or worsening names a professional and changes nothing else in the plan.
// ---------------------------------------------------------------------------

import { PAUSE_WORDS } from './plan-pause'

/** How long the coach stays quiet after a red flag. */
const RED_FLAG_QUIET_HOURS = 48

/** The check-in waits for a later open, never straight under the coach's own referral. */
const RED_FLAG_CHECKIN_AFTER_HOURS = 4

/** A symptom in his own words: a red flag in the coach's §1c sense, or something no coach should train through. */
const SYMPTOM = new RegExp([
  String.raw`\bchest (?:pain|pains|tight\w*|pressure)\b`,
  String.raw`\b(?:can'?t|cannot|couldn'?t|struggling to|hard to) (?:breathe|catch my breath)\b`,
  String.raw`\bshort(?:ness)? of breath\b`,
  String.raw`\b(?:dizzy|dizziness|light-?headed|faint(?:ed|ing)?|passed out|black(?:ed)? out)\b`,
  String.raw`\b(?:numb|numbness|tingling|pins and needles)\b`,
  String.raw`\b(?:palpitations?|heart (?:racing|pounding|fluttering))\b`,
  String.raw`\b(?:sharp|stabbing|shooting|severe|searing) (?:\w+ )?pain\b`,
  String.raw`\bpain (?:that|which|and it)?\s*(?:is|'s)? ?(?:getting worse|worse and worse|won'?t go away)\b`,
  String.raw`\b(?:bleeding|spotting)\b`,
  String.raw`\b(?:blurred|blurry|double) vision\b`,
  String.raw`\b(?:pelvic|abdominal|stomach|groin) pain\b`,
  String.raw`\b(?:swollen|swelling) (?:calf|leg|ankle|knee|joint)\b`,
].join('|'), 'i')

/** The coach sending him to someone qualified. */
const REFERRAL = /\b(?:doctor|GP|physio(?:therapist)?|midwife|NHS 111|111|999|A&E|emergency services|urgent care|medical (?:help|attention|advice)|(?:a )?(?:health ?care|health|medical) professional)\b/i

/** Did this turn raise a red flag: a symptom in his words, answered by a referral? */
export function isRedFlagTurn(userText: string | null | undefined, replyText: string | null | undefined): boolean {
  return SYMPTOM.test(String(userText ?? '')) && REFERRAL.test(String(replyText ?? ''))
}

export interface RedFlagState {
  /** When the red flag was raised (epoch ms). */
  at: number
  /** The end of the quiet (epoch ms). */
  until: number
  /** The one "how are you?" has been asked. */
  checkedIn: boolean
}

export function redFlagStateAt(now: number): RedFlagState {
  return { at: now, until: now + RED_FLAG_QUIET_HOURS * 3600_000, checkedIn: false }
}

/**
 * What the chat may say unprompted now: the one check-in (a later open, once, quiet or not: it is not cheerful),
 * nothing while the quiet holds, else the usual.
 */
export function unpromptedAfterRedFlag(state: RedFlagState | null, now: number): 'checkin' | 'quiet' | 'normal' {
  if (!state) return 'normal'
  if (!state.checkedIn && now - state.at >= RED_FLAG_CHECKIN_AFTER_HOURS * 3600_000) return 'checkin'
  if (now < state.until) return 'quiet'
  return 'normal'
}

/** The app's words around a red flag. Plain, no cheer. */
export const RED_FLAG_WORDS = {
  /** Under the coach's referral, when a workout was open. */
  parked: "I've ended today's session where it stands, and every set you logged is saved. I'll keep quiet for a couple of days: no reminders. Message me any time.",
  /** Under the coach's referral, with no workout open. */
  quiet: "I'll keep quiet for a couple of days: no reminders. Message me any time.",
  /** The one check-in, on a later open. */
  checkin: (greeting: string) => `${greeting} — how are you feeling today? Did you manage to get it looked at?`,
  checkinChips: ['Feeling better', 'Still not right', 'Seeing someone about it'],
  /** The app's turn under the coach's referral. */
  /** The app's turn under the coach's referral, offering the pause (his ruling) unless the plan is already paused. */
  turn(parked: boolean, paused = false): string {
    return `${parked ? this.parked : this.quiet}${paused ? '' : `\n[QUICK_REPLIES: "${PAUSE_WORDS.pause}"]`}`
  },
}

const storeKey = (profileId: string) => `red_flag_${profileId}`

/** The red flag this phone remembers, or null. Never throws: storage can be blocked. */
export function readRedFlag(profileId: string | undefined): RedFlagState | null {
  if (!profileId) return null
  try {
    const raw = localStorage.getItem(storeKey(profileId))
    const v = raw ? JSON.parse(raw) as RedFlagState : null
    return v && Number.isFinite(v.at) && Number.isFinite(v.until) ? v : null
  } catch { return null }
}

export function writeRedFlag(profileId: string, state: RedFlagState): void {
  try { localStorage.setItem(storeKey(profileId), JSON.stringify(state)) } catch { /* the phone's reminders still read quiet_until */ }
}
