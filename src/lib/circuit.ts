// ---------------------------------------------------------------------------
// A WORKOUT MADE OF TIMER BLOCKS — Ashley's ruling A, 8 Oct 2026
// (docs/plans/timer-circuit-log.md).
//
// She skipped the plan and used the round timer for rope, push-ups, sit-ups
// and the assault bike, and the app could only call each of them "Intervals".
// A block is now a cardio log under its own name; the blocks logged on a day
// ARE that day's circuit; and counting them as today's workout is the existing
// swap, named for the blocks. Pure, so the gate can ask it directly.
// ---------------------------------------------------------------------------
import type { DayGlyphState } from '@/hooks/useTrainingWeek'

/**
 * What a timer block usually is, as tappable names. Each carries no effort:
 * the app cannot know how a block felt (her 24 Sep ruling), so it is asked.
 * Anything else is typed under Other.
 */
export const BLOCK_NAMES = [
  'Skipping rope', 'Push-ups', 'Sit-ups', 'Assault bike', 'Burpees',
  'Rowing', 'Kettlebell swings', 'Bodyweight squats', 'Plank', 'Shadow boxing',
] as const

/**
 * The chip's face where the full name will not fit three across at phone width ("Skipping ro…"
 * in the first screenshot). The log keeps the full name; only the face is short.
 */
export function blockChipLabel(name: string): string {
  return ({ 'Skipping rope': 'Skipping', 'Kettlebell swings': 'KB swings', 'Bodyweight squats': 'Squats', 'Shadow boxing': 'Shadow box' } as Record<string, string>)[name] ?? name
}

/** The blocks' names, each once, in the order they were done. */
export function blockNames(logs: readonly { activity_name: string }[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const l of logs) {
    const name = l.activity_name.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

/**
 * What the day is called once the blocks replace the plan: "Circuit: Skipping
 * rope, Push-ups, Sit-ups and Assault bike". One block is just its name.
 */
export function circuitName(names: readonly string[]): string {
  if (names.length === 0) return 'Circuit'
  if (names.length === 1) return names[0]
  return `Circuit: ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** One block as she reads it back: "Skipping rope · 5 × 3 min", or the minutes when there is no shape. */
export function blockLine(log: { activity_name: string; duration_minutes: number; notes?: string | null }): string {
  const note = (log.notes ?? '').trim()
  return `${log.activity_name} · ${note || `${log.duration_minutes} min`}`
}

export interface CircuitOffer {
  /** The day's own session, the thing the blocks would replace. */
  sessionFocus: string
  /** The name the swap will carry. */
  name: string
  /** The blocks, one line each. */
  lines: string[]
}

/** A round off the timer, as its log's note reads: "5 × 3 min", "2 × 10s, 5s rest". */
const ROUND_SHAPE = /^\s*\d+\s*×/

/** Steady is RPE 5 (cardio-effort.ts: Easy up to 4, Steady 5-6, Hard 7+). */
const STEADY_RPE = 5
/** Minutes of Steady or Hard cardio that make a session of their own. */
const SESSION_MINUTES = 20

/**
 * WHETHER WHAT WAS LOGGED COULD STAND IN FOR A LIFTING SESSION — his ruling 27 Nov 2026, "Only ask after real work"
 * (his walk before the gym: "a cardio session shouldn't necessarily overtake a weight session"). CSCS, mine: a round
 * off the timer is a conditioning session in itself, and so is 20 minutes or more at Steady or Hard; an easy walk or a
 * short easy spin is movement, not a substitute for resistance training, so it is logged as extra and never offered
 * as the day's workout. Logs with no effort recorded count as Easy (the app never assumes effort it was not told).
 */
export function couldReplaceASession(logs: readonly { duration_minutes: number; intensity_rpe?: number | null; notes?: string | null }[]): boolean {
  if (logs.some(l => ROUND_SHAPE.test(l.notes ?? ''))) return true
  const workMinutes = logs.reduce((n, l) => n + ((l.intensity_rpe ?? 0) >= STEADY_RPE ? Math.max(0, l.duration_minutes) : 0), 0)
  return workMinutes >= SESSION_MINUTES
}

/**
 * What the Today card says instead of the question, after cardio that cannot stand in for the session: that it was
 * kept, and that the session is still on. Null where the question is asked, or where there is no session due.
 */
export function cardioExtraNote(input: Parameters<typeof circuitOfferFor>[0]): { lines: string[]; sentence: string } | null {
  const { dayState, sessionFocus, sessionHasExercises, workingSetsToday, logs } = input
  if (logs.length === 0 || !sessionFocus || !sessionHasExercises || dayState !== 'due' || workingSetsToday > 0) return null
  if (couldReplaceASession(logs)) return null
  return { lines: logs.map(blockLine), sentence: `Saved as extra. ${sessionFocus} is still on for today.` }
}

/**
 * Whether to offer "count this as today's workout", and what it would say.
 *
 * ONLY WHEN IT IS TRUE AND STILL OPEN: something was logged today, today holds
 * a lifting session, and that session is still DUE — not started (a working
 * set), not already swapped, moved, rested or marked missed. On a rest day
 * there is nothing to replace; once she has lifted, the blocks are extra work
 * beside the session, not instead of it.
 */
export function circuitOfferFor(input: {
  dayState: DayGlyphState | undefined
  sessionFocus: string | null
  sessionHasExercises: boolean
  workingSetsToday: number
  logs: readonly { activity_name: string; duration_minutes: number; intensity_rpe?: number | null; notes?: string | null }[]
}): CircuitOffer | null {
  const { dayState, sessionFocus, sessionHasExercises, workingSetsToday, logs } = input
  if (logs.length === 0) return null
  if (!sessionFocus || !sessionHasExercises) return null
  if (dayState !== 'due') return null
  if (workingSetsToday > 0) return null
  if (!couldReplaceASession(logs)) return null
  return {
    sessionFocus,
    name: circuitName(blockNames(logs)),
    lines: logs.map(blockLine),
  }
}
