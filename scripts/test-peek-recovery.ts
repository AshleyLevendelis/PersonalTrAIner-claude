// test:peek-recovery — ANOTHER DAY'S OPTIONAL CARDIO (his report 25 Nov 2026: "The optional rest day exercises should be
// loggable like other exercises"). Which days log it, which preview it. The screen is verify:rest-day §11.
import { optionalCardioMode, LOG_BACK_DAYS } from '../src/lib/activity-day'

let failures = 0
let ran = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  ran += 1
  if (ok) console.log(`    ✓ ${name}`)
  else { failures += 1; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const today = '2026-11-25'
check('today logs', optionalCardioMode(today, today) === 'log')
check('tomorrow is a preview, never logged ahead', optionalCardioMode('2026-11-26', today) === 'ahead')
check('a day next month is a preview', optionalCardioMode('2026-12-03', today) === 'ahead')
check('yesterday logs (to its own day)', optionalCardioMode('2026-11-24', today) === 'log')
check('exactly two weeks back still logs', optionalCardioMode('2026-11-11', today) === 'log', LOG_BACK_DAYS)
check('a day more than two weeks back is closed', optionalCardioMode('2026-11-10', today) === 'closed')
check('the window is two weeks, the chat\'s rule for an earlier day (a literal, not the constant)', LOG_BACK_DAYS === 14)
// Across a month and a year end, and a clock change (dates as dates, never instants).
check('across a year end', optionalCardioMode('2025-12-20', '2026-01-02') === 'log' && optionalCardioMode('2025-12-18', '2026-01-02') === 'closed')
check('across the March clock change', optionalCardioMode('2026-03-15', '2026-03-29') === 'log' && optionalCardioMode('2026-03-14', '2026-03-29') === 'closed')

console.log(`\n${ran} checks ran.`)
console.log(failures === 0 ? '\nAnother day\'s optional cardio logs where it should and waits where it should.\n' : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
