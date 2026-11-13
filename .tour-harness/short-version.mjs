// ---------------------------------------------------------------------------
// THE SHORTEST VERSION, A FLOOR THAT COUNTS — his strategy of 13 Nov 2026, slice 2 (docs/plans/coach-rhythm.md §2d).
// On the real Exercise tab at 390x844: the day menu's "short of time" offers "Shortest version" and says it still counts;
// tapping it cuts the session as far as it goes, the main lift whole, three real exercises at least, today only, and the
// header says how long it now really takes. Setup copied from verify:shorten-today (port 9417).
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9417', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9417/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`) }
}

const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const clickSel = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; n.click(); return true })()`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const order = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.getAttribute('data-exercise-name'))`)
const verbs = () => ev(`[...document.querySelectorAll('[data-testid="what-happened-verbs"] [data-verb]')].map(b => b.getAttribute('data-verb'))`)
const note = () => ev(`document.querySelector('[data-testid="session-length-note"]')?.textContent?.trim() || ''`)
const headerText = () => ev(`document.querySelector('[data-testid="week-context-row"], header')?.innerText || document.body.innerText.slice(0, 400)`)

const MAIN_LIFT_JS = `(() => {
  // RE-ANCHORED 31 Oct 2026 (Exercise 2a): the label is inside the exercise's own row now.
  const row = [...document.querySelectorAll('[data-exercise-name]')].find(c => /^Main lift\\b/.test(c.querySelector('[data-testid="exercise-eyebrow"]')?.textContent.trim() ?? ''))
  if (!row) return null
  return { name: row.getAttribute('data-exercise-name'), text: row.innerText.replace(/\\s+/g, ' ').trim() }
})()`
const mainLift = () => ev(MAIN_LIFT_JS)

const escape = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(450) }
const openSheet = async () => {
  if (await has('[data-testid="what-happened-sheet"]')) await escape()
  await tap('button[aria-label="More options"]'); await wait(500)
  if (!(await has('[data-testid="what-happened-item"]'))) return 'no-menu-item'
  await tap('[data-testid="what-happened-item"]'); await wait(600)
  return (await has('[data-testid="what-happened-sheet"]')) ? 'open' : 'no-sheet'
}
const untilClosed = async () => { for (let i = 0; i < 16 && await has('[data-testid="what-happened-sheet"]'); i++) await wait(250); return !(await has('[data-testid="what-happened-sheet"]')) }
const untilOrder = async pred => { let o = await order(); for (let i = 0; i < 24 && !pred(o); i++) { await wait(300); o = await order() } return o }

console.log('\nTHE SHORTEST VERSION — on the screen\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(4500)
const start = (await order()) ?? []
const mainBefore = await mainLift()
const estBefore = Number(await ev(`(document.body.innerText.match(/~(\\d+) min/) || [])[1] || 0`))
check('0. today has a real session, a main lift and a length', start.length >= 4 && !!mainBefore?.name && estBefore >= 30, { start, main: mainBefore?.name, estBefore })
check('1. the day menu opens', (await openSheet()) === 'open')
check('2. "short of time" offers the shortest version beside the fixed times', await clickSel('[data-verb="shorten"]') && (await wait(500), await has('[data-shorten-floor]')))
const minutes = (await ev(`[...document.querySelectorAll('[data-shorten-minutes]')].map(b => Number(b.getAttribute('data-shorten-minutes')))`)) ?? []
const floorNote = await ev(`document.querySelector('[data-testid="shorten-floor-note"]')?.textContent?.trim() ?? ''`)
check('3. ...and says it still counts as today\'s session', /still counts as today/.test(floorNote ?? ''), floorNote)
const btn = await ev(`(() => { const b = document.querySelector('[data-shorten-floor]'); if (!b) return null; const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), h: Math.round(r.height), w: Math.round(r.width) } })()`)
check('4. the button says "Shortest version" and is tappable', btn?.text === 'Shortest version' && btn.h >= 32, btn)
await shoot('short-version-offer')
check('5. tapping it closes the sheet', await clickSel('[data-shorten-floor]') && await untilClosed())
const after = await untilOrder(o => Array.isArray(o) && o.length < start.length)
check('6. the session lost exercises, from the end', after.length < start.length && after.every((n, i) => n === start.filter(s => after.includes(s))[i]), { start, after })
const mainAfter = await mainLift()
check('7. the main lift is still there, every set of it', mainAfter?.name === mainBefore?.name && mainAfter?.text === mainBefore?.text, { before: mainBefore?.text, after: mainAfter?.text })
check('8. ...and at least three exercises stay', after.length >= 3, after)
await wait(800)
const estAfter = Number(await ev(`(document.body.innerText.match(/~(\\d+) min/) || [])[1] || 0`))
// MEASURED 13 Nov 2026: 48 -> 27 min on this plan; the main lift and three exercises do not fit 20, so 20 is not reachable
// (that the floor is never longer than any fixed time is test:coach-rhythm §6's, on a real plan).
check('9. it is much shorter than before, and fits inside the 30-minute choice', estAfter > 0 && estAfter < estBefore && estAfter <= 30, { estBefore, estAfter, minutes })
const note2 = await note()
check('10. the header says it was shortened, to the minutes it really takes', /^Shortened/.test(note2) && new RegExp(`\\b${estAfter}\\b`).test(note2) && /next week/i.test(note2), { note2, estAfter })
await shoot('short-version-done')
chrome.kill(); server.close()
console.log(failures === 0 ? '\nPASSED — the shortest version keeps the main lift, three exercises, and says it still counts.' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
