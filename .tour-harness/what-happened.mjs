// ---------------------------------------------------------------------------
// WHAT HAPPENED TO TODAY'S SESSION — the five verbs, on the real screen.
//
// scripts/test-what-happened.ts holds the rules: the ranking of a declared
// miss, one writer per column, which verbs apply to which day. This holds the
// half no source check can: that on a real mount at phone width the menu
// item opens the sheet, each verb changes the week strip's cell (and Home's),
// each can be unsaid, and "I did it, not in the app" on a past day logs real
// sets and reads done.
//
// WHICH DAY IS "TODAY" IS CHOSEN, NOT ASSUMED. The fixture's training days
// are relative to the REAL weekday (today, +2, +4, +5) and its plan was
// created nine real days ago, so programme weeks roll over on a fixed
// weekday. A first version pinned Monday and found "no free day left this
// week" — true: every later day was already next programme week, and the
// coach's own move would have refused the same way. So the driver pins the
// real today, or two days on when the real today is a Monday or Tuesday,
// which gives a due training day with a free day after it in the same
// programme week AND a real past training day behind it in the same strip.
// ---------------------------------------------------------------------------
import { createServer } from 'http'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { spawn } from 'child_process'
const DIST = new URL('./dist/', import.meta.url).pathname
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((q, r) => { const p = q.url.split('?')[0]; const f = join(DIST, p === '/' ? '/.tour-harness/real.html' : p); if (!existsSync(f)) { r.writeHead(404); r.end('nf'); return } r.writeHead(200, { 'Content-Type': T[extname(f)] ?? 'application/octet-stream' }); r.end(readFileSync(f)) })
await new Promise(r => server.listen(0, r)); const port = server.address().port
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9409', '--no-sandbox', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
const wait = ms => new Promise(r => setTimeout(r, ms)); let t
for (let i = 0; i < 80; i++) { try { const l = await fetch('http://127.0.0.1:9409/json/list').then(r => r.json()); const g = l.find(x => x.type === 'page'); if (g) { t = g.webSocketDebuggerUrl; break } } catch {} await wait(250) }
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
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const real = new Date()
const pinned = (() => { const d = new Date(real); if (d.getDay() === 1 || d.getDay() === 2) d.setDate(d.getDate() + 2); return d })()
const TODAY = iso(pinned); const TODAY_NAME = NAMES[pinned.getDay()]
console.log('pinning today to', TODAY, `(${TODAY_NAME})`)
const pin = async date => (await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('fitplan_dev_clock_00000000-0000-4000-8000-000000000001', JSON.stringify({date:'${date}',enabled:true})) } catch {}` })).result.identifier

// Real pointer events at the element's centre — Radix menus open on pointerdown, not on .click().
const rectOf = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
const tap = async sel => { const r = await rectOf(sel); if (!r) return false; await wait(120); const r2 = await rectOf(sel); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r2.x, y: r2.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 }); return true }
const clickSel = sel => ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; n.click(); return true })()`)
const clickText = re => ev(`(() => { const n = [...document.querySelectorAll('button')].find(b => ${re}.test(b.textContent.trim())); if (!n) return false; n.click(); return true })()`)
const has = sel => ev(`!!document.querySelector(${JSON.stringify(sel)})`)
const cell = day => ev(`(() => { const n = document.querySelector('[aria-label^="${day}:"]'); return n ? n.getAttribute('aria-label') : null })()`)
const verbs = () => ev(`[...document.querySelectorAll('[data-testid="what-happened-verbs"] [data-verb]')].map(b => b.getAttribute('data-verb'))`)
const setValue = (sel, v) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
const openSheet = async () => {
  if (await has('[data-testid="what-happened-sheet"]')) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(400) }
  await tap('button[aria-label="More options"]'); await wait(500)
  if (!(await has('[data-testid="what-happened-item"]'))) return 'no-menu-item'
  await tap('[data-testid="what-happened-item"]'); await wait(600)
  return (await has('[data-testid="what-happened-sheet"]')) ? 'open' : 'no-sheet'
}
const untilClosed = async () => { for (let i = 0; i < 16 && await has('[data-testid="what-happened-sheet"]'); i++) await wait(250); return !(await has('[data-testid="what-happened-sheet"]')) }
const untilCell = async (day, re) => { let c = await cell(day); for (let i = 0; i < 16 && !re.test(c || ''); i++) { await wait(300); c = await cell(day) } return c }

