import type { Exercise, WorkoutDay } from './types'
import type { TrainingWeekDay } from '@/hooks/useTrainingWeek'
import { splitLoadDisplay } from './load-prescription'
import { prescribedDose, groupExercises, mainLiftGroupIndex } from './session-derive'
import { dayLengthParts, isMovementPrepRow } from './session-duration'
import { sessionSetCount } from './session-count'
import { dayHasSession } from './day-verbs'

// ---------------------------------------------------------------------------
// THE EXERCISE TAB IN THE NUTRITION STYLE — his design handoff of 12 Nov 2026 (docs/design/design_handoff_exercise_week,
// docs/plans/exercise-week.md). X1 today, X1b logging a set, XW3 the week view. PRESENTATION ONLY: every value here is
// read off what the plan, the logs and the week reader already hold; nothing is stored and no action is added.
// The words and numbers a row shows are worked out here, so a gate can ask them without drawing a screen.
// ---------------------------------------------------------------------------

/**
 * THE LOAD ON THE RIGHT OF A ROW: a value with its unit ("32.5 kg"), and the qualifier under it ("per hand", "single
 * side", "bodyweight"). A number never reaches the screen without its unit (CLAUDE.md), and a per-hand or per-side load
 * keeps the plan's own wording (formatLoad wrote it; this only splits it). Null for a row with no load to state (a
 * timed cardio piece).
 */
export interface LoadBadge {
  /** "32.5", "~14", "+15", "BW", "Band". */
  value: string
  /** "kg", or "" when the value is a word. */
  unit: string
  /** "per hand", "single side", "assist", "added", "bodyweight", or "". */
  qualifier: string
}

export function exerciseLoadBadge(
  ex: Pick<Exercise, 'suggested_load' | 'suggested_load_kg' | 'suggested_assistance_kg' | 'suggested_added_load_kg' | 'assistance_ready_to_graduate'>,
  unloadedLabel: string | null,
): LoadBadge | null {
  if (ex.suggested_load_kg != null) {
    const parts = splitLoadDisplay(ex.suggested_load ?? `${ex.suggested_load_kg}kg`)
    if (!parts) return { value: String(ex.suggested_load_kg), unit: 'kg', qualifier: '' }
    const qualifier = parts.unit.replace(/^kg/, '').replace(/[()]/g, '').trim()
    return { value: `${parts.approx ? '~' : ''}${parts.value}`, unit: 'kg', qualifier }
  }
  if (ex.suggested_assistance_kg != null) {
    return ex.assistance_ready_to_graduate
      ? { value: 'BW', unit: '', qualifier: 'no assist' }
      : { value: String(ex.suggested_assistance_kg), unit: 'kg', qualifier: 'assist' }
  }
  // Signed, always: "+15 kg" beside a pull-up is weight to add.
  if (ex.suggested_added_load_kg != null) return { value: `+${ex.suggested_added_load_kg}`, unit: 'kg', qualifier: 'added' }
  if (unloadedLabel === 'Bodyweight') return { value: 'BW', unit: '', qualifier: 'bodyweight' }
  if (unloadedLabel) return { value: unloadedLabel, unit: '', qualifier: '' }
  return null
}

/** The load as one phrase, for a line of text ("47.5 kg", "14 kg per hand", "bodyweight"). */
export function loadPhrase(badge: LoadBadge | null): string | null {
  if (!badge) return null
  if (badge.value === 'BW') return badge.qualifier === 'no assist' ? 'no assist' : 'bodyweight'
  return [badge.unit ? `${badge.value} ${badge.unit}` : badge.value, badge.qualifier].filter(Boolean).join(' ')
}

/**
 * THE LEGEND UNDER A ROW'S SET BAR: "2 warm-up" (only with warm-ups), then "3 × 11-13 working", or "2 × 8 easy" for a
 * warm-up move (movement prep is a warm-up, never working sets: isMovementPrepRow, the counts' own rule).
 */
export function exerciseLegend(ex: Pick<Exercise, 'sets' | 'reps' | 'prescription_type' | 'tier' | 'name'>, warmups: number): { warmups: number | null; dose: string; word: 'working' | 'easy' } {
  return { warmups: warmups > 0 ? warmups : null, dose: prescribedDose(ex), word: isMovementPrepRow(ex) ? 'easy' : 'working' }
}

