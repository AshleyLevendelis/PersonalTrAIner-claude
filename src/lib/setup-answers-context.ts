// ---------------------------------------------------------------------------
// THE SETUP ANSWERS THE COACH WAS NOT TOLD (28 Nov 2026, docs/audits/coach-awareness-2026-11-28.md, gaps (a) 3, 5, 6, 10).
//
// Profile shows, and the plan and the meals are built from, answers the coach's context never carried: recovery, how
// much he likes cardio, cardio days a week, cooking time, meal variety, the macro split, which meals are cooked for him,
// and how far into a pregnancy she is. So "why only three lifting days?" or "why are my meals so plain?" was answered
// without the reason the app itself used. Every line here goes through the reader the plan or the screen uses
// (cardioDaysFrom, effectiveRecoveryCapacity, describeMealsElsewhere, pregnancyWeeksOn, lateInPregnancy), so the coach
// can never give a different count or week from the one the app acts on.
//
// Pure: profile and today's date in, one block out ('' when there is nothing to say).
// ---------------------------------------------------------------------------
import { cardioDaysFrom, cardioDaysRequested } from './cardio-days'
import { effectiveRecoveryCapacity } from './concurrent-activity'
import { isPregnant, lateInPregnancy, pregnancyWeeksOn } from './health-conditions'
import { describeMealsElsewhere, readMealsElsewhere } from './meals-elsewhere'
import type { UserProfile } from './types'

/** His ruling 28 Nov 2026, "Say the week, plainly": the week explains a plan change and nothing medical beyond it. */
export const PREGNANCY_WEEK_RULE = 'Say the week plainly when it explains a change to her plan; say nothing medical beyond that, and send health questions to her midwife or GP.'

export type SetupAnswersProfile = Pick<UserProfile,
  'recovery_capacity' | 'concurrent_activities' | 'conditioning_preference' | 'cardio_days_per_week' | 'running_goal'
  | 'training_days' | 'cooking_time_preference' | 'meal_variety' | 'macro_split_preset' | 'meals_elsewhere'
  | 'health_conditions' | 'due_date'>

const RECOVERY: Record<string, string> = { low: 'low', moderate: 'moderate', high: 'high' }
const CONDITIONING: Record<string, string> = {
  love: 'love cardio', tolerate: 'put up with cardio', avoid: 'would rather avoid cardio',
}
const COOKING: Record<string, string> = {
  quick: 'quick meals only (simple dishes, no recipes)',
  moderate: 'a moderate amount of cooking (mostly simple dishes, some recipes)',
  loves_cooking: 'happy to cook (recipes welcome)',
}
const VARIETY: Record<string, string> = {
  variety: 'plenty of variety', some: 'some repeats are fine', same: 'happy to eat the same meals often',
}
const SPLIT: Record<string, string> = {
  balanced: 'balanced', higher_protein: 'higher protein', lower_carb: 'lower carb', higher_carb: 'higher carb', custom: 'a custom split',
}

/** "SETUP ANSWERS THE PLAN AND MEALS ARE BUILT FROM": one line each, only for answers he has given. */
export function buildCoachSetupAnswers(profile: SetupAnswersProfile | null | undefined, today: string): string {
  if (!profile) return ''
  const lines: string[] = []

  const stated = profile.recovery_capacity
  if (stated && RECOVERY[stated]) {
    const effective = effectiveRecoveryCapacity(profile)
    lines.push(effective !== stated
      ? `Recovery: they said ${RECOVERY[stated]}; the plan treats it as ${RECOVERY[effective]} because their other sport counts as training load.`
      : `Recovery: ${RECOVERY[stated]}.`)
  }
  const conditioning = profile.conditioning_preference
  if (conditioning && CONDITIONING[conditioning]) lines.push(`Cardio: they ${CONDITIONING[conditioning]}.`)

  const requested = cardioDaysRequested(profile)
  if (requested > 0) {
    if (profile.running_goal) {
      lines.push(`Cardio days asked for: ${requested} a week, set aside while their running goal plans the runs.`)
    } else {
      const lifting = (profile.training_days ?? []).filter(d => d.available).length
      const given = cardioDaysFrom(requested, lifting)
      lines.push(given === requested
        ? `Cardio days: ${given} of their ${lifting} training days a week are cardio sessions, not lifting.`
        : `Cardio days: they asked for ${requested}; ${given} of their ${lifting} training days are cardio, so at least two stay lifting.`)
    }
  }

  const cooking = profile.cooking_time_preference
  if (cooking && COOKING[cooking]) lines.push(`Cooking: ${COOKING[cooking]}.`)
  const variety = profile.meal_variety
  if (variety && VARIETY[variety]) lines.push(`Meal variety: ${VARIETY[variety]}.`)
  const split = profile.macro_split_preset
  if (split && SPLIT[split]) lines.push(`Macro split they picked: ${SPLIT[split]}.`)

  const elsewhere = describeMealsElsewhere(readMealsElsewhere(profile.meals_elsewhere))
  if (elsewhere) {
    lines.push(`Meals cooked for them (not by them, never shopped for; the app counts each as a normal-sized meal unless they describe it): ${elsewhere}.`)
  }

  if (isPregnant(profile)) {
    const weeks = pregnancyWeeksOn(profile.due_date ?? null, today)
    if (weeks == null) {
      lines.push('Pregnancy: no due date given, so the plan treats her as past 16 weeks (no lying flat on the back, no impact).')
    } else if (lateInPregnancy(profile, today)) {
      lines.push(`Pregnancy: about week ${weeks} by her due date (${profile.due_date}). From 28 weeks the weights hold, sets stop at effort 7, and there is no face-down work. ${PREGNANCY_WEEK_RULE}`)
    } else {
      lines.push(`Pregnancy: about week ${weeks} by her due date (${profile.due_date}). The 28-week rules (weights hold, effort 7, no face-down work) have not started. ${PREGNANCY_WEEK_RULE}`)
    }
  }

  return lines.length === 0 ? '' : `SETUP ANSWERS THE PLAN AND MEALS ARE BUILT FROM (their own choices, changeable on Profile):\n${lines.map(l => `- ${l}`).join('\n')}`
}
