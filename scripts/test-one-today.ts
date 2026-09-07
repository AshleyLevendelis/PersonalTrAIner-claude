// ---------------------------------------------------------------------------
// The app has ONE today, and a finished session is not an unstarted one.
//
// Both from Ashley's phone, 7 Sep 2026, in two screenshots a minute apart:
//
//   Exercise tab, 15:30 — "TODAY · MONDAY", every exercise struck through and
//   ticked, and a full-width "Start workout" button under them.
//   Chat, 15:31 — "we're on for Tuesday's Push & Press session today... I saw
//   you logged your first session yesterday... how did Monday's workout feel?"
//
// Two separate defects, and the second is the one that touches data.
//
//   1. The primary action tested `status !== 'running'`. Status has THREE
//      values, so a FINISHED session fell through and offered to start the
//      workout it had just completed.
//
//   2. useActiveSession's identity — the app's date and day name, and what
//      every logged set is stamped with — was memoised on profile and plan
//      facts. None of them changes at midnight, so the stamp never moved. A
//      session left open across a day boundary kept yesterday, while every
//      fresh getSessionDateContext caller (the coach's context among them)
//      read the real day. Two todays, and sets filed under whichever this
//      hook was holding.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const read = (p: string) =>
  raw(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}

const panel = read('src/components/exercise/TodayPanel.tsx')
const hook = read('src/hooks/useActiveSession.tsx')

console.log('\n1. A finished session is not offered a start button\n')
{
  // THE THREE-STATE TRAP. `!== 'running'` reads as "not in progress" and means
  // "idle OR finished". Only one of those wants a Start button.
  const cta = panel.slice(panel.indexOf('!peekWorkout && !isRestDay'), panel.indexOf('Start workout') + 40)
  check('the Start-workout block was located (sanity check on this check)', cta.length > 80, cta.length)
  check('it is offered only from idle', /status === 'idle'/.test(cta), cta.slice(0, 200))
  check('...and never merely because a session is not running',
    !/status !== 'running'/.test(cta), cta.slice(0, 200))
  // The spacer that reserves room for the fixed button has to agree with it,
  // or a finished day carries 100px of empty space under the last exercise.
  check('the spacer under the list follows the same condition',
    /\{status === 'idle' && <div aria-hidden className="h-\[100px\]" \/>\}/.test(panel))
  // Nothing anywhere in this screen may treat the three states as two.
  const looseTests = panel.match(/status !== 'running'/g) ?? []
  check('no "not running" test is left standing in for "not started"', looseTests.length === 0, looseTests)
}

console.log('\n2. One today, and it moves when the day does\n')
{
  check('the day is held as state, not re-derived on every render',
    /const \[dayStamp, setDayStamp\] = useState\(\(\) => getSessionDateContext\(profileId\)\)/.test(hook))
  check('...and identity reads that stamp rather than the raw clock',
    /date: dayStamp\.date/.test(hook) && /dayName: devOverrideDay \?\? dayStamp\.day/.test(hook))
  check('...so a day change actually re-stamps identity',
    /totalWeeks, dayStamp\]/.test(hook))

  // THE HAZARD THE FREEZE EXISTS FOR, kept exactly. A running session owns the
  // date it began on; re-stamping mid-workout would split one session in two.
  check('a running session still holds the day it started on',
    /if \(statusRef\.current === 'running'\) return/.test(hook))
  check('...read through a ref, so the watcher does not re-subscribe per set',
    /const statusRef = useRef<'idle' \| 'running' \| 'finished'>\('idle'\)/.test(hook)
    && /statusRef\.current = status/.test(hook))

  // A phone left on this tab overnight never re-mounts, so neither a mount nor
  // a render is enough on its own.
  // BOTH HALVES OF THE SUBSCRIPTION. A first version tested for the word
  // "visibilitychange" anywhere, which the cleanup's removeEventListener
  // satisfies on its own — deleting the addEventListener sailed straight
  // through. Caught by mutation.
  check('the day is re-checked when the app comes back to the foreground',
    /document\.addEventListener\('visibilitychange', onVisible\)/.test(hook))
  check('...and that listener is cleaned up on unmount',
    /document\.removeEventListener\('visibilitychange', onVisible\)/.test(hook))
  check('...checking only when the app is actually visible',
    /document\.visibilityState === 'visible'/.test(hook))
  check('...and on a timer, for a screen nobody leaves',
    /setInterval\(check, 60_000\)/.test(hook))
  check('...updating only on a real change, never on every tick',
    /prev\.date === fresh\.date && prev\.day === fresh\.day \? prev : fresh/.test(hook))

  // The two readers that disagreed. Both must end up on the same helper.
  const chat = read('src/components/ChatAssistant.tsx')
  check('the coach still reads the day from the shared helper',
    /getSessionDateContext\(profile\.id\)\.date/.test(chat))
  check('...and the session hook reads the same one',
    /getSessionDateContext\(profileId\)/.test(hook))
}

if (failures > 0) { console.error(`\n${failures} check(s) failed\n`); process.exit(1) }
console.log('\nOne today, and a finished day stays finished.\n')
