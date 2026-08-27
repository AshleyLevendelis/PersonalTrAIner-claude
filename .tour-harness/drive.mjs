import { createServer } from 'http'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
// Vite keeps the entry's path relative to the vite root, so the html lands in
// a nested folder rather than at dist/. Found rather than hardcoded.
const HTML = (function find(dir) {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e)
    if (statSync(f).isDirectory()) { const hit = find(f); if (hit) return hit }
    else if (e.endsWith('.html')) return f
  }
  return null
})(DIST)
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const file = p === '/' ? HTML : join(DIST, p)
  if (!existsSync(file)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium', [
  '--headless=new', '--remote-debugging-port=9333', '--no-sandbox', '--disable-gpu',
  '--window-size=390,844', 'about:blank',
], { stdio: 'ignore' })

const wait = ms => new Promise(r => setTimeout(r, ms))
let ws, targetWs
for (let i = 0; i < 60; i++) {
  try {
    const list = await fetch('http://127.0.0.1:9333/json/list').then(r => r.json())
    const page = list.find(t => t.type === 'page')
    if (page) { targetWs = page.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
if (!targetWs) { console.error('no chrome'); process.exit(1) }

ws = new WebSocket(targetWs)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0
const pending = new Map()
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
})
const send = (method, params = {}) => new Promise(res => {
  const myId = ++id
  pending.set(myId, res)
  ws.send(JSON.stringify({ id: myId, method, params }))
})
const evalJs = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
  return r.result?.result?.value
}

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

await send('Page.enable')
await send('Runtime.enable')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/#/tab/dashboard` })
await wait(1500)

const snapshot = () => evalJs(`(() => {
  const card = document.querySelector('[role="dialog"][aria-label="App tour"] .tour-fade')
  const spot = document.querySelector('[role="dialog"][aria-label="App tour"] div[style*="box-shadow"]')
  const pulse = document.querySelector('.tour-breathe')
  const pill = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Resume the tour'))
  const r = spot && spot.getBoundingClientRect()
  return {
    counter: card ? (card.querySelector('span:nth-child(2)')||{}).textContent : null,
    body: card ? [...card.querySelectorAll('p')].map(p=>p.textContent).join(' | ') : null,
    cta: card ? (([...card.querySelectorAll('button')].pop())||{}).textContent : null,
    hasCard: !!card, pulsing: !!pulse,
    spot: r ? { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } : null,
    pill: pill ? pill.textContent.trim() : null,
    stored: localStorage.getItem('fitplan_tour_v1:harness-profile'),
    hash: location.hash,
  }
})()`)

const clickCta = () => evalJs(`(() => {
  const card = document.querySelector('.tour-fade')
  const btns = [...card.querySelectorAll('button')]
  const b = btns[btns.length - 1]; b.click(); return b.textContent
})()`)
const clickTarget = key => evalJs(`(() => {
  const el = document.querySelector('[data-tour="${key}"]')
  if (!el) return 'MISSING'
  const r = el.getBoundingClientRect()
  const top = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2)
  const blocked = !(el === top || el.contains(top) || (top && top.contains(el)))
  el.click(); return blocked ? 'CLICK-BLOCKED' : 'ok'
})()`)

console.log('\n1. It starts, and stop 1 is the welcome card')
let s = await snapshot()
check('the tour is on screen', s.hasCard, s)
check('counter reads 1 of 10', s.counter === 'Coach · 1 of 10', s.counter)
check('CTA is "Show me around"', s.cta === 'Show me around', s.cta)
check("copy is the welcome line", (s.body||'').includes("plan's built and ready"), s.body)

console.log('\n2. Info stops spotlight a real element')
await clickCta(); await wait(500)
s = await snapshot()
check('stop 2 measured the hero, non-zero rect', !!s.spot && s.spot.w > 50 && s.spot.h > 50, s.spot)
check('counter advanced to 2 of 10', s.counter === 'Coach · 2 of 10', s.counter)
check('progress is persisted as it goes', s.stored === '1', s.stored)

await clickCta(); await wait(500)
s = await snapshot()
check('stop 3 moved the spotlight to the tiles', !!s.spot, s.spot)
const tilesRect = s.spot

console.log('\n3. A nav stop waits for the real tap, and blocks everything else')
await clickCta(); await wait(600)
s = await snapshot()
check('stop 4 is in its TAP phase (pulsing, no Next)', s.pulsing && !/Next|Finish/.test(s.cta||''), { pulsing: s.pulsing, cta: s.cta })
check('the hint names the tab to tap', (s.body||'').includes('Tap Nutrition'), s.body)
check('it has NOT navigated on its own', s.hash === '#/tab/dashboard', s.hash)
const blockedProbe = await evalJs(`(() => {
  const el = document.querySelector('[data-tour="tiles"]')
  const r = el.getBoundingClientRect()
  const top = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2)
  if (!top) return 'offscreen:' + Math.round(r.top)
  return (top === el || el.contains(top)) ? ('REACHABLE top=' + top.tagName + '.' + top.className) : 'blocked'
})()`)
check('a non-target element is click-blocked', blockedProbe === 'blocked', blockedProbe)
const tapRes = await clickTarget('navNutrition')
check('the real tab button is reachable through the hole', tapRes === 'ok', tapRes)
await wait(700)
s = await snapshot()
check('the tap navigated for real', s.hash === '#/tab/nutrition', s.hash)
check('...and the tour moved to its info phase', !s.pulsing && /Next/.test(s.cta||''), s.cta)
check('...spotlighting the rings', !!s.spot, s.spot)

