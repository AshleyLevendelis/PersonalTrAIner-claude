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
  'workout_today',
  'session_not_logged',
  'missed_yesterday',
  'week_gone_quiet',
  'streak_at_risk',
  'meal_not_logged',
  'protein_short',
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
  mealsAccountedToday?: number
  logsMeals?: boolean
  proteinEatenToday?: number
  proteinTargetG?: number
}

export type MomentSwitches = Partial<Record<MomentKey, boolean>>

export const QUIET_BEFORE_HOUR = 8
export const QUIET_AFTER_HOUR = 21
export const NOT_LOGGED_AFTER_HOUR = 18
export const QUIET_WEEK_DAYS = 7
export const MAX_NOTIFICATIONS_PER_DAY = 3
export const MIN_HOURS_BETWEEN = 3
export const WORKOUT_REMINDER_BEFORE_HOUR = 12
export const FOOD_NUDGE_AFTER_HOUR = 19
export const PROTEIN_SHORT_SHARE = 0.8
export const PROTEIN_SHORT_MIN_G = 20

export interface CoachMoment {
  key: MomentKey
  text: string
}

/** The phrasebook's notification lines — a copy of coach-voice.ts `notification()`. */
export function notification(key: string, streakDays = 0, mealsLogged = 0): string {
  switch (key) {
    case 'session_feel': return 'how did that session actually feel?'
    case 'workout_today': return "training day today — your session's ready when you are."
    case 'meal_not_logged': return mealsLogged >= 1
      ? 'just one meal logged today — add the rest so your numbers add up?'
      : "nothing logged on nutrition yet today. got a minute to add what you've eaten?"
    case 'protein_short': return "you're behind on protein today. a protein-rich snack this evening would help close the gap."
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
    case 'workout_today': return f.plannedToday && !f.loggedToday && f.localHour < WORKOUT_REMINDER_BEFORE_HOUR
    case 'meal_not_logged': return !!f.logsMeals && (f.mealsAccountedToday ?? 0) < 2 && f.localHour >= FOOD_NUDGE_AFTER_HOUR
    case 'protein_short': {
      const target = f.proteinTargetG ?? 0
      const eaten = f.proteinEatenToday ?? 0
      return target > 0 && (f.mealsAccountedToday ?? 0) >= 2 && f.localHour >= FOOD_NUDGE_AFTER_HOUR
        && eaten < target * PROTEIN_SHORT_SHARE && target - eaten >= PROTEIN_SHORT_MIN_G
    }
  }
}

export function momentToRaise(facts: MomentFacts, switches: MomentSwitches = {}): CoachMoment | null {
  return momentsToRaise(facts, switches)[0] ?? null
}

/** Every moment that may speak now, best first. The sender takes the first its own limits allow. */
export function momentsToRaise(facts: MomentFacts, switches: MomentSwitches = {}): CoachMoment[] {
  if (facts.localHour < QUIET_BEFORE_HOUR || facts.localHour > QUIET_AFTER_HOUR) return []
  const out: CoachMoment[] = []
  for (const key of MOMENT_KEYS) {
    if (switches[key] === false) continue
    if (isLive(key, facts)) out.push({ key, text: notification(key, facts.streakDays, facts.mealsAccountedToday ?? 0) })
  }
  return out
}
