// Everything from the chat (his request 16 Nov 2026, with a screenshot of the coach sending him to the Tools tab for
// the plate calculator): "I want to be able to do everything from chat. Open plate calculator, open recent session
// history, grocery list. Add things and remove things from the grocery list, open my program. Everything."
// Holds: which messages open which screen (and which do not); the channel each screen takes its request from; the
// app answering an open request itself, before the coach; and taking items off the shopping list, with an Undo that
// puts back what went.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
let ran = 0
let failures = 0
function check(name: string, ok: boolean, detail: unknown = '') {
  ran++
  if (ok) console.log(`ok: ${name}`)
  else { failures++; console.log(`FAIL: ${name}${detail !== '' ? ` (${JSON.stringify(detail)})` : ''}`) }
}
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

async function main() {
  // A window for the channel to run in.
  const events = new EventTarget()
  const fakeWindow = { location: { hash: '' }, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events) }
  ;(globalThis as unknown as { window: unknown }).window = fakeWindow
  const m = await import('../src/lib/open-request')

  console.log('1. Which messages open which screen')
  const opens: [string, string][] = [
    ['Open the plate calculator', 'plate'],
    ['open plate calc', 'plate'],
    ['Open recent session history', 'history'],
    ['show me my workout history', 'history'],
    ['Open the grocery list', 'grocery'],
    ['take me to my shopping list', 'grocery'],
    ["where's my shopping list?", 'grocery'],
    ['Open my program', 'program'],
    ['can you open my training plan', 'program'],
    ['open my profile', 'profile'],
    ['open settings', 'profile'],
    ['go to the nutrition tab', 'nutrition'],
    ['open tools', 'tools'],
    ['show me home', 'home'],
  ]
  for (const [text, want] of opens) check(`"${text}" opens ${want}`, m.parseOpenRequest(text)?.target === want, m.parseOpenRequest(text))
  const plate100 = m.parseOpenRequest('open the plate calculator for 100kg')
  check('a weight named with the plate calculator starts it there', plate100?.target === 'plate' && plate100.kg === 100, plate100)
  // His live test, 16 Nov: "Open the calculator at 120kg" went to the coach, which copied the app's line and opened nothing.
  const calc120 = m.parseOpenRequest('Open the calculator at 120kg')
  check('"Open the calculator at 120kg" is the plate calculator, at 120 kg (the only calculator in the app)', calc120?.target === 'plate' && calc120.kg === 120, calc120)
  check('"open my calorie calculator" is not the plate calculator', m.parseOpenRequest('open my calorie calculator')?.target !== 'plate', m.parseOpenRequest('open my calorie calculator'))
  const notOpens = [
    'add eggs to my grocery list',
    'remove the milk from my shopping list',
    'show me how to do a squat',
    'what should I eat for lunch?',
    'see you tomorrow',
    'my program feels too easy, can we make it harder?',
    'I checked my history and I lifted more last week',
    // A long message that starts "show me" is a real question for the coach, not a tap on a screen.
    'show me what my program would look like if I trained four days a week instead of three and dropped the deadlifts',
    '',
  ]
  for (const text of notOpens) check(`"${text}" is the coach's, not a screen to open`, m.parseOpenRequest(text) === null, m.parseOpenRequest(text))

  console.log('\n2. The app\'s own line, and the button read back from it')
  for (const t of ['plate', 'history', 'grocery', 'program', 'profile'] as const) {
    check(`the line for ${t} reads back as ${t} (so the button survives a reload)`, m.openTargetInReply(m.openedLine(t))?.target === t)
  }
  check('the plate calculator\'s line names the weight', m.openedLine('plate', 120) === 'Opened the plate calculator at 120 kg.', m.openedLine('plate', 120))
  const back = m.openTargetInReply(m.openedLine('plate', 120))
  check('...and its button reopens it at that weight, not the default', back?.target === 'plate' && back.kg === 120, back)
  check('a line with no weight reopens with none', m.openTargetInReply(m.openedLine('plate'))?.kg === null)
  check('the button names the screen', m.openButtonLabel('plate') === 'Open the plate calculator' && m.openButtonLabel('history') === 'Open your session history', [m.openButtonLabel('plate'), m.openButtonLabel('history')])
  check('a coach sentence is never read as the app\'s line', m.openTargetInReply('You can open the plate calculator on the Tools tab.') === null)

  console.log('\n3. The channel: each screen takes only its own request, once')
  m.requestOpen('plate', 80)
  check('opening the plate calculator moves to Tools', fakeWindow.location.hash === '#/tab/tools', fakeWindow.location.hash)
  check('Profile does not take the plate calculator\'s request', m.takeOpenRequest(['profile']) === null)
  const took = m.takeOpenRequest(['plate', 'history'])
  check('Tools takes it, with its weight', took?.target === 'plate' && took.kg === 80, took)
  check('...and only once', m.takeOpenRequest(['plate', 'history']) === null)
  let heard = 0
  const off = m.onOpenRequest(() => { heard++ })
  m.requestOpen('profile')
  check('a mounted screen is told a request is waiting', heard === 1 && m.takeOpenRequest(['profile'])?.target === 'profile', heard)
  off()
  m.requestOpen('grocery')
  check('the shopping list opens on its own page', fakeWindow.location.hash === '#/nutrition/grocery', fakeWindow.location.hash)
  m.requestOpen('program')
  check('the program opens on its own page', fakeWindow.location.hash === '#/exercise/program', fakeWindow.location.hash)

  console.log('\n4. Wired: the chat answers first, and each screen listens')
  const chat = read('src/components/ChatAssistant.tsx')
  const ask = chat.indexOf('const openAsk = parseOpenRequest(userText)')
  const coachCall = chat.indexOf('const result = await callGemini(userText, placeholderId)')
  check('the chat reads an open request before it asks the coach', ask > 0 && coachCall > 0 && ask < coachCall, { ask, coachCall })
  const openBranch = ask > 0 ? chat.slice(ask, ask + 1600) : ''
  check('...opens the screen, keeps the app\'s own line, and does not go on to the coach', /requestOpen\(openAsk\.target, openAsk\.kg\)/.test(openBranch) && /openedLine\(openAsk\.target, openAsk\.kg\)/.test(openBranch) && /\n\s*return\n/.test(openBranch))
  check('...and draws the open-again button under that line, at the line\'s weight', /openTargetInReply\(msg\.content\)/.test(chat) && /onClick=\{\(\) => requestOpen\(opened\.target, opened\.kg\)\}/.test(chat))
  // His live test, 16 Nov: every "Opened ..." line showed twice. The line had no id, so the history re-read added the saved copy.
  const { addServerMessages } = await import('../src/lib/chat-history-merge')
  const before = [{ id: 'u1', role: 'user' as const, content: 'hi', status: 'complete' as const, created_at: '2026-11-16T18:00:00Z' }]
  const saved = { id: 'L1', role: 'assistant' as const, content: 'Opened the plate calculator.', status: 'complete' as const, created_at: '2026-11-16T18:01:00Z' }
  const noId = addServerMessages([...before, { ...saved, id: undefined }], [before[0], saved]).filter(x => x.content === saved.content).length
  const withId = addServerMessages([...before, saved], [before[0], saved]).filter(x => x.content === saved.content).length
  check('a line on screen with no id is shown twice after a re-read (the cause), once with its saved id', noId === 2 && withId === 1, { noId, withId })
  check('...and the chat gives the line its saved row\'s id before it is shown and saved', /setMessages\(prev => \[\.\.\.prev, \{ id: lineId,/.test(openBranch) && /insert\(\{ \.\.\.\(lineId \? \{ id: lineId \} : \{\}\)/.test(openBranch))
  const mimicAt = chat.indexOf('const mimic = openTargetInReply(responseText)')
  check('a coach reply copying the app\'s line is made true: the screen opens, at the weight he named', mimicAt > 0 && /requestOpen\(mimic\.target, kg\)/.test(chat.slice(mimicAt, mimicAt + 500)) && /kgInText\(userText\)/.test(chat.slice(mimicAt, mimicAt + 500)))
  const tools = read('src/components/ToolsTab.tsx')
  check('Tools opens the plate calculator and the session history when asked', /takeOpenRequest\(\['plate', 'history'\]\)/.test(tools) && /setPlateOpen\(true\)/.test(tools.slice(tools.indexOf("takeOpenRequest(['plate'"))) && /setHistoryOpen\(true\)/.test(tools.slice(tools.indexOf("takeOpenRequest(['plate'"))))
  const app = read('src/App.tsx')
  check('App opens Profile when asked', /takeOpenRequest\(\['profile'\]\)\) \{ setProfileInfoSection\(undefined\); setProfileInfoOpen\(true\)/.test(app))

  console.log('\n5. Taking things off the shopping list by chat')
  const server = read('supabase/functions/chat-gemini/index.ts')
  check('the coach has a remove tool, and it is not the tick-off', /name: "remove_from_grocery_list"/.test(server) && /Not for something they have BOUGHT: that is check_off_grocery_item/.test(server))
  check('...handled like the other list writes (an instruction acts, anything else is offered)', /name === "remove_from_grocery_list"\) \{/.test(server))
  check('the coach is told never to give directions to a screen', /never give directions to a tab or a row/.test(server))
  const rm = chat.indexOf("if (intent.tool === 'remove_from_grocery_list')")
  const rmBranch = rm > 0 ? chat.slice(rm, rm + 2400) : ''
  check('the chat removes only a line one phrase names, and says back what it cannot tell', /matches\.length === 1\) removed\.push/.test(rmBranch) && /Which one\?/.test(rmBranch) && /deleteItemLocal\(row\)/.test(rmBranch))
  check('...and its receipt carries the removed rows for the Undo', /kind: 'grocery_item_removed'/.test(rmBranch) && /undoToken: JSON\.stringify\(removed\)/.test(rmBranch))
  const undo = chat.indexOf("receipt.kind === 'grocery_item_removed') {")
  check('Undo puts the removed rows BACK (as "before"), never deletes them again', undo > 0 && /restoreRowsLocal\(rows\)/.test(chat.slice(undo, undo + 600)) && !/restoreRowsLocal\(\[\], rows\)/.test(chat))
  const intent = read('src/lib/intent-proposal.ts')
  check('a hinted removal can be offered and confirmed', /'remove_from_grocery_list',/.test(intent) && /kind === 'remove_from_grocery_list'/.test(intent) && /row\.kind === 'remove_from_grocery_list'/.test(chat))

  console.log(`\n${ran} checks ran.`)
  if (failures > 0) { console.log(`${failures} FAILED.`); process.exit(1) }
  console.log('All open-from-chat checks passed.')
}
main().catch(e => { console.error(e); process.exit(1) })
