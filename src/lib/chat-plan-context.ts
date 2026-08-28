/**
 * The training week, phrased for the coach.
 *
 * ROOT INCIDENT. Ashley told the coach she had trained, and it replied "I
 * don't actually have your past weights on hand to look up what was
 * prescribed" — while the Exercise tab, one tap away, was showing "Deadlifts
 * 72.5 kg SUGGESTED, S1/S2/S3 all 72.5kg". The coach was telling the truth.
 * The client's plan summary carried the day, the focus, the exercise name,
 * sets, reps and rest, and no load at all. The app was withholding a number
 * it had, and then apologising for not having it.
 *
 * It lived inline in ChatAssistant.buildContext, which is why nothing caught
 * it: a template literal inside a component is not something a gate can call.
 * It is a function here so `test:log-correction` can run it on a real week and
 * assert the weight comes out — the behavioural half, not a regex over source.
 *
 * Three rules this file exists to hold:
 *
 *   1. Send the FORMATTED load (`suggested_load`), never the bare
 *      `suggested_load_kg`. "~14kg per hand" and "14kg" are different
 *      prescriptions, and roughly half of every plan is per-hand work.
 *   2. Send the per-set breakdown when the sets are not all the same weight.
 *      A ramp is 60/65/72.5; a trainee who says "I used the prescribed
 *      weights" must not have 72.5x3 logged for them. That is the same
 *      invented-number defect as filling reps from the prescription.
 *   3. Send added load for weighted bodyweight work, where the whole
 *      prescription is the "+17.5kg" and `suggested_load` reads "Bodyweight".
 */
import type { Exercise, WorkoutDay } from './types'

/** True when the per-set loads are not all the same — a ramp, not a straight-across weight. */
function isRamped(perSet: Exercise['per_set_load']): boolean {
  if (!perSet || perSet.length < 2) return false
  return perSet.some(s => s.load_kg !== perSet[0].load_kg)
}

/**
 * The load clause for one exercise, or '' when the movement genuinely carries
 * no prescribed weight (primers, unloaded bodyweight). '' means "there is no
 * number" — it must never mean "there is a number and we didn't send it".
 */
export function loadClauseForCoach(e: Exercise): string {
  const parts: string[] = []
  if (e.suggested_load) parts.push(e.suggested_load)
  if (e.suggested_added_load_kg != null) parts.push(`+${e.suggested_added_load_kg}kg added`)
  if (parts.length === 0) return ''

  const base = parts.join(' ')
  if (isRamped(e.per_set_load)) {
    const perSet = (e.per_set_load ?? []).map(s => s.display).join(', ')
    return ` @ ${base} top set (set by set: ${perSet})`
  }
  return ` @ ${base}`
}

/** One exercise as the coach reads it: name, prescription, load, rest, and any note explaining why it is there. */
export function describeExerciseForCoach(e: Exercise): string {
  return `${e.name} (${e.sets}x${e.reps}${loadClauseForCoach(e)}, rest ${e.rest})`
    + (e.selection_note ? ` [why: ${e.selection_note}]` : '')
    + (e.block_hold_note ? ` [note: ${e.block_hold_note}]` : '')
}

export interface CoachWeekBrief {
  days: WorkoutDay[]
  /** The active mesocycle week's own note — where a block-boundary load-hold or a deload explains itself. */
  coachNote?: string | null
  /** Load suggestions sitting unanswered on the dashboard, so the coach doesn't re-offer what's already pending. */
  pendingLoadSuggestions?: string[] | null
}

/** The whole `exercise_summary` payload sent to chat-gemini. */
export function buildCoachExerciseSummary({ days, coachNote, pendingLoadSuggestions }: CoachWeekBrief): string {
  return days
    .map(d => `${d.day}: ${d.focus} - ${d.exercises.map(describeExerciseForCoach).join(', ')}`)
    .join('\n')
    + (coachNote ? `\nThis week's coaching note: ${coachNote}` : '')
    + (pendingLoadSuggestions && pendingLoadSuggestions.length > 0
      ? `\nPending suggestion(s) waiting on the dashboard, not yet answered: ${pendingLoadSuggestions.join(' | ')}`
      : '')
}
