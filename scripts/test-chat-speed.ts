// THE CHAT IS FAST (his "make it fast" and "All at once", 17 Nov 2026). Holds the speed changes that need no model run:
//   1. a reply appears all at once by default (the word-by-word replay added ~3 s after it had already arrived);
//   2. the turn's facts are read together, and started before the reply placeholder is saved;
//   3. the server logs where the wait goes (one line per model call, one per turn), times and sizes only.
import { readFileSync } from 'node:fs'
import { DEFAULT_REVEAL_SPEED, getRevealSpeed } from '../src/lib/reveal-speed-store'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('1. A reply appears all at once')
check('the default reveal is off', DEFAULT_REVEAL_SPEED === 'off', DEFAULT_REVEAL_SPEED)
check('...and someone who never chose a speed gets it', getRevealSpeed(undefined) === 'off', getRevealSpeed(undefined))

console.log('\n2. The turn\'s facts are read together, before the placeholder is saved')
const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
const i = chat.indexOf('const readTurnFacts = async')
const facts = i < 0 ? '' : chat.slice(i, chat.indexOf('const callGemini = async', i))
const all = facts.indexOf('Promise.all([')
const allBody = all < 0 ? '' : facts.slice(all, facts.indexOf('])', all))
check('the eaten log, the week\'s eaten and the training weeks are one Promise.all',
  /getEatenByDate\(profile\.id, eatenWindow/.test(allBody) && /finishedDaysThisWeek/.test(allBody) && /readTrainingWeeks\(/.test(allBody), allBody.slice(0, 200))
check('...and none of them is awaited on its own before it', !/await getEatenByDate\(profile\.id, eatenWindow/.test(facts) && !/await readTrainingWeeks\(/.test(facts))
const send = chat.indexOf('const turnFacts = readTurnFacts()')
const ph = chat.indexOf('const placeholderId = await insertPlaceholder()')
check('sendMessage starts the reads before it waits for the placeholder', send > 0 && ph > 0 && send < ph, { send, ph })
check('...and hands them to the coach call', /callGemini\(userText, placeholderId, turnFacts\)/.test(chat))
check('the coach call uses what it was handed', /await \(facts \?\? readTurnFacts\(\)\)/.test(chat))

console.log('\n3. The server says where the wait goes')
const server = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
check('one line per model call, with its time', /console\.log\(`timing model-call ms=\$\{Date\.now\(\) - callStart\}/.test(server))
check('one line per turn, with the whole time', /console\.log\(`timing turn ms=\$\{Date\.now\(\) - turnStart\}/.test(server))
check('...and neither line carries what he typed', !/timing [^`]*\$\{(?:message|userMessage|body\.message)/.test(server))

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} FAILED.`); process.exit(1) }
console.log('The chat is quick to answer.')
