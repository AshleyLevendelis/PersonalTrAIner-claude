// ---------------------------------------------------------------------------
// Gate: a session shorter than the one somebody asked for says why.
//
// Audit §6.5, item 18. Measured: 2.3% of combinations have a training day
// more than 10% under the minimum requested, worst case 21% under — 35
// minutes against a 45-60 request. Nothing runs over.
//
// The cause is a thin pool, not a lazy engine: 5 of the 6 failing
// combinations are minimalist equipment and 5 of 6 are novice. So the fix is
// NOT more work. Padding a session with repeats of what is already in it to
// hit a number would be volume for the sake of a target, which is the shape
// of fabrication this codebase refuses everywhere else.
//
// What it can stop doing is printing "~35 min" beside a request for 45-60
// with nothing to explain it. Section 3 is the one that matters: the fix must
// change what is SAID and not one set, rep or exercise.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { describeSessionShortfall } from '../src/lib/session-shortfall'
import { getSessionMinimumSeconds } from '../src/lib/session-duration'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`  ok: ${name}`)
  else { failures++; console.error(`  FAIL: ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const min45 = getSessionMinimumSeconds('45-60')

console.log('\n1. A session that fits says nothing')
{
  check('a session inside the range is not flagged',
    describeSessionShortfall(min45 + 300, '45-60') === null)
  check('a session exactly at the minimum is not flagged',
    describeSessionShortfall(min45, '45-60') === null)
  // Running a few minutes short is normal variance. Saying so every time
  // would be noise, and noise is how a real warning gets ignored.
  check('a few minutes short is not flagged',
    describeSessionShortfall(min45 * 0.95, '45-60') === null, min45 * 0.95)
  check('no requested length means nothing to be short of',
    describeSessionShortfall(1000, undefined) === null)
}

console.log('\n2. A materially short session explains itself')
{
  const short = describeSessionShortfall(min45 * 0.79, '45-60')
  check('21% under is flagged', short !== null, short)
  check('...naming the length they asked for', !!short && /45-60/.test(short.note), short?.note)
  check('...and saying WHY, not just that it is short',
    !!short && /equipment/.test(short.note), short?.note)
  check('...and offering the way to add more',
    !!short && /extra-work/.test(short.note), short?.note)
  // It must not apologise for a session that is the right amount of work for
  // the equipment available. The silence was wrong, not the length.
  check('...without apologising or calling the plan broken',
    !!short && !/sorry|unfortunately|error|wrong|failed/i.test(short.note), short?.note)
  check('...and reports the real numbers', short?.actualMinutes === Math.round(min45 * 0.79 / 60), short)
}

console.log('\n3. The cases that are SHORT ON PURPOSE are left alone')
{
  // A deload is meant to be lighter. Flagging it would tell somebody their
  // plan is broken for working correctly.
  check('a deload week is not flagged',
    describeSessionShortfall(min45 * 0.6, '45-60', { isDeload: true }) === null)
  // computeDurationTopUp gives low recovery ZERO top-up deliberately, and
  // quality-score.ts exempts it from under-run for exactly that reason. This
  // has to agree with both, or the app contradicts its own choice on screen.
  check('a low-recovery week is not flagged either',
    describeSessionShortfall(min45 * 0.6, '45-60', { lowRecovery: true }) === null)
}

console.log('\n4. It changed what is said, and not one set')
{
  const mod = stripComments(readFileSync(join(ROOT, 'src/lib/session-shortfall.ts'), 'utf8'))
  // The module must be pure description. Anything that reaches for the plan
  // is a prescription change wearing a copy fix.
  check('the module never touches sets, reps or exercises',
    !/\.sets\b|\.reps\b|exercises|suggested_load/.test(mod), mod.slice(0, 200))
  check('...and imports nothing that could change a plan',
    !/exercise-plan|load-prescription|periodization/.test(mod))

  const panel = stripComments(readFileSync(join(ROOT, 'src/components/exercise/TodayPanel.tsx'), 'utf8'))
  check('today computes the estimate from the app\'s own estimator',
    /estimateDaySeconds\(workout\)/.test(panel))
  check('...and passes both the number and the reason',
    /estimatedMinutes=\{sessionEstimate\.minutes\}/.test(panel) &&
    /shortfallNote=\{sessionEstimate\.shortfall\?\.note\}/.test(panel))
  check('...telling it about deloads and low recovery, so it can stay quiet for those',
    /isDeload: currentMesoWeekObj\?\.is_deload/.test(panel) &&
    /lowRecovery: profile\?\.recovery_capacity === 'low'/.test(panel))

  const row = stripComments(readFileSync(join(ROOT, 'src/components/exercise/WeekContextRow.tsx'), 'utf8'))
  check('the reason is shown next to the number, not hidden behind the expander',
    /\{shortfallNote &&/.test(row) && !/expanded && shortfallNote/.test(row))
  // estimatedMinutes was a documented prop that nothing ever passed, so the
  // "~52 min" chip its own header describes never rendered.
  check('the minutes chip it always described now actually renders',
    /estimatedMinutes != null\) headerParts\.push/.test(row))
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll session-shortfall checks passed.')
