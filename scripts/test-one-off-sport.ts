// A one-off class is not a standing one (his report 17 Nov 2026: "Im doing myay thai this evening" got an offer to
// rebuild sixteen weeks around "Muay Thai · Tuesday evenings"). Holds: what reads as one occasion, what reads as
// regular (the coach's own examples among them), the app's reply, and the wiring on both sides. The real function is
// driven by verify:chat-silent-tools.
import { readFileSync } from 'node:fs'
import { isOneOffMention, oneOffSportReply } from '../src/lib/one-off-sport'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}

console.log('1. One occasion')
for (const m of ["Im doing myay thai this evening", 'Going to boxing tonight', 'playing football tomorrow',
  "I'm doing Muay Thai instead of legs today", 'doing a spin class this morning', 'Muay Thai later on']) {
  check(`one-off: "${m}"`, isOneOffMention(m))
}

console.log('\n2. Regular, so the offer stands')
for (const m of ['I do Muay Thai every Tuesday', 'I also do Muay Thai on Tuesday and Thursday evenings',
  'I play five-a-side every Wednesday night', 'I run with a club on Saturday mornings', 'I box twice a week',
  "Muay Thai's on Tuesdays, so tonight too", 'I do it 3 times a week, tonight included', 'I usually go to judo, going tonight', "I'm doing Muay Thai tonight, I go every Tuesday"]) {
  check(`regular: "${m}"`, !isOneOffMention(m))
}
check('no time said at all is not called a one-off (the coach asks)', !isOneOffMention('I do Muay Thai on Tuesday'))
check('an empty message is not a one-off', !isOneOffMention('') && !isOneOffMention(null))

console.log('\n3. What the app says')
const said = oneOffSportReply('Muay Thai')
check('names the class, says the plan is unchanged, asks once about every week',
  /Enjoy Muay Thai\./.test(said) && /left your plan as it is/.test(said) && /every week/.test(said) && (said.match(/\?/g) ?? []).length === 0, said)

console.log('\n4. Wired on both sides')
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
const a = chat.indexOf("result.proposal.kind === 'propose_concurrent_activity' && result.proposal.rawArgs && isOneOffMention(userSaid)")
const b = chat.indexOf('const activity = buildConcurrentActivityProposal(result.proposal.rawArgs)')
check('the app refuses the card for a one-off, before it builds one', a > 0 && b > 0 && a < b && /refusal = oneOffSportReply\(/.test(chat.slice(a, b)))
const server = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
const c = server.indexOf('if (name === "propose_concurrent_activity" && isOneOffMention(message))')
const d = server.indexOf('if (name === "propose_concurrent_activity") {')
check('the coach\'s server answers in words and proposes nothing, before the offer branch', c > 0 && d > 0 && c < d && !/proposal:/.test(server.slice(c, d)) && /toolReply\(/.test(server.slice(c, d)))
const copy = readFileSync('supabase/functions/_shared/one-off-sport.ts', 'utf8')
check('the server reads the same rule (synced copy)', copy.includes(readFileSync('src/lib/one-off-sport.ts', 'utf8')))

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} FAILED.`); process.exit(1) }
console.log('All one-off-sport checks passed.')
