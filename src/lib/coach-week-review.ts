// ---------------------------------------------------------------------------
// THE WEEK, AS THE SCREENS COUNT IT, FOR THE COACH (run 7, 15 Oct 2026, M50).
//
// Asked "how did my week go", the coach said she "didn't log any meals" (Saturday's breakfast was logged),
// that she trained Thursday, Friday and Saturday while the Exercise tab said 0 of 4 done, and answered in five
// paragraphs. It had never been given a week: it got fourteen days of raw set rows (warm-ups included, dates
// with no weekday) and eight days of meal totals, and assembled its own review from them. On a Wednesday the
// eight days do not even reach last Monday.
//
// So the coach is now handed the two weeks the strip draws — this week and last, Monday to Sunday (her ruling
// the same day, M54) — one line per day, in the strip's own words, with that day's logged meals beside it.
// The day states come from readTrainingWeeks, the strip's classifier, so the coach cannot call a session done
// that the Exercise tab calls missed. Meals come from the same per-day totals the eaten summary uses.
// ---------------------------------------------------------------------------
import type { TrainingWeekDay } from '@/hooks/useTrainingWeek'
import { tallyWeek } from '@/hooks/useTrainingWeek'
import type { EatenDay } from './meal-store'

const DAY_FMT = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

/** Every date the review needs a meal total for: last Monday to today. */
export function weekReviewDates(lastWeek: TrainingWeekDay[], today: string): string[] {
  const out: string[] = []
  const first = lastWeek[0]?.date
  if (!first) return out
  for (let d = first; d <= today; ) {
    out.push(d)
    const n = new Date(`${d}T12:00:00`)
    n.setDate(n.getDate() + 1)
    d = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  }
  return out
}

function stateWords(d: TrainingWeekDay, today: string): string {
  const focus = d.session?.focus ? `${d.session.focus} — ` : ''
  const sets = d.workingLogs?.length ?? 0
  switch (d.state) {
    case 'done': return `${focus}done (${sets} working ${sets === 1 ? 'set' : 'sets'})`
    case 'partial': return `${focus}started, not finished (${sets} working ${sets === 1 ? 'set' : 'sets'})`
    case 'missed': return `${focus}${d.markedMissed ? 'missed (she said so)' : 'missed (nothing logged)'}`
    case 'due': return d.date === today ? `${focus}due today` : `${focus}still to come`
    case 'moved': return `${focus}moved to ${d.movedTo ? DAY_FMT(d.movedTo.date) : 'another day'}`
    case 'swapped': return `swapped for ${d.swappedForActivity ?? 'another activity'}`
    case 'rest_chosen': return 'rest day, chosen'
    case 'rest': return 'rest day (none planned)'
    case 'recovery': return 'recovery day'
    case 'before_plan': return 'before the plan began'
  }
}

function mealWords(day: EatenDay | undefined): string {
  if (!day || day.meals === 0) return 'meals: nothing logged'
  return `meals: ${day.meals} logged ${day.meals === 1 ? 'entry' : 'entries'}, ${Math.round(day.kcal)} kcal`
}

/**
 * The block, or null when the training week could not be read (the coach is then told the week is unknown this
 * turn, never that nothing happened). A meal read that failed says so on every line rather than "nothing logged".
 */
export function buildCoachWeekReview(
  weeks: { thisWeek: TrainingWeekDay[]; lastWeek: TrainingWeekDay[] } | null,
  eaten: Record<string, EatenDay> | null,
  today: string,
): string | null {
  if (!weeks || weeks.thisWeek.length === 0 || weeks.lastWeek.length === 0) return null
  const block = (label: string, days: TrainingWeekDay[], upTo: string) => {
    const t = tallyWeek(days, today)
    const head = `${label} (${DAY_FMT(days[0].date)} to ${DAY_FMT(days[days.length - 1].date)}): ${t.sessionsDone} of ${t.sessionsPlanned} sessions done${label === 'THIS WEEK' ? `, ${t.sessionsLeft} to go` : ''}.`
    const lines = days.filter(d => d.date <= upTo).map(d => {
      const meals = eaten ? mealWords(eaten[d.date]) : 'meals: could not be read this turn'
      return `- ${DAY_FMT(d.date)}${d.date === today ? ' (today)' : ''}: ${stateWords(d, today)}; ${meals}`
    })
    return [head, ...lines].join('\n')
  }
  return [block('LAST WEEK', weeks.lastWeek, weeks.lastWeek[weeks.lastWeek.length - 1].date), block('THIS WEEK', weeks.thisWeek, today)].join('\n')
}
