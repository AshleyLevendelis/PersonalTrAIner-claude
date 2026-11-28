// ---------------------------------------------------------------------------
// A SESSION ON A REST DAY, ASKED FOR IN THE CHAT (his report, 28 Nov 2026: "Add a weight session just for today" was
// answered "There's no session on Saturday to swap — it's a rest day"; his ruling "The app should be able to do
// whatever I ask it but give reasons or advise around it").
//
// chat.tsx, ?day=rest (today a rest day, Monday's session not done), the model's turn stubbed at the fetch boundary:
//   A. as the DEPLOYED coach sends it (the activity swap, "weight session") and as the new coach sends it
//      (propose_train_today): an OFFER naming the session, with the advice; nothing written before Apply; Apply
//      borrows the session through the rest day card's own store; Undo puts the rest day back.
//   B. a run on a rest day is not turned into weights, and is answered with what the app CAN do, not a dead end.
//   C. a day that already has a session says so.
//
// WHAT THIS DOES NOT PROVE: App.tsx's wiring, the Exercise tab redrawing (test:train-today holds its subscription),
// or what the real model calls.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
import { OPEN_OFFER_DETAILS_SCRIPT } from './driver-kit.mjs'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const page = new URL(q.url, 'http://x').searchParams.get('page') === 'chat' ? '/.tour-harness/chat.html' : '/.tour-harness/real.html'
  const f = join(DIST, p === '/' ? page : p)
  if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r)); const port = server.address().port
const PORT = 9679
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map(); const pageErrors = []
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text)
})
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
// His "One line, numbers on tap" (17 Nov 2026): this driver reads what an offer SAYS, so it opens Details as he would.
// The folded default itself is held by verify:offer-text (1e-1f).
await send('Page.addScriptToEvaluateOnNewDocument', { source: OPEN_OFFER_DETAILS_SCRIPT })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })

let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 460)}` : ''}`) }
}

const J = JSON.stringify
const pointAt = async at => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }) }
const centreOf = expr => ev(`(() => { const n = ${expr}; if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })()`)
const tapExpr = async expr => { const at = await centreOf(expr); if (!at) return false; await wait(150); const again = await centreOf(expr); await pointAt(again ?? at); await wait(500); return true }
const q = sel => `document.querySelector(${J(sel)})`
const byText = (text, tag = 'button') => `[...document.querySelectorAll(${J(tag)})].reverse().find(b => (b.textContent || '').replace(/\\s+/g, ' ').trim() === ${J(text)})`
/** (kept from the template) RE-ANCHORED 31 Oct 2026 (Exercise 2a): the two ways to add are at the foot, each one tap — "Add exercise", and
 *  "I also did…" for work off the plan. Asked for by what they do, never by their words. */
const openAddChoice = async label => tapExpr(q(/unplanned/i.test(label) ? '[data-testid="add-unplanned"]' : '[data-testid="add-exercise"]'))
const until = async (expr, ms = 8000) => { const t0 = Date.now(); let v = await ev(expr); while (!v && Date.now() - t0 < ms) { await wait(200); v = await ev(expr) } return v }
const typeText = async text => { for (const ch of String(text)) { await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }) } await wait(250) }
const texts = sel => ev(`[...document.querySelectorAll(${J(sel)})].map(n => n.innerText.replace(/\\s+/g, ' ').trim())`)

let loads = 0
const borrows = () => ev(`Object.keys(localStorage).filter(k => k.startsWith('fitplan_borrowed_day_v1:')).map(k => localStorage.getItem(k))`)
const TODAY = '2026-09-16'

await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    const u = String(url)
    if (u.includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      const out = p => new Response(JSON.stringify({ reply: '', proposal: p }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (/weight session just for today/i.test(said)) return out({ kind: 'propose_session_activity_swap', rawArgs: { activity_name: 'weight session', date: '${TODAY}' } })
      if (/lift today/i.test(said)) return out({ kind: 'propose_train_today', rawArgs: {} })
      if (/run instead/i.test(said)) return out({ kind: 'propose_session_activity_swap', rawArgs: { activity_name: 'run', date: '${TODAY}' } })
      return new Response(JSON.stringify({ reply: '' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })
const setValue = `(el, v) => { const proto = window.HTMLTextAreaElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }`
const say = async text => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${J(text)}) })()`)
  await wait(300)
  return ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
}
const loadChat = async (extra = '&day=rest') => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?page=chat${extra}&n=${++loads}` })
  const up = await until(`!!document.querySelector('textarea')`, 15000)
  await ev(`Object.keys(localStorage).filter(k => k.startsWith('fitplan_borrowed_day_v1:')).forEach(k => localStorage.removeItem(k))`)
  return up
}
const offer = () => ev(`(() => { const c = [...document.querySelectorAll('[data-testid="proposal-card"]')].pop(); if (!c) return null;
  return { status: c.getAttribute('data-card-status'), text: c.innerText.replace(/\\s+/g, ' '), btns: [...c.querySelectorAll('button:not([data-listen]):not([data-report-reply]):not([data-testid="offer-details-toggle"])')].map(b => (b.textContent || '').trim()) } })()`)
