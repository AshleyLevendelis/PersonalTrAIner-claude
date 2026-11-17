import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/chat.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9611', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9611/json/list').then(r => r.json())
    const g = l.find(x => x.type === 'page')
    if (g) { target = g.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
const ws = new WebSocket(target); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64'))
}
let failures = 0
let ran = 0
const check = (name, ok, detail) => {
  ran++
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

// A ONE-OFF IS NEVER A STANDING CLASS (his report 17 Nov 2026): "Im doing myay thai this evening" got an offer to
// rebuild sixteen weeks around "Muay Thai · Tuesday evenings". The model is stubbed to reach for that offer on BOTH
// messages (what the deployed coach did); the app decides from his words which one may become a card.
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  const realFetch = window.fetch
  window.fetch = async (url, init) => {
    const u = String(url)
    if (u.includes('chat-gemini')) {
      const said = String(JSON.parse((init && init.body) || '{}').message || '')
      if (!/muay thai|myay thai/i.test(said)) return new Response(JSON.stringify({ reply: 'Sure.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ reply: '', proposal: { kind: 'propose_concurrent_activity',
        rawArgs: { name: 'Muay Thai', days: ['Tuesday'], time_of_day: 'evening', intensity: 0.8, movement_demands: [] } } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return realFetch(url, init)
  }
` })
await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
await wait(4000)
let ready = await ev(`!!document.querySelector('textarea')`)
for (let i = 0; i < 20 && !ready; i++) { await wait(500); ready = await ev(`!!document.querySelector('textarea')`) }
check('0. the chat is up', ready === true)

const setValue = `(el, v) => { Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }`
const say = async text => {
  await ev(`(() => { const t = document.querySelector('textarea'); if (t) (${setValue})(t, ${JSON.stringify(text)}) })()`)
  await wait(400)
  const sent = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /send/i.test(x.getAttribute('aria-label') || '')); if (!b || b.disabled) return false; b.click(); return true })()`)
  await wait(3500)
  return sent
}
const cards = () => ev(`document.querySelectorAll('[data-testid="proposal-card"]').length`)
const applies = () => ev(`[...document.querySelectorAll('button')].filter(b => /^Apply/.test((b.textContent || '').trim())).length`)

check('1a. his message goes', await say('Im doing myay thai this evening'))
const text1 = await ev('document.body.innerText')
check('1b. NO rebuild offer: no card, no Apply', (await cards()) === 0 && (await applies()) === 0, { cards: await cards(), applies: await applies() })
check('1c. the app says the plan is left as it is and asks about every week', /Enjoy Muay Thai\. I've left your plan as it is\. If it's every week/.test(text1), text1.slice(-400))
check('1d. ...and never "Tuesday evenings" as a standing class', !/Tuesday evenings/.test(text1))
await shoot('chat-one-off-sport')

check('2a. a weekly class goes (said with tonight in it, so the regular words decide)', await say("I'm doing Muay Thai tonight, I go every Tuesday evening"))
check('2b. the weekly class still gets the offer, with Apply', (await cards()) === 1 && (await applies()) === 1, { cards: await cards(), applies: await applies() })
await shoot('chat-one-off-sport-weekly')

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed.`); process.exit(1) }
console.log('A one-off class is never rebuilt around; a weekly one still is.\n')
