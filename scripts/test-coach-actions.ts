// ONE MASTER LIST OF ACTIONS: stage 4 of docs/plans/coach-reaches-everything.md (his "start step 2 then 3 then 4",
// 17 Nov 2026). Every action the coach can take is defined once (COACH_ACTIONS in src/lib/offer-rules.ts). This holds
// everything else to it: the coach's declared tools and their handlers, the cards the server returns and the app
// handles, the stage-1 rules and card names (derived, not written twice), the screen-versus-coach document, and the
// generated docs/coach-actions.md. A tool added, dropped or re-named anywhere without the list fails here.
import { readFileSync } from 'node:fs'
import { COACH_ACTIONS, OFFER_RULES, CARD_KIND_TOOL } from '../src/lib/offer-rules'
import { renderCoachActionsDoc } from './coach-actions-doc'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail).slice(0, 300)})` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const same = (a: string[], b: string[]) => { const A = new Set(a), B = new Set(b); return { onlyA: [...A].filter(x => !B.has(x)), onlyB: [...B].filter(x => !A.has(x)) } }

const actions = Object.keys(COACH_ACTIONS)
const server = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))

console.log('1. The list is the coach\'s tools, exactly')
const declared = [...server.matchAll(/^ {4}name: "([a-z_]+)",$/gm)].map(m => m[1])
check('the declared tools are read off the server (and there are many)', declared.length >= 50, declared.length)
const d = same(actions, declared)
check('every declared tool is on the list, and nothing on the list is undeclared', d.onlyA.length === 0 && d.onlyB.length === 0, d)
const noHandler = actions.filter(t => !server.includes(`name === "${t}"`))
check('every action has its own handler in the coach\'s server', noHandler.length === 0, noHandler)

console.log('\n2. The cards: what the server returns, the list names and the app handles agree')
const returned = [...new Set([...server.matchAll(/kind: "(propose_[a-z_]+)"/g)].map(m => m[1]))]
const listed = actions.map(t => COACH_ACTIONS[t].card).filter((c): c is string => !!c)
const c = same(listed, returned)
check('every card the server returns is an action\'s card, and every listed card is returned', c.onlyA.length === 0 && c.onlyB.length === 0, c)
check('no two actions share a card', new Set(listed).size === listed.length)
const unhandled = listed.filter(k => !chat.includes(`'${k}'`))
check('the app has a branch for every card', unhandled.length === 0, unhandled)

console.log('\n3. The stage-1 rules and card names are derived from the list, not written twice')
check('OFFER_RULES is the list\'s rules, same keys, same objects', Object.keys(OFFER_RULES).length === actions.length && actions.every(t => OFFER_RULES[t] === COACH_ACTIONS[t].rule))
const aliases = actions.filter(t => COACH_ACTIONS[t].card && COACH_ACTIONS[t].card !== t)
check('CARD_KIND_TOOL is exactly the cards named differently from their tool', Object.keys(CARD_KIND_TOOL).length === aliases.length && aliases.every(t => CARD_KIND_TOOL[COACH_ACTIONS[t].card as string] === t), CARD_KIND_TOOL)
const src = strip(readFileSync('src/lib/offer-rules.ts', 'utf8'))
check('...and neither is a hand-written table any more', !/OFFER_RULES: Record<string, OfferRule> = \{/.test(src) && !/CARD_KIND_TOOL: Record<string, string> = \{/.test(src))

console.log('\n4. The screen-versus-coach document agrees with the list')
const doc = readFileSync('docs/coach-screen-parity.md', 'utf8')
const docStatus = Object.fromEntries([...doc.matchAll(/^\| `([a-z_]+)` \| ([A-Z]+)/gm)].map(m => [m[1], m[2].toLowerCase()]))
const p = same(actions, Object.keys(docStatus))
check('every action has a row in the document, and every row is an action', p.onlyA.length === 0 && p.onlyB.length === 0, p)
const wrong = actions.filter(t => docStatus[t] && docStatus[t] !== COACH_ACTIONS[t].screen)
check('each row says what the list says (on the screen too, or coach only)', wrong.length === 0, wrong.map(t => `${t}: doc ${docStatus[t]}, list ${COACH_ACTIONS[t].screen}`))

console.log('\n5. The readable list is generated, never hand-edited')
check('docs/coach-actions.md is exactly what the list renders (run npm run gen:coach-actions)', readFileSync('docs/coach-actions.md', 'utf8') === renderCoachActionsDoc())
const families = new Set(actions.map(t => COACH_ACTIONS[t].family))
check('every family holds at least one action', ['meals', 'exercise', 'day', 'plan', 'logging', 'memory', 'shopping'].every(f => families.has(f as never)), [...families])

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} FAILED.`); process.exit(1) }
console.log('One list of actions; the coach, the app and the documents agree with it.')
