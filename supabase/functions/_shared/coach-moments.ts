// ---------------------------------------------------------------------------
// THE SERVER'S COPY OF "WHICH ONE THING IS WORTH A BUZZ".
//
// src/lib/coach-moments.ts decides it for the browser, and its own header says
// why the decision is pure: so a server can ask the same question with facts
// it gathered itself. No edge function here imports from src/ — every rule the
// functions share with the app is a copy in _shared/, held equal by a parity
// gate (food-db, coach-rules). This is the same arrangement:
// test:reach-out-parity runs both copies over every combination of facts that
// matters and fails on the first answer they disagree about, words included.
//
// SO DO NOT EDIT ONE WITHOUT THE OTHER. The gate will say so if you do.
// ---------------------------------------------------------------------------

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

export interface MomentFacts {
  localHour: number
  awaitingFeel: boolean
  plannedToday: boolean
  loggedToday: boolean
  missedYesterday: boolean
  daysSinceAnyLog: number | null
  streakDays: number
  blockJustEnded: boolean
  beatTargetPending: boolean
}

export type MomentSwitches = Partial<Record<MomentKey, boolean>>

export const QUIET_BEFORE_HOUR = 8
export const QUIET_AFTER_HOUR = 21
export const NOT_LOGGED_AFTER_HOUR = 18
export const QUIET_WEEK_DAYS = 7

export interface CoachMoment {
  key: MomentKey
  text: string
}

/** The phrasebook's notification lines — a copy of coach-voice.ts `notification()`. */
export function notification(key: string, streakDays = 0): string {
  switch (key) {
    case 'session_feel': return 'how did that session actually feel?'
    case 'session_not_logged': return "today's session is still waiting — got twenty minutes?"
    case 'missed_yesterday': return 'yesterday got away from you. want to move it or let it go?'
    case 'week_gone_quiet': return "it's been a quiet week. shall we pick something small to start again?"
    case 'streak_at_risk': return `${streakDays} days in a row so far — today would keep it going.`
    case 'block_review': return "that's a block done. come and see what moved."
    case 'beat_target': return "you're beating the weights I set you. want them raised?"
    default: return ''
  }
}

function isLive(key: MomentKey, f: MomentFacts): boolean {
  switch (key) {
    case 'session_feel': return f.awaitingFeel
    case 'session_not_logged': return f.plannedToday && !f.loggedToday && f.localHour >= NOT_LOGGED_AFTER_HOUR
    case 'missed_yesterday': return f.missedYesterday
    case 'week_gone_quiet': return f.daysSinceAnyLog !== null && f.daysSinceAnyLog >= QUIET_WEEK_DAYS
    case 'streak_at_risk': return f.streakDays >= 3 && f.plannedToday && !f.loggedToday && f.localHour >= NOT_LOGGED_AFTER_HOUR
    case 'block_review': return f.blockJustEnded
    case 'beat_target': return f.beatTargetPending
  }
}

export function momentToRaise(facts: MomentFacts, switches: MomentSwitches = {}): CoachMoment | null {
  if (facts.localHour < QUIET_BEFORE_HOUR || facts.localHour > QUIET_AFTER_HOUR) return null
  for (const key of MOMENT_KEYS) {
    if (switches[key] === false) continue
    if (isLive(key, facts)) return { key, text: notification(key, facts.streakDays) }
  }
  return null
}
