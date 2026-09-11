// ---------------------------------------------------------------------------
// THE TEN SECONDS BEFORE ROUND 1 — on the real screen, against a real clock.
//
// scripts/test-round-timer.ts §7 holds the schedule: the countdown is an
// offset on the one anchor, the run after it is bit-for-bit the run that
// always ran, and skipping moves the anchor rather than setting a flag. This
// holds the half no source check can — that pressing Start on the Tools tab
// actually produces a counting-down screen instead of a round already in
// progress, that the number really falls, and that tapping the field starts
// round 1 with its whole work interval.
//
// NO DEV CLOCK HERE, DELIBERATELY. getAppNow returns a FROZEN noon whenever a
// dev-clock override is set (dev-clock.ts:36), so a pinned harness would show
// a countdown that never moves and this file would prove nothing. Everything
// below runs against the real wall clock, which is why it waits in seconds.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9433', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9433/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const shoot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(s.result.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`) }
}
const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const clickText = re => ev(`(() => { const n = [...document.querySelectorAll('button')].find(b => ${re}.test(b.textContent.trim())); if (!n) return false; n.click(); return true })()`)
const field = () => ev(`(() => { const n = document.querySelector('[role="button"][aria-label^="Get ready"], [role="status"][aria-label*="Round"]'); return n ? { label: n.getAttribute('aria-label'), text: n.innerText.replace(/\\n+/g, ' | ') } : null })()`)
const bg = () => ev(`(() => { const n = document.querySelector('[role="button"][aria-label^="Get ready"], [role="status"][aria-label*="Round"]'); return n ? getComputedStyle(n).backgroundColor : null })()`)

console.log('\nTHE COUNTDOWN BEFORE ROUND 1 — on the screen, real clock\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/tools` })
await wait(4000)

// The timer surface opens from its tile — it is not on the tab by default,
// which is a fact about Tools, not about this feature.
check('0. Tools offers a rounds-and-intervals tile', await clickText('/Rounds & intervals/'))
await wait(900)
check('0b. ...which opens the round timer', await ev(`[...document.querySelectorAll('[role="tab"]')].some(n => /round/i.test(n.textContent))`))
const panelText = await ev(`document.body.innerText`)
check('1. the setup form says a countdown is coming, before you press anything',
  /10-second countdown/.test(panelText), (panelText.match(/Starts after[^\n]*/) || ['no such line'])[0])

check('2. Start is pressed', await clickText('/^Start$/'))
await wait(900)

const first = await field()
check('3. it is COUNTING DOWN, not already working', /^Get ready/.test(first?.label ?? ''), first)
check('4. ...and says so on the field', /GET READY/.test(first?.text ?? ''), first?.text)
check('5. ...offering the way to start sooner', /Tap anywhere to start now/.test(first?.text ?? ''), first?.text)
const readyBg = await bg()
await shoot('round-lead-in-counting')

// THE NUMBER ACTUALLY FALLS. A static "10" would satisfy every check above.
const n1 = parseInt((await field())?.label?.match(/in (\d+) seconds/)?.[1] ?? '', 10)
await wait(3000)
const n2 = parseInt((await field())?.label?.match(/in (\d+) seconds/)?.[1] ?? '', 10)
check('6. the count really falls', Number.isFinite(n1) && Number.isFinite(n2) && n2 < n1, { n1, n2 })
check('7. ...by about the seconds that passed', Math.abs((n1 - n2) - 3) <= 1, { n1, n2 })

// TAP ANYWHERE. The field itself is the control during the countdown.
check('8. tapping the field starts round 1', await tap('[role="button"][aria-label^="Get ready"]'))
await wait(900)
const after = await field()
check('9. ...it is working now', /Work/.test(after?.label ?? '') && /Round 1 of/.test(after?.label ?? ''), after)
check('10. ...with the WHOLE work interval, not what the countdown left behind',
  /0:3[0-9]|0:40/.test(after?.label ?? ''), after?.label)
const workBg = await bg()
check('11. the countdown was a different colour from work', readyBg && workBg && readyBg !== workBg, { readyBg, workBg })
await shoot('round-lead-in-working')

const err = await ev(`window.__lastError ?? null`)
check('no uncaught error on the page', err === null || err === undefined, err)

console.log(failures === 0 ? '\nThe round timer counts you in.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
