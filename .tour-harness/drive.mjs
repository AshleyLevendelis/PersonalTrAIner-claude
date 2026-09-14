import { createServer } from 'http'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
// Vite keeps the entry's path relative to the vite root, so the html lands in
// a nested folder rather than at dist/ — hence the walk rather than a fixed
// path. WHICH page, though, is named.
//
// THIS USED TO TAKE THE FIRST .html IT FOUND, which was right while the harness
// built one page and quietly wrong from the day it built four: the walk
// returned chat.html, so verify:tour drove the coach screen and reported that
// the tour was not on it. All four of its checks are downstream of the first,
// so one wrong page read as four defects (found 14 Sep 2026).
const PAGE = 'tour-harness.html'
const HTML = (function find(dir) {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e)
    if (statSync(f).isDirectory()) { const hit = find(f); if (hit) return hit }
    else if (e === PAGE) return f
  }
  return null
})(DIST)
if (!HTML) { console.error(`\n${PAGE} is not in the harness build — nothing to drive.\n`); process.exit(1) }
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

console.log('\n5. Skip means gone, and the way back is the Replay row')
// ASHLEY'S RULING, and this section was written before it. Skip used to store
// the step and show a "Resume the tour" pill — and because the only route to
// 'done' was finishing all ten stops, the pill could not be dismissed at all:
// "the skip tour doesn't actually skip it. the tour is still at the bottom of
// the app and won't go away until you fully complete it." It also sat over the
// weigh-in row, hiding the number.
//
// So Skip now does exactly what Finish does, paired with a Replay row in the
// settings menu so an accidental tap is recoverable. The checks below were
// still asserting the behaviour she had ruled out, which is why they were red:
// the app was right and the check was three days stale (found 14 Sep 2026).
await evalJs(`[...document.querySelectorAll('.tour-fade button')].find(b=>b.textContent==='Skip').click()`)
await wait(500)
s = await snapshot()
check('the overlay is gone', !s.hasCard, s.hasCard)
check('...and stays gone — no resume pill left sitting over the app', !s.pill, s.pill)
check('...recorded as done, not as a place to come back to', s.stored === 'done', s.stored)
const reachable = await evalJs(`(() => {
  const el = document.querySelector('[data-tour="extoday"]')
  const r = el.getBoundingClientRect()
  const top = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2)
  return (top === el || el.contains(top)) ? 'reachable' : 'still blocked'
})()`)
check('the app is fully interactive again after skip', reachable === 'reachable', reachable)
// THE WAY BACK. Without this, skip is destructive and her ruling does not hold.
await evalJs(`window.dispatchEvent(new CustomEvent('fitplan:replay-tour'))`)
await wait(700)
s = await snapshot()
check('the Replay row brings it back, from the beginning', s.hasCard && /1 of 10/.test(s.counter||''), s.counter)

console.log('\n6. Finishing writes done and never comes back')
// A replay re-arms from stop 1 with the set-stop exemption cleared, so from
// here the whole tour runs again. WALK IT GENERICALLY rather than listing the
// remaining taps: when a stop waits for a tap the tour pulses its target, and
// the pulsing element IS the target (.tour-breathe), so "tap whatever is
// pulsing, otherwise press the CTA" reaches the end without this driver
// knowing the running order. The old hand-listed path was written for a resume
// that landed mid-tour and no longer describes anything.
const seen = []
const tabsSeen = new Set()
for (let i = 0; i < 30; i++) {
  s = await snapshot()
  if (!s.hasCard) break
  const tab = /#\/tab\/(\w+)/.exec(s.hash || '')?.[1]
  if (tab) tabsSeen.add(tab)
  if (s.body) seen.push(s.body)
  if (/Finish/.test(s.cta || '')) break
  if (s.pulsing) {
    // THE TARGET IS THE ELEMENT UNDER THE SPOTLIGHT, not the pulse ring: the
    // ring is a decoration inside the overlay with pointer-events none, so
    // clicking it does nothing and reads as CLICK-BLOCKED forever.
    const tapped = await evalJs(`(() => {
      const ring = document.querySelector('.tour-breathe')
      if (!ring) return 'MISSING'
      const r = ring.getBoundingClientRect()
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2
      const el = [...document.querySelectorAll('[data-tour]')].find(n => {
        const b = n.getBoundingClientRect()
        return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom
      })
      if (!el) return 'NO-TARGET-UNDER-SPOTLIGHT'
      const top = document.elementFromPoint(cx, cy)
      const blocked = !(el === top || el.contains(top) || (top && top.contains(el)))
      el.click(); return blocked ? 'CLICK-BLOCKED' : 'ok'
    })()`)
    check(`a waiting stop's target is tappable, not covered by the overlay (${(s.counter || '').replace('Coach \u00b7 ', '')})`, tapped === 'ok', tapped)
  } else if (/^(Next|Show me around|Finish)/.test((s.cta || '').trim())) {
    await clickCta()
  } else {
    // THE CTA AT A WAITING STOP IS "Skip", and pressing it ends the tour.
    // The pulse can read false for a frame while a stop is settling, and the
    // first version of this loop then pressed Skip and reported that the tour
    // had no Finish — a driver killing the thing it was inspecting.
    await wait(600)
    continue
  }
  await wait(800)
}
const everySeen = seen.join(' || ')
// STRUCTURAL FIRST: the tour visits every tab. This cannot rot when copy is
// reworded, which the copy checks below can and did — "the walk passed the
// tools stop" matched /Timers/ and the Tools stop now says "All three timers
// live behind here", lowercase, since the 13 Sep rewrite.
check('the walk visited every tab', ['dashboard', 'nutrition', 'exercise', 'tools'].every(t => tabsSeen.has(t)), [...tabsSeen])
check('the walk passed the tools stop', /timers/i.test(everySeen), seen.slice(-3))
check('the walk passed the settings stop', /behind the gear/i.test(everySeen), seen.slice(-3))
s = await snapshot()
check('the last stop offers Finish', /Finish/.test(s.cta||''), s.cta)
check('...and has no Skip', await evalJs(`(() => { const c = document.querySelector('.tour-fade'); return !c || ![...c.querySelectorAll('button')].some(b => b.textContent === 'Skip') })()`))
check('...over no dim, handing off to the chat behind it', await evalJs(`(() => {
  const root = document.querySelector('[role="dialog"][aria-label="App tour"]')
  if (!root) return false
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
