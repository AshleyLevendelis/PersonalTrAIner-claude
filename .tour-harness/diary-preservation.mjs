// ---------------------------------------------------------------------------
// WHAT YOU ATE, ON THE REAL SCREEN — roadmap item 9.
//
// scripts/test-diary-preservation.ts proves the rules and the wording. What it
// cannot prove is that a real mount, reading real rows through the real store,
// actually draws them — which is exactly the split that shipped on 8 Sep 2026,
// when the week strip drew a swap correctly while the panel underneath
// disagreed with it.
//
// ?ate=1 seeds two logged meals and turns nut-free on:
//   breakfast — logged under the name the slot still shows, and that meal
//               contains almond butter. The re-check trips. It must get the
//               QUIET NOTE, never the red "swap it, or regenerate" warning,
//               because there is nothing left to swap.
//   lunch     — logged under a name the plan has since moved away from, at
//               610 kcal against the pick's 720. The heading must stay the
//               name that was eaten, over the calories that were eaten.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  const p = req.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { res.writeHead(404); res.end('nf'); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port

const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9361', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 80; i++) {
  try {
    const l = await fetch('http://127.0.0.1:9361/json/list').then(r => r.json())
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
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const read = () => ev(`(() => {
  const text = document.body.innerText
  return {
    text,
    sample: text.replace(/\\s+/g, ' ').slice(0, 400),
    hasRedWarning: /no longer fits your restrictions|Swap it, or regenerate/i.test(text),
  }
})()`)

console.log('\nTWO MEALS ALREADY EATEN, AND A RESTRICTION ADDED AFTERWARDS\n')

await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&ate=1#/tab/nutrition` })
await wait(3000); await ev(`location.hash = '#/tab/nutrition'`); await wait(2500)
let s = await read()
for (let i = 0; i < 20 && !/Leftover chilli/.test(s.text); i++) { await wait(500); s = await read() }

// --- name preservation -----------------------------------------------------
check('1. the lunch row shows the meal that was EATEN', /Leftover chilli and rice/.test(s.text), s.sample)
check('2. ...not the meal the plan now suggests for that slot',
  !/Chicken, rice and roasted peppers/.test(s.text.split('Dinner')[0] ?? s.text), s.sample)
check('3. ...over the calories that were actually eaten, not the plan\'s',
  /610/.test(s.text) && !/\b720\b/.test(s.text), s.sample)

// --- the quiet note, and the absence of the warning ------------------------
check('4. the eaten breakfast gets the quiet note, naming the food and the rule',
  /you ate it before you added nut-free/i.test(s.text) && /almond butter/i.test(s.text), s.sample)
check('5. ...and NOT the red warning, which would ask her to swap a meal she has eaten',
  !s.hasRedWarning, s.sample)

await shoot('diary-preservation')

// --- the expanded row explains whose details it is showing -----------------
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /Leftover chilli/.test(x.textContent||'')); if (b) b.click(); return !!b })()`)
await wait(1200)
const expanded = await read()
check('6. opening the moved-on row says whose details are below it',
  /Your plan now shows Chicken, rice and roasted peppers here/.test(expanded.text), expanded.sample)

await shoot('diary-preservation-expanded')

const err = await ev('window.__err ?? null')
check('7. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nWhat she ate stays what she ate.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
