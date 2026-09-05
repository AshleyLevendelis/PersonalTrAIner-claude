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
import { buildCoachTechniqueSummary } from './exercise-technique'
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
  // HOW TO DO THEM, not just what they are. Added 5 Sep 2026 on Ashley's
  // "fix it": the app's 801 curated form cues had one reader in the whole
  // repo (the Exercise tab's How-to panel) and the coach was not it, so it
  // answered technique from the model's own knowledge while the app held its
  // answer one tap away. Same defect as the ingredients the coach could not
  // see, and as the intensity/tempo this very file's header records.
  //
  // A SEPARATE BLOCK, not more text on describeExerciseForCoach: a lift
  // programmed twice in a week would otherwise carry its cues twice.
  //
  // Deduplicated and capped inside buildCoachTechniqueSummary, which returns
  // '' when there is nothing — which is what keeps the empty-plan contract
  // below intact.
  const technique = buildCoachTechniqueSummary(
    days.flatMap(d => d.exercises.map(e => e.name)),
  )

  return days
    .map(d => `${d.day}: ${d.focus} - ${d.exercises.length > 0
      ? d.exercises.map(describeExerciseForCoach).join(', ')
      : describeNonLiftingDay(d)}`)
    .join('\n')
    + (coachNote ? `\nThis week's coaching note: ${coachNote}` : '')
    + (pendingLoadSuggestions && pendingLoadSuggestions.length > 0
      ? `\nPending suggestion(s) waiting on the dashboard, not yet answered: ${pendingLoadSuggestions.join(' | ')}`
      : '')
    // EMPTY PLAN STILL RETURNS EXACTLY ''. test-log-correction.ts pins that
    // literally, and it is load-bearing: the prompt has a rule keyed on this
    // section being empty ("if the section above is EMPTY, say you don't have
    // their prescribed weights"). An unconditional header here would make the
    // coach think it had a plan it does not have.
    + (technique ? `\nHOW TO PERFORM THESE (the app's own cues, the same words shown on the Exercise tab):\n${technique}` : '')
}

// ---------------------------------------------------------------------------
// WHERE THEY ARE IN THE PROGRAMME.
//
// The coach's prompt has always carried a textbook — what Anatomical
// Adaptation, Hypertrophy Accumulation and Intensification each mean — and
// was never told which of them was happening. Every week in the plan carries
// phase_label, phase_focus, block_number, week_in_block, is_deload and
// isCalibrationWeek; not one of them reached the chat. So it could explain
// periodization in the abstract and could not say where the trainee stood in
// it, which is why it only ever sounded knowledgeable when asked a direct
// question.
//
// Ashley's ruling, 31 Aug 2026, on how forward the coach should be: "when a
// plan is built give a quick high level of the weeks to come, then when
// something changes." So this reports position AND the two moments worth
// speaking up at — nothing else. A coach that narrates the phase every day
// teaches people to skim the opening paragraph, which then hides the days it
// mattered.
// ---------------------------------------------------------------------------

export interface PhaseBriefInput {
  /** The week the trainee is actually in, 1-indexed. */
  activeWeek: number
  totalWeeks: number
  week: {
    phase_label?: string
    phase_focus?: string
    block_number?: number
    week_in_block?: number
    is_deload?: boolean
    isCalibrationWeek?: boolean
  } | undefined
  /** When the plan was generated. */
  planCreatedAt: string | null
  now: Date
  /** Timestamp of the most recent earlier message in this conversation, if any. */
  lastChatAt: string | null
}

const DAY_MS = 86_400_000

/**
 * Returns the block of context describing the trainee's position, or '' when
 * there is no plan to describe — never a guess and never a placeholder.
 */
export function buildCoachPhaseBrief({
  activeWeek, totalWeeks, week, planCreatedAt, now, lastChatAt,
}: PhaseBriefInput): string {
  if (!week || !planCreatedAt || activeWeek < 1 || totalWeeks < 1) return ''

  const lines: string[] = []
  const phase = week.phase_label?.trim()
  const position = `Week ${activeWeek} of ${totalWeeks}`
  const block = week.block_number != null && week.week_in_block != null
    ? ` — block ${week.block_number}, week ${week.week_in_block} of that block`
    : ''
  lines.push(`${position}${block}${phase ? ` — ${phase}` : ''}.`)
  if (week.phase_focus?.trim()) lines.push(`What this phase is for: ${week.phase_focus.trim()}`)
  if (week.is_deload) lines.push('THIS IS A DELOAD WEEK — reduced on purpose, for recovery. Say so if it comes up; do not let them read it as backsliding.')
  if (week.isCalibrationWeek) lines.push('THIS IS A CALIBRATION WEEK — loads are deliberately capped so they can find their working weights.')

  // MOMENT ONE: a plan they have not been walked through yet. Week 1 alone is
  // not enough — someone can sit in week 1 for a fortnight if they train
  // rarely — so the plan's own age has to agree.
  const planAgeDays = (now.getTime() - new Date(planCreatedAt).getTime()) / DAY_MS
  const planIsNew = activeWeek === 1 && planAgeDays >= 0 && planAgeDays <= 3

  // MOMENT TWO: the week turned over since they last spoke to you. Computed
  // from the plan's own start date rather than a stored flag, so it stays
  // right after a rebuild and cannot drift out of sync with the plan.
  const weekStart = new Date(planCreatedAt).getTime() + (activeWeek - 1) * 7 * DAY_MS
  const weekJustChanged = !!lastChatAt && new Date(lastChatAt).getTime() < weekStart && activeWeek > 1

  if (planIsNew) {
    lines.push(
      'SPEAK UP: this plan is new and they have not been walked through it. Somewhere in this reply, give a SHORT high-level shape of what is coming — how many weeks, what the blocks do, roughly when it gets harder and when it eases off. Three or four sentences, not a lecture, and not a week-by-week table.',
    )
  } else if (weekJustChanged) {
    lines.push(
      `SPEAK UP: the week has turned over since you last spoke${phase ? ` — they are now in ${phase}` : ''}. Say so briefly and name what actually changes for them this week. One or two sentences.`,
    )
  } else {
    lines.push('Do NOT volunteer the phase this turn — nothing has changed since you last spoke. Use it if they ask, or if it genuinely explains something they raised.')
  }

  return lines.join('\n')
}