console.log('\nWHAT HAPPENED TO TODAY’S SESSION — on the screen\n')
await pin(TODAY)
await send('Page.navigate', { url: `http://127.0.0.1:${port}/?tour=off#/tab/exercise` })
await wait(4000)
check(`0. today (${TODAY_NAME}) is a due training day`, new RegExp(`^${TODAY_NAME}: due$`).test(await cell(TODAY_NAME) || ''), await cell(TODAY_NAME))

// --- open ---------------------------------------------------------------
check('1. the day menu opens the sheet', (await openSheet()) === 'open')
const v0 = await verbs()
check('2. today offers exactly: missed, move, rest, something else — and NOT "did it elsewhere"', JSON.stringify(v0) === JSON.stringify(['missed', 'move', 'rest', 'something_else']), v0)
check('3. ...and points at the grid for a session done today', (await ev(`document.querySelector('[data-testid="what-happened-sheet"]').innerText`)).includes('Tick the sets below'))
await shoot('what-happened-menu')

// --- I missed it ----------------------------------------------------------
check('4a. tapping "I missed it"', await clickSel('[data-verb="missed"]'))
await wait(700)
check('4b. ...records it and offers what comes next', await has('[data-testid="what-happened-missed-recorded"]'))
check('4c. ...and the Exercise strip reads missed, today, not tomorrow', new RegExp(`^${TODAY_NAME}: missed$`).test(await untilCell(TODAY_NAME, /missed/) || ''), await cell(TODAY_NAME))
const offer = await ev(`(() => { const b = [...document.querySelectorAll('[data-testid="what-happened-missed-recorded"] button')].map(x => x.textContent.trim()); return b })()`)
check('4d. ...the offer to move it is there or honestly absent', Array.isArray(offer) && (offer.some(x => /^Move it to /.test(x)) || offer.includes('Done')), offer)
await shoot('what-happened-missed')
await clickText('/^(Leave it|Done)$/'); check('4e. leaving it closes the sheet', await untilClosed())

// --- Home agrees -----------------------------------------------------------
await ev(`location.hash = '#/tab/home'`); await wait(1800)
check(`5. Home’s week strip agrees: ${TODAY_NAME} missed`, new RegExp(`^${TODAY_NAME}: missed$`).test(await untilCell(TODAY_NAME, /missed/) || ''), await cell(TODAY_NAME))
await ev(`location.hash = '#/tab/exercise'`); await wait(1500)

// --- undo ------------------------------------------------------------------
check('6a. reopening shows what was declared', (await openSheet()) === 'open' && (await ev(`document.querySelector('[data-testid="what-happened-declared"]')?.innerText || ''`)).includes('missed'))
check('6b. ...and "I missed it" is no longer offered', !(await verbs()).includes('missed'), await verbs())
check('6c. Undo', await clickSel('button[aria-label="Undo marking this day missed"]') && await untilClosed())
check('6d. ...brings the day back to due', new RegExp(`^${TODAY_NAME}: due$`).test(await untilCell(TODAY_NAME, /due/) || ''), await cell(TODAY_NAME))

// --- rest day --------------------------------------------------------------
check('7a. "Make it a rest day"', (await openSheet()) === 'open' && await clickSel('[data-verb="rest"]') && await untilClosed())
check('7b. ...reads as a rest day you chose', /rest day you chose/.test(await untilCell(TODAY_NAME, /rest day/) || ''), await cell(TODAY_NAME))
check('7c. ...and can be unsaid', (await openSheet()) === 'open' && await clickSel('button[aria-label="Undo the rest day"]') && await untilClosed() && new RegExp(`^${TODAY_NAME}: due$`).test(await untilCell(TODAY_NAME, /due/) || ''), await cell(TODAY_NAME))

