/**
 * test:program-calendar — the program as a calendar (Ashley, 10 Nov 2026: "the option to see my training weeks as a
 * calendar view", the phase strip kept as it is). Holds the pure layout (src/lib/program-calendar.ts): real dates,
 * Monday to Sunday, the whole plan and nothing past it, every date read in the plan week IT is in (his 6 Oct "the day
 * you started" ruling), and the same session the plan has for that week and weekday. The screen half is
 * verify:program-calendar.
 */
// RUN IN A ZONE AHEAD OF UTC, so a plan made early in the morning is on a different UTC date than its own: on a UTC
// machine a UTC-date bug and the right answer print the same thing (CLAUDE.md, "a function of a date cannot be tested
// at one hour of the day"). Set before any date is made.
process.env.TZ = 'Pacific/Auckland'
import { readFileSync } from 'fs'
import { buildProgramCalendar, calendarShortLabel, planStartDate } from '../src/lib/program-calendar'
import { getActiveMesocycleWeek } from '../src/lib/calculations'
import { weekRole } from '../src/lib/week-role'
import type { MesocycleWeek, WorkoutDay } from '../src/lib/types'

let failures = 0
let ran = 0
function check(name: string, ok: boolean, detail?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.log(`  FAIL: ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`) }
}

// A sixteen-week plan whose sessions name their week, so a cell read from the wrong week says so.
const TRAIN = ['Monday', 'Wednesday', 'Friday']
const day = (week: number, d: string): WorkoutDay => ({ day: d, focus: `W${week} ${d} Session`, exercises: [{ name: 'Push-Ups', sets: 3, reps: '10' }] } as unknown as WorkoutDay)
const meso: MesocycleWeek[] = Array.from({ length: 16 }, (_, i) => {
  const n = i + 1
  return {
    week_number: n,
    block_number: Math.floor(i / 4) + 1,
    phase_label: ['Anatomical Adaptation', 'Hypertrophy', 'Conditioning', 'Hypertrophy'][Math.floor(i / 4)],
    label: n % 4 === 0 ? 'Deload' : `Week ${n}`,
    is_deload: n % 4 === 0,
    days: [...TRAIN.map(d => day(n, d)), { day: 'Sunday', focus: 'Easy walk', exercises: [] } as unknown as WorkoutDay],
  } as unknown as MesocycleWeek
})

console.log('1. A plan begun on a Monday')
const MON = '2026-11-09T07:30:00'
const rows = buildProgramCalendar(meso, MON)
check('sixteen rows, Monday to Sunday, from the first day of the plan', rows.length === 16 && rows[0].monday === '2026-11-09' && rows.every(r => r.cells.length === 7 && r.cells[0].dayName === 'Monday' && r.cells[6].dayName === 'Sunday'), rows.map(r => r.monday).slice(0, 3))
check('each row is the next week, by date (no date twice, none skipped)', rows.every((r, i) => i === 0 || r.cells[0].date === addOne(rows[i - 1].cells[6].date)))
check('every cell is in the plan, and its week is the row\'s', rows.every((r, i) => r.cells.every(c => c.planWeek === i + 1)))
check('a training day carries that week\'s own session', rows[4].cells[2].focus === 'W5 Wednesday Session' && rows[4].cells[2].kind === 'train', rows[4].cells[2])
check('a day with no session is a rest day, and a prescribed walk is an easy day', rows[0].cells[1].kind === 'rest' && rows[0].cells[6].kind === 'activity')
check('the deload weeks are the strip\'s deload weeks (its own reading of the week)', rows.every((r, i) => r.cells.every(c => c.deload === (weekRole(meso[i]).key === 'deload'))) && rows.some(r => r.cells[0].deload), rows.map(r => r.cells[0].deload))
check('the block and its phase travel with the week', rows[5].cells[0].blockNumber === 2 && rows[5].cells[0].phaseLabel === 'Hypertrophy')