const pendingOffer = () => until(`(() => { const c = [...document.querySelectorAll('[data-testid="proposal-card"]')].pop(); return !!c && c.getAttribute('data-card-status') === 'pending' })()`, 15000)

console.log('\nA SESSION ON A REST DAY, FROM THE CHAT\n')
console.log('  A. ASKED FOR')
for (const [tag, said] of [['deployed coach (the swap)', 'Add a weight session just for today'], ['new coach (its own tool)', 'Can I lift today?']]) {
  console.log(`    ${tag}`)
  check(`A0. the chat is up on a rest day (${tag})`, !!(await loadChat()))
  check('A1. he asks', await say(said))
  check('A2. AN OFFER comes, not a dead end', !!(await pendingOffer()))
  const o = await offer()
  const t = o?.text ?? ''
  check('A3. it names the session it brings onto today: Monday\'s, the one missed this week', /do Monday's \*?\*?[^*]+\*?\*? today/i.test(t), t)
  check('A4. ...never "no session to swap"', !/no session (on that day )?to swap/i.test(await ev('document.body.innerText')))
  check('A5. the advice: a planned rest day, and what it costs before tomorrow\'s session', /planned rest day[\s\S]*less recovery before tomorrow's/i.test(t), t)
  check('A6. ...why this one: it makes up Monday\'s missed session', /makes up Monday's session, which you missed/i.test(t), t)
  check('A7. ...the lighter choice, and that the plan does not change', /20 to 30 minute walk/.test(t) && /Just today: your plan doesn't change/.test(t), t)
  check('A8. NOTHING IS WRITTEN BEFORE A TAP', (await borrows()).length === 0, await borrows())
  await shoot(`train-today-offer-${tag.startsWith('dep') ? 'old' : 'new'}`)
  const apply = (o?.btns ?? []).find(b => b !== 'Not now' && !/^Keep/.test(b))
  check('A9. Apply taps', !!apply && await tapExpr(byText(apply)), o?.btns)
  await until(`/On for today/.test(document.body.innerText)`, 8000)
  await wait(600)
  check('A10. today borrows Monday\'s session, in the rest day card\'s own store', J(await borrows()) === J(['Monday']), await borrows())
  const rc = await ev(`(() => { const n = [...document.querySelectorAll('[data-receipt-line]')].pop(); return n ? n.innerText.replace(/\\s+/g, ' ').trim() : null })()`)
  check('A11. the receipt says "On for today" and the session, once', /^On for today · Monday's [^·]+? (View )?Undo$/.test(rc ?? ''), rc)
  await shoot(`train-today-done-${tag.startsWith('dep') ? 'old' : 'new'}`)
  check('A12. Undo taps', await tapExpr(byText('Undo')))
  await wait(1200)
  check('A13. ...and today is a rest day again', (await borrows()).length === 0, await borrows())
}

console.log('\n  B. A RUN ON A REST DAY')
check('B0. a fresh chat on a rest day', !!(await loadChat()))
check('B1. "a run instead"', await say("I'll do a run instead today"))
await until(`/already a rest day/i.test(document.body.innerText)`, 10000)
const body = await ev('document.body.innerText')
check('B2. not turned into weights: no card', (await ev(`document.querySelectorAll('[data-testid="proposal-card"]').length`)) === 0)
check('B3. answered with what the app CAN do', /already a rest day on your plan, so there's no session to swap\. I can bring one of this week's sessions onto it, or put some cardio on it instead\./.test(body), body.slice(-400))
check('B4. nothing borrowed', (await borrows()).length === 0)

console.log('\n  C. A DAY THAT ALREADY HAS A SESSION')
check('C0. a fresh chat on a training day', !!(await loadChat('')))
check('C1. he asks to lift today', await say('Can I lift today?'))
await until(`/already has/i.test(document.body.innerText)`, 10000)
const c = await ev('document.body.innerText')
check('C2. the app says today already has its session, and names it', /Today already has [^.]+ on it, so that's your session for today\./.test(c), c.slice(-300))
check('C3. no card, nothing borrowed', (await ev(`document.querySelectorAll('[data-testid="proposal-card"]').length`)) === 0 && (await borrows()).length === 0)

check('no uncaught error on any page', pageErrors.length === 0, pageErrors)
console.log(`\n${ran} checks ran. ${failures === 0 ? 'A rest day takes a session when he asks, with the reasons on the card, and Undo puts the rest back.' : `${failures} check(s) FAILED.`}\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
