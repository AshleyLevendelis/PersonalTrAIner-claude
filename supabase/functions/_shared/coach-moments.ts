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
  'comeback',
  'door_open',
  'load_clash',
  'workout_today',
  'session_not_logged',
  'missed_yesterday',
  'pattern_spotted',
  'week_review',
  'plan_week',
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
  weekday?: number
  weekSessionsDone?: number
  weekSessionsPlanned?: number
  blockJustEnded: boolean
  beatTargetPending: boolean
  mealsAccountedToday?: number
  logsMeals?: boolean
  proteinEatenToday?: number
  proteinTargetG?: number
  name?: string | null
  finishedWhen?: 'this morning' | 'this afternoon' | 'this evening' | 'yesterday' | null
  /**
   * WHAT IS COMING UP (25 Nov 2026, his "not proactive enough"): today's session by name and main lift, a hard class
   * or sport against a heavy leg day, and one pattern worth raising. Words and two decisions (the clash, the pattern);
   * read off the days Home sent ahead (aheadFacts). Absent on a caller that knows none of it.
   */
  todaySession?: { name: string; lift: string | null; weight: string | null } | null
  clash?: { activity: string; when: 'today' | 'yesterday'; lift: string | null } | null
  pattern?: PatternFact | null
  /** Days since the pattern message was last said, or null when never: it is said at most once a week. */
  daysSincePatternSaid?: number | null
}

/** One pattern worth a message (days-ahead.ts PatternAhead, the same shape). */
export type PatternFact =
  | { kind: 'stuck_lift'; lift: string; weight: string; sessions: number }
  | { kind: 'too_hard'; times: number }
  | { kind: 'low_protein'; days: number }

/** The pattern message is said at most once in this many days. */
export const PATTERN_EVERY_DAYS = 7
/** The pattern message waits for the afternoon: never in front of the morning's session. */
export const PATTERN_FROM_HOUR = 12

/** A calendar date stepped by whole days: pure arithmetic on the date's own numbers, no clock and no timezone. */
function dateShift(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  // Days from the civil date (Howard Hinnant's algorithm), stepped, and back.
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  const z = era * 146097 + doe + n
  const era2 = Math.floor(z / 146097)
  const doe2 = z - era2 * 146097
  const yoe2 = Math.floor((doe2 - Math.floor(doe2 / 1460) + Math.floor(doe2 / 36524) - Math.floor(doe2 / 146096)) / 365)
  const doy2 = doe2 - (365 * yoe2 + Math.floor(yoe2 / 4) - Math.floor(yoe2 / 100))
  const mp = Math.floor((5 * doy2 + 2) / 153)
  const day = doy2 - Math.floor((153 * mp + 2) / 5) + 1
  const month = mp < 10 ? mp + 3 : mp - 9
  const year = yoe2 + era2 * 400 + (month <= 2 ? 1 : 0)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
function text(v: unknown, max = 80): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}
function count(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 && n < 100 ? Math.round(n) : null
}

/**
 * THE DAYS HOME SENT AHEAD, read for one local date (days-ahead.ts writes them). Every field is checked, because the
 * server reads what a phone wrote: anything malformed is simply absent. The clash rule is mine (CSCS, basis in
 * BACKLOG): a session built around a heavy lower-body lift, with a hard leg-taxing class the same day or the day before.
 * A pattern is trusted for two days after Home worked it out.
 */
