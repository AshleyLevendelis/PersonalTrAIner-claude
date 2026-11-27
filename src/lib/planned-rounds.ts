// ---------------------------------------------------------------------------
// A PLANNED CARDIO SESSION THAT IS ROUNDS RUNS ON THE ROUND TIMER (Ashley, 23 Nov 2026, option A of three).
//
// His report: the coach suggested "4 × 3 min, 1 min rest" on the assault bike, he said yes put it on my rest days,
// and Wednesday then read "Wednesday: Assault Bike Rounds, 16 minutes." — a line of words, nothing to start and
// nothing to log. His words: "you could just start the workout, it starts the round timer, you do the exercises, and
// you log it completed at the end."
//
// So a planned activity may carry its rounds (PlannedActivity.rounds), and every screen asks THIS file for them:
// the stored shape when there is one, else the shape written into the activity's own protocol ("Rowing Intervals —
// 6 rounds of 40s hard / 20s easy"), read by the parsers the timer already trusts. Never guessed: no three numbers,
// no timer.
// ---------------------------------------------------------------------------
import type { PlannedActivity } from './types'
import { isSensibleRoundConfig, parseConditioningInterval, parseIntervalSuggestion, type RoundConfig } from './timer-engine'
import { splitActivity } from './cardio-lines'
import { effortForRpe, effortLabel } from './cardio-effort'
import { stepThrough, WORK_STEPS, REST_STEPS } from './round-setup'

/** THE WORDS, one place, so the card, the day and the coach's offer say the same thing. */
export const PLANNED_ROUNDS_WORDS = {
  /** On the coach's offer, before Apply. */
  onTheCard: 'On the day, Start runs the round timer with these rounds, and one tap at the end logs it.',
  /** The question when the rounds are done. */
  howHard: 'Done. How hard was it?',
  /** While the round runs for this session. */
  running: 'Round timer running · Open it',
} as const

/** The three numbers a round timer needs, nothing else. */
export interface PlannedRounds {
  rounds: number
  workSeconds: number
  restSeconds: number
}

/** The rounds as a timer config, or null when they are not a timer the app would start. */
function asConfig(r: Partial<PlannedRounds> | null | undefined): RoundConfig | null {
  if (!r) return null
  const config = { rounds: Number(r.rounds), workSeconds: Number(r.workSeconds), restSeconds: Number(r.restSeconds) }
  return isSensibleRoundConfig(config) ? config : null
}

/**
 * WHAT THE TIMER RUNS FOR THIS SESSION: the stored rounds, else its own protocol, else the coach's reason on the card
 * he approved, else nothing.
 *
 * THE REASON (24 Nov 2026, his Wednesday "Assault Bike Rounds · 16 min · Hard", reason "4 rounds of 3-min hard effort
 * with 60s rest to match Muay Thai rounds"): a session the coach added with its numbers in its reason and not in its
 * fields had no Start, so a rounds session read as a line of words. The reason is the coach's sentence on the card he
 * said yes to, read by the same parser, and only when the rounds fit inside the session's own minutes (the rule the
 * coach's card already follows for the reply he said yes to): a reason about something else is not this session.
 */
export function plannedRoundsOf(planned: (Pick<PlannedActivity, 'activity' | 'rounds'> & { reason?: string; duration?: number }) | null | undefined): RoundConfig | null {
  if (!planned) return null
  const stored = asConfig(planned.rounds)
  if (stored) return stored
  const { protocol } = splitActivity(planned.activity)
  if (protocol) {
    const read = parseIntervalSuggestion(protocol) ?? parseConditioningInterval(protocol)
    return read && isSensibleRoundConfig(read) ? read : null
  }
  const said = parseIntervalSuggestion(planned.reason)
  if (said && isSensibleRoundConfig(said) && planned.duration != null && roundsMinutes(said) <= planned.duration) return said
  return null
}

/** Whole minutes the rounds take, work plus the rests between them (none after the last). */
export function roundsMinutes(config: PlannedRounds): number {
  const seconds = config.rounds * config.workSeconds + Math.max(0, config.rounds - 1) * config.restSeconds
  return Math.max(1, Math.ceil(seconds / 60))
}

/**
 * THE ROUNDS FOR THE COACH'S CARD. The coach's own three numbers when it sent all three and they make a timer. Else,
 * the intervals its last reply prescribed ("4 × 3 min, 1 min rest" — the reply he said yes to), but only when they
 * fit inside the session's minutes: a reply about something else is not this session. Else none, and the session is
 * still added, as minutes and effort.
 */
