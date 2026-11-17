// ---------------------------------------------------------------------------
// "I HAVEN'T GOT THE KIT" CHANGES THE KIT FOR GOOD (runs 7-10, H34, 18 Oct 2026).
//
// Sam (minimalist, nothing said about his kit) had kettlebell and band work in his plan. On the swap sheet, "I
// haven't got the kit" offered only the four equipment choices, which change the next week and never what the app
// thinks he owns. Now the same step opens Profile's own ticks. Driven on Sam's setup (?sam=1&kit=1) through the
// app's own kit controller:
//   1. the kit step offers "Update what I have, for good", and the choices are labelled as the next 7 days;
//   2. it opens the ticks, as the equipment choice assumes them (Sam: kettlebell, bands, pull-up bar, bag, no bench);
//   3. unticking what he lacks and ticking the bench, the change is shown before Save, then saved as kit rows;
//   4. from today, the plan holds nothing that needs a kettlebell, a band, a pull-up bar or a bag.
// ---------------------------------------------------------------------------
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
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9589', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9589/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
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

// Radix opens menus on pointerdown, so real pointer events, not .click().
const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const clickSel = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; n.click(); return true })()`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const order = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.getAttribute('data-exercise-name'))`)
const escape = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(450) }

const openRowMenu = async name => {
  if (await has('[role="menu"]')) await escape()
  const line = `[data-exercise-name=${JSON.stringify(name)}] [role="button"], [data-exercise-name=${JSON.stringify(name)}] .cursor-pointer`
  if (!(await has(`[data-exercise-name=${JSON.stringify(name)}] button[aria-label="Exercise options"]`))) {
    await tap(line); await wait(700)
  }
  if (!(await tap(`[data-exercise-name=${JSON.stringify(name)}] button[aria-label="Exercise options"]`))) return 'no-trigger'
  await wait(500)
  return (await has('[data-testid="remove-exercise"]')) ? 'open' : 'no-menu'
}
/** Open the remove sheet on a named row and answer "It hurts". */
const openHurts = async name => {
  if ((await openRowMenu(name)) !== 'open') return false
  if (!(await tap('[data-testid="remove-exercise"]'))) return false
  await wait(700)
  if (!(await clickSel('[data-reason="hurts"]'))) return false
  await wait(400)
  return true
}

let ran = 0
const checkCounted = (name, ok, detail) => { ran++; check(name, ok, detail) }

console.log('\n"I HAVEN\'T GOT THE KIT", FOR GOOD\n')
// A VIDEO FOR EVERY EXERCISE, AS A SEARCH (his request 17 Nov 2026: "it would be good to have a button that takes you to
// a video tutorial"; his ruling "YouTube search"). How to carries "Find a video on YouTube", opening a search for that
// exercise's form in a new tab, for an exercise with a checked video and one without alike.
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off&sam=1&kit=1#/tab/exercise` })
await wait(4500)
const rows = await order()
const name = rows?.[1] ?? rows?.[0] ?? null
checkCounted('0. today shows exercises', !!name, rows)
const opened = (await openRowMenu(name ?? '')) === 'open'
  && await ev(`(() => { const i = [...document.querySelectorAll('[role="menuitem"]')].find(n => /How to do it/.test(n.textContent)); if (!i) return false; i.click(); return true })()`)
await wait(900)
const tab = await ev(`(() => { const t = [...document.querySelectorAll('[role="tab"]')].find(n => n.textContent.trim() === 'How to'); if (!t) return false; t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); t.click(); return true })()`)
await wait(600)
checkCounted('1. "How to do it" opens the How to tab', opened && tab && (await ev(`document.querySelector('[role="tab"][data-state="active"]')?.textContent?.trim() ?? null`)) === 'How to')
const link = await ev(`(() => { const a = document.querySelector('[data-testid="howto-video-search"]'); if (!a) return null; const r = a.getBoundingClientRect(); return { text: a.textContent.trim(), href: a.href, target: a.target, rel: a.rel, h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight } })()`)
checkCounted('2a. a "Find a video on YouTube" button', link?.text === 'Find a video on YouTube', link)
checkCounted('2b. ...a YouTube search for THIS exercise\'s form', link?.href === `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise form tutorial`)}`, { href: link?.href, name })
checkCounted('2c. ...in a new tab, never leaving the app', link?.target === '_blank' && /noopener/.test(link?.rel ?? ''), link)
checkCounted('2d. ...on screen without scrolling', !!link && link.top >= 0 && link.bottom <= link.vh, link)
await shoot('exercise-video-howto')

console.log(`\n${ran} checks ran.`)
ws.close(); chrome.kill(); server.close()
if (failures > 0) { console.error(`${failures} check(s) failed.`); process.exit(1) }
console.log('How to has a YouTube search for the exercise.\n')