export function aheadFacts(ahead: unknown, localToday: string): Pick<MomentFacts, 'todaySession' | 'clash' | 'pattern'> {
  const out: Pick<MomentFacts, 'todaySession' | 'clash' | 'pattern'> = { todaySession: null, clash: null, pattern: null }
  if (!ahead || typeof ahead !== 'object') return out
  const a = ahead as { asOf?: unknown; days?: unknown; pattern?: unknown }
  const days = a.days && typeof a.days === 'object' ? a.days as Record<string, unknown> : {}
  const day = (date: string) => {
    const d = days[date]
    if (!d || typeof d !== 'object') return null
    const r = d as Record<string, unknown>
    return {
      session: text(r.session),
      lift: text(r.lift),
      weight: text(r.weight, 30),
      heavyLegs: r.heavyLegs === true,
      hard: Array.isArray(r.hardActivities) ? r.hardActivities.map(x => text(x, 40)).filter((x): x is string => !!x) : [],
    }
  }
  const today = day(localToday)
  const yesterday = day(dateShift(localToday, -1))
  if (today?.session) {
    out.todaySession = { name: today.session, lift: today.lift, weight: today.lift ? today.weight : null }
    if (today.heavyLegs) {
      if (today.hard[0]) out.clash = { activity: today.hard[0], when: 'today', lift: today.lift }
      else if (yesterday?.hard[0]) out.clash = { activity: yesterday.hard[0], when: 'yesterday', lift: today.lift }
    }
  }
  const asOf = typeof a.asOf === 'string' ? a.asOf : null
  const fresh = !!asOf && asOf <= localToday && dateShift(asOf, 2) >= localToday
  const p = fresh && a.pattern && typeof a.pattern === 'object' ? a.pattern as Record<string, unknown> : null
  if (p?.kind === 'stuck_lift' && text(p.lift) && text(p.weight, 30) && count(p.sessions)) {
    out.pattern = { kind: 'stuck_lift', lift: text(p.lift)!, weight: text(p.weight, 30)!, sessions: count(p.sessions)! }
  } else if (p?.kind === 'too_hard' && count(p.times)) {
    out.pattern = { kind: 'too_hard', times: count(p.times)! }
  } else if (p?.kind === 'low_protein' && count(p.days)) {
    out.pattern = { kind: 'low_protein', days: count(p.days)! }
  }
  return out
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
  /** When the coach last turned itself down a level after going unanswered (his strategy, 13 Nov 2026). */
  frequency_dropped_at?: string
  /** After a red flag (his ruling 14 Nov 2026, "Park it, go quiet"): nothing unprompted until this time (ISO). */
  quiet_until?: string
  /** A plan pause (his ruling 14 Nov 2026, "Add a pause"): the date it began; while set, nothing unprompted is sent. Not a stored switch: read from the profile. */
  plan_paused_since?: string | null
}

export const QUIET_BEFORE_HOUR = 8
/** The first quiet hour: nothing from 9pm on, which is what the Reminders screen promises ("never ... after 9pm"). It
 * allowed the whole 9pm hour until 7 Nov 2026 (the whole-app QA walk saw "Got twenty minutes?" at 9:30pm). */
export const QUIET_AFTER_HOUR = 21
export const NOT_LOGGED_AFTER_HOUR = 18
export const COMEBACK_AFTER_DAYS = 3
export const DOOR_OPEN_AFTER_DAYS = 14
export const WEEK_REVIEW_WEEKDAY = 6
export const PLAN_WEEK_WEEKDAY = 0
export const WEEKEND_FROM_HOUR = 12
export const MIN_HOURS_BETWEEN = 3
export const WORKOUT_REMINDER_BEFORE_HOUR = 12
export const FOOD_NUDGE_AFTER_HOUR = 19
export const PROTEIN_SHORT_SHARE = 0.8
export const PROTEIN_SHORT_MIN_G = 20

export interface CoachMoment {
  key: MomentKey
  text: string
  shortcut: 'exercise' | 'nutrition' | null
  /** The one-tap answers under the message in the chat (coachMessageChips); empty when it offers nothing. */
  chips: string[]
}

/** The phrasebook's coach messages — a copy of coach-voice.ts `coachMessage()`. */
export interface CoachMessageDetail {
  name?: string | null
  weekDone?: number
  weekPlanned?: number
  mealsLogged?: number
  finishedWhen?: 'this morning' | 'this afternoon' | 'this evening' | 'yesterday' | null
  /** What is coming up (25 Nov 2026): today's session, a clash, a pattern. Absent reads as the plain sentence. */
  session?: { name: string; lift: string | null; weight: string | null } | null
  clash?: { activity: string; when: 'today' | 'yesterday'; lift: string | null } | null
  pattern?: { kind: 'stuck_lift'; lift: string; weight: string; sessions: number } | { kind: 'too_hard'; times: number } | { kind: 'low_protein'; days: number } | null
}