export function cardioSessionRounds(
  args: { rounds?: unknown; work_seconds?: unknown; rest_seconds?: unknown; activity?: unknown },
  minutes: number,
  lastCoachReply?: string | null,
  userSaid?: string | null,
): RoundConfig | null {
  const own = asConfig({ rounds: args.rounds as number, workSeconds: args.work_seconds as number, restSeconds: args.rest_seconds as number })
  if (own) return own
  const fromActivity = plannedRoundsOf({ activity: String(args.activity ?? '') })
  if (fromActivity) return fromActivity
  // HIS OWN WORDS (24 Nov 2026): "add an interval workout 8 x 30 secs with 30 secs rest" names all three numbers, and
  // the session he asked for is that one whatever the minutes the coach rounded it to.
  const asked = parseIntervalSuggestion(userSaid)
  if (asked && isSensibleRoundConfig(asked)) return asked
  const said = parseIntervalSuggestion(lastCoachReply)
  if (said && isSensibleRoundConfig(said) && roundsMinutes(said) <= minutes) return said
  return null
}

/** A session's minutes are never shorter than its rounds: 16 minutes of 4 × 3 min, 1 min rest, not 10. */
export function sessionMinutesFor(minutes: number, rounds: PlannedRounds | null): number {
  return rounds ? Math.max(minutes, roundsMinutes(rounds)) : minutes
}

/**
 * THE ROUND THAT IS THIS SESSION. A round started from a planned session's card carries the session it is for, so a
 * finished round is logged AS that session (its own name, so the day reads done) and never asked "what was this
 * block?". Only on the date it was started for: a round left running past midnight is just a round.
 */
export function roundIsPlannedSession(
  config: Pick<RoundConfig, 'planned'> | null | undefined,
  activity: string,
  date: string,
): boolean {
  return !!config?.planned && config.planned.activity === activity && config.planned.date === date
}

/**
 * A PLANNED CARDIO SESSION AS A ROW, the way a weight day's exercise is drawn (his request 24 Nov 2026, with a
 * screenshot of Thursday's "Squat & Carry": "I want the cardio day to look similar to this before the day"). The tag
 * over the name, the effort where a lift's weight sits, one bar segment per round (one for a steady session), and the
 * legend under it: "4 × 3 min hard · 1 min rest", or "20 min easy". Read off the plan; nothing here is new.
 */
export interface PlannedSessionRow {
  /** The small tag over the name: "Intervals" for rounds, "Cardio" for a steady session. */
  label: string
  name: string
  /** "Hard", "Steady", "Easy", or null when the plan named no effort. */
  effort: string | null
  /** One segment per round; a steady session is one. */
  segments: number
  /** "4 × 3 min", or "20 min". */
  dose: string
  /** The word after the dose: the effort in lower case, else "work" for rounds and "session" for a steady one. */
  doseWord: string
  /** "1 min" between rounds, or null (one round, no rest, or a steady session). */
  rest: string | null
  /** The meta line under the title: "4 rounds · 16 min", or "16 min". */
  meta: string
}

