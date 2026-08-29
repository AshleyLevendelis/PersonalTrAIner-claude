// Reads the composer placeholder off the REAL onboarding screen, in Chromium.
// Ashley reported it describing a different question than the one on screen;
// this is what turns "it says the wrong thing" into a before/after.
import { createServer } from 'http'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.onb-harness/composer.html' : p)
  if (!existsSync(f) || statSync(f).isDirectory()) { r.writeHead(404); r.end(); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9341', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 60; i++) { try { const l = await fetch('http://127.0.0.1:9341/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = x => send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }).then(r => r.result?.result?.value)
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const CASES = [
  ['fresh',    'the opener, which asks for a name',        'Your name…'],
  ['card',     'a live chip card for training style',      'How do you like to train?'],
  ['resolved', 'card answered, nothing else on screen',    'Which days?'],
  // The coach asked freehand — no card, no asksSlot. A guess here contradicts
  // a question the user can read directly above the box, so the only honest
  // placeholder is the neutral one. Reported live as "Which days?" under a
  // question about squat, bench and deadlift.
  ['freehand', 'a question the app cannot map to a slot',  'Say anything…'],
  // ...and when that same question DOES carry its card, the composer names it.
  // All three lift slots shipped with no inputHint at all, so even a correctly
  // identified slot fell through to the neutral text.
  ['liftcard', 'the squat question, with its card',        'Your squat, in kg…'],
]
let bad = 0
for (const [state, what, expected] of CASES) {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?state=${state}` }); await wait(1600)
  const got = await ev(`(() => {
    // THE COMPOSER SPECIFICALLY, not "the first input with a placeholder".
    // A numeric slot card renders its own field ABOVE the composer, so the
    // loose selector read the card's placeholder ("1-500") and called it the
    // composer's — a harness reporting confidently on the wrong element.
    const composer = document.querySelector('.ob-composer-fade')
    const i = composer && composer.querySelector('input[placeholder], textarea[placeholder]')
    return JSON.stringify({ ph: i?.placeholder ?? '(no composer found)',
      body: document.body.innerText.slice(0, 300), err: window.__err ?? null,
      composerFound: !!composer })
  })()`)
  const parsed = JSON.parse(got); const ph = parsed.ph
  if (process.env.DEBUG) console.log('      BODY:', JSON.stringify(parsed.body), '\n      ERR:', parsed.err)
  const ok = ph === expected
  if (!ok) bad++
  console.log(`  ${ok ? '✓' : '✗'} ${what}\n      on screen: ${expected}\n      composer:  ${ph}`)
}
console.log(bad === 0 ? '\n  composer matches the question on screen in all cases.\n' : `\n  ${bad} MISMATCHED\n`)
chrome.kill(); server.close()
process.exit(bad === 0 ? 0 : 1)
