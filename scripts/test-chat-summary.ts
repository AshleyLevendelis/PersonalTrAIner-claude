// THE COACH REMEMBERS OLDER CHATS (17 Nov 2026, the chat review, his "Build it all"). Held here:
//   1. a summary is written only for messages that have LEFT the 20-message window, in batches of 10 or more;
//   2. a summary is kept only when it passes: no number that is not in the messages, no clinical label he did not use,
//      not too long; a failed one leaves the previous summary standing;
//   3. the chat sends it to the coach, the coach's instructions use it as memory, and Clear chat takes it too (Undo
//      brings it back).
import { readFileSync } from 'node:fs'
import { messagesToSummarise, summaryProblem, nextSummary, CHAT_WINDOW, SUMMARISE_EVERY, SUMMARY_MAX_CHARS } from '../src/lib/chat-summary'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail).slice(0, 300)})` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const msg = (i: number, content = `message ${i}`) => ({ role: i % 2 ? 'assistant' : 'user', content, created_at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(), status: 'complete' })
const many = (n: number) => Array.from({ length: n }, (_, i) => msg(i))

console.log('1. Only what left the window, in batches')
check('the window is 20 messages, and a batch is 10 or more (the numbers this is built on)', CHAT_WINDOW === 20 && SUMMARISE_EVERY === 10)
check('20 messages: nothing to summarise', messagesToSummarise(many(20), null).length === 0)
check('15 messages: nothing either (all still in the window)', messagesToSummarise(many(15), null).length === 0)
check('29 messages: 9 have left, not yet a batch', messagesToSummarise(many(29), null).length === 0)
const batch = messagesToSummarise(many(30), null)
check('30 messages: the 10 oldest, oldest first', batch.length === 10 && batch[0].content === 'message 0' && batch[9].content === 'message 9', batch.map(b => b.content))
const after = { text: '- he likes mornings', through: batch[9].created_at as string }
check('...and once summarised they are not sent again', messagesToSummarise(many(30), after).length === 0)
check('...the next batch is only the newer ones', messagesToSummarise(many(40), after).map(b => b.content).join() === Array.from({ length: 10 }, (_, i) => `message ${i + 10}`).join())

console.log('\n2. A summary is kept only when it passes')
const src = ['my knee was sore on lunges, about 6 out of 10', 'try 40kg goblet squats instead']
check('a summary using only their numbers passes', summaryProblem('- knee sore on lunges (6 out of 10)\n- to check: 40kg goblet squats', src, null) === null)
check('a number that is in none of the messages is refused', /number/.test(summaryProblem('- knee sore, 8 out of 10', src, null) ?? ''), summaryProblem('- knee sore, 8 out of 10', src, null))
check('a number from the previous summary is allowed', summaryProblem('- squats at 70kg', src, '- squats at 70kg') === null)
check('a clinical label he did not use is refused', /label/.test(summaryProblem('- possible tendinitis in the knee', src, null) ?? ''))
check('...but his own word is kept', summaryProblem('- says it might be tendinitis', ['I think it might be tendinitis'], null) === null)
check('too long is refused', summaryProblem('x'.repeat(SUMMARY_MAX_CHARS + 1), src, null) === 'too long')
const prev = { text: '- old', through: '2026-11-01T00:00:00.000Z' }
const failed = nextSummary('- 99 sets of squats', [msg(1, 'squats today')], prev)
check('a failed summary leaves the previous one standing', !failed.kept && failed.summary === prev, failed)
const good = nextSummary('- squats today', [msg(1, 'squats today'), msg(2, 'done')], prev)
check('a passing one is kept, through the newest message it covers', good.kept && good.summary?.through === msg(2).created_at, good)
check('no reply keeps the previous one', nextSummary(null, [msg(1)], prev).summary === prev)

console.log('\n3. The chat and the coach use it; Clear takes it')
const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
const server = strip(readFileSync('supabase/functions/chat-gemini/index.ts', 'utf8'))
check('the chat sends it with every message', /chat_summary: chatSummaryRef\.current\?\.text \?\? null/.test(chat))
check('the chat keeps a summary only through nextSummary (the check)', /const next = nextSummary\(/.test(chat) && /if \(!next\.kept\)/.test(chat))
check('the coach is given it as memory, older than the messages', /context\.chat_summary/.test(server) && /Never treat it as newer than the messages below/.test(server))
check('the coach writes it in a short call, told never to add a number or a label', /body\?\.mode === "summarise"/.test(server) && /Never add a number that is not in the messages/.test(server) && /never add a diagnosis or label/.test(server))
const clear = chat.slice(chat.indexOf('const handleClearChat = () => {'), chat.indexOf('const handleKeyDown'))
check('Clear chat clears the summary', /chatSummaryRef\.current = null/.test(clear) && /saveChatSummaryLocally\(profileId, null\)/.test(clear))
check('...and Undo puts it back', /chatSummaryRef\.current = keptSummary/.test(clear))
check('the migration adds the column the chat writes', /add column if not exists chat_summary jsonb/.test(readFileSync('supabase/migrations/20261117120000_add_chat_summary.sql', 'utf8')) && /from\('fitness_profiles'\)\.update\(\{ chat_summary: next\.summary \}\)/.test(chat))

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} FAILED.`); process.exit(1) }
console.log('The coach remembers older chats, and only what they said.')
