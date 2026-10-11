// ---------------------------------------------------------------------------
// "EASING OFF YOUR SHOULDERS UNTIL … · END NOW", ON THE REAL EXERCISE TAB.
//
// Test log M25 and M24, 9 Oct 2026. A temporary change to the plan was shown
// nowhere once its card had gone, and "tell me anytime to end it early" had
// nothing behind it: `endAdaptationEarly` had no caller.
//
// WHY A DRIVER. test:adaptations-respect-trained holds the rule (what ending
// puts back, what it keeps) and that the line is wired. It cannot tell
// whether the line is DRAWN after a real "it hurts", whether the button is a
// thing a thumb can press, or whether pressing it changes the session on
// screen. So this says a shoulder is a niggle from an exercise row, reads the
// line, presses End now, and reads the session again.
//
// The store, the edit context and the ending are the app's own. The few lines
// of state App.tsx keeps around them are mirrored in real.tsx, because the
// harness mounts the tab without App.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'

const DEBUG_PORT = 9801
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
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
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
  else { failures++; console.error(`    ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`) }
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
  if (!(await has(`[data-exercise-name=${JSON.stringify(name)}] button[aria-label="Exercise options"]`))) { await tap(line); await wait(700) }
  if (!(await tap(`[data-exercise-name=${JSON.stringify(name)}] button[aria-label="Exercise options"]`))) return 'no-trigger'
  await wait(500)
  return (await has('[data-testid="remove-exercise"]')) ? 'open' : 'no-menu'
}
const line = () => ev(`(() => {
  const box = document.querySelector('[data-testid="active-adaptations"]')
  if (!box) return null
  box.scrollIntoView({ block: 'center' })
  const row = box.querySelector('[data-testid="active-adaptation"]')
  const btn = box.querySelector('[data-testid="end-adaptation"]')
  const r = btn?.getBoundingClientRect(), rr = row?.getBoundingClientRect()
  const today = document.querySelector('[data-exercise-name]')?.getBoundingClientRect()
  return {
    text: (row?.querySelector('span')?.textContent || '').trim(),
    button: (btn?.textContent || '').trim(),
    h: r ? Math.round(r.height) : 0, w: r ? Math.round(r.width) : 0,
    inside: !!rr && rr.left >= 0 && rr.right <= window.innerWidth,
    above: !!rr && !!today && rr.top < today.top,
    rows: box.querySelectorAll('[data-testid="active-adaptation"]').length,
  }
})()`)

console.log('\nA TEMPORARY CHANGE SAYS SO, AND CAN BE ENDED\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(4500)

const before = await order()
check('0a. today shows a real session', Array.isArray(before) && before.length >= 3, before)
check('0b. with nothing being eased off, there is no line', (await line()) === null)

// --- 1. Say a shoulder is a niggle, from an exercise row --------------------
const victim = before[before.length - 1]
const opened = (await openRowMenu(victim)) === 'open' && await tap('[data-testid="remove-exercise"]')
await wait(700)
check('1a. "it hurts", a niggle, the shoulders', opened && await clickSel('[data-reason="hurts"]') && (await wait(400), await clickSel('[data-hurt="niggle"]')) && (await wait(500), await clickSel('[data-area="shoulders"]')))
await wait(2800)
const eased = await order()
check('1b. the session changed (the line below is about a real change)', JSON.stringify(eased) !== JSON.stringify(before), { before, eased })

// --- 2. The line -------------------------------------------------------------
const shown = await line()
check('2a. a line now says what is being eased off, and until when', !!shown && /^Easing off your shoulders until \d{1,2} [A-Z][a-z]{2}$/.test(shown.text), shown)
const ends = await ev(`(() => { const a = (window.__fakeDb?.plan_adaptations ?? [])[0]; if (!a) return null; const d = new Date(a.expires_at); return { day: d.getDate(), status: a.status, kind: a.kind, shape: a.pre_image && a.pre_image.version, days: (a.pre_image?.days ?? []).length, changes: (a.pre_image?.changes ?? []).length } })()`)
check('2b. ...the date is the day the stored adaptation ends', !!shown && !!ends && shown.text.includes(` ${ends.day} `), { shown, ends })
check('2c. ...and what was stored names days and slots, not whole weeks', ends?.shape === 2 && ends.days >= 1 && ends.changes >= 1, ends)
check('2d. it sits above today\'s session, inside the screen', !!shown && shown.above && shown.inside && shown.rows === 1, shown)
check('2e. "End now" is there, and is a thing a thumb can press', !!shown && shown.button === 'End now' && shown.h >= 44 && shown.w >= 44, shown)
check('2f. no "undefined", "null" or "NaN" on the line', !!shown && !/undefined|null|NaN/.test(shown.text + shown.button), shown)
await shoot('adaptation-line')

// --- 3. End now --------------------------------------------------------------
check('3a. pressing End now', await tap('[data-testid="end-adaptation"]'))
await wait(2500)
const after = await order()
check('3b. today\'s session is back to what it was before', JSON.stringify(after) === JSON.stringify(before), { before, after })
check('3c. ...the line has gone', (await line()) === null)
const stored = await ev(`(window.__fakeDb?.plan_adaptations ?? []).map(a => a.status)`)
check('3d. ...and the stored adaptation is marked ended early, not left running', JSON.stringify(stored) === JSON.stringify(['ended_early']), stored)
check('3e. no error was shown', !(await has('[data-testid="end-adaptation-error"]')))
await shoot('adaptation-line-ended')

const err = await ev('window.__err ?? null')
check('4. no uncaught error on the page', err === null, err)

console.log(failures === 0 ? '\nA temporary change is visible while it runs, and ends when asked.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