console.log('\n2. A plan begun on a Thursday evening: rows hold two plan weeks, and each date is read in its own')
const THU = '2026-11-12T18:30:00'
const t = buildProgramCalendar(meso, THU)
check('the first row starts on the Monday before, and its first three days are outside the plan', t[0].monday === '2026-11-09' && t[0].cells.slice(0, 3).every(c => c.kind === 'outside' && c.planWeek === null) && t[0].cells[3].planWeek === 1, t[0].cells.map(c => [c.date, c.planWeek]))
const mismatched: string[] = []
for (const r of t) for (const c of r.cells) if (c.planWeek != null && c.planWeek !== getActiveMesocycleWeek(THU, new Date(`${c.date}T12:00:00`), 16)) mismatched.push(c.date)
check('every date\'s week is the one the rest of the app gives that date (getActiveMesocycleWeek)', mismatched.length === 0, mismatched.slice(0, 4))
const straddle = t[1]
check('a row holds the end of week 1 and the start of week 2 (Thursday changes week)', straddle.cells[0].planWeek === 1 && straddle.cells[3].planWeek === 2, straddle.cells.map(c => c.planWeek))
check('...and the Monday of that row shows WEEK 1\'s session, the Friday week 2\'s', straddle.cells[0].focus === 'W1 Monday Session' && straddle.cells[4].focus === 'W2 Friday Session', [straddle.cells[0].focus, straddle.cells[4].focus])
const lastIn = t.flatMap(r => r.cells).filter(c => c.planWeek != null).pop()
check('the plan ends 112 days after it began, and the last row\'s remaining days are outside it', lastIn?.date === '2027-03-03' && t[t.length - 1].cells.filter(c => c.kind === 'outside').length === 4, { last: lastIn?.date, row: t[t.length - 1].cells.map(c => c.kind) })
check('a plan made in the evening starts on its own date, not the next (the local date, as the week count reads it)', planStartDate(THU) === '2026-11-12')
check('...and one made at 7:30 in the morning in New Zealand (the evening before, in UTC) starts on ITS date', planStartDate('2026-11-12T07:30:00') === '2026-11-12' && buildProgramCalendar(meso, '2026-11-12T07:30:00')[0].cells[3].planWeek === 1 && buildProgramCalendar(meso, '2026-11-12T07:30:00')[0].cells[2].kind === 'outside', planStartDate('2026-11-12T07:30:00'))

console.log('\n3. Months, labels, and nothing to lay out')
check('the first row is named with its month, and so is each row holding a 1st', rows[0].monthLabel === 'November' && rows.filter(r => r.monthLabel).map(r => r.monthLabel).join(',') === 'November,December,January,February', rows.map(r => r.monthLabel))
check('a short label is the focus\'s first word; a walk reads "Easy"; rest reads nothing', calendarShortLabel('Push & Press', 'train') === 'Push' && calendarShortLabel('Easy walk', 'activity') === 'Easy' && calendarShortLabel(null, 'rest') === '' && calendarShortLabel('Conditioning circuit', 'train') === 'Condit.')
check('no plan, or no start date, lays out nothing (the screen keeps the list)', buildProgramCalendar([], MON).length === 0 && buildProgramCalendar(meso, undefined).length === 0 && buildProgramCalendar(meso, 'not a date').length === 0)

console.log('\n4. The screen offers it, and keeps the list as it was')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const browse = strip(readFileSync('src/components/exercise/ProgramBrowse.tsx', 'utf8'))
check('the Full Program screen builds its calendar from this module, with the plan\'s start', /buildProgramCalendar\(mesocycle, planCreatedAt\)/.test(browse))
check('...offers "List" and "Calendar", and the list is the default', /'list' \? 'List' : 'Calendar'/.test(browse) && /=== 'calendar' \? 'calendar' : 'list'/.test(browse))
const stripAt = browse.indexOf('onClick={() => setBrowseWeek(w.week_number)}'), choiceAt = browse.indexOf("view === 'calendar' && calendarRows.length > 0 ?")
check('...and the phase strip sits ABOVE the choice, drawn whichever view is chosen', stripAt > 0 && choiceAt > 0 && stripAt < choiceAt, { stripAt, choiceAt })
const tab = strip(readFileSync('src/components/exercise/ExerciseTab.tsx', 'utf8'))
const browseJsx = /<ProgramBrowse\b[\s\S]*?\/>/.exec(tab)?.[0] ?? ''
check('the Exercise tab hands the screen the plan\'s start (inside its own tag)', /planCreatedAt=\{planCreatedAt\}/.test(browseJsx), browseJsx.slice(0, 80))

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} program-calendar check(s) FAILED.`); process.exit(1) }
console.log('All program-calendar checks passed.')

function addOne(date: string): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
