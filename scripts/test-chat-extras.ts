// THE SMALL CHAT EXTRAS (17 Nov 2026, the chat review, his "Build it all"):
//   1. an empty chat offers four starters; never over the greeting's own chips, never once he has spoken;
//   2. Clear chat has an Undo: the delete waits out the window, and is never lost (it runs when the app hides);
//   3. the "Session done" pill opens Exercise like every other pill.
import { readFileSync } from 'node:fs'
import { chatStarters, CHAT_STARTERS } from '../src/lib/chat-starters'

let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail).slice(0, 300)})` : ''}`) }
}
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

console.log('1. Starters on an empty chat')
const greeting = { role: 'assistant', content: 'Hi' }
check('a chat with only the greeting offers the four starters', JSON.stringify(chatStarters([greeting])) === JSON.stringify([...CHAT_STARTERS]))
check('the greeting\'s own chips win', JSON.stringify(chatStarters([{ ...greeting, quickReplies: ['Yes', 'No'] }])) === JSON.stringify(['Yes', 'No']))
check('once he has spoken, no starters', chatStarters([greeting, { role: 'user' }, { role: 'assistant' }]).length === 0)
check('...and the coach\'s own chips still show after he has spoken', JSON.stringify(chatStarters([greeting, { role: 'user' }, { role: 'assistant', quickReplies: ['Swap it'] }])) === JSON.stringify(['Swap it']))
const chat = strip(readFileSync('src/components/ChatAssistant.tsx', 'utf8'))
check('the chat asks for them where it asks for chips', /return chatStarters\(messages\)/.test(chat))

console.log('\n2. Undo after clearing')
const clear = chat.slice(chat.indexOf('const handleClearChat = () => {'), chat.indexOf('const handleKeyDown'))
const delAt = clear.indexOf(".from('chat_messages').delete()")
const flushAt = clear.indexOf('const flush = () => {')
check('the server delete only happens inside the flush, after the window', delAt > flushAt && flushAt > 0 && /setTimeout\(flush, CLEAR_UNDO_MS\)/.test(clear), { delAt, flushAt })
check('Undo puts the kept messages back', /undo: \(\) => \{[\s\S]*?setMessages\(kept\)/.test(clear))
check('...and cancels the delete', /undo: \(\) => \{[\s\S]*?clearTimeout\(timer\)/.test(clear))
check('the delete is never lost: hiding the app or closing the chat runs it at once', /visibilityState === 'hidden'\) clearUndo\.current\?\.flush\(\)/.test(chat) && /return \(\) => \{ document\.removeEventListener\('visibilitychange', onHide\); clearUndo\.current\?\.flush\(\) \}/.test(chat))
check('the Undo is on screen while the window is open', /data-testid="chat-cleared-undo"/.test(chat) && /onClick=\{\(\) => clearUndo\.current\?\.undo\(\)\}/.test(chat))

console.log('\n3. "Session done" opens Exercise')
check('the done pill is a button that opens Exercise', /p\.kind === 'done' \? \([\s\S]{0,400}<button type="button" key=\{p\.kind\} data-context-pill=\{p\.kind\} onClick=\{\(\) => openStripLink\('exercise'\)\}/.test(chat))

console.log(`\n${ran} checks ran.`)
if (failures > 0) { console.log(`${failures} FAILED.`); process.exit(1) }
console.log('The chat\'s small extras hold.')
