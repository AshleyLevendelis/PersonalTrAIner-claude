/**
 * A MEASURABLE GOAL NEEDS TWO NUMBERS, AND THE APP ASKS FOR A MISSING ONE
 * BEFORE IT OFFERS A CARD (7 Nov 2026, Ashley's phone).
 *
 * "Set a bench press goal", then "110kg is my max": the coach offered "Set
 * goal: Barbell Bench Press" and Apply did nothing. A measurable goal is saved
 * as active only with a starting number AND a target (the user_goals CHECK
 * rule), nobody had asked for the target, the insert was refused, and the
 * error was swallowed. Before that, the missing starting number came back as a
 * "Need more detail · Note" failed card with the same sentence twice.
 *
 * Now ONE function says which number is missing, in words, and both doors use
 * it: the card is not offered until both numbers exist (the question is the
 * coach's reply instead), and the save asks the same question if it is reached
 * without them. A directional goal ("get leaner") needs neither.
 */

export type GoalMetric = 'body_weight_kg' | 'lift_working_kg' | 'lift_1rm_kg' | 'sessions_per_week' | 'directional'

export interface GoalNumbers {
  metric: string
  trackable: 'measurable' | 'directional'
  metricRef?: string
  baselineValue?: number
  targetValue?: number
}

/** What the goal is about, as she would say it: "your Barbell Bench Press max". */
export function goalThing(metric: string, metricRef?: string): string {
  const ref = metricRef?.trim()
  if (metric === 'lift_1rm_kg') return ref ? `your ${ref} max` : 'your max'
  if (metric === 'lift_working_kg') return ref ? `your ${ref} working weight` : 'your working weight'
  if (metric === 'body_weight_kg') return 'your body weight'
  if (metric === 'sessions_per_week') return 'your sessions a week'
  return ref ? `your ${ref}` : 'it'
}

/** A number with its unit, never bare: "110 kg", "4 sessions". */
export function goalAmount(metric: string, value: number): string {
  if (metric.endsWith('_kg')) return `${value} kg`
  if (metric === 'sessions_per_week') return `${value} session${value === 1 ? '' : 's'} a week`
  return String(value)
}

/** The goal in one line, as the card and the saved goal both say it: "Barbell Bench Press max: 110 kg → 120 kg". */
export function goalLabel(metric: string, metricRef: string | undefined, baseline: number, target: number): string {
  return `${goalThing(metric, metricRef).replace(/^your /, '')}: ${goalAmount(metric, baseline)} → ${goalAmount(metric, target)}`
}

/**
 * The question that gets the missing number, or null when the goal can be
 * saved as it stands. `baselineValue` here is whatever the app could find,
 * stated or logged.
 */
export function goalAsk(goal: GoalNumbers): string | null {
  if (goal.trackable !== 'measurable') return null
  const thing = goalThing(goal.metric, goal.metricRef)
  const hasStart = typeof goal.baselineValue === 'number' && Number.isFinite(goal.baselineValue)
  const hasTarget = typeof goal.targetValue === 'number' && Number.isFinite(goal.targetValue)
  if (!hasStart && !hasTarget) return `What's ${thing} now, and what number are you aiming for? I need both to track it.`
  if (!hasStart) return `What's ${thing} now? I need a starting point before I can track progress toward ${goalAmount(goal.metric, goal.targetValue as number)}.`
  if (!hasTarget) return `Got it, ${goalAmount(goal.metric, goal.baselineValue as number)} to start. What number are you aiming for?`
  return null
}
