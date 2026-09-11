// ---------------------------------------------------------------------------
// TAKING ONE EXERCISE OUT, AND MOVING ONE — on the real screen.
//
// scripts/test-session-edit.ts holds the rules: what the edit must re-assert,
// which weeks a scope reaches, the floor it refuses at. This holds the half no
// source check can — that on a real mount at phone width the menu items are
// there and enabled only where they make sense, that a move visibly changes
// the order and survives leaving the tab, and that Ashley's ruling actually
// reaches a thumb: removing ASKS (drop it / put something else there) rather
// than deciding, and the swap list is reachable from the act of wanting
// something gone.
//
// THE ORDER IS READ FROM data-exercise-name, not from a screenshot. A row's
// name lives in a truncating span inside a shared line component; asserting
// "the third row is now the bench press" off innerText would pass on a
// truncation. The attribute is the row's identity, in DOM order.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9411', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9411/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
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

// Radix menus open on pointerdown, so a synthetic .click() on the trigger is
// not enough — real pointer events at the element's centre.
const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const clickSel = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; n.click(); return true })()`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const order = () => ev(`[...document.querySelectorAll('[data-exercise-name]')].map(n => n.getAttribute('data-exercise-name'))`)
const escape = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(450) }
const untilOrder = async pred => { let o = await order(); for (let i = 0; i < 20 && !pred(o); i++) { await wait(300); o = await order() } return o }

// Expand the row for a named exercise, then open its "⋮". Rows collapse to a
// single line and the menu only exists on the expanded one.
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
const menuItems = () => ev(`[...document.querySelectorAll('[role="menuitem"]')].map(n => ({ t: n.textContent.trim(), disabled: n.getAttribute('aria-disabled') === 'true' || n.hasAttribute('data-disabled'), id: n.getAttribute('data-testid') }))`)

console.log('\nREMOVING AND MOVING ONE EXERCISE — on the screen\n')
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(4500)

const start = await order()
check('0. today shows a real session with room to lose one', Array.isArray(start) && start.length >= 4, start)

// --- the menu -------------------------------------------------------------
check('1a. the first exercise’s menu opens', (await openRowMenu(start[0])) === 'open')
const items = await menuItems()
const ids = items.map(i => i.id)
check('1b. it offers move earlier, move later and take out', ['move-up', 'move-down', 'remove-exercise'].every(k => ids.includes(k)), items)
check('1c. ...cheap first, the ban last', ids.indexOf('remove-exercise') < ids.length - 1 && /ban/i.test(items[items.length - 1].t), items.map(i => i.t))
check('1d. the first exercise cannot move earlier', items.find(i => i.id === 'move-up')?.disabled === true, items.find(i => i.id === 'move-up'))
check('1e. ...but can move later', items.find(i => i.id === 'move-down')?.disabled === false, items.find(i => i.id === 'move-down'))
await shoot('session-edit-menu')

// --- moving ----------------------------------------------------------------
// Radix menu items answer real pointer events, not element.click() — a
// synthetic click on one returns true and does nothing, which is exactly the
// shape of a check that proves nothing.
check('2a. "Move later" is tapped', await tap('[data-testid="move-down"]'))
const moved = await untilOrder(o => o[0] === start[1])
check('2b. the order on screen actually changed', moved.join('|') !== start.join('|'), { start, moved })
check('2c. ...it swapped with the one below it, and nothing else moved',
  moved[0] === start[1] && moved[1] === start[0] && moved.slice(2).join('|') === start.slice(2).join('|'), { start, moved })
check('2d. ...and the session still holds every exercise it did', [...moved].sort().join('|') === [...start].sort().join('|'))
check('2d2. ...and nothing on screen says it failed', !(await ev(`document.body.innerText`)).includes('The order hasn’t changed'))
await shoot('session-edit-moved')

// It was SAVED, not just re-rendered: leave the tab and come back.
await ev(`location.hash = '#/tab/home'`); await wait(1500)
await ev(`location.hash = '#/tab/exercise'`); await wait(2500)
const afterTrip = await untilOrder(o => o.length === moved.length)
check('2e. the new order survives leaving the tab and coming back', afterTrip.join('|') === moved.join('|'), { moved, afterTrip })

// --- removing asks, it does not decide -------------------------------------
const victim = afterTrip[afterTrip.length - 1]
check('3a. the last exercise’s menu opens', (await openRowMenu(victim)) === 'open')
check('3b. ...and it cannot move later', (await menuItems()).find(i => i.id === 'move-down')?.disabled === true)
check('3c. "Take out of this session" opens the sheet', await tap('[data-testid="remove-exercise"]') && (await wait(700), await has('[data-testid="remove-exercise-sheet"]')))
const verbs = await ev(`[...document.querySelectorAll('[data-testid="remove-exercise-sheet"] [data-verb]')].map(b => b.getAttribute('data-verb'))`)
check('3d. it ASKS — drop it, or put something else there (her ruling, 11 Sep)', JSON.stringify(verbs) === JSON.stringify(['drop', 'swap-instead']), verbs)
check('3e. ...and it names the exercise being taken out', (await ev(`document.querySelector('[data-testid="remove-exercise-sheet"]')?.innerText || ''`)).includes(victim), victim)
await shoot('session-edit-remove-asks')

// --- the swap route out of it ----------------------------------------------
check('4a. "Put something else there" reaches the swap list', await clickSel('[data-verb="swap-instead"]') && (await wait(900), (await ev(`document.body.innerText`)).includes('Smart Exercise Swap')))
check('4b. ...for the same exercise', (await ev(`document.body.innerText`)).includes(victim))
await escape(); await wait(600)

// --- dropping it ------------------------------------------------------------
check('5a. reopening and choosing "Drop it"', (await openRowMenu(victim)) === 'open' && await tap('[data-testid="remove-exercise"]') && (await wait(700), await clickSel('[data-verb="drop"]')))
await wait(400)
check('5b. ...asks how far it should reach', await has('[data-testid="remove-scope"]'))
const scopes = await ev(`[...document.querySelectorAll('[data-testid="remove-scope"] [data-scope]')].map(b => ({ s: b.getAttribute('data-scope'), t: b.textContent.trim() }))`)
check('5c. ...in the swap dialog’s own words', JSON.stringify(scopes) === JSON.stringify([{ s: 'today', t: 'Today only' }, { s: 'permanent', t: 'Rest of block' }]), scopes)
await shoot('session-edit-scope')
check('5d. "Today only" takes it out', await clickSel('[data-scope="today"]'))
const dropped = await untilOrder(o => !o.includes(victim))
check('5e. ...the exercise is gone from the session', !dropped.includes(victim), { victim, dropped })
check('5f. ...exactly one gone, the rest untouched', dropped.length === afterTrip.length - 1 && dropped.join('|') === afterTrip.filter(n => n !== victim).join('|'), { afterTrip, dropped })
check('5g. ...and the sheet closed itself', !(await has('[data-testid="remove-exercise-sheet"]')))
await shoot('session-edit-dropped')

await ev(`location.hash = '#/tab/home'`); await wait(1500)
await ev(`location.hash = '#/tab/exercise'`); await wait(2500)
const finalOrder = await untilOrder(o => o.length === dropped.length)
check('5h. the removal survives leaving the tab and coming back', finalOrder.join('|') === dropped.join('|'), { dropped, finalOrder })

console.log(failures === 0 ? '\nRemoving asks, moving moves, and both stick.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
