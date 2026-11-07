/**
 * test:typed-days — TRAINING DAYS TYPED IN SETUP ARE READ BY THE APP
 * (7 Nov 2026, Ashley's setup: "I train mon, tue, thu, fri mornings and do
 * muay thai tue and thu evenings").
 *
 *   1. trainingDaysIn: her sentence gives her GYM days, never the muay thai
 *      days; plain lists, names and "weekdays" read; anything that is a
 *      conversation rather than an answer ("except", "can't", "next week",
 *      two lists with nothing saying which is hers) is left for the coach.
 *   2. Once the days are answered, only a plain statement about her own
 *      training changes them.
 *   3. The wiring (source): setup reads every typed message with it, passes
 *      whether the days are answered, and ticks what it takes.
 * The browser half is verify:onboarding-turns §25.
 */
import { readFileSync } from 'node:fs'
import { trainingDaysIn } from '../src/lib/onboarding-capture'

let ran = 0, failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('\n1. What a typed message gives')
const HERS = 'I train mon, tue, thu, fri mornings and do muay thai tue and thu evenings'
check('her sentence: her gym days, not the muay thai days', same(trainingDaysIn(HERS), ['Mon', 'Tue', 'Thu', 'Fri']), trainingDaysIn(HERS))
const reads: [string, string[]][] = [
  ['mon wed fri', ['Mon', 'Wed', 'Fri']],
  ['Monday, Wednesday and Friday', ['Mon', 'Wed', 'Fri']],
  ['Tuesdays and Thursdays', ['Tue', 'Thu']],
  ['thurs, fri, sat', ['Thu', 'Fri', 'Sat']],
  ['weekdays', ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']],
  ['Fri, Mon & Wed', ['Mon', 'Wed', 'Fri']],
  ['I go to the gym on monday and thursday, football on saturday', ['Mon', 'Thu']],
  ['football on saturday and I lift monday and thursday', ['Mon', 'Thu']],
]
for (const [t, want] of reads) check(`"${t}"`, same(trainingDaysIn(t), want), trainingDaysIn(t))
const leftAlone = [
  'weekdays and saturday', 'every day except sunday', 'any day but not wednesday', 'I do yoga on sunday',
  'I sat down and thought about it', '3 days a week', 'monday or tuesday, then friday', "I can't do monday",
  'mon and wed next week', 'sat and sun',
]
for (const t of leftAlone) check(`left for the coach: "${t}"`, trainingDaysIn(t) === undefined, trainingDaysIn(t))

console.log('\n2. Once the days are answered')
check('a plain statement about her training still changes them', same(trainingDaysIn('actually I can train mon, wed and fri', { answered: true }), ['Mon', 'Wed', 'Fri']))
check('a bare mention of a day does not', trainingDaysIn('friday works for the weigh-in', { answered: true }) === undefined && trainingDaysIn('friday works for the weigh-in') !== undefined,
  [trainingDaysIn('friday works for the weigh-in', { answered: true }), trainingDaysIn('friday works for the weigh-in')])

console.log('\n3. The wiring (source; verify:onboarding-turns §25 drives it)')
const onb = strip(readFileSync('src/components/onboarding/ConversationalOnboarding.tsx', 'utf8'))
check('every typed message is read, saying whether the days are answered',
  /const typedDays = preRecorded \? undefined : trainingDaysIn\(trimmed, \{ answered: ws\.confirmed\.has\('trainingDays'\) \}\)/.test(onb))
check('...and what it takes is applied as the days answer, with its tick',
  /if \(typedDays && applySlot\(ws, 'trainingDays', typedDays, ws\.values\)\) \{\s*answeredThisTurn = true\s*immediateCommit = true/.test(onb))
const at = onb.indexOf('const typedDays'), send = onb.indexOf('if (immediateCommit) commitWorkingState(ws)')
check('...before the message goes to the coach, so it is told the days are answered', at >= 0 && send > at, { at, send })

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`typed days: ${failures} check(s) failed`); process.exit(1) }
console.log('typed days: all checks passed')
