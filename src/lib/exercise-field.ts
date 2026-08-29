import type { FieldArc } from '@/components/field/FieldRing'
import { FIELD_INK, inkAlpha } from '@/lib/field-ink'

// ---------------------------------------------------------------------------
// EXERCISE'S FIELD (design handoff v2 §4).
//
// "Home states the day; Exercise states the session." The session name lives
// here at 38px, and appears on Home exactly once, inside its first list row —
// that is what stops the two tabs reading as the same screen.
//
// BOTH ARCS ARE INK, and the handoff gives the reason rather than a preference:
// "sets" and "program progress" are the only facts in the app with no assigned
// colour. So they are separated by ink weight (solid vs .32) instead of by
// inventing a hue for one of them, which would have implied a meaning the
// colour system does not carry.
// ---------------------------------------------------------------------------

export interface ExerciseFieldModel {
  /** null on a rest day — there is no session to state. */
  sessionName: string | null
  setsLogged: number
  setsPlanned: number
  /** 0..1 of the session, for the 5px bar. */
  progress: number
  /** Whole minutes, or null when the plan cannot say. */
  minutesLeft: number | null
  arcs: FieldArc[]
  ctaLabel: string | null
}

export interface ExerciseFieldInput {
  sessionName: string | null
  setsLogged: number
  setsPlanned: number
  estimatedMinutes?: number | null
  /** Week N of M — the program arc. */
  weekNumber: number
  totalWeeks: number
  isRestDay: boolean
}

export function buildExerciseField(input: ExerciseFieldInput): ExerciseFieldModel {
  const planned = Math.max(0, input.setsPlanned)
  const logged = Math.max(0, Math.min(planned, input.setsLogged))
  const progress = planned > 0 ? logged / planned : 0

  // Time LEFT, not time total: the field states what remains, like Home's
  // count does. Scaled by the sets still to do rather than by the clock,
  // because the app knows sets and does not know how long you have been here.
  const minutesLeft = input.estimatedMinutes != null && planned > 0
    ? Math.round(input.estimatedMinutes * (1 - progress))
    : null

  const arcs: FieldArc[] = [
    { label: 'sets', value: progress, radius: 92, width: 9 },
    {
      label: 'program',
      value: input.totalWeeks > 0 ? input.weekNumber / input.totalWeeks : 0,
      radius: 76, width: 6,
      // Ink, at the secondary rung — see the note above on why this is not a
      // colour. inkAlpha is the ladder's own accessor, not a hand-picked value.
      color: inkAlpha(FIELD_INK.secondaryArc),
    },
  ]

  return {
    sessionName: input.isRestDay ? null : input.sessionName,
    setsLogged: logged,
    setsPlanned: planned,
    progress,
    minutesLeft,
    arcs,
    ctaLabel: input.isRestDay || planned === 0 || logged >= planned
      ? null
      : (logged > 0 ? 'Continue session' : 'Start session'),
  }
}