console.log('\n4. The set stop advances only when the row actually saves')
await clickCta(); await wait(400)   // meals
await clickCta(); await wait(600)   // exercise (tap)
s = await snapshot()
check('stop 6 waits for the Exercise tap', s.pulsing && (s.body||'').includes('Tap Exercise'), s.body)
await clickTarget('navExercise'); await wait(700)
await clickCta(); await wait(800)   // -> set stop
s = await snapshot()
check('stop 7 asks the user to log a set', s.pulsing && (s.body||'').includes('Tap the ✓'), s.body)
const beforeSet = s.counter
await evalJs(`document.querySelector('[data-tour="setrow"]').click()`)
await wait(700)
s = await snapshot()
check('logging the set advanced the tour', !s.pulsing && /Next/.test(s.cta||''), { cta: s.cta, was: beforeSet })
check('...and the copy is the confirmation', (s.body||'').includes('Logged'), s.body)

console.log('\n5. Skip stores the place and offers a resume')
await evalJs(`[...document.querySelectorAll('.tour-fade button')].find(b=>b.textContent==='Skip').click()`)
await wait(500)
s = await snapshot()
check('the overlay is gone', !s.hasCard, s.hasCard)
check('a resume pill is offered', !!s.pill, s.pill)
check('the pill names the stored step', /Resume the tour · 7 of 10/.test(s.pill||''), s.pill)
check('the step is persisted', s.stored === '6', s.stored)
const reachable = await evalJs(`(() => {
  const el = document.querySelector('[data-tour="extoday"]')
  const r = el.getBoundingClientRect()
  const top = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2)
  return (top === el || el.contains(top)) ? 'reachable' : 'still blocked'
})()`)
check('the app is fully interactive again after skip', reachable === 'reachable', reachable)
await evalJs(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Resume the tour')).click()`)
await wait(600)
s = await snapshot()
check('resuming re-enters the stored stop', s.hasCard && /7 of 10/.test(s.counter||''), s.counter)

console.log('\n6. Finishing writes done and never comes back')
// Explicit rather than a heuristic loop: resume landed on the already-logged
// set stop, which correctly drops itself, so the remaining path is known —
// tools (tap), settings (next), chat (tap), Finish.
const step = async label => { s = await snapshot(); return `${label}: card=${s.hasCard} pulse=${s.pulsing} cta=${s.cta}` }
await wait(1200)                                   // the spent set stop drops itself
s = await snapshot()
check('a spent set stop drops itself on resume', s.hasCard && /9/.test(s.counter||''), s.counter)
if (s.pulsing) { await clickTarget('navTools'); await wait(800) }
s = await snapshot()
check('reached the tools stop', /Timers/.test(s.body||''), s.body)
await clickCta(); await wait(600)                  // -> settings
s = await snapshot()
check('reached the settings stop', /behind the gear/.test(s.body||''), s.body)
await clickCta(); await wait(700)                  // -> chat (tap)
s = await snapshot()
check('the final stop waits for the chat tap', s.pulsing && /chat button/.test(s.body||''), s.body)
await clickTarget('chatfab'); await wait(800)
s = await snapshot()
check('the last stop offers Finish', /Finish/.test(s.cta||''), s.cta)
check('...and has no Skip', await evalJs(`(() => { const c = document.querySelector('.tour-fade'); return !c || ![...c.querySelectorAll('button')].some(b => b.textContent === 'Skip') })()`))
check('...over no dim, handing off to the chat behind it', await evalJs(`(() => {
  const root = document.querySelector('[role="dialog"][aria-label="App tour"]')
  const full = [...root.children].find(k => { const r = k.getBoundingClientRect(); return r.width >= window.innerWidth - 1 && r.height >= window.innerHeight - 1 })
  return !full || getComputedStyle(full).backgroundColor === 'rgba(0, 0, 0, 0)'
})()`))
await clickCta(); await wait(600)
s = await snapshot()
check('the overlay is gone for good', !s.hasCard && !s.pill, { card: s.hasCard, pill: s.pill })
check('storage records done', s.stored === 'done', s.stored)
await send('Page.navigate', { url: `http://127.0.0.1:${port}/#/tab/dashboard` })
await wait(1400)
s = await snapshot()
check('a reload does not restart it', !s.hasCard && !s.pill, s)

console.log(failures === 0 ? '\nAll tour-harness checks passed.\n' : `\n${failures} FAILED\n`)
chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