/**
 * THE SET BAR'S SEGMENTS: warm-ups first (violet), then working sets (mint, dim until logged). One segment per set,
 * the counts clamped so a bar never has more filled than it has segments.
 */
export function setBarSegments(rampTotal: number, rampDone: number, workingTotal: number, workingDone: number): { kind: 'warmup' | 'working'; done: boolean }[] {
  const r = Math.max(0, rampTotal), w = Math.max(0, workingTotal)
  return [
    ...Array.from({ length: r }, (_, i) => ({ kind: 'warmup' as const, done: i < Math.min(rampDone, r) })),
    ...Array.from({ length: w }, (_, i) => ({ kind: 'working' as const, done: i < Math.min(workingDone, w) })),
  ]
}

/** "B1 · Anatomical adaptation", the week's phase as the week view says it. */
export function weekPhaseLine(blockNumber: number | null | undefined, phaseLabel: string | null | undefined, opts: { isDeload?: boolean; isCalibrationWeek?: boolean } = {}): string | null {
  const phase = opts.isCalibrationWeek ? 'Calibration week' : opts.isDeload ? 'Deload week' : phaseLabel ? phaseLabel.charAt(0).toUpperCase() + phaseLabel.slice(1).toLowerCase() : null
  if (!phase) return blockNumber != null ? `B${blockNumber}` : null
  return blockNumber != null ? `B${blockNumber} · ${phase}` : phase
}

/** A day of the week view (XW3). */
export type WeekDayRow =
  | { kind: 'rest'; date: string; dayName: string; note: string | null }
  | {
      kind: 'session' | 'recovery'
      date: string
      dayName: string
      title: string
      /** The main lift and its weight ("Barbell Squats · 47.5 kg"), or the activity ("Walk"). */
      line: string
      minutes: number
      /** Working sets planned, the one count (sessionSetCount). */
      sets: number
      done: boolean
      /** A state the day verbs gave it, said instead of the main lift ("Missed", "Moved to Friday", what it was swapped for). */
      status: string | null
    }

/** The first lift a day protects, else its first real exercise: the one the week row names. */
export function weekMainLift(session: WorkoutDay): Exercise | null {
  const exs = session.exercises ?? []
  if (exs.length === 0) return null
  const groups = groupExercises(exs)
  const idx = mainLiftGroupIndex(groups, exs)
  const g = idx >= 0 ? groups[idx] : null
  if (g && g.kind === 'single') return g.ex
  return exs.find(e => !isMovementPrepRow(e)) ?? exs[0]
}

/**
 * ONE ROW PER DAY, Monday to Sunday, read off the training week (useTrainingWeek: the same days the strip, Home and the
 * coach read). A walk or planned activity is a session (dayHasSession). A rest day is one quiet line. A swapped, moved
 * or missed day keeps the label the day verbs gave it.
 */
export function weekDayRow(day: TrainingWeekDay, unloadedLabelFor: (ex: Exercise) => string | null): WeekDayRow {
  const session = day.session ?? null
  const status = day.state === 'missed' ? 'Missed'
    : day.state === 'moved' ? (day.movedTo ? `Moved to ${day.movedTo}` : 'Moved')
    : day.state === 'swapped' ? (day.swappedLine ?? 'Swapped')
    : null
  if (!dayHasSession(session) || day.state === 'moved') {
    return { kind: 'rest', date: day.date, dayName: day.dayName, note: day.state === 'moved' ? status : day.state === 'rest_chosen' ? 'chosen rest' : null }
  }
  const done = day.state === 'done' || (day.state === 'swapped' && !!day.swapLogged)
  if ((session.exercises?.length ?? 0) === 0 && session.plannedActivity) {
    return {
      kind: 'recovery', date: day.date, dayName: day.dayName, title: session.focus || 'Active recovery',
      line: session.plannedActivity.activity, minutes: session.plannedActivity.duration, sets: 0, done, status,
    }
  }
  const main = weekMainLift(session)
  const phrase = main ? loadPhrase(exerciseLoadBadge(main, unloadedLabelFor(main))) : null
  return {
    kind: 'session', date: day.date, dayName: day.dayName, title: session.focus,
    line: main ? [main.name, phrase].filter(Boolean).join(' · ') : '',
    minutes: dayLengthParts(session).workMinutes,
    sets: sessionSetCount(session, [])?.planned ?? 0,
    done, status,
  }
}
