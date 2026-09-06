/**
 * The one line the Personal TrAIner says above today's session.
 *
 * Three sources, in a fixed order of specificity — the most specific thing
 * that is true today wins, and nothing is said twice:
 *
 *   1. THE PROGRESSION NOTE for the first main lift. "Bench goes to 62.5 kg —
 *      you hit the top of the range twice." Nothing else on the screen says
 *      why the number moved, so this outranks everything.
 *   2. THE CALIBRATION CUE, on a calibration week, when the main lift is the
 *      anchor the cue is attached to. It is an instruction for how to train
 *      today, which beats a note about the week.
 *   3. THE WEEK'S COACH NOTE, otherwise. Always present on a generated plan,
 *      so this is the floor rather than a fallback that rarely fires.
 *
 * Extracted here, not written inline, for the same reason macro-shortfall.ts
 * is: the interesting behaviour is the PRECEDENCE and the silence, and both
 * are invisible to anyone reading JSX. test:exercise-today §2 owns it.
 *
 * The caller must not ALSO render whatever this returns — see
 * `WeekContextRow`'s `coachNoteShownBelow`, which exists exactly so the week
 * note does not appear twice on one screen when source 3 wins.
 */

export interface SessionNudgeInput {
  /** The first main lift's name, for the progression line's subject. Null on a day with no main lift. */
  mainLiftName: string | null
  /** progression-engine's note for that lift, when it produced one today. */
  progressionNote: string | null
  /** This week is a calibration week AND the main lift is the row the cue is anchored to. */
  calibrationCue: string | null
  /** mesocycle_weeks.coach_note for the live week. */
  coachNote: string | null
}

export type SessionNudgeSource = 'progression' | 'calibration' | 'week-note'

export interface SessionNudge {
  text: string
  source: SessionNudgeSource
}

export function sessionNudge(input: SessionNudgeInput): SessionNudge | null {
  const progression = input.progressionNote?.trim()
  if (progression) {
    // The lift's name only when the note doesn't already open with it —
    // "Bench Press — Bench Press goes to 62.5 kg" is what naive prefixing
    // produces on the notes that are already self-describing.
    const name = input.mainLiftName?.trim()
    const alreadyNamed = !!name && progression.toLowerCase().includes(name.toLowerCase())
    return { text: name && !alreadyNamed ? `${name}: ${progression}` : progression, source: 'progression' }
  }
  const calibration = input.calibrationCue?.trim()
  if (calibration) return { text: calibration, source: 'calibration' }
  const week = input.coachNote?.trim()
  if (week) return { text: week, source: 'week-note' }
  return null
}
