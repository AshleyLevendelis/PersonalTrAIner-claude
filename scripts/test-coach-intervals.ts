// The coach's interval suggestion becomes a one-tap timer (his request, 16 Nov 2026): "When the coach suggests a timed
// workout ... it should offer to start the interval clock for you with just one button."
// Holds the reader that turns the coach's words into a round: work, rest and rounds all named, or no button.
import { readFileSync } from 'node:fs'
import { blockShape, parseIntervalSuggestion } from '../src/lib/timer-engine'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail ? ` (${detail})` : ''}`) }
}
const shape = (t: string) => { const c = parseIntervalSuggestion(t); return c ? `${c.rounds}/${c.workSeconds}/${c.restSeconds}` : 'null' }

// §1 What the coach writes becomes the round it describes
const cases: [string, string][] = [
  ['Skipping rope is a great pick for 10 minutes! Try 30 seconds of jumping followed by 30 seconds of rest for 10 rounds.', '10/30/30'],
  ['Do 10 rounds of 40s on / 20s off.', '10/40/20'],
  ['8 × 20s hard, 10s rest', '8/20/10'],
  ['1 minute on, 1 minute off for 6 rounds', '6/60/60'],
  ['45 seconds of burpees with 15 seconds rest, 12 rounds', '12/45/15'],
]
for (const [text, want] of cases) check(`reads "${text.slice(0, 48)}…" as ${want}`, shape(text) === want, shape(text))

// §2 Anything that is not an interval session gets no button
const none = [
  'Rest 90 seconds between sets.',
  'Walk for 30 minutes at an easy pace.',
  '3 sets of 10 reps with 60s rest.',
  'Great session today!',
  '',
]
for (const text of none) check(`no round from "${text.slice(0, 40)}"`, shape(text) === 'null', shape(text))
check('null input is safe', parseIntervalSuggestion(null) === null)

// §3 The label says the round it will start
const c = parseIntervalSuggestion(cases[0][0])
check('the button label reads the round', !!c && blockShape(c) === '10 × 30s, 30s rest', c ? blockShape(c) : 'null')

// §4 The chat draws the button from the coach's own words and starts that round (source; the driver taps it)
const src = readFileSync('src/components/ChatAssistant.tsx', 'utf8').replace(/\/\/.*$/gm, '')
check('a coach bubble is read with parseIntervalSuggestion(', /parseIntervalSuggestion\(msg\.content\)/.test(src))
check('the tap starts the round', /timers\.startRound\(/.test(src))

console.log(`${ran} checks ran, ${failures} failed`)
if (failures > 0) process.exit(1)
