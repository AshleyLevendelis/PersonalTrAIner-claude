// Walks the tour across the REAL screens and asks, at every stop, the one
// question the stub harness cannot: does the spotlight land on the thing the
// copy is talking about?
//
// The stub run proves the tour's behaviour. This proves its aim.
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const file = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(file)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium', [
  '--headless=new', '--remote-debugging-port=9337', '--no-sandbox', '--disable-gpu',
  '--window-size=390,844', 'about:blank',
], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let targetWs
for (let i = 0; i < 80; i++) {
  try {
    const list = await fetch('http://127.0.0.1:9337/json/list').then(r => r.json())
    const page = list.find(t => t.type === 'page')
    if (page) { targetWs = page.webSocketDebuggerUrl; break }
  } catch {}
  await wait(250)
}
if (!targetWs) { console.error('no chrome'); process.exit(1) }
const ws = new WebSocket(targetWs)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJs = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result?.result?.value
}
let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const errors = []
await send('Runtime.consoleAPICalled')
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params?.exceptionDetails?.exception?.description ?? '').slice(0, 200))
})

await send('Page.navigate', { url: `http://127.0.0.1:${port}/#/tab/dashboard` })
await wait(3000)

/** SPOT_PAD in AppTour.tsx — the hole is the target's rect grown by this. */
const SPOT_PAD = 6

const state = () => evalJs(`(() => {
  const card = document.querySelector('[role="dialog"][aria-label="App tour"] .tour-fade')
  const spot = document.querySelector('[role="dialog"][aria-label="App tour"] div[style*="2000px"]')
  const r = spot && spot.getBoundingClientRect()
  return {
    counter: card ? (card.querySelector('span:nth-child(2)')||{}).textContent : null,
    title: card ? (card.querySelector('h2,h3,p')||{}).textContent : null,
    body: card ? [...card.querySelectorAll('p')].map(p=>p.textContent).join(' | ') : null,
    cta: card ? (([...card.querySelectorAll('button')].pop())||{}).textContent : null,
    hasCard: !!card, pulsing: !!document.querySelector('.tour-breathe'),
    spot: r ? { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } : null,
    hash: location.hash,
  }
})()`)

const targetRect = key => evalJs(`(() => {
  const el = document.querySelector('[data-tour="${key}"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height),
           tag: el.tagName, text: (el.innerText||'').replace(/\\s+/g,' ').trim().slice(0, 70) }
})()`)

const clickCta = () => evalJs(`(() => { const c = document.querySelector('.tour-fade'); const b=[...c.querySelectorAll('button')].pop(); b.click(); return b.textContent })()`)
const tapTarget = key => evalJs(`(() => {
  const el = document.querySelector('[data-tour="${key}"]')
  if (!el) return 'MISSING'
  const r = el.getBoundingClientRect()
  const top = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2)
  const blocked = !(el === top || el.contains(top) || (top && top.contains(el)))
  el.click(); return blocked ? 'CLICK-BLOCKED' : 'ok'
})()`)
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL(`./real-${name}.png`, import.meta.url).pathname, Buffer.from(r.result.data, 'base64'))
}

// THE TOUR'S OWN STEP LIST, read out of the page rather than restated here.
// The hand-written copy this replaces had the chat tab's nav key as
// 'navChat'; it is 'chatfab', and the driver reported a target missing that
// was never missing.
const STOPS = (await evalJs('JSON.stringify(window.__TOUR_STEPS__)')
  .then(j => JSON.parse(j)))
  .map(st => ({ key: st.key, target: st.target ?? null, tab: st.tab, tap: st.nav ?? null, gate: !!st.gate }))
if (!STOPS.length) { console.error('could not read TOUR_STEPS from the page'); process.exit(1) }

console.log('\nTHE TOUR, STOP BY STOP, AGAINST THE REAL SCREENS\n')

// DRIVEN BY THE TOUR'S OWN COUNTER, not by a loop index, and that is a
// correction rather than a preference. The first version assumed one
// iteration per stop; the gated set stop has TWO phases with different copy
// under one number ("Tap the ✓ to log the set", then "Logged — that easy"),
// so from stop 7 onward the driver was asserting each stop's target against
// the previous stop's spotlight and reporting the mismatch as a bug. Reading
// the number the tour is actually showing cannot drift from it.
const byKey = Object.fromEntries(STOPS.map((s, i) => [i + 1, s]))
const asserted = new Set()
const taps = {}
let guard = 0

