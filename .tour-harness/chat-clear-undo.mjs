// UNDO AFTER CLEARING THE CHAT, AND STARTERS ON AN EMPTY ONE (17 Nov 2026, the chat review, his "Build it all"), on a
// real screen at phone size: a seeded conversation is cleared, the old messages leave the screen and an Undo line
// appears; Undo brings every one of them back. A cleared chat offers taps (its opener's chips, else the starters).
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9873, page: 'chat.html', name: 'chat-clear-undo' })
const { send, ev, check, until, wait, go, shoot, finish } = d
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      let body = {}; try { body = JSON.parse(init && init.body || '{}') } catch {}
      if (body.mode === 'opener') return new Response(JSON.stringify({ opener: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ reply: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })
const text = () => ev(`document.body.innerText`)
const count = () => ev(`document.querySelectorAll('[data-testid="chat-group"]').length`)

await go('&seed=opener&rows=4&om=coach')
await until(count, n => n >= 3, 60)
const before = await count()
const beforeText = await text()
check('0. the fixture binds: a seeded conversation of several groups', before >= 3, before)

await until(() => ev(`!!document.querySelector('button[aria-label="Clear chat"]')`), v => v === true, 40)
await ev(`document.querySelector('button[aria-label="Clear chat"]').click()`)
await wait(250)
await ev(`document.querySelector('button[aria-label="Tap again to clear this conversation"]')?.click()`)
await wait(500)
const cleared = await count()
check('1a. clearing takes the conversation off the screen', cleared < before, { before, cleared })
check('1b. ...and says so, with an Undo', await ev(`(() => { const el = document.querySelector('[data-testid="chat-cleared-undo"]'); return !!el && /Chat cleared/.test(el.innerText) && /Undo/.test(el.innerText) })()`))
// The opener here brings its own two chips, and those win (chatStarters); the four starters are for an opener with none,
// held by test:chat-extras. Either way an emptied chat offers something to tap.
const taps = await ev(`[...document.querySelectorAll('[data-testid="chat-group"] button')].map(b => b.innerText.trim()).filter(t => t.length > 6)`)
check('2. the cleared chat offers something to tap (the opener\'s own chips, or the starters)', taps.length >= 2, taps)
await shoot('chat-clear-undo-cleared')

await ev(`[...document.querySelectorAll('[data-testid="chat-cleared-undo"] button')].find(b => /Undo/.test(b.innerText))?.click()`)
await wait(600)
const after = await count()
const afterText = await text()
check('3a. Undo brings the whole conversation back', after === before, { before, after })
const sample = beforeText.split('\n').map(s => s.trim()).filter(s => s.length > 25).slice(0, 3)
check('3b. ...the same messages, word for word', sample.length > 0 && sample.every(s => afterText.includes(s)), sample)
check('3c. ...and the Undo line goes', !(await ev(`!!document.querySelector('[data-testid="chat-cleared-undo"]')`)))
check('3d. no starters once his conversation is back', !(await ev(`[...document.querySelectorAll('button')].some(b => b.innerText.trim() === "What's my session today?")`)))
await shoot('chat-clear-undo-undone')

await finish('Clearing the chat can be undone, and an empty chat offers starters.')