export function coachMessage(key: string, d: CoachMessageDetail = {}): string {
  const name = (d.name ?? '').trim()
  const hey = name ? `Hey ${name}, ` : 'Hey, '
  switch (key) {
    case 'session_feel': return `${hey}how was the workout ${d.finishedWhen ?? 'earlier'}?`
    case 'workout_today': {
      // THE SESSION BY NAME (25 Nov 2026, his "not proactive enough"): which session, and the lift it is built around.
      const s = d.session
      if (!s) return `${hey}are you ready for your session today?`
      return `${hey}${s.name} today${s.lift && s.weight ? `, with ${s.lift} at ${s.weight}` : ''}. Ready for it?`
    }
    case 'load_clash': {
      const c = d.clash
      const session = d.session?.name ?? "today's session"
      if (!c) return ''
      return c.when === 'today'
        ? `${hey}${session} and ${c.activity} on the same day. Lift first, and want me to trim the extras so your legs have something left?`
        : `${hey}${c.activity} yesterday and ${session} today, so your legs may be tired. Want me to trim the extras and keep ${c.lift ?? 'the main lift'} as planned?`
    }
    case 'pattern_spotted': {
      const p = d.pattern
      if (!p) return ''
      if (p.kind === 'stuck_lift') return `${hey}${p.lift} has sat at ${p.weight} for ${p.sessions} sessions. Normal, and there's a fix. Want it?`
      if (p.kind === 'too_hard') return `${hey}you've marked ${p.times} lifts as too hard this week. Want your next session lighter so you recover?`
      return `${hey}protein's come in short ${p.days} days running. Want a hand closing the gap?`
    }
    case 'session_not_logged': return `${hey}today's session is still waiting. Even a short one keeps you moving forward. Got twenty minutes?`
    case 'missed_yesterday': return `${hey}yesterday's session got away from you, and that's fine. Want to move it or let it go?`
    case 'comeback': return `${hey}how about a ten-minute walk today? Small still counts.`
    case 'door_open': return `${hey}no pressure at all. Whenever you want to pick things back up, I'm here, and we'll start gently.`
    case 'week_review': {
      const done = Math.max(0, d.weekDone ?? 0)
      const planned = Math.max(0, d.weekPlanned ?? 0)
      if (planned > 0 && done >= planned) return `${hey}your week so far: all ${planned} sessions done. That's the part most people find hardest. Anything you'd change for next week?`
      if (done > 0) return `${hey}your week so far: ${done} of ${planned} sessions done. Want a quick look at what worked, and what to change for next week?`
      return `${hey}this week didn't go to plan, and that's fine. Want to make next week easier to fit in?`
    }
    case 'plan_week': return `${hey}shall we plan next week? Which days suit training, and any meals out I should know about?`
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
  if (key === 'workout_today' || key === 'session_not_logged' || key === 'load_clash') return 'exercise'
  if (key === 'meal_not_logged' || key === 'protein_short') return 'nutrition'
  return null
}

/**
 * THE EASY OUT (25 Nov 2026, his brief: "make it effortless to say nah, keep it as-is"): a message that offers
 * something carries the yes and the no as one-tap answers in the chat. A tap is his reply to the coach, so the yes
 * reaches a tool the coach already has (trim today: propose_session_shorten) and the no is simply heard.
 */
export function coachMessageChips(key: string, d: { pattern?: { kind: string } | null } = {}): string[] {
  switch (key) {
    case 'load_clash': return ["Trim today's session", 'Keep it as is']
    case 'pattern_spotted': {
      const k = d.pattern?.kind
      if (k === 'stuck_lift') return ["What's the fix?", 'Leave it for now']
      if (k === 'too_hard') return ['Lighten my next session', "I'm fine"]
      if (k === 'low_protein') return ['Help me hit it', 'Leave it']
      return []
    }
    case 'missed_yesterday': return ['Move it', 'Let it go']
    default: return []
  }
}

function inLapse(f: MomentFacts): boolean {
  return f.daysSinceAnyLog !== null && f.daysSinceAnyLog >= COMEBACK_AFTER_DAYS
}

function isLive(key: MomentKey, f: MomentFacts): boolean {
  if ((key === 'workout_today' || key === 'session_not_logged' || key === 'missed_yesterday' || key === 'load_clash' || key === 'pattern_spotted') && inLapse(f)) return false
  switch (key) {
    case 'session_feel': return f.awaitingFeel
    case 'session_not_logged': return f.plannedToday && !f.loggedToday && f.localHour >= NOT_LOGGED_AFTER_HOUR
    case 'missed_yesterday': return f.missedYesterday
    case 'comeback': return f.daysSinceAnyLog === COMEBACK_AFTER_DAYS
    case 'door_open': return f.daysSinceAnyLog === DOOR_OPEN_AFTER_DAYS
    case 'week_review': return f.weekday === WEEK_REVIEW_WEEKDAY && f.localHour >= WEEKEND_FROM_HOUR && (f.weekSessionsPlanned ?? 0) > 0
    case 'plan_week': return f.weekday === PLAN_WEEK_WEEKDAY && f.localHour >= WEEKEND_FROM_HOUR
    case 'block_review': return f.blockJustEnded
    case 'beat_target': return f.beatTargetPending
    // THE CLASH SAYS IT INSTEAD (25 Nov 2026): the same morning, the same session, and the clash is the thing worth saying.
    case 'workout_today': return f.plannedToday && !f.loggedToday && f.localHour < WORKOUT_REMINDER_BEFORE_HOUR && !(f.clash && f.todaySession)
    case 'load_clash': return !!f.clash && !!f.todaySession && f.plannedToday && !f.loggedToday && f.localHour < WORKOUT_REMINDER_BEFORE_HOUR
    case 'pattern_spotted': return !!f.pattern && f.localHour >= PATTERN_FROM_HOUR
      && (f.daysSincePatternSaid == null || f.daysSincePatternSaid >= PATTERN_EVERY_DAYS)
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
export function momentsToRaise(facts: MomentFacts, switches: NotificationSettings = {}, nowMs?: number): CoachMoment[] {
  if (facts.localHour < QUIET_BEFORE_HOUR || facts.localHour >= QUIET_AFTER_HOUR) return []
  if (nowMs !== undefined && quietAfterRedFlag(switches, nowMs)) return []
  // PAUSED (his ruling 14 Nov 2026, "Add a pause"): no workout reminder, no cheerful nudge, no comeback message.
  if ((switches as NotificationSettings).plan_paused_since) return []
  // THEN SILENCE (the comeback path): after the door-open day, nothing unprompted until he logs something again.
  if (facts.daysSinceAnyLog !== null && facts.daysSinceAnyLog > DOOR_OPEN_AFTER_DAYS) return []
  const out: CoachMoment[] = []
  for (const key of MOMENT_KEYS) {
    if (switches[key] === false) continue
    if (isLive(key, facts)) {
      out.push({
        key,
        text: coachMessage(key, { name: facts.name, mealsLogged: facts.mealsAccountedToday ?? 0, finishedWhen: facts.finishedWhen, weekDone: facts.weekSessionsDone, weekPlanned: facts.weekSessionsPlanned, session: facts.todaySession ?? null, clash: facts.clash ?? null, pattern: facts.pattern ?? null }),
        shortcut: coachMessageShortcut(key),
        chips: coachMessageChips(key, { pattern: facts.pattern ?? null }),
      })
    }
  }
  return out
}

/** A stored quiet after a red flag is still running (his ruling 14 Nov 2026, "Park it, go quiet"). */
export function quietAfterRedFlag(switches: MomentSwitches | NotificationSettings, nowMs: number): boolean {
  const until = (switches as NotificationSettings).quiet_until
  const t = typeof until === 'string' ? Date.parse(until) : NaN
  return Number.isFinite(t) && nowMs < t
}
