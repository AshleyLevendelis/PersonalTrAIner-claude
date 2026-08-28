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
import { describeTempo } from './periodization'

/** True when the per-set loads are not all the same — a ramp, not a straight-across weight. */
function isRamped(perSet: Exercise['per_set_load']): boolean {
  if (!perSet || perSet.length < 2) return false
  return perSet.some(s => s.load_kg !== perSet[0].load_kg)
}

/**
 * The strings the generator puts in `suggested_load` that are NOT weights.
 * `Light` is what every primer gets; `Choose by feel` is what an uncategorised
 * lift gets. Sent bare they read as prescribed loads — the prompt teaches the
 * "@" clause as THE prescribed weight — so they are labelled at source instead.
 */
const NOT_A_WEIGHT: Record<string, string> = {
  Light: 'Light — a primer, no prescribed weight',
  'Choose by feel': 'no prescribed weight, pick by feel',
  Bodyweight: 'Bodyweight',
}

/**
 * The load clause for one exercise, or '' when the movement genuinely carries
 * no prescribed load at all. '' means "there is no number" — it must never mean
 * "there is a number and we didn't send it", which is the defect this whole
 * file exists to close and which it reopened once already: an assisted pull-up
 * with 35kg of machine assistance was reaching the coach as " @ Bodyweight",
 * a phrase the prompt teaches it to read as NO EXTERNAL LOAD. Worse than
 * silence — a confident statement of the opposite.
 */
export function loadClauseForCoach(e: Exercise): string {
  const parts: string[] = []

  if (e.suggested_load) parts.push(NOT_A_WEIGHT[e.suggested_load] ?? e.suggested_load)

  // Assistance INVERTS the usual reading: less machine help is more real
  // strength. AssistanceChip says "less over time = stronger" beside it on the
  // Exercise tab; the coach is told the same thing so the two surfaces cannot
  // congratulate a trainee for the opposite of what happened.
  if (e.suggested_assistance_kg != null) {
    parts.push(e.assistance_ready_to_graduate
      ? 'machine assistance now 0kg — full bodyweight range, ready to try it unassisted'
      : `machine taking ${e.suggested_assistance_kg}kg (LESS assistance over time = stronger)`)
  }

  if (e.suggested_added_load_kg != null) parts.push(`+${e.suggested_added_load_kg}kg added`)

  if (parts.length === 0) return ''

  let clause = parts.join(', ')

  if (isRamped(e.per_set_load)) {
    const perSet = (e.per_set_load ?? []).map(s => s.display).join(', ')
    clause += ` top set (set by set: ${perSet})`
  }

  // The honesty hedge the Exercise tab already shows. LoadChip labels an
  // assumed_body load "starting light" and explains "it starts low on purpose
  // rather than guessing" — a guarantee built deliberately
  // (PLAN-honest-loads-without-a-body.md). Stripping it here would have the
  // coach read a deliberately conservative floor back as a firm prescription
  // and take a one-word yes, undoing in chat what the UI was fixed not to do.
  if (e.load_source === 'assumed_body') clause += ' [STARTING LIGHT — no body details, deliberately low, not a target]'

  return ` @ ${clause}`
}

/**
 * One exercise as the coach reads it. Tempo and intensity are here because for
 * a rep-based lift with no weight to add, the tempo IS the prescription — and
 * those are exactly the movements whose load clause is the uninformative
 * "Bodyweight". Both are rendered on the Exercise tab; withholding them left
 * the coach unable to answer "how hard should the push-ups be?" about a number
 * on the next screen.
 */
export function describeExerciseForCoach(e: Exercise): string {
  const tempo = describeTempo(e.tempo)
  return `${e.name} (${e.sets}x${e.reps}${loadClauseForCoach(e)}, rest ${e.rest}`
    + (e.intensity ? `, ${e.intensity}` : '')
    + (tempo ? `, tempo ${tempo}` : '')
    + ')'
    + (e.selection_note ? ` [why: ${e.selection_note}]` : '')
    + (e.block_hold_note ? ` [note: ${e.block_hold_note}]` : '')
}

/**
 * A day with no gym session. Its whole prescription lives in fields the
 * exercise list does not carry, and sending `${day}: ${focus} - ` with nothing
 * after the separator read as an empty day the coach could say nothing about.
 */
function describeNonLiftingDay(d: WorkoutDay): string {
  const bits: string[] = []
  const activity = d.plannedActivity
  if (activity) {
    bits.push(`${activity.activity}, ${activity.duration} min`
      + (activity.targetRpe != null ? ` at RPE ${activity.targetRpe}/10` : '')
      + (activity.reason ? ` — ${activity.reason}` : ''))
  }
  const cardio = d.recommendedCardio
  if (cardio) {
    bits.push(`${cardio.activity}, ${cardio.duration} min at RPE ${cardio.targetRpe}/10 (${cardio.timing.replace(/_/g, ' ')})`
      + (cardio.reason ? ` — ${cardio.reason}` : ''))
  }
  if (d.conditioning_note) bits.push(d.conditioning_note)
  return bits.length > 0 ? bits.join(' | ') : 'no session prescribed'
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
    .map(d => `${d.day}: ${d.focus} - ${d.exercises.length > 0
      ? d.exercises.map(describeExerciseForCoach).join(', ')
      : describeNonLiftingDay(d)}`)
    .join('\n')
    + (coachNote ? `\nThis week's coaching note: ${coachNote}` : '')
    + (pendingLoadSuggestions && pendingLoadSuggestions.length > 0
      ? `\nPending suggestion(s) waiting on the dashboard, not yet answered: ${pendingLoadSuggestions.join(' | ')}`
      : '')
}
