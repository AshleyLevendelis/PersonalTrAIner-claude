// EVERY OFFER PASSES ONE CHECKPOINT: stage 1 of his plan (docs/plans/coach-reaches-everything.md, his "Build stage 1",
// 17 Nov 2026; his ruling "Coach answers"). Holds: every tool the coach has carries a rule; the three word rules read
// his message right (his own "this evening" among them); the app's sentences; and the wiring on both sides, in front of
// every tool's own branch. The real function is driven by verify:chat-silent-tools, the screen by verify:chat-one-off-sport.
import { readFileSync } from 'node:fs'
import { OFFER_RULES, CARD_KIND_TOOL, isOneOffMention, saysForGood, offerWordsProblem } from '../src/lib/offer-rules'
import { isHedged } from '../src/lib/definite-mention'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('1. Every tool the coach has carries a rule')
const server = readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8')
const tools = [...server.matchAll(/^ {4}name: "([a-z_]+)",$/gm)].map(m => m[1])
check('the coach\'s tools are read off its declarations (and there are many)', tools.length >= 50, tools.length)
const missing = tools.filter(t => !(t in OFFER_RULES))
check('every tool has a rule: a new tool cannot ship unchecked', missing.length === 0, missing)
const stale = Object.keys(OFFER_RULES).filter(t => !tools.includes(t))
check('no rule names a tool the coach does not have', stale.length === 0, stale)
const noReason = Object.entries(OFFER_RULES).filter(([, r]) => 'none' in r && !(r.none ?? '').trim()).map(([t]) => t)
check('a tool with no words rule says what checks it instead', noReason.length === 0, noReason)
const ruled = Object.entries(OFFER_RULES).filter(([, r]) => 'words' in r).map(([t]) => t)
check('the lasting changes, the one-day changes and the something-on-a-day ones are all ruled',
  ['propose_concurrent_activity', 'propose_schedule_change', 'propose_session_length', 'ban_exercise', 'propose_volume_change',
    'propose_session_shorten', 'propose_session_kind_today', 'propose_rest_day', 'propose_session_move', 'propose_cardio_session'].every(t => ruled.includes(t)), ruled)

// EVERY CARD THE APP CAN RECEIVE IS RULED TOO (17 Nov 2026): the app's backstop reads the card's kind, which is not
// always the tool's name. Card kinds are read off the server's `kind: "propose_..."` returns, not listed by hand.
// A GOAL IS LASTING BY ITS NATURE (exam 17 Nov 2026): "start building muscle instead" had been refused as a one-off.
check('a goal change is never refused as a one-off ("...instead")', offerWordsProblem('propose_goal_change', 'I want to stop cutting and start building muscle instead', { hedged: false }) === null)
const cardKinds = [...new Set([...server.matchAll(/kind: "(propose_[a-z_]+)"/g)].map(m => m[1]))]
check('the card kinds are read off the server (and there are many)', cardKinds.length >= 40, cardKinds.length)
const unruledCards = cardKinds.filter(k => !(k in OFFER_RULES) && !(CARD_KIND_TOOL[k] in OFFER_RULES))
check('every card kind the app can receive reaches a rule', unruledCards.length === 0, unruledCards)
check('a ban card is held to the ban tool\'s rule on the app\'s side ("not today" is not "never")',
  offerWordsProblem('propose_exercise_ban', "I don't want to do squats today", { hedged: false })?.rule === 'standing')

console.log('\n2. One occasion (a lasting change is not offered)')
for (const m of ['Im doing myay thai this evening', 'Going to boxing tonight', 'playing football tomorrow',
  "I'm doing Muay Thai instead of legs today", 'doing a spin class this morning', 'Muay Thai later on', "I don't have bands today"]) {
  check(`one-off: "${m}"`, isOneOffMention(m))
}
for (const m of ['I do Muay Thai every Tuesday', 'I also do Muay Thai on Tuesday and Thursday evenings',
  'I play five-a-side every Wednesday night', 'I run with a club on Saturday mornings', 'I box twice a week',
  "Muay Thai's on Tuesdays, so tonight too", "I'm doing Muay Thai tonight, I go every Tuesday",
  'I want to switch to building muscle starting today', "My knee's been bad for weeks and it hurt again today", 'I usually go to judo, going tonight']) {
  check(`not a one-off: "${m}"`, !isOneOffMention(m))
}
check('no time said at all is not called a one-off (the coach asks)', !isOneOffMention('I do Muay Thai on Tuesday') && !isOneOffMention(''))

