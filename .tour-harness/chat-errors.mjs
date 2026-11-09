// ---------------------------------------------------------------------------
// WHEN THE COACH FAILS, ON THE REAL CHAT AT 390px (1 Nov 2026, whole-app test #16 and #31).
// A crash in the coach's function put its own error text in her chat ("Cannot read properties of undefined"),
// and every failure drew TWO identical "tap to retry" controls while the sentence told her to tap "Retry", which
// nothing is called. Three failures are played: a server error carrying developer text, a network failure, and a
// retry that then works. Every check runs every time with a null-safe subject. PORT 9531.
// ---------------------------------------------------------------------------
import { startDriver } from './driver-kit.mjs'

const d = await startDriver({ port: 9531, page: 'chat.html', name: 'chat-errors' })
const { send, ev, check, until, wait, go, shoot, finish } = d

await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__mode = 'crash'
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    if (String(url).includes('chat-gemini')) {
      if (window.__mode === 'crash') return new Response(JSON.stringify({ error: "Cannot read properties of undefined (reading 'map')" }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      if (window.__mode === 'offline') throw new TypeError('Failed to fetch')
      return new Response(JSON.stringify({ reply: 'Back again. What did you want to know?' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
  window.__err = null; addEventListener('error', e => { window.__err = String(e.message) })
` })

const setText = text => ev(`(() => { const t = document.querySelector('[data-testid="chat-composer"] textarea'); if (!t) return false; const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(t, ${JSON.stringify(text)}); t.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
const sendIt = () => ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
const page = () => ev(`document.querySelector('main, #root')?.innerText || document.body.innerText`)
const retries = () => ev(`[...document.querySelectorAll('button')].filter(b => /tap to retry/i.test(b.textContent || '')).length`)
const say = async (text) => { await setText(text); await wait(150); const ok = await sendIt(); await wait(1800); return ok }

await go('')
check('1. the chat is up', (await until(() => ev(`!!document.querySelector('[data-testid="chat-composer"] textarea')`), v => v === true, 60)) === true)
await wait(800)

console.log('\n2. The coach crashes, with developer text in its error')
check('2a. she sends a message', await say('How heavy should I squat today?'))
const crashed = await page()
check('2b. the developer text never reaches the chat', !/Cannot read properties|reading 'map'|undefined/.test(crashed || ''), (crashed || '').slice(-300))
check('2c. she reads a plain sentence instead', /Something went wrong on my side\./.test(crashed || ''), (crashed || '').slice(-300))
check('2d. ...which never tells her to tap a button called "Retry"', !/tap "Retry"|tap Retry/i.test(crashed || ''), (crashed || '').slice(-300))
const r1 = await retries()
check('2e. exactly ONE "tap to retry" control', r1 === 1, r1)
// A thumb reaches it (QA round 3, 8 Nov 2026): a 16px line of text with no tap area round it. A point 21px above,
// below, left and right of its centre must land on it (or off the screen), so a hit-slop counts and a box alone does not.
const retryReach = await ev(`(() => { const el = [...document.querySelectorAll('button')].find(b => /tap to retry/i.test(b.textContent || '')); if (!el) return null
  el.scrollIntoView({ block: 'center', behavior: 'instant' }); const b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2
  return [[0, -21], [0, 21], [-21, 0], [21, 0]].every(([dx, dy]) => { const x = cx + dx, y = cy + dy; if (x < 0 || x > innerWidth || y < 0 || y > innerHeight) return true; const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)) }) })()`)
check('2f. ...and a thumb reaches it', retryReach === true, retryReach)
await shoot('chat-errors-crash')

console.log('\n3. Retrying, now that it works')
await ev(`window.__mode = 'ok'`)
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /tap to retry/i.test(x.textContent || '')); b && b.click() })()`)
const back = await until(page, t => /Back again/.test(t || ''), 30)
check('3a. the retry gets the answer', /Back again/.test(back || ''), (back || '').slice(-200))
const r2 = await retries()
check('3b. ...and no retry control is left behind', r2 === 0, r2)

console.log('\n4. No signal')
await ev(`window.__mode = 'offline'`)
check('4a. she sends another', await say('And tomorrow?'))
const off = await page()
check('4b. she is told it did not reach the coach, in plain words', /Couldn.t reach your Personal TrAIner\. Check your connection\./.test(off || ''), (off || '').slice(-300))
check('4c. ...never "Failed to fetch"', !/Failed to fetch/.test(off || ''), (off || '').slice(-300))
const r3 = await retries()
check('4d. ...and exactly ONE way to try again', r3 === 1, r3)
await shoot('chat-errors-offline')
check('5. no uncaught error on the page', (await ev('window.__err')) === null, await ev('window.__err'))

await finish('verify:chat-errors PASSED')
