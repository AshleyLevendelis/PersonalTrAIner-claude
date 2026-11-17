// ---------------------------------------------------------------------------
// HOME LOOKS AHEAD ONCE TODAY IS DONE (his report 16 Nov 2026, with a screenshot of Home at 21:39 still showing
// "Push & Press · Done ✓"): "The home tab is showing today's workout which has already been logged. It should switch
// to see the upcoming tomorrow's workout."
//
// Once today's session is done, Home's main card shows the NEXT session: the first day after today in the week that
// still holds one (moves taken into account by the week reader; only a day still due),
// else tomorrow's plan when the week has run out (a Sunday). Today's result stays one line on the card, with its
// Summary. Nothing next (the plan ends, or is paused) leaves today's done card as it was.
// ---------------------------------------------------------------------------

import { dayHasSession } from './day-verbs'
import type { TrainingWeekDay } from '@/hooks/useTrainingWeek'

export interface NextSession {
  date: string | null
  /** "Tomorrow", or the weekday ("Thursday") for a later day. */
  when: string
  focus: string
  exerciseCount: number | null
  minutes: number | null
}

/** The next session after today, or null. `tomorrowPlan` is Home's own tomorrow, used when the week has run out. */
export function nextSessionAfter(
  days: readonly TrainingWeekDay[],
  today: string,
  tomorrowDate: string,
  tomorrowPlan: { rest: true } | { rest: false; focus: string; minutes?: number | null } | null,
): NextSession | null {
  for (const d of days) {
    // Only a day still due: one he missed, rested, swapped, paused or already trained is passed over.
    if (d.date <= today || d.state !== 'due' || d.movedTo || !dayHasSession(d.session)) continue
    const s = d.session
    return {
      date: d.date,
      when: d.date === tomorrowDate ? 'Tomorrow' : d.dayName,
      focus: s.focus || 'Next session',
      exerciseCount: s.plannedActivity ? null : (s.exercises?.length ?? null),
      minutes: d.date === tomorrowDate && tomorrowPlan && !tomorrowPlan.rest ? tomorrowPlan.minutes ?? null : null,
    }
  }
  // Past the end of this week's strip: tomorrow's own plan, when it is a session.
  const weekHasTomorrow = days.some(d => d.date === tomorrowDate)
  if (!weekHasTomorrow && tomorrowPlan && !tomorrowPlan.rest) {
    return { date: tomorrowDate, when: 'Tomorrow', focus: tomorrowPlan.focus, exerciseCount: null, minutes: tomorrowPlan.minutes ?? null }
  }
  return null
}

/** The line under the next session's name: "6 exercises · ~34 min", parts dropped when unknown. */
export function nextSessionGlance(n: NextSession): string {
  const parts: string[] = []
  if (n.exerciseCount != null && n.exerciseCount > 0) parts.push(`${n.exerciseCount} exercise${n.exerciseCount === 1 ? '' : 's'}`)
  if (n.minutes != null) parts.push(`~${n.minutes} min`)
  return parts.join(' · ')
}