console.log('\n3. From now on (a one-day change is not offered)')
for (const m of ['I only have 45 minutes from now on', 'make Fridays rest days', 'move my sessions to Thursdays going forward',
  'every week I need a lighter Friday', 'make it shorter for the rest of the plan', 'I want it this way permanently']) {
  check(`for good: "${m}"`, saysForGood(m))
}
for (const m of ['I only have 45 minutes today', 'make today a rest day', 'my knee always hurts on squats, can we go lighter today', 'move today to Thursday']) {
  check(`one day: "${m}"`, !saysForGood(m))
}

console.log('\n4. What each tool gets')
const p = (tool: string, msg: string) => offerWordsProblem(tool, msg, { hedged: isHedged(msg) })
check('his message: no rebuild-around-it offer', p('propose_concurrent_activity', 'Im doing myay thai this evening')?.rule === 'standing')
check('...a weekly class still gets one', p('propose_concurrent_activity', 'I do Muay Thai every Tuesday evening') === null)
check('...a maybe never does (definite)', p('propose_concurrent_activity', 'I might start Muay Thai on Tuesdays')?.rule === 'definite')
check('"45 minutes from now on" does not get today\'s shorten offer', p('propose_session_shorten', 'I only have 45 minutes from now on')?.rule === 'today')
check('..."45 minutes today" does', p('propose_session_shorten', 'I only have 45 minutes today') === null)
check('...and "from now on" does get the session-length offer', p('propose_session_length', 'I only have 45 minutes from now on') === null)
check('"I don\'t want squats today" does not ban them', p('ban_exercise', "I don't want to do squats today")?.rule === 'standing')
check('"I might go for a run Wednesday" puts nothing on the plan', p('propose_cardio_session', 'I might go for a run Wednesday')?.rule === 'definite')
check('a tool with no words rule always passes', p('propose_meal_swap', 'swap tonight\'s dinner') === null && p('log_weight', 'I weigh 80 today') === null)
check('an unknown tool passes (the gate above keeps the list whole)', offerWordsProblem('made_up_tool', 'tonight', { hedged: true }) === null)
const say = p('propose_concurrent_activity', 'Im doing myay thai this evening')?.say ?? ''
check('the app\'s fallback says the plan is left as it is and how to make it lasting', /left your plan as it is/.test(say) && /every week/.test(say) && !/\?/.test(say), say)

console.log('\n5. Wired in front of every tool, on both sides')
const srv = strip(server)
const check1 = srv.indexOf('const wordsProblem = offerWordsProblem(name, message, { hedged: isHedged(message) });')
const firstBranch = srv.indexOf('if (name === "propose_meal_swap")')
check('the coach\'s server checks before the first tool branch', check1 > 0 && firstBranch > 0 && check1 < firstBranch)
const block = check1 > 0 ? srv.slice(check1, firstBranch) : ''
check('...answers in words through the checked reply path, with the app\'s sentence as the floor', /toolReply\(/.test(block) && /floor: wordsProblem\.say/.test(block))
check('...and proposes nothing', /return new Response\(JSON\.stringify\(\{ reply: spoken\.reply, offerRefused: \{ tool: name, rule: wordsProblem\.rule \} \}\)/.test(block) && !/proposal:/.test(block))
const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
const c1 = chat.indexOf("const wordsProblem = offerWordsProblem(result.proposal.kind, userSaid, { hedged: isHedged(userSaid ?? '') })")
const c2 = chat.indexOf("} else if (result.proposal.kind === 'propose_meal_swap' && result.proposal.rawArgs) {")
check('the app checks before it builds any card, and says its sentence', c1 > 0 && c2 > 0 && c1 < c2 && /if \(wordsProblem\) \{\s*refusal = wordsProblem\.say/.test(chat.slice(c1, c2)))
for (const f of ['offer-rules', 'definite-mention']) {
  const copy = readFileSync(`supabase/functions/_shared/${f}.ts`, 'utf8')
  check(`the server reads the same ${f} (synced copy)`, copy.includes(readFileSync(`src/lib/${f}.ts`, 'utf8')))
}

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} FAILED.`); process.exit(1) }
console.log('All offer-rule checks passed.')
