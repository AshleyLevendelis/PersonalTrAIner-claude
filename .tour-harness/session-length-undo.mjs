// ---------------------------------------------------------------------------
// A SESSION-LENGTH CHANGE MADE IN THE CHAT CAN BE UNDONE (19 Nov 2026).
//
// A tester, 18 Nov: "from now on I only have 30 to 45 minutes" -> the offer -> Apply -> Undo -> "Couldn't undo — This
// one can't be undone from here". The card handed back an Undo and the undo list had no branch for it.
// test:pending-actions now derives that every kind handing back an Undo has one; this is what he sees and what the
// database holds, before, after Apply, and after Undo. The model is stubbed at the fetch boundary with the offer it
// makes; everything after it is the app's own code.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9967, page: 'chat.html', name: 'session-length-undo' })
const { send, ev, shoot, check, wait, go, finish, until } = d

await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      const body = JSON.parse(init && init.body ? init.body : '{}')
      const said = String(body.message || '')
      const proposal = /30 to 45 minutes/.test(said) ? { kind: 'propose_session_length', rawArgs: { minutes: '30-45', origin_verbatim_quote: said } } : undefined
      return new Response(JSON.stringify({ reply: proposal ? '' : 'Sure.', proposal }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })
const setValue = `(el, v) => { Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }`
const say = async text => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(text)}) })()`)
  await wait(400)
  return ev(`(() => { const b = [...document.querySelectorAll('button')].find(b => /send/i.test(b.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
}
const LENGTH = `(window.__fakeDb.fitness_profiles[0] || {}).session_duration_preference`
const tap = label => ev(`(() => { const b = [...document.querySelectorAll('button')].filter(b => (b.textContent || '').trim() === ${JSON.stringify(label)}).pop(); if (!b) return false; b.click(); return true })()`)
const text = () => ev('document.body.innerText')

await go('')
await wait(3500)
const before = await ev(LENGTH)
check('1a. the setting starts at 45-60 minutes', before === '45-60', before)
check('1b. the chat sent', await say('from now on I only have 30 to 45 minutes'))
const offered = await until(text, t => /Apply/.test(t) && /Session length|30.45/.test(t))
check('1c. the app offers the change, with nothing saved yet', /Apply/.test(offered) && (await ev(LENGTH)) === '45-60', offered.slice(-300))
check('1d. Apply was tapped', await tap('Apply'))
const applied = await until(text, t => /\bUndo\b/.test(t) && !/Apply/.test(t.slice(-400)), 80)
await wait(600)
await shoot('session-length-undo-1-applied')
check('2a. the change landed: the setting is 30-45', (await ev(LENGTH)) === '30-45', await ev(LENGTH))
check('2b. the card offers Undo', /\bUndo\b/.test(applied), applied.slice(-300))
check('2c. Undo was tapped', await tap('Undo'))
const undone = await until(text, t => /Put back|Couldn't undo/.test(t), 80)
await wait(600)
await shoot('session-length-undo-2-undone')
check('3a. the Undo WORKED: the card says it was put back', /Put back/.test(undone), undone.slice(-300))
check('3b. ...and never "Couldn\\u2019t undo" or "can\\u2019t be undone"', !/Couldn't undo|can't be undone/.test(undone), undone.slice(-300))
check('3c. the setting is back to 45-60 in the database', (await ev(LENGTH)) === '45-60', await ev(LENGTH))
check('3d. the Undo button is gone once used', !(await ev(`[...document.querySelectorAll('button')].some(b => (b.textContent || '').trim() === 'Undo')`)))

await finish()
