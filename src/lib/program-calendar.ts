import { getActiveMesocycleWeek } from './calculations'
import { addDays, dayNameOf, daysBetween } from './session-move'
import { weekRole } from './week-role'
import type { MesocycleWeek } from './types'

// ---------------------------------------------------------------------------
// THE PROGRAM AS A CALENDAR (10 Nov 2026). Ashley, on the Full Program screen: "I would also like the option to see
// my training weeks as a calendar view", keeping the phase strip at the top as it is.
//
// REAL DATES, MONDAY TO SUNDAY, and each date looked up in the plan week IT is in. A plan begun on a Thursday changes
// week on a Thursday (his 6 Oct ruling, getActiveMesocycleWeek), so a calendar row can hold the end of one plan week
// and the start of the next; reading every date through the one function that decides its week means the calendar
// says what Home's strip, the Exercise tab and the coach say about the same date. Nothing here is stored and nothing
// here writes: it is the plan, laid out by date. Moves, swaps and what was logged are laid over it by the screen,
// which already reads them for the live week.
// ---------------------------------------------------------------------------

export type CalendarDayKind = 'train' | 'activity' | 'rest' | 'outside'

export interface ProgramCalendarCell {
  /** YYYY-MM-DD, local. */
  date: string
  dayName: string
  dayOfMonth: number
  /** The plan week this date is in (1-based), or null outside the plan. */
  planWeek: number | null
  blockNumber: number | null
  /** The week's own phase label ("Anatomical Adaptation"), as the strip names its block. */
  phaseLabel: string | null
  /** The deload week: the one week that means do less, amber on the strip. */
  deload: boolean
  /** The session's focus ("Push & Press"), null on a rest day or outside the plan. */
  focus: string | null
  kind: CalendarDayKind
}

export interface ProgramCalendarRow {
  /** The Monday the row starts on. */
  monday: string
  /** A month name when this row holds the 1st of a month or is the first row, else null. */
  monthLabel: string | null
  cells: ProgramCalendarCell[]
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** The plan's first day as a LOCAL date, from its creation stamp (the same reading getActiveMesocycleWeek makes). */
export function planStartDate(planCreatedAt: string | undefined): string | null {
  if (!planCreatedAt) return null
  const d = new Date(planCreatedAt)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mondayOnOrBefore(date: string): string {
  const back = (new Date(`${date}T12:00:00`).getDay() + 6) % 7
  return addDays(date, -back)
}

/**
 * Every week of the plan as calendar rows, Monday to Sunday, from the Monday on or before the plan's first day to the
 * Sunday on or after its last. Empty when there is no plan to lay out (no mesocycle or no start date).
 */
export function buildProgramCalendar(mesocycle: MesocycleWeek[] | undefined, planCreatedAt: string | undefined): ProgramCalendarRow[] {
  const start = planStartDate(planCreatedAt)
  if (!start || !mesocycle || mesocycle.length === 0) return []
  const totalWeeks = mesocycle.length
  const last = addDays(start, totalWeeks * 7 - 1)
  const rows: ProgramCalendarRow[] = []
  let monthShown: number | null = null
  for (let monday = mondayOnOrBefore(start); daysBetween(monday, last) >= 0; monday = addDays(monday, 7)) {
    const cells: ProgramCalendarCell[] = []
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i)
      const dayName = dayNameOf(date)
      const dayOfMonth = Number(date.slice(8, 10))
      const inPlan = daysBetween(start, date) >= 0 && daysBetween(date, last) >= 0
      if (!inPlan) {
        cells.push({ date, dayName, dayOfMonth, planWeek: null, blockNumber: null, phaseLabel: null, deload: false, focus: null, kind: 'outside' })
        continue
      }
      const planWeek = getActiveMesocycleWeek(planCreatedAt, new Date(`${date}T12:00:00`), totalWeeks)
      const week = mesocycle.find(w => w.week_number === planWeek)
      const day = week?.days.find(d => d.day === dayName)
      const kind: CalendarDayKind = !day ? 'rest' : day.exercises.length > 0 ? 'train' : 'activity'
      cells.push({
        date,
        dayName,
        dayOfMonth,
        planWeek,
        blockNumber: week?.block_number ?? null,
        phaseLabel: week?.phase_label ?? null,
        // The strip's own reading of the week, so the amber week here is the amber week there.
        deload: !!week && weekRole(week).key === 'deload',
        focus: day ? day.focus ?? null : null,
        kind,
      })
    }
    // A month is named on the first row, and on the row that holds its 1st.
    const firstOfMonth = cells.find(c => c.dayOfMonth === 1)
    const month: number | null = firstOfMonth ? Number(firstOfMonth.date.slice(5, 7)) - 1 : monthShown === null ? Number(cells[0].date.slice(5, 7)) - 1 : null
    const monthLabel = month !== null && month !== monthShown ? MONTHS[month] : null
    if (month !== null) monthShown = month
    rows.push({ monday, monthLabel, cells })
  }
  return rows
}

/** The short word a calendar cell has room for: the focus's first word ("Push & Press" -> "Push"). */
export function calendarShortLabel(focus: string | null, kind: CalendarDayKind): string {
  if (kind === 'rest' || kind === 'outside') return ''
  if (kind === 'activity') return 'Easy'
  const first = (focus ?? '').trim().split(/[\s&,/+-]+/).filter(Boolean)[0] ?? ''
  return first.length > 7 ? `${first.slice(0, 6)}.` : first
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * WHAT A ROW IS CALLED (his ruling 16 Nov 2026, "label every row by its dates" for a plan that does not start on a
 * Monday). A row that holds exactly one plan week is that week: "W3". A row that holds two (a plan begun on a
 * Thursday changes week on a Thursday, so its Monday-to-Sunday rows each hold the end of one week and the start of the
 * next) used to read "W1–2", which looked like a range of weeks. It now reads its dates, "16–22" over "Nov", and the
 * cells still say which plan week each day is in. A row outside the plan has no label.
 */
export function calendarRowLabel(row: ProgramCalendarRow): { kind: 'week' | 'dates' | 'none'; text: string; sub: string | null; spoken: string } {
  const weeks = [...new Set(row.cells.filter(c => c.planWeek != null).map(c => c.planWeek as number))]
  if (weeks.length === 0) return { kind: 'none', text: '', sub: null, spoken: '' }
  if (weeks.length === 1) return { kind: 'week', text: `W${weeks[0]}`, sub: null, spoken: `Week ${weeks[0]}` }
  const first = row.cells[0].date
  const last = row.cells[6].date
  const m1 = Number(first.slice(5, 7)) - 1
  const m2 = Number(last.slice(5, 7)) - 1
  const d1 = Number(first.slice(8, 10))
  const d2 = Number(last.slice(8, 10))
  return {
    kind: 'dates',
    text: `${d1}–${d2}`,
    sub: m1 === m2 ? MONTHS_SHORT[m1] : `${MONTHS_SHORT[m1]}–${MONTHS_SHORT[m2]}`,
    spoken: `${d1} ${MONTHS_SHORT[m1]} to ${d2} ${MONTHS_SHORT[m2]}, weeks ${weeks[0]} and ${weeks[weeks.length - 1]}`,
  }
}
