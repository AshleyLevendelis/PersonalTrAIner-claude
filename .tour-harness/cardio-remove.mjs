// ---------------------------------------------------------------------------
// A WALK LOGGED BY MISTAKE, TAKEN OFF (his report, 27 Nov 2026: "I accidentally added a walk today. Remove it", and the
// coach answered "I couldn't match Walk to anything on Thursday" while Exercise showed "✓ Walk · 5 min · Easy" with no
// way to take it off once its Undo had gone).
//
// A. THE EXERCISE TAB (real.tsx, ?oldwalk=1: a walk logged hours ago, read back from the server): the row under
//    Additional work offers Remove; Remove takes the row off the store and leaves "Walk · 5 min · Easy removed" with
//    Undo; Undo puts it back as it was.
// B. THE COACH (chat.tsx, ?oldwalk=1), the model's turn stubbed at the fetch boundary: (1) as the DEPLOYED coach sent
//    it, propose_exercise_remove "Walk" — the app finds the logged walk and offers to take it off; (2) as the new coach
//    sends it, propose_cardio_remove. Nothing is written before Apply; Apply removes the row; Undo puts it back.
//
// WHAT THIS DOES NOT PROVE: App.tsx's wiring (no harness page boots it), or what the real model calls.
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
const PORT = 9647
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
/** RE-ANCHORED 31 Oct 2026 (Exercise 2a): the two ways to add are at the foot, each one tap — "Add exercise", and
 *  "I also did…" for work off the plan. Asked for by what they do, never by their words. */
const openAddChoice = async label => tapExpr(q(/unplanned/i.test(label) ? '[data-testid="add-unplanned"]' : '[data-testid="add-exercise"]'))
const until = async (expr, ms = 8000) => { const t0 = Date.now(); let v = await ev(expr); while (!v && Date.now() - t0 < ms) { await wait(200); v = await ev(expr) } return v }
const typeText = async text => { for (const ch of String(text)) { await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }) } await wait(250) }
const texts = sel => ev(`[...document.querySelectorAll(${J(sel)})].map(n => n.innerText.replace(/\\s+/g, ' ').trim())`)

let loads = 0
const db = expr => ev(`(() => { const d = window.__fakeDb; return ${expr} })()`)
const walks = () => db(`(d.cardio_logs ?? []).filter(r => r.activity_name === 'Walk').map(r => ({ m: r.duration_minutes, rpe: r.intensity_rpe }))`)
const LINE = 'Walk · 5 min · Easy'

console.log('\nA WALK LOGGED BY MISTAKE\n')
console.log('  A. THE EXERCISE TAB')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&n=${++loads}&oldwalk=1#/tab/exercise` })
check('A0. the Exercise tab is up', !!(await until(`document.querySelectorAll('[data-exercise-name]').length > 0`, 15000)))
const rb = await until(`(() => { const n = document.querySelector('[data-testid="additional-cardio"] [data-testid="cardio-readback"]'); return n ? n.innerText.replace(/\\s+/g, ' ').trim() : null })()`, 8000)
check('A1. the walk reads back under Additional work', typeof rb === 'string' && rb.startsWith(LINE), rb)
check('A2. with no Undo (logged hours ago)', (await ev(`!document.querySelector('[data-testid="additional-cardio"] [data-testid="cardio-readback"] button[aria-label^="Undo"]')`)) === true)
const rmBtn = q('[data-testid="additional-cardio"] [data-testid="cardio-remove"]')
const label = await ev(`${rmBtn}?.getAttribute('aria-label') ?? null`)
check('A3. but a Remove, named for the walk', label === `Remove ${LINE}`, label)
check('A3b. ...a full-size tap', (await ev(`(() => { const r = ${rmBtn}?.getBoundingClientRect(); return !!r && r.height >= 44 && r.width >= 44 })()`)) === true)
await shoot('cardio-remove-row')
check('A4. Remove taps', await tapExpr(rmBtn))
await until(`!!document.querySelector('[data-testid="cardio-removed"]')`, 6000)
check('A5. the walk is gone from the store', (await walks()).length === 0, await walks())
const gone = await ev(`(() => { const n = document.querySelector('[data-testid="cardio-removed"]'); return n ? n.innerText.replace(/\\s+/g, ' ').trim() : null })()`)
check('A6. one line says so, with an Undo', gone === `${LINE} removed Undo`, gone)
check('A7. the row is no longer read back', (await ev(`document.querySelectorAll('[data-testid="additional-cardio"] [data-testid="cardio-readback"]').length`)) === 0)
check('A7b. the line is in sight', (await ev(`(() => { const r = document.querySelector('[data-testid="cardio-removed"]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })()`)) === true)
await shoot('cardio-remove-removed')
check('A8. Undo taps', await tapExpr(q('[data-testid="cardio-removed-undo"]')))
await until(`!document.querySelector('[data-testid="cardio-removed"]')`, 6000)
await wait(1200)
const back = await walks()
check('A9. Undo puts the walk back once, as it was', back.length === 1 && back[0].m === 5 && back[0].rpe === 3, back)
check('A10. and it reads back again', (await until(`[...document.querySelectorAll('[data-testid="additional-cardio"] [data-testid="cardio-readback"]')].some(n => n.innerText.includes(${J(LINE)}))`, 6000)) === true)

