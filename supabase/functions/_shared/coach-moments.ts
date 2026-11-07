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
  name?: string | null
  finishedWhen?: 'this morning' | 'this afternoon' | 'this evening' | 'yesterday' | null
}

export type MomentSwitches = Partial<Record<MomentKey, boolean>>

export const REMINDER_FREQUENCIES = ['light', 'normal', 'lots'] as const
export type ReminderFrequency = typeof REMINDER_FREQUENCIES[number]
export const DEFAULT_FREQUENCY: ReminderFrequency = 'normal'
const DAILY_CAP: Record<ReminderFrequency, number> = { light: 1, normal: 3, lots: 5 }

export function dailyCap(frequency: unknown): number {
  return DAILY_CAP[(REMINDER_FREQUENCIES as readonly unknown[]).includes(frequency) ? frequency as ReminderFrequency : DEFAULT_FREQUENCY]
}

export type NotificationSettings = MomentSwitches & {
  frequency?: ReminderFrequency
  coach_reply?: boolean
}

export const QUIET_BEFORE_HOUR = 8
/** The first quiet hour: nothing from 9pm on, which is what the Reminders screen promises ("never ... after 9pm"). It
 * allowed the whole 9pm hour until 7 Nov 2026 (the whole-app QA walk saw "Got twenty minutes?" at 9:30pm). */
export const QUIET_AFTER_HOUR = 21
export const NOT_LOGGED_AFTER_HOUR = 18
export const QUIET_WEEK_DAYS = 7
export const MIN_HOURS_BETWEEN = 3
export const WORKOUT_REMINDER_BEFORE_HOUR = 12
export const FOOD_NUDGE_AFTER_HOUR = 19
export const PROTEIN_SHORT_SHARE = 0.8
export const PROTEIN_SHORT_MIN_G = 20

export interface CoachMoment {
  key: MomentKey
  text: string
  shortcut: 'exercise' | 'nutrition' | null
}

/** The phrasebook's coach messages — a copy of coach-voice.ts `coachMessage()`. */
export interface CoachMessageDetail {
  name?: string | null
  streak?: number
  mealsLogged?: number
  finishedWhen?: 'this morning' | 'this afternoon' | 'this evening' | 'yesterday' | null
}

export function coachMessage(key: string, d: CoachMessageDetail = {}): string {
  const name = (d.name ?? '').trim()
  const hey = name ? `Hey ${name}, ` : 'Hey, '
  switch (key) {
    case 'session_feel': return `${hey}how was the workout ${d.finishedWhen ?? 'earlier'}?`
    case 'workout_today': return `${hey}are you ready for your session today?`
    case 'session_not_logged': return `${hey}today's session is still waiting. Even a short one keeps you moving forward. Got twenty minutes?`
    case 'missed_yesterday': return `${hey}yesterday's session got away from you, and that's fine. Want to move it or let it go?`
    case 'week_gone_quiet': return `${hey}it's been a quiet week, and that happens. A small session is the quickest way back in. Shall we pick one?`
    case 'streak_at_risk': return `${hey}that's ${Math.max(0, d.streak ?? 0)} in a row, brilliant. Today would keep it going.`
    case 'meal_not_logged': return (d.mealsLogged ?? 0) >= 1
      ? `${hey}just one meal logged today. Add the rest so your numbers add up?`
      : `${hey}nothing logged on Nutrition yet today. Got a minute to add what you've eaten?`
    case 'protein_short': return `${hey}you're behind on protein today. It's what rebuilds the muscle you train, so a protein-rich snack this evening would help close the gap.`
    case 'block_review': return `${hey}that's a block done, well done. Want to see what moved?`
    case 'beat_target': return `${hey}you're beating the weights I set you, which means you're getting stronger. Want them raised?`
    default: return ''
  }
}

/**
 * A REPLY THAT ISN'T A SENTENCE: a turn whose answer is a card the app draws
 * (a swap, a log), when she has left the app (6 Nov 2026). The model's own
 * words for such a turn are never shown (D1), so the phone says only that the
 * coach has answered, and the chat holds the card. Server-only: no screen
 * shows it, so it has no copy in src/.
 */
export const REPLY_WAITING = "I've replied. Tap to see it."

/** A copy of coach-voice.ts `coachMessageShortcut()`. */
export function coachMessageShortcut(key: string): 'exercise' | 'nutrition' | null {
  if (key === 'workout_today' || key === 'session_not_logged') return 'exercise'
  if (key === 'meal_not_logged' || key === 'protein_short') return 'nutrition'
  return null
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
  if (facts.localHour < QUIET_BEFORE_HOUR || facts.localHour >= QUIET_AFTER_HOUR) return []
  const out: CoachMoment[] = []
  for (const key of MOMENT_KEYS) {
    if (switches[key] === false) continue
    if (isLive(key, facts)) {
      out.push({
        key,
        text: coachMessage(key, { name: facts.name, streak: facts.streakDays, mealsLogged: facts.mealsAccountedToday ?? 0, finishedWhen: facts.finishedWhen }),
        shortcut: coachMessageShortcut(key),
      })
    }
  }
  return out
}