export function plannedSessionRow(planned: Pick<PlannedActivity, 'activity' | 'duration' | 'targetRpe' | 'rounds'> & { reason?: string }): PlannedSessionRow {
  const { name } = splitActivity(planned.activity)
  const key = effortForRpe(planned.targetRpe)
  const effort = key ? effortLabel(key) : null
  const rounds = plannedRoundsOf(planned)
  const unit = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s}s`)
  const minutes = rounds ? sessionMinutesFor(planned.duration, rounds) : planned.duration
  if (rounds) {
    return {
      label: 'Intervals', name, effort, segments: rounds.rounds,
      dose: `${rounds.rounds} × ${unit(rounds.workSeconds)}`, doseWord: effort ? effort.toLowerCase() : 'work',
      rest: rounds.rounds > 1 && rounds.restSeconds > 0 ? unit(rounds.restSeconds) : null,
      meta: `${rounds.rounds} rounds · ${minutes} min`,
    }
  }
  return {
    label: 'Cardio', name, effort, segments: 1,
    dose: `${minutes} min`, doseWord: effort ? effort.toLowerCase() : 'session', rest: null, meta: `${minutes} min`,
  }
}

/**
 * TODAY'S CHANGE TO A PLANNED CARDIO SESSION (his request 25 Nov 2026: "make sure it's easy to change, say for example
 * the user had less time and can't do 8x3 they should easily be able to change it to 6x3 ... Let them be able to edit
 * it"). Today only: the plan is not touched, the next session is as planned, and the log records what was done.
 * Rounds sessions change their rounds, work and rest; a steady session its minutes. Every step stays a timer the app
 * would start (two rounds or more, work and rest five seconds or more), so a change can never lose the Start.
 */
export interface TodayChange { rounds?: PlannedRounds; minutes?: number }

/**
 * WHERE TODAY'S CHANGE IS KEPT: on the phone, for that person, date and session, never in the plan. One place, read by
 * the card and by the watch link (27 Nov 2026: the watch runs what the card says, so 6 × 3 changed on the phone is
 * 6 × 3 on the wrist), and every write is announced so a screen showing it can read it again.
 */
const todayChangeKey = (who: string, date: string, activity: string) => `planned-today-change:${who}:${date}:${activity}`
const TODAY_CHANGE_EVENT = 'planned-today-change'

export function readTodayChange(who: string, date: string, activity: string): TodayChange | null {
  try { const raw = localStorage.getItem(todayChangeKey(who, date, activity)); return raw ? JSON.parse(raw) as TodayChange : null } catch { return null }
}

export function writeTodayChange(who: string, date: string, activity: string, c: TodayChange | null): void {
  const key = todayChangeKey(who, date, activity)
  try { if (c) localStorage.setItem(key, JSON.stringify(c)); else localStorage.removeItem(key) } catch { /* kept for this visit only */ }
  try { window.dispatchEvent(new Event(TODAY_CHANGE_EVENT)) } catch { /* no window: nothing listens */ }
}

export function subscribeTodayChange(cb: () => void): () => void {
  window.addEventListener(TODAY_CHANGE_EVENT, cb)
  return () => window.removeEventListener(TODAY_CHANGE_EVENT, cb)
}

const TODAY_REST_STEPS = REST_STEPS.filter(s => s >= 5)
const TODAY_MINUTES_MIN = 5
const TODAY_MINUTES_MAX = 240

export function stepTodayRounds(r: PlannedRounds, field: 'rounds' | 'work' | 'rest', dir: 1 | -1): PlannedRounds {
  if (field === 'rounds') return { ...r, rounds: Math.min(50, Math.max(2, r.rounds + dir)) }
  if (field === 'work') return { ...r, workSeconds: stepThrough(WORK_STEPS, r.workSeconds, dir) }
  return { ...r, restSeconds: stepThrough(TODAY_REST_STEPS, r.restSeconds, dir) }
}

/** Five minutes a tap, from 5 to 240. */
export function stepTodayMinutes(minutes: number, dir: 1 | -1): number {
  const next = dir > 0 ? Math.floor(minutes / 5) * 5 + 5 : Math.ceil(minutes / 5) * 5 - 5
  return Math.min(TODAY_MINUTES_MAX, Math.max(TODAY_MINUTES_MIN, next))
}

/** The session as he will do it today: the changed rounds (and the minutes they take), or the changed minutes. */
export function withTodayChange<P extends Pick<PlannedActivity, 'activity' | 'duration' | 'rounds'>>(planned: P, change: TodayChange | null | undefined): P {
  if (!change) return planned
  if (change.rounds && isSensibleRoundConfig(change.rounds)) return { ...planned, rounds: { ...change.rounds }, duration: roundsMinutes(change.rounds) }
  if (change.minutes != null && Number.isFinite(change.minutes) && change.minutes >= TODAY_MINUTES_MIN && change.minutes <= TODAY_MINUTES_MAX) return { ...planned, duration: Math.round(change.minutes) }
  return planned
}

/**
 * THE PLANNED CARDIO SESSION AS THE WATCH RUNS IT (27 Nov 2026, his "plans integrate well" with the watch): its name,
 * the exact activity string the phone logs it under (so the day reads done when the watch logs it), its effort, and
 * the rounds as the timer runs them, or minutes for a steady session (rounds 0). Read off the plan, nothing new.
 */
export interface WatchCardio {
  activity: string
  name: string
  effort: string | null
  minutes: number
  rounds: number
  workSeconds: number
  restSeconds: number
  /** "4 × 3 min hard · 1 min rest", "20 min easy": the line the phone's card prints. */
  line: string
}

export function watchCardioOf(planned: (Pick<PlannedActivity, 'activity' | 'duration' | 'targetRpe' | 'rounds'> & { reason?: string }) | null | undefined): WatchCardio | null {
  if (!planned || !planned.activity) return null
  const row = plannedSessionRow(planned)
  const r = plannedRoundsOf(planned)
  const minutes = r ? sessionMinutesFor(planned.duration, r) : planned.duration
  if (!(minutes > 0)) return null
  return {
    activity: planned.activity, name: row.name, effort: row.effort, minutes,
    rounds: r?.rounds ?? 0, workSeconds: r?.workSeconds ?? 0, restSeconds: r?.restSeconds ?? 0,
    line: `${row.dose} ${row.doseWord}${row.rest ? ` · ${row.rest} rest` : ''}`,
  }
}
