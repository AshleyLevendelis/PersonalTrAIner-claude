/**
 * test:protein-advice — THE COACH NEVER TEACHES THE "ONLY 30-40 g AT A TIME" MYTH (7 Nov 2026).
 *
 * Her machine's exam on TEST, 7 Nov, case teach-protein-spread: the coach answered "your body can only use 30 to
 * 40 grams of protein at a time ... a lot gets oxidized for energy instead". The judge marked it outdated, and it
 * is: a larger serving is still digested and used, over a longer stretch (Trommelen et al., Cell Reports Medicine
 * 2023: 100 g gave a larger and longer response than 25 g). What counts most is the day's total (ISSN position
 * stand: about 1.4-2.0 g/kg/day); spreading it over meals is a practical way to reach it. The myth came from the
 * model's own knowledge, not from anything the app tells it, so the fix is a line in the coach's instructions and
 * the app's own lesson worded on the total. Ashley: "fix the protein advice too".
 *
 *   1. The coach is told, under "a why on every answer", that the cap is a myth, what is true instead, and that a
 *      bigger protein meal is fine.
 *   2. Nothing the app sends the coach states the cap as fact.
 *   3. The app's own protein lesson leads with the day's total and names no per-meal cap.
 *   4. The line is not an answer key: it does not quote the exam's question.
 * Whether the coach OBEYS is the exam's (teach-protein-spread, marked "correct" and "teaches").
 */
import { readFileSync } from 'node:fs'
import { LESSONS } from '../src/lib/coach-lessons'

let ran = 0, failures = 0
const check = (label: string, ok: boolean, extra?: unknown) => {
  ran++
  if (ok) console.log(`  ok: ${label}`)
  else { failures++; console.error(`  FAIL: ${label}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const idx = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
const a = idx.indexOf('=== 1-WHY. A WHY ON EVERY ANSWER')
const b = a < 0 ? -1 : idx.indexOf('=== 1-LEARN.', a)
const why = a >= 0 && b > a ? idx.slice(a, b) : ''
const line = why.split('\n').find(l => /PROTEIN AT ONE MEAL/.test(l)) ?? ''

console.log('\n1. The coach is told the truth, where it is told every reason must be true')
check('the "a why on every answer" section is found', why.length > 0)
check('...it carries the protein-at-one-meal line', line.length > 0)
check('...which says never to claim a per-meal cap or that the rest is wasted',
  /never say the body can only use or absorb a set amount of protein at a time/.test(line) && /wasted, burned or turned to energy/.test(line), line)
check('...names the cap as outdated and says a bigger serving is still used', /outdated/.test(line) && /bigger serving is still digested and used/.test(line), line)
check("...puts the day's total first, and spreading as a habit, not a rule", /What matters most is the day's total/.test(line) && /a sensible habit rather than a rule/.test(line), line)
check('...and says a bigger protein meal is fine', /a bigger protein meal is fine/.test(line), line)

console.log('\n2. Nothing the app sends states the cap as fact')
const CAP = /(?:can only|only) (?:use|absorb|process|utili[sz]e)[^.\n]{0,60}\b\d{2}\s*(?:-|–|to)?\s*\d{0,2}\s*(?:g|grams)\b/i
const stated = idx.split('\n').filter(l => CAP.test(l) && !/never say|myth|outdated/i.test(l))
check('no line of the coach states a per-meal cap', stated.length === 0, stated)
check('...the detector finds the exam\'s own sentence (proved, not assumed)', CAP.test('your body can only use 30 to 40 grams of protein at a time'))

console.log('\n3. The app\'s own lesson')
const lesson = LESSONS.find(l => l.id === 'protein-repair')
check('the protein lesson exists', !!lesson)
check("...leads with the day's total", /The day's total matters most/.test(lesson?.point ?? ''), lesson?.point)
check('...and names no per-meal amount or cap', !/\d/.test(lesson?.point ?? 'x') && !/only|at a time|wasted/i.test(lesson?.point ?? 'only'), lesson?.point)

console.log('\n4. Not an answer key')
const exam = JSON.parse(readFileSync('scripts/exam-cases/teach-protein-spread.json', 'utf8')) as { messages: string[] }
const words = (t: string) => t.toLowerCase().match(/[a-z']+/g) ?? []
const q = words(exam.messages[0])
const shared = q.filter((w, i) => i + 3 < q.length && line.toLowerCase().includes(q.slice(i, i + 4).join(' ')))
check('the line shares no four-word run with the exam question', shared.length === 0, shared)

console.log(`\n${ran} checks ran`)
if (failures > 0) { console.log(`protein advice: ${failures} check(s) failed`); process.exit(1) }
console.log('protein advice: all checks passed')