// --- move ------------------------------------------------------------------
check('8a. "Move it to another day" lists real destinations', (await openSheet()) === 'open' && await clickSel('[data-verb="move"]') && (await wait(400), (await ev(`document.querySelectorAll('[data-move-to]').length`)) >= 1))
const dest = await ev(`document.querySelector('[data-move-to]')?.getAttribute('data-move-to')`)
check('8b. ...tapping one moves it', await clickSel('[data-move-to]') && await untilClosed() && /moved to another day/.test(await untilCell(TODAY_NAME, /moved/) || ''), { dest, cell: await cell(TODAY_NAME) })
check('8c. ...and the moved-day card offers to do it today instead', await ev(`[...document.querySelectorAll('button')].some(b => /Do it today instead/.test(b.textContent))`))
await clickText('/Do it today instead/'); check('8d. ...which brings it back', new RegExp(`^${TODAY_NAME}: due$`).test(await untilCell(TODAY_NAME, /due/) || ''), await cell(TODAY_NAME))

// --- something else --------------------------------------------------------
check('9a. "I did something else instead"', (await openSheet()) === 'open' && await clickSel('[data-verb="something_else"]'))
await wait(300)
check('9b. ...takes an activity and minutes', await setValue('input[aria-label="Activity"]', 'Swim') && await setValue('input[aria-label="Minutes"]', '30'))
check('9c. ...and saving swaps the day', await clickSel('[data-verb="save-something-else"]') && await untilClosed() && /swapped for another activity/.test(await untilCell(TODAY_NAME, /swapped/) || ''), await cell(TODAY_NAME))
let swapped = await ev(`document.querySelector('[data-testid="swapped-today"]')?.innerText || ''`)
for (let i = 0; i < 10 && !/Swim/.test(swapped); i++) { await wait(300); swapped = await ev(`document.querySelector('[data-testid="swapped-today"]')?.innerText || ''`) }
check('9d. ...and today’s panel says so, by name', /Swim/.test(swapped), swapped)
await shoot('what-happened-swapped')
check('9e. ...and can be unsaid', (await openSheet()) === 'open' && await clickSel('button[aria-label="Undo the swap"]') && await untilClosed() && new RegExp(`^${TODAY_NAME}: due$`).test(await untilCell(TODAY_NAME, /due/) || ''), await cell(TODAY_NAME))

// --- a PAST day: "I did it, not in the app" ---------------------------------
// The first strip cell BEFORE today that reads missed — a real past training
// day the strip has already given up on. In this fixture there is always one
// (today-2 or today-3 is a training day, and both sit inside the strip for the
// day chosen above).
const pastDay = await ev(`(() => { const days = ${JSON.stringify(NAMES.slice(1).concat(NAMES[0]))}; const todayIdx = days.indexOf(${JSON.stringify(TODAY_NAME)});
  for (let i = todayIdx - 1; i >= 0; i--) { const n = document.querySelector('[aria-label^="' + days[i] + ':"]'); if (n && /: missed$/.test(n.getAttribute('aria-label'))) return days[i] } return null })()`)
check('10a. a past training day the strip already calls missed exists in this week', typeof pastDay === 'string', pastDay)
check('10b. peeking it', await tap(`[aria-label^="${pastDay}:"]`) && (await wait(800), true))
check('10c. ...and asking what happened opens the sheet for THAT day', (await openSheet()) === 'open' && new RegExp(pastDay).test(await ev(`document.querySelector('[data-testid="what-happened-sheet"] h2')?.innerText || ''`)), await ev(`document.querySelector('[data-testid="what-happened-sheet"]')?.innerText?.slice(0, 120)`))
const vPast = await verbs()
check('10d. a past day offers "I did it, not in the app" as well as missed', vPast.includes('did_elsewhere') && vPast.includes('missed'), vPast)
check('10e. ...with one row per exercise, pre-filled from the plan', await clickSel('[data-verb="did_elsewhere"]') && (await wait(300), (await ev(`document.querySelectorAll('input[aria-label$=" sets"]').length`)) >= 1))
await shoot('what-happened-did-elsewhere')
check('10f. logging it', await clickSel('[data-verb="save-did-elsewhere"]') && await untilClosed())
check('10g. ...makes that day done — real sets, a completed session', new RegExp(`^${pastDay}: done$`).test(await untilCell(pastDay, /done/) || ''), await cell(pastDay))

console.log(failures === 0 ? '\nThe five verbs work on the screen, and can be unsaid.\n' : `\n${failures} check(s) FAILED.\n`)
ws.close(); chrome.kill(); server.close()
process.exit(failures === 0 ? 0 : 1)
