// verify:running-day — his 13 Nov 2026 strategy, slice 6 (docs/plans/running.md), read off a real 390x844 screen.
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => {
  const p = q.url.split('?')[0]
  const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p)
  if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return }
  r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' })
  r.end(readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9941', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms))
let t
for (let i = 0; i < 80; i++) {
  try { const l = await fetch('http://127.0.0.1:9941/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {}
  await wait(250)
}
const ws = new WebSocket(t); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pend = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } })
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value

let failures = 0
const check = (name, ok, detail) => {
  if (ok) console.log(`    ✓ ${name}`)
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 320)}` : ''}`) }
}


await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
const URL_BASE = `http://127.0.0.1:${port}/?tour=off&walker=1`
const shot = name => send('Page.captureScreenshot', { format: 'png' }).then(r => writeFileSync(new URL(`./${name}.png`, import.meta.url).pathname, Buffer.from(r.result.data, 'base64')))
const text = () => ev(`document.body.innerText.replace(/\\s+/g, ' ')`)

const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(150); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
void has

console.log('\nRUNNING: A RUN DAY ON THE PLAN, HELD TO WHAT HE HAS RUN (his 13 Nov 2026 strategy, slice 6)\n')
const URL_RUN = `http://127.0.0.1:${port}/?tour=off&runner=1`
await send('Page.navigate', { url: `${URL_RUN}#/tab/exercise` })
await wait(4500)
const target = await ev('window.__runTarget ?? null')
check('0. the fixture is a 5 km goal with an easy run in week 1', !!target && !!target.date && target.planned === 35, target)

// A. Nothing logged: the run is kept to the first number, and the card says why.
await send('Page.navigate', { url: `${URL_RUN}&today=${target?.date}&load=1#/tab/exercise` })
await wait(5000)
const day = await text()
await shot('running-day-held')
check('1. the day is the run, by name', /Easy run · /.test(day || ''), (day || '').slice(0, 240))
check('2. its minutes are held to 25 with nothing logged', /Kept to 25 minutes today: log your runs/.test(day || ''), ((day || '').match(/.{0,40}Kept to.{0,90}/) || [''])[0])
const boxMinutes = await ev(`(() => { const r = document.querySelector('[data-testid="planned-activity"]'); if (!r) return null; const i = r.querySelector('input'); return i ? (i.value || i.placeholder) : (r.textContent.match(/(\\d+) ?min/) || [])[1] ?? null })()`)
check('3. ...and the row the tick logs says 25, not the plan\'s 35', String(boxMinutes) === '25', boxMinutes)
check('4. the effort is in words and the run in minutes; nowhere a pace', /Easy/.test(day || '') && !/pace|per km|\/ ?km|per mile|min\/km/i.test(day || ''), ((day || '').match(/.{0,30}(pace|per km|\/km).{0,30}/i) || [''])[0])
check('5b. ...and nothing on the card still says the planned 30 minutes', !/30 minutes Easy/.test(day || '') && /Easy throughout/.test(day || ''), ((day || '').match(/.{0,40}minutes Easy.{0,40}/) || [''])[0])
const line = await rectOf('[data-testid="run-held-back"]')
check('5. the reason is on screen where the run is', !!line && line.y > 0 && line.y < 844, line)

// B. A 30-minute run logged three days before: the 35-minute run is inside 10% of it, so it stands as planned.
await send('Page.navigate', { url: `${URL_RUN}&ranlong=1&today=${target?.date}&load=2#/tab/exercise` })
await wait(5000)
const day2 = await text()
await shot('running-day-as-planned')
check('6. after a logged 30-minute run, the plan\'s 35 stands and no line is drawn', !/Kept to/.test(day2 || '') && /\b35\b/.test(day2 || ''), ((day2 || '').match(/.{0,60}Easy run.{0,160}/) || [''])[0])
const boxMinutes2 = await ev(`(() => { const r = document.querySelector('[data-testid="planned-activity"]'); if (!r) return null; const i = r.querySelector('input'); return i ? (i.value || i.placeholder) : (r.textContent.match(/(\\d+) ?min/) || [])[1] ?? null })()`)
check('7. ...and the row the tick logs says 35', String(boxMinutes2) === '35', boxMinutes2)

// C. Profile: the running goal row, read as the goal; a change saves and offers the rebuild (the Profile harness page).
await send('Page.navigate', { url: `http://127.0.0.1:${port}/.tour-harness/profile.html?runner=1` })
await wait(3500)
await ev(`document.querySelector('[data-profile-row="Goal"]')?.click()`); await wait(800)
const hasRow = await ev(`!!document.querySelector('[data-testid="profile-running-goal"]')`)
const prof = await text()
await shot('running-profile')
check('8. Profile has a Running goal row reading "Run 5 km"', hasRow === true && /Running goal/.test(prof || '') && /Run 5 km/.test(prof || ''), ((prof || '').match(/.{0,40}Running goal.{0,60}/) || [''])[0] || (prof || '').slice(0, 200))

ws.close(); chrome.kill(); server.close()
console.log(failures === 0 ? '\nPASSED' : `\nFAILED (${failures})`)
process.exit(failures === 0 ? 0 : 1)