while (guard++ < 40) {
  const s = await state()
  if (!s.hasCard) { check('the tour is still on screen', false, s); break }
  const n = Number(/(\d+) of/.exec(s.counter ?? '')?.[1] ?? 0)
  const stop = byKey[n]
  if (!stop) { check(`counter "${s.counter}" maps to a known stop`, false, s.counter); break }
  const label = `${n}. ${stop.key}`

  // Assert a stop's aim ONCE, on the phase where its target is still live —
  // the set stop deliberately drops its own data-tour the moment the set
  // saves, so a second look would report the target missing.
  // ONLY IN THE INFO PHASE. A nav stop's tap phase happens on the PREVIOUS
  // tab — the tour is asking you to go somewhere, so its content target does
  // not exist yet and the spotlight is on the tab button. Asserting there
  // reported "extoday is missing" while the tour was correctly still on
  // Nutrition waiting to be taken to Exercise.
  if (!asserted.has(n) && !s.pulsing) {
    asserted.add(n)
    if (stop.target) {
      const tr = await targetRect(stop.target)
      if (!tr) {
        check(`${label}: [data-tour="${stop.target}"] exists on the real screen`, false, { hash: s.hash })
      } else {
        check(`${label}: target is on screen (${tr.w}x${tr.h} at y=${tr.t}) — "${tr.text}"`,
          tr.t < 844 && tr.t + tr.h > 0 && tr.w > 0 && tr.h > 0, tr)
        if (!s.spot) check(`${label}: a spotlight was drawn`, false, s)
        else {
          const off = {
            dt: Math.abs(s.spot.t - (tr.t - SPOT_PAD)), dl: Math.abs(s.spot.l - (tr.l - SPOT_PAD)),
            dw: Math.abs(s.spot.w - (tr.w + SPOT_PAD * 2)), dh: Math.abs(s.spot.h - (tr.h + SPOT_PAD * 2)),
          }
          check(`${label}: the spotlight is ON the target (±2px)`,
            Object.values(off).every(v => v <= 2), { spot: s.spot, target: tr, off })
          check(`${label}: the hole is fully inside the viewport`,
            s.spot.t >= -2 && s.spot.l >= -2 && s.spot.t + s.spot.h <= 846 && s.spot.l + s.spot.w <= 392, s.spot)
        }
      }
    } else {
      check(`${label}: an untargeted stop draws no spotlight`, !s.spot, s.spot)
    }
    console.log(`      ${s.counter} · ${String(s.cta).trim()} · ${String(s.body).slice(0, 72)}`)
    await shot(`${n}-${stop.key}`)
  }

  if (/Finish|Done/i.test(s.cta ?? '')) {
    check('the last stop offers a finish', true)
    await clickCta(); await wait(700)
    const after = await state()
    check('finishing closes the tour', !after.hasCard, after)
    break
  }

  // How to advance depends on what the tour is waiting for, asked rather
  // than assumed: a tap phase wants the real element tapped, everything else
  // takes its CTA.
  if (s.pulsing) {
    // The tap phase belongs to the stop that is pulsing: a nav stop waits for
    // its OWN tab button, the gated stop for its own ✓. (Tapping the next
    // stop's target here is what produced 38 identical "MISSING" lines.)
    const key = stop.tap ?? stop.target
    if (taps[key] >= 2) {
      const diag = await evalJs(`(() => {
        const rows = [].slice.call(document.querySelectorAll('[data-tour="setrow"]'))
        var row = rows[0] ? rows[0].parentElement : null
        for (var k = 0; k < 5 && row && !row.querySelector('input'); k++) row = row.parentElement
        const ins = row ? [].slice.call(row.querySelectorAll('input')).map(function (i) {
          return { placeholder: i.placeholder, value: i.value, aria: i.getAttribute('aria-label') } }) : []
        const txt = document.body.innerText
        return JSON.stringify({
          openSetRows: rows.length,
          inputs: ins,
          rowError: txt.indexOf('Enter reps to log this set') >= 0 ? 'Enter reps to log this set' : null,
          logged: txt.indexOf('Logged') >= 0,
        })
      })()`)
      check(`${label}: the tour advanced after the real tap`, false, diag)
      break
    }
    taps[key] = (taps[key] ?? 0) + 1
    const res = await tapTarget(key)
    check(`${label}: the real ${key} is reachable through the hole`, res === 'ok', res)
    if (res !== 'ok') break
    await wait(1600)
  } else {
    await clickCta(); await wait(1100)
  }
}
if (errors.length) console.log('\n  page errors: ' + errors.slice(0, 3).join(' | '))
console.log(failures === 0 ? '\nEvery stop landed on its real target.\n' : `\n${failures} FAILED\n`)
chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
