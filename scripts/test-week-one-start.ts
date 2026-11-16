// ---------------------------------------------------------------------------
// WHERE WEEK 1 BEGINS, AND WHAT A CALENDAR ROW IS CALLED (his ruling 16 Nov 2026: a plan made on a day whose days up
// to Monday hold no session begins on that Monday; rows holding two plan weeks are labelled by their dates). Every
// check runs every time.
// ---------------------------------------------------------------------------
import { snapPlanStart } from '../src/lib/plan-week'
import { buildProgramCalendar, calendarRowLabel, planStartDate } from '../src/lib/program-calendar'
import { getActiveMesocycleWeek } from '../src/lib/calculations'
import type { MesocycleWeek, WorkoutDay } from '../src/lib/types'

let ran = 0, failures = 0
function check(label: string, ok: boolean, extra?: unknown) {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — got ${JSON.stringify(extra).slice(0, 400)}` : ''}`) }
}
const day = (name: string, train = true): WorkoutDay => ({ day: name, focus: train ? 'Push & Press' : 'Rest', exercises: train ? [{ name: 'Barbell Bench Press', sets: 3, reps: '6-8', rest: '120s', substitution: '' }] : [] } as unknown as WorkoutDay)
const MON_TO_SAT = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => day(d))
const WITH_SUNDAY = [...MON_TO_SAT.slice(0, 5), day('Sunday')]
const local = (iso: string) => planStartDate(iso)
// Sunday 15 Nov 2026, at 20:00 local (his plan).
const SUN = new Date(2026, 10, 15, 20, 0, 0).toISOString()
const THU = new Date(2026, 10, 12, 9, 0, 0).toISOString()
const MON = new Date(2026, 10, 16, 7, 0, 0).toISOString()
const SAT = new Date(2026, 10, 14, 7, 0, 0).toISOString()

console.log('\n1. Where week 1 begins')
check('his plan: made on a rest-day Sunday, it begins on Monday the 16th', local(snapPlanStart(SUN, MON_TO_SAT)) === '2026-11-16', local(snapPlanStart(SUN, MON_TO_SAT)))
check('someone who trains on Sundays keeps the Sunday (nothing is skipped)', snapPlanStart(SUN, WITH_SUNDAY) === SUN)
check('a Saturday start with Saturday a training day stays', snapPlanStart(SAT, MON_TO_SAT) === SAT)
const SAT_SUN_REST = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => day(d))
check('a Saturday start with Saturday and Sunday both rest begins on Monday', local(snapPlanStart(SAT, SAT_SUN_REST)) === '2026-11-16', local(snapPlanStart(SAT, SAT_SUN_REST)))
check('a Thursday start keeps its Thursday (a session is on it)', snapPlanStart(THU, MON_TO_SAT) === THU)
check('a Monday start is unchanged', snapPlanStart(MON, MON_TO_SAT) === MON)
check('no week 1 to read: unchanged', snapPlanStart(SUN, []) === SUN && snapPlanStart(SUN, undefined) === SUN)
const walk = { ...day('Sunday', false), plannedActivity: { activity: 'Walk', duration: 20 } } as unknown as WorkoutDay
check('a planned walk on the Sunday counts as a session: unchanged', snapPlanStart(SUN, [...MON_TO_SAT, walk]) === SUN)
const snapped = snapPlanStart(SUN, MON_TO_SAT)
check('the week count reads the snapped start: Sunday 22nd is still week 1, Monday 23rd week 2',
  getActiveMesocycleWeek(snapped, new Date(2026, 10, 22, 12), 16) === 1 && getActiveMesocycleWeek(snapped, new Date(2026, 10, 23, 12), 16) === 2)

console.log('\n2. Calendar rows')
const meso = Array.from({ length: 4 }, (_, i) => ({ week_number: i + 1, block_number: 1, phase_label: 'Anatomical Adaptation', days: MON_TO_SAT } as unknown as MesocycleWeek))
const snappedRows = buildProgramCalendar(meso, snapped).map(calendarRowLabel)
check('his plan snapped: four rows, W1 W2 W3 W4, no row of the week before', JSON.stringify(snappedRows.map(r => r.text)) === JSON.stringify(['W1', 'W2', 'W3', 'W4']), snappedRows.map(r => r.text))
const thuRows = buildProgramCalendar(meso, THU).map(calendarRowLabel)
const straddling = thuRows.filter(r => r.kind === 'dates')
check('a Thursday plan: rows holding two weeks read their dates, never "W1–2"', straddling.length >= 3 && thuRows.every(r => !/W\d+–/.test(r.text)), thuRows.map(r => r.text))
check('...as "16–22" over "Nov"', straddling.some(r => r.text === '16–22' && r.sub === 'Nov'), straddling.map(r => `${r.text}/${r.sub}`))
check('...and say both weeks aloud', straddling.every(r => /weeks \d+ and \d+/.test(r.spoken)), straddling.map(r => r.spoken))
const cross = buildProgramCalendar(meso, THU).map(calendarRowLabel).find(r => r.text === '30–6')
check('a row across two months names both', cross?.sub === 'Nov–Dec', cross)

console.log(`\n${ran} checks ran, ${failures} failed.`)
process.exit(failures > 0 ? 1 : 0)