console.log('\n  B. THE COACH')
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    const u = String(url)
    if (u.includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      const out = p => new Response(JSON.stringify({ reply: '', proposal: p }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (/accidentally/i.test(said)) return out({ kind: 'propose_exercise_remove', rawArgs: { item: 'Walk', day: 'today' } })
      if (/take the walk off/i.test(said)) return out({ kind: 'propose_cardio_remove', rawArgs: { activity: 'walk' } })
      if (/take the swim off/i.test(said)) return out({ kind: 'propose_cardio_remove', rawArgs: { activity: 'swim' } })
      return new Response(JSON.stringify({ reply: 'Got it.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
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
const loadChat = async () => {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?page=chat&oldwalk=1&n=${++loads}` })
  return until(`!!document.querySelector('textarea')`, 15000)
}
const offer = () => ev(`(() => { const c = [...document.querySelectorAll('[data-testid="proposal-card"]')].pop(); if (!c) return null;
  return { status: c.getAttribute('data-card-status'), text: c.innerText.replace(/\\s+/g, ' '), btns: [...c.querySelectorAll('button:not([data-listen]):not([data-report-reply]):not([data-testid="offer-details-toggle"])')].map(b => (b.textContent || '').trim()) } })()`)
const pendingOffer = () => until(`(() => { const c = [...document.querySelectorAll('[data-testid="proposal-card"]')].pop(); return !!c && c.getAttribute('data-card-status') === 'pending' && /\\?/.test(c.innerText) })()`, 15000)

for (const [tag, said] of [['deployed coach (exercise tool)', 'I accidentally added a walk today. Remove it'], ['new coach (its own tool)', 'Can you take the walk off today?']]) {
  console.log(`    ${tag}`)
  check(`B0. the chat is up (${tag})`, !!(await loadChat()))
  check('B1. he asks', await say(said))
  await pendingOffer()
  const o = await offer()
  check('B2. AN OFFER, NOT "couldn\'t match": it names the walk', /take \*?\*?Walk · 5 min · Easy\*?\*? off today's log/i.test(o?.text ?? '') && !/couldn't match/i.test(o?.text ?? ''), o?.text)
  check('B3. ...and says the plan is untouched', /your plan and your sessions stay as they are/i.test(o?.text ?? ''), o?.text)
  check('B4. NOTHING IS WRITTEN BEFORE A TAP', (await walks()).length === 1)
  await shoot(`cardio-remove-chat-offer-${tag.startsWith('dep') ? 'old' : 'new'}`)
  const apply = (o?.btns ?? []).find(b => b !== 'Not now' && !/^Keep/.test(b))
  check('B5. Apply taps', !!apply && await tapExpr(byText(apply)), o?.btns)
  await until(`/Taken off/.test(document.body.innerText)`, 8000)
  await wait(800)
  check('B6. the walk is gone', (await walks()).length === 0, await walks())
  check('B7. the receipt says "Taken off" with the walk', /Taken off[\s\S]{0,200}Walk · 5 min · Easy/.test(await ev('document.body.innerText')))
  await shoot(`cardio-remove-chat-done-${tag.startsWith('dep') ? 'old' : 'new'}`)
  check('B8. Undo taps', await tapExpr(byText('Undo')))
  await wait(1500)
  const b2 = await walks()
  check('B9. ...and puts the walk back as it was', b2.length === 1 && b2[0].m === 5 && b2[0].rpe === 3, b2)
}
console.log('    nothing of that name logged')
check('B10. a fresh chat', !!(await loadChat()))
check('B11. "take the swim off"', await say('Please take the swim off'))
await until(`/couldn't find/i.test(document.body.innerText)`, 10000)
const body = await ev('document.body.innerText')
check('B12. the app says what the day holds, never guesses', /couldn't find "swim" logged today\. It has: Walk · 5 min · Easy\./i.test(body), body.slice(-400))
check('B13. and the walk is untouched', (await walks()).length === 1)

check('no uncaught error on any page', pageErrors.length === 0, pageErrors)
console.log(`\n${ran} checks ran. ${failures === 0 ? 'A walk logged by mistake comes off, by the row or the coach, and Undo puts it back.' : `${failures} check(s) FAILED.`}\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
