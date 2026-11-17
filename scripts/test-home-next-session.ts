// Home looks ahead once today is done (his report 16 Nov 2026, a screenshot of Home at 21:39 still showing today's
// finished "Push & Press"): "It should switch to see the upcoming tomorrow's workout."
// Holds: which session is next (the first day after today still due, with a session; else tomorrow's plan past the
// week's end); what is passed over; the line under it; and the wiring on Home.
import { readFileSync } from 'node:fs'
import { nextSessionAfter, nextSessionGlance } from '../src/lib/home-next-session'
import type { TrainingWeekDay } from '../src/hooks/useTrainingWeek'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}

const ex = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Ex ${i}` }))
const day = (date: string, dayName: string, state: TrainingWeekDay['state'], focus: string | null, n = 6): TrainingWeekDay =>
  ({ date, dayName, state, session: focus ? { day: dayName, focus, exercises: ex(n) } as never : null })

const week: TrainingWeekDay[] = [
  day('2026-11-16', 'Monday', 'done', 'Push & Press'),
  day('2026-11-17', 'Tuesday', 'due', 'Pull & Hinge', 7),
  day('2026-11-18', 'Wednesday', 'rest', null),
  day('2026-11-19', 'Thursday', 'due', 'Legs'),
  day('2026-11-20', 'Friday', 'due', 'Full Body'),
  day('2026-11-21', 'Saturday', 'rest', null),
  day('2026-11-22', 'Sunday', 'rest', null),
]

console.log('1. Which session is next')
const tomorrowPlan = { rest: false as const, focus: 'Pull & Hinge', minutes: 34 }
const his = nextSessionAfter(week, '2026-11-16', '2026-11-17', tomorrowPlan)
check('his screenshot: Monday done, Tuesday is "Tomorrow · Pull & Hinge"', his?.when === 'Tomorrow' && his.focus === 'Pull & Hinge' && his.date === '2026-11-17', his)
check('...with its exercises and minutes', his?.exerciseCount === 7 && his.minutes === 34 && nextSessionGlance(his) === '7 exercises · ~34 min', his && nextSessionGlance(his))
const afterRest = nextSessionAfter(week, '2026-11-17', '2026-11-18', { rest: true })
check('a rest day tomorrow: the next session is Thursday, named by its day', afterRest?.when === 'Thursday' && afterRest.focus === 'Legs' && afterRest.minutes === null, afterRest)
const missedThu = week.map(d => d.date === '2026-11-19' ? { ...d, state: 'rest_chosen' as const } : d)
check('a day he made a rest day is passed over', nextSessionAfter(missedThu, '2026-11-17', '2026-11-18', { rest: true })?.focus === 'Full Body')
const movedThu = week.map(d => d.date === '2026-11-19' ? { ...d, movedTo: { date: '2026-11-20', dayName: 'Friday' } } : d)
check('a session moved away is passed over', nextSessionAfter(movedThu, '2026-11-17', '2026-11-18', { rest: true })?.focus === 'Full Body')
const doneThu = week.map(d => d.date === '2026-11-19' ? { ...d, state: 'done' as const } : d)
check('a day already trained is passed over', nextSessionAfter(doneThu, '2026-11-17', '2026-11-18', { rest: true })?.focus === 'Full Body')
check('Friday done, nothing left this week and tomorrow a rest: nothing next', nextSessionAfter(week, '2026-11-20', '2026-11-21', { rest: true }) === null)
check('Sunday: the week has run out, so tomorrow\'s own plan is next', nextSessionAfter(week, '2026-11-22', '2026-11-23', { rest: false, focus: 'Push & Press', minutes: 40 })?.focus === 'Push & Press')
check('...but never a rest day', nextSessionAfter(week, '2026-11-22', '2026-11-23', { rest: true }) === null)

console.log('\n2. Wired on Home')
const dash = readFileSync('src/components/Dashboard.tsx', 'utf8')
check('Home works it out only once today is done, and never while paused',
  /const nextUp = done && !isPausedOn\(data\.today, planPausedSince\(profile\.id\)\) \? nextSessionAfter\(week\.days, data\.today, addDays\(data\.today, 1\), tomorrow\) : null/.test(dash))
check('the card shows it, today kept as one line', /nextUp=\{nextUp\}/.test(dash) && /\} else if \(nextUp\) \{\s*title = nextUp\.focus/.test(dash) && /✓ Today ·/.test(dash))
check('the small tile says what comes after, so tomorrow is not said twice', /const nextAfter = nextUp\?\.when === 'Tomorrow'/.test(dash) && /\{tileTitle\}/.test(dash))

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} FAILED.`); process.exit(1) }
console.log('All home-next-session checks passed.')
